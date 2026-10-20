/* Uses the installed Firebase CLI's authenticated client. Tokens never leave process memory. */
const fs = require('node:fs');
const { Client } = require('firebase-tools/lib/apiv2');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { getProjectDefaultAccount } = require('firebase-tools/lib/auth');
const { getAuthDomains, updateAuthDomains } = require('firebase-tools/lib/gcp/auth');
const project = 'manahsmriti';
const site = process.env.BOOKS_SITE_ID || 'manahsmriti-books';
const editors = ['theharithsa@gmail.com', 'theharithsa@icloud.com'];
function value(x) {
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  throw new Error('Unsupported catalog field type.');
}
async function main() {
  const account = getProjectDefaultAccount(process.cwd());
  const options = { project, nonInteractive: true, ...(account ? { user: account.user, tokens: account.tokens } : {}) };
  await requireAuth(options);
  const firestore = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  const root = `projects/${project}/databases/(default)/documents`;
  // Confirm Firestore exists before performing any mutations.
  await firestore.get(`projects/${project}/databases/(default)`);
  let previousEditors = [];
  try {
    const previous = await firestore.get(`${root}/booksSettings/access`);
    previousEditors = (previous.body.fields?.editorEmails?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);
  } catch (error) { if (error.status !== 404) throw error; }
  const editorEmails = [...new Set([...previousEditors, ...editors])];
  await firestore.patch(`${root}/booksSettings/access`, {
    fields: { editorEmails: { arrayValue: { values: editorEmails.map(value) } } },
  }, { queryParams: { 'updateMask.fieldPaths': ['editorEmails'] } });
  console.log('Shared editor emails configured. Other existing settings were preserved.');
  const domains = await getAuthDomains(project);
  const wanted = [`${site}.web.app`, `${site}.firebaseapp.com`];
  if (wanted.some(domain => !domains.includes(domain))) {
    await updateAuthDomains(project, [...new Set([...domains, ...wanted])]);
  }
  console.log('Books Hosting domains authorized for Firebase Authentication.');
  const identity = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v2' });
  const google = await identity.get(`projects/${project}/defaultSupportedIdpConfigs/google.com`);
  if (!google.body.clientId) throw new Error('Enable the Google provider in Firebase Authentication before deploying.');
  if (!google.body.enabled) {
    await identity.patch(`projects/${project}/defaultSupportedIdpConfigs/google.com`, { enabled: true }, { queryParams: { updateMask: 'enabled' } });
  }
  console.log('Google sign-in provider is enabled.');
  const rows = JSON.parse(fs.readFileSync('books/data/catalog.json', 'utf8'));
  let inserted = 0, kept = 0;
  for (let offset = 0; offset < rows.length; offset += 200) {
    const now = new Date().toISOString();
    const writes = rows.slice(offset, offset + 200).map(({ id, t, a, d, note, shelf, status, added }) => ({
      update: { name: `${root}/booksShared/${id}`, fields: {
        ...Object.fromEntries(Object.entries({ t, a, d, note, shelf, status, added }).map(([k, v]) => [k, value(v)])),
        createdAt: { timestampValue: now }, updatedAt: { timestampValue: now },
      } },
      currentDocument: { exists: false },
    }));
    const result = await firestore.post(`${root}:batchWrite`, { writes });
    for (const status of result.body.status || []) {
      if (!status.code) inserted++;
      else if (status.code === 6) kept++;
      else throw new Error(`Catalog import failed: ${status.message}. Completed books are kept; rerun safely.`);
    }
  }
  console.log(`Catalog ready: ${inserted} inserted, ${kept} existing entries preserved.`);
}
main().catch(error => { console.error(error.message || 'Provisioning failed.'); process.exitCode = 1; });
