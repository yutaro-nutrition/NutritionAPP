param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$OutputDir = "output"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-CommandVersion {
  param([string]$Name, [string[]]$Args = @("--version"))

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    return [pscustomobject]@{ available = $false; version = $null }
  }

  try {
    $version = (& $Name @Args 2>$null | Select-Object -First 1)
  } catch {
    $version = $null
  }

  return [pscustomobject]@{ available = $true; version = $version }
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  try {
    return Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{
      _parse_error = $_.Exception.Message
      _raw = (Get-Content -Raw $Path)
    }
  }
}

function Get-RelativePathCompat {
  param([string]$BasePath, [string]$TargetPath)

  $baseFull = (Resolve-Path $BasePath).Path.TrimEnd('\') + '\'
  $targetFull = (Resolve-Path $TargetPath).Path

  if ($targetFull.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $targetFull.Substring($baseFull.Length).Replace('\', '/')
  }

  return $targetFull
}

$root = Resolve-Path $ProjectRoot
$outDirPath = Join-Path $root $OutputDir
if (-not (Test-Path $outDirPath)) {
  New-Item -ItemType Directory -Path $outDirPath | Out-Null
}

$packageJsonPath = Join-Path $root "package.json"
$packageObj = $null
if (Test-Path $packageJsonPath) {
  $packageObj = Get-Content -Raw -Encoding UTF8 $packageJsonPath | ConvertFrom-Json
}

$reportFiles = @(
  "src/data/gohan120/import_report_gohan120.json",
  "src/data/gohan120/udon_generation_report.json",
  "src/data/research/recipe_rice_120_quality_report.json"
)

$artifactGlobs = @(
  "output/*.json",
  "output/*.csv",
  "output/*.xlsx",
  "src/data/gohan120/*.json",
  "src/data/research/*.json"
)

$artifactFiles = @()
foreach ($pattern in $artifactGlobs) {
  $fullPattern = Join-Path $root $pattern
  $artifactFiles += Get-ChildItem -File -Path $fullPattern -ErrorAction SilentlyContinue
}

$artifactFiles = $artifactFiles | Sort-Object FullName -Unique

$artifacts = foreach ($f in $artifactFiles) {
  $hash = Get-FileHash -Algorithm SHA256 -Path $f.FullName
  [pscustomobject]@{
    path = $f.FullName
    relative_path = Get-RelativePathCompat -BasePath $root -TargetPath $f.FullName
    bytes = $f.Length
    last_write_local = $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss zzz")
    last_write_utc = $f.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
    sha256 = $hash.Hash
  }
}

$reports = [ordered]@{}
foreach ($rf in $reportFiles) {
  $full = Join-Path $root $rf
  $reports[$rf] = Read-JsonFile -Path $full
}

$cmds = [ordered]@{
  node = Get-CommandVersion -Name "node"
  npm = Get-CommandVersion -Name "npm"
  git = Get-CommandVersion -Name "git"
}

$reproCommands = @(
  "npm run import:gohan120",
  "npm run generate:rice-db",
  "npm run generate:udon-db"
)

$record = [ordered]@{
  snapshot_generated_at_local = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
  snapshot_generated_at_utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  machine_timezone = (Get-TimeZone).Id
  project_root = $root.Path
  toolchain = $cmds
  npm_scripts = $packageObj.scripts
  recommended_repro_commands = $reproCommands
  reports = $reports
  artifacts = $artifacts
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$jsonPath = Join-Path $outDirPath ("execution_record_snapshot_" + $stamp + ".json")
$txtPath = Join-Path $outDirPath ("execution_record_for_chatgpt_" + $stamp + ".txt")

$recordJson = $record | ConvertTo-Json -Depth 100
$recordJson | Set-Content -Encoding UTF8 $jsonPath

$chatText = @(
  "# Execution Record Snapshot",
  "GeneratedAtLocal: " + $record.snapshot_generated_at_local,
  "GeneratedAtUTC: " + $record.snapshot_generated_at_utc,
  "ProjectRoot: " + $record.project_root,
  "",
  "## JSON",
  '```json',
  $recordJson,
  '```'
) -join [Environment]::NewLine

$chatText | Set-Content -Encoding UTF8 $txtPath

Write-Output ("JSON: " + $jsonPath)
Write-Output ("TEXT: " + $txtPath)
