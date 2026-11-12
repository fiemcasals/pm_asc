import { INestApplication } from '@nestjs/common';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { createTestApp } from './create-test-app';

/**
 * Abre el canal SSE con una conexión HTTP real y devuelve una promesa que se resuelve con el
 * primer evento `falla-critica` que llegue.
 */
function escucharPrimerFalla(port: number): Promise<{
  conectado: Promise<http.IncomingMessage>;
  evento: Promise<{ event: string; data: unknown }>;
  cerrar: () => void;
}> {
  return new Promise((resolveOuter) => {
    let resolverConexion!: (r: http.IncomingMessage) => void;
    let resolverEvento!: (e: { event: string; data: unknown }) => void;
    let rechazarEvento!: (e: Error) => void;
    const conectado = new Promise<http.IncomingMessage>((r) => (resolverConexion = r));
    const evento = new Promise<{ event: string; data: unknown }>((r, j) => {
      resolverEvento = r;
      rechazarEvento = j;
    });

    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/fallas-criticas/eventos', headers: { Accept: 'text/event-stream' } },
      (res) => {
        resolverConexion(res);
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let corte: number;
          while ((corte = buffer.indexOf('\n\n')) >= 0) {
            const bloque = buffer.slice(0, corte);
            buffer = buffer.slice(corte + 2);
            const lineas = bloque.split('\n');
            const event = lineas.find((l) => l.startsWith('event: '))?.slice(7);
            const data = lineas.find((l) => l.startsWith('data: '))?.slice(6);
            if (event === 'falla-critica' && data) resolverEvento({ event, data: JSON.parse(data) });
          }
        });
      },
    );
    req.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code !== 'ECONNRESET') rechazarEvento(e);
    });
    resolveOuter({ conectado, evento, cerrar: () => req.destroy() });
  });
}

describe('Fallas críticas (e2e)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    ({ app } = await createTestApp(process.env));
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/fallas-criticas/informes con falla crítica emite el evento en tiempo real por SSE', async () => {
    const canal = await escucharPrimerFalla(port);
    try {
      const res = await canal.conectado;
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const inicio = Date.now();
      const alta = await request(app.getHttpServer())
        .post('/api/fallas-criticas/informes')
        .send({
          maquinaId: 'MAQ-CORRIENTES-M1',
          inspector: 'dev-ma-2',
          cablesDesgastados: true,
          limitadorAnulado: false,
          observaciones: 'Deshilachado en 3 torones',
          fotografias: ['https://storage.nuestrocamino.cloud/fotos/cables-maq-101.jpg'],
        })
        .expect(201);

      expect(alta.body.eventoEmitido).toBe(true);
      const recibido = await canal.evento;
      expect(Date.now() - inicio).toBeLessThan(2000);
      expect(recibido.data).toMatchObject({
        tipo: 'falla-critica',
        informeId: alta.body.informe.id,
        maquinaId: 'MAQ-CORRIENTES-M1',
        fallas: ['CABLES_DESGASTADOS'],
        enlaceInforme: alta.body.informe.enlaceInforme,
      });
    } finally {
      canal.cerrar();
    }
  });

  it('el enlace del evento abre el informe en HTML (200) y no registra acuse', async () => {
    const alta = await request(app.getHttpServer())
      .post('/api/fallas-criticas/informes')
      .send({ maquinaId: 'MAQ-CALLAO-M1', inspector: 'dev-ma-2', cablesDesgastados: false, limitadorAnulado: true })
      .expect(201);

    const res = await request(app.getHttpServer()).get(alta.body.informe.enlaceInforme).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Informe de falla crítica');
    expect(res.text).toContain('Limitador de velocidad anulado');
    expect(res.text).toContain('Av. Callao 850, CABA');
  });

  it('informe sin falla crítica: 201 con eventoEmitido=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/fallas-criticas/informes')
      .send({ maquinaId: 'MAQ-CALLAO-M1', inspector: 'dev-ma-2', cablesDesgastados: false, limitadorAnulado: false })
      .expect(201);
    expect(res.body.eventoEmitido).toBe(false);
  });

  it('400 con el detalle de los campos inválidos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/fallas-criticas/informes')
      .send({ maquinaId: 'MAQ-CALLAO-M1' })
      .expect(400);
    expect(res.body.message).toContain('inspector es obligatorio');
  });

  it('404 si la máquina no existe', async () => {
    await request(app.getHttpServer())
      .post('/api/fallas-criticas/informes')
      .send({ maquinaId: 'MAQ-X', inspector: 'dev-ma-2', cablesDesgastados: true, limitadorAnulado: false })
      .expect(404);
  });

  it('404 si el informe no existe', async () => {
    await request(app.getHttpServer()).get('/api/fallas-criticas/informes/INF-nada').expect(404);
  });
});
