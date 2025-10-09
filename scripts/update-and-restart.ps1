Param(
    [string]$Branch = "main",
    [switch]$InstallDependencies,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
$repoRoot = Resolve-Path -LiteralPath (Join-Path $scriptDirectory "..")
Set-Location -Path $repoRoot

function Write-Section([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-CleanWorkspace {
    $status = git status --porcelain
    if ($status) {
        Write-Warning "Working tree is not clean. Commit or stash changes before running the update."
        throw "Aborting to avoid overwriting local changes."
    }
}

try {
    Write-Section "Ensuring clean working tree"
    Ensure-CleanWorkspace

    Write-Section "Fetching latest code"
    git fetch origin
    git checkout $Branch
    git pull origin $Branch

    if ($InstallDependencies.IsPresent) {
        Write-Section "Installing dependencies"
        npm install
    }

    if (-not $SkipBuild.IsPresent) {
        Write-Section "Building project"
        npm run build
    } else {
        Write-Host "Skipping build step as requested."
    }

    Write-Section "Restarting PM2 service"
    pm2 startOrReload ecosystem.config.json --only file-converter-service --update-env

    Write-Section "Update complete"
    pm2 list | Select-String "file-converter-service"
} catch {
    Write-Error "Update failed: $_"
    exit 1
}
