import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
let env;
const record = extra => ({ t: 'A real book', a: 'An Author', d: 'Description', note: '', shelf: '2L', status: 'confirmed', added: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-manahsmriti', firestore: { host: '127.0.0.1', port: 8081, rules: readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'booksSettings/access'), { editorEmails: ['theharithsa@gmail.com', 'theharithsa@icloud.com'] });
    await setDoc(doc(db, 'booksShared/original'), record());
    await setDoc(doc(db, 'booksUsers/alice/books/private'), record());
  });
});
const context = (uid, email = uid + '@example.com', email_verified = true) => env.authenticatedContext(uid, { email, email_verified }).firestore();
test('signed-out users cannot read shared books, private books, or editor settings', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDocs(collection(db, 'booksShared')));
  await assertFails(getDoc(doc(db, 'booksUsers/alice/books/private')));
  await assertFails(getDoc(doc(db, 'booksSettings/access')));
});
test('a signed-in reader can view shared books but cannot change them', async () => {
  const db = context('reader');
  await assertSucceeds(getDocs(collection(db, 'booksShared')));
  await assertFails(setDoc(doc(db, 'booksShared/new'), record()));
  await assertFails(updateDoc(doc(db, 'booksShared/original'), { t: 'Changed', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'booksShared/original')));
});
test('both approved verified emails can manage shared books', async () => {
  for (const email of ['theharithsa@gmail.com', 'theharithsa@icloud.com']) {
    const db = context(email.split('@')[1], email);
    const ref = doc(db, 'booksShared/new');
    await assertSucceeds(setDoc(ref, record()));
    await assertSucceeds(updateDoc(ref, { d: 'Updated description', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  }
});
test('an unverified approved email cannot edit shared books', async () => {
  const db = context('fake-owner', 'theharithsa@gmail.com', false);
  await assertFails(setDoc(doc(db, 'booksShared/new'), record()));
});
test('a user can manage their private books, and other users cannot read or write them', async () => {
  const owner = context('alice'), stranger = context('bob');
  await assertSucceeds(getDocs(collection(owner, 'booksUsers/alice/books')));
  await assertSucceeds(setDoc(doc(owner, 'booksUsers/alice/books/new'), record()));
  await assertSucceeds(updateDoc(doc(owner, 'booksUsers/alice/books/new'), { t: 'Revised title', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(owner, 'booksUsers/alice/books/new')));
  await assertFails(getDocs(collection(stranger, 'booksUsers/alice/books')));
  await assertFails(getDoc(doc(stranger, 'booksUsers/alice/books/private')));
  await assertFails(setDoc(doc(stranger, 'booksUsers/alice/books/other'), record()));
  await assertFails(deleteDoc(doc(stranger, 'booksUsers/alice/books/private')));
});
test('even a shared editor cannot read someone else’s private books', async () => {
  await assertFails(getDoc(doc(context('editor', 'theharithsa@gmail.com'), 'booksUsers/alice/books/private')));
});
test('clients cannot grant themselves editor access', async () => {
  for (const db of [context('reader'), context('editor', 'theharithsa@gmail.com')]) {
    await assertFails(setDoc(doc(db, 'booksSettings/access'), { editorEmails: ['reader@example.com'] }));
  }
});
test('validation rejects bad locations, extra fields, oversized text, and forged timestamps', async () => {
  const db = context('alice');
  const ref = doc(db, 'booksUsers/alice/books/bad');
  for (const invalid of [{ shelf: '6L' }, { isAdmin: true }, { t: '' }, { a: 'a'.repeat(241) }, { d: 'd'.repeat(5001) }, { status: 'made-up' }, { createdAt: Timestamp.fromMillis(0) }, { updatedAt: Timestamp.fromMillis(0) }]) {
    await assertFails(setDoc(ref, record(invalid)));
  }
  await assertFails(setDoc(doc(db, 'booksUsers/alice/books/' + 'a'.repeat(129)), record()));
});
test('creation timestamps cannot be changed on update', async () => {
  const db = context('alice');
  await assertFails(updateDoc(doc(db, 'booksUsers/alice/books/private'), { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
});
test('unrelated app collections are denied by default', async () => {
  await assertFails(setDoc(doc(context('alice'), 'otherApp/private'), { value: 1 }));
});
