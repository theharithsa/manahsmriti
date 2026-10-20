export const SHELVES = Array.from({ length: 5 }, (_, i) => ['L', 'R'].map(c => `${i + 1}${c}`)).flat();
export const shelfName = id => id === 'unsorted' ? 'Not shelved yet' : `Row ${id[0]} · ${id[1] === 'L' ? 'Left' : 'Right'}`;
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
export const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
export function cleanBook(value) {
  const text = (key, max) => {
    if (typeof value[key] !== 'string' || value[key].length > max) throw new Error(`Invalid ${key} field.`);
    return value[key].trim();
  };
  const t = text('t', 240), a = text('a', 240), d = text('d', 5000), note = text('note', 1000);
  if (!t || !a) throw new Error('A title and author are required.');
  if (![...SHELVES, 'unsorted'].includes(value.shelf)) throw new Error('Invalid shelf.');
  if (!['confirmed', 'review'].includes(value.status)) throw new Error('Invalid verification status.');
  if (typeof value.added !== 'boolean') throw new Error('Invalid added field.');
  return { t, a, d, note, shelf: value.shelf, status: value.status, added: value.added };
}
export function parseCatalog(value) {
  const rows = Array.isArray(value) ? value : value?.books;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw new Error('Choose a catalog with 1–5,000 books.');
  const ids = new Set();
  return rows.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.id) || ids.has(row.id)) {
      throw new Error('Book IDs must be unique and contain only letters, numbers, hyphens or underscores.');
    }
    ids.add(row.id);
    return { id: row.id, ...cleanBook(row) };
  });
}
export function csvCell(value) {
  let s = String(value);
  if (/^\s*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
