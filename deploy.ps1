# ============================================================
#  BoletasGP - Despliegue en Windows Server con PM2
#  Ejecutar como Administrador (PowerShell).
#  Uso:  .\deploy.ps1
# ============================================================
$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  BoletasGP - Despliegue (PM2)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# 1) Prerrequisitos
Write-Host "`n[1/7] Verificando Node.js, npm y git..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js NO esta instalado. Instala Node 22 LTS." }
node -v
npm -v
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git NO esta instalado." }
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "`n[PM2] No encontrado. Instalando globalmente..." -ForegroundColor Yellow
  npm install -g pm2
}

# 2) Dependencias
Write-Host "`n[2/7] Instalando dependencias (npm install)..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install fallo." }

# 3) Backend .env
Write-Host "`n[3/7] Configurando backend\.env..." -ForegroundColor Yellow
$envBackend = Join-Path $raiz "backend\.env"
if (-not (Test-Path $envBackend)) {
  Copy-Item (Join-Path $raiz "backend\.env.example") $envBackend
  Write-Host "Se creo backend\.env. Se abre el editor para que completes las credenciales." -ForegroundColor Yellow
  notepad $envBackend
  Read-Host "  Cuando termines de editar y GUARDAR, pulsa Enter"
} else {
  Write-Host "backend\.env ya existe (no se modifica)." -ForegroundColor Green
}

# 4) Frontend .env.local
Write-Host "`n[4/7] Configurando frontend\.env.local..." -ForegroundColor Yellow
$envFront = Join-Path $raiz "frontend\.env.local"
if (-not (Test-Path $envFront)) {
  Copy-Item (Join-Path $raiz "frontend\.env.example") $envFront
  Write-Host "Se creo frontend\.env.local. Edita NEXT_PUBLIC_API_URL." -ForegroundColor Yellow
  notepad $envFront
  Read-Host "  Cuando termines de editar y GUARDAR, pulsa Enter"
} else {
  Write-Host "frontend\.env.local ya existe (no se modifica)." -ForegroundColor Green
}

# 5) Compilar
Write-Host "`n[5/7] Compilando backend..." -ForegroundColor Yellow
npm run build:backend
if ($LASTEXITCODE -ne 0) { throw "Build del backend fallo." }
Write-Host "Compilando frontend..." -ForegroundColor Yellow
npm run build:frontend
if ($LASTEXITCODE -ne 0) { throw "Build del frontend fallo." }

# 6) Iniciar con PM2
Write-Host "`n[6/7] Iniciando con PM2..." -ForegroundColor Yellow
pm2 start ecosystem.config.js --env production
if ($LASTEXITCODE -ne 0) { throw "pm2 start fallo." }
pm2 save

# 7) Resumen
Write-Host "`n[7/7] Estado de los procesos:" -ForegroundColor Green
pm2 list

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  DESPLIEGUE COMPLETADO" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host "API:      http://localhost:3001/api"
Write-Host "Web:      http://localhost:3000"
Write-Host "Logs:     pm2 logs"
Write-Host ""
Write-Host "Para que arranque con el servidor (ADMIN):" -ForegroundColor Yellow
Write-Host "  pm2 startup"
Write-Host "  (copia y ejecuta el comando que imprime)"