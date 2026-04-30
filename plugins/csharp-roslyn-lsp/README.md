# csharp-roslyn-lsp

Microsoft Roslyn-based C# language server for Claude Code, packaged as a drop-in alternative to the official `csharp-lsp@claude-plugins-official` plugin.

## Why this plugin

Claude Code's stock `csharp-lsp` plugin uses [`csharp-ls`](https://github.com/razzmatazz/csharp-language-server). Its MSBuild project loader rejects some valid `.csproj` files with `Microsoft.Build.Exceptions.InvalidProjectFileException` — most notably Unity's generated projects, which use `<Project>` + an explicit `<Import Sdk="Microsoft.NET.Sdk" />` instead of the simpler `<Project Sdk="...">` form. The result is that LSP operations (`documentSymbol`, `hover`, `findReferences`, etc.) silently return nothing for those files.

This plugin runs the same Roslyn-based language server that the VS Code C# extension uses, which loads those projects without complaint.

## Requirements

- The [VS Code C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp) (`ms-dotnettools.csharp`) installed at the user level. The launcher auto-detects the latest installed version and reuses its bundled Roslyn server and .NET runtime.
- macOS or Linux on arm64 or x86_64. Windows is not currently supported (the launcher is a Bash script).

## Installation

```text
/plugin marketplace add from2001/useful-skills
/plugin install csharp-roslyn-lsp@from2001-useful-skills
```

If the official `csharp-lsp` plugin is also enabled, disable it for this project so both servers do not race for `.cs` files:

```jsonc
// .claude/settings.local.json (or settings.json, project-scoped)
{
  "enabledPlugins": {
    "csharp-lsp@claude-plugins-official": false,
    "csharp-roslyn-lsp@from2001-useful-skills": true
  }
}
```

Then `/reload-plugins`.

## Verifying

After install, ask Claude Code to use its `LSP` tool with `documentSymbol` on any `.cs` file. The wrapper logs to `$TMPDIR/claude-csharp-roslyn-lsp/`, and the running process appears in `pgrep -af Microsoft.CodeAnalysis.LanguageServer` as a child of `dotnet`.

## Troubleshooting

- **`VS Code C# extension not found`** — install the extension. The wrapper globs `~/.vscode/extensions/ms-dotnettools.csharp-*-<os>-<arch>`; if you use a non-standard VS Code variant (e.g., a portable install), make sure that extensions directory exists.
- **`no .NET host found`** — install either the VS Code C# extension (it brings a matching .NET runtime via `ms-dotnettools.vscode-dotnet-runtime`) or .NET 10+ system-wide.
- **No symbols returned but no error** — check the running process with `pgrep -af LanguageServer`. If only `csharp-ls` is running, the plugin is not loaded; verify `enabledPlugins` and run `/reload-plugins`.
