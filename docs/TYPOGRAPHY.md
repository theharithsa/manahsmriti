# Typography

The Books interface uses **Roboto**, the typeface specified by Google's Material 3 baseline type system and available on Google Fonts. The variable font files are bundled locally using `@fontsource-variable/roboto`, preserving their OFL license. The app does not depend on runtime font requests to Google.

Official sources consulted:

- [Material 3 typography overview](https://m3.material.io/styles/typography/overview)
- [Material 3 type-scale tokens](https://m3.material.io/styles/typography/type-scale-tokens)
- [Google's Material Web reference typeface tokens](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-ref-typeface.scss), which specify Roboto for both brand and plain typefaces
- [Google's Material Web type-scale tokens](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-typescale.scss)
- [Roboto on Google Fonts](https://fonts.google.com/specimen/Roboto)
- [Google Fonts Roboto metadata and license](https://github.com/google/fonts/tree/main/ofl/roboto)

| Use | Size / line height | Weight |
| --- | --- | --- |
| Desktop display | 57 / 64 px | 400 |
| Tablet display | 44 / 52 px | 400 |
| Phone display | 36 / 44 px | 400 |
| Large headline | 32 / 40 px | 400 |
| Card title / dialog title | 22 / 28 px | 400 |
| Body | 16 / 24 px | 400 |
| Secondary body | 14 / 20 px | 400 |
| Button / label | 14 / 20 px | 500 |

Display text uses -0.25 px letter spacing. Body and title text use a restrained hierarchy, with spacing and weight carrying the design. Book cards have no decorative book icons or pretend covers.
