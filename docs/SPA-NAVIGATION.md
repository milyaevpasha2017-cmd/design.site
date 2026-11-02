# Public page navigation

Public pages keep their server-rendered HTML, normal URLs and native links. `navigation.js` progressively intercepts same-origin public page links, fetches HTML and swaps the page with a short View Transition. Unsupported browsers get an immediate swap; failed requests fall back to normal navigation. Reduced-motion preferences disable transitions. No framework or runtime dependency is added.

Every page mount receives an AbortController lifecycle. Global listeners, media query listeners and observers are released before replacing the body, then forms, quiz, menus and motion initialize against the new DOM. Admin, API, external, download and modified-click links are excluded. An active form submission prevents link-driven page replacement.

Navigation updates the title, canonical URL, description, robots, social metadata and structured data. Back/forward restores scroll coordinates held only in memory. Forms and quiz answers are not stored in browser history. Cookie banner state is preserved; new settings buttons are rebound. Virtual page views are sent to the existing Yandex counter only when it is already initialized through analytics consent. Lead goals remain attached to successful API acceptance.

Check normal links, contact anchors, back/forward, repeated menu and quiz visits, cookie settings, reduced motion and native navigation fallback after changing this module. Route boundaries and observer cleanup have automated regression tests.
