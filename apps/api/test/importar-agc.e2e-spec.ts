import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { MAX_BYTES_EXCEL_AGC } from '../src/consorcios/importador-agc.types';
import { createTestApp, InMemoryConsorciosRepository } from './create-test-app';
import { crearSesiones, NombreSesion } from './sesiones-e2e';

const BASE_ENV = {
  AUTH_JWT_SECRET: 'secreto-e2e-importador-agc-123456',
};

async function construirXlsx(filas: Array<Record<string, unknown>>, encabezados?: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Padron AGC');
  const cols = encabezados ?? ['Dirección', 'Matrícula AGC', 'Tipo de equipo', 'Estado', 'Nombre Edificio', 'Descripción'];
  ws.addRow(cols);
  for (const fila of filas) {
    ws.addRow(cols.map((c) => fila[c] ?? ''));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe('HU-01 RF-03 · Importar listado Excel de la AGC (.xlsx)', () => {
  let app: INestApplication;
  let consorciosRepo: InMemoryConsorciosRepository;
  let sesiones: Record<NombreSesion, string>;

  beforeEach(async () => {
    consorciosRepo = new InMemoryConsorciosRepository();
    const usuarios = new InMemoryUsuariosRepository();
    const res = await createTestApp(BASE_ENV, undefined, consorciosRepo, undefined, { usuarios });
    app = res.app;
    sesiones = await crearSesiones(app, usuarios);
  });

  afterEach(async () => {
    await app.close();
  });

  it('Criterio 1 y 3: crea máquinas nuevas y al re-importar actualiza las existentes por matrícula AGC sin duplicarlas', async () => {
    const excel1 = await construirXlsx([
      {
        'Dirección': 'Av. Corrientes 1234',
        'Matrícula AGC': 'AGC-1001',
        'Tipo de equipo': 'traccion',
        'Estado': 'APTO',
        'Nombre Edificio': 'Consorcio Corrientes 1234',
        'Descripción': 'Ascensor Principal',
      },
      {
        'Dirección': 'Av. Corrientes 1234',
        'Matrícula AGC': 'AGC-1002',
        'Tipo de equipo': 'hidraulico',
        'Estado': 'OBSERVADO',
        'Nombre Edificio': 'Consorcio Corrientes 1234',
        'Descripción': 'Montavehículos',
      },
    ]);

    const res1 = await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .attach('archivo', excel1, 'padron-agc.xlsx')
      .expect(200);

    expect(res1.body.creadas).toBe(2);
    expect(res1.body.actualizadas).toBe(0);
    expect(res1.body.rechazadas).toBe(0);
    expect(res1.body.consorciosCreados).toBe(1);
    expect(res1.body.resumen).toEqual({
      totalFilas: 2,
      creadas: 2,
      actualizadas: 0,
      rechazadas: 0,
      consorciosCreados: 1,
    });

    // Segunda carga: actualiza AGC-1002 (cambia estado y tipo) y crea AGC-1003 en edificio nuevo.
    const excel2 = await construirXlsx([
      {
        'Dirección': 'Av. Corrientes 1234',
        'Matrícula AGC': 'agc-1002',
        'Tipo de equipo': 'montavehiculos',
        'Estado': 'APTO',
      },
      {
        'Dirección': 'Av. Santa Fe 3200',
        'Matrícula AGC': 'AGC-1003',
        'Tipo de equipo': 'Tracción',
        'Estado': 'NO APTO',
      },
    ]);

    const res2 = await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .attach('archivo', excel2, 'padron-agc-v2.xlsx')
      .expect(200);

    expect(res2.body.creadas).toBe(1);
    expect(res2.body.actualizadas).toBe(1);
    expect(res2.body.rechazadas).toBe(0);
    expect(res2.body.consorciosCreados).toBe(1);

    // Verificar que no haya duplicados: 2 consorcios, 3 máquinas en total.
    const edificios = [...consorciosRepo.filas.values()];
    expect(edificios).toHaveLength(2);
    const totalMaquinas = edificios.reduce((acc, c) => acc + c.maquinas.length, 0);
    expect(totalMaquinas).toBe(3);

    const corrientes = edificios.find((c) => c.direccion === 'Av. Corrientes 1234')!;
    expect(corrientes.maquinas).toHaveLength(2);
    const m2 = corrientes.maquinas.find((m) => m.referenciaAgc.toUpperCase() === 'AGC-1002')!;
    expect(m2.tipo).toBe('montavehiculos');
    expect(m2.estadoAgc).toBe('APTO');
  });

  it('Criterio 2 y 3: informa fila y motivo de cada registro inválido sin impedir importar los válidos', async () => {
    const excelMixto = await construirXlsx([
      { 'Dirección': 'Av. Belgrano 500', 'Matrícula AGC': 'AGC-2001', 'Tipo de equipo': 'traccion', 'Estado': 'APTO' }, // fila 2 OK
      { 'Dirección': '', 'Matrícula AGC': 'AGC-2002', 'Tipo de equipo': 'traccion', 'Estado': 'APTO' }, // fila 3 sin dirección
      { 'Dirección': 'Av. Belgrano 500', 'Matrícula AGC': 'AGC-2003', 'Tipo de equipo': 'cohete', 'Estado': 'APTO' }, // fila 4 tipo inválido
      { 'Dirección': 'Av. Belgrano 500', 'Matrícula AGC': 'AGC-2004', 'Tipo de equipo': 'hidraulico', 'Estado': 'DESCONOCIDO' }, // fila 5 estado inválido
      { 'Dirección': 'Av. Belgrano 500', 'Matrícula AGC': 'AGC-2001', 'Tipo de equipo': 'traccion', 'Estado': 'APTO' }, // fila 6 matrícula duplicada en archivo
      { 'Dirección': 'Av. Rivadavia 1800', 'Matrícula AGC': 'AGC-2005', 'Tipo de equipo': 'hidraulico', 'Estado': 'FUERA DE SERVICIO' }, // fila 7 OK
    ]);

    const res = await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .attach('archivo', excelMixto, 'mixto.xlsx')
      .expect(200);

    expect(res.body.creadas).toBe(2);
    expect(res.body.actualizadas).toBe(0);
    expect(res.body.rechazadas).toBe(4);
    expect(res.body.errores).toHaveLength(4);
    expect(res.body.errores[0]).toMatchObject({ fila: 3, matriculaAgc: 'AGC-2002' });
    expect(res.body.errores[0].motivo).toContain('dirección');
    expect(res.body.errores[1]).toMatchObject({ fila: 4, matriculaAgc: 'AGC-2003' });
    expect(res.body.errores[1].motivo).toContain('Tipo de equipo inválido');
    expect(res.body.errores[2]).toMatchObject({ fila: 5, matriculaAgc: 'AGC-2004' });
    expect(res.body.errores[2].motivo).toContain('Estado AGC inválido');
    expect(res.body.errores[3]).toMatchObject({ fila: 6, matriculaAgc: 'AGC-2001' });
    expect(res.body.errores[3].motivo).toContain('duplicada');

    // Las 2 filas válidas sí se importaron
    const totalMaquinas = [...consorciosRepo.filas.values()].reduce((acc, c) => acc + c.maquinas.length, 0);
    expect(totalMaquinas).toBe(2);
  });

  it('Criterio 4: rechaza con 400 archivos que no son .xlsx (CSV, TXT, falso .xlsx) sin importar nada', async () => {
    const csv = Buffer.from('Direccion,Matricula AGC,Tipo de equipo,Estado\nAv. Mayo 100,AGC-9,traccion,APTO\n');

    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .attach('archivo', csv, 'padron.csv')
      .expect(400);

    // Archivo de texto renombrado a .xlsx (no tiene cabecera PK\x03\x04)
    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .attach('archivo', csv, 'falso.xlsx')
      .expect(400);

    // Sin archivo
    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .expect(400);

    expect(consorciosRepo.filas.size).toBe(0);
  });

  it('Criterio 4: rechaza con 400 un archivo que supera los 5 MB sin importar nada', async () => {
    const grande = Buffer.alloc(MAX_BYTES_EXCEL_AGC + 1024, 0x41);
    grande[0] = 0x50;
    grande[1] = 0x4b;
    grande[2] = 0x03;
    grande[3] = 0x04;

    const res = await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .attach('archivo', grande, 'gigante.xlsx')
      .expect(400);

    expect(res.body.message).toContain('5 MB');
    expect(consorciosRepo.filas.size).toBe(0);
  });

  it('Seguridad y plantilla: exige rol secretaria/administrador y entrega plantilla .xlsx válida', async () => {
    const excel = await construirXlsx([
      { 'Dirección': 'Av. Callao 400', 'Matrícula AGC': 'AGC-3001', 'Tipo de equipo': 'traccion', 'Estado': 'APTO' },
    ]);

    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .attach('archivo', excel, 'padron.xlsx')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.rt_calle}`)
      .attach('archivo', excel, 'padron.xlsx')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.ecaMaicon}`)
      .attach('archivo', excel, 'padron.xlsx')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/consorcios/importar-agc')
      .set('Authorization', `Bearer ${sesiones.administrador}`)
      .attach('archivo', excel, 'padron.xlsx')
      .expect(200);

    const plantilla = await request(app.getHttpServer())
      .get('/api/consorcios/importar-agc/plantilla')
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(plantilla.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(Buffer.isBuffer(plantilla.body)).toBe(true);
    expect((plantilla.body as Buffer).subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });
});
