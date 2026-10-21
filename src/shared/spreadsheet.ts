/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Leitura/escrita de .xlsx com exceljs (substitui o xlsx, que tem vulnerabilidades sem correção).
// exceljs só lê .xlsx (não lê .xls antigo). O módulo é carregado sob demanda para não pesar no
// carregamento inicial do site.

const loadExcelJs = async () => (await import('exceljs')).default;

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // 1970-01-01 em número serial do Excel

/** Normaliza o valor de uma célula para o que o xlsx antigo entregava às telas. */
function cellToValue(v: any): any {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.getTime() / 86400000 + EXCEL_EPOCH_OFFSET_DAYS; // serial, como antes
  if (typeof v === 'object') {
    if ('result' in v) return cellToValue(v.result);                       // fórmula: valor calculado
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
    if ('text' in v) return v.text;                                        // link
    return undefined;                                                      // erro etc.
  }
  return v;
}

async function firstSheet(buffer: ArrayBuffer) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets[0];
}

/** Todas as linhas da primeira aba como matrizes (equivale ao sheet_to_json com header: 1). */
export async function readSheetAsArrays(buffer: ArrayBuffer): Promise<any[][]> {
  const ws = await firstSheet(buffer);
  if (!ws) return [];
  const rows: any[][] = [];
  for (let r = 1; r <= ws.actualRowCount || r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = (row.values as any[]).slice(1).map(cellToValue);
    while (values.length > 0 && values[values.length - 1] === undefined) values.pop();
    rows.push(values);
  }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  // Ancora no canto superior esquerdo da área usada (como o xlsx fazia com a dimensão da aba):
  // descarta linhas vazias do início e colunas vazias do início.
  while (rows.length > 0 && rows[0].length === 0) rows.shift();
  let firstCol = Infinity;
  for (const r of rows) {
    const idx = r.findIndex(v => v !== undefined);
    if (idx !== -1 && idx < firstCol) firstCol = idx;
  }
  if (firstCol !== Infinity && firstCol > 0) return rows.map(r => r.slice(firstCol));
  return rows;
}

/** Linhas como objetos usando a 1ª linha como cabeçalho; linhas vazias são ignoradas (equivale ao sheet_to_json padrão). */
export async function readSheetAsObjects(buffer: ArrayBuffer): Promise<Record<string, any>[]> {
  const rows = await readSheetAsArrays(buffer);
  if (rows.length === 0) return [];
  // Largura = a maior linha (o xlsx usava o intervalo usado da aba). Cabeçalho em branco vira __EMPTY, __EMPTY_1...
  const width = Math.max(...rows.map(r => r.length));
  const seen = new Map<string, number>();
  const keys: string[] = [];
  for (let i = 0; i < width; i++) {
    const raw = rows[0][i];
    const h = raw === undefined || raw === null || raw === '' ? '__EMPTY' : String(raw);
    const n = seen.get(h) ?? 0; seen.set(h, n + 1);
    keys.push(n === 0 ? h : `${h}_${n}`); // repetidos ganham sufixo, como no xlsx
  }
  const out: Record<string, any>[] = [];
  for (const row of rows.slice(1)) {
    const obj: Record<string, any> = {};
    let any = false;
    keys.forEach((k, i) => {
      if (row[i] === undefined) return;
      obj[k] = row[i]; any = true;
    });
    if (any) out.push(obj);
  }
  return out;
}

/** Cabeçalho (chaves do 1º objeto) + linhas. */
export function objectsToRows(objs: Record<string, any>[]): any[][] {
  if (objs.length === 0) return [];
  const keys = Object.keys(objs[0]);
  return [keys, ...objs.map(o => keys.map(k => o[k]))];
}

/** Gera o arquivo .xlsx de uma aba. `colWidths` em caracteres. */
export async function buildXlsx(sheetName: string, rows: any[][], colWidths?: number[]): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach(r => ws.addRow(r));
  if (colWidths) colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const out = await wb.xlsx.writeBuffer();
  const u8 = new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
