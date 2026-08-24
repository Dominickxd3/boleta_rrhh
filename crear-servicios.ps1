# ============================================================
#  BoletasGP - Crear servicios fisicos de Windows (WinSW)
#  Ejecutar como Administrador (PowerShell).
#  Uso:  .\crear-servicios.ps1
#  Crea: BoletasGP-API (backend, puerto 3001)
#        BoletasGP-Web (frontend, puerto 3100)
#  Conserva intacto el PM2 de papeletas-api.
# ============================================================
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  BoletasGP - Servicios de Windows (WinSW)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

function Xml-Escape([string]$s) {
  return ($s -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;' -replace '"','&quot;' -replace "'",'&apos;')
}

# 1) Descargar WinSW
$winsw = "$raiz\winsw.exe"
if (-not (Test-Path $winsw)) {
  Write-Host "`nDescargando WinSW..." -ForegroundColor Yellow
  Invoke-WebRequest "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe" -OutFile $winsw
}
Write-Host "WinSW listo: $winsw" -ForegroundColor Green

# WinSW usa el archivo de config con el MISMO nombre que el exe.
$apiExe = "$raiz\boletasgp-api.exe"
$webExe = "$raiz\boletasgp-web.exe"
Copy-Item $winsw $apiExe -Force
Copy-Item $winsw $webExe -Force

# 2) Detener versiones PM2 de BoletasGP (conserva papeletas-api)
#    Si ya no existen en PM2, se ignora el error y continua.
Write-Host "`nDeteniendo versiones PM2 de BoletasGP (papeletas-api intacta)..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
try { cmd /c "pm2 delete boletasgp-api 2>nul" } catch { }
try { cmd /c "pm2 delete boletasgp-web 2>nul" } catch { }
$ErrorActionPreference = "Stop"
Write-Host "PM2 de BoletasGP liberado." -ForegroundColor Green

# 3) Credenciales del servicio (acceso a carpeta de red)
Write-Host "`nDatos de la cuenta con la que correra el servicio:" -ForegroundColor Yellow
Write-Host "  - Dominio: el dominio o nombre del equipo (ej. GRUPOPECUARIO)"
Write-Host "  - Usuario: administrador"
Write-Host "  - Contrasena: la del usuario administrador"
$dominio = Read-Host "Dominio o equipo"
$usuario = Read-Host "Usuario"
$clave   = Read-Host "Contrasena" -AsSecureString
$pass    = [System.Net.NetworkCredential]::new("", $clave).Password
$passXml = Xml-Escape $pass

$node = (Get-Command node).Source
$nodeXml = Xml-Escape $node
$dominioXml = Xml-Escape $dominio
$usuarioXml = Xml-Escape $usuario

# 4) Config XML del BACKEND (API)
$apiXml = @"
<service>
  <id>BoletasGP-API</id>
  <name>BoletasGP-API</name>
  <description>BoletasGP - API backend (puerto 3001)</description>
  <executable>$nodeXml</executable>
  <arguments>
    <argument>$raiz\backend\dist\main.js</argument>
  </arguments>
  <workingdirectory>$raiz\backend</workingdirectory>
  <logpath>$raiz\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <serviceaccount>
    <domain>$dominioXml</domain>
    <user>$usuarioXml</user>
    <password>$passXml</password>
    <allowservicelogon>true</allowservicelogon>
  </serviceaccount>
  <onfailure action="restart" delay="10 sec"/>
</service>
"@
Set-Content -Path "$raiz\boletasgp-api.xml" -Value $apiXml -Encoding UTF8

# 5) Config XML del FRONTEND (Web)
# npm hoistea 'next' a la raiz del proyecto (workspaces); usar esa ruta si existe.
$nextBin = "$raiz\node_modules\next\dist\bin\next"
if (-not (Test-Path $nextBin)) {
  $nextBin = "$raiz\frontend\node_modules\next\dist\bin\next"
}
Write-Host "Ruta de next usada por el servicio: $nextBin" -ForegroundColor Green
$nextXml = Xml-Escape $nextBin
$webXml = @"
<service>
  <id>BoletasGP-Web</id>
  <name>BoletasGP-Web</name>
  <description>BoletasGP - Frontend web (puerto 3100)</description>
  <executable>$nodeXml</executable>
  <arguments>
    <argument>$nextXml</argument>
    <argument>start</argument>
    <argument>-p</argument>
    <argument>3100</argument>
  </arguments>
  <workingdirectory>$raiz\frontend</workingdirectory>
  <logpath>$raiz\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <serviceaccount>
    <domain>$dominioXml</domain>
    <user>$usuarioXml</user>
    <password>$passXml</password>
    <allowservicelogon>true</allowservicelogon>
  </serviceaccount>
  <onfailure action="restart" delay="10 sec"/>
</service>
"@
Set-Content -Path "$raiz\boletasgp-web.xml" -Value $webXml -Encoding UTF8

# 6) Instalar e iniciar
Write-Host "`nInstalando servicios..." -ForegroundColor Yellow
& $apiExe install
& $apiExe start
& $webExe install
& $webExe start

# 7) Verificar
Start-Sleep -Seconds 6
Write-Host "`nEstado de los servicios:" -ForegroundColor Green
Get-Service BoletasGP-API, BoletasGP-Web | Select-Object Name, Status, StartType
Write-Host "`nPuertos:" -ForegroundColor Green
netstat -ano | findstr ":3001"
netstat -ano | findstr ":3100"

Write-Host "`nPara desinstalar (si hace falta):" -ForegroundColor Yellow
Write-Host "  $apiExe uninstall"
Write-Host "  $webExe uninstall"