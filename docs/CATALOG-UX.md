# Catalog browsing

The signed-in catalog uses a compact heading, book count, search, Filters button, view switch, and Add book action (where allowed). Sorting and import/export remain secondary actions. Cards omit descriptions; book details retain them.

Filters open in a dialog, presented as a bottom sheet on phones. Author, shelf, personal reading status, and verification update the matching count immediately. Show books closes the panel. Active choices appear as small removable chips; Clear all resets search and filters. Author links apply an exact normalized author filter.

Desktop starts in table view; phones start in cards. An explicit choice and the 25/50/100 page size are remembered in browser storage. Only the current page is rendered. Switching view preserves filters, sorting, and page. Changing filters/sort resets to page one. Incoming data clamps the page if it disappears. Pagination currently runs on the existing live Firestore snapshot; it reduces rendered rows, not database reads.

Table headings sort title, author, or shelf and toggle direction with accessible aria-sort state. On mobile, author and shelf move below the title and verification remains available in details. Reading status opens a small editor directly from the row; choices remain personal, optional, and independent of shared catalog edits.

The account avatar uses the photoURL from Firebase Google sign-in, with provider data as a fallback. Only HTTPS Googleusercontent URLs are accepted, matching the existing content security policy. Missing or failed photos fall back to initials. No separate Google API call or permissions are required.

The three chosen font families are retained. Controls have compact visual dimensions with mobile actions at least 44px high. View toggles expose pressed state, table uses semantic headers, and pagination reports the visible range.

Once per browser tab session, the first sign-in (including restoring a signed-in session on page load) types one randomly selected original thought in Source Code Pro. The complete thought stays visible for at least three seconds after typing finishes; Skip to my books bypasses the wait. A sessionStorage marker suppresses the welcome on refresh and subsequent sign-ins in that tab. If storage is unavailable, an in-memory marker still avoids repeats until reload. The previous thought is excluded when session storage is available.

Firestore subscriptions start immediately in the background. Reduced-motion mode shows the complete thought for three seconds with no cursor or fade. Screen readers receive one announcement, not a sequence of letters. Focus returns from Skip to the library heading. Sign-out cancels pending animation timers and keeps the library hidden.
