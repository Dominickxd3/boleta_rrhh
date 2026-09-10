const sql = require('mssql');

const cfg = {
  server: '10.10.1.6',
  port: 1433,
  user: 'sa',
  password: 'Grupecsac0606',
  database: 'BoletaRRHH',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  connectionTimeout: 15000,
};

(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect();

  const fallos = await pool.request().query(
    "SELECT TOP 10 detalle, usuario, ip, fecha FROM auditoria WHERE accion = 'login_fallido' ORDER BY fecha DESC",
  );
  console.log('=== Ultimos login fallidos ===');
  fallos.recordset.forEach((x) =>
    console.log(
      new Date(x.fecha).toLocaleString('es-PE') + ' | user: [' + (x.usuario ?? '') + '] | ip: ' + x.ip,
    ),
  );

  const ok = await pool.request().query(
    "SELECT TOP 5 detalle, usuario, fecha FROM auditoria WHERE accion = 'login' ORDER BY fecha DESC",
  );
  console.log('=== Ultimos login OK ===');
  ok.recordset.forEach((x) =>
    console.log(new Date(x.fecha).toLocaleString('es-PE') + ' | ' + x.detalle),
  );

  const sp = await pool.request().query(
    "SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.sp_validar_login_erp')) AS def",
  );
  console.log('=== SP sp_validar_login_erp ===');
  console.log(sp.recordset[0].def);

  await pool.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });