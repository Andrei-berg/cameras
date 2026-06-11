/**
 * Импорт камер из Excel-файлов в БД.
 *
 * Источники:
 *   1. REGISTRY_FILE  — операционный реестр (Реестр.xlsm), главный источник истины
 *   2. KSVD_FILE      — технический реестр KSVD (IP, координаты, RTSP, модели)
 *
 * Порядок:
 *   Districts → Objects → Cameras → Enrich (KSVD техданные)
 *
 * Запуск:
 *   npx tsx scripts/import-cameras.ts
 *   npx tsx scripts/import-cameras.ts --dry-run   (без записи в БД)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import ExcelJS from "exceljs";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import path from "path";

// ─── Пути к файлам ────────────────────────────────────────────────────────────
const REGISTRY_FILE = path.resolve(
  process.env.REGISTRY_FILE ||
    "/home/user/Загрузки/видео/Видеокамеры 01.06.2026 Общий.xlsm"
);
const KSVD_FILE = path.resolve(
  process.env.KSVD_FILE ||
    "/home/user/Загрузки/видео/250312_1314_Реестр камер_.xlsx"
);
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Prisma setup ─────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

// ─── Типы ─────────────────────────────────────────────────────────────────────
interface RegistryRow {
  district: string;
  structureType: string;
  controllerConnection: string | null;
  program: "KSVD" | "Интеллект" | string;
  ddpGroup: string | null;
  objectName: string;
  cameraNumber: number;
  isWorking: boolean;
  dispatcherReason: string | null;
  detectedAt: Date | null;
  specialistVisit: Date | null;
  specialistReason: string | null;
  resolvedAt: Date | null;
  repairNeeded: string | null;
  notes: string | null;
  contractor: string | null;
}

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
  status: string;
  description: string | null; // Описание сцены видеонаблюдения
  location: string | null;    // Описание месторасположения
  address: string | null;
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────
function toStr(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v).trim() || null;
}

function toNum(v: ExcelJS.CellValue): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toDate(v: ExcelJS.CellValue): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Нормализует название объекта для fuzzy-matching */
function normalizeObjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»""]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Парсит имя KSVD камеры: GRMST_SVAO_60_198_4 → { ip, port } */
function parseKsvdName(name: string): { ip: string; port: number } | null {
  const m = name.match(/^GRMST_[A-Z]+_(\d+)_(\d+)_(\d+)$/);
  if (!m) return null;
  return { ip: `10.232.${m[1]}.${m[2]}`, port: parseInt(m[3]) };
}

/** Группирует KSVD камеры по (normalizedAddr, port) для быстрого поиска */
function buildKsvdLookup(rows: KsvdRow[]): Map<string, KsvdRow> {
  const map = new Map<string, KsvdRow>();
  for (const row of rows) {
    // Ключ 1: ip:port
    map.set(`${row.controllerIp}:${row.port}`, row);
    // Ключ 2: ksvdName
    map.set(row.ksvdName, row);
  }
  return map;
}

// ─── Чтение операционного реестра ─────────────────────────────────────────────
async function readRegistry(): Promise<RegistryRow[]> {
  console.log(`\n📂 Читаю реестр: ${path.basename(REGISTRY_FILE)}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(REGISTRY_FILE);
  const ws = wb.getWorksheet("Реестр");
  if (!ws) throw new Error('Лист "Реестр" не найден');

  const rows: RegistryRow[] = [];
  let lastDistrict = "";
  let lastStructureType = "";
  let lastProgram = "";
  let lastDdpGroup = "";
  let lastObjectName = "";
  let lastControllerConn = "";

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // заголовок

    const vals = row.values as ExcelJS.CellValue[];
    // Колонки (1-based из Excel):
    // 1=№, 2=Техн.помещение, 3=Тип сооружения, 4=Связь с контроллером,
    // 5=Участки, 6=Программа, 7=ДДП/Интеллект, 8=Объекты(номер),
    // 9=Название объекта, 10=Номер камеры, 11=Рабочее состояние,
    // 12=Причина(диспетчер), 13=Дата выявления, 14=Дата выезда,
    // 15=Причина(специалист), 16=Дата устранения, 17=Требует ремонта,
    // 18=Примечание, 19=Подрядчик

    const district = toStr(vals[5]);
    const structureType = toStr(vals[3]);
    const program = toStr(vals[6]);
    const ddpGroup = toStr(vals[7]);
    const objectName = toStr(vals[9]);
    const controllerConn = toStr(vals[4]);
    const cameraNumberRaw = toNum(vals[10]);
    const isWorkingRaw = toNum(vals[11]);

    // Колонки с district/object/program заполнены только на первой камере объекта —
    // остальные наследуют значение сверху (merged cells pattern)
    if (district) lastDistrict = district;
    if (structureType) lastStructureType = structureType;
    if (program) lastProgram = program;
    if (ddpGroup) lastDdpGroup = ddpGroup;
    if (objectName) lastObjectName = objectName;
    if (controllerConn) lastControllerConn = controllerConn;

    if (!lastObjectName || cameraNumberRaw == null || isWorkingRaw == null) return;
    if (!lastDistrict) return;

    rows.push({
      district: lastDistrict,
      structureType: lastStructureType || "Неизвестно",
      controllerConnection: lastControllerConn || null,
      program: lastProgram || "KSVD",
      ddpGroup: lastDdpGroup || null,
      objectName: lastObjectName,
      cameraNumber: cameraNumberRaw,
      isWorking: isWorkingRaw === 1,
      dispatcherReason: toStr(vals[12]),
      detectedAt: toDate(vals[13]),
      specialistVisit: toDate(vals[14]),
      specialistReason: toStr(vals[15]),
      resolvedAt: toDate(vals[16]),
      repairNeeded: toStr(vals[17]),
      notes: toStr(vals[18]),
      contractor: toStr(vals[19]),
    });
  });

  console.log(`   → ${rows.length} строк прочитано`);
  return rows;
}

// ─── Чтение KSVD технического реестра ─────────────────────────────────────────
async function readKsvd(): Promise<KsvdRow[]> {
  console.log(`\n📂 Читаю KSVD реестр: ${path.basename(KSVD_FILE)}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(KSVD_FILE);
  const ws = wb.getWorksheet("Данные");
  if (!ws) throw new Error('Лист "Данные" не найден');

  const rows: KsvdRow[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const vals = row.values as ExcelJS.CellValue[];
    // Колонки (1-based):
    // 1=Идентификатор(UUID), 2=Имя камеры, 9=Модель, 10=IP, 11=Порт,
    // 16=Долгота, 17=Широта, 24=Дата изменения, 27=Статус,
    // 6=Ключ камеры, 7=Описание сцены, 8=Описание месторасположения,
    // 19=Адрес, 53=URL архивного потока

    const ksvdId = toStr(vals[1]);
    const ksvdName = toStr(vals[2]);
    const model = toStr(vals[9]);
    const ipRaw = toStr(vals[10]);
    const portRaw = toNum(vals[11]);
    const lngRaw = toStr(vals[16]);
    const latRaw = toStr(vals[17]);
    const status = toStr(vals[27]);
    const ksvdKey = toStr(vals[6]);
    const description = toStr(vals[7]);
    const location = toStr(vals[8]);
    const address = toStr(vals[19]);
    const rtspUrl = toStr(vals[53]);

    if (!ksvdId || !ksvdName || !ipRaw) return;

    // Координаты хранятся с запятой как десятичным разделителем
    const lat = lngRaw ? parseFloat(lngRaw.replace(",", ".")) : NaN; // в файле столбцы перепутаны: 16=Долгота, 17=Широта
    const lng = latRaw ? parseFloat(latRaw.replace(",", ".")) : NaN;

    if (isNaN(lat) || isNaN(lng)) return;

    // Парсим IP и порт из имени
    const parsed = parseKsvdName(ksvdName);
    const controllerIp = parsed?.ip ?? ipRaw;
    const port = parsed?.port ?? portRaw ?? 0;

    rows.push({
      ksvdId,
      ksvdName,
      ksvdKey: ksvdKey ?? "",
      controllerIp,
      port,
      model: model ?? "KSVD",
      lat,
      lng,
      rtspUrl,
      status: status ?? "",
      description,
      location,
      address,
    });
  });

  console.log(`   → ${rows.length} строк прочитано`);
  return rows;
}

// ─── ГЛАВНАЯ ФУНКЦИЯ ИМПОРТА ──────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ИМПОРТ КАМЕР ГОРМОСТ${DRY_RUN ? "  [DRY RUN]" : ""}`);
  console.log(`${"═".repeat(60)}`);

  const registryRows = await readRegistry();
  const ksvdRows = await readKsvd();
  const ksvdLookup = buildKsvdLookup(ksvdRows);

  // ── 1. Уникальные Districts ──────────────────────────────────────────────
  const districtNames = [...new Set(registryRows.map((r) => r.district))].filter(Boolean);
  console.log(`\n[1/4] Districts: ${districtNames.length} уникальных`);

  if (!DRY_RUN) {
    for (const name of districtNames) {
      const code = name
        .toUpperCase()
        .replace(/[^A-ZА-ЯЁ0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 32);
      await prisma.district.upsert({
        where: { code },
        create: { name, code },
        update: { name },
      });
    }
    console.log(`   ✓ Districts сохранены`);
  }

  // ── 2. Уникальные Objects ───────────────────────────────────────────────
  type ObjectKey = string;
  const objectMap = new Map<ObjectKey, { name: string; structureType: string; program: string; district: string }>();

  for (const r of registryRows) {
    const key: ObjectKey = `${r.district}::${r.objectName}`;
    if (!objectMap.has(key)) {
      objectMap.set(key, {
        name: r.objectName,
        structureType: r.structureType,
        program: r.program,
        district: r.district,
      });
    }
  }
  console.log(`\n[2/4] Objects: ${objectMap.size} уникальных`);

  const objectIdMap = new Map<ObjectKey, string>(); // key → DB id

  if (!DRY_RUN) {
    // Загружаем Districts из БД для получения id
    const districts = await prisma.district.findMany();
    const districtIdByCode = new Map(districts.map((d) => [d.code, d.id]));
    const districtIdByName = new Map(districts.map((d) => [d.name, d.id]));

    let created = 0;
    for (const [key, obj] of objectMap) {
      const districtCode = obj.district
        .toUpperCase()
        .replace(/[^A-ZА-ЯЁ0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 32);
      const districtId =
        districtIdByCode.get(districtCode) ?? districtIdByName.get(obj.district);

      if (!districtId) {
        console.warn(`   ⚠ Не найден district для "${obj.district}"`);
        continue;
      }

      const existing = await prisma.object.findFirst({
        where: { name: obj.name, districtId },
        select: { id: true },
      });

      if (existing) {
        objectIdMap.set(key, existing.id);
      } else {
        const created_obj = await prisma.object.create({
          data: {
            name: obj.name,
            structureType: obj.structureType,
            program: obj.program,
            districtId,
            isCommissioned: !obj.district.includes("принят"),
          },
        });
        objectIdMap.set(key, created_obj.id);
        created++;
      }
    }
    console.log(`   ✓ Objects: ${created} создано, ${objectMap.size - created} уже существовало`);
  }

  // ── 3. Cameras из операционного реестра ─────────────────────────────────
  console.log(`\n[3/4] Cameras: ${registryRows.length} записей`);

  // Строим lookup: (objectName_district, cameraNumber) → RegistryRow
  // для последующего enrichment
  const cameraLookupByObjNum = new Map<string, RegistryRow>();
  for (const r of registryRows) {
    const ck = `${r.district}::${r.objectName}::${r.cameraNumber}`;
    cameraLookupByObjNum.set(ck, r);
  }

  // Статистика обогащения
  let enriched = 0;
  let notEnriched = 0;

  // Для каждой KSVD камеры пытаемся найти соответствие в основном реестре
  // Стратегия: ищем по (controllerIp, port) через ksvdLookup уже построен
  // При вставке Camera: ищем ksvd данные по (controllerIp:port)

  let camCreated = 0;
  let camSkipped = 0;
  const incidentsToCreate: {
    cameraId: string;
    reportedById: string;
    dispatcherReason: string | null;
    detectedAt: Date;
    specialistVisit: Date | null;
    specialistReason: string | null;
    resolvedAt: Date | null;
    repairNeeded: string | null;
    notes: string | null;
    contractor: string | null;
  }[] = [];

  // Нужен системный пользователь для инцидентов (создаём если нет)
  let systemUserId = "";
  if (!DRY_RUN) {
    const sysUser = await prisma.user.upsert({
      where: { email: "system@gormost.local" },
      create: {
        email: "system@gormost.local",
        name: "Импорт системы",
        emailVerified: true,
        role: "admin",
        updatedAt: new Date(),
      },
      update: {},
    });
    systemUserId = sysUser.id;
  }

  if (!DRY_RUN) {
    for (const r of registryRows) {
      const objKey: ObjectKey = `${r.district}::${r.objectName}`;
      const objectId = objectIdMap.get(objKey);
      if (!objectId) {
        camSkipped++;
        continue;
      }

      // Ищем KSVD обогащение — пока нет прямого IP в реестре,
      // поэтому enrichment пропускаем на этом шаге (делается в шаге 4)
      const camData = {
        objectId,
        cameraNumber: r.cameraNumber,
        ddpGroup: r.ddpGroup,
        isWorking: r.isWorking,
        lastStatusChange: r.isWorking ? null : (r.detectedAt ?? new Date()),
      };

      // upsert по (objectId, cameraNumber)
      const existing = await prisma.camera.findFirst({
        where: { objectId, cameraNumber: r.cameraNumber },
        select: { id: true },
      });

      let cameraId: string;
      if (existing) {
        await prisma.camera.update({ where: { id: existing.id }, data: camData });
        cameraId = existing.id;
      } else {
        const cam = await prisma.camera.create({ data: camData });
        cameraId = cam.id;
        camCreated++;
      }

      // Если камера не работает — создаём инцидент
      if (!r.isWorking && r.dispatcherReason) {
        incidentsToCreate.push({
          cameraId,
          reportedById: systemUserId,
          dispatcherReason: r.dispatcherReason,
          detectedAt: r.detectedAt ?? new Date(),
          specialistVisit: r.specialistVisit,
          specialistReason: r.specialistReason,
          resolvedAt: r.resolvedAt,
          repairNeeded: r.repairNeeded,
          notes: r.notes,
          contractor: r.contractor,
        });
      }
    }
    console.log(`   ✓ Cameras: ${camCreated} создано, ${camSkipped} пропущено`);
  }

  // ── 4. Инциденты ────────────────────────────────────────────────────────
  if (!DRY_RUN && incidentsToCreate.length > 0) {
    console.log(`\n   Инциденты: создаю ${incidentsToCreate.length}...`);
    // Создаём инциденты батчами по 500
    const BATCH = 500;
    let incCreated = 0;
    for (let i = 0; i < incidentsToCreate.length; i += BATCH) {
      const batch = incidentsToCreate.slice(i, i + BATCH);
      await prisma.incident.createMany({ data: batch, skipDuplicates: true });
      incCreated += batch.length;
    }
    console.log(`   ✓ Инциденты: ${incCreated} создано`);
  }

  // ── 5. Enrichment: KSVD технические данные ──────────────────────────────
  console.log(`\n[4/4] Enrichment KSVD: обогащаю ${ksvdRows.length} записей`);

  if (!DRY_RUN) {
    for (const ksvd of ksvdRows) {
      // Ищем камеру по ksvdName (если уже есть) или пробуем найти по controllerIp+port
      // Поскольку у нас нет прямого ключа связи между реестром и KSVD,
      // enrichment делается через ksvdId (upsert если камера уже была добавлена по реестру)
      //
      // Стратегия: ищем Camera где ksvdName совпадает ИЛИ (controllerIp = ksvd.controllerIp AND port = ksvd.port)
      const existing = await prisma.camera.findFirst({
        where: {
          OR: [
            { ksvdId: ksvd.ksvdId },
            { ksvdName: ksvd.ksvdName },
            { controllerIp: ksvd.controllerIp, port: ksvd.port },
          ],
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.camera.update({
          where: { id: existing.id },
          data: {
            ksvdId: ksvd.ksvdId,
            ksvdKey: ksvd.ksvdKey,
            ksvdName: ksvd.ksvdName,
            controllerIp: ksvd.controllerIp,
            port: ksvd.port,
            model: ksvd.model,
            lat: ksvd.lat,
            lng: ksvd.lng,
            rtspUrl: ksvd.rtspUrl,
          },
        });
        enriched++;
      } else {
        // KSVD камера без соответствия в операционном реестре — пропускаем
        notEnriched++;
      }
    }
    console.log(`   ✓ Обогащено: ${enriched}, без соответствия: ${notEnriched}`);
  }

  // ── Финальная статистика ─────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  if (DRY_RUN) {
    console.log("  [DRY RUN] — в БД ничего не записано");
    console.log(`  Будет создано:`);
    console.log(`    Districts: ${districtNames.length}`);
    console.log(`    Objects:   ${objectMap.size}`);
    console.log(`    Cameras:   ${registryRows.length}`);
    console.log(`    KSVD tech: ${ksvdRows.length} записей для enrichment`);
  } else {
    const [dc, oc, cc, ic] = await Promise.all([
      prisma.district.count(),
      prisma.object.count(),
      prisma.camera.count(),
      prisma.incident.count(),
    ]);
    console.log(`  Итог в БД:`);
    console.log(`    Districts: ${dc}`);
    console.log(`    Objects:   ${oc}`);
    console.log(`    Cameras:   ${cc}`);
    console.log(`    Incidents: ${ic}`);
    console.log(`    Координаты получены: ${enriched} камер`);
  }
  console.log(`${"═".repeat(60)}\n`);
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
