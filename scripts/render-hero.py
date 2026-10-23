"""Render the homepage's silent, seamless 60 fps typography film.

Usage: python scripts/render-hero.py --ffmpeg /path/to/ffmpeg
Requires Pillow. All artwork is generated locally; no external media is used.
"""

import argparse
import functools
import math
import os
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1440, 800
DURATION = 12
MOBILE = False
FONT_DIR = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"


def ease(value):
    x = max(0, min(1, value))
    return x * x * x * (10 + x * (-15 + 6 * x))


@functools.lru_cache(maxsize=128)
def lettering(text, size, face="serif"):
    filename = "simsun.ttc" if face == "serif" else "msyh.ttc" if face == "sans" else "consola.ttf"
    font = ImageFont.truetype(str(FONT_DIR / filename), size * 2)
    box = font.getbbox(text)
    image = Image.new("L", (box[2] + 8, size * 3), 0)
    # Keep a common baseline, including punctuation in staggered letter reveals.
    reference = font.getbbox("H" if face == "mono" else "国")
    ImageDraw.Draw(image).text((0, -reference[1] + 4), text, font=font, fill=255)
    return image.resize((image.width // 2, size * 3 // 2), Image.Resampling.LANCZOS)


def text(image, content, x, y, size, opacity=1, face="serif", ink=24):
    if opacity <= 0:
        return
    mask = lettering(content, size, face)
    if opacity < 1:
        mask = mask.point(lambda p: round(p * opacity))
    image.paste(ink, (round(x), round(y)), mask)


def reveal(image, content, x, y, size, local, delay=0, face="serif", ink=24):
    # Independent letters have overlapping, zero-velocity arrival curves.
    for i, char in enumerate(content):
        p = ease((local - delay - i * 0.035) / 0.7)
        text(image, char, x + i * size * 1.035, y + (1 - p) * 65, size, p, face, ink)


def trajectory(t, u):
    # The original continuous ink ribbon and its three orbiting points.
    phase = 2 * math.pi * t / DURATION
    angle = u * math.pi * 2
    spread = 0.5 - 0.5 * math.cos(phase)
    x = 1120 + (105 + 38 * spread) * math.sin(angle + phase)
    y = 270 + 150 * math.sin(angle * 2 + phase) * (1 - 0.45 * spread)
    return x, y


def draw_ribbon(image, t, opacity=1):
    draw = ImageDraw.Draw(image)
    for strand in range(5):
        points = []
        for j in range(160):
            x, y = trajectory(t + strand * 0.17, j / 159)
            if MOBILE:
                x, y = 705 + (x - 1120) * 0.5, 590 + (y - 270) * 0.5
            points.append((x + strand * 3, y))
        gray = round(255 - (255 - (120 + strand * 21)) * opacity)
        draw.line(points, fill=gray, width=1)
    for k in range(3):
        x, y = trajectory(t, (t / 12 + k / 3) % 1)
        if MOBILE:
            x, y = 705 + (x - 1120) * 0.5, 590 + (y - 270) * 0.5
        color = round(255 - 220 * opacity)
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=color)


def scene(number, local, time):
    image = Image.new("L", (W, H), 255)
    if MOBILE:
        if number == 0:
            text(image, "深入技术，", 4, 65, 124)
            text(image, "浅出文字。", 100, 260, 124)
            text(image, "在代码与原理之间，留下一些思考。", 8, 550, 28, face="sans", ink=90)
            text(image, "把复杂的事，慢慢写清楚。", 8, 610, 28, face="sans", ink=90)
        elif number == 1:
            reveal(image, "从一行代码，", 4, 70, 108, local)
            reveal(image, "到一个好想法。", 50, 260, 104, local, 0.25)
            for i, line in enumerate(["const thought = await explore();", "const clarity = simplify(thought);", "write(clarity);"]):
                p = ease((local - 0.6 - i * 0.15) / 1.1)
                text(image, line, 8 + (1 - p) * 45, 535 + i * 43, 25, p, "mono", 105 if i < 2 else 24)
        else:
            reveal(image, "把复杂的事，", 4, 70, 112, local)
            reveal(image, "慢慢写清楚。", 100, 260, 112, local, 0.25)
            text(image, "产品工程 · UI 设计 · AI 实践", 8, 550, 28, ease((local - 1) / 1.3), "sans", 90)
            text(image, "每一次实践，都值得留下。", 8, 610, 28, ease((local - 1.2) / 1.3), "sans", 90)
        draw_ribbon(image, time, 0.64)
        return image
    if number == 0:
        # First and last frames share this exact composition.
        text(image, "深入技术，", 4, 100, 138)
        text(image, "浅出文字。", 210, 305, 138)
        text(image, "在代码与原理之间，留下一些思考。", 8, 622, 29, face="sans", ink=90)
        text(image, "把复杂的事，慢慢写清楚。", 8, 682, 29, face="sans", ink=90)
        draw_ribbon(image, time, 0.64)
    elif number == 1:
        reveal(image, "从一行代码，", 4, 100, 116, local)
        reveal(image, "到一个好想法。", 130, 290, 116, local, 0.25)
        code = ["const thought = await explore();", "const clarity = simplify(thought);", "write(clarity);"]
        for i, line in enumerate(code):
            p = ease((local - 0.6 - i * 0.15) / 1.1)
            text(image, line, 10 + (1 - p) * 45, 560 + i * 53, 29, p, "mono", 105 if i < 2 else 24)
        draw_ribbon(image, time, 0.8)
    else:
        reveal(image, "把复杂的事，", 4, 100, 122, local)
        reveal(image, "慢慢写清楚。", 140, 300, 122, local, 0.25)
        text(image, "产品工程 · UI 设计 · AI 实践", 8, 630, 29, ease((local - 1) / 1.3), "sans", 90)
        text(image, "每一次实践，都值得留下。", 8, 690, 29, ease((local - 1.2) / 1.3), "sans", 90)
        draw_ribbon(image, time, 0.64)
    return image


def frame(t):
    # Signal motion within the first second, then hold each message for reading.
    cuts = [(0.8, 0, 1), (4.4, 1, 2), (8.4, 2, 0)]
    starts = {0: 0, 1: 0.8, 2: 4.4}
    active = 0
    for start, old, new in cuts:
        if start <= t < start + 0.9:
            p = ease((t - start) / 0.9)
            outgoing = scene(old, t - starts[old], t)
            incoming = scene(new, t - start, t)
            a = Image.new("L", (W, H), 255)
            b = Image.new("L", (W, H), 255)
            a.paste(outgoing, (0, -round(48 * p)))
            b.paste(incoming, (0, round(48 * (1 - p))))
            return Image.blend(a, b, p)
        if t >= start + 0.9:
            active = new
    return scene(active, t - starts[active], t)


def main():
    global W, H, MOBILE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--fps", type=int, default=60)
    parser.add_argument("--stills-only", action="store_true")
    parser.add_argument("--mobile", action="store_true")
    args = parser.parse_args()
    MOBILE = args.mobile
    if MOBILE:
        W, H = 840, 740
    name = "taiwei-hero-mobile" if MOBILE else "taiwei-hero"
    output = ROOT / "public" / "media"
    output.mkdir(parents=True, exist_ok=True)
    frame(0).convert("RGB").save(output / f"{name}-poster.webp", quality=95)
    previews = ROOT / ".promo-work" / "stills"
    previews.mkdir(parents=True, exist_ok=True)
    for t in [0, 1, 3, 6, 10]:
        frame(t).save(previews / f"{name}-{t:02}.png")
    if args.stills_only:
        return
    if not args.ffmpeg:
        parser.error("Pass --ffmpeg with the path to an FFmpeg executable")
    command = [args.ffmpeg, "-y", "-f", "rawvideo", "-pixel_format", "gray", "-video_size", f"{W}x{H}",
               "-framerate", str(args.fps), "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "medium",
               "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-color_range", "tv",
               str(output / f"{name}.mp4")]
    with (ROOT / ".promo-work" / "encode.log").open("w") as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        for i in range(DURATION * args.fps):
            process.stdin.write(frame(i / args.fps).tobytes())
            if i % (args.fps * 3) == 0:
                print(f"Rendered {i / args.fps:.0f}/{DURATION}s", flush=True)
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("FFmpeg failed; see .promo-work/encode.log")
    print(f"Saved {output / f'{name}.mp4'}", flush=True)


if __name__ == "__main__":
    main()
