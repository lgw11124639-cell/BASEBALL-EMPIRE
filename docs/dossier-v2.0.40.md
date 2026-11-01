# 2.0.40 · No automatic vertical scroll on profile tab changes

The tab helper previously scrolled the panel to its content on every click. It now only keeps the selected tab visible horizontally. Scroll anchoring is disabled on the panel to prevent automatic movement when swapping content. The fixed dialog height from 2.0.39 is retained.

Chromium at 1080/390/320 px verifies all five tabs, stable dialog size and position, and three repeated rounds of tab switching at both 0 and 100 px panel scroll offsets. Panel and underlying page scroll positions remain unchanged. Keyboard navigation, lazy record rendering and nested article/profile closing also passed. Release smoke, player history rendering and contract checks passed.
