import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

// Integración real (HU-19 RF-03): la Secretaría como contacto del chat contra PostgreSQL de verdad.
// Requiere la base levantada con `npm run db:up` y DATABASE_URL (en el .env de la raíz o en el entorno).
loadEnvFileInto(process.env);

const PREFIJO = 'RF03-chat';

type Sesion = { token: string; usuario: string; id: string };
type Canal = { id: string; tipo: string; rol?: string; nombre: string; ultimoMensaje?: string | null };
type Mensaje = { contenido: string; emisorRol: string };

describe('Chat: la Secretaría como contacto contra PostgreSQL real (HU-19 RF-03)', () => {
  let app: INestApplication;
  let pool: Pool;
  let warn: jest.SpyInstance;
  const s = {} as Record<'secretaria' | 'otraSecretaria' | 'rt' | 'otroRt' | 'firmante' | 'admin' | 'eca', Sesion>;

  beforeAll(async () => {
    const config = loadConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
    const crear = (clave: keyof typeof s, rol: 'secretaria' | 'administrador' | 'eca' | 'rt_calle' | 'firmante') =>
      asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-${clave}`, rol, eca: rol === 'eca' ? 'MAICON Mantenimiento' : null }).then((x) => (s[clave] = x));
    await crear('secretaria', 'secretaria');
    await crear('otraSecretaria', 'secretaria');
    await crear('rt', 'rt_calle');
    await crear('otroRt', 'rt_calle');
    await crear('firmante', 'firmante');
    await crear('admin', 'administrador');
    await crear('eca', 'eca');
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  afterAll(async () => {
    const ids = Object.values(s).map((x) => x.id);
    await pool.query('DELETE FROM chat_mensajes WHERE emisor_id = ANY($1) OR destinatario_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM usuarios WHERE usuario LIKE $1', [`${PREFIJO}%`]);
    await app.close();
    await pool.end();
  });

  const como = (u: Sesion) => (r: request.Test) => r.set('Authorization', `Bearer ${u.token}`);
  const http = () => request(app.getHttpServer());
  const canalesDe = async (u: Sesion): Promise<Canal[]> => (await como(u)(http().get('/api/chat/canales')).expect(200)).body;
  const hilo = async (u: Sesion, sala: string): Promise<Mensaje[]> => (await como(u)(http().get(`/api/chat/mensajes?sala=${sala}`)).expect(200)).body;
  const escribir = (de: Sesion, para: Sesion, contenido: string) =>
    como(de)(http().post('/api/chat/mensajes').send({ tipoSala: 'directo', destinatarioId: para.id, contenido })).expect(201);

  it('criterio 1: Técnico RT, Firmante y Administrador tienen a la Secretaría de contacto, con su rol y su nombre', async () => {
    for (const quien of [s.rt, s.firmante, s.admin]) {
      const canal = (await canalesDe(quien)).find((c) => c.id === s.secretaria.id);
      expect(canal).toMatchObject({ tipo: 'directo', rol: 'secretaria', nombre: s.secretaria.usuario });
    }
  });

  it('criterio 1: la Secretaría no se ve a sí misma y sí ve a los otros roles (también a otra Secretaría)', async () => {
    const canales = await canalesDe(s.secretaria);
    expect(canales.some((c) => c.id === s.secretaria.id)).toBe(false);
    for (const otro of [s.rt, s.otroRt, s.firmante, s.admin, s.otraSecretaria]) expect(canales.some((c) => c.id === otro.id)).toBe(true);
  });

  it('una Secretaría dada de baja (inactiva) no figura como contacto de nadie', async () => {
    const config = loadConfig();
    const baja = await asegurarUsuarioPrueba(pool, config, { usuario: `${PREFIJO}-baja`, rol: 'secretaria' });
    await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [baja.id]);
    expect((await canalesDe(s.rt)).some((c) => c.id === baja.id)).toBe(false);
    expect((await canalesDe(s.rt)).some((c) => c.id === s.secretaria.id)).toBe(true);
  });

  it('criterio 2: lo que un RT le escribe a la Secretaría lo ve ella en su chat con ese RT, y se lo ve como último mensaje', async () => {
    await escribir(s.rt, s.secretaria, 'Secretaría, falta el acuse de Corrientes 1234');
    expect((await hilo(s.secretaria, s.rt.id)).map((m) => m.contenido)).toEqual(['Secretaría, falta el acuse de Corrientes 1234']);
    const canal = (await canalesDe(s.secretaria)).find((c) => c.id === s.rt.id);
    expect(canal?.ultimoMensaje).toBe('Secretaría, falta el acuse de Corrientes 1234');
  });

  it('criterio 3: lo que la Secretaría le escribe a un RT aparece en el chat del RT con ella, y su respuesta vuelve a la Secretaría', async () => {
    await escribir(s.secretaria, s.otroRt, 'Beto, pasá por Cabildo 1540');
    const canal = (await canalesDe(s.otroRt)).find((c) => c.id === s.secretaria.id);
    expect(canal?.ultimoMensaje).toBe('Beto, pasá por Cabildo 1540');
    expect((await hilo(s.otroRt, s.secretaria.id)).map((m) => m.contenido)).toEqual(['Beto, pasá por Cabildo 1540']);

    await escribir(s.otroRt, s.secretaria, 'Voy ahora');
    const vistoPorSecretaria = await hilo(s.secretaria, s.otroRt.id);
    expect(vistoPorSecretaria.map((m) => m.contenido)).toEqual(['Beto, pasá por Cabildo 1540', 'Voy ahora']);
    expect(vistoPorSecretaria.map((m) => m.emisorRol)).toEqual(['secretaria', 'rt_calle']);
  });

  it('criterio 4: el Firmante, el Administrador, otro RT y otra Secretaría no ven esos privados, ni en el grupo ni abriendo su propio chat', async () => {
    await escribir(s.rt, s.secretaria, 'privado RT-Secretaría 4');
    for (const ajeno of [s.firmante, s.admin, s.otroRt, s.otraSecretaria]) {
      for (const sala of ['global', s.rt.id, s.secretaria.id]) {
        const textos = (await hilo(ajeno, sala)).map((m) => m.contenido);
        expect(textos).not.toContain('privado RT-Secretaría 4');
      }
      const ultimos = (await canalesDe(ajeno)).map((c) => c.ultimoMensaje ?? '');
      expect(ultimos).not.toContain('privado RT-Secretaría 4');
    }
  });

  it('criterio 5: la ECA no ve el chat (403 en las tres rutas) y no aparece como contacto de nadie', async () => {
    await como(s.eca)(http().get('/api/chat/canales')).expect(403);
    await como(s.eca)(http().get('/api/chat/mensajes?sala=global')).expect(403);
    await como(s.eca)(http().post('/api/chat/mensajes').send({ tipoSala: 'global', contenido: 'no debería entrar' })).expect(403);
    for (const quien of [s.rt, s.firmante, s.admin, s.secretaria]) {
      expect((await canalesDe(quien)).some((c) => c.id === s.eca.id)).toBe(false);
    }
  });
});
