import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';

// HU-06 RF-03 por HTTP: la lista de fallas críticas del cliente.
const TRACCION = 'MAQ-CORRIENTES-M1';
const HIDRAULICA = 'MAQ-CORRIENTES-M2';

describe('Lista de fallas críticas del cliente por HTTP (HU-06 RF-03)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    ({ app } = await createTestApp({ NODE_ENV: 'development' }));
  });
  afterEach(async () => {
    await app?.close();
  });

  const informe = (maquinaId: string, fallasCriticas: string[]) =>
    request(app.getHttpServer()).post('/api/fallas-criticas/informes').send({ maquinaId, inspector: 'dev-ma-2', fallasCriticas });

  it('criterio 1 y 4: una falla de la lista genera la alerta, con nombre legible y zona, en la lista de eventos de la Secretaría', async () => {
    const res = await informe(TRACCION, ['PARACAIDAS_ANOMALIA', 'STOP_FOSA_DEFICIENTE_INEXISTENTE']);

    expect(res.status).toBe(201);
    expect(res.body.eventoEmitido).toBe(true);
    const lista = await request(app.getHttpServer()).get('/api/fallas-criticas/informes');
    expect(lista.body[0].fallasDetalle).toEqual([
      { codigo: 'PARACAIDAS_ANOMALIA', nombre: 'Paracaídas: Anomalía', zonaId: 'cabina', zona: 'Cabina' },
      { codigo: 'STOP_FOSA_DEFICIENTE_INEXISTENTE', nombre: 'Stop de fosa: DEFICIENTE / INEXISTENTE', zonaId: 'fosa', zona: 'Fosa' },
    ]);
  });

  it('criterio 2: lo que el cliente sacó (por ejemplo el tablero fuera de norma) se registra como falla común y no genera alerta', async () => {
    const res = await informe(TRACCION, ['TABLERO_FUERA_DE_NORMA']);

    expect(res.status).toBe(201);
    expect(res.body.eventoEmitido).toBe(false);
    expect(res.body.informe.fallasComunes).toEqual(['TABLERO_FUERA_DE_NORMA']);
    expect((await request(app.getHttpServer()).get('/api/fallas-criticas/informes')).body).toEqual([]);
  });

  it('criterio 3: el aceite de batea insuficiente en una máquina de tracción responde 400 con el motivo; en la hidráulica, 201', async () => {
    const tracc = await informe(TRACCION, ['ACEITE_BATEA_INSUFICIENTE']);

    expect(tracc.status).toBe(400);
    expect(JSON.stringify(tracc.body)).toContain('Aceite de batea');
    expect(JSON.stringify(tracc.body)).toContain('sólo aplica a máquinas hidraulico');
    expect((await informe(HIDRAULICA, ['ACEITE_BATEA_INSUFICIENTE'])).status).toBe(201);
  });
});
