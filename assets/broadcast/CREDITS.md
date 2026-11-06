Original BASEBALL EMPIRE broadcast assets.

Stadiums: procedural Blender renders, no third-party models or textures. Rebuild with scripts/render-broadcast-assets.py.
Batter side stance: original generated illustration with the entire torso, hips and feet rotated into a side-on ready stance, gaze over the front shoulder towards the mound camera, navy helmet and ivory uniform; not a photograph or a named player. Replaces the procedural front-facing toy pose.
Only compact alpha-preserving WebP assets are used at runtime. No 3D engine is packaged.

Catcher and home-plate umpire: original generated front-facing receiving and tracking-ready illustrations, not real people or licensed sports identities. Transparent WebP sprites, no third-party 3D models.

Ten club parks: original procedural Blender architecture, spectator meshes, roofs, scoreboards and materials from scripts/render-club-venues.py. Designs are fictional; field and pitching views share the same club design. Venue definitions are the BE_BROADCAST_VENUES catalog in app.js. Ground projection remains the replay's original 720x520 plane. Only the current park's two WebP views are loaded.

Catcher clear variant: central baked mitt removed from the generated receiving pose so the independent per-pitch lead mitt remains the only displayed mitt through the transparent zone.

Club batter uniforms: ten original generated transparent portraits of the same fictional East Asian adult athlete, with club-specific helmet, jersey, trousers, piping and sleeve emblems. No real athlete, team kit or brand is depicted. Runtime files are uniforms/club-0.webp through club-9.webp, 560×840 with alpha; the neutral batter sprite uses the same East Asian base appearance. Only the batting club's image is displayed, and all ten compressed portraits together are under 1 MiB.

Pitching and swing motion: original generated realistic actor sprite atlases in motion/, with a fictional East Asian adult athlete. The canonical pitcher is seen from behind: right pivot leg, closed left-knee lift, left-foot stride, right-arm release and follow-through. All four delivery rows share the same set/lift/stride source; left-handed pitchers mirror the entire actor once. The generated set/lift/stride and release atlases were cropped, alpha cleaned, resized and packed into fixed cells. Body material-ID colors are rendered into the club's jersey, trousers and cap by local SVG material filters; natural skin, glove, bat and shoes remain separate. The game's center-field view places a right-handed pitcher screen-left and a right-handed batter screen-right. No live 3D engine or third-party character model is shipped. motion/manifest.json documents the atlas sequence and anatomical conventions.

Lower-body motion uses one canonical right-handed standing texture and continuous named hip/knee/ankle paths instead of replacing legs between generated pose frames. The right pivot foot stays planted during preparation, the same left leg lifts and strides, and the left landing foot is fixed from the stride through follow-through. Atlas leg pixels are excluded from the torso layer. Pants use continuous shaded cloth silhouettes to avoid cutout seams; the same left/right shoe textures remain attached to their named ankles.
