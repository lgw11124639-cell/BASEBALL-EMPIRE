# Native-transparent sixty-cut pitcher review

The rejected continuous MakeHuman model experiment is not shipped. The requested purple-uniform character remains rendered imagery. Three new native-alpha image boards provide sixty distinct complete poses, played over two seconds (30 unique poses per second) in broadcast-sixty.html. Controls include pause/resume, per-cut stepping, slower playback, whole-actor handedness reflection, and a transparent-background check. The live game's four-delivery wardrobe renderer remains separate from this review.

All three generated source PNGs are preserved byte for byte with SHA256 provenance in assets/broadcast/motion/pitcher-sixty/manifest.json. Packaging uses the supplied alpha, with no background extraction, matte model, recoloring, isolated limb assembly or crossfade. Alpha thresholds locate bounds and shoes only; they do not replace the native source alpha. Entire figures receive one isotropic scale per source board, with two boundary scale registrations to avoid an apparent size jump. Native whole-image material and anatomy are retained.

The right pivot shoe registers before the left foot plants. From pose33, the left landing sole registers at a fixed point, including when the right leg crosses forward and becomes the rightmost shoe. Every displayed frame replaces every canvas pixel atomically. The canvas remains720x520 to avoid reading back a high-DPI full-scene buffer thirty times a second on mobile.

Validation: sixty decoded poses are distinct; source hashes, opaque body bounds, constant board scales and registered soles pass. Chromium and WebKit each pass complete-pose, no-ghost, handedness and playback-control tests. Packaging tests verify byte-identical source boards and playback files.
