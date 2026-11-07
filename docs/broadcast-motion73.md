# Motion 73: leg lowering in the submarine review

This changes the separate broadcast-forms.html review, not the seven-cut in-game pitcher renderer or simulation results.

The submarine sequence now has ten distinct poses: ready, initial lift, maximum lift, lead-leg lowering/initial forward shift, stride and hand separation while lowering the trunk, left-foot landing, low release, follow-through, deceleration, recovery. The redundant early follow-through pose is omitted from this sequence. Original source frames remain available. The newly authored fourth pose retains jersey 18, a red anatomical left-knee marker, a blue right-wrist marker, and the original rear camera.

Support registration uses the lowest shoe during the lift and lowering stages. The right pivot remains registered through left-foot landing; subsequent poses register to the left landing shoe. The landing reference moves to submarine pose six and release to pose seven, rather than reusing the old phase indices. Full photographs are switched without alpha blending or generated intermediate limbs.

References consulted:

- https://www.sidearmnation.com/interviews/shunsuke-watanabe — Watanabe identifies release timing and body balance as priorities; not a detailed frame-by-frame prescription.
- https://4years.asahi.com/article/15251401 — describes trunk inclination during takeback, loading, then sinking into a low release, and explicitly contrasts different submarine pitchers. This supports a progressive lowering motion rather than changing only the arm angle. No claim that every submarine pitcher uses identical timing.
- https://www.soxprospects.com/players/watanabe-shunsuke.htm — documents Watanabe's very low delivery and rear-knee flexion.
- https://pmc.ncbi.nlm.nih.gov/articles/PMC9950989/ — general pitching phase definitions: maximum knee height through foot contact is the stride phase. General reference, not a submarine-specific model.
- https://www.youtube.com/watch?v=4CFCINdp2Bk — located reference footage of Watanabe's delivery. Automated video retrieval was throttled; no claim of a measured frame-by-frame video match.

The review is an authored animation study informed by those references, not motion capture of Watanabe.
