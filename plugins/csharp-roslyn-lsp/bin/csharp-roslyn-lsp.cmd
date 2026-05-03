@echo off
:: csharp-roslyn-lsp.cmd - Windows launcher for Microsoft.CodeAnalysis.LanguageServer
::
:: Mirrors the macOS/Linux Bash launcher (./csharp-roslyn-lsp). Path discovery
:: is delegated to the sibling PowerShell helper (PowerShell can sort versions
:: by [version] cast); the actual dotnet host is exec'd from cmd directly so
:: the Roslyn server inherits the LSP client's stdio without PowerShell's
:: native-command output encoding mangling the binary JSON-RPC frames.

setlocal EnableExtensions

set "ROSLYN_DLL="
set "DOTNET_HOST="
for /f "usebackq tokens=1,2 delims=|" %%A in (`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0csharp-roslyn-lsp-paths.ps1"`) do (
  set "ROSLYN_DLL=%%A"
  set "DOTNET_HOST=%%B"
)

if not defined ROSLYN_DLL goto :missing
if not defined DOTNET_HOST goto :missing
goto :launch

:missing
>&2 echo csharp-roslyn-lsp: failed to locate the VS Code C# extension or a .NET 10+ host.
>&2 echo   Install the 'C#' extension by ms-dotnettools in VS Code -- it ships the Roslyn
>&2 echo   language server and a matching .NET runtime -- or install .NET 10+ system-wide
>&2 echo   from https://dotnet.microsoft.com/download.
exit /b 1

:launch

set "LOG_DIR=%TEMP%\claude-csharp-roslyn-lsp"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

"%DOTNET_HOST%" "%ROSLYN_DLL%" --stdio --logLevel Information --extensionLogDirectory "%LOG_DIR%" %*
