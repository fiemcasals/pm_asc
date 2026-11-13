import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import bcryptjs from 'bcryptjs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { deriveAppDatabaseUrl } from '../src/database/database.service';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-04 RF-02): la reasignación contra PostgreSQL de verdad. Requiere la base levantada con
// `npm run db:up`, DATABASE_URL, DATABASE_APP_PASSWORD y AUTH_JWT_SECRET (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const P = 'RF02-int';
const PASSWORD = 'Clave-Segura-2026';
const FECHA_ROJO = '2026-11-25'; // un pendiente está en rojo

describe('Reasignación del RT de Calle contra PostgreSQL + PostGIS real (HU-04 RF-02)', () => {
  let app: INestApplication;
  let admin: Pool; // dueño de las tablas: arma y limpia datos
  let appPool: Pool; // el rol sin privilegios que usa la API en producción
  const usuarios = { secretaria: `${P}-secretaria`, ana: `${P}-ana`, beto: `${P}-beto`, carla: `${P}-carla`, inactivo: `${P}-inactivo` };
  const ids: Record<string, { consorcio: string; maquina: string }> = {};
  let auth = '';
  const tokensRt: Record<string, string> = {}; // sesiones de los RT: para ver qué edificios ve cada uno

  beforeAll(async () => {
    const config = loadConfig();
    admin = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    appPool = new Pool({
      connectionString: deriveAppDatabaseUrl(config.databaseUrl, config.databaseAppUrl, config.databaseAppPassword),
    });

    const hash = await bcryptjs.hash(PASSWORD, 4);
    const alta = (usuario: string, rol: string, activo = true, h = 'sin-login') =>
      admin.query('INSERT INTO usuarios (usuario, nombre, rol, password_hash, activo) VALUES ($1, $1, $2, $3, $4)', [usuario, rol, h, activo]);
    await alta(usuarios.secretaria, 'secretaria', true, hash);
    for (const rt of [usuarios.ana, usuarios.beto, usuarios.carla]) {
      tokensRt[rt] = (await asegurarUsuarioPrueba(admin, config, { usuario: rt, rol: 'rt_calle' })).token;
    }
    await alta(usuarios.inactivo, 'rt_calle', false);

    const login = await http().post('/api/auth/login').send({ usuario: usuarios.secretaria, password: PASSWORD });
    expect(login.status).toBe(200);
    auth = `Bearer ${login.body.accessToken}`;

    // R: el edificio en rojo, de ana. B1 y B2: pendientes de beto. C1: inspeccionado, de carla (no pesa).
    await edificio('R', usuarios.ana);
    await edificio('B1', usuarios.beto);
    await edificio('B2', usuarios.beto);
    await edificio('C1', usuarios.carla);
    await inspeccionar('C1', '2026-11-05T10:00:00-03:00');

  });

  afterAll(async () => {
    const consorcios = Object.values(ids).map((i) => i.consorcio);
    if (consorcios.length > 0) {
      await admin.query('DELETE FROM inspecciones_checklist WHERE consorcio_id = ANY($1::text[])', [consorcios]);
      await admin.query('DELETE FROM consorcios WHERE id = ANY($1::uuid[])', [consorcios]); // borra roles y registros en cascada
    }
    await admin.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${P}%`]);
    await admin.query('DELETE FROM intentos_login WHERE usuario LIKE $1', [`${P}%`]);
    await app.close();
    await appPool.end();
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const api = {
    get: (u: string) => http().get(u).set('Authorization', auth),
    post: (u: string) => http().post(u).set('Authorization', auth),
    put: (u: string) => http().put(u).set('Authorization', auth),
    delete: (u: string) => http().delete(u).set('Authorization', auth),
  };

  async function edificio(clave: string, rt: string) {
    const alta = await api.post('/api/consorcios').send({ nombre: `${P} ${clave}`, direccion: `Calle ${clave}`, maquinas: [{ referenciaAgc: 'M1' }] });
    expect(alta.status).toBe(201);
    ids[clave] = { consorcio: alta.body.id, maquina: alta.body.maquinas[0].id };
    const roles = await api.put(`/api/consorcios/${alta.body.id}/roles`).send({
      rtCalle: { nombre: rt, telefono: '11 5555-0000', email: `${rt}@rt.com` },
      firmante: { nombre: 'Firmante', email: 'f@f.com' },
      eca: { nombre: 'ECA', email: 'e@e.com' },
    });
    expect(roles.status).toBe(200);
  }

  async function inspeccionar(clave: string, instanteIso: string) {
    const res = await api.post('/api/checklist/inspecciones').send({
      consorcioId: ids[clave].consorcio, maquinaId: ids[clave].maquina, referenciaAgc: 'M1', tipoMaquina: 'traccion', estadoEquipo: 'en_uso', datos: {},
    });
    expect(res.status).toBe(201);
    await admin.query('UPDATE inspecciones_checklist SET created_at = $2::timestamptz WHERE id = $1', [res.body.id, instanteIso]);
  }

  const sugerir = (clave = 'R', cabeceras: Record<string, string> = {}) =>
    api.get(`/api/semaforo/${ids[clave].consorcio}/reasignacion/sugerencia`).query({ fecha: FECHA_ROJO }).set('Authorization', auth).set(cabeceras);
  const reasignar = (clave: string, cuerpo: Record<string, unknown>) =>
    api.post(`/api/semaforo/${ids[clave].consorcio}/reasignacion`).send({ fecha: FECHA_ROJO, ...cuerpo }).set('Authorization', auth);
  const rtEnBase = async (clave: string) =>
    (await admin.query('SELECT rt_calle_nombre, rt_calle_telefono, rt_calle_email FROM roles_edificio WHERE consorcio_id = $1', [ids[clave].consorcio])).rows[0];
  const registros = async (clave: string) =>
    (await admin.query('SELECT * FROM reasignaciones_rt WHERE consorcio_id = $1 ORDER BY fecha', [ids[clave].consorcio])).rows;
  /** ¿El RT (por usuario) puede leer el edificio? Lo decide el RLS de verdad. */
  const rtVe = async (usuario: string, clave: string) =>
    (await http().get(`/api/consorcios/${ids[clave].consorcio}`).set('Authorization', `Bearer ${tokensRt[usuario]}`)).status === 200;

  it('criterio 3: sugiere al RT con menos pendientes entre los RT de Calle activos, sin el actual ni los inactivos', async () => {
    const res = await sugerir();

    expect(res.status).toBe(200);
    const mios = res.body.candidatos.filter((c: { usuario: string }) => c.usuario.startsWith(P));
    // ana (la actual) no figura, el inactivo tampoco; carla pesa 0 (su edificio está inspeccionado) y beto 2.
    expect(mios.map((c: { usuario: string; pendientes: number }) => `${c.usuario}:${c.pendientes}`)).toEqual([`${usuarios.carla}:0`, `${usuarios.beto}:2`]);
    expect(res.body.candidatos.map((c: { usuario: string }) => c.usuario)).not.toContain(usuarios.inactivo);
    expect(res.body.candidatos.map((c: { usuario: string }) => c.usuario)).not.toContain(usuarios.secretaria);
    expect(res.body.sugerido.usuario).toBe(res.body.candidatos[0].usuario);
    expect(res.body.sugerido.pendientes).toBe(0);
    expect(res.body.rtActual.nombre).toBe(usuarios.ana);
  });

  it('criterio 4: sugerir no cambia nada; el RT y el registro siguen como estaban', async () => {
    await sugerir();
    await sugerir();

    expect((await rtEnBase('R')).rt_calle_nombre).toBe(usuarios.ana);
    expect(await registros('R')).toHaveLength(0);
  });

  it('un edificio que no está en rojo no se puede reasignar: 409 y nada cambia', async () => {
    const res = await api.post(`/api/semaforo/${ids.R.consorcio}/reasignacion`).send({ fecha: '2026-11-15', rtAnterior: usuarios.ana, rtNuevo: usuarios.carla }).set('Authorization', auth);

    expect(res.status).toBe(409);
    expect((await rtEnBase('R')).rt_calle_nombre).toBe(usuarios.ana);
    expect(await registros('R')).toHaveLength(0);
  });

  it('rechaza un RT nuevo inactivo, el mismo RT y quien no es RT de Calle, sin tocar nada', async () => {
    for (const rtNuevo of [usuarios.inactivo, usuarios.ana, usuarios.secretaria, 'no-existe']) {
      const res = await reasignar('R', { rtAnterior: usuarios.ana, rtNuevo });
      expect(res.status).toBe(400);
    }
    expect((await rtEnBase('R')).rt_calle_nombre).toBe(usuarios.ana);
    expect(await registros('R')).toHaveLength(0);
  });

  describe('al confirmar', () => {
    it('criterio 4: se aplica y queda registrada con usuario, fecha, RT anterior y RT nuevo', async () => {
      const antes = Date.now();

      const res = await reasignar('R', { rtAnterior: usuarios.ana, rtNuevo: usuarios.carla });

      expect(res.status).toBe(201);
      const filas = await registros('R');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ usuario: usuarios.secretaria, rt_anterior: usuarios.ana, rt_nuevo: usuarios.carla, consorcio_id: ids.R.consorcio });
      expect(filas[0].id).toBe(res.body.id);
      expect(new Date(filas[0].fecha).getTime()).toBeGreaterThanOrEqual(antes - 2000); // fecha del servidor, de ahora
      expect(new Date(filas[0].fecha).getTime()).toBeLessThanOrEqual(Date.now() + 2000);
      // El RT cambió y los contactos del anterior se vaciaron (eran de ana, no de carla).
      expect(await rtEnBase('R')).toEqual({ rt_calle_nombre: usuarios.carla, rt_calle_telefono: null, rt_calle_email: null });
    });

    it('el semáforo ya muestra al RT nuevo, y la carga de los RT cambió', async () => {
      const semaforo = await api.get('/api/semaforo').query({ fecha: FECHA_ROJO });
      const r = semaforo.body.edificios.find((e: { id: string }) => e.id === ids.R.consorcio);
      expect(r.rtCalle.nombre).toBe(usuarios.carla);

      // Ahora carla tiene 1 pendiente (R) y ana, 0: para otro edificio rojo de beto, ana sería la sugerida.
      const otro = await sugerir('B1');
      const mios = otro.body.candidatos.filter((c: { usuario: string }) => c.usuario.startsWith(P));
      expect(mios.map((c: { usuario: string; pendientes: number }) => `${c.usuario}:${c.pendientes}`)).toEqual([`${usuarios.ana}:0`, `${usuarios.carla}:1`]);
    });

    it('el efecto real sobre el acceso (RLS): el RT anterior deja de ver el edificio y el nuevo lo ve', async () => {
      expect(await rtVe(usuarios.ana, 'R')).toBe(false);
      expect(await rtVe(usuarios.carla, 'R')).toBe(true);
      expect(await rtVe(usuarios.ana, 'B1')).toBe(false); // y no ganó otros: B1 es de beto
      expect(await rtVe(usuarios.beto, 'B1')).toBe(true);
    });

    it('el historial por la API devuelve el registro', async () => {
      const res = await api.get(`/api/semaforo/${ids.R.consorcio}/reasignaciones`).set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ rtAnterior: usuarios.ana, rtNuevo: usuarios.carla, usuario: usuarios.secretaria });
    });

    it('con la vista vieja (ana ya no es el RT) se rechaza con 409 y no deja otro registro', async () => {
      const res = await reasignar('R', { rtAnterior: usuarios.ana, rtNuevo: usuarios.beto });

      expect(res.status).toBe(409);
      expect(await registros('R')).toHaveLength(1);
      expect((await rtEnBase('R')).rt_calle_nombre).toBe(usuarios.carla);
    });
  });

  it('dos confirmaciones simultáneas del mismo edificio: se aplica una sola y la otra da 409', async () => {
    // Para que la carrera sea determinista, una transacción aparte SOSTIENE el bloqueo de la fila de la terna mientras
    // las dos confirmaciones se ponen en cola. Recién entonces se suelta: con el bloqueo (FOR UPDATE) la segunda
    // espera, relee la fila ya cambiada y se rechaza; sin él, las dos verían el RT viejo y se aplicarían las dos.
    const sostenedor = await admin.connect();
    await sostenedor.query('BEGIN');
    await sostenedor.query('SELECT 1 FROM roles_edificio WHERE consorcio_id = $1 FOR UPDATE', [ids.B2.consorcio]);
    const a = reasignar('B2', { rtAnterior: usuarios.beto, rtNuevo: usuarios.ana }).then((r) => r);
    const b = reasignar('B2', { rtAnterior: usuarios.beto, rtNuevo: usuarios.carla }).then((r) => r);
    await new Promise((r) => setTimeout(r, 600)); // las dos ya están esperando la fila
    await sostenedor.query('ROLLBACK');
    sostenedor.release();

    const [ra, rb] = await Promise.all([a, b]);

    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    expect(await registros('B2')).toHaveLength(1);
    const ganador = ra.status === 201 ? usuarios.ana : usuarios.carla;
    expect((await rtEnBase('B2')).rt_calle_nombre).toBe(ganador);
  });

  describe('el registro es de sólo lectura para la aplicación (RLS sin política de UPDATE ni DELETE)', () => {
    /** Ejecuta `consulta` con el rol de la aplicación y el contexto de una sesión de Secretaría (rol_actual), como lo arma la API. */
    async function comoApp(consulta: string, params: unknown[] = []) {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.rol_actual', 'secretaria', true)");
        const res = await client.query(consulta, params);
        await client.query('ROLLBACK'); // nada de esto debe quedar
        return res;
      } finally {
        client.release();
      }
    }

    it('lee su registro, pero no puede modificarlo ni borrarlo', async () => {
      const [registro] = await registros('R');

      expect((await comoApp('SELECT id FROM reasignaciones_rt WHERE id = $1', [registro.id])).rowCount).toBe(1);
      expect((await comoApp("UPDATE reasignaciones_rt SET usuario = 'otro' WHERE id = $1", [registro.id])).rowCount).toBe(0);
      expect((await comoApp('DELETE FROM reasignaciones_rt WHERE id = $1', [registro.id])).rowCount).toBe(0);
      expect((await registros('R'))[0].usuario).toBe(usuarios.secretaria);
    });

    it('sin contexto de ECA no ve ningún registro', async () => {
      const client = await appPool.connect();
      try {
        const res = await client.query('SELECT id FROM reasignaciones_rt WHERE consorcio_id = $1', [ids.R.consorcio]);
        expect(res.rowCount).toBe(0);
      } finally {
        client.release();
      }
    });

    it('no se puede registrar una reasignación a nombre de un edificio de otra ECA', async () => {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.eca_actual', 'OTRA_ECA_QUE_NO_EXISTE', true)");
        await expect(
          client.query("INSERT INTO reasignaciones_rt (consorcio_id, rt_anterior, rt_nuevo, usuario) VALUES ($1, 'x', 'y', 'z')", [ids.R.consorcio]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });

  it('sin sesión 401; un usuario de una ECA o un RT de Calle 403; y los encabezados de ECA o de rol que mande el cliente se ignoran', async () => {
    const urls = [`/api/semaforo/${ids.R.consorcio}/reasignacion/sugerencia?fecha=${FECHA_ROJO}`, `/api/semaforo/${ids.R.consorcio}/reasignaciones`];
    const eca = await asegurarUsuarioPrueba(admin, loadConfig(), { usuario: `${P}-eca`, rol: 'eca', eca: 'ECA_OTRA_QUE_NO_EXISTE' });

    for (const url of urls) {
      expect((await http().get(url)).status).toBe(401);
      expect((await http().get(url).set('Authorization', `Bearer ${eca.token}`)).status).toBe(403);
      expect((await http().get(url).set('Authorization', `Bearer ${tokensRt[usuarios.carla]}`)).status).toBe(403);
    }
    const sinSesion = await http().post(`/api/semaforo/${ids.R.consorcio}/reasignacion`).send({ fecha: FECHA_ROJO, rtAnterior: usuarios.carla, rtNuevo: usuarios.beto });
    expect(sinSesion.status).toBe(401);

    // La Secretaría con encabezados de otra ECA y de otro rol sigue operando: el contexto sale de la sesión.
    const conEncabezados = await sugerir('R', { 'x-eca-actual': 'ECA_OTRA_QUE_NO_EXISTE', 'x-rol-actual': 'rt_calle' });
    expect(conEncabezados.status).toBe(200);
    expect(conEncabezados.body.nombre).toBe(`${P} R`);
  });

  it('borrar el edificio borra también su registro de reasignaciones', async () => {
    await edificio('X', usuarios.ana);
    await reasignar('X', { rtAnterior: usuarios.ana, rtNuevo: usuarios.carla });
    expect(await registros('X')).toHaveLength(1);

    expect((await api.delete(`/api/consorcios/${ids.X.consorcio}`)).status).toBe(204);

    expect(await registros('X')).toHaveLength(0);
  });
});
