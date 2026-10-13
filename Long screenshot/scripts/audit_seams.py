#!/usr/bin/env python3
"""Locate stitched seams from a successful diagnostic report for manual review."""
import argparse
import json
import statistics
from pathlib import Path


def audit(report: dict) -> list[dict]:
    if report.get("status") != "success":
        raise ValueError("report is not a successful stitch")
    top, bottom = report["contentTop"], report["contentBottom"]
    if top is None or bottom is None or bottom <= top:
        raise ValueError("missing or invalid content bounds")

    position = 0
    furthest = 0
    height = bottom - top
    seams = []
    for frame in report["frames"]:
        if frame["decision"] not in ("accepted", "dynamic_content_recovered"):
            continue
        position += frame["displacementPixels"]
        if position < 0:
            raise ValueError("scroll position precedes initial frame")
        new_pixels = max(0, position - furthest)
        furthest = max(furthest, position)
        if new_pixels:
            seams.append({
                "y": height,
                "timeSeconds": frame["timeSeconds"],
                "newPixels": new_pixels,
                "overlapError": frame["overlapError"],
                "confidence": frame["confidence"],
            })
            height += new_pixels
    if height != report["outputHeight"]:
        raise ValueError(f"reconstructed height {height} != output {report['outputHeight']}")
    return seams


def add_edge_jumps(seams: list[dict], image_path: Path, width: int, height: int) -> None:
    from PIL import Image, ImageChops, ImageStat

    image = Image.open(image_path).convert("L")
    if image.size != (width, height):
        raise ValueError(f"image size {image.size} != report size {(width, height)}")
    left, right = max(1, width // 20), width - max(1, width // 20)
    row_errors = {}

    def row_error(y: int) -> float:
        if y not in row_errors:
            before = image.crop((left, y - 1, right, y))
            after = image.crop((left, y, right, y + 1))
            row_errors[y] = ImageStat.Stat(ImageChops.difference(before, after)).mean[0]
        return row_errors[y]

    for seam in seams:
        y = seam["y"]
        nearby = [row_error(other) for other in range(max(1, y - 16), min(height, y + 17))
                  if abs(other - y) >= 3]
        baseline = statistics.median(nearby) if nearby else 0
        seam["edgeJump"] = row_error(y) / max(1.0, baseline)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--image", type=Path, help="check row discontinuity at seams")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    report = json.loads(args.report.read_text())
    seams = audit(report)
    if args.image:
        add_edge_jumps(seams, args.image, report["outputWidth"], report["outputHeight"])
    print(f"Output: {report['outputWidth']} x {report['outputHeight']}; stitched seams: {len(seams)}")
    print("Review these seams first (low confidence, high overlap error, or row jump):")
    if args.image:
        print("Row jump is a review hint; text and card boundaries can cause false alarms.")
    low_confidence = sorted(seams, key=lambda s: s["confidence"])[:args.limit]
    high_error = sorted(seams, key=lambda s: s["overlapError"], reverse=True)[:args.limit]
    high_jump = sorted(seams, key=lambda s: s.get("edgeJump", 0), reverse=True)[:args.limit]
    priority = {s["y"]: s for s in low_confidence + high_error + high_jump}
    for seam in sorted(priority.values(), key=lambda s: s["y"]):
        percent = 100 * seam["y"] / report["outputHeight"]
        print(f"  y={seam['y']:5d} ({percent:5.1f}%)  video={seam['timeSeconds']:5.2f}s"
              f"  added={seam['newPixels']:3d}px  confidence={seam['confidence']:.3f}"
              f"  error={seam['overlapError']:.2f}"
              + (f"  edge_jump={seam['edgeJump']:.1f}x" if args.image else ""))


if __name__ == "__main__":
    main()
