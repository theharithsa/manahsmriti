# Typography

The interface uses the user's selected Google Fonts families, bundled locally with their SIL Open Font Licenses. No runtime Google Fonts requests are required.

| Role | Family | Weight | Size / line height |
| --- | --- | --- | --- |
| Book titles on cards | Caveat | SemiBold (600) | 28 / 32 px |
| Book title in details | Caveat | SemiBold (600) | 36 / 42 px |
| H1 on desktop | Source Code Pro | Regular (400) | 57 / 64 px |
| H1 on tablet | Source Code Pro | Regular (400) | 44 / 52 px |
| H1 on phone | Source Code Pro | Regular (400) | 36 / 44 px |
| Body, controls, other headings and labels | Ancizar Serif (UNAL) | Regular (400) / Medium (500) | Existing responsive hierarchy |

Only actual H1 headings use Source Code Pro. Decorative panel text, author names, descriptions, navigation, dialogs, and form controls use Ancizar Serif. Book-title overrides apply to cards and the detail dialog at every viewport size.

Sources:

- [Caveat on Google Fonts](https://fonts.google.com/specimen/Caveat)
- [Ancizar Serif on Google Fonts](https://fonts.google.com/specimen/Ancizar+Serif)
- [Source Code Pro on Google Fonts](https://fonts.google.com/specimen/Source+Code+Pro)
- [Font licenses bundled with the site](../books/public/font-licenses/)

The layout retains its Material-inspired type sizes and component spacing. These custom font choices replace the earlier Roboto baseline at the user's request.

## Forms and controls

All text fields, textareas, select triggers, menus, and option text explicitly use Ancizar Serif at 16 px. They share surface colors, border radii, focus rings, validation styling, and light/dark theme tokens. Book display titles and H1 headings retain their dedicated font families.

Select controls use a keyboard-accessible select-only combobox with themed listbox options, while preserving the underlying native select values for form submission. Arrow keys, Home/End, type-ahead, Enter, Escape, and Tab are supported. Menus render above modal dialogs and stay inside the viewport. Browser-default import confirmation and form validation bubbles are replaced by in-app dialogs and inline validation messages.
