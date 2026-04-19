"""
Generates LGSS Manager logo (icon.ico + icon.png) — SCUM-themed.

Design: gritty stencil 'S' with rust-red + gold accents, bullet holes,
slash-stencil cuts (reminiscent of SCUM's apocalyptic typography).

Run:
    python3 scripts/make_icon.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import math
import random

OUT_DIR = Path(__file__).resolve().parent.parent / "electron" / "installer"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# SCUM-inspired palette
BG_DEEP = (14, 13, 11, 255)         # near-black, slightly warm
BG_GRIT = (28, 22, 18, 255)         # grimy brown-black
ACCENT_RUST = (168, 43, 37, 255)    # dried blood / rust
ACCENT_RUST_HI = (198, 68, 52, 255)
GOLD = (201, 161, 74, 255)
GOLD_DIM = (130, 101, 41, 255)
FG = (231, 226, 214, 255)

SIZES = [256, 128, 64, 48, 32, 16]


def add_noise(img: Image.Image, strength: int = 6) -> Image.Image:
    """Very light grain texture for gritty feel."""
    w, h = img.size
    noise = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(noise)
    rng = random.Random(42)
    for _ in range(w * h // 120):
        x = rng.randint(0, w - 1)
        y = rng.randint(0, h - 1)
        a = rng.randint(10, strength * 8)
        d.point((x, y), fill=(255, 255, 255, a))
    return Image.alpha_composite(img, noise)


def bullet_hole(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float):
    # dark inner
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, 255))
    # rim highlight
    rim = max(1, int(r * 0.25))
    d.ellipse([cx - r - rim, cy - r - rim, cx + r + rim, cy + r + rim],
              outline=(40, 30, 24, 255), width=max(1, int(r * 0.3)))


def draw_logo(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-corner bg tile (stencil feel)
    pad = max(2, size // 32)
    r = max(4, size // 10)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=BG_DEEP)

    # Inner grim frame
    inner_pad = max(3, size // 18)
    d.rounded_rectangle(
        [inner_pad, inner_pad, size - inner_pad, size - inner_pad],
        radius=max(3, r - 2), outline=BG_GRIT, width=max(1, size // 60),
    )

    # --- Giant stencil S ---
    try:
        # Try a heavy/black font first
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size * 0.78))
    except Exception:
        font = ImageFont.load_default()

    s_text = "S"
    bbox = d.textbbox((0, 0), s_text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    sx = (size - tw) / 2 - bbox[0]
    sy = (size - th) / 2 - bbox[1] - size * 0.04  # nudge up for bottom label

    # Shadow layer (slightly offset) for depth
    shadow_off = max(1, size // 80)
    d.text((sx + shadow_off, sy + shadow_off), s_text, fill=(0, 0, 0, 160), font=font)

    # Main S stroke — rust red
    d.text((sx, sy), s_text, fill=ACCENT_RUST, font=font)

    # Highlight on upper-left of S (gold brushed)
    # Achieved via a clipped gold fill by re-drawing 'S' smaller and lighter:
    try:
        hi_font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(size * 0.78))
        d.text((sx - max(1, size // 140), sy - max(1, size // 140)),
               s_text, fill=(255, 215, 130, 55), font=hi_font)
    except Exception:
        pass

    # Horizontal stencil cut through middle of the S (adds stencil vibe)
    cut_h = max(2, size // 40)
    cut_y = size * 0.48
    d.rectangle([size * 0.12, cut_y - cut_h / 2, size * 0.88, cut_y + cut_h / 2],
                fill=BG_DEEP)

    # Second slim cut
    cut2_y = size * 0.62
    cut2_h = max(1, size // 80)
    d.rectangle([size * 0.18, cut2_y - cut2_h / 2, size * 0.82, cut2_y + cut2_h / 2],
                fill=BG_DEEP)

    # Bullet hole top-right corner (if big enough)
    if size >= 48:
        bullet_hole(d, size * 0.74, size * 0.22, size * 0.055)
    if size >= 96:
        bullet_hole(d, size * 0.28, size * 0.78, size * 0.040)

    # Gold corner ticks (command/military feel)
    tick_len = max(2, size // 12)
    tick_w = max(1, size // 60)
    # top-left
    d.rectangle([inner_pad + 2, inner_pad + 2, inner_pad + tick_len, inner_pad + 2 + tick_w], fill=GOLD)
    d.rectangle([inner_pad + 2, inner_pad + 2, inner_pad + 2 + tick_w, inner_pad + tick_len], fill=GOLD)
    # top-right
    d.rectangle([size - inner_pad - tick_len, inner_pad + 2,
                 size - inner_pad - 2, inner_pad + 2 + tick_w], fill=GOLD)
    d.rectangle([size - inner_pad - 2 - tick_w, inner_pad + 2,
                 size - inner_pad - 2, inner_pad + tick_len], fill=GOLD)
    # bottom-left
    d.rectangle([inner_pad + 2, size - inner_pad - tick_len,
                 inner_pad + 2 + tick_w, size - inner_pad - 2], fill=GOLD)
    d.rectangle([inner_pad + 2, size - inner_pad - 2 - tick_w,
                 inner_pad + tick_len, size - inner_pad - 2], fill=GOLD)
    # bottom-right
    d.rectangle([size - inner_pad - tick_len, size - inner_pad - 2 - tick_w,
                 size - inner_pad - 2, size - inner_pad - 2], fill=GOLD)
    d.rectangle([size - inner_pad - 2 - tick_w, size - inner_pad - tick_len,
                 size - inner_pad - 2, size - inner_pad - 2], fill=GOLD)

    # Bottom 'SCUM' label on larger sizes
    if size >= 96:
        try:
            label_font = ImageFont.truetype("DejaVuSans-Bold.ttf", max(8, int(size * 0.09)))
        except Exception:
            label_font = ImageFont.load_default()
        label = "SCUM"
        lb = d.textbbox((0, 0), label, font=label_font)
        lw = lb[2] - lb[0]
        lh = lb[3] - lb[1]
        ly = size - inner_pad - lh - max(3, size // 40)
        d.text(((size - lw) / 2, ly), label, fill=GOLD_DIM, font=label_font)

    # Subtle grain
    if size >= 64:
        img = add_noise(img, strength=4)

    return img


def main():
    images = [draw_logo(s) for s in SIZES]

    ico_path = OUT_DIR / "icon.ico"
    images[0].save(
        ico_path, format="ICO",
        sizes=[(s, s) for s in SIZES], append_images=images[1:],
    )
    print(f"Wrote {ico_path}")

    png_path = OUT_DIR / "icon.png"
    draw_logo(512).save(png_path, format="PNG")
    print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
