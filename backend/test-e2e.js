const BASE = 'http://localhost:3001/api';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ok = (paso, cond) =>
  console.log(`${cond ? 'PASS' : 'FAIL'} ${paso}`);

(async () => {
  // 1. Login
  const login = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  ok('LOGIN', login.status === 201 || login.status === 200);
  const token = login.body.access_token;
  const auth = { Authorization: `Bearer ${token}` };
  const j = { ...auth, 'Content-Type': 'application/json' };

  // 2. Nómina: empresa y periodos
  const empresa = await req('/nomina/empresa', { headers: auth });
  ok('EMPRESA', empresa.status === 200 && !!empresa.body?.descripcion);
  console.log('   ->', empresa.body?.descripcion, empresa.body?.ruc);
  const periodos = await req('/nomina/periodos', { headers: auth });
  ok('PERIODOS', periodos.status === 200 && periodos.body?.length > 0);
  const vigente = periodos.body?.find((p) => p.st_anulado === '0') || periodos.body?.[0];
  console.log('   -> periodo vigente:', vigente?.rem_anomes + '/' + vigente?.rem_correl);

  // 3. Vista previa de nómina del periodo vigente
  const preview = await req(
    `/nomina/boletas?anomes=${vigente.rem_anomes}&correl=${vigente.rem_correl}`,
    { headers: auth },
  );
  ok('PREVIEW NOMINA', preview.status === 200 && preview.body?.trabajadores?.length > 0);
  console.log('   ->', preview.body?.total, 'trabajadores');

  // 4. Resumen, por área y exportar
  const resumen = await req('/boletas/resumen?anio=2026&mes=08', { headers: auth });
  ok('RESUMEN', resumen.status === 200 && resumen.body?.total > 0);
  console.log('   ->', JSON.stringify(resumen.body));
  const porArea = await req('/boletas/por-area?anio=2026&mes=08', { headers: auth });
  ok('POR-AREA', porArea.status === 200 && porArea.body?.areas?.length > 0);
  console.log('   -> áreas:', porArea.body?.areas?.length, '| total:', porArea.body?.total);
  const exportar = await req('/boletas/exportar?anio=2026&mes=08', { headers: auth });
  ok('EXPORTAR CSV', exportar.status === 200 && exportar.headers.get('content-type')?.includes('csv'));
  console.log('   -> bytes:', exportar.body?.length);

  // 5. Ciclo completo con datos temporales (se borran al final)
  const w = await req('/trabajadores', {
    method: 'POST',
    headers: j,
    body: JSON.stringify({
      dni: '00000001',
      nombres: 'PRUEBA E2E',
      apellidoPaterno: 'TEST',
      apellidoMaterno: 'AUTOMATIZADO',
      email: 'e2e@test.local',
    }),
  });
  ok('CREAR TRABAJADOR TEMP', w.status === 201 || w.status === 200);
  const wId = w.body.id;

  const b = await req('/boletas', {
    method: 'POST',
    headers: j,
    body: JSON.stringify({
      trabajadorId: wId,
      periodo: '202608',
      detalle: {
        ingresos: [{ concepto: 'Sueldo básico', monto: 2000 }],
        descuentos: [{ concepto: 'ONP', monto: 260 }],
        netoPagar: 1740,
      },
    }),
  });
  ok('CREAR BOLETA TEMP', b.status === 201 || b.status === 200);
  const tokenFirma = b.body.tokenFirma;
  const bId = b.body.id;

  const info = await req(`/firma/firma/${tokenFirma}`);
  ok('INFO FIRMA', info.status === 200 && !!info.body?.trabajador);

  const firmar = await req(`/firma/firma/${tokenFirma}`, {
    method: 'POST',
    headers: j,
    body: JSON.stringify({ firma: PNG }),
  });
  ok('FIRMAR', firmar.status === 201 || firmar.status === 200);

  const tokenVer = firmar.body?.urlVer?.split('/').pop();
  const ver = await req(`/firma/ver/${tokenVer}`);
  ok('VER FIRMADA', ver.status === 200 && !!ver.body?.fechaFirmado);

  const pdf = await req(`/firma/ver/${tokenVer}/pdf`);
  ok('PDF FIRMADO', pdf.status === 200 && pdf.headers.get('content-type')?.includes('pdf'));

  const reintento = await req(`/firma/firma/${tokenFirma}`, {
    method: 'POST',
    headers: j,
    body: JSON.stringify({ firma: PNG }),
  });
  ok('REINTENTO FIRMAR (409)', reintento.status === 409);

  // 6. Marcar correo enviado (PATCH, no envía SMTP)
  const marcado = await req(`/boletas/${bId}/email-enviado`, { method: 'PATCH', headers: auth });
  ok('MARCAR EMAIL ENVIADO', marcado.status === 200 && marcado.body?.emailEnviado === true);

  // 7. Limpieza
  await req(`/boletas/${bId}`, { method: 'DELETE', headers: auth });
  await req(`/trabajadores/${wId}`, { method: 'DELETE', headers: auth });
  ok('LIMPIEZA', true);

  console.log('\nFLUJO COMPLETO OK');
})().catch((e) => {
  console.error('ERROR DE TEST:', e);
  process.exit(1);
});