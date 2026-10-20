// Apply a reviewed catalog audit without overwriting intervening edits or private catalogs.
const fs = require('node:fs');
const { Client } = require('firebase-tools/lib/apiv2');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { getProjectDefaultAccount } = require('firebase-tools/lib/auth');
const project = 'manahsmriti';
const root = `projects/${project}/databases/(default)/documents`;
const fields = ['t', 'a', 'd', 'note', 'shelf', 'status', 'added'];
const encode = value => typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
const decode = document => Object.fromEntries(fields.map(key => [key, document.fields[key]?.stringValue ?? document.fields[key]?.booleanValue]));
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/apply-photo-audit.cjs <audit.json> [--apply]');
  const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(audit.changes) || audit.changes.length > 450) throw new Error('Invalid audit or too many changes for one atomic commit.');
  const account = getProjectDefaultAccount(process.cwd());
  await requireAuth({ project, nonInteractive: true, ...(account ? { user: account.user, tokens: account.tokens } : {}) });
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  const remote = new Map();
  let pageToken;
  do {
    const response = await client.get(`${root}/booksShared`, { queryParams: { pageSize: 1000, ...(pageToken ? { pageToken } : {}) } });
    for (const document of response.body.documents || []) remote.set(document.name.split('/').pop(), document);
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  const writes = [], conflicts = [], summary = { create: 0, update: 0, delete: 0, alreadyApplied: 0 };
  for (const change of audit.changes) {
    const { id, action, before, after } = change;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid audit book ID.');
    const current = remote.get(id), data = current && decode(current), name = `${root}/booksShared/${id}`;
    if (action === 'create') {
      if (current) {
        if (fields.every(key => data[key] === after[key])) summary.alreadyApplied++;
        else conflicts.push(`${id}: a different book already uses this ID`);
        continue;
      }
      writes.push({ update: { name, fields: Object.fromEntries(fields.map(key => [key, encode(after[key])])) }, currentDocument: { exists: false }, updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ] });
    } else if (action === 'delete') {
      if (!current) { summary.alreadyApplied++; continue; }
      if (!fields.every(key => data[key] === before[key])) { conflicts.push(`${id}: entry was edited; deletion skipped`); continue; }
      writes.push({ delete: name, currentDocument: { updateTime: current.updateTime } });
    } else if (action === 'update') {
      if (!current) { conflicts.push(`${id}: original entry is missing`); continue; }
      const changed = fields.filter(key => before[key] !== after[key]);
      if (changed.every(key => data[key] === after[key])) { summary.alreadyApplied++; continue; }
      if (data.t !== before.t || data.a !== before.a || changed.some(key => data[key] !== before[key] && data[key] !== after[key])) {
        conflicts.push(`${id}: title, author, or an audited field was edited; update skipped`); continue;
      }
      writes.push({ update: { name, fields: Object.fromEntries(changed.map(key => [key, encode(after[key])])) }, updateMask: { fieldPaths: changed },
        currentDocument: { updateTime: current.updateTime }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] });
    } else throw new Error('Unknown audit action.');
    summary[action]++;
  }
  console.log('Audit plan:', JSON.stringify(summary));
  if (conflicts.length) throw new Error('No changes applied because of conflicts:\n' + conflicts.join('\n'));
  if (!process.argv.includes('--apply')) { console.log('Dry run only. Add --apply to commit this reviewed audit.'); return; }
  if (writes.length) await client.post(`${root}:commit`, { writes });
  console.log(`Committed ${writes.length} changes atomically. Private catalogs were untouched.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
