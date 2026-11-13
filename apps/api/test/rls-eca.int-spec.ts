import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { DatabaseService } from '../src/database/database.service';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

loadEnvFileInto(process.env);

const TABLAS_ECA = [
  'acuses_recibo_legal',
  'consorcios',
  'maquinas',
  'roles_edificio',
  'visitas_fallidas',
];

describe('Row Level Security por ECA en PostgreSQL real (HU-15 RNF-01 / RNF-03)', () => {
  let app: INestApplication;
  let adminPool: Pool;
  let dbService: DatabaseService;
  let adminToken = '';
  let alphaToken = '';
  let betaToken = '';
  const consorciosCreados: string[] = [];
  const prefijoAcuse = 'RNF01-RLS-INT';

  beforeAll(async () => {
    const config = loadConfig();
    adminPool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
    dbService = app.get(DatabaseService);

    const uAdmin = await asegurarUsuarioPrueba(adminPool, config, { usuario: 'rls_int_admin', rol: 'secretaria' });
    const uAlpha = await asegurarUsuarioPrueba(adminPool, config, { usuario: 'rls_user_alpha', rol: 'eca', eca: 'ECA-ALPHA' });
    const uBeta = await asegurarUsuarioPrueba(adminPool, config, { usuario: 'rls_user_beta', rol: 'eca', eca: 'ECA-BETA' });
    adminToken = uAdmin.token;
    alphaToken = uAlpha.token;
    betaToken = uBeta.token;
  });

  afterAll(async () => {
    if (consorciosCreados.length > 0) {
      await adminPool.query('DELETE FROM visitas_fallidas WHERE consorcio_id = ANY($1::text[])', [consorciosCreados]);
      await adminPool.query('DELETE FROM consorcios WHERE id = ANY($1)', [consorciosCreados]);
    }
    await adminPool.query('DELETE FROM acuses_recibo_legal WHERE usuario LIKE $1', [`${prefijoAcuse}%`]);
    await adminPool.query('DELETE FROM usuarios WHERE usuario IN ($1, $2, $3)', ['rls_int_admin', 'rls_user_alpha', 'rls_user_beta']);
    await app.close();
    await adminPool.end();
  });

  const http = () => request(app.getHttpServer());

  it('criterio 1 y 2: todas las tablas con datos de ECA tienen RLS activo y la API usa un rol sin BYPASSRLS ni propiedad', async () => {
    const res = await http().get('/api/seguridad/rls').expect(200);

    expect(res.body.usuarioActual).toBe('ascensores_app');
    expect(res.body.esSuperuser).toBe(false);
    expect(res.body.tieneBypassRls).toBe(false);
    expect(res.body.esDuenoTablas).toBe(false);
    expect(res.body.tablasConRls.map((t: { tabla: string }) => t.tabla)).toEqual(TABLAS_ECA);
    for (const tabla of res.body.tablasConRls) {
      expect(tabla.rlsActivo).toBe(true);
      expect(tabla.politicas).toBeGreaterThanOrEqual(1);
    }

    // Permisos de ascensores_app sobre tablas existentes de otros módulos (consentimientos_ubicacion)
    // y sobre tablas nuevas creadas después de la migración (ALTER DEFAULT PRIVILEGES).
    await expect(dbService.query('SELECT count(*) FROM consentimientos_ubicacion')).resolves.toHaveLength(1);
    await adminPool.query('CREATE TABLE _rls_perm_probe_tmp (id int PRIMARY KEY)');
    try {
      await dbService.query('INSERT INTO _rls_perm_probe_tmp (id) VALUES (1)');
      const rows = await dbService.query<{ id: number }>('SELECT id FROM _rls_perm_probe_tmp');
      expect(rows).toEqual([{ id: 1 }]);
    } finally {
      await adminPool.query('DROP TABLE IF EXISTS _rls_perm_probe_tmp');
    }
  });

  it('criterio 3 y 4: consulta sin contexto devuelve 0 filas y dos ECAs no pueden leer ni modificar filas de la otra', async () => {
    // 1. Crear consorcio + máquina + roles + visita fallida para ECA-ALPHA usando token de secretaría
    const cAlpha = await http()
      .post('/api/consorcios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Edificio Alpha RLS',
        direccion: 'Calle Alpha 100',
        maquinas: [{ referenciaAgc: 'M1', descripcion: 'Ascensor Alpha' }],
      })
      .expect(201);
    consorciosCreados.push(cAlpha.body.id);

    await http()
      .put(`/api/consorcios/${cAlpha.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rtCalle: { nombre: 'RT Alpha', email: 'rt@alpha.test' },
        firmante: { nombre: 'Firmante Alpha', email: 'firmante@alpha.test' },
        eca: { nombre: 'ECA-ALPHA', email: 'eca@alpha.test' },
      })
      .expect(200);

    await http()
      .post('/api/visitas-fallidas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        consorcioId: cAlpha.body.id,
        motivo: 'Ausente Alpha',
        fotoFrenteUrl: 'https://example.test/alpha.jpg',
        gps: { latitud: -34.6, longitud: -58.38, precision: 5 },
      })
      .expect(201);

    // 2. Crear consorcio + máquina + roles para ECA-BETA
    const cBeta = await http()
      .post('/api/consorcios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Edificio Beta RLS',
        direccion: 'Calle Beta 200',
        maquinas: [{ referenciaAgc: 'M1', descripcion: 'Ascensor Beta' }],
      })
      .expect(201);
    consorciosCreados.push(cBeta.body.id);

    await http()
      .put(`/api/consorcios/${cBeta.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rtCalle: { nombre: 'RT Beta', email: 'rt@beta.test' },
        firmante: { nombre: 'Firmante Beta', email: 'firmante@beta.test' },
        eca: { nombre: 'ECA-BETA', email: 'eca@beta.test' },
      })
      .expect(200);

    // Insertar acuses de dos ECAs usando el contexto de cada ECA
    await dbService.conContextoEca('ECA-ALPHA', () =>
      dbService.query(
        `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta)
         VALUES ('ALT-A', 'MAQ-A', 'ECA-ALPHA', $1, 'Falla Crítica')`,
        [`${prefijoAcuse}-alpha`],
      ),
    );
    await dbService.conContextoEca('ECA-BETA', () =>
      dbService.query(
        `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta)
         VALUES ('ALT-B', 'MAQ-B', 'ECA-BETA', $1, 'Falla Crítica')`,
        [`${prefijoAcuse}-beta`],
      ),
    );

    // 3. Criterio 3 (RNF-03): petición sin sesión a ruta de datos responde 401
    const sinSesion = await http().get('/api/consorcios');
    expect(sinSesion.status).toBe(401);

    // Consulta SQL directa SIN contexto de ECA devuelve 0 filas en todas las tablas
    for (const tabla of TABLAS_ECA) {
      const filasSinContexto = await dbService.query(`SELECT count(*) AS n FROM ${tabla}`);
      expect(Number(filasSinContexto[0].n)).toBe(0);
    }

    // 4. Criterio 2 (RNF-03): ECA-ALPHA mandando x-eca-actual: ECA-BETA sigue viendo SOLO ECA-ALPHA
    const listaAlphaConHeaderBeta = await http()
      .get('/api/consorcios')
      .set('Authorization', `Bearer ${alphaToken}`)
      .set('x-eca-actual', 'ECA-BETA')
      .expect(200);
    expect(listaAlphaConHeaderBeta.body.some((c: { id: string }) => c.id === cAlpha.body.id)).toBe(true);
    expect(listaAlphaConHeaderBeta.body.some((c: { id: string }) => c.id === cBeta.body.id)).toBe(false);

    // Lectura/escritura cruzada contra consorcio de ECA-BETA rechazada por RLS (404)
    await http()
      .get(`/api/consorcios/${cBeta.body.id}`)
      .set('Authorization', `Bearer ${alphaToken}`)
      .set('x-eca-actual', 'ECA-BETA')
      .expect(404);

    await http()
      .put(`/api/consorcios/${cBeta.body.id}`)
      .set('Authorization', `Bearer ${alphaToken}`)
      .set('x-eca-actual', 'ECA-BETA')
      .send({ nombre: 'Secuestro', direccion: 'X', maquinas: [] })
      .expect(404);

    await http()
      .delete(`/api/consorcios/${cBeta.body.id}`)
      .set('Authorization', `Bearer ${alphaToken}`)
      .set('x-eca-actual', 'ECA-BETA')
      .expect(404);

    // Consulta SQL directa con contexto ECA-BETA no ve filas de Alpha
    const acusesBeta = await dbService.conContextoEca('ECA-BETA', () =>
      dbService.query<{ eca: string }>('SELECT eca FROM acuses_recibo_legal'),
    );
    expect(acusesBeta.map((a) => a.eca)).toEqual(['ECA-BETA']);

    const visitasBeta = await dbService.conContextoEca('ECA-BETA', () =>
      dbService.query('SELECT id FROM visitas_fallidas WHERE consorcio_id = $1', [cAlpha.body.id]),
    );
    expect(visitasBeta).toHaveLength(0);

    // Intentar insertar fila de otra ECA desde el contexto de ECA-ALPHA falla por RLS WITH CHECK (42501)
    await expect(
      dbService.conContextoEca('ECA-ALPHA', () =>
        dbService.query(
          `INSERT INTO acuses_recibo_legal (alerta_id, maquina_id, eca, usuario, tipo_alerta)
           VALUES ('ALT-X', 'MAQ-X', 'ECA-BETA', $1, 'Falla')`,
          [`${prefijoAcuse}-intrusion`],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
