# BoletasGP — Despliegue en Windows Server

Guía paso a paso para poner el proyecto en producción en un **Windows Server limpio**, usando **PM2** para mantener los procesos activos y **IIS (opcional) como proxy reverso con HTTPS**.

---

## 1. Requisitos previos

- Windows Server 2019/2022.
- Node.js **22 LTS** (o 20 LTS) — la versión 16 de Next.js requiere Node >= 20.9. Se recomienda 22 LTS por estabilidad.
- npm (viene con Node).
- PM2 (se instala después).
- SQL Server accesible desde el servidor (en este proyecto se usa **mssql**).
- Servidor enlazado y procedimientos almacenados del ERP (ver sección 5).
- Acceso de red a la carpeta donde se guardan los PDF (`SERVIDOR_BOLETAS`).
- Certificado SSL si se usará HTTPS.

## 2. Instalación de Node.js

1. Descargar e instalar Node.js 22 LTS desde https://nodejs.org (versión `.msi` para Windows).
2. Verificar en una consola (PowerShell):
   ```powershell
   node -v
   npm -v
   ```
3. Instalar PM2 globalmente:
   ```powershell
   npm install -g pm2
   pm2 -v
   ```

## 3. Subir el proyecto

1. Desde la rama `deployment/windows-server`, descargar/clonar el proyecto en el servidor, por ejemplo en `C:\apps\boleta_rrhh`.
2. **No** se suben: `node_modules`, `.env`, `.next`, `dist`, archivos de datos (`*.pdf`, imágenes sueltas) ni logs.

   Estructura mínima que debe existir:
   ```
   C:\apps\boleta_rrhh\
   ├── backend\
   │   ├── dist\          (se genera con el build)
   │   └── .env           (se crea en el paso 4)
   ├── frontend\
   │   └── .env.local     (se crea en el paso 7)
   ├── logs\              (lo crea PM2)
   ├── package.json
   ├── ecosystem.config.js
   └── .env.example       (referencia de variables)
   ```

## 4. Configuración del backend (.env)

1. En `backend\` copiar `.env.example` a `.env`:
   ```powershell
   cd C:\apps\boleta_rrhh\backend
   Copy-Item .env.example .env
   ```
2. Editar `.env` con los valores reales (ver `backend\.env.example`). Las variables clave:

   | Variable | Descripción |
   |---|---|
   | `PORT` | Puerto interno de la API (ej. `3001`) |
   | `JWT_SECRET` | Secreto largo y aleatorio para firmar tokens |
   | `CORS_ORIGIN` | Origen del frontend, ej. `https://boletas.miempresa.com` (vacío = cualquier origen) |
   | `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | Conexión a SQL Server |
   | `DB_SYNCHRONIZE` | `true` solo la primera vez (crea/actualiza el esquema); luego `false` |
   | `GGHH_DB_*` | BD del ERP para sincronizar trabajadores |
   | `SERVIDOR_BOLETAS` | Carpeta (UNC o local) donde se guardan los PDF |
   | `SMTP_*` | Correo remitente |
   | `FRONT_URL` | URL pública del frontend (para los enlaces de firma/ver) |
   | `ADMIN_USER/ADMIN_PASSWORD` | Usuario admin local de respaldo |

   **Nota:** `.env` NO se sube al repositorio; se crea en el servidor.

## 5. Configuración de SQL Server

El backend se conecta a un SQL Server (motor **mssql**) con:

- Base de datos principal: `BoletaRRHH` (contiene `boletas`, `trabajadores`, `usuarios`, `auditoria`, `NominaDetalle`, `NominaPeriodo`, `Tab_SYS_Usuarios`).
- BD del ERP para la sincronización de trabajadores: configurada en `GGHH_DB_*`.
- Servidor enlazado `ERP_101013` → base `dbGP_2024_GP` (para la nómina y el login del ERP).

**Deben existir en el SQL Server de producción** (son objetos de BD, no código):

- `usp_Nomina_Sincronizar` (materializa la planilla en `NominaDetalle`).
- `sp_SyncTrabajadoresCache` (en la BD GGHH).
- `sp_sync_usuarios_erp` y `sp_validar_login_erp` (en `BoletaRRHH`).
- Tablas que las entidades esperan (se crean automáticamente si `DB_SYNCHRONIZE=true` la primera vez).

Si la BD ya existe con datos, usa `DB_SYNCHRONIZE=true` en el primer arranque para crear/actualizar el esquema, y luego cámbialo a `false`.

## 6. Instalación de dependencias y compilación del backend

```powershell
cd C:\apps\boleta_rrhh
npm install
npm run build:backend
```

Esto genera `backend\dist\` con el código de producción.

## 7. Configuración del frontend (.env.local) y compilación

1. En `frontend\` copiar `.env.example` a `.env.local`:
   ```powershell
   cd C:\apps\boleta_rrhh\frontend
   Copy-Item .env.example .env.local
   ```
2. Editar `NEXT_PUBLIC_API_URL` con la **URL pública de la API**, ej. `https://boletas.miempresa.com/api`.
   > Esta variable se inyecta en tiempo de build: si cambia, hay que recompilar el frontend.
3. Compilar:
   ```powershell
   npm run build:frontend
   ```

## 8. Puertos

- Backend (API): `3001` (configurable en `.env`).
- Frontend (Next.js): `3100` (configurable en `ecosystem.config.js` con la variable `PORT_WEB`; el 3000 suele estar ocupado).
- Estos puertos quedan internos (solo el proxy IISI/el servidor los usa); **no** se abren al público si usas IIS como front.

## 9. Arquitectura recomendada

```text
Internet
   ↓ (HTTPS 443)
IIS (URL Rewrite) → proxy reverso
   ↓
Node.js / PM2 (frontend, puerto 3100)
   ↓            (solo llamadas /api)
Node.js / PM2 (backend, puerto 3001)
   ↓
SQL Server
```

- **PM2** mantiene vivos ambos procesos y los reinicia automáticamente.
- **IIS** con **URL Rewrite** sirve HTTPS y redirige: `/api/*` → `http://localhost:3001/api/*` y el resto → `http://localhost:3100/*`.
- Alternativa más simple: solo PM2 + Firewall abriendo 3100/3001, y el HTTPS lo maneja IIS u otro proxy.

## 10. Configuración de PM2

Desde la raíz del proyecto:

```powershell
cd C:\apps\boleta_rrhh
pm2 start ecosystem.config.js --env production
pm2 save
```

- **Arranque automático con el servidor** (requiere permisos de administrador):
  ```powershell
  pm2 startup
  ```
  Sigue las instrucciones que imprime (genera un servicio de Windows).
- **Logs**: se guardan en `C:\apps\boleta_rrhh\logs\`.

## 11. Configuración de HTTPS con IIS (opcional pero recomendado)

> **Importante:** el proxy reverso de IIS necesita instalar **URL Rewrite** y **Application Request Routing (ARR)** desde el Web Platform Installer, y en ARR activar *Enable proxy*.

1. Instalar IIS + los módulos **URL Rewrite** y **ARR**.
2. Crear un sitio IIS (puede apuntar a cualquier carpeta, ej. `C:\apps\boleta_rrhh\web`) y pegar el archivo `web.config` incluido en el repo en la raíz del sitio (contiene HTTPS + API → 3001 + frontend → 3100).
3. El `web.config` (ya incluido en el repositorio) equivale a:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="Force HTTPS" stopProcessing="true">
             <match url="(.*)" />
             <conditions><add input="{HTTPS}" pattern="off" ignoreCase="true" /></conditions>
             <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
           </rule>
           <rule name="API Reverse Proxy" stopProcessing="true">
             <match url="^api/(.*)" />
             <action type="Rewrite" url="http://localhost:3001/api/{R:1}" />
           </rule>
           <rule name="Frontend Reverse Proxy" stopProcessing="true">
             <match url="(.*)" />
             <action type="Rewrite" url="http://localhost:3100/{R:1}" />
           </rule>
         </rules>
       </rewrite>
     </system.webServer>
   </configuration>
   ```

4. Asignar el certificado SSL al sitio (HTTPS 443).

## 12. Configuración del Firewall

- **Con IIS + HTTPS**: solo abrir el puerto **443** (y 80 para redirección). No exponer 3001/3100.
- **Sin IIS**: abrir 3001 y 3100 (o los que uses) para el público.
- Permitir la conexión del servidor hacia el SQL Server y hacia la carpeta de red de boletas (si aplica).

## 13. Inicio del sistema

```powershell
pm2 start ecosystem.config.js --env production
```

## 14. Verificación de funcionamiento

- API: `http://localhost:3001/api` responde (o `https://boletas.miempresa.com/api` si usas IIS).
- Frontend: `http://localhost:3100` carga el login (o la URL pública).
- Swagger (documentación API): `http://localhost:3001/api/docs` (deshabilitar en producción si se desea).
- Probar el flujo completo: login → generación de boletas → envío de correo → firma → ver PDF.

## 15. Pruebas de API

- `GET /api/firma/firma/<token>` → info de la boleta.
- `POST /api/auth/login` → token.
- `GET /api/boletas/resumen` (con token) → KPIs.
- `GET /api/boletas/:id/auditoria` (con token) → auditoría.

## 16. Pruebas de conexión a base de datos

- Verificar que el backend arranca sin errores de conexión a SQL Server.
- En los logs (`logs/api-error.log`) no deben aparecer `ECONNREFUSED` hacia la BD.

## 17. Revisión de logs

```powershell
pm2 logs boletasgp-api
pm2 logs boletasgp-web
```
Los archivos están en `C:\apps\boleta_rrhh\logs\`.

## 18. Procedimiento de reinicio

```powershell
pm2 restart all
```
O individual:
```powershell
pm2 restart boletasgp-api
pm2 restart boletasgp-web
```

## 19. Procedimiento de actualización

1. En el servidor, traer los cambios de la rama `deployment/windows-server`:
   ```powershell
   cd C:\apps\boleta_rrhh
   git pull origin deployment/windows-server
   ```
2. Instalar dependencias y compilar:
   ```powershell
   npm install
   npm run build:backend
   cd frontend
   # si cambió NEXT_PUBLIC_API_URL, actualizar .env.local
   npm run build
   cd ..
   ```
3. Reiniciar:
   ```powershell
   pm2 restart all
   ```
4. Verificar logs y funcionamiento.

## 20. Procedimiento de rollback

1. Guardar el estado actual antes de actualizar:
   ```powershell
   pm2 save
   ```
2. Si algo falla, volver al commit anterior:
   ```powershell
   cd C:\apps\boleta_rrhh
   git reset --hard <commit_anterior>
   npm install
   npm run build:backend
   cd frontend && npm run build && cd ..
   pm2 restart all
   ```
3. El `.env` y `.env.local` no se tocan con el rollback (quedan intactos).

---

## Seguridad (resumen)

- Las credenciales viven en `.env` (no se suben a Git).
- Genera un `JWT_SECRET` largo y aleatorio.
- Configura `CORS_ORIGIN` con el origen real del frontend (no usar `*` en producción).
- `DB_SYNCHRONIZE=false` en producción una vez creado el esquema.
- Considera deshabilitar Swagger (`/api/docs`) en producción si no lo necesitas.
- La API ya confía en el proxy (`trust proxy`) para registrar la IP real del cliente.
- Usa HTTPS (IIS u otro proxy) para proteger las credenciales en tránsito.