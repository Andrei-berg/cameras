/**
 * Обогащение камер координатами и техданными из KSVD-реестра.
 *
 * Проблема: операционный реестр и KSVD не связаны общим ключом.
 * Стратегия: фаззи-матчинг по адресу.
 *   - KSVD-камеры группируются по нормализованному адресу (один адрес = одно сооружение);
 *   - имя объекта (содержит адрес в скобках) сравнивается с адресом+сценой группы:
 *     совпадение стемов названий улиц + совпадение номеров (дом / км);
 *   - победитель должен строго обойти второго кандидата (иначе — ambiguous, пропуск).
 *
 * Применение для сматченного объекта:
 *   - камера с номером == порту ровно одной KSVD-строки группы → полное обогащение
 *     (ksvdId, ksvdKey, ksvdName, controllerIp, port, model, lat/lng, rtspUrl);
 *   - остальные камеры объекта → только lat/lng (центроид группы) — достаточно для карты.
 *
 * Запуск:
 *   npx tsx scripts/enrich-coordinates.ts --dry-run   (отчёт без записи)
 *   npx tsx scripts/enrich-coordinates.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import ExcelJS from "exceljs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import path from "path";

const KSVD_FILE = path.resolve(
  process.env.KSVD_FILE ||
    "/home/user/Загрузки/видео/250312_1314_Реестр камер_.xlsx"
);
const DRY_RUN = process.argv.includes("--dry-run");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

// ─── Текстовые помощники ──────────────────────────────────────────────────────

/** Ячейка ExcelJS → строка (включая richText и формулы) */
function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    }
    if (typeof o.text === "string") return o.text.trim();
    if ("result" in o) return String(o.result ?? "").trim();
  }
  if (v instanceof Date) return "";
  return String(v).trim();
}

/** Слова, не несущие различительной информации об адресе */
const STOP = new Set([
  "шоссе", "ш", "улица", "ул", "проспект", "просп", "пр", "пркт", "проезд",
  "пер", "переулок", "набережная", "наб", "бульвар", "бул", "б-р", "площадь",
  "пл", "дом", "д", "корпус", "корп", "к", "строение", "стр", "с",
  "сооружение", "соор", "владение", "вл", "километр", "км", "подземный",
  "надземный", "пешеходный", "переход", "тоннель", "мост", "путепровод",
  "эстакада", "автобусная", "остановка", "сторона", "внешняя", "внутренняя",
  "город", "гормост", "дублер", "метро", "станция", "район", "округ",
  "пп", "нпп", "тп", "тт", "ппп", "через", "возле", "около", "рядом",
  "свао", "сао", "сзао", "зао", "юзао", "юао", "ювао", "вао", "цао",
  "тинао", "зелао",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»""'']/g, " ")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Стемы значимых слов: первые 6 символов слов длиной ≥4, не из стоп-листа
 *  (6 символов различают «ленинс[кий]» и «ленинг[радское]») */
function stems(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalize(s).split(" ")) {
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.slice(0, 6));
  }
  return out;
}

/** Все целые числа в строке (номера домов, километры) */
function nums(s: string): Set<number> {
  const out = new Set<number>();
  for (const m of normalize(s).matchAll(/\d+/g)) {
    const n = parseInt(m[0]);
    if (n > 0 && n < 10000) out.add(n);
  }
  return out;
}

/** Типы улиц (канонизированные) — тай-брейкер: «Ленинградское ш» ≠ «Ленинградский пр-т» */
const STREET_TYPES: Record<string, string> = {
  ш: "шоссе", шоссе: "шоссе",
  проспект: "проспект", просп: "проспект", прт: "проспект", прс: "проспект",
  ул: "улица", улица: "улица",
  наб: "набережная", набережная: "набережная",
  бул: "бульвар", бр: "бульвар", бульвар: "бульвар",
  пер: "переулок", переулок: "переулок",
  проезд: "проезд",
};

function streetTypes(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalize(s).split(" ")) {
    const t = STREET_TYPES[w];
    if (t) out.add(t);
  }
  return out;
}

/** Километровые отметки: «23 км», «22км+800», «километр 23-й», «44-й км» */
function kmNums(s: string): Set<number> {
  const out = new Set<number>();
  const t = normalize(s);
  for (const m of t.matchAll(/(\d+)(?:\s*й)?\s*км(?![а-я])/g)) out.add(parseInt(m[1]));
  for (const m of t.matchAll(/километр[ае]?\s*(\d+)/g)) out.add(parseInt(m[1]));
  return out;
}

function intersect<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

// ─── Чтение KSVD и группировка по адресу ─────────────────────────────────────

interface KsvdRow {
  ksvdId: string;
  ksvdName: string;
  ksvdKey: string;
  controllerIp: string;
  port: number;
  model: string;
  lat: number;
  lng: number;
  rtspUrl: string | null;
  scene: string;
  address: string;
}

interface AddrGroup {
  key: string;
  rows: KsvdRow[];
  /* адрес — первичный сигнал */
  addrStems: Set<string>;
  addrNums: Set<number>;
  types: Set<string>;
  /* адрес + сцены — вторичный */
  stems: Set<string>;
  nums: Set<number>;
  kms: Set<number>;
  centroid: { lat: number; lng: number };
}

function parseKsvdName(name: string): { ip: string; port: number } | null {
  const m = name.match(/^GRMST_[A-Z]+_(\d+)_(\d+)_(\d+)$/);
  if (!m) return null;
  return { ip: `10.232.${m[1]}.${m[2]}`, port: parseInt(m[3]) };
}

async function readKsvd(): Promise<KsvdRow[]> {
  console.log(`📂 Читаю KSVD: ${path.basename(KSVD_FILE)}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(KSVD_FILE);
  const ws = wb.getWorksheet("Данные");
  if (!ws) throw new Error('Лист "Данные" не найден');

  const rows: KsvdRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const v = row.values as ExcelJS.CellValue[];
    const ksvdId = cellStr(v[1]);
    const ksvdName = cellStr(v[2]);
    if (!ksvdId || !ksvdName) return;

    // координаты: десятичный разделитель — запятая; 16=Долгота(lng), 17=Широта(lat)
    const lat = parseFloat(cellStr(v[17]).replace(",", "."));
    const lng = parseFloat(cellStr(v[16]).replace(",", "."));
    if (isNaN(lat) || isNaN(lng) || lat < 50 || lat > 60) return;

    const parsed = parseKsvdName(ksvdName);
    rows.push({
      ksvdId,
      ksvdName,
      ksvdKey: cellStr(v[6]),
      controllerIp: parsed?.ip ?? cellStr(v[10]),
      port: parsed?.port ?? Number(cellStr(v[11])) ?? 0,
      model: cellStr(v[9]) || "KSVD",
      lat,
      lng,
      rtspUrl: cellStr(v[53]) || null,
      scene: cellStr(v[7]),
      address: cellStr(v[19]),
    });
  });
  console.log(`   → ${rows.length} камер с координатами`);
  return rows;
}

function buildGroups(rows: KsvdRow[]): AddrGroup[] {
  const byAddr = new Map<string, KsvdRow[]>();
  for (const r of rows) {
    const key = normalize(r.address) || `ip:${r.controllerIp}`;
    (byAddr.get(key) ?? byAddr.set(key, []).get(key)!).push(r);
  }
  const groups: AddrGroup[] = [];
  for (const [key, rs] of byAddr) {
    const text = [key, ...new Set(rs.map((r) => r.scene))].join(" ");
    groups.push({
      key,
      rows: rs,
      addrStems: stems(key),
      addrNums: nums(key),
      types: streetTypes(key),
      stems: stems(text),
      nums: nums(text),
      kms: kmNums(text),
      centroid: {
        lat: rs.reduce((s, r) => s + r.lat, 0) / rs.length,
        lng: rs.reduce((s, r) => s + r.lng, 0) / rs.length,
      },
    });
  }
  console.log(`   → ${groups.length} адресных групп`);
  return groups;
}

// ─── Матчинг ──────────────────────────────────────────────────────────────────

/** Метры между точками (равнопромежуточная проекция, для Москвы достаточно) */
function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dy = (a.lat - b.lat) * 111320;
  const dx = (a.lng - b.lng) * 111320 * Math.cos((55.75 * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Сливает группы одного сооружения (адрес написан по-разному, но точки рядом) */
function mergeGroups(gs: AddrGroup[]): AddrGroup {
  const rows = gs.flatMap((g) => g.rows);
  return {
    key: gs.map((g) => g.key).join(" | "),
    rows,
    addrStems: new Set(gs.flatMap((g) => [...g.addrStems])),
    addrNums: new Set(gs.flatMap((g) => [...g.addrNums])),
    types: new Set(gs.flatMap((g) => [...g.types])),
    stems: new Set(gs.flatMap((g) => [...g.stems])),
    nums: new Set(gs.flatMap((g) => [...g.nums])),
    kms: new Set(gs.flatMap((g) => [...g.kms])),
    centroid: {
      lat: rows.reduce((s, r) => s + r.lat, 0) / rows.length,
      lng: rows.reduce((s, r) => s + r.lng, 0) / rows.length,
    },
  };
}

function scoreMatch(
  objStems: Set<string>,
  objNums: Set<number>,
  objKms: Set<number>,
  objTypes: Set<string>,
  g: AddrGroup
): number {
  const st = intersect(objStems, g.stems);
  if (st === 0) return 0;

  const km = intersect(objKms, g.kms);
  // объект на км-отметке (МКАД и т.п.): километр обязан совпасть
  if (objKms.size > 0 && g.kms.size > 0 && km === 0) return 0;

  // числа 1–3 — структурный шум (соор./стр./корп.), настоящий номер дома весомее
  const numScore = (a: Set<number>, b: Set<number>) => {
    let s = 0;
    for (const n of a) if (b.has(n)) s += n >= 4 ? 5 : 1;
    return s;
  };

  const nm = numScore(objNums, g.nums);
  if (nm === 0 && km === 0) {
    // без числового подтверждения — только если чисел нет вообще,
    // а текстовое совпадение двойное
    if (objNums.size > 0 && g.nums.size > 0) return 0;
    return st >= 2 ? st * 10 : 0;
  }
  // адресные совпадения весят больше, чем совпадения в описаниях сцен
  const addrSt = intersect(objStems, g.addrStems);
  const addrNm = numScore(objNums, g.addrNums);
  const typeBonus = intersect(objTypes, g.types) > 0 ? 4 : 0;
  return addrSt * 20 + (st - addrSt) * 4 + km * 8 + addrNm * 3 + (nm - addrNm) + typeBonus;
}

async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ОБОГАЩЕНИЕ КООРДИНАТ ИЗ KSVD${DRY_RUN ? "  [DRY RUN]" : ""}`);
  console.log(`${"═".repeat(64)}\n`);

  const ksvdRows = await readKsvd();
  const groups = buildGroups(ksvdRows);

  const objects = await prisma.object.findMany({
    include: {
      district: { select: { name: true } },
      cameras: { select: { id: true, cameraNumber: true, lat: true } },
    },
  });
  console.log(`   → ${objects.length} объектов в БД\n`);

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let fullEnriched = 0;
  let coordsOnly = 0;
  const usedKsvdIds = new Set<string>();
  const ambiguousList: string[] = [];
  const unmatchedList: string[] = [];

  for (const obj of objects) {
    const objStems = stems(obj.name);
    const objNums = nums(obj.name);
    const objKms = kmNums(obj.name);
    const objTypes = streetTypes(obj.name);

    let bestScore = 0;
    const scored: { g: AddrGroup; s: number }[] = [];
    for (const g of groups) {
      const s = scoreMatch(objStems, objNums, objKms, objTypes, g);
      if (s > 0) scored.push({ g, s });
      if (s > bestScore) bestScore = s;
    }

    if (bestScore === 0) {
      unmatched++;
      unmatchedList.push(`${obj.name} [${obj.program}, ${obj.district.name}]`);
      continue;
    }

    // Все группы с максимальным счётом: если их точки в пределах 500 м —
    // это одно сооружение с по-разному записанным адресом, сливаем
    const top = scored.filter((x) => x.s === bestScore).map((x) => x.g);
    let best: AddrGroup;
    if (top.length === 1) {
      best = top[0];
    } else {
      const far = top.some((a) =>
        top.some((b) => distMeters(a.centroid, b.centroid) > 500)
      );
      if (far) {
        ambiguous++;
        ambiguousList.push(
          `${obj.name} → score ${bestScore}: ${top.map((g) => g.key).join(" / ").slice(0, 90)}`
        );
        continue;
      }
      best = mergeGroups(top);
    }

    matched++;

    // Порт → строки группы (для точного сопоставления порт == номер камеры)
    const byPort = new Map<number, KsvdRow[]>();
    for (const r of best.rows) {
      (byPort.get(r.port) ?? byPort.set(r.port, []).get(r.port)!).push(r);
    }

    for (const cam of obj.cameras) {
      const exact = byPort.get(cam.cameraNumber);
      const canFull =
        obj.program === "KSVD" &&
        exact?.length === 1 &&
        !usedKsvdIds.has(exact[0].ksvdId);

      if (canFull) {
        const k = exact[0];
        usedKsvdIds.add(k.ksvdId);
        if (!DRY_RUN) {
          try {
            await prisma.camera.update({
              where: { id: cam.id },
              data: {
                ksvdId: k.ksvdId,
                ksvdKey: k.ksvdKey,
                ksvdName: k.ksvdName,
                controllerIp: k.controllerIp,
                port: k.port,
                model: k.model,
                lat: k.lat,
                lng: k.lng,
                rtspUrl: k.rtspUrl,
              },
            });
          } catch {
            // конфликт уникального ksvdId (уже назначен другой камере) — только координаты
            await prisma.camera.update({
              where: { id: cam.id },
              data: { lat: k.lat, lng: k.lng },
            });
          }
        }
        fullEnriched++;
      } else {
        if (!DRY_RUN) {
          await prisma.camera.update({
            where: { id: cam.id },
            data: { lat: best.centroid.lat, lng: best.centroid.lng },
          });
        }
        coordsOnly++;
      }
    }
  }

  console.log(`${"═".repeat(64)}`);
  console.log(`  Объекты:  ${matched} сматчено, ${ambiguous} неоднозначно, ${unmatched} без пары`);
  console.log(`  Камеры:   ${fullEnriched} полное обогащение (ksvd+координаты)`);
  console.log(`            ${coordsOnly} только координаты (центроид адреса)`);
  console.log(`${"═".repeat(64)}\n`);

  if (ambiguousList.length) {
    console.log(`⚠ Неоднозначные (${ambiguousList.length}):`);
    ambiguousList.slice(0, 15).forEach((s) => console.log(`   ${s}`));
    if (ambiguousList.length > 15) console.log(`   … ещё ${ambiguousList.length - 15}`);
  }
  if (unmatchedList.length) {
    console.log(`\n✗ Без пары (${unmatchedList.length}, первые 20):`);
    unmatchedList.slice(0, 20).forEach((s) => console.log(`   ${s}`));
  }

  if (!DRY_RUN) {
    const withCoords = await prisma.camera.count({ where: { lat: { not: null } } });
    const totalCams = await prisma.camera.count();
    console.log(`\n📍 Камер с координатами в БД: ${withCoords} из ${totalCams}`);
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Ошибка:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
