# 2.0.41 · Office-only news tab

Replaced the News “전체” tab with “사무국”. The first/default tab now shows only office notices identified by their saved KPBL flag or KPBL category, including appointments, policies, official balls, the players association and discipline. Older in-memory “all” selections resolve to the office tab. Other articles remain in game, transfer/FA, club and national-team tabs. Office notices no longer also appear as club news. Current-season selection, latest-first order, saved article links and archive deduplication are retained; filtering does not rewrite saved articles.

Validation: all 87 regression files passed, including office-only filtering, other categories, archived deduplication, empty state and saved-data immutability. Chromium checks cover shared views at 1280/1080/390/320 px and office article opening at 1080/390/320 px. The club fixture now supplies an actual club notice because office articles are excluded from that category.
