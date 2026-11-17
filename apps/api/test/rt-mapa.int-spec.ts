import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-16 RF-01): el mapa del RT sale de la base con la RLS, la ubicación de PostGIS y el avance del día.
// Requiere `npm run db:up` y DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET.
loadEnvFileInto(process.env);

const P = 'RF01rtmapa-int';

describe('Mapa del RT contra PostgreSQL real (HU-16 RF-01)', () => {
  let app: INestApplication;
  let admin: Pool;
  let tokenAdmin = '';
  let tokenRt = '';
  let tokenOtroRt = '';
  let idRt = '';
  const consorcios: string[] = [];
  const edif: Record<string, string> = {};
  const maquinas: Record<string, string[]> = {};

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    tokenAdmin = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-admin`, rol: 'administrador' })).token;
    const rt = await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-rt`, rol: 'rt_calle' });
    tokenRt = rt.token;
    tokenOtroRt = (await asegurarUsuarioPrueba(admin, config, { usuario: `${P}-otro`, rol: 'rt_calle' })).token;
    idRt = (await admin.query<{ id: string }>('SELECT id FROM usuarios WHERE usuario = $1', [`${P}-rt`])).rows[0].id;
    await admin.query('UPDATE usuarios SET nombre = $2 WHERE id = $1', [idRt, 'Ing. Aliado 1']);

    const edificio = async (clave: string, rt: string, ubicacion: { latitud: number; longitud: number } | null) => {
      const alta = await request(app.getHttpServer()).post('/api/consorcios').set('Authorization', `Bearer ${tokenAdmin}`).send({
        nombre: `${P} ${clave}`, direccion: `Calle ${clave} 1`, ...(ubicacion ? { ubicacion } : {}), maquinas: [{ referenciaAgc: 'M1' }, { referenciaAgc: 'M2' }],
      });
      expect(alta.status).toBe(201);
      consorcios.push(alta.body.id);
      edif[clave] = alta.body.id;
      maquinas[clave] = (await admin.query<{ id: string }>('SELECT id FROM maquinas WHERE consorcio_id = $1 ORDER BY referencia_agc', [alta.body.id])).rows.map((r) => r.id);
      const roles = await request(app.getHttpServer()).put(`/api/consorcios/${alta.body.id}/roles`).set('Authorization', `Bearer ${tokenAdmin}`).send({
        rtCalle: { nombre: rt, telefono: '11 0000-0000', email: 'rt@rt.com' }, firmante: { nombre: 'Firmante', email: 'f@f.com' }, eca: { nombre: 'ECA', email: 'e@e.com' },
      });
      expect(roles.status).toBe(200);
    };
    await edificio('uno', `${P}-rt`, { latitud: -34.6118, longitud: -58.396 });
    await edificio('dos', `${P}-rt`, null);
    await edificio('tres', `${P}-rt`, { latitud: -34.58, longitud: -58.42 });
    await edificio('ajeno', `${P}-otro`, { latitud: -34.62, longitud: -58.38 });
  });

  afterAll(async () => {
    if (consorcios.length > 0) {
      await admin.query('DELETE FROM inspecciones_checklist WHERE consorcio_id = ANY($1::text[])', [consorcios]);
      await admin.query('DELETE FROM visitas_fallidas WHERE consorcio_id = ANY($1::text[])', [consorcios]);
      await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]);
    }
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const mapa = (token = tokenRt) => http().get('/api/rt/mapa').set('Authorization', `Bearer ${token}`);
  const ids = async (token = tokenRt) => ((await mapa(token)).body.edificios as { id: string }[]).map((e) => e.id).sort();
  const inspeccionar = (clave: string, i: number) =>
    admin.query(
      `INSERT INTO inspecciones_checklist (consorcio_id, maquina_id, referencia_agc, tipo_maquina, version_checklist) VALUES ($1, $2, $3, 'traccion', 'v-test')`,
      [edif[clave], maquinas[clave][i], `M${i + 1}`],
    );

  it('trae el nombre y la zona del RT (guardada con el endpoint del Administrador), la hora del servidor y los feriados', async () => {
    expect((await http().put(`/api/usuarios/${idRt}/zona`).set('Authorization', `Bearer ${tokenAdmin}`).send({ zona: 'Norte' })).status).toBe(200);

    const res = await mapa();

    expect(res.status).toBe(200);
    expect(res.body.rt).toEqual({ nombre: 'Ing. Aliado 1', zona: 'Norte' });
    expect(Math.abs(Date.parse(res.body.ahora) - Date.now())).toBeLessThan(10_000);
    expect(res.body.feriados).toContain('2026-11-23');
    expect((await admin.query('SELECT zona FROM usuarios WHERE id = $1', [idRt])).rows[0].zona).toBe('Norte');
  });

  it('criterio 4: el RT ve sólo sus edificios; el de otro RT no aparece (RLS) y el otro RT no ve los suyos', async () => {
    expect(await ids()).toEqual([edif.uno, edif.dos, edif.tres].sort());
    expect(await ids(tokenOtroRt)).toEqual([edif.ajeno]);
    expect(JSON.stringify((await mapa()).body)).not.toContain(edif.ajeno);
  });

  it('la ubicación sale de PostGIS (null si el edificio no tiene punto) y trae el horario por defecto', async () => {
    const e = (await mapa()).body.edificios as { id: string; ubicacion: { latitud: number; longitud: number } | null; aCoordinar: boolean; franjas: Record<string, unknown> }[];

    const uno = e.find((x) => x.id === edif.uno)!;
    expect(uno.ubicacion!.latitud).toBeCloseTo(-34.6118, 4);
    expect(uno.ubicacion!.longitud).toBeCloseTo(-58.396, 4);
    expect(e.find((x) => x.id === edif.dos)!.ubicacion).toBeNull();
    expect(uno.aCoordinar).toBe(false);
    expect(Object.keys(uno.franjas)).toContain('lunes');
  });

  it('trae el horario que la Secretaría editó y «A coordinar»', async () => {
    await http().put(`/api/consorcios/${edif.tres}/horarios`).set('Authorization', `Bearer ${tokenAdmin}`).send({ aCoordinar: true });
    await http().put(`/api/consorcios/${edif.uno}/horarios`).set('Authorization', `Bearer ${tokenAdmin}`).send({ franjas: { martes: [{ desde: '10:00', hasta: '14:00' }] } });

    const e = (await mapa()).body.edificios as { id: string; aCoordinar: boolean; franjas: unknown }[];

    expect(e.find((x) => x.id === edif.tres)).toMatchObject({ aCoordinar: true, franjas: {} });
    expect(e.find((x) => x.id === edif.uno)!.franjas).toEqual({ martes: [{ desde: '10:00', hasta: '14:00' }] });
  });

  it('criterio 4: un edificio resuelto en el día (todos sus equipos inspeccionados hoy) sale del mapa; con la mitad sigue', async () => {
    await inspeccionar('uno', 0);
    expect(await ids()).toContain(edif.uno);

    await inspeccionar('uno', 1);

    expect(await ids()).not.toContain(edif.uno);
  });

  it('una inspección de ayer no resuelve el día', async () => {
    await admin.query("INSERT INTO inspecciones_checklist (consorcio_id, maquina_id, referencia_agc, tipo_maquina, version_checklist, created_at) SELECT $1, unnest($2::text[]), 'M', 'traccion', 'v-test', now() - interval '1 day'", [edif.tres, maquinas.tres]);

    expect(await ids()).toContain(edif.tres);
  });

  it('criterio 4: un edificio con visita fallida de hoy sale del mapa', async () => {
    const res = await http().post('/api/visitas-fallidas').set('Authorization', `Bearer ${tokenRt}`).send({
      consorcioId: edif.dos, causa: 'Encargado o responsable ausente', fotoFrenteUrl: 'data:image/jpeg;base64,AAAA', gps: { latitud: -34.6, longitud: -58.4, precision: 8 }, horaDispositivo: new Date().toISOString(),
    });
    expect(res.status).toBe(201);

    expect(await ids()).not.toContain(edif.dos);
  });

  it('criterio 4: un edificio bloqueado (3 visitas fallidas) sale del mapa', async () => {
    await admin.query("ALTER TABLE visitas_fallidas DISABLE TRIGGER visitas_fallidas_inmutable_trg");
    try {
      for (let i = 0; i < 3; i++) {
        await admin.query(
          `INSERT INTO visitas_fallidas (id, consorcio_id, consorcio_nombre, direccion, numero_advertencia, motivo, foto_frente_url, gps_latitud, gps_longitud, gps_precision, gps_timestamp, inspector, fecha_hora)
           VALUES ($1, $2, 'x', 'x', $3, 'm', 'f', 0, 0, 1, now() - interval '5 days', 'x', now() - interval '${5 - i} days')`,
          [`${P}-vf-${i}`, edif.ajeno, i + 1],
        );
      }
    } finally {
      await admin.query("ALTER TABLE visitas_fallidas ENABLE TRIGGER visitas_fallidas_inmutable_trg");
    }

    expect(await ids(tokenOtroRt)).not.toContain(edif.ajeno);
  });

  it('sólo el RT tiene mapa: el Administrador recibe 403', async () => {
    expect((await mapa(tokenAdmin)).status).toBe(403);
  });
});
