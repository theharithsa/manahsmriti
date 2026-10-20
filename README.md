# Manahsmriti

A home for personal projects, starting with **Books**: a searchable shared catalog and a private, cloud-synced library for every signed-in reader.

**Books URL:** https://manahsmriti-books.web.app

**Main site:** https://manahsmriti.web.app

The Books app has its own Firebase Hosting site, so future ideas can live alongside it without replacing the main site. All library source code and the initial catalog are under [`books/`](books/).

## What Books does

- Google sign-in with Firebase Authentication.
- Shared catalog visible to anyone who signs in.
- Shared-catalog editing for verified `theharithsa@gmail.com` and `theharithsa@icloud.com` accounts.
- A separate private catalog per user; other users and shared-catalog editors cannot read it through the app.
- Add and edit titles, authors, descriptions, shelf locations, and verification status. Remove books with confirmation.
- Copy shared books to your private library.
- Real-time Firestore synchronization between devices. A save is reported successful only after Firestore acknowledges it.
- Search, sorting, shelf filters, a five-row wardrobe map, JSON import/export, and CSV export.
- Text-only cards, responsive layouts, a light/dark theme, and locally served Roboto fonts based on Google's Material typography guidance. See [typography sources](docs/TYPOGRAPHY.md).

## Photo inventory

The initial seed has 207 entries: 203 from the original HTML and 4 overview-photo additions, one tentative. Several titles and shelf locations remain unverified. This is **not a complete inventory**. Close-up compartment photographs are still required to resolve the unreadable spines; follow [the audit notes](books/data/PHOTO-AUDIT.md). Do not treat the tentative title as confirmed. Further verified books can be added through the shared editor interface or imported from JSON.

The initial catalog is stored in `books/data/catalog.json`, outside the public build. The admin seed script uploads it to Firestore and never overwrites an existing book with the same ID. This preserves edits and makes retrying a partially completed import safe.

## Local development

Requires Node.js 22+ and npm. Use Java 21 for Firebase emulator tests.

```sh
npm ci
npm run dev
```

Production configuration is in `books/src/firebase.js`. Firebase web API keys identify the client and are not admin credentials. Access control comes from Firebase Auth and the Firestore rules. Never commit OAuth tokens, service account keys, `.env.local`, or Firebase CLI credentials.

For emulators, run:

```sh
npx firebase emulators:start --only auth,firestore --project demo-manahsmriti
```

In another terminal:

```sh
VITE_USE_EMULATORS=true npm run dev
```

Emulator mode uses the demo project only. It cannot accidentally read or write the production catalog. The OAuth provider widget is fake in emulator mode; production uses the real Google provider.

## Verify

```sh
npm run test:catalog
npm run test:rules
npm run test:emulators
npm run build
```

Browser tests use Playwright with Chromium; install Playwright and set a suitable Chromium executable in `tests/browser.cjs` for your environment if needed. Tests cover auth flows, editor permissions, private data isolation, invalid writes, CRUD, import/export, real-time updates between two browser contexts, responsive layouts, and offline form retention. Tests run against emulators, not live users.

## Deployment

- Project: `manahsmriti`
- Hosting target: `books`
- Hosting site ID: `manahsmriti-books`
- Build output: `books/dist`

Firebase site IDs are globally unique: `books` is the local target name, while the hosted site uses `manahsmriti-books.web.app`. The default `manahsmriti.web.app` site is not replaced by Books deployments.

One-time setup, using an account with Firebase project permissions:

```sh
npx firebase login
npx firebase hosting:sites:create manahsmriti-books --project manahsmriti
```

If the Hosting site already exists in the project, skip the create command. Firestore's `(default)` database must already exist. Enable the Google provider in Firebase Authentication, if necessary. The provisioning script adds the new Hosting domains to the existing authorized domain list, configures the two editor emails, and seeds the initial catalog.

```sh
npm run deploy:books
```

This builds the app, verifies the dedicated Hosting site, provisions editor settings/auth domains and initial data, and deploys **only** the Books Hosting target plus Firestore rules. Unrelated Hosting sites are preserved. Firestore rules are project-wide; before extending this repository with another app, add its explicit collection rules and tests rather than introducing a broad public allow rule. The current rules deny unrelated collections by default.

The admin provisioning script uses the pinned Firebase CLI's authenticated client; credentials stay in memory and in the CLI's own ignored config store. It never prints or writes tokens into the source tree. The Firebase CLI version is pinned by `package-lock.json`.

## Firestore structure

| Path | Read | Write |
| --- | --- | --- |
| `booksShared/{bookId}` | Signed-in users | Verified emails in editor settings |
| `booksUsers/{uid}/books/{bookId}` | Matching signed-in UID | Matching signed-in UID |
| `booksSettings/access` | Signed-in users can get this one document | Admin provisioning only |

A book has `t` (title), `a` (author), `d` (description), `shelf`, `status`, `note`, `added`, and server-managed `createdAt`/`updatedAt`. Rules validate field names, types, lengths, locations and timestamps. Newly added books can be marked “Not shelved yet”.

Only theme preference is kept in browser local storage. Firestore data is held in memory and reloaded after sign-in; the app does not persist private catalogs in local storage or IndexedDB. Signing out clears rendered book data and open forms. Firebase Authentication maintains its own sign-in session.

## Importing old browser edits

On the old site, export the JSON catalog. Sign in on Books, choose the shared catalog as an editor or your private library, then use **Import & export → Import JSON catalog**. Importing updates matching IDs and adds new books while retaining other existing entries. Private and shared imports never cross catalog boundaries. For imports larger than one batch, completed batches remain on a failure and can be safely retried by book ID.
