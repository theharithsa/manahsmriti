import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCatalog, normalize, csvCell } from '../books/src/catalog.js';
test('the 223-entry audited catalog is valid and preserves the original inventory', () => {
  const catalog = JSON.parse(readFileSync('books/data/catalog.json'));
  assert.equal(parseCatalog(catalog).length, 223);
  assert.equal(catalog.some(b => ['book-206', 'book-207'].includes(b.id)), false);
  for (let i = 1; i <= 203; i++) assert.ok(catalog.some(b => b.id === 'book-' + i));
  const audit = JSON.parse(readFileSync('books/data/photo-audits/2026-10-20-three-left-cells.json'));
  assert.equal(audit.changes.filter(c => c.action === 'create').length, 18);
  assert.equal(audit.changes.filter(c => c.action === 'delete').length, 2);
  for (const id of ['book-98', 'book-99', 'book-155']) assert.equal(catalog.find(b => b.id === id).shelf, '5L');
  assert.equal(catalog.filter(b => b.shelf === '5L' && b.a === 'Author/editor not visible' && b.status === 'review').length, 8);
});
test('search preserves non-Latin letters and folds accents', () => {
  assert.equal(normalize('Tschäppeler'), 'tschappeler');
  assert.equal(normalize('भगवद गीता'), 'भगवद गीता');
  assert.notEqual(normalize('中文'), '');
});
test('imports reject invalid or duplicate IDs and invalid data without accepting extra fields', () => {
  const book = { id: 'book-1', t: 'Book', a: 'Author', d: '', note: '', shelf: 'unsorted', status: 'review', added: true };
  assert.throws(() => parseCatalog([book, book]));
  assert.throws(() => parseCatalog([{ ...book, id: '../wrong' }]));
  assert.throws(() => parseCatalog([{ ...book, t: ' ' }]));
  assert.throws(() => parseCatalog([{ ...book, shelf: '6R' }]));
  assert.equal(parseCatalog([{ ...book, isAdmin: true }])[0].isAdmin, undefined);
});
test('spreadsheet export escapes quotes and neutralizes formula injection', () => {
  assert.equal(csvCell('A "quote"'), '"A ""quote"""');
  assert.equal(csvCell(' =1+1'), '"\' =1+1"');
});
