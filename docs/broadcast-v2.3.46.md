# v2.3.46 — preserve pitcher source proportions

The previous renderer used a fixed horizontal scale of 1.1 and a larger per-delivery vertical scale. This visibly narrowed shoulders, hips and legs, even when the extracted whole-body alpha was correct. All poses now use identical horizontal and vertical scales. Each delivery retains one scale through its ten poses, fitted against the complete silhouette of all ten frames so the backswing stays inside the camera and the release hand stays clear of the strike zone. Height stays close to the standing-ready baseline.

No source images, wardrobe colors, alpha masks, anatomy or game outcomes change. The fit script records the isotropic scales in each wardrobe specification and runs after offline atlas packing. A regression assertion checks equal scales for every wardrobe, pose, delivery and hand.

The previous shoe detector discarded the elevated rear or front shoe in the cocking frame when its sole was more than ten pixels above the other shoe. This sometimes registered the landing point directly on the rubber. Cocking, release and recovery frames now measure both shoes with a fifty-pixel vertical allowance, anchors the rear right foot, and registers the left landing shoe through release and recovery. Validation rejects a landing offset under sixty atlas pixels. Cached whole-body alpha is reused; no anatomy is regenerated.

Validation: all 1,520 complete atlas poses, both camera bounds, landing soles and release pixels passed. Eighteen Chromium/WebKit checks passed, including all club poses, exact release, atomic replacement and the four-form wardrobe preview. Eleven node motion and offline-bundle checks passed.
