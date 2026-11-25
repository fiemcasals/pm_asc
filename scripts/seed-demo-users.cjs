const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');

const hash = bcrypt.hashSync('Demo-Clave-2026', 10);
console.log('Hash generado con bcrypt:', hash.substring(0, 15) + '...');

const users = [
  { usuario: 'demo.admin', nombre: 'Administrador Demo', rol: 'administrador', eca: null },
  { usuario: 'demo.secretaria', nombre: 'Secretaria Demo', rol: 'secretaria', eca: null },
  { usuario: 'demo.firmante', nombre: 'Firmante Demo', rol: 'firmante', eca: null, email: 'firmante@demo.com' },
  { usuario: 'demo.eca', nombre: 'ECA Demo', rol: 'eca', eca: 'ECA Demo', email: 'eca@demo.com' },
  { usuario: 'firmante.demo', nombre: 'Ing. Firmante Legal', rol: 'firmante', eca: null, email: 'firmante.demo@email.com' },
  { usuario: 'eca.demo', nombre: 'ECA Elevadores SRL', rol: 'eca', eca: 'ECA Elevadores SRL', email: 'eca.demo@email.com' },
  { usuario: 'rt.ana', nombre: 'RT Ana', rol: 'rt_calle', eca: null, telefono: '11 4444-1111', email: 'rt.ana@demo.com' },
  { usuario: 'rt.carla', nombre: 'RT Carla', rol: 'rt_calle', eca: null, telefono: '11 4444-2222', email: 'rt.carla@demo.com' },
  { usuario: 'gonza.rt', nombre: 'Gonzalo RT', rol: 'rt_calle', eca: null, telefono: '11 4444-3333', email: 'gonza@demo.com' }
];

for (const u of users) {
  const emailVal = u.email ? `'${u.email}'` : 'null';
  const telVal = u.telefono ? `'${u.telefono}'` : 'null';
  const ecaVal = u.eca ? `'${u.eca}'` : 'null';
  const sql = `insert into usuarios (usuario, nombre, rol, password_hash, email, telefono, eca) values ('${u.usuario}', '${u.nombre}', '${u.rol}', '${hash}', ${emailVal}, ${telVal}, ${ecaVal}) on conflict ((lower(usuario))) do update set password_hash = '${hash}', nombre = '${u.nombre}', rol = '${u.rol}', eca = ${ecaVal};`;
  execSync(`docker exec mant-asc-db psql -U ascensores -d ascensores -c "${sql}"`);
}
console.log('Todos los usuarios demo actualizados exitosamente en PostgreSQL');

const consorcioScript = `
DO $terna$
DECLARE
  cid uuid;
BEGIN
  SELECT id INTO cid FROM consorcios WHERE nombre = 'Edificio Auditoria Playwright';
  IF cid IS NULL THEN
    INSERT INTO consorcios (nombre, direccion, eca_nombre, administracion_nombre, administracion_telefono, administracion_email, ubicacion, pisos)
    VALUES ('Edificio Auditoria Playwright', 'Av. Corrientes 1234, CABA', 'ECA Demo', 'Admin Central', '11-4000-0000', 'admin@central.com', ST_SetSRID(ST_MakePoint(-58.3816, -34.6037), 4326), '["PB", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]'::jsonb)
    RETURNING id INTO cid;

    INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion, tipo)
    VALUES (cid, 'M1', 'Ascensor Principal Tracción', 'traccion');
  ELSE
    UPDATE consorcios SET eca_nombre = 'ECA Demo', ubicacion = ST_SetSRID(ST_MakePoint(-58.3816, -34.6037), 4326) WHERE id = cid;
  END IF;

  INSERT INTO roles_edificio (consorcio_id, rt_calle_nombre, rt_calle_email, firmante_nombre, firmante_email, eca_nombre)
  VALUES (cid, 'rt.ana', 'rt.ana@demo.com', 'demo.firmante', 'firmante@demo.com', 'ECA Demo')
  ON CONFLICT (consorcio_id) DO UPDATE SET rt_calle_nombre = 'rt.ana', rt_calle_email = 'rt.ana@demo.com', firmante_nombre = 'demo.firmante', firmante_email = 'firmante@demo.com', eca_nombre = 'ECA Demo';
END $terna$;
`;

execSync(`docker exec mant-asc-db psql -U ascensores -d ascensores -c "${consorcioScript.replace(/\n/g, ' ')}"`);
console.log('Edificio demo y terna de roles vinculados exitosamente.');
