"""
Generates LGSS Manager logo (icon.ico + icon.png) — SCUM-themed.

Design: chunky grunge stencil 'S' (inspired by SCUM's own apocalyptic
typography), filled with a vibrant multi-hue gradient (red → orange → gold →
cyan → violet). Background is near-black with a subtle tech grid so the
colorful S really pops. Adds grit via ink splatter, torn edges, and noise.

Run:
    python3 scripts/make_icon.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import random

OUT_DIR = Path(__file__).resolve().parent.parent / "electron" / "installer"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Colors
BG_DEEP = (10, 10, 14, 255)       # near-black with slight blue bias
BG_GRID = (35, 38, 48, 120)       # faint tech grid
ACCENT_ORANGE = (255, 132, 12)    # LGSS brand orange

# Supersample factor — draw big, then downscale for cleaner edges
SS = 3

SIZES = [256, 128, 64, 48, 32, 16]


# --------------------------------------------------------------------------- #
#  Background tile                                                            #
# --------------------------------------------------------------------------- #
def draw_bg(size: int) -> Image.Image:
    """Rounded-corner dark tile with a subtle technical grid."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(1, size // 48)
    r = max(3, size // 10)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=BG_DEEP)

    # Tech grid (only at mid+large sizes so 16/32 don't look noisy)
    if size >= 64:
        step = max(4, size // 18)
        for x in range(pad, size - pad, step):
            d.line([(x, pad + 2), (x, size - pad - 2)], fill=BG_GRID, width=1)
        for y in range(pad, size - pad, step):
            d.line([(pad + 2, y), (size - pad - 2, y)], fill=BG_GRID, width=1)

    # Single-pixel brand-orange accent bar at the bottom (military command HUD vibe)
    if size >= 48:
        bar_h = max(2, size // 40)
        d.rectangle(
            [size * 0.18, size - pad - bar_h - max(2, size // 80),
             size * 0.82, size - pad - max(2, size // 80)],
            fill=ACCENT_ORANGE,
        )
    return img


# --------------------------------------------------------------------------- #
#  Rainbow gradient                                                           #
# --------------------------------------------------------------------------- #
def make_gradient(size: int) -> Image.Image:
    """Diagonal multi-hue gradient used to color the stencil S.

    Sweeps through a fixed sequence of saturated hues so the result stays
    recognizably 'colorful' at 16×16 without muddying into gray.
    """
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    px = grad.load()
    stops = [
        (0.00, (255, 55, 90)),    # hot pink-red
        (0.20, (255, 132, 12)),   # LGSS orange
        (0.40, (255, 220, 60)),   # gold
        (0.60, (52, 220, 140)),   # emerald
        (0.80, (0, 201, 255)),    # cyan (brand info)
        (1.00, (180, 90, 255)),   # violet
    ]
    for y in range(size):
        for x in range(size):
            # Diagonal parameter (0..1)
            t = (x + y) / (2 * (size - 1)) if size > 1 else 0
            # Find segment
            for i in range(len(stops) - 1):
                a, ca = stops[i]
                b, cb = stops[i + 1]
                if a <= t <= b:
                    f = (t - a) / (b - a) if b != a else 0
                    r = int(ca[0] + (cb[0] - ca[0]) * f)
                    g = int(ca[1] + (cb[1] - ca[1]) * f)
                    bch = int(ca[2] + (cb[2] - ca[2]) * f)
                    px[x, y] = (r, g, bch, 255)
                    break
    return grad


# --------------------------------------------------------------------------- #
#  Chunky grunge S mask                                                       #
# --------------------------------------------------------------------------- #
def make_s_mask(size: int) -> Image.Image:
    """Return an L-mode mask where the chunky S is white (255) and rest is 0.

    Drawn with a bold font then eroded with random ink-splatter cutouts so the
    S feels stenciled, not digital-clean. Works at any size — scales via SS.
    """
    work = size * SS
    mask = Image.new("L", (work, work), 0)
    md = ImageDraw.Draw(mask)

    # Pick the boldest font available; fall back gracefully
    font = None
    for name, scale in [
        ("Impact.ttf", 0.95),
        ("DejaVuSans-Bold.ttf", 0.92),
        ("LiberationSans-Bold.ttf", 0.92),
        ("Arial Bold.ttf", 0.95),
    ]:
        try:
            font = ImageFont.truetype(name, int(work * scale))
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    bbox = md.textbbox((0, 0), "S", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    sx = (work - tw) / 2 - bbox[0]
    sy = (work - th) / 2 - bbox[1]

    md.text((sx, sy), "S", fill=255, font=font)

    # Tiny ink-splatter holes INSIDE the S — enough for grunge texture, not
    # so many that the letter loses shape. Keep the S clearly readable.
    rng = random.Random(1337)
    max_hole_r = max(3, work // 90)
    for _ in range(int(work * work * 0.00012)):
        cx = rng.randint(int(work * 0.18), int(work * 0.82))
        cy = rng.randint(int(work * 0.18), int(work * 0.82))
        r = rng.randint(max(2, work // 240), max_hole_r)
        if mask.getpixel((cx, cy)) > 128:
            md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)

    # A few isolated "bite" marks on the S edges for extra grit
    for _ in range(int(work * 0.004)):
        # Pick a random edge-adjacent pixel on the mask
        cx = rng.randint(int(work * 0.08), int(work * 0.92))
        cy = rng.randint(int(work * 0.12), int(work * 0.88))
        if mask.getpixel((cx, cy)) > 100:
            # Check one neighbor outside — if so, cx/cy is near an edge
            for dx, dy in [(-8, 0), (8, 0), (0, -8), (0, 8)]:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < work and 0 <= ny < work and mask.getpixel((nx, ny)) < 50:
                    r = rng.randint(max(3, work // 120), max(6, work // 60))
                    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
                    break

    # Micro-splatter DOTS outside the S (ink flecks around the letter) — small,
    # sparse, so they read as flecks not noise.
    for _ in range(int(work * work * 0.00015)):
        cx = rng.randint(int(work * 0.05), int(work * 0.95))
        cy = rng.randint(int(work * 0.05), int(work * 0.95))
        r = rng.randint(max(1, work // 300), max(2, work // 140))
        if mask.getpixel((cx, cy)) < 40:
            md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=220)

    # Gentle smoothing — no MinFilter (that erodes too aggressively at small sizes)
    mask = mask.filter(ImageFilter.SMOOTH)

    # Downsample to final size (antialiased mask)
    mask = mask.resize((size, size), Image.LANCZOS)
    return mask


# --------------------------------------------------------------------------- #
#  Compose final logo                                                         #
# --------------------------------------------------------------------------- #
def draw_logo(size: int) -> Image.Image:
    img = draw_bg(size)

    # Rainbow-filled S on top of the bg
    gradient = make_gradient(size)
    s_mask = make_s_mask(size)

    # Apply mask onto gradient: keeps colorful pixels only where S is
    colored_s = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    colored_s.paste(gradient, (0, 0), mask=s_mask)

    # Add a subtle black drop-shadow behind the S for readability against grid
    if size >= 48:
        shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 130), (0, 0), mask=s_mask)
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size // 60)))
        off = max(1, size // 90)
        img.paste(shadow, (off, off), shadow)

    # Composite the colorful S
    img = Image.alpha_composite(img, colored_s)

    # Final light grain for authenticity (skip tiny sizes)
    if size >= 64:
        d = ImageDraw.Draw(img, "RGBA")
        rng = random.Random(2024)
        for _ in range(size * size // 140):
            x = rng.randint(0, size - 1)
            y = rng.randint(0, size - 1)
            a = rng.randint(8, 38)
            d.point((x, y), fill=(255, 255, 255, a))

    return img


def main() -> None:
    images = [draw_logo(s) for s in SIZES]

    ico_path = OUT_DIR / "icon.ico"
    images[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=images[1:],
    )
    print(f"Wrote {ico_path}")

    png_path = OUT_DIR / "icon.png"
    draw_logo(512).save(png_path, format="PNG")
    print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
