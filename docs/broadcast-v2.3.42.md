# v2.3.42 — right-handed pitcher on the right

The live replay now places a right-handed pitcher in the foreground on the right and targets the catcher/strike zone diagonally on the left. Left-handed pitchers use the opposite screen arrangement. Anatomical throwing hand, seven authored motion frames and jersey textures are unchanged. No uniform or body mirroring is added for right-handed pitchers.

The actor scale is reduced from 1.2 to 1.0 at the same ground height so the widest sidearm release stays inside the canvas on either side.

The diagonal background, strike-zone position, batter height plane, pitcher rubber registration and measured release point use the same camera arrangement. The ball path still ends at the recorded post-break pitch marker. Simulation outcomes and pitch-location records are unchanged.

The separate ten-pose review (motion74) also fixes a glove rendering defect: the previous rectangular step-number cleanup overwrote the left edge of the glove in the stride pose. Cleanup now follows isolated printed-digit components and rejects components extending into the body. The glove pixel regression compares the complete affected rectangle against the original source image, rather than merely checking that a glove-colored pixel exists.
