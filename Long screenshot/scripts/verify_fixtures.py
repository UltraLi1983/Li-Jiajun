#!/usr/bin/env python3
"""Run video-level fixture checks against a built longshot binary."""
import argparse
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


def verify_success(root: Path, name: str, binary: Path, expect_skipped: bool = False,
                   expect_dynamic: bool = False) -> list[int]:
    video = root / f"{name}.mp4"
    output = root / f"{name}-verified.png"
    report_path = root / f"{name}-verified.json"
    result = subprocess.run([str(binary), str(video), "--output", str(output),
                             "--report", str(report_path)], capture_output=True, text=True)
    report = json.loads(report_path.read_text())
    truth = json.loads((root / f"{name}-truth.json").read_text())
    assert result.returncode == 0, (name, result.stderr)
    assert report["status"] == "success", (name, report)
    assert report["contentTop"] == truth["margin"], (name, report)
    assert report["contentBottom"] == truth["height"] - truth["margin"], (name, report)
    assert report["outputHeight"] == truth["expected_height"], (name, report)
    assert report["outputWidth"] == truth["width"], (name, report)
    assert report["framesDecoded"] == len(truth["offsets"]), (name, report)
    if expect_skipped:
        assert any(frame["decision"].startswith("skipped_") for frame in report["frames"]), report
    if expect_dynamic:
        assert any(frame["decision"] == "dynamic_content_recovered" for frame in report["frames"]), report

    previous_index = 0
    motion_errors = []
    for frame in report["frames"]:
        if frame["decision"] not in ("accepted", "dynamic_content_recovered"):
            continue
        frame_index = round(frame["timeSeconds"] * truth["fps"])
        assert previous_index <= frame_index < len(truth["offsets"]), (name, frame)
        expected_motion = truth["offsets"][frame_index] - truth["offsets"][previous_index]
        motion_errors.append(abs(frame["displacementPixels"] - expected_motion))
        previous_index = frame_index
    assert motion_errors, name

    margin = truth["margin"]
    content_height = truth["height"] - 2 * margin
    if expect_dynamic:
        expected = Image.open(root / f"{name}-loaded-truth.png").convert("RGB")
    else:
        expected = Image.new("RGB", (truth["width"], truth["expected_height"]))
        furthest = 0
        for index, offset in enumerate(truth["offsets"]):
            if index == 0 or offset > furthest:
                frame = Image.open(root / f"{name}-frames/frame-{index:03d}.png").convert("RGB")
                new_pixels = content_height if index == 0 else offset - furthest
                expected.paste(frame.crop((0, margin + content_height - new_pixels,
                                           truth["width"], margin + content_height)),
                               (0, 0 if index == 0 else content_height + furthest))
                furthest = offset
    actual = Image.open(output).convert("RGB")
    assert actual.size == expected.size, (name, actual.size, expected.size)
    mean_error = ImageStat.Stat(ImageChops.difference(actual, expected)).mean
    assert max(mean_error) < (10 if expect_dynamic else 6), (name, mean_error)
    if expect_dynamic:
        image_box = (8, 120, truth["width"] - 8, 260)
        loaded_error = sum(ImageStat.Stat(ImageChops.difference(
            actual.crop(image_box), expected.crop(image_box))).mean) / 3
        first_frame = Image.open(root / f"{name}-frames/frame-000.png").convert("RGB")
        placeholder_box = (image_box[0], image_box[1] + margin,
                           image_box[2], image_box[3] + margin)
        placeholder_error = sum(ImageStat.Stat(ImageChops.difference(
            actual.crop(image_box), first_frame.crop(placeholder_box))).mean) / 3
        assert loaded_error < 0.4 * placeholder_error, (loaded_error, placeholder_error)
    print(f"{name}: PASS, {actual.width}x{actual.height}, RGB MAE {mean_error},"
          f" motion max error {max(motion_errors)} px")
    return motion_errors


def verify_rejection(root: Path, name: str, reason: str, binary: Path) -> None:
    output = root / f"{name}-verified.png"
    report_path = root / f"{name}-verified.json"
    output.unlink(missing_ok=True)
    result = subprocess.run([str(binary), str(root / f"{name}.mp4"),
                             "--output", str(output), "--report", str(report_path)],
                            capture_output=True, text=True)
    report = json.loads(report_path.read_text())
    assert result.returncode == 1, result.stderr
    assert report["status"] == "failed" and reason in report["reason"], report
    assert not output.exists(), f"{name} must not produce an apparently continuous image"
    print(f"{name}: PASS, explicitly rejected ({reason})")


def verify_downsampling(root: Path, binary: Path) -> None:
    source = root / "normal-scroll.mp4"
    enlarged = root / "normal-scroll-960.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                    "-vf", "scale=960:1600", "-an", str(enlarged)], check=True)
    output = root / "normal-scroll-720-verified.png"
    report_path = root / "normal-scroll-720-verified.json"
    result = subprocess.run([str(binary), str(enlarged), "--output", str(output),
                             "--report", str(report_path)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    report = json.loads(report_path.read_text())
    assert (report["inputWidth"], report["inputHeight"]) == (960, 1600), report
    assert (report["processingWidth"], report["processingHeight"]) == (720, 1200), report
    assert report["outputWidth"] == 720, report
    assert abs(report["outputHeight"] - 1548) <= 4, report
    assert Image.open(output).size == (report["outputWidth"], report["outputHeight"])
    full_output = root / "normal-scroll-960-verified.png"
    full_report_path = root / "normal-scroll-960-verified.json"
    full_result = subprocess.run([str(binary), str(enlarged), "--output", str(full_output),
                                  "--report", str(full_report_path), "--max-width", "0"],
                                 capture_output=True, text=True)
    assert full_result.returncode == 0, full_result.stderr
    full_report = json.loads(full_report_path.read_text())
    assert full_report["processingWidth"] == full_report["outputWidth"] == 960, full_report
    print(f"downsampling: PASS, 960x1600 input -> {report['outputWidth']}x{report['outputHeight']} output")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("/private/tmp/longshot-fixtures"))
    args = parser.parse_args()
    subprocess.run([sys.executable, str(Path(__file__).with_name("generate_fixture.py")),
                    "--output-dir", str(args.output_dir)], check=True)
    motion_errors = []
    for name in ("normal-scroll", "reverse-pause", "fast-scroll", "slow-scroll", "no-bars"):
        motion_errors.extend(verify_success(args.output_dir, name, args.binary))
    motion_errors.extend(verify_success(args.output_dir, "transient-overlay", args.binary,
                                        expect_skipped=True))
    motion_errors.extend(verify_success(args.output_dir, "lazy-image", args.binary,
                                        expect_dynamic=True))
    sorted_errors = sorted(motion_errors)
    median_error = statistics.median(sorted_errors)
    p95_error = sorted_errors[math.ceil(0.95 * len(sorted_errors)) - 1]
    assert median_error <= 2 and p95_error <= 5, (median_error, p95_error)
    print(f"motion accuracy: PASS, {len(sorted_errors)} accepted pairs,"
          f" median {median_error} px, p95 {p95_error} px")
    verify_rejection(args.output_dir, "gap-scroll", "ambiguous_displacement", args.binary)
    verify_rejection(args.output_dir, "animated", "dynamic_content", args.binary)
    verify_rejection(args.output_dir, "page-switch", "high_overlap_error", args.binary)
    verify_rejection(args.output_dir, "landscape", "portrait_only", args.binary)
    verify_rejection(args.output_dir, "repeated-rows", "no_verifiable_motion", args.binary)
    verify_rejection(args.output_dir, "rotated-metadata", "rotated_video_not_yet_supported", args.binary)
    verify_rejection(args.output_dir, "zoom-change", "ambiguous_displacement", args.binary)
    verify_downsampling(args.output_dir, args.binary)


if __name__ == "__main__":
    main()
