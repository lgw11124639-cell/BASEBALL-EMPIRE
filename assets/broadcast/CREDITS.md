Original BASEBALL EMPIRE broadcast assets.

Stadiums: procedural Blender renders, no third-party models or textures. Rebuild with scripts/render-broadcast-assets.py.
Batter side stance: original generated illustration with the entire torso, hips and feet rotated into a side-on ready stance, gaze over the front shoulder towards the mound camera, navy helmet and ivory uniform; not a photograph or a named player. Replaces the procedural front-facing toy pose.
Stadium and plate actors use compact alpha-preserving WebP images. The active pitcher uses the user-selected whole-frame PNG sequence.

Catcher and home-plate umpire: original generated front-facing receiving and tracking-ready illustrations, not real people or licensed sports identities. Transparent WebP sprites, no third-party 3D models.

Ten club parks: original procedural Blender architecture, spectator meshes, roofs, scoreboards and materials from scripts/render-club-venues.py. Designs are fictional; field and pitching views share the same club design. Venue definitions are the BE_BROADCAST_VENUES catalog in app.js. Ground projection remains the replay's original 720x520 plane. Only the current park's two WebP views are loaded.

Catcher clear variant: central baked mitt removed from the generated receiving pose so the independent per-pitch lead mitt remains the only displayed mitt through the transparent zone.

Club batter uniforms: ten original generated transparent portraits of the same fictional East Asian adult athlete, with club-specific helmet, jersey, trousers, piping and sleeve emblems. No real athlete, team kit or brand is depicted. Runtime files are uniforms/club-0.webp through club-9.webp, 560×840 with alpha; the neutral batter sprite uses the same East Asian base appearance. Only the batting club's image is displayed, and all ten compressed portraits together are under 1 MiB.

Pitcher: the first original generated 6×4 full-body 3D render sheet explicitly selected by the user (motion/pitcher-complete.png). The original PNG bytes are retained unchanged; its SHA-256 is recorded in motion/pitcher-complete.json. The runtime isolates the transparent export background, applies club fabric colors and displays complete frames in sequence. It never assembles body parts or poses a skinned model. The previously shipped skinned model and Three.js source are retained as archived implementation assets and are not loaded by the broadcast renderer.

Batter swing: original generated fictional East Asian adult athlete, four alpha poses in motion/batter-swing.webp. Material-ID colors are converted to actual club-colored image pixels using Canvas2D, preserving natural skin, bat and gloves. No SVG color filter is needed. The old pitcher sprite atlas remains as source artwork and is no longer used by the runtime.

Active pitcher v2.3.45: thirty-eight original image-generated wardrobe atlases, each containing ten complete poses for all four delivery styles (overhand, three-quarter, sidearm and submarine). The approved neutral reference has a tall, slender, lean build. Club and national wardrobes are baked into source RGB using the same references as the batters; no runtime recoloring or separate limb assembly occurs. Source hashes and generated file identifiers are recorded in motion/pitcher-ten. The older selected source PNG remains archived unchanged. Offline alpha extraction changes transparency only; model weights and preparation dependencies are not distributed with the game.
