Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $ProjectRoot

function Import-DotEnv {
    param([string]$EnvFilePath)
    if (-not (Test-Path $EnvFilePath)) { return }

    Get-Content $EnvFilePath | ForEach-Object {
        $line = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($line)) { return }
        if ($line.StartsWith("#")) { return }
        if (-not $line.Contains("=")) { return }
        $parts = $line.Split("=", 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        if ($name) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

function Resolve-Python {
    $candidates = @(
        (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
        (Join-Path $ProjectRoot "venv\Scripts\python.exe")
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) { return "py -3" }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) { return "python" }

    throw "Python executable was not found. Create a venv or install Python 3.11+."
}

function Run-PythonScript {
    param(
        [Parameter(Mandatory = $true)][string]$PythonCommand,
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string]$StepLabel
    )

    Write-Host ""
    Write-Host "=== $StepLabel ==="
    Write-Host "script: $ScriptPath"

    if ($PythonCommand.StartsWith("py ")) {
        & py -3 $ScriptPath
    } else {
        & $PythonCommand $ScriptPath
    }

    if ($LASTEXITCODE -ne 0) {
        throw "$StepLabel failed. exit_code=$LASTEXITCODE"
    }
}

try {
    $envPath = Join-Path $ProjectRoot ".env"
    Import-DotEnv -EnvFilePath $envPath

    $python = Resolve-Python
    Write-Host "ProjectRoot: $ProjectRoot"
    Write-Host "Python: $python"
    if (Test-Path $envPath) {
        Write-Host ".env loaded: $envPath"
    } else {
        Write-Host ".env not found. Using environment variables as-is."
    }

    $importScript = Join-Path $ProjectRoot "app_api\scripts\import_integrated_csv.py"
    $countScript = Join-Path $ProjectRoot "app_api\scripts\check_db_counts.py"

    if (-not (Test-Path $importScript)) { throw "Missing script: $importScript" }
    if (-not (Test-Path $countScript)) { throw "Missing script: $countScript" }

    Run-PythonScript -PythonCommand $python -ScriptPath $importScript -StepLabel "Import Integrated CSV to PostgreSQL"
    Run-PythonScript -PythonCommand $python -ScriptPath $countScript -StepLabel "Check DB Counts"

    Write-Host ""
    Write-Host "Completed successfully."
    Write-Host "Reports:"
    Write-Host "  output/db_load/db_import_report.json"
    Write-Host "  output/db_load/db_count_check_report.json"
    Write-Host "Logs:"
    Write-Host "  output/db_load/logs/"
}
catch {
    Write-Error "run_db_import.ps1 failed: $($_.Exception.Message)"
    Write-Host "Check output/db_load/db_import_report.json and output/db_load/logs/ for details."
    exit 1
}
