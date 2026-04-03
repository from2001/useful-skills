"""Extract all translatable text from unpacked PPTX slides and notes.

Scans slide XML and notes XML for <a:t> elements, outputs a JSON file
mapping each text occurrence to its file path and XPath-like location.

Usage:
    python extract_texts.py <unpacked_dir> <output_json>

Example:
    python extract_texts.py unpacked/ texts.json
"""

import argparse
import json
import sys
from pathlib import Path

import defusedxml.minidom


def extract_texts(unpacked_dir: str, output_json: str) -> None:
    unpacked = Path(unpacked_dir)
    ppt_dir = unpacked / "ppt"

    if not ppt_dir.exists():
        print(f"Error: {ppt_dir} does not exist", file=sys.stderr)
        sys.exit(1)

    # Collect slide and notes XML files
    targets = []
    slides_dir = ppt_dir / "slides"
    notes_dir = ppt_dir / "notesSlides"

    if slides_dir.exists():
        targets.extend(sorted(slides_dir.glob("slide*.xml")))
    if notes_dir.exists():
        targets.extend(sorted(notes_dir.glob("notesSlide*.xml")))

    entries = []
    for xml_file in targets:
        rel_path = str(xml_file.relative_to(unpacked))
        try:
            content = xml_file.read_text(encoding="utf-8")
            dom = defusedxml.minidom.parseString(content)
        except Exception as e:
            print(f"Warning: could not parse {rel_path}: {e}", file=sys.stderr)
            continue

        # Find all <a:t> elements
        at_elements = dom.getElementsByTagNameNS(
            "http://schemas.openxmlformats.org/drawingml/2006/main", "t"
        )

        for idx, elem in enumerate(at_elements):
            text = _get_text_content(elem)
            if text.strip():
                entries.append(
                    {
                        "file": rel_path,
                        "index": idx,
                        "text": text,
                    }
                )

    output_path = Path(output_json)
    output_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Extracted {len(entries)} text segments from {len(targets)} files -> {output_json}")


def _get_text_content(element) -> str:
    """Get concatenated text content of an element."""
    texts = []
    for node in element.childNodes:
        if node.nodeType == node.TEXT_NODE:
            texts.append(node.data)
    return "".join(texts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract translatable text from unpacked PPTX")
    parser.add_argument("unpacked_dir", help="Path to unpacked PPTX directory")
    parser.add_argument("output_json", help="Output JSON file path")
    args = parser.parse_args()
    extract_texts(args.unpacked_dir, args.output_json)
