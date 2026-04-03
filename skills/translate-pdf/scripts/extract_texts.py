"""Extract translatable text from a PDF, grouped by logical text lines.

Uses PyMuPDF to extract text spans with bounding boxes, then groups
consecutive spans on the same line into logical units for translation.

Usage:
    python extract_texts.py <input_pdf> <output_json>

Output JSON format:
    {
      "groups": [
        {
          "group_id": 0,
          "page": 0,
          "block_idx": 1,
          "line_idx": 0,
          "combined_text": "Hello world",
          "bbox": [x0, y0, x1, y1],
          "span_count": 2,
          "font": "Helvetica",
          "size": 12.0,
          "color": 0
        }
      ],
      "spans": [
        {
          "group_id": 0,
          "span_idx": 0,
          "bbox": [x0, y0, x1, y1],
          "text": "Hello ",
          "font": "Helvetica",
          "size": 12.0,
          "color": 0,
          "flags": 0
        }
      ]
    }
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

    groups = []
    spans = []
    group_id = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        for block_idx, block in enumerate(blocks):
            if block["type"] != 0:  # Skip image blocks
                continue

            for line_idx, line in enumerate(block["lines"]):
                line_spans = []

                for span_idx, span in enumerate(line["spans"]):
                    text = span["text"]
                    if not text.strip():
                        continue

                    line_spans.append({
                        "group_id": group_id,
                        "span_idx": span_idx,
                        "bbox": list(span["bbox"]),
                        "text": text,
                        "font": span["font"],
                        "size": round(span["size"], 2),
                        "color": span["color"],
                        "flags": span["flags"],
                    })

                if not line_spans:
                    continue

                # Compute union bbox for the group
                x0 = min(s["bbox"][0] for s in line_spans)
                y0 = min(s["bbox"][1] for s in line_spans)
                x1 = max(s["bbox"][2] for s in line_spans)
                y1 = max(s["bbox"][3] for s in line_spans)

                # Pick dominant font/size/color from the longest span
                dominant = max(line_spans, key=lambda s: len(s["text"]))

                combined_text = "".join(s["text"] for s in line_spans)

                groups.append({
                    "group_id": group_id,
                    "page": page_num,
                    "block_idx": block_idx,
                    "line_idx": line_idx,
                    "combined_text": combined_text,
                    "bbox": [x0, y0, x1, y1],
                    "span_count": len(line_spans),
                    "font": dominant["font"],
                    "size": dominant["size"],
                    "color": dominant["color"],
                })

                spans.extend(line_spans)
                group_id += 1

    page_count = len(doc)
    doc.close()

    result = {"groups": groups, "spans": spans}

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(groups)} text groups ({len(spans)} spans) "
          f"from {page_count} pages -> {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract translatable text from PDF")
    parser.add_argument("input_pdf", help="Path to the PDF file")
    parser.add_argument("output_json", help="Output JSON file path")
    args = parser.parse_args()
    extract_texts(args.input_pdf, args.output_json)
