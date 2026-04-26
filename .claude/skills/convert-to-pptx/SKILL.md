---
name: convert-to-pptx
description: "Convert a slide image (PNG/JPEG) or PDF into an editable PowerPoint (.pptx) that visually matches the source — rebuilt from native shapes and text boxes, then render-compared against the original. Use when the user asks to turn a slide image, screenshot, or PDF into editable PowerPoint, or to 'rebuild this as a slide'."
---

# Convert to PPTX

Reproduce a slide image — or every page of a PDF — as an **editable** PowerPoint deck.

## The two non-negotiables

1. **Editable output.** Rebuild the slide from native PowerPoint primitives — text boxes for text, shapes for frames/bands/cards/backgrounds, cropped PNG/JPEG only for icons and illustrations. **No SVG. Never paste the whole slide as a single image.** If the user can't click a title and retype it, the skill has failed.
2. **Render and compare before delivering.** PowerPoint layout differs from your mental model — fonts substitute, text reflows, positions drift. After building the deck, render it back to images, eyeball-compare against the source, fix what looks wrong, and re-render. **At least one fix-and-rerender cycle.** Don't ship a first pass.

## Inputs

- Image (`.png`, `.jpg`, `.jpeg`, `.webp`) → 1-slide deck
- PDF (`.pdf`) → N-slide deck, one slide per page (works even for image-only PDFs)

## Tooling

- Python: `python-pptx` (build), `Pillow` (crop icons), `pymupdf` (PDF → PNG, only if input is PDF)
- LibreOffice (`soffice`) headless for the render-back step. Install with `brew install --cask libreoffice` / `apt install libreoffice` / `winget install TheDocumentFoundation.LibreOffice`. If it's genuinely unavailable, fall back to `unoconv` or PowerPoint's CLI — but do not skip the verification step.

> **Sandbox note.** LibreOffice writes profile data outside the project directory (e.g. `~/Library/Application Support/LibreOffice` on macOS, `~/.config/libreoffice` on Linux), so `render_pptx.py` will fail when Claude Code's sandbox is enabled. If the render step errors out with a permission/sandbox failure, ask the user to approve running `render_pptx.py` outside the sandbox (or to disable the sandbox for this turn). Do not silently skip the verification cycle.

Helpers in `scripts/`:
- `pdf_to_images.py input.pdf <outdir>/ --dpi 200` — split a PDF into per-page PNGs
- `render_pptx.py output.pptx <outdir>/ --dpi 150` — render the produced deck back to PNGs
- `verify_pptx.py output.pptx` — assert no SVG, no full-slide image, real text frames, multiple shapes per slide

## Workflow

For a PDF input, split it with `pdf_to_images.py` first, then loop the per-slide workflow over each page, accumulating slides into **one** `Presentation()` object (don't build N decks and concatenate).

Per slide:

1. **Decompose the source.** Look at the image and list the elements that actually exist — background, title, message/callout boxes, cards, headings, big numbers, bullet lists, bands, alerts, conclusion box, page number, icons. Note rough position and size for each.

2. **Classify each element.** Text → editable text box. Frames/bands/cards/backgrounds → shapes. Icons/illustrations → cropped PNG/JPEG from the source (use Pillow). If an icon is too small or blurry to crop cleanly, generate a replacement with the `nano-banana` skill or any image generator and treat it the same way.

3. **Build the slide.** Set slide size to 16:9 (`13.333" × 7.5"` — `python-pptx` defaults to 4:3, so set this explicitly). Place background, then shapes, then text boxes, then cropped icons. Sample real colors from the source image rather than guessing.

4. **Get the text exactly right.** No typos. Preserve full-width vs half-width characters, numbers, units, and punctuation as they appear. Size the text box so headings don't unintentionally wrap.

5. **Save** the deck next to the input file (`report.pdf` → `report.pptx`).

6. **Render and compare.** Run `render_pptx.py`, view the rendered PNGs alongside the source, and look for anything visibly off — title placement, card sizes, big-number scale, line spacing, band height, unintended text wrapping, margins. Fix what's wrong, re-save, re-render. At least one cycle.

7. **Final check.** Run `verify_pptx.py` — it'll fail the deck if SVG sneaked in, if a full-slide image is present, if text got flattened, or if the slide has only one shape (the screenshot trap).

For long PDFs (20+ pages), ask the user whether they want every page rebuilt or only a subset before starting.

## Deliverable

An editable `.pptx` next to the input, no SVG, no whole-slide image, all text editable, every shape individually selectable, 16:9, with no obvious visual discrepancy from the source after at least one fix-and-rerender pass.
