# csharp-roslyn-lsp-paths.ps1 - path discovery helper for the Windows launcher.
#
# Prints "<roslyn_dll>|<dotnet_host>" on stdout when both can be resolved.
# Exits with a non-zero code (and no stdout) when either is missing - the
# .cmd shim translates that into a user-facing error.
#
# Kept off the LSP stdio path on purpose: the .cmd consumes this script's
# stdout via `for /f`, then exec's the dotnet host directly so the Roslyn
# server's binary JSON-RPC frames bypass PowerShell entirely.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Arch {
    switch ($env:PROCESSOR_ARCHITECTURE) {
        'ARM64' { 'arm64' }
        default { 'x64' }
    }
}

function Get-RoslynDll {
    param([string] $Arch)

    $extRoot = Join-Path $env:USERPROFILE '.vscode\extensions'
    if (-not (Test-Path -LiteralPath $extRoot)) { return $null }

    $pattern = "ms-dotnettools.csharp-*-win32-$Arch"
    $verRegex = "^ms-dotnettools\.csharp-([0-9]+(?:\.[0-9]+){1,3})-win32-$Arch$"

    Get-ChildItem -LiteralPath $extRoot -Directory -Filter $pattern -ErrorAction SilentlyContinue |
        ForEach-Object {
            $dll = Join-Path $_.FullName '.roslyn\Microsoft.CodeAnalysis.LanguageServer.dll'
            if (Test-Path -LiteralPath $dll -PathType Leaf) {
                $ver = if ($_.Name -match $verRegex) { [version]$Matches[1] } else { [version]'0.0.0' }
                [pscustomobject]@{ Version = $ver; Dll = $dll }
            }
        } |
        Sort-Object -Property Version -Descending |
        Select-Object -First 1 -ExpandProperty Dll
}

function Get-DotnetHost {
    param([string] $Arch)

    $rtBase = Join-Path $env:APPDATA 'Code\User\globalStorage\ms-dotnettools.vscode-dotnet-runtime\.dotnet'
    $minVersion = [version]'10.0.0'

    if (Test-Path -LiteralPath $rtBase) {
        $regex = "^([0-9]+\.[0-9]+\.[0-9]+)~$Arch(?:~aspnetcore)?$"
        # Prefer aspnetcore variants (the Roslyn server depends on ASP.NET Core libs);
        # within a version, sort 'aspnetcore' ahead of plain runtime.
        $bundled = Get-ChildItem -LiteralPath $rtBase -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($_.Name -match $regex) {
                    $ver = [version]$Matches[1]
                    $exe = Join-Path $_.FullName 'dotnet.exe'
                    if (($ver -ge $minVersion) -and (Test-Path -LiteralPath $exe -PathType Leaf)) {
                        [pscustomobject]@{
                            Version     = $ver
                            HasAspNet   = $_.Name.EndsWith('~aspnetcore')
                            Exe         = $exe
                        }
                    }
                }
            } |
            Sort-Object -Property Version, HasAspNet -Descending |
            Select-Object -First 1 -ExpandProperty Exe

        if ($bundled) { return $bundled }
    }

    # Fall back to a system dotnet only if it can host the language server.
    $sys = Get-Command -Name 'dotnet.exe' -ErrorAction SilentlyContinue
    if ($sys) { return $sys.Source }
    return $null
}

$arch = Get-Arch
$roslyn = Get-RoslynDll -Arch $arch
if (-not $roslyn) { exit 1 }

$dotnet = Get-DotnetHost -Arch $arch
if (-not $dotnet) { exit 2 }

# Single line, pipe-separated. Paths can contain spaces but '|' is reserved on Windows.
[Console]::Out.Write("$roslyn|$dotnet")
