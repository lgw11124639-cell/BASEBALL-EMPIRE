# v2.3.43 — restore the original pitcher camera, reduce the plate group

The user rejected the newly generated opposite-facing pitcher sheets and asked to retain the original animation with the right-handed pitcher on screen left. No newly generated pitcher poses or uniforms are included in this release. Right-handers use the original left foreground rubber and throw diagonally toward the right plate; left-handers use the opposing camera. Existing anatomical handedness, uniform atlases and simulation records remain unchanged.

The catcher, umpire, plate and batting boxes are re-rendered smaller within each integrated stadium background. The strike zone shrinks from 20% to 15% of scene width and from 24.615385% to 18.461538% of scene height. The batter follows that smaller measured zone plane. Zone placement and batter ground heights are aligned to the newly rendered plate groups; foreground rubbers keep their locations. Original foreground pitcher scale/foot registration is restored.

Pitcher frames are now rendered into a cleared offscreen surface and copied to the visible canvas with `putImageData`. Transparent pixels replace previous pixels as part of that operation. Both drawing surfaces use a CPU readback context to avoid first-draw/readback rounding changes on WebKit. No opacity transitions or animated canvas filters are allowed. This also avoids resetting the visible canvas dimensions during every pose change. A browser regression inserts stray pixels, changes poses, and checks both complete erasure of the stray pixels and an exact match against a fresh rendering of the target pose.

New backgrounds: generated_images/exec-87795d1d-47ba-4af0-8d08-9ce8143c877a.png (plate right) and exec-c9d4d919-9ac3-46e2-8a38-77355266a8e4.png (plate left). No rejected opposite-facing pitcher sheet is shipped.

Batter poses now register to measured batting-box shoe bounds, rather than the zone edge. A single full-scene batter canvas replaces CSS offsets of ready/swing/bunt layers. Complete authored poses are preserved; footwear bounds and the ground line determine translation and scale. Mirror projection follows batting hand. The ready, swing and bunt poses stay within the chalk box for either pitcher camera.

The batter uses one scale across the four poses in a motion, chosen from the widest shoe span, so changing poses does not change body size. Both teams' swing and bunt images are decoded before replay controls are enabled.
