# v2.0.37 — shared game UI

Build: `20261101-empire-ui59`. Base: `5f387bf30c90ccba4b877a504c600922cba31f72`.

The visual language of the KPBL office and record room now extends to the clubhouse, roster, news, FA market and national-team screens. A scoped `empire-shell.css` gives the game consistent navy/teal headers, restrained white cards, quieter borders, readable table rows and a six-destination SVG navigation bar. Selected items are distinguished visually and with `aria-current`. Horizontally scrolling menus keep the active option visible after rerenders.

Presentation changes:

- Home: current club rank, season record and funds appear first. The daily/automatic progress controls now precede the calendar, with one clear primary action. The duplicate club-summary block is removed. Displayed rank follows the same win-percentage ordering as the league view; the zero-game state says “개막 전”. Calendar behavior, trusted-click safeguards and save/backup controls are retained.
- Roster: current 1군/2군/육성 registration counts, list/lineup switches and search/filter tools come first. Foreign ownership and replacement history remain in a labelled disclosure after the roster workspace. Existing player rows, filters, sorting, profiles and lineup controls retain their IDs/handlers. Mobile search text is 16px.
- News: compact category/club filters and article-first rows. Article chronology, eligibility and public-news filtering are unchanged.
- FA: shared hero/metrics, clearer player/offer cards and readable small-screen currency layout. Card status is concise; the full existing summary remains in the title and player profile, and the recorded next-review date remains visible. No proposal, salary, contract or negotiation decision changes.
- National team: matching header, schedule/tournament panels, tables and match cards. Existing tournament selection, lineups, replay links and missing-record states remain.
- League/front office: the same shared card/table tones and navigation align with the existing office and milestone designs. The full-screen article reader is retained.

Save schema, legacy save keys, player abilities, signed contracts and simulation rules are unchanged. `bePageHero` reads existing state; no dashboard metric is invented to fill a missing record. Existing simulation preparation/normalization inside the original view functions is not changed.

Validation:

- All 84 regression files pass locally.
- Chromium at 1280/1080/390/320: seven primary/secondary views, daily-control placement, speed selection, roster search/reset/second-team lineup, player profiles, news/club filters and articles, FA cards/empty state, tournament selection/empty state and front-office staff pass without page errors or root overflow.
- Existing office/article and milestone browser suites pass at 1080/390/320 to check compatibility with the shared shell.
- All browser worlds are in-memory fixtures; only cloud boot is replaced. No authenticated cloud writes or user save changes are performed during browser validation.

Reproduce using `node tests/run-all.cjs`, `node tests/browser-shell.cjs`, `node tests/browser-kpbl.cjs` and `node tests/browser-records.cjs` with the local static server on port 8765. Detailed local results are retained in `empire-ui-v2.0.37-validation.json`.
