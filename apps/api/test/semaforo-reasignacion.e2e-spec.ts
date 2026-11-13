import { INestApplication } from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { EdificioBase } from '../src/semaforo/semaforo.types';
import { InMemorySemaforoRepository, InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';

const PASSWORD = 'Clave-Segura-2026';
const ROJO = '00000000-0000-4000-8000-0000000000a1';
const INEXISTENTE = '00000000-0000-4000-8000-0000000000ff';

const edificio = (id: string, rt: string | null, inspeccionado = false, nombre = `Edificio ${id.slice(-2)}`): EdificioBase => ({
  id,
  nombre,
  direccion: 'Calle 1',
  maquinas: 1,
  maquinasInspeccionadas: inspeccionado ? 1 : 0,
  ultimaInspeccion: inspeccionado ? '2026-11-03T15:00:00.000Z' : null,
  rtCalle: rt === null ? null : { nombre: rt, telefono: '11 5555-0000', email: null },
});

describe('Reasignación del RT de Calle de un edificio en rojo (HU-04 RF-02)', () => {
  let app: INestApplication;
  let repo: InMemorySemaforoRepository;
  let hash: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcryptjs.hash(PASSWORD, 4);
  });

  /** Arranca con el reloj al 25 de noviembre de 2026 (un pendiente está en rojo) y un RT por usuario. */
  async function arrancar(ahoraIso = '2026-11-25T15:00:00Z') {
    const usuarios = new InMemoryUsuariosRepository();
    for (const [usuario, rol] of [['secretaria1', 'secretaria'], ['admin1', 'administrador'], ['rt1', 'rt_calle']] as [string, Rol][]) {
      await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash });
    }
    repo = new InMemorySemaforoRepository();
    // El edificio ROJO es de "ana". "beto" tiene 2 pendientes y 1 inspeccionado; "diego", 1; "carla", ninguno.
    repo.edificios = [
      edificio(ROJO, 'ana', false, 'Edificio Rojo'),
      edificio('00000000-0000-4000-8000-0000000000b1', 'beto'),
      edificio('00000000-0000-4000-8000-0000000000b2', 'beto'),
      edificio('00000000-0000-4000-8000-0000000000b3', 'beto', true),
      edificio('00000000-0000-4000-8000-0000000000d1', 'diego'),
    ];
    repo.rtDisponibles = ['ana', 'beto', 'carla', 'diego'].map((u) => ({ usuario: u, nombre: `RT ${u}` }));
    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      new InMemoryConsorciosRepository(),
      new InMemoryVisitasFallidasRepository(),
      { usuarios, reloj: { ahora: () => Date.parse(ahoraIso) } },
      repo,
    ));
  }

  const token = async (usuario: string) => {
    const res = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken}`;
  };

  afterEach(async () => {
    await app?.close();
  });

  // El login va ANTES de armar el pedido: dos pedidos de supertest encadenados se pisan el servidor de prueba.
  const sugerencia = async (usuario = 'secretaria1', consulta: Record<string, string> = {}, id = ROJO) => {
    const auth = await token(usuario);
    return http().get(`/api/semaforo/${id}/reasignacion/sugerencia`).query(consulta).set('Authorization', auth);
  };
  const reasignar = async (cuerpo: unknown, usuario = 'secretaria1', id = ROJO) => {
    const auth = await token(usuario);
    return http().post(`/api/semaforo/${id}/reasignacion`).send(cuerpo as object).set('Authorization', auth);
  };
  const rtDelRojo = async () => {
    const res = await http().get('/api/semaforo');
    return res.body.edificios.find((e: { id: string }) => e.id === ROJO).rtCalle?.nombre;
  };

  describe('quién puede', () => {
    it.each([
      ['GET sugerencia', (id: string) => http().get(`/api/semaforo/${id}/reasignacion/sugerencia`)],
      ['POST reasignación', (id: string) => http().post(`/api/semaforo/${id}/reasignacion`).send({})],
      ['GET historial', (id: string) => http().get(`/api/semaforo/${id}/reasignaciones`)],
    ])('%s: sin sesión 401 y con un rol que no es de la Secretaría 403', async (_n, pedir) => {
      await arrancar();
      const authRt = await token('rt1');
      expect((await pedir(ROJO)).status).toBe(401);
      expect((await pedir(ROJO).set('Authorization', authRt)).status).toBe(403);
    });

    it('la Secretaría y el Administrador sí', async () => {
      await arrancar();
      expect((await sugerencia('secretaria1')).status).toBe(200);
      expect((await sugerencia('admin1')).status).toBe(200);
    });

    it('el semáforo en sí (GET /api/semaforo) sigue sin pedir sesión', async () => {
      await arrancar();
      expect((await http().get('/api/semaforo')).status).toBe(200);
    });
  });

  describe('criterio 3 — la sugerencia', () => {
    it('sugiere al RT con menos edificios pendientes del mes y lista a los demás del menos al más cargado', async () => {
      await arrancar();

      const res = await sugerencia();

      expect(res.status).toBe(200);
      expect(res.body.sugerido).toEqual({ usuario: 'carla', nombre: 'RT carla', pendientes: 0 });
      expect(res.body.candidatos.map((c: { usuario: string; pendientes: number }) => `${c.usuario}:${c.pendientes}`)).toEqual([
        'carla:0', 'diego:1', 'beto:2',
      ]);
      expect(res.body).toMatchObject({ consorcioId: ROJO, nombre: 'Edificio Rojo', color: 'rojo', fecha: '2026-11-25' });
      expect(res.body.rtActual).toMatchObject({ nombre: 'ana' });
    });

    it('el actual no figura entre los candidatos, y un edificio inspeccionado no cuenta como carga', async () => {
      await arrancar();

      const res = await sugerencia();

      expect(res.body.candidatos.map((c: { usuario: string }) => c.usuario)).not.toContain('ana');
      expect(res.body.candidatos.find((c: { usuario: string }) => c.usuario === 'beto').pendientes).toBe(2); // de 3, 1 inspeccionado
    });

    it('si el menos cargado cambia, la sugerencia cambia: con "carla" ya cargada pasa a "diego"', async () => {
      await arrancar();
      repo.edificios.push(edificio('00000000-0000-4000-8000-0000000000c1', 'carla'), edificio('00000000-0000-4000-8000-0000000000c2', 'carla'));

      const res = await sugerencia();

      expect(res.body.sugerido).toMatchObject({ usuario: 'diego', pendientes: 1 });
    });

    it('sin otro RT disponible no sugiere a nadie', async () => {
      await arrancar();
      repo.rtDisponibles = [{ usuario: 'ana', nombre: 'RT ana' }];

      const res = await sugerencia();

      expect(res.status).toBe(200);
      expect(res.body.sugerido).toBeNull();
      expect(res.body.candidatos).toEqual([]);
    });

    it('sólo sugiere: no reasigna ni registra nada', async () => {
      await arrancar();

      await sugerencia();
      await sugerencia();

      expect(repo.intentosDeReasignar).toBe(0);
      expect(repo.registros).toHaveLength(0);
      expect(await rtDelRojo()).toBe('ana');
    });

    it('sólo para edificios en rojo: 409 si está en amarillo, en verde o inspeccionado', async () => {
      await arrancar();
      const amarillo = await sugerencia('secretaria1', { fecha: '2026-11-15' });
      expect(amarillo.status).toBe(409);
      expect(amarillo.body.message).toContain('en amarillo');

      const verde = await sugerencia('secretaria1', { fecha: '2026-11-05' });
      expect(verde.status).toBe(409);

      const inspeccionado = await sugerencia('secretaria1', {}, '00000000-0000-4000-8000-0000000000b3');
      expect(inspeccionado.status).toBe(409);
      expect(inspeccionado.body.message).toContain('en verde');
    });

    it('404 si el edificio no existe o el id no es un UUID; 400 con una fecha inválida', async () => {
      await arrancar();
      expect((await sugerencia('secretaria1', {}, INEXISTENTE)).status).toBe(404);
      expect((await sugerencia('secretaria1', {}, 'no-es-uuid')).status).toBe(404);
      expect((await sugerencia('secretaria1', { fecha: '2026-02-30' })).status).toBe(400);
    });
  });

  describe('criterio 4 — se aplica al confirmar y queda registrada', () => {
    it('al confirmar responde 201 con el registro y el edificio pasa al RT nuevo', async () => {
      await arrancar();

      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        consorcioId: ROJO,
        rtAnterior: 'ana',
        rtNuevo: 'carla',
        usuario: 'secretaria1',
        fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      });
      expect(await rtDelRojo()).toBe('carla');
    });

    it('el usuario del registro sale de la sesión, no del cuerpo', async () => {
      await arrancar();

      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla', usuario: 'otra.persona' }, 'admin1');

      expect(res.body.usuario).toBe('admin1');
    });

    it('la fecha la pone el servidor y es de ahora, no la del parámetro fecha de simulación', async () => {
      await arrancar();
      const antes = Date.now();

      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla', fecha: '2026-11-30' });

      expect(res.status).toBe(201);
      const registrada = Date.parse(res.body.fecha);
      expect(registrada).toBeGreaterThanOrEqual(antes - 1000);
      expect(registrada).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('el historial devuelve las reasignaciones del edificio, la más reciente primero', async () => {
      await arrancar();
      await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' });
      await reasignar({ rtAnterior: 'carla', rtNuevo: 'diego' });

      const auth = await token('secretaria1');
      const res = await http().get(`/api/semaforo/${ROJO}/reasignaciones`).set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.map((r: { rtAnterior: string; rtNuevo: string }) => `${r.rtAnterior}→${r.rtNuevo}`)).toEqual(['carla→diego', 'ana→carla']);
    });

    it('un edificio sin reasignaciones tiene el historial vacío; 404 si no existe', async () => {
      await arrancar();
      const auth = await token('secretaria1');
      const vacio = await http().get(`/api/semaforo/${ROJO}/reasignaciones`).set('Authorization', auth);
      expect(vacio.body).toEqual([]);
      expect((await http().get(`/api/semaforo/${INEXISTENTE}/reasignaciones`).set('Authorization', auth)).status).toBe(404);
    });
  });

  describe('qué se rechaza (y no se aplica nada)', () => {
    const noAplica = () => {
      expect(repo.registros).toHaveLength(0);
    };

    it.each([
      ['sin rtNuevo', { rtAnterior: 'ana' }, 'rtNuevo es obligatorio'],
      ['sin rtAnterior', { rtNuevo: 'carla' }, 'rtAnterior es obligatorio'],
      ['con rtNuevo vacío', { rtAnterior: 'ana', rtNuevo: '   ' }, 'rtNuevo es obligatorio'],
      ['con tipos que no son texto', { rtAnterior: 1, rtNuevo: ['carla'] }, 'es obligatorio'],
    ])('400 %s', async (_n, cuerpo, mensaje) => {
      await arrancar();
      const res = await reasignar(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos');
      expect(JSON.stringify(res.body.errores)).toContain(mensaje);
      noAplica();
    });

    it('400 si el cuerpo no es un objeto', async () => {
      await arrancar();
      expect((await reasignar([])).status).toBe(400);
      noAplica();
    });

    it('400 si el RT nuevo ya es el actual', async () => {
      await arrancar();
      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'ana' });
      expect(res.status).toBe(400);
      expect(res.body.errores[0]).toContain('ya es el RT');
      noAplica();
    });

    it('400 si el RT nuevo no es un RT de Calle activo (por ejemplo, una Secretaria)', async () => {
      await arrancar();
      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'secretaria1' });
      expect(res.status).toBe(400);
      expect(res.body.errores[0]).toContain('no es un RT de Calle activo');
      expect(repo.intentosDeReasignar).toBe(0);
    });

    it('409 si el RT que la Secretaría vio ya no es el actual (alguien lo cambió mientras decidía)', async () => {
      await arrancar();
      repo.edificios[0].rtCalle = { nombre: 'diego', telefono: '1', email: null };
      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('cambió');
      noAplica();
    });

    it('409 si el edificio no está en rojo (verificado con la fecha de hoy)', async () => {
      await arrancar('2026-11-12T15:00:00Z');
      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('en amarillo');
      noAplica();
    });

    it('409 si el edificio no tiene RT asignado', async () => {
      await arrancar();
      repo.edificios[0].rtCalle = null;
      const res = await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('no tiene RT');
      noAplica();
    });

    it('404 si el edificio no existe', async () => {
      await arrancar();
      expect((await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' }, 'secretaria1', INEXISTENTE)).status).toBe(404);
    });

    it('no se puede reasignar dos veces con la misma vista: la segunda da 409', async () => {
      await arrancar();
      expect((await reasignar({ rtAnterior: 'ana', rtNuevo: 'carla' })).status).toBe(201);
      const otra = await reasignar({ rtAnterior: 'ana', rtNuevo: 'diego' });
      expect(otra.status).toBe(409);
      expect(repo.registros).toHaveLength(1);
      expect(await rtDelRojo()).toBe('carla');
    });
  });
});
