Param(
  [string]$OpenAIKey = "",
  [string]$Model = "gpt-4o",
  [switch]$NoRun,
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir '..')
$Backend = Join-Path $Root 'backend'

Write-Host '==> Backend: creating virtual environment'
if (Get-Command py -ErrorAction SilentlyContinue) {
  py -3 -m venv (Join-Path $Backend 'venv')
} else {
  python -m venv (Join-Path $Backend 'venv')
}

$VenvPython = Join-Path $Backend 'venv\Scripts\python.exe'
$VenvPip = Join-Path $Backend 'venv\Scripts\pip.exe'

Write-Host '==> Backend: upgrading pip tooling'
& $VenvPython -m pip install --upgrade pip setuptools wheel

Write-Host '==> Backend: installing requirements'
& $VenvPip install -r (Join-Path $Backend 'requirements.txt')

Write-Host '==> Backend: preparing .env'
$envPath = Join-Path $Backend '.env'
if (-not (Test-Path $envPath)) {
  Copy-Item (Join-Path $Backend '.env.example') $envPath -Force
}

$lines = Get-Content $envPath -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^(OPENAI_API_KEY|OPENAI_MODEL)=' }
if ($OpenAIKey -and $OpenAIKey.Trim().Length -gt 0) {
  $lines += "OPENAI_API_KEY=$OpenAIKey"
} else {
  $existingKey = (Get-Content $envPath | Where-Object { $_ -match '^OPENAI_API_KEY=' } | Select-Object -First 1)
  if ($existingKey) {
    $lines += $existingKey
  } else {
    $lines += 'OPENAI_API_KEY=dev-placeholder'
  }
}
$lines += "OPENAI_MODEL=$Model"
$lines | Set-Content $envPath -NoNewline:$false

if (-not $NoRun) {
  Write-Host "==> Backend: starting dev server (port $BackendPort)"
  $backendLog = Join-Path $Backend 'backend_server.log'
  $backendPid = Join-Path $Backend 'backend.pid'
  $env:HOST = '0.0.0.0'
  $env:PORT = "$BackendPort"
  $proc = Start-Process -FilePath $VenvPython -ArgumentList 'run.py' -WorkingDirectory $Backend -RedirectStandardOutput $backendLog -RedirectStandardError $backendLog -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  "$($proc.Id)" | Set-Content $backendPid
}

Write-Host '==> Frontend: installing npm dependencies'
Set-Location $Root
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is not installed. Install Node.js 18+ (recommend 20+).'
}
try {
  npm ci
} catch {
  npm install
}

if (-not $NoRun) {
  Write-Host "==> Frontend: starting Vite dev server (port $FrontendPort)"
  $frontLog = Join-Path $Root 'frontend_server.log'
  $frontPid = Join-Path $Root 'frontend.pid'
  $frontArgs = @('run','dev','--','--strictPort','--port',"$FrontendPort")
  $front = Start-Process -FilePath 'npm' -ArgumentList $frontArgs -WorkingDirectory $Root -RedirectStandardOutput $frontLog -RedirectStandardError $frontLog -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  "$($front.Id)" | Set-Content $frontPid
}

Write-Host '==> Done'
Write-Host "- Backend health: http://localhost:$BackendPort/api/v1/health"
Write-Host "- Frontend:       http://localhost:$FrontendPort"
if (-not $NoRun) {
  Write-Host "- Backend PID file: $Backend\backend.pid"
  Write-Host "- Frontend PID file: $Root\frontend.pid"
}

