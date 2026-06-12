"use client";

/** Печатные формы из HTML (паттерн gormost generateSheetHTML):
 *  автономный документ Times New Roman + @page, открывается на печать. */

export interface PrintData {
  objectName: string;
  district: string;
  cameraNumber: number;
  controllerIp: string | null;
  port: number | null;
  model: string | null;
  dispatcherReason: string | null;
  specialistReason: string | null;
  repairNeeded: string | null;
  contractor: string | null;
  detectedAt: string;
  specialistVisit: string | null;
  reportedBy: string;
}

const d = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : "«___» __________ 20__ г.";

function baseDoc(title: string, body: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  body { font: 12pt/1.5 "Times New Roman", serif; color: #000; }
  h1 { font-size: 14pt; text-align: center; margin: 16pt 0 4pt; text-transform: uppercase; }
  .sub { text-align: center; margin: 0 0 14pt; }
  .org { text-align: center; font-size: 10pt; line-height: 1.3; border-bottom: 1px solid #000; padding-bottom: 6pt; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
  td, th { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; font-size: 11pt; }
  th { text-align: left; width: 38%; font-weight: normal; background: #f0f0f0; }
  .blank { height: 18pt; }
  .sig { margin-top: 28pt; display: flex; justify-content: space-between; gap: 20pt; }
  .sig div { width: 45%; font-size: 11pt; }
  .line { border-bottom: 1px solid #000; height: 16pt; margin-top: 14pt; }
  .cap { font-size: 9pt; color: #333; text-align: center; }
  tr, .sig { break-inside: avoid; }
</style></head><body>
<div class="org">ГБУ города Москвы «ГОРМОСТ»<br/>Система мониторинга видеонаблюдения</div>
${body}
<script>window.print()</script></body></html>`;
}

function actHTML(p: PrintData) {
  return baseDoc(
    "Акт о неисправности",
    `<h1>Акт о неисправности видеокамеры</h1>
<p class="sub">от ${d(p.detectedAt)}</p>
<table>
<tr><th>Объект</th><td>${p.objectName}</td></tr>
<tr><th>Участок</th><td>${p.district}</td></tr>
<tr><th>Номер камеры</th><td>№ ${p.cameraNumber}${p.model ? ` (${p.model})` : ""}</td></tr>
<tr><th>Контроллер / канал</th><td>${p.controllerIp ?? "—"}${p.port != null ? ` : ${p.port}` : ""}</td></tr>
<tr><th>Неисправность (диспетчер)</th><td>${p.dispatcherReason ?? ""}</td></tr>
<tr><th>Дата выявления</th><td>${d(p.detectedAt)}</td></tr>
<tr><th>Зарегистрировал</th><td>${p.reportedBy}</td></tr>
<tr><th>Примечание</th><td class="blank"></td></tr>
</table>
<div class="sig">
  <div>Диспетчер<div class="line"></div><p class="cap">подпись / расшифровка</p></div>
  <div>Начальник участка<div class="line"></div><p class="cap">подпись / расшифровка</p></div>
</div>`
  );
}

function orderHTML(p: PrintData) {
  return baseDoc(
    "Наряд на ремонт",
    `<h1>Наряд на ремонт видеокамеры</h1>
<p class="sub">от ${d(p.specialistVisit ?? p.detectedAt)}</p>
<table>
<tr><th>Объект</th><td>${p.objectName}</td></tr>
<tr><th>Участок</th><td>${p.district}</td></tr>
<tr><th>Номер камеры</th><td>№ ${p.cameraNumber}${p.model ? ` (${p.model})` : ""}</td></tr>
<tr><th>Контроллер / канал</th><td>${p.controllerIp ?? "—"}${p.port != null ? ` : ${p.port}` : ""}</td></tr>
<tr><th>Диагноз специалиста</th><td>${p.specialistReason ?? ""}</td></tr>
<tr><th>Требуемый ремонт</th><td>${p.repairNeeded ?? ""}</td></tr>
<tr><th>Подрядчик</th><td>${p.contractor ?? ""}</td></tr>
<tr><th>Выполненные работы</th><td class="blank"></td></tr>
<tr><th>Использованные материалы</th><td class="blank"></td></tr>
<tr><th>Дата выполнения</th><td>«___» __________ 20__ г.</td></tr>
</table>
<div class="sig">
  <div>Инженер<div class="line"></div><p class="cap">подпись / расшифровка</p></div>
  <div>Принял (диспетчер)<div class="line"></div><p class="cap">подпись / расшифровка</p></div>
</div>`
  );
}

function openPrint(html: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export default function IncidentPrint({ data }: { data: PrintData }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => openPrint(actHTML(data))}
        className="px-3 py-1.5 text-sm border border-line bg-surface rounded hover:border-accent transition-colors"
      >
        🖶 Акт о неисправности
      </button>
      <button
        onClick={() => openPrint(orderHTML(data))}
        className="px-3 py-1.5 text-sm border border-line bg-surface rounded hover:border-accent transition-colors"
      >
        🖶 Наряд на ремонт
      </button>
    </div>
  );
}
