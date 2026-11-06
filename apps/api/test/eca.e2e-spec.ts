import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';

describe('EcaController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp(process.env);
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/eca/cobertura', () => {
    it('responde 200 con las métricas y porcentaje de cobertura mensual', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/cobertura')
        .set('x-eca-name', 'Conservación Porteña S.R.L.')
        .expect(200);

      expect(res.body).toHaveProperty('eca', 'Conservación Porteña S.R.L.');
      expect(res.body).toHaveProperty('mes', '2026-11');
      expect(res.body).toHaveProperty('totalMaquinas', 2);
      expect(res.body).toHaveProperty('inspeccionadas', 1);
      expect(res.body).toHaveProperty('firmadas', 0);
      expect(res.body).toHaveProperty('pendientes', 1);
      expect(res.body).toHaveProperty('porcentajeInspeccionadas', 50.0);
      expect(res.body).toHaveProperty('porcentajeFirmadas', 0.0);
      expect(res.body).toHaveProperty('porcentajeCobertura', 0.0);
    });

    it('permite filtrar por mes y consultar otra ECA aliada', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/cobertura?mes=2026-11')
        .set('x-eca-name', 'Elevadores San Martín')
        .expect(200);

      expect(res.body.eca).toBe('Elevadores San Martín');
      expect(res.body.totalMaquinas).toBe(1);
      expect(res.body.advertencias).toBe(1);
      expect(res.body.inspeccionadas).toBe(0);
      expect(res.body.porcentajeInspeccionadas).toBe(0);
    });
  });

  describe('GET /api/eca/maquinas', () => {
    it('responde 200 con la lista de máquinas protegida de la ECA', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/maquinas')
        .set('x-eca-name', 'Conservación Porteña S.R.L.')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body.every((m: any) => m.eca === 'Conservación Porteña S.R.L.')).toBe(true);

      const m1 = res.body.find((m: any) => m.id === 'MAQ-CORRIENTES-M1');
      expect(m1).toBeDefined();
      expect(m1.codigoAGC).toBe('M1');
      expect(m1.estado).toBe('Recorrida');
      expect(m1.edificio.direccion).toContain('Av. Corrientes 1234');
    });

    it('devuelve array vacío si la ECA no tiene máquinas asignadas en ese mes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/maquinas?mes=2027-01')
        .set('x-eca-name', 'Conservación Porteña S.R.L.')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
