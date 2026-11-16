import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { COSTO_BCRYPT, MENSAJE_CREDENCIALES } from '../src/auth/auth.service';
import { Reloj } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp, MailerDePrueba } from './create-test-app';

/** Reloj que la prueba adelanta a mano, para probar el vencimiento del enlace sin esperar. */
class RelojDePrueba implements Reloj {
  t = Date.UTC(2026, 10, 13, 12, 0, 0);
  ahora(): number {
    return this.t;
  }
  adelantarMinutos(min: number): void {
    this.t += min * 60_000;
  }
}

const PASSWORD_VIEJA = 'Clave-Vieja-2026';
const PASSWORD_NUEVA = 'Clave-Nueva-2026';

// bcrypt costo 12 es lento a propósito.
jest.setTimeout(60_000);

describe('Recupero de contraseña por correo (HU-14)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let mailer: MailerDePrueba;
  let reloj: RelojDePrueba;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    mailer = new MailerDePrueba();
    reloj = new RelojDePrueba();
    ({ app } = await createTestApp(
      { NODE_ENV: 'test', AUTH_JWT_SECRET: 'secreto-de-prueba-con-mas-de-32-caracteres', APP_URL: 'https://app.test' },
      undefined,
      undefined,
      undefined,
      { usuarios, reloj },
      undefined,
      mailer,
    ));
    await usuarios.crear({
      usuario: 'ana',
      nombre: 'Ana Pérez',
      rol: 'secretaria',
      passwordHash: await bcrypt.hash(PASSWORD_VIEJA, COSTO_BCRYPT),
      email: 'Ana@Ejemplo.test',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  /** El token que viajó en el mail. */
  function tokenDelMail(): string {
    const enlace = mailer.enviados.at(-1)?.texto.match(/https:\/\/app\.test\/\?t=([^\s]+)/);
    if (!enlace) throw new Error(`el mail no trae el enlace: ${mailer.enviados.at(-1)?.texto}`);
    return decodeURIComponent(enlace[1]);
  }

  const pedir = (usuario: string) => http().post('/api/auth/recuperar').send({ usuario });
  const restablecer = (token: string, password: string) =>
    http().post('/api/auth/restablecer').send({ token, password });
  const ingresar = (password: string) => http().post('/api/auth/login').send({ usuario: 'ana', password });

  it('manda el enlace al email de la cuenta y permite elegir una contraseña nueva', async () => {
    await pedir('ana').expect(204);
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0].a).toBe('Ana@Ejemplo.test');

    await restablecer(tokenDelMail(), PASSWORD_NUEVA).expect(204);

    await ingresar(PASSWORD_NUEVA).expect(200);
    const vieja = await ingresar(PASSWORD_VIEJA).expect(401);
    expect(vieja.body.message).toBe(MENSAJE_CREDENCIALES);
  });

  it('acepta también el email como identificador, sin distinguir mayúsculas', async () => {
    await pedir('ana@ejemplo.test').expect(204);
    expect(mailer.enviados).toHaveLength(1);
  });

  it('el enlace sirve una sola vez', async () => {
    await pedir('ana').expect(204);
    const token = tokenDelMail();
    await restablecer(token, PASSWORD_NUEVA).expect(204);
    await restablecer(token, 'Otra-Clave-2026').expect(400);
    await ingresar(PASSWORD_NUEVA).expect(200);
  });

  it('el enlace vence al cabo de una hora', async () => {
    await pedir('ana').expect(204);
    const token = tokenDelMail();
    reloj.adelantarMinutos(61);
    await restablecer(token, PASSWORD_NUEVA).expect(400);
    await ingresar(PASSWORD_VIEJA).expect(200);
  });

  it('no manda nada ni delata nada si la cuenta no existe o no tiene email', async () => {
    await usuarios.crear({
      usuario: 'sin-mail',
      nombre: 'Sin Mail',
      rol: 'rt_calle',
      passwordHash: await bcrypt.hash(PASSWORD_VIEJA, COSTO_BCRYPT),
    });
    await pedir('no-existe').expect(204);
    await pedir('sin-mail').expect(204);
    expect(mailer.enviados).toHaveLength(0);
  });

  it('no manda un segundo mail antes de dos minutos', async () => {
    await pedir('ana').expect(204);
    await pedir('ana').expect(204);
    expect(mailer.enviados).toHaveLength(1);

    reloj.adelantarMinutos(3);
    await pedir('ana').expect(204);
    expect(mailer.enviados).toHaveLength(2);
  });

  it('rechaza una contraseña nueva demasiado corta', async () => {
    await pedir('ana').expect(204);
    const r = await restablecer(tokenDelMail(), 'corta').expect(400);
    expect(JSON.stringify(r.body.message)).toContain('10 caracteres');
    await ingresar(PASSWORD_VIEJA).expect(200);
  });
});
