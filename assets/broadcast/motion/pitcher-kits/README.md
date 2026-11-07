# Club pitching source keys

These are the six full-body wardrobe key poses per arm slot, edited from the approved left-handed reference (`../pitcher-left-approved.png`). Each club's existing ready-batter image in `../../uniforms/club-ID.webp` is the authoritative uniform reference, including shoulder panels, piping, pants and headwear. The back is blank; no fictional player number is baked into the clothes.

The 1536 × 1024 source atlases have six columns and four delivery rows. A whole-cell reflection establishes the right-handed renderer coordinate system; the entire actor is reflected for a left-hander. No limb is cut out or assembled separately. The original first approved right-handed sheet remains at `../pitcher-complete.png`.

Runtime uses the 31-frame-per-delivery atlases in `../pitcher-motion`, rather than these six-key files. `manifest.json` records the original wardrobe source hash, the final source atlas hash, its ready-batter reference hash and shoe/hand registration coordinates.

To regenerate sources, compile `scripts/interpolate-pitcher.cpp` with OpenCV core/imgproc/imgcodecs, set `BE_POSE_PACKER` to that executable, then pass an ordered JSON array of ten source PNG paths to `node scripts/prepare-pitcher-uniforms.mjs`. The approved silhouette guides background removal; partial-alpha image-generation backdrops are not treated as opaque clothing.
