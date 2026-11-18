import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { NombreSesion, bearer, crearSesiones } from './sesiones-e2e';

describe('API Firmante (HU-08 / RF-01)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  // Desde HU-08 RF-04 las rutas del Firmante piden sesión: lo que hacen estas pruebas lo hace «gonza», el Firmante de los datos de demostración.
  const api = () => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', bearer(tokens.firmante)),
    post: (url: string) => request(app.getHttpServer()).post(url).set('Authorization', bearer(tokens.firmante)),
  });

  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
  });

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /api/firmante/maquinas', () => {
    it('retorna 200 con la lista de máquinas del mes asignadas al usuario firmante', async () => {
      const res = await api()
        .get('/api/firmante/maquinas');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      // Cada máquina tiene sus datos requeridos de edificio, código AGC y estado
      const m1 = res.body.find((m: any) => m.id === 'MAQ-CORRIENTES-M1');
      expect(m1).toBeDefined();
      expect(m1.codigoAGC).toBe('M1');
      expect(m1.edificio.direccion).toBe('Av. Corrientes 1234, CABA');
      expect(m1.estado).toBe('Recorrida');
      expect(m1.visita).toBeDefined();
      expect(m1.visita.fotosObligatorias.cables).toBeTruthy();
      expect(m1.visita.fotosObligatorias.frente).toBeTruthy();
      expect(m1.visita.firmaEncargado).toBeTruthy();
      expect(m1.visita.autorizada).toBe(false);
    });

    it('permite filtrar las máquinas por el parámetro mes (ej. ?mes=2026-11)', async () => {
      const res = await api()
        .get('/api/firmante/maquinas?mes=2026-11');

      expect(res.status).toBe(200);
      expect(res.body.every((m: any) => m.mes === '2026-11')).toBe(true);

      const resVacio = await api()
        .get('/api/firmante/maquinas?mes=2025-01');

      expect(resVacio.status).toBe(200);
      expect(resVacio.body).toEqual([]);
    });
  });

  describe('POST /api/firmante/autorizar', () => {
    it('responde 400 si falta el body o el maquinaId', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('maquinaId o visitaId es requerido');
    });

    it('responde 404 si la máquina no existe', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({ maquinaId: 'MAQ-NO-EXISTE' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Máquina o visita no encontrada');
    });

    it('rechaza con 400 si la visita está en "Pendiente de Visita"', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({ maquinaId: 'MAQ-CORRIENTES-M2' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('la visita debe estar en estado Recorrida');
    });

    it('rechaza con 400 si la visita está en "Advertencia"', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({ maquinaId: 'MAQ-CALLAO-M1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('la visita debe estar en estado Recorrida');
    });

    it('rechaza con 400 si faltan fotos obligatorias (ej. cables)', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({ maquinaId: 'MAQ-SANTAFE-M2' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('fotos obligatorias de cables y frente');
    });

    it('rechaza con 400 si falta la firma del encargado en el informe', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({ maquinaId: 'MAQ-SANTAFE-M1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('firma del encargado');
    });

    it('autoriza exitosamente con 200 cuando cumple fotos obligatorias y firma del encargado', async () => {
      const res = await api()
        .post('/api/firmante/autorizar')
        .send({ maquinaId: 'MAQ-CORRIENTES-M1' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.maquinaId).toBe('MAQ-CORRIENTES-M1');
      expect(res.body.autorizacion.autorizada).toBe(true);
      expect(res.body.autorizacion.autorizadoPor).toBe('gonza');
      expect(res.body.autorizacion.fechaAutorizacion).toBeTruthy();
      expect(res.body.autorizacion.protocoloAGC).toContain('AGC-2026-AUT-MAQ-CORRIENTES-M1');

      // Comprueba que la consulta posterior de la máquina ya refleja la autorización
      const resMaquinas = await api()
        .get('/api/firmante/maquinas');

      const m1 = resMaquinas.body.find((m: any) => m.id === 'MAQ-CORRIENTES-M1');
      expect(m1.visita.autorizada).toBe(true);
      expect(m1.visita.autorizadoPor).toBe('gonza');
    });
  });
});
