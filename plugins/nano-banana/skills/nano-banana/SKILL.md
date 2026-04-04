---
name: nano-banana
description: >
  Generate a graphic image from any text or topic using Gemini API.
  A quick, single-image generator for visual summaries, concept illustrations,
  diagrams, and simple graphics. Use this skill whenever the user wants to
  create a graphic, illustration, visual, poster, or image from text content
  — even if they just say "make a picture of this" or "visualize this".
  Triggers on phrases like "generate a graphic", "create an image",
  "make a visual", "illustrate this", "draw this", or "visualize".
---

# Nano Banana — Simple Graphic Generator

Generate a single graphic image from text using the Gemini image generation API.
This is the lightweight counterpart to nano-banana-infographic — one image, one language, minimal ceremony.

## Prerequisites

Set one of these environment variables with a valid Gemini API key:
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`
- `NANOBANANA_GEMINI_API_KEY`

## Workflow

### Step 1: Understand the request

Read what the user wants to visualize. Identify:
- **Subject**: What the graphic is about
- **Style preference**: Did the user mention a style? (e.g., "flat design", "hand-drawn", "corporate")
- **Key points**: What information should appear in the graphic

If the user's request is vague, ask one clarifying question — but default to a clean, modern infographic style if they don't specify.

- **Size**: Did the user specify dimensions or an aspect ratio? Common options:
  - `1920x1080` — landscape (default)
  - `1080x1920` — portrait / mobile
  - `1080x1080` — square / social media
  - `1200x628` — OG image / link preview
  - Or any custom dimensions the user provides

  If no size is mentioned, default to 1920x1080 landscape.

### Step 2: Build the prompt

Write a detailed image generation prompt that tells Gemini exactly what to create. A good prompt includes:

- **Dimensions**: Use the size the user requested, or 1920x1080 landscape by default
- **Visual style**: Default to a clean modern style — white or light background, flat vector illustrations, geometric sans-serif text, bold accent colors. Override if the user requested something specific.
- **Content**: The key information laid out clearly — headings, bullet points, icons, or simple charts as appropriate
- **Layout direction**: How sections should flow (left-to-right columns, grid, top-to-bottom)

Save the prompt to a temporary file for the script to read.

**Example prompt structure:**
```
Generate a [WIDTHxHEIGHT] [orientation] infographic image.

Topic: [topic]
Style: Modern flat design with white background, corporate blue (#3B5998) headings,
accent colors (#FF6B6B, #FFD93D, #6C5CE7). Clean geometric sans-serif typography.

Layout: [describe the layout — e.g., "3 columns flowing left to right"]

Content:
- Title: [title]
- Section 1: [heading + key points]
- Section 2: [heading + key points]
- Section 3: [heading + key points]

Include flat vector icons next to each section heading.
Add subtle decorative elements (dots, wavy lines) in the background.
All text must be clearly readable.
```

### Step 3: Generate the image

Run the generation script:

```bash
python3 <skill-path>/scripts/generate_image.py \
  --prompt-file <prompt-file> \
  --output <output-dir>/graphic.png \
  --model gemini-2.5-flash-image
```

For higher quality results (at the cost of speed), use `--model gemini-3-pro-image-preview`.

### Step 4: Present the result

Show the generated image to the user. Offer:
- **Regenerate** with a different style or layout
- **Refine** by editing the prompt and running again
- **Try a different model** if quality isn't satisfactory

## Tips for good results

- Keep text content short — Gemini handles brief bullet points better than dense paragraphs
- Limit to 3-5 sections for clarity
- Explicit color codes in the prompt help maintain consistency
- If the first result isn't great, try rephrasing the prompt rather than adding more constraints
