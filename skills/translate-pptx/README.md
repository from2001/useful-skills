# translate-pptx

Translate PowerPoint (.pptx) presentations between any language pair while preserving all formatting, layouts, images, and design.

## Features

- Preserves all formatting, layouts, images, and design elements
- Supports any language pair (English, Japanese, Chinese, Spanish, French, etc.)
- Handles word-by-word segmented text intelligently
- Parallel translation for large presentations

## Prerequisites

- Python 3
- `defusedxml` — XML parsing
- `lxml` — XML validation
- `markitdown[pptx]` — text extraction for review

```bash
pip install defusedxml lxml "markitdown[pptx]"
```

## Usage

```
/translate-pptx presentation.pptx
```

Or in natural language:

> Translate this presentation to Japanese: ./slides.pptx
