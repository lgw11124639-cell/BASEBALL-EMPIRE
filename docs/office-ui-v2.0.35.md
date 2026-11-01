# v2.0.35 — KPBL office and editorial news

Build: `20261101-office-ui57`. Based on `647f3e88d854041db2d07930ed4469ed7edcc079`.

## UI

The league menu now distinguishes the selected destination. The six office panes use a compact tab bar, restrained navy/teal colors, clear type hierarchy, structured cards and progressive disclosure. Mobile menus scroll the selected tab into view; arrow/Home/End keys move office tabs.

- Organization: current president, secretary general and competition chair; biographies, platforms and vote details. Previous terms no longer fill the current-official view.
- Policies: current rules, a seven-step policy indicator and next-season announcements. Empty states distinguish “no announcement” from a missing record.
- Balls: supplier, inspection status, physical coefficients and labelled measurements with g/mm units. Lot identifiers and inspection method remain available in details. Raw JSON is not displayed.
- Association: elected chair, election membership, club representatives and consultations.
- Discipline: pending hearings, confirmed suspensions and completed service are separate summaries; scopes are shown in Korean.
- History: calendar dates, season filter and incrementally displayed timeline. Full underlying records remain intact.

Legacy `minimumSalary` and English competition-scope strings are translated on display. `2043/70` becomes the actual game calendar date, using the saved season start date when available. Government/candidate tiebreak implementation IDs are not used as primary screen content. Existing save keys and simulation rules are unchanged.

## Articles

KPBL public notices now open a dedicated editorial reader: publication masthead, section label, factual headline, subheading, lead, key-fact box, supporting paragraphs and source note. League-wide stories no longer show an arbitrary pair of club logos. Association and policy stories no longer append unrelated player season statistics or long profile-button lists.

The five KPBL article families cover office appointments, policies, ball inspections, association elections/consultations and discipline. Content uses stored facts; it does not fabricate interviews, quotes, vote results or measurements. Policy review is explicitly distinguished from adoption and enforcement.

New notices store a publication-time `kpblRecord` snapshot. Old notices are rendered from matching historical records without rewriting them, and policy steps after the publication date are excluded. If supporting data is unavailable, only the original notice is used. Article rendering does not mutate saves. Escape closes the reader, focus is contained in the dialog, and closing restores focus and body scrolling.

## Validation

- All 83 top-level regression files pass locally, including the new publication-time article checks and all existing engine/save regressions.
- Chromium at 1080/390/320 widths: six panes, four available article categories, profile/record tab, history filtering/pagination, arrow-key tab movement, Escape/focus and root overflow checks pass without page errors.
- Browser fixtures reproduce a 2043 season and older history in memory; cloud boot alone is replaced. No user save or authenticated remote data is changed.
- This release changes presentation and notice metadata; the 1,440-game audit remains in the GitHub Actions release workflow.

Reproduce with `node tests/run-all.cjs` and `node tests/browser-kpbl.cjs` (local static server on port 8765). Detailed results are in `office-ui-v2.0.35-validation.json`.
