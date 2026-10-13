#!/usr/bin/env python3
"""Generate deterministic portrait scroll recordings for CLI integration checks.

Requires Pillow and ffmpeg. Outputs stay outside the repository by default.
"""
import argparse
import json
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def make_video(root: Path, name: str, offsets: list[int], fps: int = 4,
               margin: int = 32, animated_region: bool = False,
               page_switch_at: int | None = None, repeated_rows: bool = False,
               transient_overlay_at: int | None = None,
               zoom_at: int | None = None,
               lazy_load_at: int | None = None,
               reflow_at: int | None = None) -> None:
    width, height = 240, 400
    content_height = height - 2 * margin
    canvas = Image.new("RGB", (width, content_height + max(offsets)), "#f5f6f8")
    draw = ImageDraw.Draw(canvas)
    randomizer = random.Random(1138)
    font = ImageFont.load_default()
    for index in range(40):
        y = index * 24
        color = (80, 130, 170) if repeated_rows else tuple(randomizer.randint(45, 190) for _ in range(3))
        draw.rounded_rectangle((8, y + 3, width - 9, y + 21), radius=4,
                               fill=(255, 255, 255), outline=(220, 223, 228))
        draw.rectangle((13, y + 7, 27, y + 17), fill=color)
        label = "same row 00000" if repeated_rows else f"row {index:02d}  {randomizer.randrange(100000):05d}"
        draw.text((34, y + 7), label,
                  font=font, fill=(33, 39, 45))
    placeholder_canvas = canvas
    if lazy_load_at is not None:
        placeholder_canvas = canvas.copy()
        placeholder_draw = ImageDraw.Draw(placeholder_canvas)
        placeholder_draw.rectangle((8, 120, width - 9, 260), fill=(40, 42, 46))
        loaded_draw = ImageDraw.Draw(canvas)
        loaded_draw.rectangle((8, 120, width - 9, 260), fill=(34, 93, 149))
        for x in range(12, width - 12, 16):
            loaded_draw.line((x, 123, width - x, 257), fill=(240, 198, 50), width=3)
        canvas.save(root / f"{name}-loaded-truth.png")
    reflow_canvas = None
    if reflow_at is not None:
        reflow_canvas = Image.new("RGB", (width, canvas.height + 72), "#f5f6f8")
        reflow_canvas.paste(canvas.crop((0, 0, width, 260)), (0, 0))
        reflow_canvas.paste(canvas.crop((0, 260, width, canvas.height)), (0, 332))
        reflow_draw = ImageDraw.Draw(reflow_canvas)
        reflow_draw.rectangle((8, 260, width - 9, 331), fill=(34, 93, 149))
    frame_dir = root / f"{name}-frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for index, offset in enumerate(offsets):
        image = Image.new("RGB", (width, height), "#343946")
        source_canvas = placeholder_canvas if lazy_load_at is not None and index < lazy_load_at else canvas
        if reflow_canvas is not None and index >= reflow_at:
            source_canvas = reflow_canvas
        content = source_canvas.crop((0, offset, width, offset + content_height))
        if zoom_at is not None and index >= zoom_at:
            enlarged = content.resize((int(width * 1.2), int(content_height * 1.2)),
                                      Image.Resampling.BICUBIC)
            content = enlarged.crop((0, 0, width, content_height))
        if page_switch_at is not None and index >= page_switch_at:
            content = ImageOps.invert(content)
        image.paste(content, (0, margin))
        if margin:
            frame_draw = ImageDraw.Draw(image)
            frame_draw.text((10, 10), "FIXED HEADER", font=font, fill="white")
            frame_draw.text((10, height - 22), "FIXED FOOTER", font=font, fill="white")
        if animated_region or index == transient_overlay_at:
            frame_draw = ImageDraw.Draw(image)
            color = (220, 35 + (index * 37) % 160, 30 + (index * 71) % 180)
            frame_draw.rectangle((8, 135, width - 9, 245), fill=color)
            frame_draw.text((32, 185), f"LIVE {index:03d}", font=font, fill="white")
        image.save(frame_dir / f"frame-{index:03d}.png")
    video = root / f"{name}.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-framerate", str(fps),
        "-i", str(frame_dir / "frame-%03d.png"), "-c:v", "libx264",
        "-crf", "16", "-pix_fmt", "yuv420p", str(video)
    ], check=True)
    (root / f"{name}-truth.json").write_text(json.dumps({
        "width": width, "height": height, "margin": margin,
        "offsets": offsets, "fps": fps, "expected_height": content_height + max(offsets)
    }, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("/private/tmp/longshot-fixtures"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    make_video(args.output_dir, "normal-scroll", [index * 12 for index in range(16)])
    make_video(args.output_dir, "reverse-pause", [
        0, 12, 24, 36, 48, 60, 60, 60, 48, 36, 48, 60, 72, 84, 96
    ])
    make_video(args.output_dir, "fast-scroll", [index * 35 for index in range(20)], fps=30)
    make_video(args.output_dir, "slow-scroll", list(range(20)), fps=30)
    make_video(args.output_dir, "no-bars", [index * 12 for index in range(12)], margin=0)
    make_video(args.output_dir, "animated", [index * 12 for index in range(12)],
               animated_region=True)
    make_video(args.output_dir, "gap-scroll", [0, 12, 24, 36, 48, 60, 400, 412])
    make_video(args.output_dir, "page-switch", [index * 12 for index in range(12)],
               page_switch_at=6)
    make_video(args.output_dir, "repeated-rows", [index * 24 for index in range(12)],
               repeated_rows=True)
    make_video(args.output_dir, "transient-overlay", [index * 12 for index in range(16)],
               transient_overlay_at=7)
    make_video(args.output_dir, "zoom-change", [index * 12 for index in range(12)],
               zoom_at=6)
    make_video(args.output_dir, "lazy-image", [index * 12 for index in range(16)],
               lazy_load_at=7)
    make_video(args.output_dir, "image-reflow", [index * 12 for index in range(16)],
               lazy_load_at=7, reflow_at=7)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i",
                    str(args.output_dir / "normal-scroll.mp4"), "-vf", "transpose=1", "-an",
                    str(args.output_dir / "landscape.mp4")], check=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-display_rotation", "90", "-i", str(args.output_dir / "normal-scroll.mp4"),
                    "-c", "copy", str(args.output_dir / "rotated-metadata.mp4")],
                   check=True)
    print(args.output_dir)


if __name__ == "__main__":
    main()
