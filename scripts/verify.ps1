$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run verify
    if ($LASTEXITCODE -ne 0) { throw 'Verification failed' }
} finally { Pop-Location }
