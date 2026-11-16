import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { FirmanteService } from '../src/firmante/firmante.service';
import { createTestApp } from './create-test-app';

// HU-08 RF-03 por HTTP: el Firmante rechaza un informe, vuelve a la bandeja de la Secretaría y vence el plazo de 5 días hábiles.
const PASSWORD = 'Clave-Segura-2026';
const MAQUINA = 'MAQ-CORRIENTES-M1';
jest.setTimeout(30_000);

describe('Rechazo del informe por el Firmante y bandeja de la Secretaría (HU-08 RF-03)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    const hash = await bcrypt.hash(PASSWORD, 4);
    const roles: Rol[] = ['secretaria', 'administrador', 'rt_calle', 'firmante', 'eca'];
    for (const rol of roles) {
      await usuarios.crear({ usuario: rol, nombre: rol, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: rol, password: PASSWORD });
      expect(login.status).toBe(200);
      tokens[rol] = login.body.accessToken;
    }
  });

  beforeEach(() => {
    app.get(FirmanteService).resetSeed();
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const rechazar = (cuerpo: Record<string, unknown>, firmante = 'gonza') => http().post('/api/firmante/rechazar').set('x-user-name', firmante).send(cuerpo);
  const bandeja = (rol?: string) => {
    const r = http().get('/api/firmante/bandeja-secretaria');
    return rol ? r.set('Authorization', `Bearer ${tokens[rol]}`) : r;
  };

  it('criterio 1: rechaza con motivo → 200 a nombre del Firmante', async () => {
    const res = await rechazar({ maquinaId: MAQUINA, motivo: 'Falta la foto de cables' }, 'gonza');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, maquinaId: MAQUINA, rechazo: { motivo: 'Falta la foto de cables', rechazadoPor: 'gonza' } });
  });

  it('criterio 1: sin motivo → 400 y el informe sigue sin rechazar (la bandeja no lo muestra)', async () => {
    for (const motivo of [undefined, '', '   ']) {
      const res = await rechazar({ maquinaId: MAQUINA, motivo });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('motivo');
    }
    expect((await bandeja('secretaria')).body.rechazados).toEqual([]);
  });

  it('criterio 2: el informe rechazado aparece en la bandeja de la Secretaría con el motivo', async () => {
    await rechazar({ maquinaId: MAQUINA, motivo: 'Firma del encargado ilegible' });

    for (const rol of ['secretaria', 'administrador']) {
      const res = await bandeja(rol);
      expect(res.status).toBe(200);
      expect(res.body.rechazados).toHaveLength(1);
      expect(res.body.rechazados[0]).toMatchObject({ maquinaId: MAQUINA, edificio: 'Consorcio Corrientes 1234', motivo: 'Firma del encargado ilegible', rechazadoPor: 'gonza' });
    }
  });

  it.each(['rt_calle', 'firmante', 'eca'])('criterio 2: la bandeja de la Secretaría no es para el rol %s (403): el rechazo no vuelve al RT de Calle', async (rol) => {
    await rechazar({ maquinaId: MAQUINA, motivo: 'x' });

    expect((await bandeja(rol)).status).toBe(403);
  });

  it('la bandeja sin sesión responde 401', async () => {
    expect((await bandeja()).status).toBe(401);
  });

  it('un informe rechazado ya no se puede autorizar (409) y rechazarlo dos veces tampoco (409)', async () => {
    await rechazar({ maquinaId: MAQUINA, motivo: 'x' });

    expect((await http().post('/api/firmante/autorizar').set('x-user-name', 'gonza').send({ maquinaId: MAQUINA })).status).toBe(409);
    expect((await rechazar({ maquinaId: MAQUINA, motivo: 'otra vez' })).status).toBe(409);
  });

  describe('criterios 3 y 4: plazo de 5 días hábiles (con la fecha simulada)', () => {
    const TODO_MENOS_DATE = [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
      'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ] as const;
    const fecha = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: [...TODO_MENOS_DATE] });
    afterEach(() => jest.useRealTimers());
    // El token de acceso vence a los 15 minutos del reloj simulado: al cambiar de fecha se vuelve a ingresar.
    const bandejaALaFecha = async () => {
      const login = await http().post('/api/auth/login').send({ usuario: 'secretaria', password: PASSWORD });
      return http().get('/api/firmante/bandeja-secretaria').set('Authorization', `Bearer ${login.body.accessToken}`);
    };

    it('con 5 días hábiles no hay aviso; con más de 5 sí, una sola vez', async () => {
      fecha('2026-11-11T15:00:00Z'); // miércoles: 5 días hábiles desde el informe del 4/11
      expect((await bandejaALaFecha()).body.avisosPlazo).toEqual([]);

      fecha('2026-11-12T15:00:00Z'); // jueves: 6
      const primero = (await bandejaALaFecha()).body.avisosPlazo;
      expect(primero).toHaveLength(1);
      expect(primero[0]).toMatchObject({ maquinaId: MAQUINA, diasHabiles: 6, edificio: 'Consorcio Corrientes 1234' });

      fecha('2026-11-20T15:00:00Z');
      expect((await bandejaALaFecha()).body.avisosPlazo.filter((a: { maquinaId: string }) => a.maquinaId === MAQUINA)).toEqual(primero);
    });

    it('un informe autorizado o rechazado dentro del plazo no genera aviso', async () => {
      fecha('2026-11-06T15:00:00Z');
      await http().post('/api/firmante/autorizar').set('x-user-name', 'gonza').send({ maquinaId: MAQUINA }).expect(200);

      fecha('2026-12-01T15:00:00Z');
      const avisos = (await bandejaALaFecha()).body.avisosPlazo.map((a: { maquinaId: string }) => a.maquinaId);
      expect(avisos).not.toContain(MAQUINA);
    });
  });
});
