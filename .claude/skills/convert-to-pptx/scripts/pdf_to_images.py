#!/usr/bin/env python3
"""Render every page of a PDF to a PNG image.

Usage:
    python pdf_to_images.py input.pdf output_dir/ [--dpi 200]

Produces files named page-001.png, page-002.png, ... in output_dir.
Prints the absolute paths of the produced images to stdout, one per line,
so the caller can capture them.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import fitz  # PyMuPDF


def render_pdf(pdf_path: Path, out_dir: Path, dpi: int) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    # 72 PDF points per inch; matrix scales accordingly.
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    produced: list[Path] = []
    with fitz.open(pdf_path) as doc:
        for i in range(doc.page_count):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            out = out_dir / f"page-{i + 1:03d}.png"
            pix.save(out)
            produced.append(out.resolve())
    return produced


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf", type=Path)
    p.add_argument("out_dir", type=Path)
    p.add_argument("--dpi", type=int, default=200)
    args = p.parse_args()

    if not args.pdf.exists():
        print(f"error: PDF not found: {args.pdf}", file=sys.stderr)
        return 2

    produced = render_pdf(args.pdf, args.out_dir, args.dpi)
    for path in produced:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
