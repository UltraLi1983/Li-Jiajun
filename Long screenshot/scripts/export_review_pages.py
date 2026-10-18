#!/usr/bin/env python3
"""Crop a long PNG into lossless, overlapping pages for native-size review."""
import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--page-height", type=int, default=1280)
    parser.add_argument("--overlap", type=int, default=80)
    args = parser.parse_args()
    if args.page_height < 256 or args.overlap < 0 or args.overlap >= args.page_height:
        parser.error("require page-height >= 256 and 0 <= overlap < page-height")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(args.image) as image:
        for index, top in enumerate(range(0, image.height, args.page_height - args.overlap), 1):
            bottom = min(image.height, top + args.page_height)
            page = image.crop((0, top, image.width, bottom))
            destination = args.output_dir / f"page-{index:02d}.png"
            page.save(destination)
            print(f"{destination}: rows {top}–{bottom - 1}, {page.width}×{page.height}")
            if bottom == image.height:
                break


if __name__ == "__main__":
    main()
