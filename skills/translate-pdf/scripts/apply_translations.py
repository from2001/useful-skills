"""Apply translated text back into a PDF file.

Reads a translations JSON file (same format as extract_texts.py output,
with a "translated" field added) and replaces text in the PDF using
PyMuPDF's redaction mechanism: original text is redacted (removed) and
translated text is inserted at the same position.

Usage:
    python apply_translations.py <input_pdf> <translations_json> <output_pdf>

Example:
    python apply_translations.py input.pdf translations.json output_JA.pdf
"""

import argparse
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF


# Language to PyMuPDF built-in font mapping
LANG_FONT_HINTS = {
    "ja": "japan",
    "zh": "china-s",
    "zh-tw": "china-t",
    "ko": "korea",
}


def _choose_font(target_lang: str | None) -> str:
    """Choose an appropriate font for the target language."""
    if target_lang:
        lower = target_lang.lower()
        if lower in LANG_FONT_HINTS:
            return LANG_FONT_HINTS[lower]
        lang_prefix = lower.split("-")[0]
        if lang_prefix in LANG_FONT_HINTS:
            return LANG_FONT_HINTS[lang_prefix]
    return "helv"


def _hex_to_rgb(color_int: int) -> tuple[float, float, float]:
    """Convert integer color to RGB tuple (0-1 range)."""
    r = ((color_int >> 16) & 0xFF) / 255.0
    g = ((color_int >> 8) & 0xFF) / 255.0
    b = (color_int & 0xFF) / 255.0
    return (r, g, b)


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

    translations = json.loads(translations_path.read_text(encoding="utf-8"))

    # Group translations by page
    by_page: dict[int, list[dict]] = {}
    for entry in translations:
        if "translated" not in entry:
            continue
        by_page.setdefault(entry["page"], []).append(entry)

    doc = fitz.open(input_pdf)
    updated_spans = 0

    for page_num, entries in sorted(by_page.items()):
        if page_num >= len(doc):
            print(f"Warning: page {page_num} out of range, skipping", file=sys.stderr)
            continue

        page = doc[page_num]

        # Phase 1: Add redaction annotations for all entries on this page
        for entry in entries:
            translated = entry["translated"]
            if translated == entry["text"]:
                continue  # No change needed

            bbox = fitz.Rect(entry["bbox"])

            # Add redaction to remove original text (fill with white)
            page.add_redact_annot(
                bbox,
                text="",
                fill=(1, 1, 1),  # White fill to cover original
            )

        # Apply all redactions at once for the page
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # Phase 2: Insert translated text
        for entry in entries:
            translated = entry["translated"]
            if translated == entry["text"]:
                continue

            if not translated:
                updated_spans += 1
                continue  # Empty translation = just remove original

            bbox = fitz.Rect(entry["bbox"])
            font_size = entry["size"]
            color = _hex_to_rgb(entry["color"])
            font_name = _choose_font(target_lang)

            # Expand bbox to ensure text fits (extracted bbox can be too tight)
            expanded = fitz.Rect(
                bbox.x0,
                bbox.y0,
                bbox.x0 + max(bbox.width * 1.5, 200),
                bbox.y0 + font_size * 1.8,
            )

            # Adjust font size if text is significantly longer
            text_length_ratio = len(translated) / max(len(entry["text"]), 1)
            if text_length_ratio > 1.5:
                font_size = font_size / (text_length_ratio * 0.7)
                font_size = max(font_size, 5)  # Minimum readable size

            rc = page.insert_textbox(
                expanded,
                translated,
                fontsize=font_size,
                fontname=font_name,
                color=color,
                align=fitz.TEXT_ALIGN_LEFT,
            )

            # If text didn't fit (rc < 0), try with smaller font
            if rc < 0:
                smaller_size = font_size * 0.75
                if smaller_size >= 4:
                    page.insert_textbox(
                        expanded,
                        translated,
                        fontsize=smaller_size,
                        fontname=font_name,
                        color=color,
                        align=fitz.TEXT_ALIGN_LEFT,
                    )

            updated_spans += 1

    doc.save(output_pdf, garbage=4, deflate=True)
    doc.close()
    print(f"Applied {updated_spans} translations -> {output_pdf}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apply translations to PDF")
    parser.add_argument("input_pdf", help="Path to the input PDF file")
    parser.add_argument("translations_json", help="Translations JSON file")
    parser.add_argument("output_pdf", help="Path for the output PDF file")
    parser.add_argument("--lang", help="Target language code (e.g., en, ja, zh, fr)")
    args = parser.parse_args()
    apply_translations(args.input_pdf, args.translations_json, args.output_pdf, args.lang)
