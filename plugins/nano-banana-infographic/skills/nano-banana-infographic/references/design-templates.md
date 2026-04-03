# Infographic Design Templates

## Fixed Design Style

All infographics use this mandatory design style:

- **Resolution**: 1920x1080 (landscape)
- **Background**: White or very light pastel gray
- **Text color**: #3B5998 (Corporate Blue)
- **Accent colors**: #FF6B6B (Red), #FFD93D (Yellow), #6C5CE7 (Purple)
- **Visual style**: Modern tech company with flat vectors and Memphis patterns
- **Memphis elements**: Wavy lines, dots, triangles, organic blobs in accent colors
- **Imagery**: Flat characters with large hands/feet, simplified objects, vector scenes
- **Typography**: Clean geometric sans-serif (Open Sans / Roboto style), medium weight
- **Composition**: Balanced, rule of thirds, generous whitespace

## Design JSON Schema

```json
{
  "title": { "en": "English title", "ja": "Japanese title" },
  "subtitle": { "en": "English subtitle", "ja": "Japanese subtitle" },
  "layout": "horizontal|grid|timeline|comparison|radial",
  "sections": [
    {
      "type": "header|stat|list|comparison|timeline|quote|cta|chart-description",
      "heading": { "en": "English heading", "ja": "Japanese heading" },
      "icon": "icon description with accent color",
      "accent": "#FF6B6B|#FFD93D|#6C5CE7",
      "content": { "en": "English content", "ja": "Japanese content" }
    }
  ],
  "footer": { "en": "English footer", "ja": "Japanese footer" },
  "dimensions": "1920x1080"
}
```

## Layout Types

### horizontal (default for 1920x1080)
Left-to-right column flow. Best for: general purpose, storytelling, feature overviews. Use 3-4 columns.

### grid
Equal-sized cards in grid. Best for: categorized data, stat dashboards, feature lists.

### timeline
Chronological left-to-right flow. Best for: history, project plans, evolution.

### comparison
Side-by-side columns. Best for: pros/cons, before/after, product comparison.

### radial
Central topic with radiating subtopics. Best for: mind maps, ecosystem overviews.

## Accent Color Assignment

Distribute accent colors across sections for visual variety:
- First section: #FF6B6B (Red) - draws attention, good for problems/challenges
- Second section: #FFD93D (Yellow) - warm, good for solutions/highlights
- Third section: #6C5CE7 (Purple) - calm, good for technical details/architecture
- Fourth section: #3B5998 (Blue) - trustworthy, good for results/impact

## Template: General Purpose (Horizontal)

```json
{
  "title": { "en": "Topic Title", "ja": "トピックタイトル" },
  "subtitle": { "en": "Key insight or tagline", "ja": "キーインサイトまたはタグライン" },
  "layout": "horizontal 4-column",
  "sections": [
    {
      "type": "header",
      "heading": { "en": "Overview", "ja": "概要" },
      "icon": "lightbulb with red accent",
      "accent": "#FF6B6B",
      "content": { "en": "Brief introduction", "ja": "簡潔な紹介文" }
    },
    {
      "type": "stat",
      "heading": { "en": "Key Numbers", "ja": "主要数値" },
      "icon": "chart with yellow accent",
      "accent": "#FFD93D",
      "content": { "en": "3 key statistics", "ja": "3つの主要統計" }
    },
    {
      "type": "list",
      "heading": { "en": "Main Points", "ja": "主なポイント" },
      "icon": "checkmark with purple accent",
      "accent": "#6C5CE7",
      "content": { "en": "3-5 bullet points", "ja": "3-5つの箇条書き" }
    },
    {
      "type": "quote",
      "heading": { "en": "Takeaway", "ja": "まとめ" },
      "icon": "star with blue accent",
      "accent": "#3B5998",
      "content": { "en": "Key conclusion", "ja": "重要な結論" }
    }
  ],
  "footer": { "en": "Source: ...", "ja": "出典: ..." },
  "dimensions": "1920x1080"
}
```

## Template: Problem-Solution (Horizontal)

```json
{
  "title": { "en": "Feature Name", "ja": "機能名" },
  "subtitle": { "en": "Tagline", "ja": "タグライン" },
  "layout": "horizontal 4-column",
  "sections": [
    {
      "type": "list",
      "heading": { "en": "The Problem", "ja": "課題" },
      "icon": "frustrated person with red X, red accent",
      "accent": "#FF6B6B",
      "content": { "en": "Pain points", "ja": "ペインポイント" }
    },
    {
      "type": "header",
      "heading": { "en": "The Solution", "ja": "解決策" },
      "icon": "lightbulb or toggle, yellow accent",
      "accent": "#FFD93D",
      "content": { "en": "Solution description", "ja": "解決策の説明" }
    },
    {
      "type": "chart-description",
      "heading": { "en": "How It Works", "ja": "仕組み" },
      "icon": "architecture diagram, purple accent",
      "accent": "#6C5CE7",
      "content": { "en": "Technical details", "ja": "技術的な詳細" }
    },
    {
      "type": "list",
      "heading": { "en": "The Impact", "ja": "効果" },
      "icon": "rocket, blue accent",
      "accent": "#3B5998",
      "content": { "en": "Benefits", "ja": "メリット" }
    }
  ],
  "footer": { "en": "Footer text", "ja": "フッターテキスト" },
  "dimensions": "1920x1080"
}
```

## Template: Statistics & Data (Grid)

```json
{
  "title": { "en": "Data Title", "ja": "データタイトル" },
  "subtitle": { "en": "Period or scope", "ja": "期間または範囲" },
  "layout": "grid 2x2",
  "sections": [
    {
      "type": "stat",
      "heading": { "en": "Metric 1", "ja": "指標1" },
      "icon": "trending-up with red accent",
      "accent": "#FF6B6B",
      "content": { "en": "Large number + label", "ja": "大きな数字 + ラベル" }
    },
    {
      "type": "stat",
      "heading": { "en": "Metric 2", "ja": "指標2" },
      "icon": "users with yellow accent",
      "accent": "#FFD93D",
      "content": { "en": "Large number + label", "ja": "大きな数字 + ラベル" }
    },
    {
      "type": "stat",
      "heading": { "en": "Metric 3", "ja": "指標3" },
      "icon": "bar-chart with purple accent",
      "accent": "#6C5CE7",
      "content": { "en": "Large number + label", "ja": "大きな数字 + ラベル" }
    },
    {
      "type": "list",
      "heading": { "en": "Key Insights", "ja": "主な知見" },
      "icon": "zap with blue accent",
      "accent": "#3B5998",
      "content": { "en": "3 findings", "ja": "3つの知見" }
    }
  ],
  "footer": { "en": "Data source", "ja": "データソース" },
  "dimensions": "1920x1080"
}
```

## Template: Comparison

```json
{
  "title": { "en": "A vs B", "ja": "A vs B" },
  "subtitle": { "en": "Side-by-side comparison", "ja": "並列比較" },
  "layout": "comparison",
  "sections": [
    {
      "type": "comparison",
      "heading": { "en": "Option A", "ja": "選択肢A" },
      "icon": "left column with red accent",
      "accent": "#FF6B6B",
      "content": { "en": "Features of A", "ja": "Aの特徴" }
    },
    {
      "type": "comparison",
      "heading": { "en": "Option B", "ja": "選択肢B" },
      "icon": "right column with purple accent",
      "accent": "#6C5CE7",
      "content": { "en": "Features of B", "ja": "Bの特徴" }
    }
  ],
  "footer": { "en": "", "ja": "" },
  "dimensions": "1920x1080"
}
```

## Template: Timeline

```json
{
  "title": { "en": "Evolution of [Topic]", "ja": "[トピック]の変遷" },
  "subtitle": { "en": "From [start] to [end]", "ja": "[開始]から[終了]まで" },
  "layout": "timeline horizontal",
  "sections": [
    {
      "type": "timeline",
      "heading": { "en": "Phase 1", "ja": "フェーズ1" },
      "icon": "calendar with red accent",
      "accent": "#FF6B6B",
      "content": { "en": "Event description", "ja": "イベントの説明" }
    },
    {
      "type": "timeline",
      "heading": { "en": "Phase 2", "ja": "フェーズ2" },
      "icon": "calendar with yellow accent",
      "accent": "#FFD93D",
      "content": { "en": "Event description", "ja": "イベントの説明" }
    },
    {
      "type": "timeline",
      "heading": { "en": "Phase 3", "ja": "フェーズ3" },
      "icon": "calendar with purple accent",
      "accent": "#6C5CE7",
      "content": { "en": "Event description", "ja": "イベントの説明" }
    }
  ],
  "footer": { "en": "", "ja": "" },
  "dimensions": "1920x1080"
}
```
