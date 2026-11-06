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

  describe('GET /api/eca/alertas', () => {
    it('responde 200 con el listado de alertas críticas de la flota', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/alertas')
        .set('x-eca-name', 'MAICON Mantenimiento')
        .expect(200);

      expect(res.body).toHaveProperty('eca', 'MAICON Mantenimiento');
      expect(res.body).toHaveProperty('mes', '2026-11');
      expect(res.body).toHaveProperty('totalAlertas', 2);
      expect(Array.isArray(res.body.alertas)).toBe(true);
      expect(res.body.alertas.length).toBe(2);

      const fueraDeServicio = res.body.alertas.find(
        (a: any) => a.alerta.tipo === 'FUERA_DE_SERVICIO',
      );
      expect(fueraDeServicio).toBeDefined();
      expect(fueraDeServicio.alerta.fotografiaCabinaTrabada).toBeTruthy();
      expect(fueraDeServicio.alerta.motivo).toBeTruthy();

      const reparacionUrgente = res.body.alertas.find(
        (a: any) => a.alerta.tipo === 'REPARACION_URGENTE',
      );
      expect(reparacionUrgente).toBeDefined();
      expect(Array.isArray(reparacionUrgente.alerta.checklist)).toBe(true);
      expect(reparacionUrgente.alerta.checklist.length).toBeGreaterThan(0);
    });
  });

  describe('RF-02: Descarga de Remito y Acuse Legal', () => {
    it('GET /api/eca/remito/:alertaId descarga el remito técnico y registra el acuse legal automáticamente', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/remito/ALT-MAICON-001?usuario=operador.legal@maicon.com.ar')
        .expect(200);

      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="remito-tecnico-ALT-MAICON-001.json"',
      );
      expect(res.body).toHaveProperty('id', 'REM-ALT-MAICON-001');
      expect(res.body).toHaveProperty('alertaId', 'ALT-MAICON-001');
      expect(res.body).toHaveProperty('eca', 'MAICON Mantenimiento');
      expect(res.body.checklist.length).toBeGreaterThan(0);

      // Verificación de acuse legal registrado automáticamente
      expect(res.body.acuseLegal).toHaveProperty('registrado', true);
      expect(res.body.acuseLegal).toHaveProperty(
        'usuario',
        'operador.legal@maicon.com.ar',
      );
      expect(res.body.acuseLegal.fechaHora).toBeTruthy();
    });

    it('POST /api/eca/alertas/:alertaId/acuse registra explícitamente el acuse legal', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/eca/alertas/ALT-MAICON-002/acuse')
        .send({ usuario: 'responsable.guardia@maicon.com.ar' })
        .expect(201);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('alertaId', 'ALT-MAICON-002');
      expect(res.body.acuse).toHaveProperty(
        'usuario',
        'responsable.guardia@maicon.com.ar',
      );
      expect(res.body.acuse.fechaHora).toBeTruthy();
    });

    it('GET /api/eca/remito/:alertaId/informe devuelve vista HTML responsiva para visualización en celular', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/eca/remito/ALT-MAICON-001/informe')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('MAICON S.R.L.');
      expect(res.text).toContain('viewport');
      expect(res.text).toContain('Checklist de Seguridad');
    });
  });
});
