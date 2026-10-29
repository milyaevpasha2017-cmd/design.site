#!/usr/bin/env python3
"""Regenerate the bundled illustration variants; optional Pillow, not needed by builds."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
with Image.open(root / 'assets/living.png') as image:
    if image.size != (1536, 1024):
        raise ValueError('Update intrinsic image sizes in both renderers for a different source size.')
    for width in (480, 960, 1536):
        resized = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        target = root / f'assets/living-{width}.webp'
        resized.save(target, 'WEBP', quality=84, method=6)
        print(f'{target.name}: {target.stat().st_size:,} bytes')
