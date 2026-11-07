# v2.3.45 — all four forms, ten authored poses and baked wardrobes

The live game now uses ten complete poses per delivery for overhand, three-quarter, sidearm and submarine, in all ten club and twenty-eight national uniforms. Each wardrobe is image-generated from the approved tall slender lean reference and the matching batter's kit. The original seven-frame atlases remain preserved, but the live renderer reads pitcher-ten/manifest.json.

The final neutral source is generated_images/exec-683823d7-411a-4ce1-b8e8-2edd697b2ab7.png. It includes the corrected overhand early lifts, fixed right support leg/left lift, and the deeper submarine torso bend and backswing. Each output records its source and uniform reference hashes. No runtime recoloring, joint warping, mirroring of isolated limbs, crossfades, or motion interpolation occurs. Left-handed pitchers mirror the entire body and rubber together.

Each form keeps a single scale through all ten poses. A shoe-based translation registers the right support foot before release and the forward left landing shoe afterwards. Release phase 3 still controls the visual ball launch; only its source image index changes to 6. The skin-pixel release coordinates are measured independently for every form and uniform. No game event, pitch result or simulation logic changes.

The rubber is rendered on the same world plane below the player in every frame, including the standing-ready pose. Atomic pixel replacement removes the previous frame's transparent regions.

Generated atlas spacing is measured from whitespace, not assumed to have exact grid boundaries. Complete figures are extracted and passed to foreground segmentation using a close whole-body crop so pale trousers and shoes are retained. Packaging rejects clipped bodies, missing support shoes and missing release hands. Validation checks all 1,520 poses, distinctness, transparent borders, feet and release pixels.

broadcast-uniforms.html uses the actual game renderer and offers all uniforms, both hands, all four forms and the ten-step timeline. The earlier static form-review page remains archived separately.

Validation: 26 Chromium/WebKit camera, frame replacement, wardrobe, rubber, zone and label checks; two exact-release browser checks; ten offline bundle checks; node motion/uniform checks; all 1,520 atlas poses and source shoe masks passed.
