---
name: nano-banana-infographic
description: Generate NotebookLM-style infographic images from any topic or data using Gemini API. Converts information into a structured design JSON, then generates professional infographic images in both English and Japanese with identical layout. Use this skill when the user asks to create an infographic, data visualization poster, summary graphic, knowledge map, or visual summary of information. Triggers on words like "infographic", "visual summary", "information graphic", "data poster", or "summarize visually".
---

# Nano Banana Infographic Generator

Generate professional infographic images by converting information into structured designs, then rendering via Gemini API. Always produces both English and Japanese versions at 1920x1080 landscape resolution with identical layout.

## Prerequisites

One of these environment variables must be set: `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `NANOBANANA_GEMINI_API_KEY`.

## Workflow

1. **Analyze** - Understand the user's topic, data, or content
2. **Design** - Create ONE bilingual design JSON (en/ja in same structure)
3. **Generate EN** - Generate English version from text prompt
4. **Generate JA** - Edit the English image, replacing text only with Japanese (keeps identical layout)
5. **Present** - Show both results and offer refinements

## Step 1: Analyze the Input

Determine the best infographic layout from the user's input:

| Input Type | Recommended Layout |
|---|---|
| General topic / summary | horizontal 3-4 columns |
| Numbers / statistics | grid |
| Steps / how-to / process | horizontal columns or timeline |
| A vs B / pros-cons | comparison |
| History / chronology | timeline |
| Ecosystem / relationships | radial |

If the user provides raw text, a URL, or a document, extract the key information first.

## Step 2: Create ONE Bilingual Design JSON

Build a single design JSON with both en/ja text. See `references/design-templates.md` for schema and templates.

Essential fields:
- `title` / `subtitle` - concise, impactful (en + ja)
- `layout` - horizontal, grid, timeline, comparison, etc.
- `sections` - 3-6 sections, each with type, heading, icon, accent, and content (en + ja)
- `dimensions` - always `1920x1080`

Content guidelines:
- Keep text short. Prefer bullet points over paragraphs.
- Limit to 3-6 sections.
- Japanese text should be short: headings 6-10 characters, bullet points fit in one line.
- Japanese translation should be literal / direct. Keep the same number of bullet points as English.
- Do NOT add extra explanations in Japanese that don't exist in English.

## Step 3: Generate English Version

Build the English prompt with the fixed design style and content, then generate.

### English Prompt Template

```
Create a professional landscape infographic poster (1920x1080 pixels).

Title: "{title_en}"
Subtitle: "{subtitle_en}"

MANDATORY DESIGN STYLE (apply exactly):
- Tone: Friendly, professional, trustworthy, modern, inclusive
- Background: White or very light pastel gray, clean and airy
- Primary text color: #3B5998 (Corporate Blue)
- Accent colors: #FF6B6B (Accent Red), #FFD93D (Accent Yellow), #6C5CE7 (Soft Purple)
- Visual style: Modern tech company style using flat vectors and playful Memphis patterns
- Memphis decorative elements throughout: wavy lines, dots, triangles, organic blob shapes in the accent colors (#FF6B6B, #FFD93D, #6C5CE7)
- Imagery: Flat character illustrations with large hands and feet, simplified objects, vector scenes
- Composition: Balanced, rule of thirds, generous whitespace
- Typography: Clean, legibility-focused, medium weight, modern geometric sans-serif (Open Sans, Roboto style)
- Icons: Flat design style, colored with accent colors

Layout sections:

[Section 1 - {accent} accent] {heading_en}
{icon_description}
{content_en}

[Section 2 - {accent} accent] {heading_en}
{icon_description}
{content_en}

...

Footer: {footer_en}

Design requirements: Clean modern typography, clear visual hierarchy, professional infographic layout. Memphis pattern decorative elements (dots, triangles, wavy lines, organic blobs) scattered in #FF6B6B, #FFD93D, #6C5CE7. Flat vector illustration style. White or very light pastel gray background. Generous whitespace. No stock photos. All text must be crisp and readable.
```

### Run EN Generation

```bash
cat <<'EOF' > /tmp/infographic_prompt_en.txt
{english_prompt}
EOF

python3 scripts/generate_infographic.py \
  --prompt-file /tmp/infographic_prompt_en.txt \
  --output ./nanobanana-output/{name}_en.png \
  --model gemini-3-pro-image-preview
```

## Step 4: Generate Japanese Version (Edit EN Image)

Use the English image as input and replace text only. This guarantees identical layout, graphics, and decorative elements.

### Japanese Edit Prompt Template

Build a prompt that lists every text replacement explicitly:

```
CRITICAL INSTRUCTIONS:
- Keep ALL graphics, layout, icons, illustrations, decorative elements, colors, and composition EXACTLY unchanged.
- ONLY replace the text content from English to Japanese.
- Do NOT move, resize, recolor, or rearrange any visual element.
- Use a Japanese-compatible font (Noto Sans JP or similar) at maximum precision.
- Every Japanese character must be crisp, correct, and perfectly readable.

Text replacements (replace English text with the corresponding Japanese):

Title: "{title_en}" → "{title_ja}"
Subtitle: "{subtitle_en}" → "{subtitle_ja}"

Section 1 heading: "{heading1_en}" → "{heading1_ja}"
Section 1 content:
  "{content1_line1_en}" → "{content1_line1_ja}"
  "{content1_line2_en}" → "{content1_line2_ja}"
  ...

Section 2 heading: "{heading2_en}" → "{heading2_ja}"
Section 2 content:
  "{content2_line1_en}" → "{content2_line1_ja}"
  ...

...

Footer: "{footer_en}" → "{footer_ja}"

Output the edited image with ONLY text replaced. Everything else must remain pixel-identical.
```

### Run JA Edit

```bash
cat <<'EOF' > /tmp/infographic_prompt_ja_edit.txt
{japanese_edit_prompt}
EOF

python3 scripts/generate_infographic.py \
  --input-image ./nanobanana-output/{name}_en.png \
  --prompt-file /tmp/infographic_prompt_ja_edit.txt \
  --output ./nanobanana-output/{name}_ja.png \
  --model gemini-3-pro-image-preview
```

## Step 5: Present and Refine

After generation:
1. Show both images (EN and JA) to the user using the Read tool
2. Verify layouts match between EN and JA versions
3. Offer refinement options:
   - **Content edit** - modify section text, regenerate EN then re-edit JA
   - **Layout change** - regenerate EN with new layout, then re-edit JA
   - **Variations** - regenerate EN with `--count 3`, then edit best one to JA

## Script Options

| Option | Description | Default |
|---|---|---|
| `--prompt "text"` | Prompt text | - |
| `--prompt-file path` | Read prompt from file (recommended) | - |
| `--input-image path` | Source image for editing mode | - (generate mode) |
| `--output path` | Output file path | `nanobanana-output/infographic.png` |
| `--model name` | Gemini model ID | `gemini-2.5-flash-image` |
| `--count N` | Generate N variations (1-8) | 1 |

Always use `--model gemini-3-pro-image-preview` for infographics.

## Quick Example

Design JSON:
```json
{
  "title": { "en": "Remote Work Revolution", "ja": "リモートワーク革命" },
  "subtitle": { "en": "Why remote work is here to stay", "ja": "リモートワークが定着する理由" },
  "layout": "horizontal 3-column",
  "sections": [
    {
      "heading": { "en": "Key Stats", "ja": "主要データ" },
      "accent": "#FF6B6B",
      "content": {
        "en": "77% want flexibility | 25% productivity boost",
        "ja": "77%が柔軟性を希望 | 生産性25%向上"
      }
    },
    {
      "heading": { "en": "Benefits", "ja": "メリット" },
      "accent": "#FFD93D",
      "content": {
        "en": "Work-life balance | No commute | Wider talent pool",
        "ja": "ワークライフバランス | 通勤不要 | 広い人材プール"
      }
    },
    {
      "heading": { "en": "Success Keys", "ja": "成功の鍵" },
      "accent": "#6C5CE7",
      "content": {
        "en": "Clear communication | Regular check-ins | Results-based eval",
        "ja": "明確なコミュニケーション | 定期チェックイン | 成果ベース評価"
      }
    }
  ],
  "footer": { "en": "Source: Stanford Research", "ja": "出典: スタンフォード大学研究" }
}
```

EN generation → JA edit of EN image → Both outputs share identical layout.

## Resources

- `scripts/generate_infographic.py` - Image generation and editing script via Gemini API (supports `--input-image` for edit mode)
- `references/design-templates.md` - Full design JSON schema, layout types, and bilingual templates
