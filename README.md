# Boletas RRHH

Sistema de boletas de pago con firma digital en navegador/celular para trabajadores.

## Estructura

```
D:\boleta_rrhh\
├── backend\    → API NestJS (TypeScript + SQL Server) — puerto 3001
└── frontend\   → Portal web Next.js (React + Tailwind) — puerto 3000
```

## Requisitos

- Node.js 20 o superior (probado con v24)
- SQL Server (ya configurado en `backend\.env`)

## Configuración

1. Copiar `.env.example` a `.env` y ajustar credenciales:

```
backend\.env         → conexión a SQL Server (host, sa, password), carpeta de boletas
frontend\.env.local  → URL de la API (NEXT_PUBLIC_API_URL)
```

2. Instalar dependencias (desde la raíz):

```
npm install
```

El usuario admin se crea solo al iniciar por primera vez (por defecto `admin` / `admin123`, ver `ADMIN_USER` y `ADMIN_PASSWORD` en `backend\.env`).

## Cómo correr

### Desarrollo (con recarga automática)

Desde la raíz `D:\boleta_rrhh`:

```
npm run dev:backend     → API en http://localhost:3001/api
npm run dev:frontend    → Web en http://localhost:3000
```

O por separado:

```
cd backend
npm run start:dev

cd frontend
npm run dev
```

### Producción (Windows Server)

```
npm run build:backend
npm run build:frontend

# API
node backend\dist\main.js

# Web
cd frontend
npm run start
```

### Como servicio con PM2 (recomendado en Windows Server)

```
npm install -g pm2

pm2 start backend\dist\main.js --name boleta-api
cd frontend && pm2 start npm --name boleta-web -- run start
pm2 save
pm2 startup
```

## Uso

1. **Portal RRHH** → `http://servidor:3000` — login `admin` / `admin123`
   - **Inicio** → KPIs automáticos del periodo (boletas, firmadas, pendientes, sin correo, % firmado) y avance de firmas por área
   - **Trabajadores** → registrar/editar trabajadores (con su área y email, necesarios para el envío de correos)
   - **Boletas** → grilla de trabajadores **por área** con control de envío: *Copiar link*, *Enviar correo* (SMTP) o *Marcar como enviado*; filtros *Solo falta enviar correo* / *Solo pendientes de firma*; y botón **Exportar Excel** (CSV).
   - **Importar desde nómina** (recomendado): en `Boletas` eliges el periodo, pulsas *1. Sincronizar del ERP* (materializa los datos en tu BD local), ves la *Vista previa* y pulsas *2. Importar boletas* → se crean los trabajadores y boletas con su link de firma.
   - O generar boletas manualmente (elige trabajador, periodo AÑOMES e ingresos/descuentos)
   - En "Resumen" ves **quién firmó y quién no**, con fecha/hora, y puedes ver/descargar el PDF firmado

## Envío de correos (SMTP)

El botón *Enviar correo* manda el link de firma al email del trabajador. Configura el servidor SMTP en `backend\.env`:

```
SMTP_HOST=smtp.empresa.com
SMTP_PORT=587
SMTP_USER=usuario
SMTP_PASS=clave
SMTP_FROM=Boletas RRHH <boletas@empresa.com>
```

Si `SMTP_HOST`/`SMTP_USER` están vacíos, el envío no está configurado y el sistema lo avisa (puedes seguir usando *Copiar link* y *Marcar como enviado*).

2. **Trabajador** → abre el link de firma en su celular o PC **sin loguearse**:
   - Ve su boleta, dibuja su firma con el dedo/mouse y firma **una sola vez**
   - Después puede abrir un link de consulta para **ver su documento firmado**

3. **Guardado de archivos** → el PDF firmado se guarda automáticamente en:

```
D:\Boletas\2026\08\202608 - ORTIZ CASTILLO DOMINICK SALIM.pdf
```
   (carpeta configurable con `SERVIDOR_BOLETAS` en `backend\.env`)

## Nómina (ETL desde el ERP)

Para no golpear el ERP `10.10.1.3` en cada consulta, los datos se materializan una vez por periodo en tu BD (`10.10.1.6 / BoletaRRHH`):

- `backend\sql\01_nomina_etl.sql` → crea las tablas `NominaDetalle` y `NominaPeriodo` y el SP `usp_Nomina_Sincronizar`, que ejecuta el SP del ERP (`rpt_BolePagoPlame`) vía linked server `ERP_101013` y guarda el resultado localmente.
- Instalación (una sola vez): ejecuta el script contra `BoletaRRHH` (o pídele a tu DBA). El API también lo instala al arrancar si faltara.
- Parámetros en `backend\.env`: `NOMINA_EMP_CODIGO=003`, `NOMINA_ID_REMUNE=1` (GRUPO PECUARIO S.A.C., remuneración "Mensual Empleados").
- La API **solo lee tablas locales**; al ERP solo se le llama en el botón *Sincronizar* (una vez por periodo).

## API

Documentación Swagger disponible en `http://localhost:3001/api/docs` (login con el token JWT).
