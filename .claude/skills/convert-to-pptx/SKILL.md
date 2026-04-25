---
name: convert-to-pptx
description: "Convert a slide image (PNG/JPEG) or PDF into an editable PowerPoint (.pptx) that visually matches the source. Decomposes each page into native PowerPoint shapes and text boxes (no whole-slide image, no SVG), crops icons/illustrations as PNG/JPEG, then renders the produced .pptx and visually compares it against the source — running at least one fix-and-rerender cycle before delivery. Use this skill whenever the user asks to turn a slide picture, screenshot, presentation image, or PDF into a PowerPoint file, recreate a slide as editable PPTX, or 'rebuild this image as a slide'. Triggers on phrases like 'convert this image to pptx', 'recreate this slide as PowerPoint', 'turn this PDF into editable slides', 'make this picture editable in PowerPoint', or 'rebuild as pptx'. Also handles image-only PDFs by looping the per-slide workflow over each page."
---

# Convert to PPTX

Reproduce a slide image — or every page of a PDF — as an **editable** PowerPoint deck.

The point of this skill is *editable* output. The user must be able to click a title and retype it, drag a card to a new position, recolor a band, etc. So the slide is rebuilt from native PowerPoint primitives (text boxes + shapes), with only icons/illustrations brought in as raster images. Pasting the whole slide as a single picture defeats the purpose and is explicitly disallowed.

The other non-negotiable: never deliver a first-pass result. PowerPoint layout differs subtly from PIL/Pillow rendering, fonts substitute, and text reflow surprises you. So after building the deck, render it back to images, eyeball-compare against the source, and fix what looks wrong. At least one full fix-and-rerender pass.

## Inputs

- **Image** (`.png`, `.jpg`, `.jpeg`, `.webp`) — produces a 1-slide deck
- **PDF** (`.pdf`) — produces an N-slide deck, one slide per PDF page. The same per-slide workflow runs in a loop. This works even when the PDF is just a sequence of full-page images (a scanned/exported image-PDF).

## Prerequisites

Python packages:
- `python-pptx` — build the .pptx
- `Pillow` — image cropping for icons
- `pymupdf` — render PDF pages to PNG (only needed when input is a PDF)

System tool for rendering verification:
- **LibreOffice** (`soffice`) headless — converts the produced .pptx back to images so you can compare against the source. Install with `brew install --cask libreoffice` on macOS, or `apt install libreoffice` on Linux. If LibreOffice is genuinely unavailable, fall back to `unoconv` or PowerPoint's CLI; if neither is present, tell the user — do not skip the verification step.

## Workflow

### Step 0 — Branch on input type

Inspect the input file extension.

- If it is an image: skip to **Step 1** with that single image as the source.
- If it is a PDF: run **Step PDF-A** to split it into per-page PNGs first, then run **Steps 1–9 in a loop**, once per page, accumulating slides into a single output deck. Treat each page exactly like a standalone slide image — the page number, layout, text, icons, and verification all happen per-page.

```python
ext = Path(input_path).suffix.lower()
if ext == ".pdf":
    page_images = run("scripts/pdf_to_images.py", input_path, tmpdir/"pages")
else:
    page_images = [input_path]
```

### Step PDF-A — Split a PDF into per-page images (PDF input only)

```bash
python scripts/pdf_to_images.py input.pdf <tmpdir>/pages/ --dpi 200
```

Output: `<tmpdir>/pages/page-001.png`, `page-002.png`, …  Use 200 DPI by default; bump to 300 if the source has small text or fine icons that need to be crop-able.

### Step 1 — Decompose the source slide

Look at the slide image and break it into the elements that actually exist on it. Not every slide has every element — pick the ones that are there. Common elements to look for:

- Background and any background decorations (gradients, soft shapes in corners, watermarks)
- Title
- Message / call-out box
- Cards (left card, right card, or a row/grid of cards)
- Section headings
- Highlight figures (price, large number, KPI)
- Bullet lists
- Horizontal bands / dividers (e.g. a pale-cyan strip across the middle)
- Warning / alert bars
- Conclusion box at the bottom
- Page number
- Icons and small illustrations

Write down the rough x/y/width/height of each element in slide-relative coordinates. You will use this list as your build checklist.

### Step 2 — Decide what is a shape vs. what is a raster crop

Apply this rule:

| Element type                                              | How to recreate                              |
| --------------------------------------------------------- | -------------------------------------------- |
| Any text (title, body, bullets, page number, labels…)     | **Editable PowerPoint text box**             |
| Frames, lines, bands, cards, rounded panels, backgrounds  | **PowerPoint shape** (rectangle, rounded-rectangle, line, etc.) |
| Icons, pictograms, photos, illustrations                  | **Cropped PNG/JPEG** inserted as a picture   |

Hard rules:
- **No SVG anywhere** in the output deck.
- **Never paste the whole slide as a single image.** That makes the deck non-editable, which is the whole reason this skill exists.
- If you find yourself thinking "I'll just screenshot the card and drop it in" — stop. The card outline is a shape, the text inside is a text box. Only the *icon* inside the card is a raster crop.

### Step 3 — Crop icons from the source

For each icon you identified in Step 1, crop a tight bounding box out of the source image with Pillow and save it as PNG (preserve transparency where possible — if the icon sits on a colored card, crop with that background and accept it; do not try to alpha-key it). Save crops to `<tmpdir>/assets/icon-<name>.png`.

```python
from PIL import Image
img = Image.open(source_image)
icon = img.crop((x1, y1, x2, y2))
icon.save(tmpdir / "assets" / "icon-message.png")
```

Typical icons to harvest from business slides: message bubble, eye, eye-with-slash (privacy), document-with-yen/dollar, search/magnifier, mail, refresh, clock, calculator, warning triangle. Crop only the ones that are actually in the source.

If an icon in the source is too small, blurry, or partially cut off to crop cleanly, generate a replacement instead — use the `nano-banana` skill or any available image-generation tool, requesting a flat-style icon on a transparent or matching background. Save the generated icon under the same `assets/` directory and treat it identically to a crop.

### Step 4 — Build the deck

Slide size: **16:9, 13.333" × 7.5"** (the python-pptx defaults to 4:3 — set this explicitly).

```python
from pptx import Presentation
from pptx.util import Inches
prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
```

For each source page (1 if image input, N if PDF input):

1. Add a blank slide to `prs`.
2. Place a background-color rectangle covering the full slide if the source has a non-white background.
3. Place each shape from your Step-1 element list — match position, size, fill color, line color, and corner radius.
4. Place each text box — match position, size, font color, font size, alignment, and font weight. Set the text box width so the text **does not wrap** unless the source actually wraps it.
5. Insert each cropped icon at the position the corresponding icon occupies in the source.

Color guidance from typical Japanese business slides (use these as defaults if you cannot read exact colors from the source):
- Body text: dark navy `#1F2A44` or similar
- Accent / highlight: bright blue `#2E7DF6`
- Pale band: light cyan `#E6F2FA`
- Page background tint: very light gray `#F5F6F8`
- Card outline: thin gray rule, ~0.75pt
- Card corners: rounded, radius ~0.1"

Always sample real colors from the source image when you can — these defaults are only a starting point.

### Step 5 — Get the text exactly right

Text accuracy is the single most common failure mode. When transcribing:

- No typos. Re-read each text box against the source after typing it.
- Keep full-width vs. half-width characters as in the source (especially for Japanese punctuation, digits, and units — `１,０００円` vs. `1,000円` is a real difference).
- Preserve numbers, units, and punctuation exactly.
- Resize the text box (or shrink the font by 1–2pt) so a one-line heading stays one line. Unintended wrapping is a common cause of "looks broken" feedback.

### Step 6 — Save the deck

```python
prs.save(output_path)
```

Place the output next to the input file: e.g. `report.pdf` → `report.pptx`, `slide.png` → `slide.pptx`.

### Step 7 — Render the produced .pptx back to images (REQUIRED)

```bash
python scripts/render_pptx.py output.pptx <tmpdir>/render/ --dpi 150
```

This drives LibreOffice headlessly to produce `render/slide-001.png`, `slide-002.png`, …

If `render_pptx.py` exits non-zero because LibreOffice is missing, install it or report the blocker — **do not skip this step and ship anyway.** The whole skill assumes the deck has been visually verified.

### Step 8 — Visual diff and fix

For each slide, open the rendered image alongside the source image and check, in this order:

1. Title position and size
2. Message box position and height
3. Left/right card position, width, height
4. Heading icon position
5. Big-number / price display size
6. Line spacing inside bullet lists
7. Mid-slide band height
8. Warning bar position
9. Bottom conclusion box position, height, font size
10. Page number
11. Any unintended text wrapping
12. Margins and whitespace that feel wrong

If anything is visibly off, edit the build code from Step 4 (move shapes, resize boxes, change font sizes, replace a crop, etc.), re-save, and re-render.

**Run at least one fix-and-rerender cycle.** Even if the first render looks roughly right, look hard for one thing to improve and tighten it. Two cycles is normal. Do not deliver a deck that obviously does not match the source.

### Step 9 — Final structural check

Before declaring done, run:

```bash
python scripts/verify_pptx.py output.pptx
```

This script asserts:
- No `.svg` parts inside the .pptx zip
- No single picture covers the whole slide (catches the "I just pasted the screenshot" failure mode)
- The deck contains real text frames (i.e. text is editable, not flattened to an image)
- The deck contains multiple individually-selectable shapes per slide

If the script fails, the deck is not deliverable — go back and fix it.

### Step PDF-B — Multi-page assembly notes (PDF input only)

When the input is a PDF, do **not** build N separate decks and concatenate them. Use one `Presentation()` object and append slides to it inside the per-page loop. That keeps the slide master, theme, and page size consistent across pages.

If the PDF is "just images" (a scanned PDF or an image-export PDF), each page is treated as one slide image and goes through Steps 1–6 unchanged — you still decompose into shapes and text boxes per page; you do not paste the page image into the slide.

If the PDF has 20+ pages, ask the user whether they want every page rebuilt or only a subset (e.g. "first 5", "pages 3–8"). Rebuilding a 50-page deck this way is slow, and most users only want a few pages.

## Deliverable checklist

- [ ] `output.pptx` exists next to the input file
- [ ] No SVG inside the file
- [ ] No full-slide image
- [ ] All text is editable in PowerPoint
- [ ] Every shape is individually selectable
- [ ] Slide size is 13.333" × 7.5" (16:9)
- [ ] Render-and-compare ran at least once after the initial build
- [ ] Visible discrepancies from the comparison were fixed before delivery

## Common pitfalls

- **Whole-slide screenshot trap.** It is tempting, when reproduction is hard, to paste the source as a background image and add a couple of text boxes on top. Don't. The verification script will catch this and the deck is not deliverable.
- **SVG sneaking in.** `python-pptx` doesn't emit SVG, but if you let an LLM image generator return SVG and embed it, the deck will fail verification. Convert any SVG to PNG before insertion.
- **Font substitution surprises.** LibreOffice may render with a different font than PowerPoint will. Treat small kerning/baseline differences in the comparison render as expected; treat large position or wrap differences as real bugs.
- **Forgetting the 16:9 size.** `python-pptx` defaults to 10" × 7.5" (4:3). Set the slide width to 13.333" *before* adding slides.
- **Skipping verification on multi-page PDFs.** It is doubly important on PDFs because errors compound across pages. Render every page, not just page 1.
