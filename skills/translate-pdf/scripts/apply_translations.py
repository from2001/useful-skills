"""Apply translated text back into a PDF file.

Reads the grouped translations JSON (output of extract_texts.py with
"translated" fields added to each group) and replaces text in the PDF.

The process per page:
1. Redact all spans belonging to translated groups (white fill)
2. Insert translated text into each group's bounding box

Usage:
    python apply_translations.py <input_pdf> <translations_json> <output_pdf> --lang <code>

Example:
    python apply_translations.py input.pdf texts.json output_JA.pdf --lang ja
"""

import argparse
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF


# Language to PyMuPDF built-in font mapping
LANG_FONT_MAP = {
    "ja": "japan",
    "zh": "china-s",
    "zh-tw": "china-t",
    "ko": "korea",
}


def _choose_font(target_lang: str | None) -> str:
    """Choose an appropriate font for the target language."""
    if target_lang:
        lower = target_lang.lower()
        if lower in LANG_FONT_MAP:
            return LANG_FONT_MAP[lower]
        prefix = lower.split("-")[0]
        if prefix in LANG_FONT_MAP:
            return LANG_FONT_MAP[prefix]
    return "helv"


def _hex_to_rgb(color_int: int) -> tuple[float, float, float]:
    """Convert integer color to RGB tuple (0-1 range)."""
    r = ((color_int >> 16) & 0xFF) / 255.0
    g = ((color_int >> 8) & 0xFF) / 255.0
    b = (color_int & 0xFF) / 255.0
    return (r, g, b)


def _calc_font_size(
    text: str,
    fontname: str,
    fontsize: float,
    available_width: float,
) -> float:
    """Calculate font size to fit text within available width."""
    text_width = fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)
    if text_width <= 0 or available_width <= 0:
        return fontsize

    if text_width > available_width:
        ratio = available_width / text_width
        fontsize = fontsize * ratio * 0.95  # 5% safety margin
        fontsize = max(fontsize, 5.0)  # Minimum readable size

    return fontsize


def apply_translations(
    input_pdf: str,
    translations_json: str,
    output_pdf: str,
    target_lang: str | None = None,
) -> None:
    translations_path = Path(translations_json)
    if not translations_path.exists():
        print(f"Error: {translations_json} does not exist", file=sys.stderr)
        sys.exit(1)

    data = json.loads(translations_path.read_text(encoding="utf-8"))
    groups = data["groups"]
    all_spans = data["spans"]

    # Index spans by group_id
    spans_by_group: dict[int, list[dict]] = {}
    for span in all_spans:
        spans_by_group.setdefault(span["group_id"], []).append(span)

    # Group translations by page
    by_page: dict[int, list[dict]] = {}
    for group in groups:
        if "translated" not in group:
            continue
        by_page.setdefault(group["page"], []).append(group)

    doc = fitz.open(input_pdf)
    font_name = _choose_font(target_lang)
    updated_count = 0

    for page_num, page_groups in sorted(by_page.items()):
        if page_num >= len(doc):
            print(f"Warning: page {page_num} out of range, skipping", file=sys.stderr)
            continue

        page = doc[page_num]

        # Phase 1: Add redaction annotations for each group
        for group in page_groups:
            translated = group["translated"]
            if translated == group["combined_text"]:
                continue  # No change

            # Redact the union bbox of all spans in this group
            # Use fill=False to preserve background (no white rectangles)
            group_spans = spans_by_group.get(group["group_id"], [])
            for span in group_spans:
                bbox = fitz.Rect(span["bbox"])
                page.add_redact_annot(bbox, text="", fill=False)

        # Phase 2: Apply all redactions at once
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # Phase 3: Insert translated text for each group
        for group in page_groups:
            translated = group["translated"]
            if translated == group["combined_text"]:
                continue
            if not translated:
                updated_count += 1
                continue  # Empty = just remove original

            bbox = fitz.Rect(group["bbox"])
            font_size = group["size"]
            color = _hex_to_rgb(group["color"])

            # Pre-calculate font size to fit within available width
            available_width = bbox.width * 1.3  # Allow 30% overflow
            font_size = _calc_font_size(translated, font_name, font_size, available_width)

            # Expand bbox for text insertion
            insert_rect = fitz.Rect(
                bbox.x0,
                bbox.y0,
                bbox.x0 + max(bbox.width * 1.5, available_width),
                bbox.y0 + font_size * 1.8,
            )

            page.insert_textbox(
                insert_rect,
                translated,
                fontsize=font_size,
                fontname=font_name,
                color=color,
                align=fitz.TEXT_ALIGN_LEFT,
            )

            updated_count += 1

    doc.save(output_pdf, garbage=4, deflate=True)
    doc.close()
    print(f"Applied {updated_count} translations -> {output_pdf}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apply translations to PDF")
    parser.add_argument("input_pdf", help="Path to the input PDF file")
    parser.add_argument("translations_json", help="Translations JSON file")
    parser.add_argument("output_pdf", help="Path for the output PDF file")
    parser.add_argument("--lang", help="Target language code (e.g., ja, zh, ko, en, fr)")
    args = parser.parse_args()
    apply_translations(args.input_pdf, args.translations_json, args.output_pdf, args.lang)
