import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { bearer, crearSesiones, NombreSesion } from './sesiones-e2e';

// HU-17 RF-12 por HTTP, con roles reales: la lista no lleva imágenes y la foto se sirve aparte.
jest.setTimeout(60_000);

const MAQUINAS = ['MAQ-CORRIENTES-M1', 'MAQ-CORRIENTES-M2', 'MAQ-CALLAO-M1', 'MAQ-SANTAFE-M1', 'MAQ-SANTAFE-M2'];
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const FOTO = `data:image/jpeg;base64,${BYTES.toString('base64')}`;
/** Una foto de unos 500 KB (lo máximo que sale del celular después de reducirla). */
const FOTO_500KB = `data:image/jpeg;base64,${Buffer.alloc(500 * 1024, 7).toString('base64')}`;

describe('Reportes de parada: la lista sin imágenes y la foto aparte (HU-17 RF-12)', () => {
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

  const http = () => request(app.getHttpServer());
  const como = (rol: NombreSesion) => ({ Authorization: bearer(tokens[rol]) });
  const registrar = (maquinaId: string, foto = FOTO) => http().post('/api/paradas').set(como('rt_calle')).send({ maquinaId, causa: 'Cabina trabada', fotos: [foto] });
  const pedirFoto = (id: string, rol: NombreSesion) => http().get(`/api/paradas/${id}/foto`).set(como(rol));

  describe('criterio 1: la lista trae la cantidad de fotos y ninguna imagen', () => {
    it('GET /api/paradas devuelve `fotos` y `fotoRuta` por reporte, sin `fotoUrl` ni ninguna imagen', async () => {
      const r = await registrar(MAQUINAS[0]).expect(201);

      const res = await http().get('/api/paradas').set(como('secretaria')).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: r.body.id, fotos: 1, fotoRuta: `/api/paradas/${r.body.id}/foto` });
      expect(res.body[0]).not.toHaveProperty('fotoUrl');
      expect(res.text).not.toContain('base64');
    });

    it('guardar, confirmar y rechazar un reporte tampoco devuelven la imagen', async () => {
      const a = await registrar(MAQUINAS[0]).expect(201);
      expect(JSON.stringify(a.body)).not.toContain('base64');
      const confirmado = await http().post(`/api/paradas/${a.body.id}/confirmar`).set(como('firmante')).expect(200);
      expect(JSON.stringify(confirmado.body)).not.toContain('base64');

      const b = await registrar(MAQUINAS[1]).expect(201);
      const rechazado = await http().post(`/api/paradas/${b.body.id}/rechazar`).set(como('firmante')).send({ motivo: 'No era una falla' }).expect(200);
      expect(JSON.stringify(rechazado.body)).not.toContain('base64');
    });

    it('criterio 3: con 5 reportes de una foto de 500 KB cada uno, la lista pesa menos de 10 KB', async () => {
      for (const m of MAQUINAS) await registrar(m, FOTO_500KB).expect(201);

      const res = await http().get('/api/paradas').set(como('secretaria')).expect(200);

      expect(res.body).toHaveLength(5);
      expect(Buffer.byteLength(res.text)).toBeLessThan(10 * 1024);
      // y cada foto, pedida aparte, sí pesa lo que pesa
      const una = await pedirFoto(res.body[0].id, 'secretaria').expect(200);
      expect((una.body as Buffer).length).toBe(500 * 1024);
    });
  });

  describe('criterio 2: la foto se sirve aparte, con sesión y a quien corresponde', () => {
    it('sin sesión → 401', async () => {
      const r = await registrar(MAQUINAS[0]).expect(201);

      await http().get(`/api/paradas/${r.body.id}/foto`).expect(401);
    });

    it('con permiso → 200 con la imagen, el tipo y las cabeceras de caché de un año', async () => {
      const r = await registrar(MAQUINAS[0]).expect(201);

      const res = await pedirFoto(r.body.id, 'secretaria').expect(200);

      expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(res.body as Buffer, BYTES)).toBe(0);
    });

    it.each(['secretaria', 'administrador', 'firmante', 'rt_calle', 'ecaPortena'] as NombreSesion[])('%s la ve (200)', async (rol) => {
      const r = await registrar(MAQUINAS[0]).expect(201); // gonza es el Firmante; «rt.e2e» lo cargó; la máquina es de la ECA Porteña

      await pedirFoto(r.body.id, rol).expect(200);
    });

    it.each(['firmanteOtro', 'ecaMaicon', 'ecaSanMartin', 'ecaParcial', 'ecaMayusculas', 'ecaSinAsignar'] as NombreSesion[])('%s no la ve: 404, no 403', async (rol) => {
      const r = await registrar(MAQUINAS[0]).expect(201);

      const res = await pedirFoto(r.body.id, rol).expect(404);

      expect(JSON.stringify(res.body)).not.toContain('base64');
    });

    it('un reporte que no existe da el mismo 404 que uno que no se puede ver', async () => {
      const r = await registrar(MAQUINAS[0]).expect(201);

      const sinPermiso = await pedirFoto(r.body.id, 'ecaMaicon').expect(404);
      const inexistente = await pedirFoto('PAR-no-existe', 'secretaria').expect(404);

      expect(sinPermiso.body.message).toBe(inexistente.body.message);
    });

    it('un reporte cuya foto es una dirección web (no una imagen) da 404 y no figura `fotoRuta`', async () => {
      const r = await registrar(MAQUINAS[0], 'https://fotos.example/cabina.jpg').expect(201);

      expect(r.body.fotoRuta).toBeNull();
      await pedirFoto(r.body.id, 'secretaria').expect(404);
    });

    it('la ECA ve la foto de su alerta: la alerta del portal trae `fotoRuta` y esa ruta la sirve a su ECA y a ninguna otra', async () => {
      const r = await registrar(MAQUINAS[0]).expect(201);

      const alertas = await http().get('/api/eca/alertas').set(como('ecaPortena')).expect(200);

      const propia = alertas.body.alertas.find((a: { maquinaId: string }) => a.maquinaId === MAQUINAS[0]);
      const deEjemplo = alertas.body.alertas.find((a: { maquinaId: string }) => a.maquinaId === 'MAQ-CORRIENTES-M2'); // los datos de ejemplo traen una alerta propia
      const alerta = propia.alerta;
      expect(deEjemplo.alerta.fotoRuta).toBeUndefined(); // no viene de un reporte de parada: no tiene ruta y la pantalla usa su foto de siempre
      expect(alerta.fotoRuta).toBe(`/api/paradas/${r.body.id}/foto`);
      expect(alerta.fotografiaCabinaTrabada).toBe(FOTO); // lo de siempre sigue: el remito, el aviso y el backoffice la usan
      const foto = await http().get(alerta.fotoRuta).set(como('ecaPortena')).expect(200);
      expect(Buffer.compare(foto.body as Buffer, BYTES)).toBe(0);
      await http().get(alerta.fotoRuta).set(como('ecaMaicon')).expect(404);
    });
  });
});
