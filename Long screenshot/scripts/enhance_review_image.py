#!/usr/bin/env python3
"""Make a mild, non-generative readability preview from a stitched PNG.

This cannot recover detail absent from the recording. Keep the original PNG as truth.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageFilter


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=1.5)
    args = parser.parse_args()
    if not 1 < args.scale <= 2:
        parser.error("scale must be greater than 1 and at most 2")
    with Image.open(args.image) as source:
        width = round(source.width * args.scale)
        height = round(source.height * args.scale)
        if height > 20_000 or width * height > 40_000_000:
            parser.error("preview exceeds the 20,000 px height or 40 MP resource limit")
        mildly_sharp = source.convert("RGB").filter(
            ImageFilter.UnsharpMask(radius=0.7, percent=90, threshold=2))
        preview = mildly_sharp.resize((width, height), Image.Resampling.LANCZOS)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        preview.save(args.output)
    print(f"{args.output}: {width}×{height}; original preserved at {args.image}")


if __name__ == "__main__":
    main()
