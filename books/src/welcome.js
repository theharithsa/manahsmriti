// A brief welcome while Firestore opens in the background. Never gates data loading.
const thoughts = [
  'Your next rabbit hole is on a shelf.',
  'A little curiosity. A whole new chapter.',
  'Open a book. Leave a little wiser.',
  'Somewhere here, an idea is waiting.',
  'One more page? Famous last words.',
  'Good ideas like good company.',
  'A small shelf. A very big universe.',
  'Plot twist: the next adventure is here.',
];

export function createWelcome({ screen, text, announcement, library, skip, heading }) {
  let timer, generation = 0, shownThisSession = false;
  const sessionKey = 'books-welcome-seen';
  const readingDelay = 3000;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function cancel() {
    ++generation; clearTimeout(timer); screen.hidden = true;
    library.classList.remove('library-arrive');
  }
  function finish() {
    const moveFocus = screen.contains(document.activeElement);
    cancel(); library.hidden = false;
    if (!motion.matches) library.classList.add('library-arrive');
    if (moveFocus) heading.focus({ preventScroll: true });
  }
  function start() {
    cancel();
    let seen = shownThisSession;
    try { seen ||= sessionStorage.getItem(sessionKey) === 'true'; } catch { /* Use memory when storage is unavailable. */ }
    if (seen) { library.hidden = false; return; }
    shownThisSession = true;
    try { sessionStorage.setItem(sessionKey, 'true'); } catch { /* Keep the in-memory marker. */ }
    library.hidden = true; screen.hidden = false;
    let previous;
    try { previous = sessionStorage.getItem('books-last-thought'); } catch { /* Optional storage. */ }
    const choices = thoughts.filter(thought => thought !== previous);
    const thought = choices[Math.floor(Math.random() * choices.length)];
    try { sessionStorage.setItem('books-last-thought', thought); } catch { /* Optional storage. */ }
    // Screen readers hear the whole thought once, rather than each typed character.
    announcement.textContent = thought;
    text.textContent = motion.matches ? thought : '';
    screen.classList.toggle('static-welcome', motion.matches);
    skip.focus({ preventScroll: true });
    const current = generation;
    if (motion.matches) { timer = setTimeout(finish, readingDelay); return; }
    const characters = Array.from(thought);
    let index = 0;
    function type() {
      if (current !== generation) return;
      text.textContent = characters.slice(0, ++index).join('');
      timer = setTimeout(index < characters.length ? type : finish,
        index < characters.length ? 28 + Math.random() * 12 : readingDelay);
    }
    timer = setTimeout(type, 120);
  }
  skip.addEventListener('click', finish);
  motion.addEventListener('change', () => {
    if (screen.hidden) return;
    ++generation; clearTimeout(timer);
    text.textContent = announcement.textContent;
    screen.classList.toggle('static-welcome', motion.matches);
    timer = setTimeout(finish, readingDelay);
  });
  return { start, cancel };
}
