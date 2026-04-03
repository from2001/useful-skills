---
name: translate-pdf
description: "Translate PDF documents between any language pair while preserving layout, images, and formatting as much as possible. Use this skill when the user asks to translate a .pdf file, convert a PDF to another language, or localize PDF content. Triggers on requests like 'translate this PDF to Japanese', 'localize this document into Spanish', or 'convert this PDF to French'."
---

# Translate PDF

Translate PDF documents while preserving layout and visual elements. Text is extracted as grouped spans, translated at the group level, then redacted and re-inserted.

All intermediate files are written to a temporary directory and cleaned up automatically.

## Prerequisites

```bash
pip install pymupdf "markitdown[pdf]"
```

## Workflow

### 1. Analyze the source PDF

```bash
python -m markitdown input.pdf
```

Identify the source language and total text volume.

### 2. Confirm the target language

If the user has not specified a target language, ask using `AskUserQuestion`:

1. Japanese (`ja`)
2. Chinese (`zh`)
3. Spanish (`es`)
4. Other (ask user to specify)

### 3. Create a temporary working directory

```python
import tempfile, os
tmpdir = tempfile.mkdtemp(prefix="translate_pdf_")
texts_json = os.path.join(tmpdir, "texts.json")
```

### 4. Extract translatable text

```bash
python scripts/extract_texts.py input.pdf $tmpdir/texts.json
```

Produces a JSON file with two arrays:

- **`groups`** — Logical text lines, each with `group_id`, `page`, `combined_text`, `bbox`, `font`, `size`, `color`, `span_count`
- **`spans`** — Individual text spans, each linked to a group via `group_id`

### 5. Translate

Read `texts.json` and add a `"translated"` field to each entry in the `groups` array.

**Translation guidelines:**
- Preserve meaning, tone, and register
- Keep proper nouns, brand names, technical terms, numbers, URLs, and email addresses as-is
- Keep text length comparable to the original — longer translations may overflow
- For CJK ↔ Latin translations, expect ~30% length variation; abbreviate if needed

**Handling multi-line blocks:**

When consecutive groups share the same `page` and `block_idx` and form a single sentence or paragraph:
1. Translate the full sentence/paragraph as a unit
2. Put the complete translation in the **first** group's `"translated"` field
3. Set remaining groups' `"translated"` to empty string `""`

For standalone groups (headings, labels), translate directly.

**Large documents (>50 groups):**
1. Split into batches by page ranges
2. Use subagents for parallel translation (~5-6 pages per batch)
3. Merge results back into `texts.json`

**Small documents (<=50 groups):**
Translate all groups at once.

### 6. Apply translations

```bash
python scripts/apply_translations.py input.pdf $tmpdir/texts.json output.pdf --lang <target>
```

The `--lang` flag selects the appropriate font: `ja` → CJK Japanese, `zh` → CJK Simplified Chinese, `zh-tw` → CJK Traditional Chinese, `ko` → CJK Korean, others → Helvetica.

Place the output file in the same directory as the input, with a language suffix (e.g., `input_JA.pdf`).

### 7. Cleanup

```python
import shutil
shutil.rmtree(tmpdir)
```

### 8. QA

```bash
python -m markitdown translated.pdf
```

Verify:
- All text segments are translated (no source language remnants)
- Proper nouns and brand names are preserved
- Numbers and formatting are intact

## Limitations

- **Text-based PDFs only** — scanned/image PDFs require OCR first
- **Complex layouts** (multi-column, overlapping text boxes) may need manual adjustment
- **Fonts** — translated text uses PyMuPDF built-in fonts (Helvetica for Latin, CJK fonts for East Asian). Original decorative fonts are not preserved
- **Arabic/Thai/Hindi** — PyMuPDF built-in fonts have limited support for these scripts
- **Text overflow** — automatic font-size reduction is applied but may not always fit perfectly
