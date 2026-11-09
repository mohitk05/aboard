#!/usr/bin/env python3
"""
Draw Aboard's logo: "Abo" (from "Aboard") in Redaction 35, so large that the "o" is cut in half by
the square's right edge, on a black background, like space around the game's globe.

Writes web/public/favicon.svg (the master). Then run `node scripts/icons.mjs` to render the PNG
app icons from it.

The letters are real Redaction 35 outlines (a favicon can't load web fonts), taken from the
Google Fonts file, downloaded to .cache/ on first run. Needs fontTools: pip install fonttools.
Usage: python3 scripts/logo.py
"""
import os
import urllib.request

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.environ.get("FONT") or os.path.join(ROOT, ".cache", "redaction35.ttf")
FONT_URL = "https://fonts.gstatic.com/s/redaction35/v1/uk-kEGGrqbEl-mHvw5bcHUCp5w.ttf"
OUT = os.environ.get("OUT") or os.path.join(ROOT, "web", "public", "favicon.svg")

SIZE = 512  # the square, in SVG units
DROP = 30  # how far below centre the letters sit
LEFT = 72  # where the "A" starts
INK = "#f4f1ea"  # warm white, like the station names on the globe


def main():
    if not os.path.exists(FONT):
        os.makedirs(os.path.dirname(FONT), exist_ok=True)
        urllib.request.urlretrieve(FONT_URL, FONT)
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    names = [cmap[ord(c)] for c in "Abo"]
    hmtx = font["hmtx"]

    # Pen positions in font units, then the scale that centres the "o" on the right edge.
    x = 0
    starts = []
    for n in names:
        starts.append(x)
        x += hmtx[n][0]
    o_bounds = font["glyf"][names[2]]
    o_centre = starts[2] + (o_bounds.xMin + o_bounds.xMax) / 2
    a_left = font["glyf"][names[0]].xMin
    k = (SIZE - LEFT) / (o_centre - a_left)

    # Vertically: centre the cap height (the "A" and the "b"'s ascender) in the square.
    cap = font["OS/2"].sCapHeight or font["glyf"][names[0]].yMax
    baseline = SIZE / 2 + cap * k / 2 + DROP

    paths = []
    for n, start in zip(names, starts):
        pen = SVGPathPen(glyphs)
        # Font units (y up) to SVG (y down), scaled and placed.
        glyphs[n].draw(TransformPen(pen, (k, 0, 0, -k, LEFT + (start - a_left) * k, baseline)))
        paths.append(pen.getCommands())

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">
  <title>Aboard</title>
  <rect width="{SIZE}" height="{SIZE}" fill="#000"/>
  <path fill="{INK}" d="{' '.join(paths)}"/>
</svg>
"""
    with open(OUT, "w") as f:
        f.write(svg)
    print(f"wrote {os.path.relpath(OUT, ROOT)} (letters at {k * 1000:.0f}/1000 em)")


if __name__ == "__main__":
    main()
