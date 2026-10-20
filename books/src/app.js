import '@fontsource-variable/caveat';
import '@fontsource-variable/ancizar-serif';
import '@fontsource-variable/source-code-pro';
import './styles.css';
import { initializeSelects, syncSelects, closeSelects } from './select-controls.js';
import { watchAuth, login, finishRedirect, logout, isSharedEditor, watchBooks, saveBook, removeBook, importBooks, copyToPrivate, watchReading, saveReading } from './firebase.js';
import { SHELVES, shelfName, escapeHTML as esc, normalize, cleanBook, parseCatalog, csvCell } from './catalog.js';

const $ = id => document.getElementById(id);
let user = null, editor = false, scope = 'shared', books = [], filter = 'all';
let unsubscribe = null, epoch = 0, loaded = false, fromCache = true, editing = null, deleting = null;
let authorFilter = '', reading = {}, unsubscribeReading = null;
const readingLabels = { 'to-read': 'To read', reading: 'Reading', read: 'Read', collection: 'Collection' };
const readingState = b => reading[scope + '-' + b.id] || '';
let toastTimer, importing = false, saving = false;
const canEdit = () => !!user && (scope === 'private' || editor);
function showError(element, message) { element.textContent = message; element.hidden = !message; }
function message(error) {
  const messages = {
    'auth/popup-closed-by-user': 'Sign-in was closed. You can try again whenever you’re ready.',
    'auth/cancelled-popup-request': 'A sign-in window is already open.',
    'auth/unauthorized-domain': 'This site has not been authorized for Google sign-in yet. The project owner needs to add its domain in Firebase Authentication.',
    'auth/operation-not-allowed': 'Google sign-in needs to be enabled in Firebase Authentication.',
    'auth/network-request-failed': 'Could not connect to Google. Check your connection and try again.',
    'permission-denied': 'This account does not have permission for that action. Check the shared editor settings and deployed Firestore rules.',
    'unavailable': 'The library is temporarily unavailable. Check your connection and try again.',
    'unauthenticated': 'Your session has expired. Sign in again to continue.',
  };
  return messages[error?.code] || error?.message || 'Something went wrong. Please try again.';
}
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
function closeDialogs() { closeSelects(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
function openDialog(id) { $(id).showModal(); }
function networkStatus() {
  $('sync-status').textContent = !navigator.onLine ? 'Offline · reconnect to save changes' : fromCache ? 'Connecting to cloud…' : 'Up to date in Firestore';
}
window.addEventListener('online', networkStatus); window.addEventListener('offline', networkStatus);
function render() {
  syncSelects();
  $('clear-search').hidden = !$('search').value;
  const query = normalize($('search').value).split(' ').filter(Boolean);
  const selectedShelf = $('shelf-filter').value;
  const readingFilter = $('reading-filter').value;
  $('author-filter').hidden = !authorFilter;
  $('author-filter').textContent = authorFilter ? `Author: ${authorFilter} ×` : '';
  const list = books.filter(b => (!authorFilter || normalize(b.a) === normalize(authorFilter)) &&
    (!readingFilter || (readingFilter === 'unmarked' ? !readingState(b) : readingState(b) === readingFilter)) && (filter !== 'review' || b.status === 'review') &&
    (!selectedShelf || b.shelf === selectedShelf) && query.every(q => normalize(b.t + ' ' + b.a).includes(q)));
  const sort = $('sort').value;
  list.sort((a, b) => sort === 'author' ? a.a.localeCompare(b.a) || a.t.localeCompare(b.t) :
    sort === 'shelf' ? a.shelf.localeCompare(b.shelf) || a.t.localeCompare(b.t) :
    sort === 'recent' ? (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) || b.id.localeCompare(a.id) : a.t.localeCompare(b.t));
  $('book-grid').innerHTML = list.map(b => `<article class="book-card" data-id="${esc(b.id)}" aria-label="${esc(b.t)}, ${esc(shelfName(b.shelf))}"><h3><button class="book-title-button">${esc(b.t)}</button></h3><button class="book-author author-link" data-author="${esc(b.a)}">${esc(b.a)}</button>${b.d ? `<p class="book-description">${esc(b.d)}</p>` : ''}<span class="card-meta"><span class="shelf-label">${esc(shelfName(b.shelf))}</span>${b.status === 'review' ? '<span class="review-label">Needs review</span>' : ''}${readingState(b) ? `<span class="reading-label">${readingLabels[readingState(b)]}</span>` : ''}</span></article>`).join('');
  $('total-count').textContent = loaded ? books.length : '—';
  $('result-count').textContent = loaded ? `${list.length} of ${books.length} ${books.length === 1 ? 'book' : 'books'}` : 'Loading books…';
  const hasFilters = !!authorFilter || !!readingFilter || !!query.length || !!selectedShelf || filter !== 'all';
  $('empty-state').hidden = !loaded || !!list.length || !$('catalog-error').hidden;
  $('empty-title').textContent = hasFilters ? 'No matching books.' : scope === 'private' ? 'Your next chapter starts here.' : 'The shared shelves are being prepared.';
  $('empty-description').textContent = hasFilters ? 'Try a different title, author, or shelf.' : scope === 'private' ? 'Add your first book, or import a catalog you already have.' : canEdit() ? 'Add a book or import the existing catalog to get started.' : 'Check back soon for the first books in the shared catalog.';
  $('clear-filters').hidden = !hasFilters;
  $('add-button').hidden = !canEdit();
  $('import-label').hidden = !canEdit();
  $('import-note').hidden = !canEdit();
  $('library-eyebrow').textContent = scope === 'shared' ? 'THE SHARED COLLECTION' : 'JUST FOR YOU';
  $('library-title').innerHTML = scope === 'shared' ? 'Good books.<br>All in one place.' : 'Your books.<br>Your own little world.';
  $('library-description').textContent = scope === 'shared' ? 'A collection of ideas, stories, and things worth coming back to.' : 'A private collection that follows you, from one device to the next.';
  $('summary-label').textContent = scope === 'shared' ? 'books on the shared shelves' : 'books in your private collection';
  for (const s of ['shared', 'private']) { $(s + '-tab').classList.toggle('selected', scope === s); $(s + '-tab').setAttribute('aria-pressed', String(scope === s)); }
  document.querySelectorAll('[data-filter]').forEach(el => { const on = el.dataset.filter === filter; el.classList.toggle('selected', on); el.setAttribute('aria-pressed', String(on)); });
  networkStatus();
}
function subscribe() {
  unsubscribe?.(); unsubscribe = null;
  const generation = ++epoch;
  books = []; loaded = false; fromCache = true; $('catalog-error').hidden = true; render();
  if (!user) return;
  unsubscribe = watchBooks(scope, user.uid, (records, cached) => {
    if (generation !== epoch) return;
    books = records.filter(b => typeof b.t === 'string' && typeof b.a === 'string' && typeof b.d === 'string');
    loaded = true; fromCache = cached; $('catalog-error').hidden = true; render();
  }, error => {
    if (generation !== epoch) return;
    books = []; loaded = false; $('catalog-error').hidden = false;
    $('catalog-error-message').textContent = message(error); render();
  });
}
function setScope(next) {
  if (scope === next || importing || saving) return;
  scope = next; authorFilter = ''; $('reading-filter').value = ''; filter = 'all'; $('search').value = ''; $('shelf-filter').value = ''; closeDialogs(); subscribe();
}
$('shared-tab').onclick = () => setScope('shared'); $('private-tab').onclick = () => setScope('private');
$('retry-button').onclick = subscribe;
const shelfOptions = ['unsorted', ...SHELVES];
for (const id of ['shelf-filter', 'edit-shelf']) {
  for (const shelf of shelfOptions) { const option = document.createElement('option'); option.value = shelf; option.textContent = shelfName(shelf); $(id).append(option); }
}
initializeSelects();
$('clear-search').onclick = () => { $('search').value = ''; render(); $('search').focus(); };
for (const id of ['search', 'sort', 'shelf-filter', 'reading-filter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
document.querySelectorAll('[data-filter]').forEach(el => el.onclick = () => { filter = el.dataset.filter; render(); });
$('author-filter').onclick = () => { authorFilter = ''; render(); };
function chooseAuthor(author) { authorFilter = author; $('search').value = ''; $('shelf-filter').value = ''; $('reading-filter').value = ''; filter = 'all'; closeDialogs(); render(); $('author-filter').focus(); }
$('clear-filters').onclick = () => { authorFilter = ''; $('reading-filter').value = ''; $('search').value = ''; $('shelf-filter').value = ''; filter = 'all'; render(); };
document.querySelectorAll('[data-close]').forEach(el => el.onclick = () => {
  if (saving && el.closest('dialog').id === 'edit-dialog') return;
  if (importing && el.closest('dialog').id === 'export-dialog') return;
  el.closest('dialog').close();
});
$('edit-dialog').addEventListener('cancel', e => { if (saving) e.preventDefault(); });
$('export-dialog').addEventListener('cancel', e => { if (importing) e.preventDefault(); });
$('sign-in-button').onclick = async () => {
  showError($('sign-in-error'), ''); $('sign-in-button').disabled = true;
  try { await login(); } catch (error) { showError($('sign-in-error'), message(error)); }
  finally { $('sign-in-button').disabled = false; }
};
finishRedirect().catch(error => showError($('sign-in-error'), message(error)));
watchAuth(async next => {
  unsubscribeReading?.(); unsubscribeReading = null; reading = {}; authorFilter = ''; $('reading-filter').value = '';
  unsubscribe?.(); unsubscribe = null; ++epoch;
  user = next; editor = false; books = []; loaded = false; editing = null; deleting = null;
  closeDialogs(); $('book-details').replaceChildren(); $('book-form').reset();
  $('search').value = ''; $('shelf-filter').value = ''; filter = 'all'; scope = 'shared';
  $('boot-state').hidden = true; $('sign-in-screen').hidden = !!next; $('library-screen').hidden = !next; $('account-button').hidden = !next;
  $('account-email').textContent = next?.email || ''; $('account-label').textContent = next?.displayName?.split(' ')[0] || 'Account';
  $('account-initial').textContent = (next?.displayName || next?.email || 'M').slice(0, 1).toUpperCase();
  render();
  if (!next) return;
  subscribe();
  const uid = next.uid;
  unsubscribeReading = watchReading(uid, records => { if (user?.uid === uid) { reading = records; render(); } }, error => { if (user?.uid === uid) toast('Could not load your reading status. ' + message(error)); });
  try { const allowed = await isSharedEditor(next); if (user?.uid === uid) { editor = allowed; render(); } }
  catch (error) { if (user?.uid === uid) toast('Could not load shared-editor permissions. ' + message(error)); }
});
$('account-button').onclick = () => { $('account-role').textContent = editor ? 'Shared-catalog editor' : 'Shared-catalog reader · Private-library owner'; openDialog('account-dialog'); };
$('sign-out-button').onclick = async () => { $('sign-out-button').disabled = true; try { await logout(); } catch (error) { toast(message(error)); } finally { $('sign-out-button').disabled = false; } };
function openMap() {
  $('shelf-map').innerHTML = SHELVES.map(s => `<button class="shelf-cell" data-shelf="${s}"><span>${shelfName(s)}</span><small>${books.filter(b => b.shelf === s).length} books</small></button>`).join('');
  openDialog('map-dialog');
}
$('map-button').onclick = openMap;
function chooseShelf(shelf) { $('shelf-filter').value = shelf; $('search').value = ''; filter = 'all'; $('map-dialog').close(); render(); $('search').focus(); }
$('shelf-map').onclick = e => { const cell = e.target.closest('[data-shelf]'); if (cell) chooseShelf(cell.dataset.shelf); };
$('unsorted-button').onclick = () => chooseShelf('unsorted');
$('audit-button').onclick = () => openDialog('audit-dialog');
function openEdit(book) {
  if (!canEdit()) return;
  editing = { id: book?.id || null, scope, uid: user.uid, original: book };
  const f = $('book-form'); f.reset(); showError($('save-error'), '');
  $('edit-title').textContent = book ? 'Edit book' : 'Add a book';
  $('edit-destination').textContent = scope === 'shared' ? 'Saving to the shared catalog. Everyone who signs in can see this book.' : 'Saving to your private library. Only you can see this book.';
  if (book) { f.elements.title.value = book.t; f.elements.author.value = book.a; f.elements.description.value = book.d; f.elements.shelf.value = book.shelf; f.elements.status.value = book.status; }
  syncSelects();
  for (const input of f.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  openDialog('edit-dialog');
}
$('add-button').onclick = () => openEdit(null);
$('book-grid').onclick = e => {
  const author = e.target.closest('[data-author]'); if (author) { chooseAuthor(author.dataset.author); return; }
  const card = e.target.closest('[data-id]'); if (!card) return;
  const book = books.find(b => b.id === card.dataset.id); if (!book) return;
  $('book-details').innerHTML = `<h2 id="book-title">${esc(book.t)}</h2><button class="detail-author author-link" id="detail-author">${esc(book.a)}</button><span class="shelf-label">${esc(shelfName(book.shelf))}</span><p class="detail-description">${book.d ? esc(book.d) : 'No description added yet.'}</p><p class="notice"><b>${book.status === 'review' ? 'Needs review' : 'Confirmed'}</b>${book.note ? '<br>' + esc(book.note) : ''}</p><label class="reading-control">My reading status <select id="book-reading"><option value="">No status</option>${Object.entries(readingLabels).map(([value, label]) => `<option value="${value}" ${readingState(book) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="muted">Optional. Only you can see your reading status.</p><p class="inline-error" id="reading-error" role="alert" hidden></p><div class="form-actions">${canEdit() ? '<button class="text-button" id="delete-button">Remove</button><button class="tonal-button" id="edit-button">Edit book</button>' : ''}${scope === 'shared' ? '<button class="primary-button" id="copy-button">Add to my library</button>' : ''}</div>`;
  initializeSelects();
  $('detail-author').onclick = () => chooseAuthor(book.a);
  const readingTarget = { uid: user.uid, scope, id: book.id };
  $('book-reading').onchange = async e => {
    const select = e.target; const previous = reading[readingTarget.scope + '-' + book.id] || '';
    select.disabled = true; syncSelects(); showError($('reading-error'), '');
    try {
      if (!navigator.onLine) throw new Error('Reconnect before saving your reading status.');
      await saveReading(readingTarget.uid, readingTarget.scope, readingTarget.id, select.value);
      if (user?.uid === readingTarget.uid) toast('Reading status saved.');
    } catch (error) { if (user?.uid === readingTarget.uid && select.isConnected) { select.value = previous; showError($('reading-error'), message(error)); } }
    finally { select.disabled = false; syncSelects(); }
  };
  openDialog('book-dialog');
  if (canEdit()) {
    $('edit-button').onclick = () => { $('book-dialog').close(); openEdit(book); };
    $('delete-button').onclick = () => { deleting = { id: book.id, scope, uid: user.uid }; $('book-dialog').close(); $('delete-description').textContent = `“${book.t}” will be removed from ${scope === 'shared' ? 'the shared catalog' : 'your private library'}.`; showError($('delete-error'), ''); openDialog('delete-dialog'); };
  }
  if (scope === 'shared') $('copy-button').onclick = async () => {
    const button = $('copy-button'); const uid = user.uid; button.disabled = true;
    try { if (!navigator.onLine) throw new Error('Reconnect before saving a book.'); const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(book.id)); const privateId = 'shared-' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join(''); const created = await copyToPrivate(uid, privateId, cleanBook(book)); if (user?.uid === uid) toast(created ? 'Added to your private library.' : 'Already in your private library. Your notes were kept.'); }
    catch (error) { if (user?.uid === uid) toast(message(error)); }
    finally { button.disabled = false; }
  };
};
$('book-form').onsubmit = async e => {
  e.preventDefault(); if (!editing || saving || !user) return;
  const target = { ...editing }; const f = e.currentTarget;
  showError($('save-error'), '');
  try {
    if (!navigator.onLine) throw new Error('Reconnect before saving. Your form has been kept open.');
    for (const name of ['title', 'author']) f.elements[name].setAttribute('aria-invalid', String(!f.elements[name].value.trim()));
    if (!f.elements.title.value.trim() || !f.elements.author.value.trim()) {
      f.elements[!f.elements.title.value.trim() ? 'title' : 'author'].focus();
      throw new Error('Enter a book title and author to continue.');
    }
    const data = cleanBook({ t: f.elements.title.value, a: f.elements.author.value, d: f.elements.description.value, shelf: f.elements.shelf.value, status: f.elements.status.value, added: target.original?.added ?? true,
      note: f.elements.status.value === target.original?.status ? target.original.note : f.elements.status.value === 'confirmed' ? 'Confirmed by a catalog editor.' : 'Awaiting title, author, or location verification.' });
    saving = true; $('save-button').disabled = true; $('save-button').textContent = 'Saving…';
    await saveBook(target.scope, target.uid, target.id || crypto.randomUUID(), data, !target.id);
    if (user?.uid === target.uid) { $('edit-dialog').close(); toast('Book saved to Firestore.'); }
  } catch (error) { if (user?.uid === target.uid) showError($('save-error'), message(error)); }
  finally { saving = false; $('save-button').disabled = false; $('save-button').textContent = 'Save book'; }
};
$('confirm-delete').onclick = async () => {
  if (!deleting || !user) return;
  const target = { ...deleting }; $('confirm-delete').disabled = true;
  try { if (!navigator.onLine) throw new Error('Reconnect before removing a book.'); await removeBook(target.scope, target.uid, target.id); if (user?.uid === target.uid) { $('delete-dialog').close(); toast('Book removed.'); } }
  catch (error) { if (user?.uid === target.uid) showError($('delete-error'), message(error)); }
  finally { $('confirm-delete').disabled = false; }
};
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('export-button').onclick = () => { $('export-scope').textContent = scope === 'shared' ? 'Exporting the shared catalog.' : 'Exporting your private library.'; $('import-status').textContent = ''; openDialog('export-dialog'); };
$('download-json').onclick = () => download(`manahsmriti-${scope}-books.json`, JSON.stringify(books.map(b => ({ id: b.id, ...cleanBook(b) })), null, 2), 'application/json');
$('download-csv').onclick = () => { const rows = [['Title', 'Author', 'Shelf', 'Verification', 'Description', 'Notes'], ...books.map(b => [b.t, b.a, shelfName(b.shelf), b.status, b.d, b.note])]; download(`manahsmriti-${scope}-books.csv`, '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); };
function confirmImport(count, destination) {
  $('import-confirm-description').textContent = `Import ${count} ${count === 1 ? 'book' : 'books'} into ${destination === 'shared' ? 'the shared catalog' : 'your private library'}? Matching book IDs will be updated. Other books will be kept.`;
  const dialog = $('import-confirm-dialog');
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'import'), { once: true });
    dialog.showModal();
  });
}
$('accept-import').onclick = () => $('import-confirm-dialog').close('import');
$('cancel-import').onclick = () => $('import-confirm-dialog').close('cancel');
$('import-json').onchange = async e => {
  const file = e.target.files[0]; if (!file || !canEdit() || importing) return;
  const target = { scope, uid: user.uid, ids: new Set(books.map(b => b.id)) };
  try {
    if (!navigator.onLine) throw new Error('Reconnect before importing a catalog.');
    if (file.size > 10000000) throw new Error('Choose a backup smaller than 10 MB.');
    const rows = parseCatalog(JSON.parse(await file.text()));
    if (!await confirmImport(rows.length, target.scope)) return;
    importing = true; $('import-json').disabled = true; $('sign-out-button').disabled = true;
    $('import-status').textContent = `Importing 0 of ${rows.length} books…`;
    await importBooks(target.scope, target.uid, rows, target.ids, done => { if (user?.uid === target.uid) $('import-status').textContent = `Imported ${done} of ${rows.length} books…`; });
    if (user?.uid === target.uid) { $('import-status').textContent = `${rows.length} books saved to Firestore.`; toast('Catalog imported.'); }
  } catch (error) { if (user?.uid === target.uid) $('import-status').textContent = message(error) + ' If any batches completed, reimporting safely resumes by book ID.'; }
  finally { importing = false; $('import-json').disabled = false; $('sign-out-button').disabled = false; e.target.value = ''; }
};
let theme;
try { theme = localStorage.getItem('manahsmriti-theme') || localStorage.getItem('booklocator-theme'); } catch { /* Storage is optional. */ }
if (!['light', 'dark'].includes(theme)) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
function applyTheme() { document.documentElement.dataset.theme = theme; $('theme-button').textContent = theme === 'dark' ? 'Light theme' : 'Dark theme'; $('theme-button').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`); document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#14181f' : '#f8fafd'; }
applyTheme();
$('theme-button').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); try { localStorage.setItem('manahsmriti-theme', theme); } catch { /* Keep the current in-memory theme. */ } };
document.addEventListener('keydown', e => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && user && !document.querySelector('dialog[open]') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.getAttribute('role') !== 'combobox') { e.preventDefault(); $('search').focus(); } });
