# translate-pdf

Translate PDF documents between any language pair while preserving layout, images, and formatting.

## Features

- Preserves layout, images, and visual elements
- Supports any language pair (English, Japanese, Chinese, Spanish, French, etc.)
- Handles multi-span text grouping intelligently
- Parallel translation for large documents
- Automatic font selection for CJK and other scripts

## Prerequisites

- Python 3
- `pymupdf` — PDF manipulation
- `markitdown[pdf]` — text extraction for review

```bash
pip install pymupdf "markitdown[pdf]"
```

## Usage

```
/translate-pdf document.pdf
```

Or in natural language:

> Translate this PDF to Japanese: ./report.pdf
