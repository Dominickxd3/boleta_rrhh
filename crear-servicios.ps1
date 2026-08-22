# ============================================================
#  BoletasGP - Crear servicios fisicos de Windows (NSSM)
#  Ejecutar como Administrador (PowerShell).
#  Uso:  .\crear-servicios.ps1
#  Crea: BoletasGP-API (backend, puerto 3001)
#        BoletasGP-Web (frontend, puerto 3100)
#  Conserva intacto el PM2 de papeletas-api.
# ============================================================
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  BoletasGP - Servicios de Windows" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# 1) Asegurar NSSM
$nssm = "C:\Windows\System32\nssm.exe"
if (-not (Test-Path $nssm)) {
  Write-Host "`nNSSM no encontrado. Descargando..." -ForegroundColor Yellow
  $nssmZip = "$env:TEMP\nssm.zip"
  Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip
  Expand-Archive $nssmZip "$env:TEMP\nssm" -Force
  Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssm -Force
}
Write-Host "NSSM listo: $nssm" -ForegroundColor Green

# 2) Detener versiones PM2 de BoletasGP (conserva papeletas-api)
Write-Host "`nDeteniendo versiones PM2 de BoletasGP (papeletas-api intacta)..." -ForegroundColor Yellow
pm2 delete boletasgp-api 2>$null
pm2 delete boletasgp-web 2>$null

# 3) Credenciales del servicio (acceso a carpeta de red)
$usuario = Read-Host "Usuario para los servicios (ej. .\administrador)"
$clave = Read-Host "Contrasena del usuario" -AsSecureString
$pass = [System.Net.NetworkCredential]::new("", $clave).Password

$node = (Get-Command node).Source

# 4) Servicio del BACKEND (API)
Write-Host "`nCreando servicio BoletasGP-API..." -ForegroundColor Yellow
& $nssm install BoletasGP-API $node "$raiz\backend\dist\main.js"
& $nssm set BoletasGP-API AppDirectory "$raiz\backend"
& $nssm set BoletasGP-API AppStdout "$raiz\logs\api-out.log"
& $nssm set BoletasGP-API AppStderr "$raiz\logs\api-error.log"
& $nssm set BoletasGP-API Start SERVICE_AUTO_START
& $nssm set BoletasGP-API ObjectName $usuario $pass

# 5) Servicio del FRONTEND (Web)
Write-Host "Creando servicio BoletasGP-Web..." -ForegroundColor Yellow
$next = "$raiz\frontend\node_modules\next\dist\bin\next"
& $nssm install BoletasGP-Web $node $next "start -p 3100"
& $nssm set BoletasGP-Web AppDirectory "$raiz\frontend"
& $nssm set BoletasGP-Web AppStdout "$raiz\logs\web-out.log"
& $nssm set BoletasGP-Web AppStderr "$raiz\logs\web-error.log"
& $nssm set BoletasGP-Web Start SERVICE_AUTO_START
& $nssm set BoletasGP-Web ObjectName $usuario $pass

# 6) Iniciar
Write-Host "`nIniciando servicios..." -ForegroundColor Yellow
& $nssm start BoletasGP-API
& $nssm start BoletasGP-Web

# 7) Verificar
Write-Host "`nEstado de los servicios:" -ForegroundColor Green
Get-Service BoletasGP-API, BoletasGP-Web | Select-Object Name, Status, StartType
Write-Host "`nPuertos:" -ForegroundColor Green
netstat -ano | findstr ":3001"
netstat -ano | findstr ":3100"

Write-Host "`nPara desinstalar (si hace falta):" -ForegroundColor Yellow
Write-Host "  nssm remove BoletasGP-API confirm"
Write-Host "  nssm remove BoletasGP-Web confirm"