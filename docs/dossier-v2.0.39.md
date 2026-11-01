# 2.0.39 · Stable player detail size

The desktop player panel used automatic height, so selecting shorter contract or medical content reduced its height and recentered the window. The panel now keeps the available viewport height while its contents scroll. The mobile full-screen layout remains viewport-sized.

Chromium checks at 1080, 390 and 320 px assert unchanged panel height and vertical position across all five tabs, including contracts and health/injuries, along with keyboard navigation and nested article/profile closing. Release syntax and version consistency checks passed. See `dossier-v2.0.39-validation.json`.
