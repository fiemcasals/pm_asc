import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

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
  const equipo = () => ({ maquinaId: 'm1', referenciaAgc: 'M1', tipo: 'traccion', estadoEquipo: 'en_uso', respuestas: { sala_maquinas: { item1: 'ok' } }, observaciones: { sala_maquinas: 'Sin novedades' }, fotos: {} });
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
    const grande = { ...equipo(), fotos: { a: { dataUrl: `data:image/jpeg;base64,${'A'.repeat(600_000)}` } } };

    expect((await cerrar(tokenRt, informe('propio', { equipos: [grande] }))).status).toBe(201);
  });
});
