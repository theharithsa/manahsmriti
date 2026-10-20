// Select-only comboboxes retain native select values and form submission semantics.
const controls = new Map();
let sequence = 0;

function createControl(select) {
  const number = ++sequence;
  const label = select.closest('label');
  const labelText = select.getAttribute('aria-label') || label?.querySelector('.sr-only')?.textContent || label?.firstChild?.textContent?.trim() || 'Choose an option';
  const wrapper = document.createElement('span');
  wrapper.className = 'select-control';
  select.before(wrapper);
  wrapper.append(select);
  select.hidden = true;
  select.tabIndex = -1;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.className = 'select-value';
  trigger.append(value);
  wrapper.prepend(trigger);

  const menu = document.createElement('div');
  menu.id = `select-menu-${number}`;
  menu.className = 'select-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', labelText);
  const supportsPopover = typeof menu.showPopover === 'function';
  if (supportsPopover) menu.setAttribute('popover', 'auto');
  else menu.hidden = true;
  trigger.setAttribute('aria-controls', menu.id);
  wrapper.append(menu);
  let opened = false, active = -1, options = [], typed = '', typeTimer;

  function sync() {
    const current = select.selectedOptions[0];
    value.textContent = current?.textContent || 'Choose an option';
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-label', `${labelText}: ${value.textContent}`);
    for (const [index, option] of options.entries()) {
      menu.children[index]?.setAttribute('aria-selected', String(option.value === select.value));
    }
  }
  function position() {
    if (!opened) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    const bottom = top + (viewport?.height || innerHeight);
    const below = bottom - rect.bottom - 16;
    const above = rect.top - top - 16;
    const opensBelow = below >= Math.min(220, above);
    const height = Math.max(0, Math.min(288, opensBelow ? below : above));
    const width = Math.min(Math.max(rect.width, 210), innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, innerWidth - width - 12));
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${left}px`;
    menu.style.top = opensBelow ? `${rect.bottom + 6}px` : `${Math.max(top + 8, rect.top - Math.min(menu.scrollHeight, height) - 6)}px`;
  }
  function setActive(index) {
    if (!options.length) return;
    active = Math.max(0, Math.min(index, options.length - 1));
    for (const [i, node] of [...menu.children].entries()) node.classList.toggle('is-active', i === active);
    trigger.setAttribute('aria-activedescendant', menu.children[active].id);
    menu.children[active].scrollIntoView({ block: 'nearest' });
  }
  function close() {
    opened = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (supportsPopover && menu.matches(':popover-open')) menu.hidePopover();
    if (!supportsPopover) menu.hidden = true;
    clearTimeout(typeTimer); typed = '';
  }
  function open() {
    if (trigger.disabled || opened) return;
    options = [...select.options].filter(option => !option.disabled && !option.hidden);
    menu.replaceChildren(...options.map((option, index) => {
      const row = document.createElement('div');
      row.id = `select-option-${number}-${index}`;
      row.className = 'select-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.value === select.value));
      row.textContent = option.textContent;
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('pointermove', () => setActive(index));
      row.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); choose(index); });
      return row;
    }));
    opened = true;
    trigger.setAttribute('aria-expanded', 'true');
    if (supportsPopover) menu.showPopover(); else menu.hidden = false;
    position();
    setActive(Math.max(0, options.findIndex(option => option.value === select.value)));
  }
  function choose(index) {
    const option = options[index];
    if (!option) return;
    select.value = option.value;
    close();
    sync();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    trigger.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', event => { event.preventDefault(); opened ? close() : open(); });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasOpen = opened; open();
      if (event.key === 'Home') setActive(0);
      else if (event.key === 'End') setActive(options.length - 1);
      else if (wasOpen) setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); opened ? choose(active) : open(); return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); open();
      typed += event.key.toLocaleLowerCase(); clearTimeout(typeTimer);
      typeTimer = setTimeout(() => typed = '', 700);
      const index = options.findIndex(option => option.textContent.trim().toLocaleLowerCase().startsWith(typed));
      if (index >= 0) setActive(index);
    }
  });
  menu.addEventListener('toggle', event => { if (event.newState === 'closed') close(); });
  document.addEventListener('pointerdown', event => { if (opened && !wrapper.contains(event.target)) close(); });
  trigger.addEventListener('blur', () => { if (opened) close(); });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', event => { if (opened && !menu.contains(event.target)) position(); }, true);
  window.visualViewport?.addEventListener('resize', position);
  select.addEventListener('change', sync);
  select.form?.addEventListener('reset', () => queueMicrotask(sync));
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
  sync();
  return { sync, close };
}

export function initializeSelects() {
  document.querySelectorAll('select').forEach(select => { if (!controls.has(select)) controls.set(select, createControl(select)); });
}
export function syncSelects() { controls.forEach(control => control.sync()); }
export function closeSelects() { controls.forEach(control => control.close()); }
