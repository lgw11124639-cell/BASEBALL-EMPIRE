# Form motion review

`broadcast-forms.html` now includes a player for all four ten-stage form boards. It renders one complete photograph at full opacity, with longer holds for preparation/lift and faster release/follow-through timing. It never crossfades or synthesizes extra limbs. Previous/next, pause/resume, a ten-step slider and 1×/2×/3× playback are available. Starting a form pauses other players; hiding the tab pauses playback.

The first five stages are registered to the right support shoe; release and later stages register to the planted left stride shoe. Shoe landmarks are extracted once from the studio photographs. Extending the empty studio backdrop avoids moving rectangular image boundaries, while the small printed step-number corner is replaced by its surrounding studio gradient. Player/body pixels are not recolored or composited from separate parts.

Submarine stages 4 and 5 are new complete rendered poses: forward torso lowering begins during hand separation, then deepens at stride plant before the low release. The previously generated stance-swapped stage 5 is excluded. Numbered form-specific lift poses keep jersey printing consistent during playback.

`scripts/export-form-review.mjs` captures this exact canvas player to MP4/GIF previews and exports the static review boards. It requires the local preview server plus Playwright, ffmpeg and ImageMagick. All generated source originals remain in `/workspace/generated_images`; the shipped review assets are encoded copies. This preview does not replace the in-game renderer.

Validation: Chromium and WebKit playback/pause/stepping, one active player at a time, support-shoe pixels across all forty poses, full figure bounds, mobile overflow, and standalone video decoding/duration.
