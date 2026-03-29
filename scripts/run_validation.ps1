$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$PythonCandidates = @(
    (Join-Path $ProjectRoot ".venv\\Scripts\\python.exe"),
    (Join-Path $ProjectRoot "venv\\Scripts\\python.exe"),
    "python"
)

$PythonExe = $null
foreach ($candidate in $PythonCandidates) {
    if ($candidate -eq "python") {
        try {
            $null = & python --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                $PythonExe = "python"
                break
            }
        } catch {
        }
    } elseif (Test-Path $candidate) {
        $PythonExe = $candidate
        break
    }
}

if (-not $PythonExe) {
    Write-Host "[ERROR] Python executable not found." -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Project root: $ProjectRoot"
Write-Host "[INFO] Python: $PythonExe"
Write-Host "[INFO] Running validation..."

& $PythonExe "scripts/validation/run_all_validations.py"
$ExitCode = $LASTEXITCODE

$SummaryPath = Join-Path $ProjectRoot "reports\\validation\\summary_validation_report.json"
if (Test-Path $SummaryPath) {
    Write-Host "[INFO] Summary report: $SummaryPath"
    try {
        $summary = Get-Content $SummaryPath -Raw | ConvertFrom-Json
        Write-Host ("[INFO] Result files={0}, passed={1}, manual_review={2}, failed={3}" -f `
            $summary.totals.files, $summary.totals.passed, $summary.totals.manual_review, $summary.totals.failed)
    } catch {
        Write-Host "[WARN] Failed to parse summary JSON." -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARN] Summary report was not created." -ForegroundColor Yellow
}

exit $ExitCode
