param(
    [string]$HostName = "",
    [string]$Port = "",
    [string]$Database = "",
    [string]$UserName = "",
    [string]$Schema = "mealplan",
    [string]$OutputDir = "output/integrated"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$SqlPath = Join-Path $ProjectRoot "scripts\integration\postgres_copy_integrated.sql"
$OutputAbs = Resolve-Path (Join-Path $ProjectRoot $OutputDir)

if (-not $HostName) { $HostName = $env:PGHOST }
if (-not $Port) { $Port = if ($env:PGPORT) { $env:PGPORT } else { "5432" } }
if (-not $Database) { $Database = $env:PGDATABASE }
if (-not $UserName) { $UserName = $env:PGUSER }

$MasterCsv = Join-Path $OutputAbs "recipe_master_all.csv"
$IngredientsCsv = Join-Path $OutputAbs "recipe_ingredients_all.csv"
$StepsCsv = Join-Path $OutputAbs "recipe_steps_all.csv"

if (-not (Test-Path $SqlPath)) { throw "SQL script not found: $SqlPath" }
if (-not (Test-Path $MasterCsv)) { throw "Missing CSV: $MasterCsv" }
if (-not (Test-Path $IngredientsCsv)) { throw "Missing CSV: $IngredientsCsv" }
if (-not (Test-Path $StepsCsv)) { throw "Missing CSV: $StepsCsv" }

if (-not $HostName -or -not $Database -or -not $UserName) {
    throw "Set PGHOST, PGDATABASE, PGUSER (and optionally PGPORT/PGPASSWORD) or pass parameters."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
    throw "psql was not found in PATH. Install PostgreSQL client tools and retry."
}

Write-Host "PostgreSQL COPY start"
Write-Host "Host=$HostName Port=$Port DB=$Database User=$UserName Schema=$Schema"
Write-Host "CSV dir=$OutputAbs"

$args = @(
    "--host", $HostName,
    "--port", $Port,
    "--dbname", $Database,
    "--username", $UserName,
    "--set", "recipe_master_csv=$MasterCsv",
    "--set", "recipe_ingredients_csv=$IngredientsCsv",
    "--set", "recipe_steps_csv=$StepsCsv",
    "--file", $SqlPath
)

& psql @args
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "psql COPY failed. exit_code=$exitCode"
}

Write-Host "PostgreSQL COPY completed successfully."
