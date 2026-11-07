# Broadcast 2.3.40 — authored uniform cuts

The selected orange 6 × 4 reference is preserved in `assets/broadcast/motion/pitcher-solid/reference-pose.png`. The user's gathering board is preserved alongside it as `reference-ready.png`. Each delivery uses one gathering pose followed by the six selected motion cuts. Only one complete image is drawn at full opacity; no RIFE, optical flow, garment masks, color transfer or body-part compositing runs in this version.

Ten club outfits and 27 national outfits plus a neutral international fallback are authored full-body images. National ready, swing and bunt boards use the same country outfit as their pitcher. Both attacking and defending teams resolve their country independently from explicit game metadata or the international opponent. Existing saved events and simulation results are unchanged.

Offline preparation uses U2netp foreground alpha extraction (original RGB retained), whole-figure cropping, integer registration and WebP encoding. Detached captions are excluded. `assemble-rendered-pitcher.mjs` packages the actual generated sheets; `prepare-national-boards.mjs` packages actual generated national poses. Their manifests record the original generated source SHA-256 values. The older 31-frame assets remain for already-open cached clients and are not selected by the current renderer.

The seven-cut sequence holds the planted foot at the rubber during preparation and striding. The landing foot is registered separately through release and follow-through. Left-hand delivery reflects the entire complete frame, with a matching camera and release point. Mobile and desktop use the same logical scene and render backing resolution.

Breaking pitches follow a continuous late-breaking curve that ends at the saved pitch marker. Footer controls use equal action columns, a centered sound control, and an explicitly sized speed picker for WebKit.

Validation includes source/packaging provenance, planted-foot registration, release-point pixels, clear strike zones, handedness, both national-team roles, pause/resume, bunt states and mobile/desktop layout. Pixel checks do not establish anatomical correctness; contact sheets and actual replay screenshots are inspected separately.
