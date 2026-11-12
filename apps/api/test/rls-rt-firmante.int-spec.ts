import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { DatabaseService } from '../src/database/database.service';
import { loadEnvFileInto } from '../src/env-file';

loadEnvFileInto(process.env);

describe('Acceso RLS multi-ECA para RT de Calle y Firmante (HU-15 RNF-02)', () => {
  let app: INestApplication;
  let adminPool: Pool;
  let dbService: DatabaseService;
  const creados: string[] = [];

  beforeAll(async () => {
    const config = loadConfig();
    adminPool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    dbService = app.get(DatabaseService);
  });

  afterAll(async () => {
    if (creados.length > 0) {
      await adminPool.query('DELETE FROM consorcios WHERE id = ANY($1)', [creados]);
    }
    await app.close();
    await adminPool.end();
  });

  const http = () => request(app.getHttpServer());

  async function crearEdificioConRoles(opts: {
    eca: string;
    nombre: string;
    maquinaRef: string;
    rtNombre: string;
    rtEmail: string;
    firmanteNombre: string;
    firmanteEmail: string;
  }): Promise<string> {
    const c = await http()
      .post('/api/consorcios')
      .set('x-eca-actual', opts.eca)
      .send({
        nombre: opts.nombre,
        direccion: 'Calle MultiECA 100',
        maquinas: [{ referenciaAgc: opts.maquinaRef, descripcion: `Equipo ${opts.nombre}` }],
      })
      .expect(201);
    creados.push(c.body.id);

    await http()
      .put(`/api/consorcios/${c.body.id}/roles`)
      .set('x-eca-actual', opts.eca)
      .send({
        rtCalle: { nombre: opts.rtNombre, email: opts.rtEmail },
        firmante: { nombre: opts.firmanteNombre, email: opts.firmanteEmail },
        eca: { nombre: opts.eca, email: `ops@${opts.eca.toLowerCase()}.test` },
      })
      .expect(200);

    return c.body.id;
  }

  it('RT de Calle lee edificios asignados de distintas ECAs; Firmante lee sus máquinas y quitar asignación oculta de inmediato', async () => {
    // 1. Edificio en ECA-UNO asignado a rt.multi y firmante.multi
    const idEca1 = await crearEdificioConRoles({
      eca: 'ECA-UNO',
      nombre: 'Edificio ECA Uno',
      maquinaRef: 'M1',
      rtNombre: 'Lucas RT',
      rtEmail: 'rt.multi@campo.test',
      firmanteNombre: 'Ing. Clara Firmante',
      firmanteEmail: 'firmante.multi@legal.test',
    });

    // 2. Edificio en ECA-DOS asignado también a rt.multi y firmante.multi
    const idEca2 = await crearEdificioConRoles({
      eca: 'ECA-DOS',
      nombre: 'Edificio ECA Dos',
      maquinaRef: 'M2',
      rtNombre: 'Lucas RT',
      rtEmail: 'rt.multi@campo.test',
      firmanteNombre: 'Ing. Clara Firmante',
      firmanteEmail: 'firmante.multi@legal.test',
    });

    // 3. Edificio en ECA-DOS asignado a OTRO RT y OTRO Firmante (no debe verse)
    const idAjeno = await crearEdificioConRoles({
      eca: 'ECA-DOS',
      nombre: 'Edificio Ajeno',
      maquinaRef: 'M9',
      rtNombre: 'Otro RT',
      rtEmail: 'otro.rt@campo.test',
      firmanteNombre: 'Otro Firmante',
      firmanteEmail: 'otro.firmante@legal.test',
    });

    // Criterio 1: RT de Calle lee edificios de ECA-UNO y ECA-DOS, y NO el edificio ajeno
    const listaRt = await http()
      .get('/api/consorcios')
      .set('x-rol-actual', 'rt_calle')
      .set('x-usuario-actual', 'rt.multi@campo.test')
      .expect(200);
    const idsRt = listaRt.body.map((c: { id: string }) => c.id);
    expect(idsRt).toContain(idEca1);
    expect(idsRt).toContain(idEca2);
    expect(idsRt).not.toContain(idAjeno);

    // Criterio 2: Firmante lee máquinas sólo de los edificios donde figura (de ECA-UNO y ECA-DOS)
    const maquinasFirmante = await dbService.conContextoRol('firmante', 'firmante.multi@legal.test', () =>
      dbService.query<{ consorcio_id: string; referencia_agc: string }>(
        'SELECT consorcio_id, referencia_agc FROM maquinas ORDER BY referencia_agc',
      ),
    );
    expect(maquinasFirmante.map((m) => m.consorcio_id)).toEqual(expect.arrayContaining([idEca1, idEca2]));
    expect(maquinasFirmante.some((m) => m.consorcio_id === idAjeno)).toBe(false);

    // Criterio 3: Al quitar la asignación del edificio en ECA-DOS, desaparece en la consulta inmediata (sin relogueo)
    await http().delete(`/api/consorcios/${idEca2}/roles`).set('x-eca-actual', 'ECA-DOS').expect(204);

    const listaRtTrasBaja = await http()
      .get('/api/consorcios')
      .set('x-rol-actual', 'rt_calle')
      .set('x-usuario-actual', 'rt.multi@campo.test')
      .expect(200);
    const idsRtTrasBaja = listaRtTrasBaja.body.map((c: { id: string }) => c.id);
    expect(idsRtTrasBaja).toContain(idEca1);
    expect(idsRtTrasBaja).not.toContain(idEca2);

    await http().get(`/api/consorcios/${idEca2}`).set('x-rol-actual', 'rt_calle').set('x-usuario-actual', 'rt.multi@campo.test').expect(404);

    const maquinasTrasBaja = await dbService.conContextoRol('firmante', 'firmante.multi@legal.test', () =>
      dbService.query<{ consorcio_id: string }>('SELECT consorcio_id FROM maquinas'),
    );
    expect(maquinasTrasBaja.some((m) => m.consorcio_id === idEca1)).toBe(true);
    expect(maquinasTrasBaja.some((m) => m.consorcio_id === idEca2)).toBe(false);
  });
});
