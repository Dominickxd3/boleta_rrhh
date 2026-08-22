// ===== BoletasGP - PM2 ecosystem =====
// Ejecuta el backend (Node) y el frontend (Next.js) como servicios de producción.
// Instalación:  npm install -g pm2
// Inicio:       pm2 start ecosystem.config.js --env production
// Guardado:     pm2 save   (para que arranque con el servidor: pm2 startup)
// Logs:         pm2 logs boletasgp-api / pm2 logs boletasgp-web
module.exports = {
  apps: [
    {
      name: 'boletasgp-api',
      cwd: './backend',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '../logs/api-out.log',
      error_file: '../logs/api-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'boletasgp-web',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p ' + (process.env.PORT_WEB || '3100'),
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '../logs/web-out.log',
      error_file: '../logs/web-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};