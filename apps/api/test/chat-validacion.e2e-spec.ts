import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion } from './sesiones-e2e';

// HU-19 RF-04 — por la API real (sesiones de verdad): lo que no corresponde se rechaza con 400 y un mensaje claro, y no se guarda.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const UUID_QUE_NO_EXISTE = '00000000-0000-4000-8000-000000000000';

describe('Chat: validación de lo que entra, por la API (HU-19 RF-04)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
  });

  afterEach(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const enviar = (cuerpo: unknown) => http().post('/api/chat/mensajes').set('Authorization', bearer(tokens.rt_calle)).send(cuerpo as object);
  const grupo = async () => (await http().get('/api/chat/mensajes?sala=global').set('Authorization', bearer(tokens.firmante)).expect(200)).body as { contenido: string }[];
  const contactos = async () => (await http().get('/api/chat/canales').set('Authorization', bearer(tokens.rt_calle)).expect(200)).body as { id: string; tipo: string }[];

  const invalidos: [string, unknown, RegExp][] = [
    // criterio 1: el destinatario
    ['destinatario que no es un identificador', { tipoSala: 'directo', destinatarioId: 'no-es-uuid', contenido: 'hola' }, /destinatario no es un identificador/],
    ['destinatario numérico', { tipoSala: 'directo', destinatarioId: 123, contenido: 'hola' }, /destinatario no es un identificador/],
    ['destinatario con inyección', { tipoSala: 'directo', destinatarioId: "'; DROP TABLE usuarios; --", contenido: 'hola' }, /destinatario no es un identificador/],
    ['destinatario que no existe', { tipoSala: 'directo', destinatarioId: UUID_QUE_NO_EXISTE, contenido: 'hola' }, /no existe o no es un contacto/],
    ['privado sin destinatario', { tipoSala: 'directo', contenido: 'hola' }, /seleccionar un destinatario/],
    // criterio 2: el tipo de sala
    ['tipo de sala inventado', { tipoSala: 'xyz', contenido: 'hola' }, /tipo de sala tiene que ser/],
    ['sin tipo de sala', { contenido: 'hola' }, /tipo de sala tiene que ser/],
    ['tipo de sala numérico', { tipoSala: 5, contenido: 'hola' }, /tipo de sala tiene que ser/],
    ['cuerpo vacío', {}, /tipo de sala tiene que ser/],
    ['el cuerpo es una lista', [], /tiene que ser un objeto/],
    // criterio 3: el edificio
    ['edificio que no es un identificador', { tipoSala: 'global', contenido: 'hola', consorcioId: 'abc' }, /edificio elegido no es v[aá]lido/],
    ['edificio que no existe', { tipoSala: 'global', contenido: 'hola', consorcioId: UUID_QUE_NO_EXISTE }, /edificio elegido no existe/],
    // criterio 4: el contenido
    ['contenido numérico', { tipoSala: 'global', contenido: 123 }, /contenido del mensaje tiene que ser texto/],
    ['contenido que es un objeto', { tipoSala: 'global', contenido: { a: 1 } }, /contenido del mensaje tiene que ser texto/],
    ['contenido de 2.001 caracteres', { tipoSala: 'global', contenido: 'a'.repeat(2001) }, /no puede superar los 2000 caracteres/],
    ['contenido de 100.000 caracteres', { tipoSala: 'global', contenido: 'a'.repeat(100_000) }, /no puede superar los 2000 caracteres/],
    ['mensaje vacío', { tipoSala: 'global', contenido: '   ' }, /no puede estar vac[ií]o/],
    // criterio 5: el adjunto
    ['adjunto javascript:', { tipoSala: 'global', contenido: 'x', adjuntoUrl: 'javascript:alert(1)' }, /adjunto tiene que ser una imagen/],
    ['adjunto http externo', { tipoSala: 'global', contenido: 'x', adjuntoUrl: 'http://example.com/pixel.png' }, /adjunto tiene que ser una imagen/],
    ['adjunto SVG', { tipoSala: 'global', contenido: 'x', adjuntoUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, /adjunto tiene que ser una imagen/],
    ['adjunto HTML', { tipoSala: 'global', contenido: 'x', adjuntoUrl: 'data:text/html;base64,PGgxPg==' }, /adjunto tiene que ser una imagen/],
    ['adjunto que no es texto', { tipoSala: 'global', contenido: 'x', adjuntoUrl: 5 }, /adjunto tiene que ser una imagen/],
    // la máquina
    ['referencia de máquina de 41 caracteres', { tipoSala: 'global', contenido: 'x', maquinaRef: 'M'.repeat(41) }, /referencia de la m[aá]quina/],
  ];

  it.each(invalidos)('%s responde 400 con un mensaje claro (nunca 500) y no se guarda', async (_nombre, cuerpo, mensaje) => {
    const res = await enviar(cuerpo).expect(400);
    expect(String(res.body.message)).toMatch(mensaje);
    expect(res.body.message).not.toBe('Internal server error');
    expect(await grupo()).toEqual([]);
    const canales = (await http().get('/api/chat/canales').set('Authorization', bearer(tokens.rt_calle)).expect(200)).body as { ultimoMensaje?: string | null }[];
    expect(canales.every((c) => !c.ultimoMensaje)).toBe(true);
  });

  it('un cuerpo que no es JSON responde 400', async () => {
    await http().post('/api/chat/mensajes').set('Authorization', bearer(tokens.rt_calle)).set('Content-Type', 'application/json').send('{no es json').expect(400);
  });

  it('lo válido sigue funcionando: texto, foto sola, foto, privado a un contacto, y los límites exactos', async () => {
    await enviar({ tipoSala: 'global', contenido: 'hola equipo' }).expect(201);
    await enviar({ tipoSala: 'global', contenido: '', adjuntoUrl: PNG }).expect(201);
    await enviar({ tipoSala: 'global', contenido: 'a'.repeat(2000) }).expect(201);
    await enviar({ tipoSala: 'global', contenido: 'x', maquinaRef: 'M'.repeat(40) }).expect(201);
    const firmante = (await contactos()).find((c) => c.tipo === 'directo');
    const res = await enviar({ tipoSala: 'directo', destinatarioId: firmante!.id, contenido: 'privado' }).expect(201);
    expect(res.body.destinatarioId).toBe(firmante!.id);
    expect((await grupo()).map((m) => m.contenido)).toEqual(['hola equipo', '📷 Foto adjunta', 'a'.repeat(2000), 'x']);
  });

  // HU-19 RF-05 fija el tope de los adjuntos: 600 KB ya decodificada (la pantalla la reduce antes de enviarla).
  it('una foto de hasta 600 KB se acepta', async () => {
    const justa = `data:image/jpeg;base64,${'A'.repeat((600 * 1024 * 4) / 3)}`;
    await enviar({ tipoSala: 'global', contenido: 'foto justa', adjuntoUrl: justa }).expect(201);
  });

  it('una foto de más de 600 KB (por ejemplo 8 MB sin reducir) responde 400 y no se guarda', async () => {
    const grande = `data:image/jpeg;base64,${'A'.repeat(8 * 1024 * 1024)}`;
    const res = await enviar({ tipoSala: 'global', contenido: 'foto grande', adjuntoUrl: grande }).expect(400);
    expect(String(res.body.message)).toMatch(/demasiado pesada: puede pesar hasta 600 KB/);
  });

  describe('criterio 6: pedir los mensajes de una conversación', () => {
    it.each(['?sala=no-es-uuid', '?sala=GLOBAL', "?sala=' OR 1=1 --", '?sala=123', '?sala=a&sala=b', '?sala=global&sala=global'])('«%s» responde 400 y no 500', async (query) => {
      const res = await http().get(`/api/chat/mensajes${query}`).set('Authorization', bearer(tokens.rt_calle)).expect(400);
      expect(String(res.body.message)).toMatch(/conversaci[oó]n pedida no es v[aá]lida/);
    });

    it('«global», sin «sala» y el identificador de un compañero (aunque no tenga mensajes) responden 200', async () => {
      await http().get('/api/chat/mensajes?sala=global').set('Authorization', bearer(tokens.rt_calle)).expect(200);
      await http().get('/api/chat/mensajes').set('Authorization', bearer(tokens.rt_calle)).expect(200);
      const res = await http().get(`/api/chat/mensajes?sala=${UUID_QUE_NO_EXISTE}`).set('Authorization', bearer(tokens.rt_calle)).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  it('antes de validar el mensaje se controla el acceso: la ECA recibe 403 (no 400) y sin sesión 401', async () => {
    await http().post('/api/chat/mensajes').set('Authorization', bearer(tokens.ecaPortena)).send({ tipoSala: 'xyz' }).expect(403);
    await http().post('/api/chat/mensajes').send({ tipoSala: 'xyz' }).expect(401);
    await http().get('/api/chat/mensajes?sala=no-es-uuid').set('Authorization', bearer(tokens.ecaPortena)).expect(403);
  });
});
