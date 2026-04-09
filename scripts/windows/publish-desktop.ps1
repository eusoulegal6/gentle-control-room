[CmdletBinding()]
param(
  [string]$Configuration = "Release",
  [string]$RuntimeIdentifier = "win-x64",
  [string]$Version = "0.1.0",
  [switch]$FrameworkDependent
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$projectPath = Join-Path $repoRoot "desktop\GentleControlRoom.Desktop\GentleControlRoom.Desktop.csproj"
$publishDir = Join-Path $repoRoot "artifacts\desktop\publish\$RuntimeIdentifier"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw ".NET SDK is not installed. Install the .NET 8 SDK before publishing the desktop app."
}

$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  throw "npm is required to build the packaged React frontend before publishing the desktop app."
}

$sdks = & dotnet --list-sdks
if (-not ($sdks | Select-String '^8\.')) {
  throw ".NET 8 SDK is required. Current SDK list does not contain an 8.x SDK."
}

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null

Write-Host "Building React frontend for desktop packaging"
& npm run build --prefix $repoRoot

$publishArgs = @(
  "publish",
  $projectPath,
  "-c", $Configuration,
  "-r", $RuntimeIdentifier,
  "-o", $publishDir,
  "-p:Version=$Version",
  "-p:PublishSingleFile=false",
  "-p:PublishTrimmed=false",
  "-p:PublishReadyToRun=true",
  "--self-contained", $(if ($FrameworkDependent) { "false" } else { "true" })
)

Write-Host "Publishing desktop app to $publishDir"
& dotnet @publishArgs

Write-Host "Desktop publish complete."
