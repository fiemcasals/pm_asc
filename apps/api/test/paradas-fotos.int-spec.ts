import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { FirmanteService } from '../src/firmante/firmante.service';
import { ParadasService } from '../src/paradas/paradas.service';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-17 RF-12): la foto del reporte vive en PostgreSQL, la lista no la devuelve y se sirve aparte, también después de un
// reinicio de la API. Requiere la base levantada con `npm run db:up` y DATABASE_URL.
loadEnvFileInto(process.env);

jest.setTimeout(60_000);

const PREFIJO = 'H17RF12-int';
const BYTES = Buffer.alloc(100 * 1024, 9);
const FOTO = `data:image/jpeg;base64,${BYTES.toString('base64')}`;

describe('La foto de un reporte de parada contra PostgreSQL real (HU-17 RF-12)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: ReturnType<typeof loadConfig>;
  let tokens: { rt: string; otroRt: string; secretaria: string };
  let silencio: jest.SpyInstance;
  let maquina = 'MAQ-SANTAFE-M2';

  const limpiar = async () => {
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    await pool.query('DELETE FROM reportes_parada WHERE maquina_id = $1', [maquina]);
  };
  async function arrancar() {
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  }
  async function reiniciar() {
    await app.get(ParadasService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  beforeAll(async () => {
    config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    const rt = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-rt`, rol: 'rt_calle' });
    const otro = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-otro-rt`, rol: 'rt_calle' });
    const s = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-secretaria`, rol: 'secretaria' });
    tokens = { rt: rt.token, otroRt: otro.token, secretaria: s.token };
    await arrancar(); // aplica las migraciones
    const m = app.get(FirmanteService).getMaquinas()[0];
    if (m) maquina = m.id;
    await limpiar();
    await reiniciar();
  });
  beforeEach(() => {
    silencio = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => silencio.mockRestore());
  afterAll(async () => {
    await limpiar();
    await pool.query('DELETE FROM usuarios WHERE usuario = ANY($1)', [[`${PREFIJO}-rt`, `${PREFIJO}-otro-rt`, `${PREFIJO}-secretaria`]]);
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const con = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('el reporte guarda la imagen en la base, la lista no la devuelve y la foto se sirve aparte, también después de reiniciar', async () => {
    const r = (await http().post('/api/paradas').set(con(tokens.rt)).send({ maquinaId: maquina, causa: 'Cabina trabada', fotos: [FOTO] }).expect(201)).body;
    expect(JSON.stringify(r)).not.toContain('base64');

    // La imagen quedó guardada junto con el reporte.
    await pool.query('SELECT set_config($1, $2, false)', ['app.rol_actual', 'administrador']);
    const fila = (await pool.query("SELECT reporte->>'fotoUrl' AS foto FROM reportes_parada WHERE id = $1", [r.id])).rows[0];
    expect(fila.foto).toBe(FOTO);

    await reiniciar();

    const lista = await http().get('/api/paradas').set(con(tokens.secretaria)).expect(200);
    const delReporte = (lista.body as { id: string }[]).find((x) => x.id === r.id);
    expect(delReporte).toMatchObject({ fotos: 1, fotoRuta: `/api/paradas/${r.id}/foto` });
    expect(delReporte).not.toHaveProperty('fotoUrl');
    expect(lista.text).not.toContain('base64');

    const foto = await http().get(`/api/paradas/${r.id}/foto`).set(con(tokens.secretaria)).expect(200);
    expect(foto.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(Buffer.compare(foto.body as Buffer, BYTES)).toBe(0);
    // El RT que lo cargó la ve; otro RT, no.
    await http().get(`/api/paradas/${r.id}/foto`).set(con(tokens.rt)).expect(200);
    await http().get(`/api/paradas/${r.id}/foto`).set(con(tokens.otroRt)).expect(404);
    await http().get(`/api/paradas/${r.id}/foto`).expect(401);
    // La alerta de la máquina vuelve a llevar la ruta después del reinicio.
    expect(app.get(FirmanteService).getMaquinas().find((m) => m.id === maquina)?.alertaCritica?.fotoRuta).toBe(`/api/paradas/${r.id}/foto`);
  });
});
