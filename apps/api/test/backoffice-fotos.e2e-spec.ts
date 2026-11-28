import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { FirmanteService } from '../src/firmante/firmante.service';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion } from './sesiones-e2e';

// HU-05 RF-03 por HTTP, con roles reales: el visor del backoffice rotula la foto del frente como «Frente de cabina y botonera».
jest.setTimeout(30_000);

describe('Backoffice: los rótulos de las fotos de una visita (HU-05 RF-03)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
  });
  afterEach(async () => {
    await app?.close();
  });

  const detalle = (rol: NombreSesion, id: string) => request(app.getHttpServer()).get(`/api/backoffice/visitas/${id}`).set('Authorization', bearer(tokens[rol]));
  const etiquetas = (cuerpo: { fotos: { etiqueta: string }[] }) => cuerpo.fotos.map((f) => f.etiqueta);

  it.each(['secretaria', 'administrador'] as NombreSesion[])('criterio 1: %s ve la foto del frente rotulada «Frente de cabina y botonera», no «Frente del edificio»', async (rol) => {
    const res = await detalle(rol, 'MAQ-CORRIENTES-M1').expect(200);

    expect(etiquetas(res.body)).toEqual(['Cables', 'Frente de cabina y botonera']);
    expect(JSON.stringify(res.body)).not.toContain('Frente del edificio');
  });

  it('criterio 1: con la alerta de cabina trabada, sigue después del frente y con su propio rótulo', async () => {
    const res = await detalle('secretaria', 'MAQ-SANTAFE-M2').expect(200);

    expect(etiquetas(res.body)).toEqual(['Frente de cabina y botonera', 'Cabina trabada']);
  });

  it('criterio 1: la visita de un equipo hidráulico, que no lleva foto de cables, no muestra foto de cables y rotula la del frente igual', async () => {
    await app.get(FirmanteService).registrarVisita('MAQ-CORRIENTES-M2', {
      id: 'VIS-HIDRAULICO', fecha: '2026-11-20T10:00:00.000Z', inspector: 'rt', estado: 'Recorrida', fotosObligatorias: { frente: 'https://fotos.test/frente.jpg' },
      firmaEncargado: 'data:image/svg+xml;base64,PHN2Zy8+', nombreEncargado: 'Carlos Rodríguez (Encargado)', autorizada: false,
    });

    const res = await detalle('secretaria', 'MAQ-CORRIENTES-M2').expect(200);

    // la M2 de ejemplo tiene además su alerta de cabina trabada: esa foto sigue, y no aparece ninguna de cables
    expect(res.body.fotos[0]).toEqual({ etiqueta: 'Frente de cabina y botonera', url: 'https://fotos.test/frente.jpg' });
    expect(etiquetas(res.body)).toEqual(['Frente de cabina y botonera', 'Cabina trabada']);
    expect(etiquetas(res.body)).not.toContain('Cables');
  });

  it('el rótulo no cambia quién ve el visor: el RT sigue sin verlo (403) y sin sesión 401', async () => {
    await detalle('rt_calle', 'MAQ-CORRIENTES-M1').expect(403);
    await request(app.getHttpServer()).get('/api/backoffice/visitas/MAQ-CORRIENTES-M1').expect(401);
  });
});
