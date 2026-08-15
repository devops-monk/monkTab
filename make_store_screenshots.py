#!/usr/bin/env python3
"""
Build Chrome Web Store screenshots for MonkTab.

Takes raw captures from SRC and renders each onto a 1280x800 branded card with a
headline. Nothing is mocked — the captures are the real UI, which the store
requires. Re-run after re-capturing; output is overwritten.

    python3 make_store_screenshots.py
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), 'MonkTabScreenshot')
OUT = os.path.join(HERE, 'store-screenshots')

W, H = 1280, 800                # Chrome Web Store screenshot size
SHOT_W = 1180                   # width of the embedded capture
MARGIN_TOP = 118                # space reserved for the caption

FONT = '/System/Library/Fonts/HelveticaNeue.ttc'
F_BOLD, F_REG, F_MED = 1, 0, 10  # face indices within the .ttc

INK = (235, 237, 243)
DIM = (150, 158, 180)
ACCENT = (167, 139, 250)

# Each slide: source file, headline, supporting line.
# Headlines lead with what the user gets, not the feature name.
# crop is an optional (left, top, right, bottom) box in fractions of the source,
# used to cut dead space so the interesting part fills the frame.
SLIDES = [
    dict(slug='hero', src='Screenshot 2026-08-15 at 01.04.22.png',
         head='Everything that matters, the moment you open a tab',
         sub='Your day, your one goal, and the time everywhere your team is.'),

    dict(slug='focus', src='Screenshot 2026-08-15 at 01.05.44.png',
         head='Deep work is one click away',
         sub='Pomodoro with long breaks, your task front and centre, lo-fi that keeps playing.',
         crop=(0.02, 0.0, 0.70, 0.62)),

    dict(slug='news', src='Screenshot 2026-08-15 at 01.06.21.png',
         head='The whole dev world in one panel',
         sub='Hacker News, AI, framework releases, CVEs and cloud — ten feeds, always current.',
         crop=(0.15, 0.26, 0.85, 1.0)),

    dict(slug='stocks', src='Screenshot 2026-08-15 at 01.06.49.png',
         head='See what the market is actually talking about',
         sub='Reddit buzz, buy signals, earnings and price alerts on the shares you follow.',
         crop=(0.17, 0.28, 0.83, 1.0)),

    dict(slug='weather', src='Screenshot 2026-08-15 at 01.04.37.png',
         head='Weather you will actually read',
         sub='Hourly, air quality, UV and daylight — no API key, no setup, no account.'),
]


def font(size, face=F_REG):
    return ImageFont.truetype(FONT, size, index=face)


def background():
    """Dark base with a soft violet bloom behind the caption."""
    bg = Image.new('RGB', (W, H), (11, 10, 18))
    glow = Image.new('RGB', (W, H), (11, 10, 18))
    g = ImageDraw.Draw(glow)
    g.ellipse([-260, -420, W + 260, 340], fill=(58, 38, 110))
    return Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(150)), 0.85)


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius, fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


def fit(text, f, draw, max_w):
    """Shrink until it fits on one line, so a long headline never wraps oddly."""
    size = f.size
    while size > 20:
        probe = ImageFont.truetype(FONT, size, index=F_BOLD)
        if draw.textlength(text, font=probe) <= max_w:
            return probe
        size -= 2
    return ImageFont.truetype(FONT, 20, index=F_BOLD)


def build(slide, index):
    path = os.path.join(SRC, slide['src'])
    if not os.path.exists(path):
        print(f"  !! missing: {slide['src']}")
        return None
    headline, sub = slide['head'], slide['sub']

    canvas = background()
    draw = ImageDraw.Draw(canvas)

    # Caption
    h_font = fit(headline, font(38, F_BOLD), draw, W - 130)
    draw.text((W // 2, 40), headline, font=h_font, fill=INK, anchor='mt')
    draw.text((W // 2, 84), sub, font=font(17, F_REG), fill=DIM, anchor='mt')

    shot = Image.open(path).convert('RGB')

    if slide.get('crop'):
        l, t, r, b = slide['crop']
        shot = shot.crop((int(l * shot.width), int(t * shot.height),
                          int(r * shot.width), int(b * shot.height)))

    # Fit inside the available box rather than forcing the width, so a cropped
    # slide keeps its proportions instead of being stretched or clipped
    avail_h = H - MARGIN_TOP - 18
    scale = min(SHOT_W / shot.width, avail_h / shot.height)
    sw, sh = round(shot.width * scale), round(shot.height * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)

    card = rounded(shot, 14)
    x = (W - sw) // 2
    y = MARGIN_TOP + (avail_h - sh) // 2

    # Hairline edge so the capture separates from the background
    ImageDraw.Draw(canvas).rounded_rectangle(
        [x - 1, y - 1, x + sw, y + sh], 15, outline=(90, 76, 130), width=1)
    canvas.paste(card, (x, y), card)

    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, f"{index:02d}-{slide['slug']}.png")
    canvas.save(dest, 'PNG', optimize=True)
    return dest


if __name__ == '__main__':
    print(f'source: {SRC}\noutput: {OUT}\n')
    for i, slide in enumerate(SLIDES, start=1):
        out = build(slide, i)
        if out:
            im = Image.open(out)
            kb = os.path.getsize(out) // 1024
            print(f'  {i}. {os.path.basename(out):<20} {im.width}x{im.height}  {kb:>4} KB   "{slide["head"]}"')
