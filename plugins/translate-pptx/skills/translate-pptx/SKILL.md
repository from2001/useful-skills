---
name: translate-pptx
description: "Translate PowerPoint (.pptx) presentations between any language pair while preserving all formatting, layouts, images, and design. Use this skill when the user asks to translate a .pptx file, convert a presentation to another language, localize slides, or mentions translating a deck or slide content. Triggers on requests like 'translate this pptx to English', 'localize this presentation into Japanese', or 'convert these slides to French'."
---

# Translate PPTX

Translate PowerPoint presentations while preserving all formatting and design.

All intermediate files (unpacked XML, JSON) are written to a temporary directory and cleaned up automatically.

## Prerequisites

- `defusedxml` — XML parsing
- `lxml` — XML validation
- `markitdown[pptx]` — text extraction for review

## Workflow

### 1. Analyze the source presentation

```bash
python -m markitdown input.pptx
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

Use Python's `tempfile.mkdtemp()` to create a temp directory for all intermediate files. Store the path in a variable for use in subsequent steps.

```python
import tempfile
tmpdir = tempfile.mkdtemp(prefix="translate_pptx_")
unpacked_dir = os.path.join(tmpdir, "unpacked")
texts_json = os.path.join(tmpdir, "texts.json")
```

### 4. Unpack

```bash
python scripts/office/unpack.py input.pptx $tmpdir/unpacked/
```

### 5. Extract translatable text

```bash
python scripts/extract_texts.py $tmpdir/unpacked/ $tmpdir/texts.json
```

This produces a JSON file with all `<a:t>` text segments from slides and speaker notes, each with its file path and index.

### 6. Translate

Read `texts.json` and translate each text segment. Add a `"translated"` field to each entry.

**Translation guidelines:**
- Preserve the meaning, tone, and register of the original
- Keep proper nouns, brand names, and technical terms unchanged unless a standard localized form exists
- Maintain placeholders, numbers, URLs, and email addresses as-is
- Adapt idioms and cultural references naturally rather than translating literally
- Keep text length comparable — significantly longer translations may overflow text boxes
- For CJK to Latin translations, expect ~30% length variation; abbreviate if needed to fit

**CRITICAL: Handling word-by-word segments**

Text in PPTX is split across individual `<a:t>` XML elements, often word-by-word. When translating:

1. Group consecutive segments within each slide that form a logical phrase or sentence
2. Translate the FULL phrase/sentence as a unit
3. Put the complete translated text in the **first** segment of the group
4. Set remaining segments in the group to **empty string `""`** — the `apply_translations.py` script will replace these with empty text in the XML, removing the original English

For standalone segments (single words that are independent labels), translate directly.

**Process for large presentations (>50 segments):**
1. Read `texts.json`
2. Split into batches by slide groups
3. Use subagents for parallel translation — each batch handles ~5-6 slides
4. Merge results back into `texts.json`

**Process for small presentations (≤50 segments):**
1. Read `texts.json`
2. Translate all segments at once
3. Write the completed file

### 7. Apply translations

```bash
python scripts/apply_translations.py $tmpdir/unpacked/ $tmpdir/texts.json --lang <target>
```

The `--lang` flag sets the language attribute on text runs. Use short codes: `en`, `ja`, `zh`, `ko`, `fr`, `de`, `es`, `pt`, `it`, `ru`, `ar`, `hi`, `th`, `vi` — or a full BCP 47 tag like `en-US`.

### 8. Clean and pack

```bash
python scripts/office/clean.py $tmpdir/unpacked/
python scripts/office/pack.py $tmpdir/unpacked/ translated.pptx --original input.pptx
```

The output file should be placed in the same directory as the input file, with a language suffix appended (e.g., `input_JA.pptx`).

### 9. Cleanup

Remove the temporary directory:

```python
import shutil
shutil.rmtree(tmpdir)
```

### 10. QA

```bash
python -m markitdown translated.pptx
```

Verify:
- All text segments are translated (no source language remnants)
- No placeholder or template text remains
- Proper nouns and brand names are preserved
- Numbers and formatting are intact
