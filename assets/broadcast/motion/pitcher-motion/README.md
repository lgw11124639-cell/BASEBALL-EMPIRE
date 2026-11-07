# Registered pitching motion

Each club atlas contains 31 frames for each of four arm slots: 124 complete transparent poses. Original keys occupy indices 0, 6, 12, 18, 24 and 30. Release is key 18. The ready/lift/stride/release pivot is registered to the rubber; follow-through/recovery share the landing location. Handedness reflects the entire actor, including glove and feet.

The browser decodes individual 288-square frames from an eight-column atlas and draws them on its fixed 1440 × 1040 backing canvas (720 × 520 logical camera). Only up to three completed club atlases remain in the module cache. Stored game results, pitch endpoints and playback speeds are unchanged by asset synthesis.

Offline generation uses [RIFE ncnn v4.6](https://github.com/nihui/rife-ncnn-vulkan) (MIT). Neither its executable nor neural model is a runtime or shipped dependency. Registered source keys are composited over black and white, interpolated, and recombined into transparent frames. Original key poses are retained. WebP quality is 95 with full alpha. The images are animation frames; this is not a live skeletal 3D simulation.

Use `scripts/build-pitcher-motion.mjs` with `BE_RIFE_BIN`, `BE_RIFE_MODEL` and `BE_POSE_PACKER` pointing to local offline tools. `scripts/validate-pitcher-atlases.mjs` checks all 1,240 frames for complete bodies, clean transparent corners, distinct intermediate images and visible planted shoes. Manifest hashes link each motion atlas to its six source keys and the same ready-batter wardrobe reference used for swing and bunt.
