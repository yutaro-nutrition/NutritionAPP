param(
    [switch]$WriteParquet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")

function Resolve-Python {
    $candidates = @(
        (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
        (Join-Path $ProjectRoot "venv\Scripts\python.exe"),
        "python"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -eq "python") {
            try {
                $null = & python --version
                return "python"
            }
            catch {
                continue
            }
        }
        elseif (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Python was not found. Please prepare .venv/venv or a PATH python."
}

try {
    $PythonExe = Resolve-Python
    $BuildScript = Join-Path $ProjectRoot "scripts\integration\build_integrated_recipe_db.py"
    if (-not (Test-Path $BuildScript)) {
        throw "Integration script was not found: $BuildScript"
    }

    Write-Host "Project Root: $ProjectRoot"
    Write-Host "Python: $PythonExe"
    Write-Host "Running integration ETL..."

    Push-Location $ProjectRoot
    try {
        $integrationArgs = @($BuildScript)
        if (-not $WriteParquet) {
            $integrationArgs += "--no-parquet"
        }
        & $PythonExe @integrationArgs
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "Integration ETL failed. exit_code=$exitCode"
    }

    $summaryPath = Join-Path $ProjectRoot "output\integrated\integration_summary_report.json"
    if (-not (Test-Path $summaryPath)) {
        throw "Summary report was not generated: $summaryPath"
    }

    $summary = Get-Content $summaryPath -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "=== Integration Summary ==="
    Write-Host ("scanned_files_count       : {0}" -f $summary.scanned_files_count)
    Write-Host ("integrated_files_count    : {0}" -f $summary.integrated_files_count)
    Write-Host ("rejected_files_count      : {0}" -f $summary.rejected_files_count)
    Write-Host ("integrated_recipe_count   : {0}" -f $summary.integrated_recipe_count)
    Write-Host ("integrated_ingredient_rows: {0}" -f $summary.integrated_ingredient_rows)
    Write-Host ("integrated_step_rows      : {0}" -f $summary.integrated_step_rows)
    Write-Host ("duplicated_recipe_id_count: {0}" -f $summary.duplicated_recipe_id_count)
    Write-Host ("generated_at_utc          : {0}" -f $summary.generated_at_utc)
    Write-Host ("summary_path              : {0}" -f $summaryPath)

    if ($summary.PSObject.Properties.Name -contains "fatal_error" -and $summary.fatal_error) {
        Write-Warning ("fatal_error: {0}" -f $summary.fatal_error)
    }
}
catch {
    Write-Error $_.Exception.Message
    Write-Host "Possible missing files:"
    Write-Host ("- {0}" -f (Join-Path $ProjectRoot "master\category_master.csv"))
    Write-Host ("- {0}" -f (Join-Path $ProjectRoot "master\ingredient_alias_master.csv"))
    Write-Host ("- {0}" -f (Join-Path $ProjectRoot "reports\validation\summary_validation_report.json"))
    Write-Host ("- {0}" -f (Join-Path $ProjectRoot "data\generated\*.xlsx"))
    exit 1
}
