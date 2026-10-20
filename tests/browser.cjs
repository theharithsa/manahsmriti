const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const seed = JSON.parse(fs.readFileSync('books/data/catalog.json'));
const total = seed.length;
const lowerLeft = seed.filter(b => b.shelf === '5L').length;
async function main() {
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const { doc, setDoc, writeBatch, Timestamp } = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-manahsmriti', firestore: { host: '127.0.0.1', port: 8081, rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'booksSettings/access'), { editorEmails: ['theharithsa@gmail.com', 'theharithsa@icloud.com'] });
    for (const { id, ...book } of JSON.parse(fs.readFileSync('books/data/catalog.json'))) {
      batch.set(doc(db, 'booksShared', id), { ...book, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    }
    await batch.commit();
  });
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', 'books', '--outDir', 'dist-emulator'], { env: { ...process.env, VITE_USE_EMULATORS: 'true' }, encoding: 'utf8' });
  if (build.status) throw Error(build.stderr + build.stdout);
  const directory = path.resolve('books/dist-emulator');
  const headers = Object.fromEntries(JSON.parse(fs.readFileSync('firebase.json')).hosting[0].headers[0].headers.map(h => [h.key, h.value]));
  headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8081 http://127.0.0.1:9099").replace('frame-src ', 'frame-src http://127.0.0.1:9099 ');
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(req.url.split('?')[0]);
    const filename = path.join(directory, requested === '/' ? 'index.html' : requested);
    if (!filename.startsWith(directory)) { res.writeHead(400); res.end(); return; }
    fs.readFile(filename, (error, data) => {
      if (error) { res.writeHead(404); res.end(); return; }
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
      res.writeHead(200, { ...headers, 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(5174, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const errors = [];
    async function newPage(context) { const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){if(m.text().includes('violates the following Content Security Policy'))errors.push(m.text());else if(!m.text().includes('ERR_INTERNET_DISCONNECTED'))console.log('BROWSER ERROR',m.text());}});page.on('requestfailed',r=>{if(!['net::ERR_ABORTED','net::ERR_INTERNET_DISCONNECTED'].includes(r.failure()?.errorText))console.log('REQUEST FAILED',r.url(),r.failure()?.errorText);}); return page; }
    async function signIn(page, email) {
      await page.context().route(/^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.fulfill({status:200,contentType:route.request().url().endsWith('.js')?'application/javascript':'text/css',body:''}));
      await page.goto('http://127.0.0.1:5174/');
      const popupPromise = page.waitForEvent('popup');
      await page.locator('#sign-in-button').click();
      const popup = await popupPromise.catch(async e=>{console.log('SIGN IN ERROR',await page.locator('#sign-in-error').textContent());await page.screenshot({path:'artifacts/sign-in-failure.png'});throw e;});
      await popup.waitForLoadState('domcontentloaded');
      await popup.waitForSelector('#add-account-button');
      const existing = popup.getByText(email, { exact: true });
      if (await existing.count()) await existing.first().click();
      else { await popup.locator('#add-account-button').click(); await popup.locator('#email-input').fill(email); await popup.locator('#display-name-input').fill(email.split('@')[0]); await popup.locator('#sign-in').click(); }
      await page.locator('#library-screen').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.getElementById('sync-status').textContent.includes('Up to date'));
    }
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const owner = await newPage(ownerContext);
    await owner.goto('http://127.0.0.1:5174/');
    await owner.locator('#sign-in-screen').waitFor({ state: 'visible' });
    assert.equal(await owner.locator('.book-card').count(), 0);
    fs.mkdirSync('artifacts', { recursive: true });
    await owner.screenshot({ path: 'artifacts/sign-in-desktop.png' });
    await signIn(owner, 'theharithsa@gmail.com');
    await owner.locator('#add-button').waitFor({ state: 'visible' });
    assert.equal(await owner.locator('.book-card').count(), total);
    assert.equal(await owner.locator('.book-card svg').count(), 0);
    await owner.evaluate(() => document.fonts.ready);
    for (const family of ['Caveat Variable', 'Ancizar Serif Variable', 'Source Code Pro Variable']) {
      assert.equal(await owner.evaluate(family => document.fonts.check(`16px "${family}"`), family), true, family + ' loads');
    }
    assert.match(await owner.locator('.book-card h3').first().evaluate(el => getComputedStyle(el).fontFamily), /Caveat/);
    assert.equal(await owner.locator('.book-card h3').first().evaluate(el => getComputedStyle(el).fontWeight), '600');
    assert.match(await owner.locator('h1#library-title').evaluate(el => getComputedStyle(el).fontFamily), /Source Code Pro/);
    assert.match(await owner.locator('body').evaluate(el => getComputedStyle(el).fontFamily), /Ancizar Serif/);
    const sortControl = owner.locator('#sort').locator('..').getByRole('combobox');
    await sortControl.focus(); await owner.keyboard.press('ArrowDown');
    assert.equal(await sortControl.getAttribute('aria-expanded'), 'true');
    await owner.keyboard.press('End'); await owner.keyboard.press('Enter');
    assert.equal(await owner.locator('#sort').inputValue(), 'shelf');
    await owner.keyboard.press('Home'); await owner.keyboard.press('Enter');
    assert.equal(await owner.locator('#sort').inputValue(), 'title');
    await sortControl.click(); await owner.keyboard.press('Escape');
    assert.equal(await sortControl.getAttribute('aria-expanded'), 'false');
    await owner.screenshot({ path: 'artifacts/shared-library-desktop.png' });
    await owner.locator('#search').fill('Cal Newport'); assert.equal(await owner.locator('.book-card').count(), 2);
    await owner.locator('#clear-search').click(); assert.equal(await owner.locator('.book-card').count(), total);
    await owner.locator('#search').fill('Deep Work');
    await owner.locator('.book-author').click();
    assert.equal(await owner.locator('.book-card').count(), 2);
    assert.match(await owner.locator('#author-filter').textContent(), /Cal Newport/);
    await owner.locator('#author-filter').click();
    await owner.locator('#search').fill('Deep Work'); await owner.locator('.book-title-button').click(); await owner.locator('#edit-button').click();
    await owner.getByRole('combobox', { name: /^Location:/ }).click();
    await owner.getByRole('option', { name: 'Row 2 · Left', exact: true }).click();
    assert.equal(await owner.locator('#edit-shelf').inputValue(), '2L');
    assert.match(await owner.locator('#edit-dialog input[name="title"]').evaluate(el => getComputedStyle(el).fontFamily), /Ancizar Serif/);
    assert.equal(await owner.locator('#edit-dialog input[name="title"]').evaluate(el => getComputedStyle(el).fontSize), '16px');
    await owner.screenshot({ path: 'artifacts/edit-form-desktop.png' });
    await owner.locator('textarea[name="description"]').fill('Updated by the shared catalog editor.');
    await owner.locator('#save-button').click(); await owner.locator('#edit-dialog').waitFor({ state: 'hidden' });
    await owner.reload(); await owner.waitForFunction(() => document.getElementById('sync-status').textContent.includes('Up to date'));
    await owner.locator('#search').fill('Deep Work'); assert.match(await owner.locator('.book-description').textContent(), /Updated by/);
    const readerContext = await browser.newContext({ viewport: { width: 390, height: 1000 } });
    const reader = await newPage(readerContext); await signIn(reader, 'reader@example.com');
    assert.equal(await reader.locator('#add-button').isVisible(), false);
    await reader.locator('#search').fill('Deep Work'); await reader.locator('.book-title-button').click();
    assert.equal(await reader.locator('#edit-button').count(), 0);
    await reader.getByRole('combobox', { name: /^My reading status:/ }).click();
    await reader.getByRole('option', { name: 'Reading', exact: true }).click();
    await reader.locator('#toast').filter({ hasText: 'Reading status saved.' }).waitFor();
    assert.equal(await reader.locator('.reading-label').textContent(), 'Reading');
    assert.equal(await owner.locator('.reading-label').count(), 0);
    await reader.keyboard.press('Escape');
    await reader.getByRole('combobox', { name: /^Filter by reading status:/ }).click();
    await reader.getByRole('option', { name: 'Reading', exact: true }).click();
    assert.equal(await reader.locator('.book-card').count(), 1);
    await reader.reload();
    await reader.locator('.reading-label').waitFor();
    await reader.locator('#search').fill('Deep Work'); await reader.locator('.book-title-button').click();
    assert.equal(await reader.locator('#book-reading').inputValue(), 'reading');
    await reader.getByRole('combobox', { name: /^My reading status:/ }).click();
    await reader.getByRole('option', { name: 'No status', exact: true }).click();
    await reader.locator('#toast').filter({ hasText: 'Reading status saved.' }).waitFor();
    assert.equal(await reader.locator('.reading-label').count(), 0);

    await reader.locator('#copy-button').click(); await reader.locator('#toast').filter({ hasText: 'Added to your private library.' }).waitFor();
    await reader.locator('#copy-button').click(); await reader.locator('#toast').filter({hasText:'Already in your private library.'}).waitFor();
    await reader.keyboard.press('Escape'); await reader.locator('#private-tab').click();
    await reader.waitForFunction(() => document.getElementById('sync-status').textContent.includes('Up to date'));
    assert.equal(await reader.locator('.book-card').count(), 1);
    await reader.locator('#add-button').click();
    await reader.locator('#save-button').click();
    assert.match(await reader.locator('#save-error').textContent(), /Enter a book title/);
    assert.equal(await reader.locator('#edit-dialog input[name="title"]').getAttribute('aria-invalid'), 'true');
    const locationControl = reader.getByRole('combobox', { name: /^Location:/ });
    await locationControl.click();
    const locationMenu = reader.getByRole('listbox', { name: 'Location' });
    const menuRect = await locationMenu.boundingBox();
    assert.ok(menuRect.x >= 0 && menuRect.x + menuRect.width <= 390);
    assert.ok(menuRect.y >= 0 && menuRect.y + menuRect.height <= 1000);
    await reader.screenshot({ path: 'artifacts/edit-form-dropdown-mobile.png' });
    await reader.getByRole('option', { name: 'Row 3 · Right', exact: true }).click();
    assert.equal(await reader.locator('#edit-shelf').inputValue(), '3R');
    const verificationControl = reader.getByRole('combobox', { name: /^Verification:/ });
    await verificationControl.click(); await reader.keyboard.press('ArrowDown'); await reader.keyboard.press('Enter');
    assert.equal(await reader.locator('#edit-dialog select[name="status"]').inputValue(), 'review');
    await reader.locator('[name="title"]').fill('Private test <img src=x onerror=alert(1)>');
    await reader.locator('[name="author"]').fill('A Private Author'); await reader.locator('textarea[name="description"]').fill('Private description');
    await readerContext.setOffline(true); await reader.locator('#save-button').click();
    assert.match(await reader.locator('#save-error').textContent(), /Reconnect/);
    assert.equal(await reader.locator('#edit-dialog').isVisible(), true);
    await readerContext.setOffline(false); await reader.locator('#save-button').click(); await reader.locator('#edit-dialog').waitFor({ state: 'hidden' });
    assert.equal(await reader.locator('.book-card').count(), 2); assert.equal(await reader.locator('.book-card img').count(), 0);
    await reader.reload(); await reader.waitForFunction(() => document.getElementById('sync-status').textContent.includes('Up to date')); await reader.locator('#private-tab').click();
    await reader.waitForFunction(() => document.getElementById('result-count').textContent === '2 of 2 books');
    const readerOtherDeviceContext = await browser.newContext(); const readerOtherDevice = await newPage(readerOtherDeviceContext);
    await signIn(readerOtherDevice, 'reader@example.com'); await readerOtherDevice.locator('#private-tab').click();
    await readerOtherDevice.waitForFunction(() => document.getElementById('result-count').textContent === '2 of 2 books');
    const strangerContext = await browser.newContext(); const stranger = await newPage(strangerContext);
    await signIn(stranger, 'stranger@example.com'); await stranger.locator('#private-tab').click();
    await stranger.waitForFunction(() => document.getElementById('result-count').textContent === '0 of 0 books');
    await reader.locator('#export-button').click();
    const downloadPromise = reader.waitForEvent('download'); await reader.locator('#download-json').click(); const download = await downloadPromise;
    const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8')); assert.equal(json.length, 2);
    const file = [{ id: 'imported-private', t: 'Imported book', a: 'Import Author', d: 'A valid imported description.', note: '', shelf: '1R', status: 'review', added: true }];

    await reader.locator('#import-json').setInputFiles({ name: 'catalog.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await reader.locator('#import-confirm-dialog').waitFor({ state: 'visible' });
    await reader.locator('#cancel-import').click();
    assert.equal(await reader.locator('.book-card').count(), 2);
    await reader.locator('#import-json').setInputFiles({ name: 'catalog.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await reader.locator('#import-confirm-dialog').waitFor({ state: 'visible' });
    await reader.screenshot({ path: 'artifacts/import-confirmation-mobile.png' });
    await reader.locator('#accept-import').click();
    await reader.locator('#import-status').filter({ hasText: '1 books saved to Firestore.' }).waitFor();
    await reader.keyboard.press('Escape');
    await readerOtherDevice.waitForFunction(() => document.getElementById('result-count').textContent === '3 of 3 books');
    await reader.locator('#search').fill('Imported book'); await reader.locator('.book-title-button').click(); await reader.locator('#delete-button').click();
    await reader.locator('#confirm-delete').click(); await reader.locator('#delete-dialog').waitFor({ state: 'hidden' });
    await readerOtherDevice.waitForFunction(() => document.getElementById('result-count').textContent === '2 of 2 books');
    await reader.locator('#search').fill(''); await reader.locator('#shared-tab').click();
    await reader.waitForFunction(count => document.getElementById('result-count').textContent === `${count} of ${count} books`, total);
    await reader.screenshot({ path: 'artifacts/shared-library-mobile.png' });
    for (const width of [360, 390, 768, 1024, 1440]) {
      await reader.setViewportSize({ width, height: 1000 });
      assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow at ' + width);
    }
    await reader.setViewportSize({ width: 390, height: 1000 }); await reader.locator('#theme-button').click();
    await reader.screenshot({ path: 'artifacts/shared-library-dark.png' });
    const shelfControl = reader.locator('#shelf-filter').locator('..').getByRole('combobox');
    await shelfControl.click();
    assert.equal(await reader.getByRole('listbox', { name: 'Filter by shelf' }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(29, 35, 45)');
    const darkMenuRect = await reader.getByRole('listbox', { name: 'Filter by shelf' }).boundingBox();
    assert.ok(darkMenuRect.y >= 0 && darkMenuRect.y + darkMenuRect.height <= 1000, 'Dark-mode menu stays within viewport');
    await reader.screenshot({ path: 'artifacts/dropdown-dark-mobile.png' });
    await reader.keyboard.press('Escape');
    await reader.locator('#map-button').click(); assert.equal(await reader.locator('.shelf-cell').count(), 10);
    await reader.locator('[data-shelf="5L"]').click(); assert.equal(await reader.locator('.book-card').count(), lowerLeft);
    await reader.locator('#account-button').click(); await reader.locator('#sign-out-button').click();
    await reader.locator('#sign-in-screen').waitFor({ state: 'visible' }); assert.equal(await reader.locator('.book-card').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS browser: Google sign-in emulator, auth persistence, shared editor/reader permissions, shared edits, private CRUD, cross-device sync, account isolation, offline form retention, XSS escaping, JSON import/export, shelf map, requested font roles, custom select keyboard navigation, inline form validation, in-app import confirmation, themed controls, 5 responsive widths, dark theme and sign-out clearing.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await env.cleanup(); }
}
main().catch(error => { console.error(error); process.exit(1); });
