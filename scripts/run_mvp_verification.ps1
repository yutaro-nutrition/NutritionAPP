param(
    [switch]$SkipPostgresStartup,
    [switch]$SkipE2E,
    [switch]$IncludeOptional
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$PlatformIsWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$PlatformIsLinux = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Linux)
$PlatformIsMacOS = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $ProjectRoot

function Resolve-Python {
    $candidates = @(
        (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
        (Join-Path $ProjectRoot "venv\Scripts\python.exe"),
        (Join-Path $ProjectRoot ".venv/bin/python"),
        (Join-Path $ProjectRoot "venv/bin/python")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd -and ($pythonCmd.Source -notlike "*WindowsApps*" -or $PlatformIsLinux -or $PlatformIsMacOS)) {
        return "python"
    }

    $python3Cmd = Get-Command python3 -ErrorAction SilentlyContinue
    if ($python3Cmd) {
        return "python3"
    }

    throw "Python executable was not found. Create .venv first."
}

function Resolve-Npm {
    $candidates = if ($PlatformIsWindows) { @("npm.cmd", "npm") } else { @("npm", "npm.cmd") }
    foreach ($commandName in $candidates) {
        $cmd = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($cmd) {
            return $cmd.Source
        }
    }

    throw "npm was not found."
}

function Resolve-PowerShell {
    foreach ($commandName in @("pwsh", "powershell")) {
        $cmd = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($cmd) {
            return $cmd.Source
        }
    }

    throw "PowerShell executable was not found."
}

function Set-EnvDefault {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $current = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($current)) {
        [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host ""
    Write-Host "=== $Name ==="
    & $Action

    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed. exit_code=$LASTEXITCODE"
    }
}

try {
    $PythonExe = Resolve-Python
    $NpmExe = Resolve-Npm
    $PowerShellExe = Resolve-PowerShell

    Write-Host "ProjectRoot: $ProjectRoot"
    Write-Host "Python: $PythonExe"
    Write-Host "npm: $NpmExe"

    if (-not $SkipPostgresStartup) {
        $StartScript = Join-Path $ScriptDir "start_test_postgres.ps1"
        Invoke-Step -Name "Start Test PostgreSQL" -Action {
            & $PowerShellExe -ExecutionPolicy Bypass -File $StartScript
        }
    }

    Set-EnvDefault -Name "TEST_POSTGRES_HOST" -Value "127.0.0.1"
    Set-EnvDefault -Name "TEST_POSTGRES_PORT" -Value "55432"
    Set-EnvDefault -Name "TEST_POSTGRES_DB" -Value "recipe_test_db"
    Set-EnvDefault -Name "TEST_POSTGRES_USER" -Value "recipe_test_user"
    Set-EnvDefault -Name "TEST_POSTGRES_PASSWORD" -Value "recipe_test_password"

    Set-EnvDefault -Name "POSTGRES_HOST" -Value "127.0.0.1"
    Set-EnvDefault -Name "POSTGRES_PORT" -Value "55432"
    Set-EnvDefault -Name "POSTGRES_DB" -Value "recipe_test_db"
    Set-EnvDefault -Name "POSTGRES_USER" -Value "recipe_test_user"
    Set-EnvDefault -Name "POSTGRES_PASSWORD" -Value "recipe_test_password"

    Invoke-Step -Name "Always Python Tests" -Action {
        & $PythonExe -m pytest `
            tests/test_validator_canonical_v1.py `
            tests/test_pipeline_acceptance.py `
            tests/test_pipeline_db_import_acceptance.py `
            -q
    }

    if ($IncludeOptional) {
        Invoke-Step -Name "Optional Python Tests" -Action {
            & $PythonExe -m pytest `
                tests/test_pipeline_loader_canonical_v1.py `
                app_api/tests/test_openapi_error_responses.py `
                -q
        }
    }

    Invoke-Step -Name "DB Integration Tests" -Action {
        & $PythonExe -m pytest `
            tests/test_option2_db_integration_postgres.py `
            tests/test_pipeline_db_integration_postgres.py `
            -m integration `
            -q
    }

    Invoke-Step -Name "app_api Integration Tests" -Action {
        & $PythonExe -m pytest app_api/tests -m integration -q
    }

    Invoke-Step -Name "Web Typecheck + Build + E2E" -Action {
        if ($SkipE2E) {
            & $NpmExe run typecheck
            if ($LASTEXITCODE -ne 0) { return }
            & $NpmExe run build
            return
        }

        & $NpmExe run verify:web
    }

    Write-Host ""
    Write-Host "MVP verification completed successfully."
}
catch {
    Write-Error "run_mvp_verification.ps1 failed: $($_.Exception.Message)"
    exit 1
}
