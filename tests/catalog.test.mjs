import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCatalog, normalize, csvCell } from '../books/src/catalog.js';
test('the existing 207 entries remain valid and importable', () => {
  const catalog = JSON.parse(readFileSync('books/data/catalog.json'));
  assert.equal(parseCatalog(catalog).length, 207);
  assert.equal(catalog.filter(b => b.status === 'review' && b.t === 'SuperFreakonomics').length, 1);
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
