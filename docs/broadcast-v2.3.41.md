# Broadcast 2.3.41

The source PNGs already contain foreground coverage. The previous foreground pass replaced it, resurrecting low-alpha gray pixels in enclosed gaps between a forearm, glove and torso. Packaging now intersects the extracted foreground with the original source coverage, suppressing low-coverage exported backdrop noise while retaining opaque uniform fabric. RGB body pixels and complete poses remain unchanged. The same guard covers club pitchers, swing/bunt sheets and national-team boards. `BE_SOURCE_ALPHA` must point to the compiled `scripts/preserve-source-alpha.cpp` helper for packaging cached boards. The foreground extractor also preserves source coverage directly.

Second-base coverage now works on outfield hits and fly balls as well as grounders. The cutoff player and the player receiving the base are separate roles: the left-field cutoff is the shortstop while the second baseman covers second; on right-field plays the second baseman cuts off and the shortstop covers. Recorded throw recipients take precedence. First and third are covered when occupied/advancing runners require them. Existing game results and player records are not modified.

Validation: original forearm/glove transparency regression, 1064 complete pitcher cells, reference hashes and offline asset bytes; ground-ball/force regressions; left- and right-field browser fixtures verify that the cover actually arrives at second base.

The proposed ten-stage form boards are review previews. Rejected wrong-handed/extra-limb generations are not used by the game renderer; the current approved seven-cut renderer remains active until a replacement sequence is verified.

`broadcast-forms.html` presents four ten-stage review boards. Whole figure cells are extracted without recoloring or limb compositing. Stages 2 and 3 share the corrected rightward-coiling reference across all four deliveries, preventing a camera/body reversal between those stages. These review boards do not replace the current in-game renderer.
