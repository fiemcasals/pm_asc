import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CHECKLIST_VERSION } from '../src/checklist/checklist.config';
import { createTestApp } from './create-test-app';

describe('Checklist configurable endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const built = await createTestApp(process.env);
    app = built.app;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/checklist/config devuelve las 5 solapas versionadas para tracción e hidráulico', async () => {
    const traccionRes = await http().get('/api/checklist/config?tipo=traccion');
    expect(traccionRes.status).toBe(200);
    expect(traccionRes.body.version).toBe(CHECKLIST_VERSION);
    expect(traccionRes.body.solapas).toHaveLength(5);

    const hidraulicoRes = await http().get('/api/checklist/config?tipo=hidraulico');
    expect(hidraulicoRes.status).toBe(200);
    const itemIdsH = hidraulicoRes.body.solapas.flatMap((s: any) =>
      s.subgrupos.flatMap((g: any) => g.items.map((i: any) => i.id)),
    );
    expect(itemIdsH).toContain('aceite_batea');
    expect(itemIdsH).not.toContain('cables_traccion');
    expect(itemIdsH).not.toContain('extension_cables');
  });

  it('GET /api/checklist/config?tipo=invalido devuelve 400', async () => {
    const res = await http().get('/api/checklist/config?tipo=vapor');
    expect(res.status).toBe(400);
  });

  it('POST y GET /api/checklist/inspecciones fija la versión del checklist usada', async () => {
    const creada = await http().post('/api/checklist/inspecciones').send({
      consorcioId: '11111111-1111-4111-8111-111111111111',
      maquinaId: '22222222-2222-4222-8222-222222222222',
      referenciaAgc: 'm1',
      tipoMaquina: 'hidraulico',
      estadoEquipo: 'fuera_de_servicio',
      datos: { sala_maquinas: { aceite_batea: 'insuficiente' } },
    });

    expect(creada.status).toBe(201);
    expect(creada.body.versionChecklist).toBe(CHECKLIST_VERSION);
    expect(creada.body.referenciaAgc).toBe('M1');

    const consultada = await http().get(`/api/checklist/inspecciones/${creada.body.id}`);
    expect(consultada.status).toBe(200);
    expect(consultada.body.versionChecklist).toBe(CHECKLIST_VERSION);
    expect(consultada.body.estadoEquipo).toBe('fuera_de_servicio');
  });
});
