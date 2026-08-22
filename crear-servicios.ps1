# ============================================================
#  BoletasGP - Crear servicios fisicos de Windows (WinSW)
#  Ejecutar como Administrador (PowerShell).
#  Uso:  .\crear-servicios.ps1
#  Crea: BoletasGP-API (backend, puerto 3001)
#        BoletasGP-Web (frontend, puerto 3100)
#  Conserva intacto el PM2 de papeletas-api.
#  WinSW es el wrapper mantenido activamente (reemplaza a NSSM).
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

# 2) Detener versiones PM2 de BoletasGP (conserva papeletas-api)
Write-Host "`nDeteniendo versiones PM2 de BoletasGP (papeletas-api intacta)..." -ForegroundColor Yellow
pm2 delete boletasgp-api 2>$null
pm2 delete boletasgp-web 2>$null

# 3) Credenciales del servicio (acceso a carpeta de red)
$dominio = Read-Host "Dominio o equipo (ej. GRUPOPECUARIO)"
$usuario = Read-Host "Usuario (ej. administrador)"
$clave   = Read-Host "Contrasena del usuario" -AsSecureString
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
Set-Content -Path "$raiz\winsw-api.xml" -Value $apiXml -Encoding UTF8

# 5) Config XML del FRONTEND (Web)
$nextXml = Xml-Escape "$raiz\frontend\node_modules\next\dist\bin\next"
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
Set-Content -Path "$raiz\winsw-web.xml" -Value $webXml -Encoding UTF8

# 6) Instalar e iniciar
Write-Host "`nInstalando servicios..." -ForegroundColor Yellow
& $winsw -c "$raiz\winsw-api.xml" install
& $winsw -c "$raiz\winsw-api.xml" start
& $winsw -c "$raiz\winsw-web.xml" install
& $winsw -c "$raiz\winsw-web.xml" start

# 7) Verificar
Start-Sleep -Seconds 5
Write-Host "`nEstado de los servicios:" -ForegroundColor Green
Get-Service BoletasGP-API, BoletasGP-Web | Select-Object Name, Status, StartType
Write-Host "`nPuertos:" -ForegroundColor Green
netstat -ano | findstr ":3001"
netstat -ano | findstr ":3100"

Write-Host "`nPara desinstalar (si hace falta):" -ForegroundColor Yellow
Write-Host "  .\winsw.exe -c winsw-api.xml uninstall"
Write-Host "  .\winsw.exe -c winsw-web.xml uninstall"