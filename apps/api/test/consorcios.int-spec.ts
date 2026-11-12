import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { runMigrations } from '../src/database/migrator';
import { MIGRATIONS } from '../src/database/migrations';
import { loadEnvFileInto } from '../src/env-file';

// Integración real: requiere la base levantada con `npm run db:up` y el .env de la raíz.
loadEnvFileInto(process.env);

describe('Consorcios y máquinas contra PostgreSQL + PostGIS real', () => {
  let app: INestApplication;
  let pool: Pool;
  const creados: string[] = [];

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    // La API aplica las migraciones sola al arrancar (DatabaseService.onModuleInit).
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    // Deja la base como estaba: borra sólo lo que creó esta corrida.
    if (creados.length > 0) await pool.query('DELETE FROM consorcios WHERE id = ANY($1)', [creados]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const consorcio = {
    nombre: 'Int-test Av. Corrientes 100',
    direccion: 'Av. Corrientes 100, CABA',
    administracion: { nombre: 'Admin Int', telefono: '11 0000-0000', email: 'int@test.com' },
    maquinas: [
      { referenciaAgc: 'M1', descripcion: 'Derecha' },
      { referenciaAgc: 'M2', descripcion: 'Izquierda' },
      { referenciaAgc: 'M10', descripcion: 'Servicio' },
    ],
  };

  it('las migraciones quedaron registradas y volver a correrlas no aplica nada', async () => {
    const registradas = await pool.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
    expect(registradas.rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));

    expect(await runMigrations(pool)).toEqual([]);
  });

  it('POST guarda el consorcio y sus máquinas en las tablas y GET devuelve la ficha completa', async () => {
    const creado = await http().post('/api/consorcios').send(consorcio);
    expect(creado.status).toBe(201);
    creados.push(creado.body.id);

    const filas = await pool.query(
      'SELECT referencia_agc, descripcion FROM maquinas WHERE consorcio_id = $1 ORDER BY referencia_agc',
      [creado.body.id],
    );
    expect(filas.rowCount).toBe(3);

    const ficha = await http().get(`/api/consorcios/${creado.body.id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.direccion).toBe(consorcio.direccion);
    expect(ficha.body.administracion).toEqual(consorcio.administracion);
    // Orden natural: M1, M2, M10 (no M1, M10, M2).
    expect(ficha.body.maquinas.map((m: { referenciaAgc: string }) => m.referenciaAgc)).toEqual(['M1', 'M2', 'M10']);
    expect(ficha.body.maquinas[0]).toMatchObject({ referenciaAgc: 'M1', descripcion: 'Derecha' });
  });

  it('la misma referencia AGC puede existir en edificios distintos', async () => {
    const a = await http().post('/api/consorcios').send({ ...consorcio, nombre: 'Int-test A' });
    const b = await http().post('/api/consorcios').send({ ...consorcio, nombre: 'Int-test B' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    creados.push(a.body.id, b.body.id);
  });

  it('la base rechaza una referencia repetida dentro del edificio (restricción única)', async () => {
    const creado = await http().post('/api/consorcios').send({ ...consorcio, nombre: 'Int-test C' });
    creados.push(creado.body.id);

    await expect(
      pool.query("INSERT INTO maquinas (consorcio_id, referencia_agc) VALUES ($1, 'M1')", [creado.body.id]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('PUT reemplaza las máquinas y listar cuenta las nuevas', async () => {
    const creado = await http().post('/api/consorcios').send({ ...consorcio, nombre: 'Int-test D' });
    creados.push(creado.body.id);

    const res = await http()
      .put(`/api/consorcios/${creado.body.id}`)
      .send({ nombre: 'Int-test D2', direccion: 'Otra 1', maquinas: [{ referenciaAgc: 'M5' }] });
    expect(res.status).toBe(200);
    expect(res.body.maquinas).toHaveLength(1);

    const lista = await http().get('/api/consorcios');
    const fila = lista.body.find((c: { id: string }) => c.id === creado.body.id);
    expect(fila).toMatchObject({ nombre: 'Int-test D2', cantidadMaquinas: 1 });
  });

  it('DELETE borra el consorcio y sus máquinas en cascada', async () => {
    const creado = await http().post('/api/consorcios').send({ ...consorcio, nombre: 'Int-test E' });

    expect((await http().delete(`/api/consorcios/${creado.body.id}`)).status).toBe(204);

    const huerfanas = await pool.query('SELECT 1 FROM maquinas WHERE consorcio_id = $1', [creado.body.id]);
    expect(huerfanas.rowCount).toBe(0);
    expect((await http().get(`/api/consorcios/${creado.body.id}`)).status).toBe(404);
  });

  it('persiste encargado, pisos, punto PostGIS, tipo y sala compartida, y excluye sin ubicacion del mapa', async () => {
    const conGeo = await http().post('/api/consorcios').send({
      nombre: 'Int-test Operativo Con Geo',
      direccion: 'Av. Santa Fe 2100',
      encargado: { nombre: 'Luis Encargado', telefono: '11 5555-7777' },
      pisos: ['SS', 'PB', '1', '2'],
      ubicacion: { latitud: -34.5956, longitud: -58.3976 },
      maquinas: [
        { referenciaAgc: 'M1', descripcion: 'Izquierda', tipo: 'hidraulico', salaCompartidaId: 'sala-principal' },
        { referenciaAgc: 'M2', descripcion: 'Derecha', tipo: 'montavehiculos', salaCompartidaId: 'sala-principal' },
      ],
    });
    expect(conGeo.status).toBe(201);
    creados.push(conGeo.body.id);

    const sinGeo = await http().post('/api/consorcios').send({
      nombre: 'Int-test Operativo Sin Geo',
      direccion: 'Calle Falsa 400',
    });
    expect(sinGeo.status).toBe(201);
    creados.push(sinGeo.body.id);

    const ficha = await http().get(`/api/consorcios/${conGeo.body.id}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.encargado).toEqual({ nombre: 'Luis Encargado', telefono: '11 5555-7777' });
    expect(ficha.body.pisos).toEqual(['SS', 'PB', '1', '2']);
    expect(ficha.body.ubicacion.latitud).toBeCloseTo(-34.5956, 4);
    expect(ficha.body.ubicacion.longitud).toBeCloseTo(-58.3976, 4);
    expect(ficha.body.maquinas[0]).toMatchObject({ tipo: 'hidraulico', salaCompartidaId: 'sala-principal' });
    expect(ficha.body.maquinas[1]).toMatchObject({ tipo: 'montavehiculos', salaCompartidaId: 'sala-principal' });

    const mapa = await http().get('/api/consorcios/mapa');
    expect(mapa.status).toBe(200);
    expect(mapa.body.some((c: { id: string }) => c.id === conGeo.body.id)).toBe(true);
    expect(mapa.body.some((c: { id: string }) => c.id === sinGeo.body.id)).toBe(false);
  });
});
