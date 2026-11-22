"""Regenerate src/app/opengraph-image.png — the card people see when the site
is shared in WhatsApp, X or anywhere else that reads Open Graph tags.

Run it from the frontend directory:

    pip install pillow
    python3 scripts/make-og-image.py

WHY A CHECKED-IN PNG AND NOT next/og
------------------------------------
Generating this card at build time with `next/og` was tried and abandoned.
satori, which backs it, cannot read this repo's variable Noto Kufi font, cannot
apply the lookup types Arabic joining needs, and lays words left to right, so
the Arabic came out unjoined and in reverse word order. A static PNG also means
the build can never fail on this file.

WHAT MAKES THE ARABIC CORRECT HERE
----------------------------------
The text is drawn raw with direction="rtl". Pillow hands it to Raqm, which
shapes it with HarfBuzz and reorders it with FriBiDi — real OpenType shaping.
Noto Kufi carries no legacy presentation forms, so joining has to come from
that path; pre-reshaping the string instead (arabic_reshaper) produces
disconnected letters with this font.

Pillow must therefore be built with Raqm. Check before trusting the output:

    python3 -c "from PIL import features; print(features.check('raqm'))"
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, features

W, H = 1200, 630
CREAM = (248, 245, 238)
INK = (26, 26, 51)
GOLD = (193, 155, 74)
MUTED = (108, 108, 128)
RING = (228, 219, 200)

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "src/app/fonts/NotoKufiArabic/NotoKufiArabic-Variable.ttf"
LOGO = ROOT / "public/brand/logo/akwaan-primary-logo-transparent.png"
OUT = ROOT / "src/app/opengraph-image.png"

TITLE = "لعبة جماعية لعوالم وتحديات"
SUB = "شاشة وحدة للكل، وكل واحد يشارك من جواله"

if not features.check("raqm"):
    raise SystemExit(
        "Pillow has no Raqm support, so Arabic would render unjoined.\n"
        "Install a Pillow wheel built with Raqm (libraqm + harfbuzz + fribidi) "
        "and run this again."
    )


def centred(draw: ImageDraw.ImageDraw, text: str, font, y: int, fill) -> None:
    left, _, right, _ = draw.textbbox((0, 0), text, font=font, direction="rtl", language="ar")
    draw.text(
        ((W - (right - left)) / 2 - left, y),
        text,
        font=font,
        fill=fill,
        direction="rtl",
        language="ar",
    )


canvas = Image.new("RGB", (W, H), CREAM)
draw = ImageDraw.Draw(canvas)

for radius, width in ((430, 2), (330, 1)):
    draw.ellipse(
        (W / 2 - radius, H / 2 - radius, W / 2 + radius, H / 2 + radius),
        outline=RING,
        width=width,
    )

logo = Image.open(LOGO).convert("RGBA")
target_w = 400
logo = logo.resize((target_w, round(logo.height * target_w / logo.width)), Image.LANCZOS)
canvas.paste(logo, ((W - logo.width) // 2, 96), logo)

centred(draw, TITLE, ImageFont.truetype(str(FONT), 60), 336, INK)
centred(draw, SUB, ImageFont.truetype(str(FONT), 32), 446, MUTED)

draw.line((W / 2 - 60, 544, W / 2 + 60, 544), fill=GOLD, width=3)

canvas.save(OUT, optimize=True)
print(f"wrote {OUT.relative_to(ROOT)} ({W}x{H})")
