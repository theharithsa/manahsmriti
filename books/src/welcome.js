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
  let timer, generation = 0;
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
    cancel(); library.hidden = true; screen.hidden = false;
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
    if (motion.matches) { timer = setTimeout(finish, 650); return; }
    const characters = Array.from(thought);
    let index = 0;
    function type() {
      if (current !== generation) return;
      text.textContent = characters.slice(0, ++index).join('');
      timer = setTimeout(index < characters.length ? type : finish,
        index < characters.length ? 28 + Math.random() * 12 : 700);
    }
    timer = setTimeout(type, 120);
  }
  skip.addEventListener('click', finish);
  motion.addEventListener('change', () => { if (!screen.hidden) finish(); });
  return { start, cancel };
}
