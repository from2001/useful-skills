#!/usr/bin/env python3
"""Render a .pptx to per-slide PNG images via headless LibreOffice.

Usage:
    python render_pptx.py deck.pptx output_dir/ [--dpi 150]

Strategy:
    1. soffice --headless --convert-to pdf deck.pptx -> deck.pdf
    2. PyMuPDF rasterizes deck.pdf to slide-001.png, slide-002.png, ...

Both steps are required because LibreOffice's --convert-to png only emits
the first slide. Going via PDF is the standard workaround.

Exits non-zero with a clear message if LibreOffice (`soffice`) is not on PATH.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

import fitz  # PyMuPDF


def find_soffice() -> str | None:
    candidates = [
        "soffice",
        "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for c in candidates:
        path = shutil.which(c) if "/" not in c else (c if Path(c).exists() else None)
        if path:
            return path
    return None


def pptx_to_pdf(pptx: Path, work_dir: Path, soffice: str) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nologo",
        "--nodefault",
        "--convert-to", "pdf",
        "--outdir", str(work_dir),
        str(pptx),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stdout + result.stderr)
        raise SystemExit(f"LibreOffice conversion failed (exit {result.returncode})")
    pdf = work_dir / (pptx.stem + ".pdf")
    if not pdf.exists():
        raise SystemExit(f"Expected PDF not produced: {pdf}")
    return pdf


def pdf_to_pngs(pdf: Path, out_dir: Path, dpi: int) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    produced: list[Path] = []
    with fitz.open(pdf) as doc:
        for i in range(doc.page_count):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            out = out_dir / f"slide-{i + 1:03d}.png"
            pix.save(out)
            produced.append(out.resolve())
    return produced


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pptx", type=Path)
    p.add_argument("out_dir", type=Path)
    p.add_argument("--dpi", type=int, default=150)
    args = p.parse_args()

    if not args.pptx.exists():
        print(f"error: pptx not found: {args.pptx}", file=sys.stderr)
        return 2

    soffice = find_soffice()
    if not soffice:
        print(
            "error: LibreOffice (soffice) not found. Install with "
            "`brew install --cask libreoffice` (macOS) or "
            "`apt install libreoffice` (Linux), then retry.",
            file=sys.stderr,
        )
        return 3

    pdf = pptx_to_pdf(args.pptx, args.out_dir / "_pdf", soffice)
    images = pdf_to_pngs(pdf, args.out_dir, args.dpi)
    for img in images:
        print(img)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
