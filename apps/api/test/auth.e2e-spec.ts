import { INestApplication, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { COSTO_BCRYPT, MENSAJE_BLOQUEO, MENSAJE_CREDENCIALES } from '../src/auth/auth.service';
import { Reloj, Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

/** Reloj que la prueba adelanta a mano, para probar vencimientos sin esperar. */
class RelojDePrueba implements Reloj {
  t = Date.UTC(2026, 10, 12, 12, 0, 0);
  ahora(): number {
    return this.t;
  }
  adelantarMinutos(min: number): void {
    this.t += min * 60_000;
  }
}

const PASSWORD = 'Clave-Segura-2026';

// bcrypt costo 12 es lento a propósito: con toda la suite en paralelo una prueba supera los 5 s por defecto.
jest.setTimeout(60_000);

describe('Autenticación y roles (HU-14 RF-01)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let reloj: RelojDePrueba;
  const http = () => request(app.getHttpServer());

  // El hash de PASSWORD se calcula una sola vez: cada bcrypt de costo 12 tarda ~250 ms.
  let hashPassword: string;
  beforeAll(async () => {
    hashPassword = await bcrypt.hash(PASSWORD, COSTO_BCRYPT);
  });

  async function alta(usuario: string, rol: Rol): Promise<void> {
    await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hashPassword });
  }

  function ingresar(usuario: string, password = PASSWORD) {
    return http().post('/api/auth/login').send({ usuario, password });
  }

  function cookieRefresco(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const c = cookies.find((x) => x.startsWith('mant_refresh='));
    if (!c) throw new Error('la respuesta no trae la cookie de refresco');
    return c;
  }

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    reloj = new RelojDePrueba();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios, reloj }));
    await alta('secretaria1', 'secretaria');
    await alta('rt1', 'rt_calle');
    await alta('admin1', 'administrador');
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Condición 1: login 200 con credenciales válidas, 401 con inválidas y el mismo mensaje', () => {
    it('responde 200 con token de acceso y los datos públicos del usuario', async () => {
      const res = await ingresar('secretaria1').expect(200);
      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        usuario: { usuario: 'secretaria1', rol: 'secretaria' },
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('el nombre de usuario no distingue mayúsculas', async () => {
      await ingresar('SECRETARIA1').expect(200);
    });

    it('contraseña incorrecta y usuario inexistente dan 401 con el mismo cuerpo', async () => {
      const mala = await ingresar('secretaria1', 'otra-clave-cualquiera').expect(401);
      const inexistente = await ingresar('nadie', 'otra-clave-cualquiera').expect(401);
      expect(mala.body).toEqual(inexistente.body);
      expect(mala.body.message).toBe(MENSAJE_CREDENCIALES);
      expect(mala.headers['set-cookie']).toBeUndefined();
    });

    it('un cuerpo sin usuario o sin password responde 400', async () => {
      await http().post('/api/auth/login').send({ usuario: 'secretaria1' }).expect(400);
      await http().post('/api/auth/login').send({}).expect(400);
    });
  });

  describe('Condición 2: contraseña con bcrypt costo 12, nunca en texto plano ni en logs', () => {
    it('el alta guarda un hash bcrypt de costo 12, no la contraseña', async () => {
      const { body: sesion } = await ingresar('admin1').expect(200);
      await http()
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${sesion.accessToken}`)
        .send({ usuario: 'firmante1', nombre: 'Ing. Firmante', rol: 'firmante', password: PASSWORD })
        .expect(201);

      const guardado = await usuarios.buscarPorUsuario('firmante1');
      expect(guardado?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(guardado?.passwordHash).not.toContain(PASSWORD);
      expect(await bcrypt.compare(PASSWORD, guardado!.passwordHash)).toBe(true);
    });

    it('ni el login ni el alta escriben la contraseña en los logs', async () => {
      const escrito: string[] = [];
      const capturar = (...args: unknown[]) => escrito.push(args.map(String).join(' '));
      const espias = [
        ...(['log', 'error', 'warn', 'debug', 'verbose'] as const).map((m) =>
          jest.spyOn(Logger.prototype, m).mockImplementation(capturar),
        ),
        ...(['log', 'error', 'warn', 'info', 'debug'] as const).map((m) =>
          jest.spyOn(console, m).mockImplementation(capturar),
        ),
      ];
      try {
        const { body: sesion } = await ingresar('admin1').expect(200);
        await ingresar('admin1', 'Clave-Equivocada-99').expect(401);
        await http()
          .post('/api/usuarios')
          .set('Authorization', `Bearer ${sesion.accessToken}`)
          .send({ usuario: 'eca1', nombre: 'ECA Uno', rol: 'eca', password: 'Otra-Clave-Nueva-1' })
          .expect(201);
      } finally {
        espias.forEach((e) => e.mockRestore());
      }
      const todo = escrito.join('\n');
      expect(todo).not.toContain(PASSWORD);
      expect(todo).not.toContain('Clave-Equivocada-99');
      expect(todo).not.toContain('Otra-Clave-Nueva-1');
    });

    it('rechaza contraseñas de menos de 10 caracteres y usuarios repetidos', async () => {
      const { body: sesion } = await ingresar('admin1').expect(200);
      const auth = `Bearer ${sesion.accessToken}`;
      await http().post('/api/usuarios').set('Authorization', auth)
        .send({ usuario: 'corto', nombre: 'Corto', rol: 'eca', password: 'abc' }).expect(400);
      await http().post('/api/usuarios').set('Authorization', auth)
        .send({ usuario: 'RT1', nombre: 'Repetido', rol: 'rt_calle', password: PASSWORD }).expect(409);
    });
  });

  describe('Condición 3: acceso vence a los 15 minutos y se renueva con refresco en cookie httpOnly, Secure y SameSite', () => {
    it('la cookie de refresco es httpOnly, Secure, SameSite=Strict y sólo viaja a /api/auth', async () => {
      const cookie = cookieRefresco(await ingresar('rt1').expect(200));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/i);
    });

    it('el token de acceso sirve hasta el minuto 15 y después responde 401', async () => {
      const { body } = await ingresar('rt1').expect(200);
      const auth = `Bearer ${body.accessToken}`;
      reloj.adelantarMinutos(14);
      await http().get('/api/auth/me').set('Authorization', auth).expect(200);
      reloj.adelantarMinutos(1);
      await http().get('/api/auth/me').set('Authorization', auth).expect(401);
    });

    it('con la cookie se obtiene un token nuevo, y la cookie usada deja de servir', async () => {
      const login = await ingresar('rt1').expect(200);
      const cookie = cookieRefresco(login).split(';')[0];
      reloj.adelantarMinutos(16);

      const renovada = await http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
      expect(renovada.body.usuario).toMatchObject({ usuario: 'rt1', rol: 'rt_calle' });
      await http().get('/api/auth/me').set('Authorization', `Bearer ${renovada.body.accessToken}`).expect(200);
      expect(cookieRefresco(renovada).split(';')[0]).not.toBe(cookie);

      await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('sin cookie, o después de cerrar sesión, el refresco responde 401', async () => {
      await http().post('/api/auth/refresh').expect(401);
      const cookie = cookieRefresco(await ingresar('rt1').expect(200)).split(';')[0];
      await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
      await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });

  describe('Condición 4: ruta con rol requerido responde 401 sin sesión y 403 con otro rol', () => {
    const nuevo = { usuario: 'nuevo1', nombre: 'Nuevo', rol: 'eca', password: PASSWORD };

    it('sin token responde 401', async () => {
      await http().post('/api/usuarios').send(nuevo).expect(401);
    });

    it('con un token inválido responde 401', async () => {
      await http().post('/api/usuarios').set('Authorization', 'Bearer inventado.x.y').send(nuevo).expect(401);
    });

    it('con un rol distinto (RT de Calle) responde 403', async () => {
      const { body } = await ingresar('rt1').expect(200);
      const res = await http()
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send(nuevo)
        .expect(403);
      expect(await usuarios.buscarPorUsuario('nuevo1')).toBeNull();
      expect(res.body.message).toBe('Tu rol no tiene acceso a este recurso.');
    });

    it('con el rol requerido (Administrador) responde 201', async () => {
      const { body } = await ingresar('admin1').expect(200);
      const res = await http()
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send(nuevo)
        .expect(201);
      expect(res.body).toMatchObject({ usuario: 'nuevo1', rol: 'eca' });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('las rutas sin rol requerido siguen públicas', async () => {
      await http().get('/api/health').expect(200);
    });
  });

  describe('Administrador inicial (ADMIN_INICIAL_USUARIO / ADMIN_INICIAL_PASSWORD)', () => {
    it('se crea al arrancar si no hay ningún Administrador, y puede ingresar', async () => {
      const vacio = new InMemoryUsuariosRepository();
      const { app: otra } = await createTestApp(
        { NODE_ENV: 'test', ADMIN_INICIAL_USUARIO: 'admin', ADMIN_INICIAL_PASSWORD: PASSWORD },
        undefined, undefined, undefined, { usuarios: vacio },
      );
      try {
        expect((await vacio.buscarPorUsuario('admin'))?.rol).toBe('administrador');
        await request(otra.getHttpServer()).post('/api/auth/login').send({ usuario: 'admin', password: PASSWORD }).expect(200);
      } finally {
        await otra.close();
      }
    });

    it('no crea otro si ya hay un Administrador', async () => {
      const { app: otra } = await createTestApp(
        { NODE_ENV: 'test', ADMIN_INICIAL_USUARIO: 'otro-admin', ADMIN_INICIAL_PASSWORD: PASSWORD },
        undefined, undefined, undefined, { usuarios },
      );
      await otra.close();
      expect(await usuarios.buscarPorUsuario('otro-admin')).toBeNull();
    });
  });

  describe('Condición 5: tras 5 intentos fallidos seguidos, 429 durante 15 minutos', () => {
    it('el 6.º intento responde 429 aunque la contraseña sea correcta, y a los 15 minutos vuelve a entrar', async () => {
      for (let i = 1; i <= 5; i++) await ingresar('secretaria1', `mala-${i}-xxxxx`).expect(401);

      const bloqueado = await ingresar('secretaria1').expect(429);
      expect(bloqueado.body.message).toBe(MENSAJE_BLOQUEO);
      expect(Number(bloqueado.headers['retry-after'])).toBe(900);

      reloj.adelantarMinutos(14);
      await ingresar('secretaria1').expect(429);
      reloj.adelantarMinutos(1);
      await ingresar('secretaria1').expect(200);
    });

    it('un ingreso correcto reinicia el contador: 4 fallas, éxito y 4 fallas más no bloquean', async () => {
      for (let i = 0; i < 4; i++) await ingresar('rt1', 'mala-clave-xxx').expect(401);
      await ingresar('rt1').expect(200);
      for (let i = 0; i < 4; i++) await ingresar('rt1', 'mala-clave-xxx').expect(401);
      await ingresar('rt1').expect(200);
    });

    it('el bloqueo es por usuario: no afecta a otro', async () => {
      for (let i = 0; i < 5; i++) await ingresar('secretaria1', 'mala-clave-xxx').expect(401);
      await ingresar('secretaria1').expect(429);
      await ingresar('rt1').expect(200);
    });

    it('un usuario inexistente se bloquea igual, para no revelar qué usuarios existen', async () => {
      for (let i = 0; i < 5; i++) await ingresar('fantasma', 'mala-clave-xxx').expect(401);
      await ingresar('fantasma', 'mala-clave-xxx').expect(429);
    });
  });
});
