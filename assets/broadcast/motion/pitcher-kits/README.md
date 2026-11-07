# Pitching uniform images

Ten wardrobe edits of the user-approved left-handed sheet (`../pitcher-left-approved.png`). Each 1536 × 1024 atlas contains four arm slots and six complete poses in chronological order. The body is never separated into limbs. The original approved right-handed reference remains at `../pitcher-complete.png`.

Files are lossless WebP, with their clothing already rendered into every pose. Runtime does not recolor the pitcher. Each cell was reflected in place to establish the renderer's right-handed coordinate convention; the entire actor is reflected back for left-handed pitchers. Column order never changes. The renderer decodes individual pose images to avoid Safari cropped-atlas artifacts.

`manifest.json` records each wardrobe source digest, final atlas digest, shoe registration points, release pivot and throwing-hand position. The pivot remains at the pitching rubber through release; follow-through and recovery share the same landing point. The complete pose sequence is discrete, not continuous skeletal animation. The rendered back number is part of the model artwork, not a player's statistical record.

To package regenerated wardrobe sources, pass an ordered JSON array of ten local PNG paths to `node scripts/prepare-pitcher-uniforms.mjs`. Preserve original image-generation outputs outside this directory. The script removes only the partial-alpha backdrop, reflects individual cells, finds registration points and encodes lossless assets.
