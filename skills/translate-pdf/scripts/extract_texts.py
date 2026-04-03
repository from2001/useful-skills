"""Extract all translatable text blocks from a PDF file.

Uses PyMuPDF to extract text with position information (bounding boxes),
producing a JSON file that maps each text block to its page and location.

Usage:
    python extract_texts.py <input_pdf> <output_json>

Example:
    python extract_texts.py input.pdf texts.json
"""

import argparse
import json
import sys

import fitz  # PyMuPDF


def extract_texts(input_pdf: str, output_json: str) -> None:
    try:
        doc = fitz.open(input_pdf)
    except Exception as e:
        print(f"Error: could not open {input_pdf}: {e}", file=sys.stderr)
        sys.exit(1)

    entries = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        for block_idx, block in enumerate(blocks):
            if block["type"] != 0:  # Skip image blocks
                continue

            for line_idx, line in enumerate(block["lines"]):
                for span_idx, span in enumerate(line["spans"]):
                    text = span["text"].strip()
                    if not text:
                        continue

                    entries.append({
                        "page": page_num,
                        "block_idx": block_idx,
                        "line_idx": line_idx,
                        "span_idx": span_idx,
                        "bbox": list(span["bbox"]),
                        "text": span["text"],
                        "font": span["font"],
                        "size": round(span["size"], 2),
                        "color": span["color"],
                        "flags": span["flags"],
                    })

    page_count = len(doc)
    doc.close()

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(entries)} text spans from {page_count} pages -> {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract translatable text from PDF")
    parser.add_argument("input_pdf", help="Path to the PDF file")
    parser.add_argument("output_json", help="Output JSON file path")
    args = parser.parse_args()
    extract_texts(args.input_pdf, args.output_json)
