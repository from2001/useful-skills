# useful-skills

Claude Code plugin marketplace for useful skills which I made.

## Installation

### 1. Add the marketplace

In the Claude Code CLI, run:

```
/plugin marketplace add from2001/useful-skills
```

### 2. Install a skill

## Available Skills

### convert-to-pptx

Convert a slide image or PDF into an editable PowerPoint deck. Decomposes each page into native PowerPoint shapes and text boxes (no SVG, no flattened slide image), crops icons as PNG/JPEG, then renders and visually compares the result against the source — running at least one fix-and-rerender cycle. Image-only PDFs are processed page by page.

```
/plugin install convert-to-pptx@from2001-useful-skills
```

### translate-pptx

Translate PowerPoint (.pptx) presentations between any language pair while preserving all formatting and design.

```
/plugin install translate-pptx@from2001-useful-skills
```

### translate-pdf

Translate PDF documents between any language pair while preserving layout, images, and formatting.

```
/plugin install translate-pdf@from2001-useful-skills
```

### review-and-fix-with-multiple-llm

Multi-LLM code review and auto-fix. Runs multiple review skills (Codex, GitHub Copilot, etc.) in parallel, normalizes outputs, aggregates findings by consensus with P0-P3 priority levels and confidence scoring, then fixes validated issues in priority order.

```
/plugin install review-and-fix-with-multiple-llm@from2001-useful-skills
```

### nano-banana-infographic

Generate NotebookLM-style infographic images from any topic or data using Gemini API. Produces both English and Japanese versions at 1920x1080 with identical layout.

```
/plugin install nano-banana-infographic@from2001-useful-skills
```

### nano-banana

Generate a graphic image from any text or topic using Gemini API. A simple, single-image generator for visual summaries, concept illustrations, and simple graphics.

```
/plugin install nano-banana@from2001-useful-skills
```

### csharp-roslyn-lsp

Microsoft Roslyn-based C# language server for Claude Code. Drop-in replacement for `csharp-lsp@claude-plugins-official` for projects whose `.csproj` files Roslyn handles but csharp-ls rejects (Unity, generated SDK-style csproj with explicit `Sdk.props` imports, etc.). Requires the [VS Code C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp). macOS / Linux only.

```
/plugin install csharp-roslyn-lsp@from2001-useful-skills
```

## License

MIT
