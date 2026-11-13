import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { SemaforoEdificio } from '../src/semaforo/semaforo.types';

// Integración real (HU-04 RF-01): el semáforo contra PostgreSQL de verdad. Requiere la base levantada con
// `npm run db:up`, DATABASE_URL y DATABASE_APP_PASSWORD (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const PREFIJO = 'SEM-int';
const ZONA = '-03:00'; // Buenos Aires

describe('Semáforo mensual contra PostgreSQL + PostGIS real (HU-04 RF-01)', () => {
  let app: INestApplication;
  let pool: Pool;
  const inspeccionesCreadas: string[] = [];
  const ids: Record<string, { consorcio: string; maquinas: string[] }> = {};

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();

    // A: 2 máquinas, las dos inspeccionadas el 5/11 → inspeccionado. Con RT de Calle asignado.
    await crearEdificio('A', ['M1', 'M2']);
    await asignarRt('A', 'Ana Pérez');
    await inspeccionar('A', 0, `2026-11-05T10:00:00${ZONA}`);
    await inspeccionar('A', 1, `2026-11-05T11:00:00${ZONA}`);
    // B: 2 máquinas, sólo M1 inspeccionada el 8/11 → pendiente, con RT.
    await crearEdificio('B', ['M1', 'M2']);
    await asignarRt('B', 'Beto Gómez');
    await inspeccionar('B', 0, `2026-11-08T09:30:00${ZONA}`);
    // C: 1 máquina sin inspecciones y sin RT.
    await crearEdificio('C', ['M1']);
    // D: sin máquinas.
    await crearEdificio('D', []);
    // E: 1 máquina inspeccionada el 31/10 a las 23:30 de Buenos Aires (= 02:30 UTC del 1/11).
    await crearEdificio('E', ['M1']);
    await inspeccionar('E', 0, `2026-10-31T23:30:00${ZONA}`);
    // F: 1 máquina inspeccionada el 1/11 a las 00:10 de Buenos Aires (= 03:10 UTC): ya es del mes nuevo.
    await crearEdificio('F', ['M1']);
    await inspeccionar('F', 0, `2026-11-01T00:10:00${ZONA}`);
    // G: 2 máquinas; una inspeccionada dos veces el mismo día y la otra sólo en octubre.
    await crearEdificio('G', ['M1', 'M2']);
    await inspeccionar('G', 0, `2026-11-02T08:00:00${ZONA}`);
    await inspeccionar('G', 0, `2026-11-02T17:00:00${ZONA}`);
    await inspeccionar('G', 1, `2026-10-15T08:00:00${ZONA}`);
  });

  afterAll(async () => {
    if (inspeccionesCreadas.length > 0) {
      await pool.query('DELETE FROM inspecciones_checklist WHERE id = ANY($1)', [inspeccionesCreadas]);
    }
    await pool.query('DELETE FROM consorcios WHERE nombre LIKE $1', [`${PREFIJO}%`]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  async function crearEdificio(clave: string, referencias: string[]) {
    const res = await http()
      .post('/api/consorcios')
      .send({
        nombre: `${PREFIJO} ${clave}`,
        direccion: `Calle ${clave} 100, CABA`,
        maquinas: referencias.map((r) => ({ referenciaAgc: r })),
      });
    expect(res.status).toBe(201);
    ids[clave] = { consorcio: res.body.id, maquinas: res.body.maquinas.map((m: { id: string }) => m.id) };
  }

  async function asignarRt(clave: string, nombre: string) {
    const res = await http()
      .put(`/api/consorcios/${ids[clave].consorcio}/roles`)
      .send({
        rtCalle: { nombre, telefono: '11 5555-0000' },
        firmante: { nombre: 'Firmante Prueba', email: 'firmante@prueba.com' },
        eca: { nombre: 'ECA Prueba', email: 'eca@prueba.com' },
      });
    expect(res.status).toBe(200);
  }

  /** Registra una inspección por la API real y le fija el instante, que la API fija en "ahora". */
  async function inspeccionar(clave: string, indiceMaquina: number, instanteIso: string) {
    const res = await http()
      .post('/api/checklist/inspecciones')
      .send({
        consorcioId: ids[clave].consorcio,
        maquinaId: ids[clave].maquinas[indiceMaquina],
        referenciaAgc: `M${indiceMaquina + 1}`,
        tipoMaquina: 'traccion',
        estadoEquipo: 'en_uso',
        datos: {},
      });
    expect(res.status).toBe(201);
    inspeccionesCreadas.push(res.body.id);
    await pool.query('UPDATE inspecciones_checklist SET created_at = $2::timestamptz WHERE id = $1', [res.body.id, instanteIso]);
  }

  /** El semáforo a `fecha`, limitado a los edificios de esta prueba y por clave (A..G). */
  async function semaforoA(fecha: string, cabeceras: Record<string, string> = {}) {
    const res = await http().get('/api/semaforo').query({ fecha }).set(cabeceras);
    expect(res.status).toBe(200);
    const porClave: Record<string, SemaforoEdificio> = {};
    for (const e of res.body.edificios as SemaforoEdificio[]) {
      if (e.nombre.startsWith(PREFIJO)) porClave[e.nombre.slice(-1)] = e;
    }
    return { cuerpo: res.body, porClave };
  }

  it('criterio 1: un edificio con todas sus máquinas inspeccionadas en el mes está en verde cualquiera sea el día', async () => {
    for (const fecha of ['2026-11-05', '2026-11-11', '2026-11-21', '2026-11-30']) {
      const { porClave } = await semaforoA(fecha);
      expect(porClave.A).toMatchObject({ estado: 'inspeccionado', color: 'verde', maquinas: 2, maquinasInspeccionadas: 2 });
    }
  });

  it('criterio 2: un pendiente es verde del 1 al 10, amarillo del 11 al 20 y rojo del 21 al 30', async () => {
    for (const [fecha, color] of [['2026-11-01', 'verde'], ['2026-11-10', 'verde'], ['2026-11-11', 'amarillo'], ['2026-11-20', 'amarillo'], ['2026-11-21', 'rojo'], ['2026-11-30', 'rojo']]) {
      const { porClave } = await semaforoA(fecha);
      expect(porClave.C).toMatchObject({ estado: 'pendiente', color });
      expect(porClave.D).toMatchObject({ estado: 'pendiente', color });
    }
  });

  it('criterio 2: el día 31 un pendiente es rojo', async () => {
    const { porClave, cuerpo } = await semaforoA('2026-12-31');
    expect(cuerpo.tramoDelDia).toBe('rojo');
    expect(porClave.A).toMatchObject({ estado: 'pendiente', color: 'rojo' }); // sus inspecciones eran de noviembre
    expect(porClave.C).toMatchObject({ estado: 'pendiente', color: 'rojo' });
  });

  it('criterio 3: el 1.º del mes todos vuelven a pendiente (las inspecciones del mes anterior no cuentan)', async () => {
    const { porClave } = await semaforoA('2026-12-01');
    for (const clave of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      expect(porClave[clave]).toMatchObject({ estado: 'pendiente', color: 'verde', maquinasInspeccionadas: 0, diaUltimaInspeccion: null });
    }
  });

  it('criterio 3 en el límite: lo de las 23:30 del 31/10 es de octubre; lo de las 00:10 del 1/11 es de noviembre', async () => {
    const octubre = await semaforoA('2026-10-31');
    expect(octubre.porClave.E).toMatchObject({ estado: 'inspeccionado', color: 'verde', diaUltimaInspeccion: 31 });
    expect(octubre.porClave.F).toMatchObject({ estado: 'pendiente', maquinasInspeccionadas: 0 });

    const noviembre = await semaforoA('2026-11-01');
    expect(noviembre.porClave.E).toMatchObject({ estado: 'pendiente', maquinasInspeccionadas: 0, diaUltimaInspeccion: null });
    expect(noviembre.porClave.F).toMatchObject({ estado: 'inspeccionado', color: 'verde', diaUltimaInspeccion: 1 });
  });

  it('criterio 4: devuelve por edificio el día de la última inspección del mes y el RT de Calle asignado', async () => {
    const { porClave } = await semaforoA('2026-11-12');

    expect(porClave.A).toMatchObject({ diaUltimaInspeccion: 5, rtCalle: { nombre: 'Ana Pérez', telefono: '11 5555-0000', email: null } });
    expect(porClave.B).toMatchObject({ diaUltimaInspeccion: 8, rtCalle: { nombre: 'Beto Gómez' } });
    expect(porClave.C).toMatchObject({ diaUltimaInspeccion: null, rtCalle: null });
  });

  it('una inspección posterior a la fecha consultada no cuenta, y la del mismo día sí', async () => {
    const antes = await semaforoA('2026-11-07');
    expect(antes.porClave.B).toMatchObject({ estado: 'pendiente', maquinasInspeccionadas: 0, diaUltimaInspeccion: null });
    expect(antes.porClave.A).toMatchObject({ estado: 'inspeccionado', diaUltimaInspeccion: 5 });

    const mismoDia = await semaforoA('2026-11-08');
    expect(mismoDia.porClave.B).toMatchObject({ maquinasInspeccionadas: 1, diaUltimaInspeccion: 8 });
  });

  it('un edificio con una máquina sin inspeccionar sigue pendiente; dos inspecciones de la misma máquina cuentan una vez', async () => {
    const { porClave } = await semaforoA('2026-11-25');

    expect(porClave.B).toMatchObject({ estado: 'pendiente', color: 'rojo', maquinas: 2, maquinasInspeccionadas: 1 });
    // G: M1 inspeccionada dos veces en noviembre, M2 sólo en octubre → 1 de 2.
    expect(porClave.G).toMatchObject({ estado: 'pendiente', color: 'rojo', maquinas: 2, maquinasInspeccionadas: 1, diaUltimaInspeccion: 2 });
  });

  it('un edificio sin máquinas queda pendiente', async () => {
    const { porClave } = await semaforoA('2026-11-15');
    expect(porClave.D).toMatchObject({ estado: 'pendiente', color: 'amarillo', maquinas: 0, maquinasInspeccionadas: 0 });
  });

  it('una inspección que declara un edificio pero trae la máquina de otro no cuenta para ninguno de los dos', async () => {
    // Se registra una inspección del edificio C pero con el id de la máquina de F: no es una máquina de C, y
    // tampoco debe contarse para F (su registro dice que es de C). F conserva su única inspección, la del día 1.
    const res = await http().post('/api/checklist/inspecciones').send({
      consorcioId: ids.C.consorcio, maquinaId: ids.F.maquinas[0], referenciaAgc: 'M1', tipoMaquina: 'traccion', estadoEquipo: 'en_uso', datos: {},
    });
    inspeccionesCreadas.push(res.body.id);
    await pool.query('UPDATE inspecciones_checklist SET created_at = $2::timestamptz WHERE id = $1', [res.body.id, `2026-11-04T10:00:00${ZONA}`]);

    const { porClave } = await semaforoA('2026-11-12');

    expect(porClave.C).toMatchObject({ estado: 'pendiente', maquinasInspeccionadas: 0, diaUltimaInspeccion: null });
    expect(porClave.F).toMatchObject({ estado: 'inspeccionado', maquinasInspeccionadas: 1, diaUltimaInspeccion: 1 });
  });

  it('ordena rojos primero y los totales suman todos los edificios de la respuesta', async () => {
    const { cuerpo } = await semaforoA('2026-11-25');

    const colores = cuerpo.edificios.map((e: SemaforoEdificio) => e.color);
    const ultimoRojo = colores.lastIndexOf('rojo');
    const primerVerde = colores.indexOf('verde');
    expect(primerVerde === -1 || ultimoRojo < primerVerde).toBe(true);
    expect(cuerpo.totales.verde + cuerpo.totales.amarillo + cuerpo.totales.rojo).toBe(cuerpo.edificios.length);
  });

  it('RLS: otra ECA no ve estos edificios ni sus inspecciones', async () => {
    const { cuerpo, porClave } = await semaforoA('2026-11-12', { 'x-eca-actual': 'ECA_OTRA_QUE_NO_EXISTE' });

    expect(Object.keys(porClave)).toEqual([]);
    expect(cuerpo.edificios.filter((e: SemaforoEdificio) => e.nombre.startsWith(PREFIJO))).toEqual([]);
  });

  it('una fecha inválida responde 400', async () => {
    const res = await http().get('/api/semaforo').query({ fecha: '2026-02-30' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos');
  });
});
