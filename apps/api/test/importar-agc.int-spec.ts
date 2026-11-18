import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config';
import { loadEnvFileInto } from '../src/env-file';
import { asegurarUsuarioPrueba } from './test-auth-helper';

loadEnvFileInto(process.env);

async function crearBufferXlsx(filas: Array<[string, string, string, string]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('AGC');
  ws.addRow(['Dirección', 'Matrícula AGC', 'Tipo de equipo', 'Estado']);
  for (const fila of filas) {
    ws.addRow(fila);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('HU-01 RF-03 · Integración PostgreSQL del importador Excel AGC', () => {
  const config = loadConfig();
  const prefijo = `INTAGC${Date.now()}`;
  let pool: Pool;
  let app: INestApplication;
  let tokenSecretaria = '';
  const consorciosCreadosIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    app = await NestFactory.create(AppModule.register(config), { logger: false });
    configureApp(app, config);
    await app.init();

    const sec = await asegurarUsuarioPrueba(pool, config, {
      usuario: `${prefijo}-sec`,
      rol: 'secretaria',
    });
    tokenSecretaria = sec.token;
  });

  afterAll(async () => {
    for (const id of consorciosCreadosIds) {
      await pool.query('DELETE FROM consorcios WHERE id = $1', [id]).catch(() => undefined);
    }
    await pool.query('DELETE FROM usuarios WHERE usuario = $1', [`${prefijo}-sec`]).catch(() => undefined);
    await app.close();
    await pool.end();
  });

  it('persiste altas, actualiza existentes por matrícula AGC sin duplicar y guarda estado_agc en PostgreSQL real con RLS', async () => {
    const dir1 = `Calle Prueba AGC ${prefijo} 100`;
    const mat1 = `${prefijo}-M1`;
    const mat2 = `${prefijo}-M2`;

    const buf1 = await crearBufferXlsx([
      [dir1, mat1, 'traccion', 'APTO'],
      [dir1, mat2, 'hidraulico', 'OBSERVADO'],
      ['', `${prefijo}-ERR`, 'traccion', 'APTO'],
    ]);

    const res1 = await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${tokenSecretaria}`)
      .attach('archivo', buf1, 'padron-1.xlsx')
      .expect(200);

    for (const d of res1.body.detalle as Array<{ consorcioId: string }>) {
      if (!consorciosCreadosIds.includes(d.consorcioId)) consorciosCreadosIds.push(d.consorcioId);
    }

    expect(res1.body.creadas).toBe(2);
    expect(res1.body.actualizadas).toBe(0);
    expect(res1.body.rechazadas).toBe(1);
    expect(res1.body.errores[0].fila).toBe(4);

    // Segunda corrida: actualiza mat2 sin duplicar
    const buf2 = await crearBufferXlsx([
      [dir1, mat2, 'montavehiculos', 'APTO'],
    ]);

    const res2 = await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${tokenSecretaria}`)
      .attach('archivo', buf2, 'padron-2.xlsx')
      .expect(200);

    expect(res2.body.creadas).toBe(0);
    expect(res2.body.actualizadas).toBe(1);
    expect(res2.body.rechazadas).toBe(0);

    const dbRows = await pool.query<{ referencia_agc: string; tipo: string; estado_agc: string | null }>(
      `SELECT referencia_agc, tipo, estado_agc
         FROM maquinas
        WHERE consorcio_id = $1
        ORDER BY referencia_agc`,
      [consorciosCreadosIds[0]],
    );
    expect(dbRows.rowCount).toBe(2);
    const m2 = dbRows.rows.find((r) => r.referencia_agc === mat2)!;
    expect(m2.tipo).toBe('montavehiculos');
    expect(m2.estado_agc).toBe('APTO');
  });
});
