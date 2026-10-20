import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup,
  signInWithRedirect, getRedirectResult, signOut, connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc,
  onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp, runTransaction,
} from 'firebase/firestore';

// Firebase web configuration identifies the app; security is enforced by Firestore rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCjUbIKiGn_Q6lzVEoF3ENPh9ivOiR2my8',
  authDomain: 'manahsmriti.firebaseapp.com',
  projectId: 'manahsmriti',
  storageBucket: 'manahsmriti.firebasestorage.app',
  messagingSenderId: '1015100930111',
  appId: '1:1015100930111:web:f7772d52fcb3d9f370a08a',
};
const isEmulator = import.meta.env.VITE_USE_EMULATORS === 'true';
const app = initializeApp(isEmulator ? {
  ...firebaseConfig, projectId: 'demo-manahsmriti', apiKey: 'demo-api-key',
} : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (isEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8081);
}
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
export const watchAuth = callback => onAuthStateChanged(auth, callback);
export async function login() {
  try { await signInWithPopup(auth, provider); }
  catch (error) {
    if (error.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}
export const finishRedirect = () => getRedirectResult(auth);
export const logout = () => signOut(auth);
export async function isSharedEditor(user) {
  const access = await getDoc(doc(db, 'booksSettings', 'access'));
  return user.emailVerified && access.exists() &&
    access.data().editorEmails?.includes(user.email?.toLowerCase());
}
function bookCollection(scope, uid) {
  if (!uid) throw new Error('Sign in to open your library.');
  return scope === 'shared' ? collection(db, 'booksShared') : collection(db, 'booksUsers', uid, 'books');
}
export function watchBooks(scope, uid, callback, onError) {
  return onSnapshot(bookCollection(scope, uid), { includeMetadataChanges: true }, snapshot => callback(
    snapshot.docs.map(document => ({ ...document.data(), id: document.id })),
    snapshot.metadata.fromCache,
  ), onError);
}
export async function saveBook(scope, uid, id, book, isNew) {
  const ref = doc(bookCollection(scope, uid), id);
  const data = { ...book, updatedAt: serverTimestamp() };
  if (isNew) data.createdAt = serverTimestamp();
  await setDoc(ref, data, { merge: true });
}
export async function copyToPrivate(uid, id, book) {
  const target = doc(bookCollection('private', uid), id);
  return runTransaction(db, async transaction => {
    const existing = await transaction.get(target);
    if (existing.exists()) return false;
    transaction.set(target, { ...book, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return true;
  });
}
export const removeBook = (scope, uid, id) => deleteDoc(doc(bookCollection(scope, uid), id));
export async function importBooks(scope, uid, records, existingIds, progress = () => {}) {
  // Imports upsert matching IDs and preserve other books. Completed chunks can be safely retried.
  const target = bookCollection(scope, uid);
  for (let offset = 0; offset < records.length; offset += 400) {
    const batch = writeBatch(db);
    const chunk = records.slice(offset, offset + 400);
    for (const record of chunk) {
      const { id, ...book } = record;
      const data = { ...book, updatedAt: serverTimestamp() };
      if (!existingIds.has(id)) data.createdAt = serverTimestamp();
      batch.set(doc(target, id), data, { merge: true });
    }
    await batch.commit();
    progress(Math.min(offset + chunk.length, records.length));
  }
}

// Personal reading choices never modify the shared catalog.
export function watchReading(uid, callback, onError) {
  return onSnapshot(collection(db, 'booksUsers', uid, 'reading'), snapshot =>
    callback(Object.fromEntries(snapshot.docs.map(d => [d.id, d.data().state]))), onError);
}
export function saveReading(uid, scope, id, state) {
  const ref = doc(db, 'booksUsers', uid, 'reading', scope + '-' + id);
  return state ? setDoc(ref, { state, updatedAt: serverTimestamp() }) : deleteDoc(ref);
}
