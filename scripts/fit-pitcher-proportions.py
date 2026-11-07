"""Use one isotropic scale per delivery, fitting every complete pose on screen."""
import json
from pathlib import Path
from PIL import Image
root = Path('assets/broadcast/motion/pitcher-ten')
manifest = json.loads((root / 'manifest.json').read_text())
for spec in manifest['clubs'] + list(manifest['nations'].values()):
    image = Image.open(spec['path'])
    scales = []
    for row in range(4):
        scale = spec['renderScaleYByDelivery'][row]
        for frame in range(10):
            tile = image.crop((frame*384, row*384, (frame+1)*384, (row+1)*384))
            bounds = tile.getchannel('A').point(lambda alpha: 255 if alpha > 32 else 0).getbbox()
            left, _, right, _ = bounds
            # Both camera hands: preserve the rear arm and keep the front hand before the zone.
            if left < 144:
                scale = min(scale, (156-6)/(144-left))
            if right > 144:
                scale = min(scale, (420-160)/(right-144))
        scales.append(scale)
    spec['renderScaleByDelivery'] = scales
    (root / 'specs' / (str(spec['id'])+'.json')).write_text(json.dumps(spec, indent=2)+'\n')
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Fit 38 wardrobes with equal horizontal and vertical scales; no image or alpha changes')
