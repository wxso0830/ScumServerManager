"""
Generates LGSS Manager logo assets (icon.ico + icon.png) for Electron builder.
Tactical / SCUM-themed: gold chevron on deep olive-black with stencil 'LGSS'.
Run once (or whenever you want to tweak design):
    python3 scripts/make_icon.py
Output:
    electron/installer/icon.ico     (multi-size .ico for Windows)
    electron/installer/icon.png     (512x512 PNG fallback)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "electron" / "installer"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Tactical palette (aligned with app CSS variables)
BG_DARK = (20, 21, 18, 255)        # #141512
BG_MID = (36, 38, 32, 255)         # #242620
ACCENT = (201, 161, 74, 255)       # #c9a14a  tactical gold
ACCENT_DIM = (168, 130, 52, 255)   # slightly darker gold for depth
FG = (231, 226, 214, 255)          # #e7e2d6 off-white

SIZES = [256, 128, 64, 48, 32, 16]


def draw_logo(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Outer rounded square bg (clipped corners for stencil vibe)
    pad = max(2, size // 32)
    r = max(4, size // 12)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=BG_DARK)

    # Inner subtle frame
    inner = max(4, size // 20)
    d.rounded_rectangle(
        [inner, inner, size - inner, size - inner],
        radius=max(3, r - 2),
        outline=BG_MID,
        width=max(1, size // 100),
    )

    # Chevron/command triangle (gold) — main mark
    cx = size / 2
    cy = size / 2
    h = size * 0.46
    w = size * 0.50
    # Cap on top, wide opening at bottom — feels like a command/ops insignia
    chevron = [
        (cx, cy - h * 0.55),                     # tip
        (cx + w * 0.55, cy + h * 0.30),          # right base
        (cx + w * 0.25, cy + h * 0.30),          # right inner
        (cx, cy - h * 0.10),                     # inner tip
        (cx - w * 0.25, cy + h * 0.30),          # left inner
        (cx - w * 0.55, cy + h * 0.30),          # left base
    ]
    d.polygon(chevron, fill=ACCENT)

    # Small bottom stencil text 'LGSS' on larger sizes only
    if size >= 64:
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", max(10, size // 10))
        except Exception:
            font = ImageFont.load_default()
        text = "LGSS"
        bbox = d.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = (size - tw) / 2
        ty = size - th - max(6, size // 10)
        d.text((tx, ty), text, fill=FG, font=font)

    # Accent bar under chevron
    bar_y = cy + h * 0.34
    bar_w = size * 0.30
    bar_h = max(2, size // 80)
    d.rectangle([cx - bar_w / 2, bar_y, cx + bar_w / 2, bar_y + bar_h], fill=ACCENT_DIM)

    return img


def main():
    images = [draw_logo(s) for s in SIZES]

    # Save multi-size .ico
    ico_path = OUT_DIR / "icon.ico"
    images[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=images[1:],
    )
    print(f"Wrote {ico_path}")

    # Save 512x512 PNG (for rounded window icon / app.asar resource)
    png_path = OUT_DIR / "icon.png"
    big = draw_logo(512)
    big.save(png_path, format="PNG")
    print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
