# Site font library

Open “Общие настройки, контакты и навигация” → “Библиотека шрифтов”. Select the main font (body copy, menu, buttons and straight headings) and the accent font (editorial headings and italic accents). The preview changes locally before saving. Expand the catalog to compare all five families. “Вернуть исходное сочетание” selects Manrope + Cormorant Garamond; save to publish that reset.

Saving uses the existing authenticated settings endpoint, revision conflict protection and immediate CMS publication. No content settings migration is required: absent values retain the existing appearance. The wordmark keeps Cormorant Garamond independently of site font preferences. Open pages pick up settings on their next page navigation or reload. Font choices are copied during SPA swaps.

Font IDs are allowlisted on the server and resolved again at rendering. Arbitrary CSS, uploads and remote font URLs are not supported. All fonts include Cyrillic and are self-hosted under SIL OFL; no browser calls to Google Fonts are introduced. Fonts load only when used, except opening the catalog naturally requests all its visible specimens. The main selected font is preloaded, rather than always preloading Manrope.

The shared catalog is `site-worker/src/font-library.json`; the JS and Python renderers, CMS schema, `fonts.css` and asset licensing files must stay in sync. After adding a family, check Cyrillic glyph coverage, weights, licenses and responsive layouts, and run typography/renderer/build tests.
