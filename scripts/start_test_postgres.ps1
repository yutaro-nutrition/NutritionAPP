Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$ComposeFile = Join-Path $ProjectRoot "docker-compose.yml"
$ProjectName = "mealplan-test"
$ServiceName = "postgres_test"
$LegacyContainer = "recipe-postgres-test"

if (-not (Test-Path $ComposeFile)) {
    throw "Compose file not found: $ComposeFile"
}

Write-Host "ProjectRoot: $ProjectRoot"
Write-Host "ComposeFile: $ComposeFile"

$existingNames = & docker ps -a --format "{{.Names}}"
$legacyExists = $existingNames | Select-String -SimpleMatch $LegacyContainer

if ($legacyExists) {
    $isRunning = (& docker inspect -f "{{.State.Running}}" $LegacyContainer).Trim()
    if ($isRunning -eq "true") {
        Write-Host "Legacy test container is already running: $LegacyContainer"
        exit 0
    }

    Write-Host "Legacy test container exists. Starting $LegacyContainer directly..."
    & docker start $LegacyContainer
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Started by legacy direct-start successfully."
        exit 0
    }

    throw "Failed to start existing test container: $LegacyContainer"
}

Write-Host "Trying standard startup via docker compose..."

$outFile = Join-Path $env:TEMP "codex_compose_out.txt"
$errFile = Join-Path $env:TEMP "codex_compose_err.txt"
if (Test-Path $outFile) { Remove-Item $outFile -Force }
if (Test-Path $errFile) { Remove-Item $errFile -Force }

$proc = Start-Process -FilePath "docker" -ArgumentList @("compose", "-p", $ProjectName, "-f", $ComposeFile, "up", "-d", $ServiceName) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
$composeExit = $proc.ExitCode
$composeOutput = @()
if (Test-Path $outFile) { $composeOutput += Get-Content $outFile }
if (Test-Path $errFile) { $composeOutput += Get-Content $errFile }
$composeOutput | Out-Host

if ($composeExit -eq 0) {
    Write-Host "Started by docker compose successfully."
    exit 0
}

$composeText = ($composeOutput | Out-String)
$nameConflict = $composeText -match "container name .* is already in use"

if ($nameConflict) {
    $legacyExists = & docker ps -a --format "{{.Names}}" | Select-String -SimpleMatch $LegacyContainer
    if ($legacyExists) {
        Write-Warning "Compose hit legacy container-name conflict. Falling back to docker start $LegacyContainer"
        & docker start $LegacyContainer
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Started by legacy fallback successfully."
            exit 0
        }
    }
}

throw "Failed to start postgres test container. See output above."
