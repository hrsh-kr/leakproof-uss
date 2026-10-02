// CSV with protection against spreadsheet formula injection.
export function csvCell(v) {
  if (v === undefined || v === null) return '';
  let s = Array.isArray(v) ? v.join(';') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const csvRow = (cells) => cells.map(csvCell).join(',');
