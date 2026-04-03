"""Apply translated text back into unpacked PPTX XML files.

Reads a translations JSON file (same format as extract_texts.py output,
with a "translated" field added) and replaces <a:t> content in the XML.

Also updates lang attributes on <a:rPr> elements to match the target language.

Usage:
    python apply_translations.py <unpacked_dir> <translations_json> [--lang <bcp47>]

Example:
    python apply_translations.py unpacked/ translations.json --lang en-US
"""

import argparse
import json
import sys
from pathlib import Path

import defusedxml.minidom

# BCP 47 language tag mapping for common languages
LANG_CODES = {
    "ja": "ja-JP",
    "en": "en-US",
    "zh": "zh-CN",
    "zh-tw": "zh-TW",
    "ko": "ko-KR",
    "fr": "fr-FR",
    "de": "de-DE",
    "es": "es-ES",
    "pt": "pt-BR",
    "it": "it-IT",
    "ru": "ru-RU",
    "ar": "ar-SA",
    "hi": "hi-IN",
    "th": "th-TH",
    "vi": "vi-VN",
}

# Smart quote replacements (must match unpack.py behavior)
SMART_QUOTE_REPLACEMENTS = {
    "\u201c": "&#x201C;",
    "\u201d": "&#x201D;",
    "\u2018": "&#x2018;",
    "\u2019": "&#x2019;",
}


def apply_translations(unpacked_dir: str, translations_json: str, target_lang: str | None = None) -> None:
    unpacked = Path(unpacked_dir)
    translations_path = Path(translations_json)

    if not translations_path.exists():
        print(f"Error: {translations_json} does not exist", file=sys.stderr)
        sys.exit(1)

    translations = json.loads(translations_path.read_text(encoding="utf-8"))

    # Resolve target lang to BCP 47 if short code provided
    bcp47_lang = None
    if target_lang:
        bcp47_lang = LANG_CODES.get(target_lang.lower(), target_lang)

    # Group translations by file
    by_file: dict[str, list[dict]] = {}
    for entry in translations:
        if "translated" not in entry:
            continue
        by_file.setdefault(entry["file"], []).append(entry)

    updated_files = 0
    updated_texts = 0

    for rel_path, entries in by_file.items():
        xml_file = unpacked / rel_path
        if not xml_file.exists():
            print(f"Warning: {rel_path} not found, skipping", file=sys.stderr)
            continue

        content = xml_file.read_text(encoding="utf-8")
        dom = defusedxml.minidom.parseString(content)

        at_elements = dom.getElementsByTagNameNS(
            "http://schemas.openxmlformats.org/drawingml/2006/main", "t"
        )

        for entry in entries:
            idx = entry["index"]
            if idx >= len(at_elements):
                print(f"Warning: index {idx} out of range in {rel_path}", file=sys.stderr)
                continue

            elem = at_elements[idx]
            translated = entry["translated"]

            # Escape smart quotes to XML entities
            for char, entity in SMART_QUOTE_REPLACEMENTS.items():
                translated = translated.replace(char, entity)

            # Replace text content
            _set_text_content(elem, translated)

            # Update lang attribute on parent <a:rPr> if target language specified
            if bcp47_lang:
                _update_lang(elem, bcp47_lang)

            updated_texts += 1

        # Write back
        xml_bytes = dom.toxml(encoding="utf-8")
        xml_file.write_bytes(xml_bytes)
        updated_files += 1

    print(f"Applied {updated_texts} translations across {updated_files} files")


def _set_text_content(element, text: str) -> None:
    """Replace all text content of an element."""
    doc = element.ownerDocument
    # Remove existing child nodes
    while element.firstChild:
        element.removeChild(element.firstChild)
    element.appendChild(doc.createTextNode(text))


def _update_lang(at_element, lang: str) -> None:
    """Update lang/altLang on the nearest <a:rPr> ancestor/sibling."""
    parent = at_element.parentNode  # <a:r>
    if parent is None:
        return
    for child in parent.childNodes:
        if child.nodeType == child.ELEMENT_NODE and child.localName == "rPr":
            if child.hasAttribute("lang"):
                child.setAttribute("altLang", child.getAttribute("lang"))
            child.setAttribute("lang", lang)
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apply translations to unpacked PPTX")
    parser.add_argument("unpacked_dir", help="Path to unpacked PPTX directory")
    parser.add_argument("translations_json", help="Translations JSON file")
    parser.add_argument("--lang", help="Target language code (e.g., en, ja, zh, fr)")
    args = parser.parse_args()
    apply_translations(args.unpacked_dir, args.translations_json, args.lang)
