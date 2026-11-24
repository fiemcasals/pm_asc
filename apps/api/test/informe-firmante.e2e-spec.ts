import { INestApplication } from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ConsorcioInput } from '../src/consorcios/consorcio.types';
import { InMemoryFirmaRepository } from '../src/firmante/firma.repository';
import { FirmanteService } from '../src/firmante/firmante.service';
import { InMemoryInformesRepository } from '../src/informes/informes.repository';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';
import { fotosObligatorias } from './fotos-obligatorias';

/**
 * HU-08 RF-07: el informe cerrado por el RT en el celular (HU-18) crea la visita en el Portal Firmante.
 * Cada equipo pasa a ser la visita de su máquina en el mes, con sus fotos obligatorias y la firma del encargado o «Sin firma».
 */
const PASSWORD = 'Clave-Segura-2026';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgGAWjgAIAAAUAAXlFbpoAAAAASUVORK5CYII=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const TRAZO = Array.from({ length: 12 }, (_, i) => [10 + i * 5, 40 + (i % 3) * 8]);

const fichaEdificio = (direccion: string, nombre: string): ConsorcioInput => ({
  nombre,
  direccion,
  administracion: { nombre: 'Administración Test', telefono: '11 4444-5555', email: 'admin@test.com' },
  encargado: { nombre: 'Carlos Rodríguez', telefono: '11 9999-8888' },
  pisos: [],
  ubicacion: null,
  maquinas: [
    { referenciaAgc: 'M1', descripcion: 'Ascensor Principal', tipo: 'traccion', salaCompartidaId: null },
    { referenciaAgc: 'M2', descripcion: 'Ascensor Servicio', tipo: 'hidraulico', salaCompartidaId: null },
  ],
});

describe('Conexión del informe cerrado con el Portal Firmante (HU-08 RF-07)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let consorcios: InMemoryConsorciosRepository;
  let informes: InMemoryInformesRepository;
  let firma: InMemoryFirmaRepository;
  let hash: string;
  let consorcioId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcryptjs.hash(PASSWORD, 4);
  });

  async function arrancar() {
    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      consorcios,
      undefined,
      { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      informes,
      firma,
    ));
  }

  async function reiniciar() {
    await app.get(FirmanteService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  const token = async (usuario: string) => {
    const res = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken}`;
  };

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    const lista: [string, Rol][] = [
      ['secretaria1', 'secretaria'],
      ['firmante1', 'firmante'],
      ['rt_calle1', 'rt_calle'],
    ];
    for (const [usuario, rol] of lista) await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash });
    consorcios = new InMemoryConsorciosRepository();
    informes = new InMemoryInformesRepository();
    firma = new InMemoryFirmaRepository();

    await arrancar();

    // Crear edificio con terna para rt_calle1 y firmante1
    const authSec = await token('secretaria1');
    const alta = await http()
      .post('/api/consorcios')
      .set('Authorization', authSec)
      .send(fichaEdificio('Av. Rivadavia 5000, CABA', 'Consorcio Rivadavia'))
      .expect(201);
    consorcioId = alta.body.id;
    informes.edificios.add(consorcioId);

    await http()
      .put(`/api/consorcios/${consorcioId}/roles`)
      .set('Authorization', authSec)
      .send({
        rtCalle: { nombre: 'rt_calle1', telefono: '11 1111-2222', email: 'rt@maicon.com' },
        firmante: { nombre: 'firmante1', telefono: '11 3333-4444', email: 'firmante@maicon.com' },
        eca: { nombre: 'MAICON SRL', email: 'guardia@maicon.com' },
      })
      .expect(200);
  });

  afterEach(async () => {
    await app?.close();
  });

  const maquinasDe = async (usuario = 'firmante1') => {
    const auth = await token(usuario);
    const res = await http().get('/api/firmante/maquinas').set('Authorization', auth).expect(200);
    return res.body as {
      id: string;
      codigoAGC: string;
      estado: string;
      estadoOperativo?: string;
      consorcioId?: string;
      visita: {
        id: string;
        fecha: string;
        inspector: string;
        estado: string;
        fotosObligatorias?: { frente: string; cables?: string | null };
        firmaEncargado?: string | null;
        nombreEncargado?: string | null;
        autorizada: boolean;
        autorizadoPor?: string | null;
        requiereRevision?: boolean;
      } | null;
    }[];
  };

  it('criterio 1: al cerrar el informe de un edificio con terna, cada máquina aparece como «Recorrida» en el Portal Firmante con fotos y firma', async () => {
    const authRt = await token('rt_calle1');
    const informe = {
      consorcioId,
      horaDispositivo: '2026-11-25T11:00:00.000Z',
      equipos: [
        {
          maquinaId: 'M1',
          referenciaAgc: 'M1',
          tipo: 'traccion',
          estadoEquipo: 'en_uso',
          respuestas: { sala: { freno: 'ok' } },
          observaciones: {},
          fotos: fotosObligatorias('traccion'),
        },
        {
          maquinaId: 'M2',
          referenciaAgc: 'M2',
          tipo: 'hidraulico',
          estadoEquipo: 'en_uso',
          respuestas: { sala: { piston: 'ok' } },
          observaciones: {},
          fotos: fotosObligatorias('hidraulico'),
        },
      ],
      firma: {
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        caracter: 'Encargado',
        dni: '20123456',
        imagen: PNG,
        trazos: [TRAZO],
      },
    };

    await http().post('/api/informes-visita').set('Authorization', authRt).send(informe).expect(201);

    const maquinas = (await maquinasDe('firmante1')).filter((m) => m.consorcioId === consorcioId);
    expect(maquinas.length).toBe(2);

    const m1 = maquinas.find((m) => m.codigoAGC === 'M1')!;
    expect(m1.estado).toBe('Recorrida');
    expect(m1.visita).toBeTruthy();
    expect(m1.visita!.fotosObligatorias?.frente).toBeTruthy();
    expect(m1.visita!.fotosObligatorias?.cables).toBeTruthy();
    expect(m1.visita!.firmaEncargado).toBe(PNG);
    expect(m1.visita!.nombreEncargado).toContain('Carlos Rodríguez');
    expect(m1.visita!.inspector).toBe('rt_calle1');

    const m2 = maquinas.find((m) => m.codigoAGC === 'M2')!;
    expect(m2.estado).toBe('Recorrida');
    expect(m2.visita!.fotosObligatorias?.frente).toBeTruthy();
    expect(m2.visita!.fotosObligatorias?.cables).toBeNull();
    expect(m2.visita!.firmaEncargado).toBe(PNG);
  });

  it('criterio 2: informe cerrado «Sin firma» figura para revisión y no se puede autorizar hasta tener firma', async () => {
    const authRt = await token('rt_calle1');
    const authFirmante = await token('firmante1');
    const informe = {
      consorcioId,
      horaDispositivo: '2026-11-25T11:00:00.000Z',
      equipos: [
        {
          maquinaId: 'M1',
          referenciaAgc: 'M1',
          tipo: 'traccion',
          estadoEquipo: 'en_uso',
          respuestas: {},
          observaciones: {},
          fotos: fotosObligatorias('traccion'),
        },
      ],
      sinFirma: {
        motivo: 'Encargado ausente en el horario convenido',
        foto: JPG,
      },
    };

    await http().post('/api/informes-visita').set('Authorization', authRt).send(informe).expect(201);

    const m1 = (await maquinasDe('firmante1')).find((m) => m.consorcioId === consorcioId && m.codigoAGC === 'M1')!;
    expect(m1.estado).toBe('Recorrida');
    expect(m1.visita!.firmaEncargado).toBeNull();
    expect(m1.visita!.requiereRevision).toBe(true);

    // Intentar autorizar sin firma es rechazado con 400
    const resAuth = await http().post('/api/firmante/autorizar').set('Authorization', authFirmante).send({ maquinaId: m1.id });
    expect(resAuth.status).toBe(400);
    expect(resAuth.body.message).toMatch(/firma del encargado/i);
  });

  it('criterio 3: equipo que quedó fuera de servicio figura como Pendiente de Visita / Fuera de Servicio y no como recorrida', async () => {
    const authRt = await token('rt_calle1');
    const informe = {
      consorcioId,
      horaDispositivo: '2026-11-25T11:00:00.000Z',
      equipos: [
        {
          maquinaId: 'M1',
          referenciaAgc: 'M1',
          tipo: 'traccion',
          estadoEquipo: 'fuera_de_servicio',
          respuestas: {},
          observaciones: {},
          fotos: {},
        },
        {
          maquinaId: 'M2',
          referenciaAgc: 'M2',
          tipo: 'hidraulico',
          estadoEquipo: 'en_uso',
          respuestas: {},
          observaciones: {},
          fotos: fotosObligatorias('hidraulico'),
        },
      ],
      firma: {
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        caracter: 'Encargado',
        dni: '20123456',
        imagen: PNG,
        trazos: [TRAZO],
      },
    };

    await http().post('/api/informes-visita').set('Authorization', authRt).send(informe).expect(201);

    const maquinas = (await maquinasDe('firmante1')).filter((m) => m.consorcioId === consorcioId);
    const m1 = maquinas.find((m) => m.codigoAGC === 'M1')!;
    expect(m1.estado).not.toBe('Recorrida');
    expect(m1.estado).toBe('Pendiente de Visita');
    expect(m1.estadoOperativo).toBe('Fuera de Servicio');

    const m2 = maquinas.find((m) => m.codigoAGC === 'M2')!;
    expect(m2.estado).toBe('Recorrida');
  });

  it('criterio 4: el mismo informe reenviado con el mismo clientReportId no duplica la visita ni pisa una firma ya autorizada', async () => {
    const authRt = await token('rt_calle1');
    const authFirmante = await token('firmante1');
    const clientReportId = 'rep-unico-12345678';
    const informe = {
      consorcioId,
      clientReportId,
      horaDispositivo: '2026-11-25T11:00:00.000Z',
      equipos: [
        {
          maquinaId: 'M1',
          referenciaAgc: 'M1',
          tipo: 'traccion',
          estadoEquipo: 'en_uso',
          respuestas: {},
          observaciones: {},
          fotos: fotosObligatorias('traccion'),
        },
      ],
      firma: {
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        caracter: 'Encargado',
        dni: '20123456',
        imagen: PNG,
        trazos: [TRAZO],
      },
    };

    // 1er envío -> 201
    const primero = await http().post('/api/informes-visita').set('Authorization', authRt).send(informe).expect(201);

    const m1 = (await maquinasDe('firmante1')).find((m) => m.consorcioId === consorcioId && m.codigoAGC === 'M1')!;
    // El firmante autoriza la visita
    await http().post('/api/firmante/autorizar').set('Authorization', authFirmante).send({ maquinaId: m1.id }).expect(200);

    // 2do envío con el mismo clientReportId -> 200 (idempotente)
    const reenvio = await http().post('/api/informes-visita').set('Authorization', authRt).send(informe).expect(200);
    expect(reenvio.body.id).toBe(primero.body.id);

    // La visita sigue autorizada y no fue pisada
    const m1Post = (await maquinasDe('firmante1')).find((m) => m.consorcioId === consorcioId && m.codigoAGC === 'M1')!;
    expect(m1Post.visita!.autorizada).toBe(true);
    expect(m1Post.visita!.autorizadoPor).toBe('firmante1');
  });

  it('criterio 5: una visita creada desde un informe sigue en el Portal Firmante tras reiniciar la API', async () => {
    const authRt = await token('rt_calle1');
    const authFirmante = await token('firmante1');
    const informe = {
      consorcioId,
      horaDispositivo: '2026-11-25T11:00:00.000Z',
      equipos: [
        {
          maquinaId: 'M1',
          referenciaAgc: 'M1',
          tipo: 'traccion',
          estadoEquipo: 'en_uso',
          respuestas: {},
          observaciones: {},
          fotos: fotosObligatorias('traccion'),
        },
      ],
      firma: {
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        caracter: 'Encargado',
        dni: '20123456',
        imagen: PNG,
        trazos: [TRAZO],
      },
    };

    await http().post('/api/informes-visita').set('Authorization', authRt).send(informe).expect(201);

    const m1 = (await maquinasDe('firmante1')).find((m) => m.consorcioId === consorcioId && m.codigoAGC === 'M1')!;
    await http().post('/api/firmante/autorizar').set('Authorization', authFirmante).send({ maquinaId: m1.id }).expect(200);

    // Reiniciar la API
    await reiniciar();

    // La máquina y su visita autorizada siguen existiendo tras el reinicio
    const m1Reinicio = (await maquinasDe('firmante1')).find((m) => m.consorcioId === consorcioId && m.codigoAGC === 'M1')!;
    expect(m1Reinicio).toBeTruthy();
    expect(m1Reinicio.estado).toBe('Recorrida');
    expect(m1Reinicio.visita!.autorizada).toBe(true);
    expect(m1Reinicio.visita!.autorizadoPor).toBe('firmante1');
  });

  const CARGA = process.env.CARGA ? parseInt(process.env.CARGA, 10) : 0;
  if (CARGA > 0) {
    it(`prueba de carga: ${CARGA} recorridos de cierre de informe y consulta en Portal Firmante`, async () => {
      const authRt = await token('rt_calle1');
      const authFirmante = await token('firmante1');
      const tiempos: number[] = [];
      let fallas = 0;

      for (let i = 0; i < CARGA; i++) {
        const t0 = Date.now();
        const informe = {
          clientReportId: `carga-report-${i}-${Date.now()}`,
          consorcioId,
          horaDispositivo: '2026-11-25T11:00:00.000Z',
          equipos: [
            {
              maquinaId: 'M1',
              referenciaAgc: 'M1',
              tipo: 'traccion',
              estadoEquipo: 'en_uso',
              respuestas: {},
              observaciones: {},
              fotos: fotosObligatorias('traccion'),
            },
          ],
          firma: {
            nombre: 'Carlos',
            apellido: 'Rodríguez',
            caracter: 'Encargado',
            dni: '20123456',
            imagen: PNG,
            trazos: [TRAZO],
          },
        };
        const resEnvio = await http().post('/api/informes-visita').set('Authorization', authRt).send(informe);
        if (resEnvio.status !== 201) fallas++;

        const resMaquinas = await http().get('/api/firmante/maquinas').set('Authorization', authFirmante);
        if (resMaquinas.status !== 200) fallas++;

        tiempos.push(Date.now() - t0);
      }

      tiempos.sort((a, b) => a - b);
      const promedio = Math.round(tiempos.reduce((s, v) => s + v, 0) / tiempos.length);
      const p95 = Math.round(tiempos[Math.max(0, Math.ceil(tiempos.length * 0.95) - 1)]);
      const max = Math.round(tiempos[tiempos.length - 1]);

      console.log(`[CARGA ${CARGA}] ${CARGA} recorridos: 0 fallas · promedio ${promedio} ms · p95 ${p95} ms · máx ${max} ms`);
      expect(fallas).toBe(0);
    });
  }
});
