---
name: translate-pdf
description: "Translate PDF documents between any language pair while preserving layout, images, and formatting as much as possible. Use this skill when the user asks to translate a .pdf file, convert a PDF to another language, or localize PDF content. Triggers on requests like 'translate this PDF to Japanese', 'localize this document into Spanish', or 'convert this PDF to French'."
---

# Translate PDF

Translate PDF documents while preserving layout and visual elements.

All intermediate files (JSON) are written to a temporary directory and cleaned up automatically.

## Prerequisites

- `pymupdf` — PDF manipulation (text extraction, redaction, text insertion)
- `markitdown[pdf]` — text extraction for review

## Workflow

### 1. Analyze the source PDF

```bash
python -m markitdown input.pdf
```

Identify the source language and total text volume.

### 2. Confirm the target language

If the user has not specified a target language, ask them to choose using `AskUserQuestion`:

**Options:**
1. Japanese
2. Chinese
3. Spanish
4. Others (ask the user to specify)

Map the selection to a language code: `ja`, `zh`, `es`, etc.

### 3. Create a temporary working directory

Use Python's `tempfile.mkdtemp()` to create a temp directory for all intermediate files.

```python
import tempfile
tmpdir = tempfile.mkdtemp(prefix="translate_pdf_")
texts_json = os.path.join(tmpdir, "texts.json")
```

### 4. Extract translatable text

```bash
python scripts/extract_texts.py input.pdf $tmpdir/texts.json
```

This produces a JSON file with all text spans from each page, each with its bounding box, font info, and page number.

### 5. Translate

Read `texts.json` and translate each text span. Add a `"translated"` field to each entry.

**Translation guidelines:**
- Preserve the meaning, tone, and register of the original
- Keep proper nouns, brand names, and technical terms unchanged unless a standard localized form exists
- Maintain placeholders, numbers, URLs, and email addresses as-is
- Adapt idioms and cultural references naturally rather than translating literally
- Keep text length comparable — significantly longer translations may overflow text boxes
- For CJK to Latin translations, expect ~30% length variation; abbreviate if needed to fit

**Handling grouped text spans:**

Text in PDFs is often split across multiple spans per line. When translating:

1. Group consecutive spans within each page that form a logical phrase or sentence (same block, same line)
2. Translate the FULL phrase/sentence as a unit
3. Put the complete translated text in the **first** span of the group
4. Set remaining spans in the group to **empty string `""`** — the `apply_translations.py` script will remove them

For standalone spans (single words that are independent labels), translate directly.

**Process for large documents (>50 spans):**
1. Read `texts.json`
2. Split into batches by page groups
3. Use subagents for parallel translation — each batch handles ~5-6 pages
4. Merge results back into `texts.json`

**Process for small documents (≤50 spans):**
1. Read `texts.json`
2. Translate all spans at once
3. Write the completed file

### 6. Apply translations

```bash
python scripts/apply_translations.py input.pdf $tmpdir/texts.json output.pdf --lang <target>
```

The `--lang` flag helps select the appropriate font for the target language (e.g., CJK font for Japanese/Chinese/Korean). Use short codes: `en`, `ja`, `zh`, `ko`, `fr`, `de`, `es`, `pt`, `it`, `ru`, `ar`, `hi`, `th`, `vi`.

The output file should be placed in the same directory as the input file, with a language suffix appended (e.g., `input_JA.pdf`).

### 7. Cleanup

Remove the temporary directory:

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
- No placeholder or template text remains
- Proper nouns and brand names are preserved
- Numbers and formatting are intact

## Limitations

PDF is a display format, not an editing format. Translation quality depends on:
- **Text-based PDFs** work well; scanned/image PDFs require OCR first
- **Complex layouts** (multi-column, overlapping text boxes) may need manual adjustment
- **Fonts**: translated text uses PyMuPDF built-in fonts (Helvetica for Latin, CJK font for East Asian). Original decorative fonts will not be preserved
- **Text overflow**: if translated text is significantly longer than the original, automatic font-size reduction is applied but may not always fit perfectly
