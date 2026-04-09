[CmdletBinding()]
param(
  [string]$Configuration = "Release",
  [string]$RuntimeIdentifier = "win-x64",
  [string]$Version = "0.1.0",
  [switch]$FrameworkDependent
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$publishDir = Join-Path $repoRoot "artifacts\desktop\publish\$RuntimeIdentifier"
$innoScript = Join-Path $repoRoot "installer\GentleControlRoom.iss"
$prereqDir = Join-Path $repoRoot "installer\prereqs"

& (Join-Path $PSScriptRoot "publish-desktop.ps1") `
  -Configuration $Configuration `
  -RuntimeIdentifier $RuntimeIdentifier `
  -Version $Version `
  -FrameworkDependent:$FrameworkDependent

$iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
  throw "Inno Setup 6 is not installed or ISCC.exe is not on PATH."
}

$webViewInstaller = Join-Path $prereqDir "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
if (-not (Test-Path $webViewInstaller)) {
  throw "Missing WebView2 prerequisite: $webViewInstaller"
}

if ($FrameworkDependent) {
  $dotNetInstaller = Join-Path $prereqDir "windowsdesktop-runtime-8-win-x64.exe"
  if (-not (Test-Path $dotNetInstaller)) {
    throw "Missing .NET Desktop Runtime prerequisite: $dotNetInstaller"
  }
}

$innoArgs = @(
  "/DAppVersion=$Version",
  "/DPublishDir=$publishDir",
  "/DPrereqDir=$prereqDir",
  "/DUseDotNetRuntimePrereq=$(if ($FrameworkDependent) { '1' } else { '0' })",
  $innoScript
)

Write-Host "Compiling installer with Inno Setup..."
& $iscc @innoArgs

Write-Host "Installer package complete."
