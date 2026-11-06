import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { MENSAJE_TEXTO_INVALIDO } from '../src/database/database-error.filter';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';

const ID = '00000000-0000-4000-8000-000000000000';
const cuerpo = { nombre: 'con nulo \u0000 adentro', direccion: 'Calle 1', maquinas: [{ referenciaAgc: 'M1' }] };

/** Un error como el que lanza `pg`: lleva el SQLSTATE en `code` y el detalle en `message`. */
const errorPg = (code: string, message: string) => Object.assign(new Error(message), { code, severity: 'ERROR' });

/** Repositorio cuya base rechaza cada operación con el error que se le indique. */
function repoQueFalla(error: Error) {
  return Object.assign(new InMemoryConsorciosRepository(), {
    crear: async () => {
      throw error;
    },
    reemplazar: async () => {
      throw error;
    },
  });
}

describe('Textos que la base no puede guardar (RNF-01)', () => {
  let app: INestApplication;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    await app?.close();
  });

  async function arrancar(error: Error) {
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, fakeDatabase(), repoQueFalla(error)));
    return request(app.getHttpServer());
  }

  const deteccionDeNul = errorPg('22021', 'invalid byte sequence for encoding "UTF8": 0x00');

  describe('criterio 1 — POST con un carácter NUL', () => {
    it('responde 400 con message "Datos inválidos" y una lista errores', async () => {
      const http = await arrancar(deteccionDeNul);

      const res = await http.post('/api/consorcios').send(cuerpo);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(res.body.errores).toEqual([MENSAJE_TEXTO_INVALIDO]);
    });

    it('también traduce el otro SQLSTATE de codificación (22P05)', async () => {
      const http = await arrancar(errorPg('22P05', 'character with byte sequence 0xe2 0x82 0xac cannot be converted'));

      const res = await http.post('/api/consorcios').send(cuerpo);

      expect(res.status).toBe(400);
      expect(res.body.errores).toEqual([MENSAJE_TEXTO_INVALIDO]);
    });
  });

  describe('criterio 2 — PUT con un carácter NUL', () => {
    it('responde 400 con el mismo formato', async () => {
      const http = await arrancar(deteccionDeNul);

      const res = await http.put(`/api/consorcios/${ID}`).send(cuerpo);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(res.body.errores).toEqual([MENSAJE_TEXTO_INVALIDO]);
    });
  });

  describe('criterio 3 — la respuesta no filtra nada y el error queda en el log', () => {
    it('el cuerpo no trae el texto de PostgreSQL, el SQLSTATE ni trazas', async () => {
      const http = await arrancar(deteccionDeNul);

      const res = await http.post('/api/consorcios').send(cuerpo);

      expect(Object.keys(res.body).sort()).toEqual(['errores', 'message']);
      expect(JSON.stringify(res.body)).not.toMatch(/byte sequence|0x00|UTF8|22021|severity|stack|at .*\.ts/i);
    });

    it('el error real, con su SQLSTATE y el mensaje de PostgreSQL, se registra en el log', async () => {
      const http = await arrancar(deteccionDeNul);

      await http.post('/api/consorcios').send(cuerpo);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'Texto con codificación inválida rechazado (SQLSTATE 22021): invalid byte sequence for encoding "UTF8": 0x00',
      );
    });
  });

  describe('criterio 4 — los demás errores de base siguen siendo 500', () => {
    it.each([
      ['conexión caída (08006)', errorPg('08006', 'connection failure')],
      ['tabla inexistente (42P01)', errorPg('42P01', 'relation "consorcios" does not exist')],
      ['número fuera de rango (22003), otro error de datos', errorPg('22003', 'value out of range')],
      ['error común sin SQLSTATE', new Error('boom')],
    ])('%s → 500 genérico, sin loguear como texto inválido', async (_nombre, error) => {
      const http = await arrancar(error);

      const res = await http.post('/api/consorcios').send({ nombre: 'Edificio', direccion: 'Calle 1' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('lo que ya funcionaba sigue igual', () => {
    it('un HttpException conserva su código (404) y una validación propia, su 400', async () => {
      ({ app } = await createTestApp({ NODE_ENV: 'development' }));
      const http = request(app.getHttpServer());

      expect((await http.get(`/api/consorcios/${ID}`)).status).toBe(404);

      const invalido = await http.post('/api/consorcios').send({ nombre: '' });
      expect(invalido.status).toBe(400);
      expect(invalido.body.errores).toEqual(expect.arrayContaining(['nombre es obligatorio']));
      expect(warn).not.toHaveBeenCalled();
    });

    it('un alta válida con otros caracteres de control (tabulación, salto de línea) y unicode se guarda', async () => {
      ({ app } = await createTestApp({ NODE_ENV: 'development' }));

      const res = await request(app.getHttpServer())
        .post('/api/consorcios')
        .send({ nombre: 'Edificio\tÑandú 🛗', direccion: 'Calle 1\nPiso 2' });

      expect(res.status).toBe(201);
    });
  });
});
