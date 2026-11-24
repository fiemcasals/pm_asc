import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';
import { fotosObligatorias } from './fotos-obligatorias';

// Integración real (HU-18 RF-01): el informe se guarda en la base con RLS y sin posibilidad de edición. Requiere `npm run db:up` y
// DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF01inf-int';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const TRAZO = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);

describe('Informe consolidado de la visita contra PostgreSQL real (HU-18 RF-01)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenSec = '';
  let tokenRt = '';
  let tokenOtroRt = '';
  let tokenFirmante = '';
  const consorcios: string[] = [];
  const edif: Record<string, string> = {};

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    tokenSec = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-sec`, rol: 'secretaria' })).token;
    tokenRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' })).token;
    tokenOtroRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-otro`, rol: 'rt_calle' })).token;
    tokenFirmante = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-firmante`, rol: 'firmante' })).token;
    const edificio = async (clave: string, rt: string, firmante = `${P}-firmante`) => {
      const alta = await request(app.getHttpServer()).post('/api/consorcios').set('Authorization', `Bearer ${tokenAdmin}`).send({ nombre: `${P} ${clave}`, direccion: `Calle ${clave} 1`, maquinas: [{ referenciaAgc: 'M1' }] });
      expect(alta.status).toBe(201);
      consorcios.push(alta.body.id);
      edif[clave] = alta.body.id;
      const roles = await request(app.getHttpServer()).put(`/api/consorcios/${alta.body.id}/roles`).set('Authorization', `Bearer ${tokenAdmin}`).send({
        rtCalle: { nombre: rt, telefono: '11 0000-0000', email: 'rt@rt.com' }, firmante: { nombre: firmante, email: 'f@f.com' }, eca: { nombre: 'ECA', email: 'e@e.com' },
      });
      expect(roles.status).toBe(200);
    };
    await edificio('propio', `${P}-rt`);
    await edificio('ajeno', `${P}-otro`, `${P}-otro-firmante`);
  });

  afterAll(async () => {
    if (consorcios.length > 0) await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]); // borra también los informes
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const equipo = () => ({ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: { sala_maquinas: { item1: 'ok' } }, observaciones: { sala_maquinas: 'Sin novedades' }, fotos: fotosObligatorias() });
  const informe = (clave: string, extra: Record<string, unknown> = {}) => ({
    consorcioId: edif[clave], horaDispositivo: new Date().toISOString(), equipos: [equipo()],
    firma: { nombre: 'Carlos', apellido: 'Rodríguez', caracter: 'Encargado', dni: '12345678', imagen: PNG, trazos: [TRAZO] }, ...extra,
  });
  const cerrar = (token: string, c: object) => http().post('/api/informes-visita').set('Authorization', `Bearer ${token}`).send(c);
  const ver = (token: string, ruta = '') => http().get(`/api/informes-visita${ruta}`).set('Authorization', `Bearer ${token}`);

  it('el RT cierra el informe firmado de su edificio: queda en la base con la firma, los equipos y las dos horas', async () => {
    const antes = Date.now();
    const res = await cerrar(tokenRt, informe('propio'));

    expect(res.status).toBe(201);
    const [f] = (await admin.query('SELECT * FROM informes_visita WHERE id = $1', [res.body.id])).rows;
    expect(f).toMatchObject({ usuario: `${P}-rt`, requiere_revision: false, sin_firma: null });
    expect(f.firma).toMatchObject({ nombre: 'Carlos', caracter: 'Encargado', dni: '12345678', imagen: PNG });
    expect(f.contenido.equipos[0].observaciones.sala_maquinas).toBe('Sin novedades');
    expect(new Date(f.hora_servidor).getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('«Sin firma» con motivo y foto queda marcado para revisión y lo ven la Secretaría, el Administrador y el Firmante del edificio', async () => {
    const res = await cerrar(tokenRt, informe('propio', { firma: undefined, sinFirma: { motivo: 'El encargado no está y nadie atiende', foto: JPG } }));

    expect(res.status).toBe(201);
    expect(res.body.requiereRevision).toBe(true);
    for (const token of [tokenSec, tokenAdmin, tokenFirmante]) {
      const lista = await ver(token, '?sinFirma=true');
      expect(lista.status).toBe(200);
      expect(lista.body.map((i: { id: string }) => i.id)).toContain(res.body.id);
    }
  });

  it('el RT no cierra un informe de un edificio que no tiene asignado (RLS → 404) y no queda fila', async () => {
    const res = await cerrar(tokenRt, informe('ajeno'));

    expect(res.status).toBe(404);
    expect((await admin.query('SELECT count(*)::int AS n FROM informes_visita WHERE consorcio_id = $1', [edif.ajeno])).rows[0].n).toBe(0);
    expect((await cerrar(tokenOtroRt, informe('ajeno'))).status).toBe(201);
  });

  it('un Firmante sólo ve los informes de los edificios que tiene asignados (RLS)', async () => {
    const lista = await ver(tokenFirmante);

    expect(lista.body.every((i: { consorcioId: string }) => i.consorcioId === edif.propio)).toBe(true);
    expect(lista.body.some((i: { consorcioId: string }) => i.consorcioId === edif.ajeno)).toBe(false);
  });

  it('la base exige firma o «Sin firma», nunca las dos ni ninguna, y la marca de revisión coherente (CHECK)', async () => {
    const insertar = (firma: string | null, sin: string | null, revision: boolean) =>
      admin.query(
        `INSERT INTO informes_visita (consorcio_id, usuario, contenido, firma, sin_firma, requiere_revision, hora_dispositivo) VALUES ($1, 'x', '{"equipos":[{}]}', $2::jsonb, $3::jsonb, $4, now())`,
        [edif.propio, firma, sin, revision],
      );

    await expect(insertar(null, null, false)).rejects.toThrow(/check/i);
    await expect(insertar('{"a":1}', '{"b":1}', false)).rejects.toThrow(/check/i);
    await expect(insertar(null, '{"b":1}', false)).rejects.toThrow(/check/i);
    await expect(
      admin.query(`INSERT INTO informes_visita (consorcio_id, usuario, contenido, firma, requiere_revision, hora_dispositivo) VALUES ($1, 'x', '{"equipos":[]}', '{"a":1}', false, now())`, [edif.propio]),
    ).rejects.toThrow(/check/i);
  });

  it('el rol de la aplicación no modifica ni borra informes (cerrados para siempre), y las políticas son las esperadas', async () => {
    const client = await admin.connect();
    try {
      for (const sql of ["UPDATE informes_visita SET usuario = 'otro'", 'DELETE FROM informes_visita']) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ascensores_app');
        await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
        await expect(client.query(sql)).rejects.toThrow(/permission denied/);
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
    const pol = await admin.query("SELECT policyname, cmd FROM pg_policies WHERE tablename = 'informes_visita' ORDER BY policyname");
    expect(pol.rows.map((r) => `${r.policyname}:${r.cmd}`)).toEqual([
      'rls_informes_visita_admin_secretaria:SELECT', 'rls_informes_visita_asignados_select:SELECT', 'rls_informes_visita_rt_insert:INSERT',
    ]);
  });

  it('acepta un informe con fotos de más de 100 KB (límite del cuerpo de 25 MB)', async () => {
    const grande = { ...equipo(), fotos: { ...fotosObligatorias(), a: { dataUrl: `data:image/jpeg;base64,${'A'.repeat(600_000)}` } } };

    expect((await cerrar(tokenRt, informe('propio', { equipos: [grande] }))).status).toBe(201);
  });

  describe('HU-18 RF-02: fotos obligatorias contra la base real', () => {
    const filas = async () => Number((await admin.query('SELECT count(*) AS n FROM informes_visita WHERE usuario = $1', [`${P}-rt`])).rows[0].n);

    it('un informe con un equipo en uso sin sus fotos obligatorias → 400 con el equipo y la foto, y no queda ninguna fila nueva', async () => {
      const antes = await filas();

      const res = await cerrar(tokenRt, informe('propio', { equipos: [{ ...equipo(), fotos: {} }] }));

      expect(res.status).toBe(400);
      expect(res.body.errores).toEqual([
        expect.stringContaining('El equipo M1 (equipos[0]) no trae la foto de frente de cabina y botonera (obligatoria:frente)'),
        expect.stringContaining('no trae la foto de cables de tracción (obligatoria:cables)'),
      ]);
      expect(await filas()).toBe(antes);
    });

    it('un hidráulico sólo con el frente se guarda, y un equipo fuera de servicio sin fotos también', async () => {
      const hidraulico = await cerrar(tokenRt, informe('propio', { equipos: [{ ...equipo(), tipo: 'hidraulico', fotos: fotosObligatorias('hidraulico') }] }));
      const fuera = await cerrar(tokenRt, informe('propio', { equipos: [{ ...equipo(), estadoEquipo: 'fuera_de_servicio', fotos: {} }] }));

      expect([hidraulico.status, fuera.status]).toEqual([201, 201]);
    });

    it('las fotos obligatorias quedan guardadas dentro del contenido sellado; cambiar una por fuera de la API se detecta', async () => {
      const res = await cerrar(tokenRt, informe('propio'));
      expect(res.status).toBe(201);
      const [fila] = (await admin.query("SELECT contenido->'equipos'->0->'fotos' AS fotos FROM informes_visita WHERE id = $1", [res.body.id])).rows;
      expect(Object.keys(fila.fotos).sort()).toEqual(['obligatoria:cables', 'obligatoria:frente']);
      expect((await http().post(`/api/informes-visita/${res.body.id}/verificar`).set('Authorization', `Bearer ${tokenSec}`)).body).toMatchObject({ coincide: true });

      await admin.query("UPDATE informes_visita SET contenido = jsonb_set(contenido, '{equipos,0,fotos,obligatoria:frente,dataUrl}', '\"data:image/jpeg;base64,AAAA\"') WHERE id = $1", [res.body.id]);

      const v = await http().post(`/api/informes-visita/${res.body.id}/verificar`).set('Authorization', `Bearer ${tokenAdmin}`);
      expect(v.body).toMatchObject({ coincide: false, hashGuardado: res.body.hashSha256 });
    });
  });

  describe('HU-18 RNF-01: sellado contra la base real', () => {
    const verificar = (token: string, id: string) => http().post(`/api/informes-visita/${id}/verificar`).set('Authorization', `Bearer ${token}`);
    const auditoria = (token: string, id: string) => http().get(`/api/informes-visita/${id}/auditoria`).set('Authorization', `Bearer ${token}`);

    it('el informe queda en la base con su hash de 64 caracteres, la versión del cálculo y las dos horas', async () => {
      const antes = Date.now();
      const res = await cerrar(tokenRt, informe('propio'));

      expect(res.status).toBe(201);
      const [f] = (await admin.query('SELECT hash_sha256, version_hash, hora_dispositivo, hora_servidor FROM informes_visita WHERE id = $1', [res.body.id])).rows;
      expect(f.hash_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.hash_sha256).toBe(res.body.hashSha256);
      expect(f.version_hash).toBe('sha256-v1');
      expect(new Date(f.hora_servidor).getTime()).toBeGreaterThanOrEqual(antes - 1000);
      expect(Math.abs(new Date(f.hora_dispositivo).getTime() - antes)).toBeLessThan(10_000);
    });

    it('la verificación de un informe intacto coincide aunque haya pasado por la base (jsonb reordena las claves)', async () => {
      const res = await cerrar(tokenRt, informe('propio'));

      const v = await verificar(tokenSec, res.body.id);

      expect(v.status).toBe(201);
      expect(v.body).toMatchObject({ coincide: true, hashGuardado: res.body.hashSha256, hashCalculado: res.body.hashSha256, usuario: `${P}-sec` });
      const [fila] = (await admin.query('SELECT * FROM verificaciones_informe WHERE informe_id = $1', [res.body.id])).rows;
      expect(fila).toMatchObject({ coincide: true, usuario: `${P}-sec`, rol: 'secretaria' });
    });

    it('si alguien con acceso directo a la base altera el contenido, la verificación lo detecta y queda asentado', async () => {
      const res = await cerrar(tokenRt, informe('propio'));
      await admin.query("UPDATE informes_visita SET contenido = jsonb_set(contenido, '{equipos,0,observaciones}', '{\"cabina\":\"Alterado\"}') WHERE id = $1", [res.body.id]);

      const v = await verificar(tokenAdmin, res.body.id);

      expect(v.body).toMatchObject({ coincide: false, hashGuardado: res.body.hashSha256 });
      expect(v.body.hashCalculado).not.toBe(res.body.hashSha256);
      expect((await admin.query('SELECT coincide FROM verificaciones_informe WHERE informe_id = $1', [res.body.id])).rows).toEqual([{ coincide: false }]);
    });

    it('alterar la firma o una foto por fuera de la API también se detecta', async () => {
      const res = await cerrar(tokenRt, informe('propio'));
      await admin.query("UPDATE informes_visita SET firma = jsonb_set(firma, '{nombre}', '\"Otra persona\"') WHERE id = $1", [res.body.id]);

      expect((await verificar(tokenSec, res.body.id)).body.coincide).toBe(false);
    });

    it('un PUT, un PATCH y un DELETE → 409 y quedan registrados en la base, también el del RT que no puede leer la auditoría', async () => {
      const res = await cerrar(tokenRt, informe('propio'));

      for (const m of ['put', 'patch', 'delete'] as const) expect((await http()[m](`/api/informes-visita/${res.body.id}`).set('Authorization', `Bearer ${tokenRt}`).send({})).status).toBe(409);
      expect((await http().delete(`/api/informes-visita/${res.body.id}`).set('Authorization', `Bearer ${tokenAdmin}`)).status).toBe(409);

      const filas = (await admin.query('SELECT usuario, rol, metodo FROM intentos_modificacion_informe WHERE informe_id = $1 ORDER BY fecha, id', [res.body.id])).rows;
      expect(filas.map((f) => `${f.usuario}:${f.metodo}`)).toEqual([`${P}-rt:PUT`, `${P}-rt:PATCH`, `${P}-rt:DELETE`, `${P}-admin:DELETE`]);
      expect((await admin.query('SELECT count(*)::int AS n FROM informes_visita WHERE id = $1', [res.body.id])).rows[0].n).toBe(1);
      expect((await auditoria(tokenSec, res.body.id)).body.intentosModificacion).toHaveLength(4);
      expect((await auditoria(tokenRt, res.body.id)).status).toBe(403);
    });

    it('las tablas de auditoría sólo se agregan: el rol de la aplicación no modifica ni borra', async () => {
      const client = await admin.connect();
      try {
        for (const sql of ["UPDATE intentos_modificacion_informe SET usuario = 'x'", 'DELETE FROM intentos_modificacion_informe', "UPDATE verificaciones_informe SET coincide = true", 'DELETE FROM verificaciones_informe']) {
          await client.query('BEGIN');
          await client.query('SET LOCAL ROLE ascensores_app');
          await client.query("SELECT set_config('app.rol_actual', 'administrador', true)");
          await expect(client.query(sql)).rejects.toThrow(/permission denied/);
          await client.query('ROLLBACK');
        }
      } finally {
        client.release();
      }
    });

    it('la base exige un hash válido (64 hexadecimales) y una verificación con hash calculado válido', async () => {
      const res = await cerrar(tokenRt, informe('propio'));

      await expect(admin.query("UPDATE informes_visita SET hash_sha256 = 'corto' WHERE id = $1", [res.body.id])).rejects.toThrow(/check/i);
      await expect(admin.query("INSERT INTO verificaciones_informe (informe_id, usuario, rol, hash_calculado, coincide) VALUES ($1, 'x', 'r', 'corto', true)", [res.body.id])).rejects.toThrow(/check/i);
    });

    it('las políticas de las tablas de auditoría son las esperadas', async () => {
      const pol = await admin.query("SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('intentos_modificacion_informe', 'verificaciones_informe') ORDER BY tablename, policyname");

      expect(pol.rows.map((r) => `${r.tablename}:${r.policyname}:${r.cmd}`)).toEqual([
        'intentos_modificacion_informe:rls_intentos_informe_insert:INSERT', 'intentos_modificacion_informe:rls_intentos_informe_select:SELECT', 'verificaciones_informe:rls_verificaciones_informe_admin_secretaria:ALL',
      ]);
    });
  });

  describe('HU-18 RNF-02: la base no deja duplicar el mismo informe', () => {
    const idCelular = () => `${P}-${Math.random().toString(36).slice(2, 12)}`;
    const filas = async (id: string) => (await admin.query('SELECT id FROM informes_visita WHERE client_report_id = $1', [id])).rows;

    it('el primer envío responde 201 y guarda el identificador; reenviarlo responde 200 con el mismo informe y no crea otra fila', async () => {
      const id = idCelular();
      const a = await cerrar(tokenRt, informe('propio', { clientReportId: id }));
      const b = await cerrar(tokenRt, informe('propio', { clientReportId: id }));

      expect([a.status, b.status]).toEqual([201, 200]);
      expect(b.body.id).toBe(a.body.id);
      expect(b.body.hashSha256).toBe(a.body.hashSha256);
      expect(await filas(id)).toHaveLength(1);
    });

    it('diez envíos simultáneos del mismo informe terminan en una sola fila (la restricción única de la base)', async () => {
      const id = idCelular();

      const res = await Promise.all(Array.from({ length: 10 }, () => cerrar(tokenRt, informe('propio', { clientReportId: id }))));

      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.filter((r) => r.status === 200)).toHaveLength(9);
      expect(new Set(res.map((r) => r.body.id)).size).toBe(1);
      expect(await filas(id)).toHaveLength(1);
    });

    it('el informe reenviado sigue sellado: la verificación coincide aunque se haya reintentado', async () => {
      const id = idCelular();
      const a = await cerrar(tokenRt, informe('propio', { clientReportId: id }));
      await cerrar(tokenRt, informe('propio', { clientReportId: id }));

      const v = await http().post(`/api/informes-visita/${a.body.id}/verificar`).set('Authorization', `Bearer ${tokenSec}`);

      expect(v.body.coincide).toBe(true);
    });

    it('la base exige un identificador válido y único (CHECK y UNIQUE)', async () => {
      const id = idCelular();
      await cerrar(tokenRt, informe('propio', { clientReportId: id }));

      await expect(admin.query("UPDATE informes_visita SET client_report_id = 'corto' WHERE client_report_id = $1", [id])).rejects.toThrow(/check/i);
      await expect(
        admin.query(`INSERT INTO informes_visita (consorcio_id, usuario, contenido, firma, requiere_revision, hora_dispositivo, client_report_id) VALUES ($1, 'x', '{"equipos":[{}]}', '{"a":1}', false, now(), $2)`, [edif.propio, id]),
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it('un identificador de otro usuario → 409 y no se devuelve su informe', async () => {
      const id = idCelular();
      await cerrar(tokenRt, informe('propio', { clientReportId: id }));
      await admin.query("UPDATE informes_visita SET usuario = 'otro.usuario' WHERE client_report_id = $1", [id]);

      const res = await cerrar(tokenRt, informe('propio', { clientReportId: id }));

      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain('otro.usuario');
    });
  });
});
