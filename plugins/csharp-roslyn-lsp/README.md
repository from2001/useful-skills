# csharp-roslyn-lsp

Microsoft Roslyn-based C# language server for Claude Code, packaged as a drop-in alternative to the official `csharp-lsp@claude-plugins-official` plugin.

## Why this plugin

Claude Code's stock `csharp-lsp` plugin uses [`csharp-ls`](https://github.com/razzmatazz/csharp-language-server). Its MSBuild project loader rejects some valid `.csproj` files with `Microsoft.Build.Exceptions.InvalidProjectFileException` — most notably Unity's generated projects, which use `<Project>` + an explicit `<Import Sdk="Microsoft.NET.Sdk" />` instead of the simpler `<Project Sdk="...">` form. The result is that LSP operations (`documentSymbol`, `hover`, `findReferences`, etc.) silently return nothing for those files.

This plugin runs the same Roslyn-based language server that the VS Code C# extension uses, which loads those projects without complaint.

## Requirements

- The [VS Code C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp) (`ms-dotnettools.csharp`) installed at the user level. The launcher auto-detects the latest installed version and reuses its bundled Roslyn server and .NET runtime.
- macOS or Linux on arm64 or x86_64, **or Windows 10/11 on x64 or arm64**. The repo ships two launchers:
  - `bin/csharp-roslyn-lsp` (Bash, used on macOS/Linux)
  - `bin/csharp-roslyn-lsp.cmd` + `bin/csharp-roslyn-lsp-paths.ps1` (used on Windows)

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

### macOS / Linux: one-time PATH setup

Claude Code does not currently add a plugin's `bin/` directory to the LSP child process's `PATH` on macOS or Linux either. Even though `which csharp-roslyn-lsp` succeeds in your interactive shell after install, the LSP-tool subprocess uses a more minimal `$PATH` that does not include the plugin cache, so Claude Code returns:

```
Error performing documentSymbol: Executable not found in $PATH: "csharp-roslyn-lsp"
```

Work around it by symlinking the launcher into `~/.local/bin`, which the LSP child process does see (no `sudo` required). Run in a shell:

```bash
plugin_dir="$HOME/.claude/plugins/cache/from2001-useful-skills/csharp-roslyn-lsp"
latest="$(ls -1 "$plugin_dir" 2>/dev/null | sort -V | tail -n 1)"
mkdir -p "$HOME/.local/bin"
ln -sf "$plugin_dir/$latest/bin/csharp-roslyn-lsp" "$HOME/.local/bin/csharp-roslyn-lsp"
echo "Linked: $HOME/.local/bin/csharp-roslyn-lsp -> $plugin_dir/$latest/bin/csharp-roslyn-lsp"
```

Restart Claude Code afterwards so the new `PATH` is picked up. Note that the cache path includes the installed plugin version (e.g. `1.1.0/bin`); when the plugin auto-updates to a new version the symlink will go stale — re-run the snippet to repoint it.

### Windows: one-time PATH setup

Claude Code does not currently add a plugin's `bin/` directory to the LSP child process's `PATH` on Windows. Until that ships upstream, `child_process.spawn('csharp-roslyn-lsp')` cannot locate `csharp-roslyn-lsp.cmd` and Claude Code returns:

```
Error performing documentSymbol: ENOENT: no such file or directory, uv_spawn 'csharp-roslyn-lsp'
```

Work around it by adding the cached plugin `bin/` directory to your **user** `PATH` once. Run in PowerShell:

```powershell
$bin = Get-ChildItem "$env:USERPROFILE\.claude\plugins\cache\from2001-useful-skills\csharp-roslyn-lsp" `
       -Directory -ErrorAction Stop |
       Sort-Object @{Expression = { try { [version]$_.Name } catch { [version]'0.0.0' } }} -Descending |
       Select-Object -First 1 -ExpandProperty FullName
$bin = Join-Path $bin 'bin'
$user = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($user -split ';') -contains $bin)) {
    [Environment]::SetEnvironmentVariable('Path', "$bin;$user", 'User')
    Write-Output "Added to user PATH: $bin"
}
```

Restart Claude Code afterwards so the new `PATH` is picked up. Note that the cache path includes the installed plugin version (e.g. `1.1.0\bin`); when the plugin auto-updates to a new version the entry will go stale — re-run the snippet to repoint it.

## Verifying

After install, ask Claude Code to use its `LSP` tool with `documentSymbol` on any `.cs` file. The wrapper writes startup logs to a per-OS temp directory:

- macOS/Linux: `$TMPDIR/claude-csharp-roslyn-lsp/` (or `/tmp/claude-csharp-roslyn-lsp/`)
- Windows: `%TEMP%\claude-csharp-roslyn-lsp\`

The running process appears as a `dotnet` child hosting `Microsoft.CodeAnalysis.LanguageServer.dll` — `pgrep -af Microsoft.CodeAnalysis.LanguageServer` on Unix, or `tasklist /v /fi "imagename eq dotnet.exe"` (or `Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'"`) on Windows.

## Troubleshooting

- **`Executable not found in $PATH: "csharp-roslyn-lsp"` on macOS / Linux** — the plugin's `bin/` directory is not on the Claude Code LSP child-process `PATH`, even though it is on your interactive shell `PATH`. Run the shell snippet under **macOS / Linux: one-time PATH setup** above and restart Claude Code.
- **`ENOENT: uv_spawn 'csharp-roslyn-lsp'` on Windows** — the plugin's `bin/` directory is not on the Claude Code child-process `PATH`. Run the PowerShell snippet under **Windows: one-time PATH setup** above and restart Claude Code.
- **`VS Code C# extension not found`** — install the extension. The Unix launcher globs `~/.vscode/extensions/ms-dotnettools.csharp-*-<os>-<arch>`; the Windows launcher globs `%USERPROFILE%\.vscode\extensions\ms-dotnettools.csharp-*-win32-<arch>`. If you use a non-standard VS Code variant (e.g. a portable install), make sure that extensions directory exists.
- **`no .NET host found`** — install either the VS Code C# extension (it brings a matching .NET runtime via `ms-dotnettools.vscode-dotnet-runtime`) or .NET 10+ system-wide. The Windows launcher additionally checks `%APPDATA%\Code\User\globalStorage\ms-dotnettools.vscode-dotnet-runtime\.dotnet\<ver>~<arch>~aspnetcore\dotnet.exe`.
- **No symbols returned but no error** — check the running process. If only `csharp-ls` is running, the plugin is not loaded; verify `enabledPlugins` and run `/reload-plugins`.
