"""Turn a drawing on a white background into the creature sprite.

    pip install pillow numpy
    python3 scripts/make-sprite.py my-drawing.jpg

Writes assets/creature.png. Draw the creature facing right. If the new image
has a different shape, update aspect-ratio in renderer/style.css (printed
below), and move the two .eyelid patches in renderer/creature.js onto the eyes.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else 'assets/creature.png'

img = Image.open(src).convert('RGB')
whiteness = 765 - np.asarray(img).astype(int).sum(axis=2)  # 0 = pure white
mask = Image.fromarray(np.where(whiteness < 45, 255, 0).astype(np.uint8)).copy()

# Only white that touches the border is background, so white highlights
# inside the drawing (eye glints) stay.
w, h = mask.size
for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if mask.getpixel(corner) == 255:
        ImageDraw.floodfill(mask, corner, 128, thresh=0)
alpha = Image.fromarray(np.where(np.asarray(mask) == 128, 0, 255).astype(np.uint8))
# Shave off the whitish fringe, then soften the edge.
alpha = alpha.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))

out = img.convert('RGBA')
out.putalpha(alpha)
left, top, right, bottom = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
pad = 12
out = out.crop((max(0, left - pad), max(0, top - pad), min(w, right + pad), min(h, bottom + pad)))
height = 360
out = out.resize((round(out.width * height / out.height), height), Image.LANCZOS)
out.save(dst, optimize=True)
print(f'saved {dst}: {out.width}x{out.height} (aspect-ratio: {out.width} / {out.height})')
