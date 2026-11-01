# v2.0.36 — distinct game milestones and full-screen articles

Build: `20261101-records58`. Base: `3da80e7d4accbbbe2168a8bb63af9d62629684e4`.

The history → milestones pane now has three separate selectable summaries: 사이클링 히트, 노히트 노런 and 퍼펙트게임. A season selector, newest-first cards, record-room ordinals and pagination make long archives manageable. Cards show the recorded player/club, opponent, actual calendar date, score and type-specific facts when available. Current-season cards link to the original game article and player profile. Missing archived game details remain labelled as unrecorded.

The archive and milestone news now use the same pure detector:

- Cycle: at least one single, double, triple and home run in the same game, confirmed by batting counters.
- Individual no-hitter: one pitcher, at least 27 defensive outs, a completed shutout victory, and explicit zero-hit evidence. A missing opponent box is never treated as zero hits. Combined efforts and shortened games do not qualify under the existing individual-record scope.
- Perfect game: no-hitter conditions plus proof of no baserunners. Batters faced must equal outs; walks, hit-by-pitch and fielding errors are checked, as are recorded baserunners and extra-inning automatic runners. An explicit saved perfect-game flag may confirm a record only when it does not contradict available evidence. Missing proof is never guessed into a perfect game.

Perfect games are counted separately from no-hitters. Legacy milestone rows remain intact; known spelling variants are normalized only in the view. Live box scores take precedence over duplicate/current-year archived classifications and can identify a previously unlabelled perfect game. Distinct game IDs/doubleheader numbers are preserved. Displayed ordinals count retained records, not presumed missing league history. Clubs and dates use the recorded season rather than the current player assignment/calendar. Previously published news is not rewritten.

The KPBL news reader now matches the other article screens: full-viewport white surface, no inset card/gray backdrop, common reading-column width, larger headlines/body text and a persistent close header. Factual content and publication-time snapshots from v2.0.35 remain unchanged.

Validation:

- 84 top-level regression files pass, including new adversarial milestone classification/archive/news tests.
- Actual 720-game production-engine regression passes; full two-season audit remains in GitHub Actions.
- Chromium at 1080/390/320: all three record filters, season filtering, profiles, original-game articles and empty states pass without page errors or body overflow.
- The office/article browser suite additionally checks the article sheet starts at x=0 and spans the viewport, and body paragraphs are at least 15px.
- Browser fixtures use in-memory games and archived records, replacing only cloud boot; no user saved world is accessed or changed.
