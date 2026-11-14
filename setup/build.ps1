# Compatibility entry point: build the single offline installer.
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    npm run dist:win
    if($LASTEXITCODE -ne 0){throw 'Installer build failed.'}
} finally { Pop-Location }
