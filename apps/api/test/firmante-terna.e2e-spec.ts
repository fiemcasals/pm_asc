import { INestApplication } from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { AsignacionesFirmanteService } from '../src/firmante/asignaciones-firmante.service';
import { ConsorcioInput } from '../src/consorcios/consorcio.types';
import { ReasignacionPedida, ResultadoReasignacion } from '../src/semaforo/reasignacion.types';
import { InMemoryConsorciosRepository, InMemorySemaforoRepository, createTestApp, fakeDatabase } from './create-test-app';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';

/**
 * HU-02 RF-06: asignar, quitar o reasignar la terna de un edificio actualiza de inmediato la vista de firma
 * (Portal Firmante) y lo que cuelga de las mismas máquinas (Portal ECA, Monitoreo).
 */
const PASSWORD = 'Clave-Segura-2026';

const ficha = (direccion: string, nombre: string): ConsorcioInput => ({
  nombre,
  direccion,
  administracion: { nombre: 'Admin Test', telefono: null, email: null },
  encargado: { nombre: null, telefono: null },
  pisos: [],
  ubicacion: null,
  maquinas: [
    { referenciaAgc: 'M1', descripcion: 'Principal', tipo: 'traccion', salaCompartidaId: null },
    { referenciaAgc: 'M2', descripcion: null, tipo: 'hidraulico', salaCompartidaId: null },
  ],
});

const terna = (rt: string, firmante: string, eca = 'ECA Nueva S.A.', emailFirmante: string | null = null) => ({
  rtCalle: { nombre: rt, telefono: '11 5555-0000' },
  firmante: { nombre: firmante, telefono: '11 5555-1111', ...(emailFirmante ? { email: emailFirmante } : {}) },
  eca: { nombre: eca, email: 'eca@test.com' },
});

/** El Semáforo y la terna comparten base: reasignar un RT cambia también la terna que lee `ConsorciosRepository`. */
class SemaforoCompartido extends InMemorySemaforoRepository {
  constructor(private readonly consorcios: InMemoryConsorciosRepository) {
    super();
  }
  async reasignarRt(pedida: ReasignacionPedida): Promise<ResultadoReasignacion> {
    const res = await super.reasignarRt(pedida);
    const roles = this.consorcios.roles.get(pedida.consorcioId);
    if (res.ok && roles?.rtCalle) roles.rtCalle = { ...roles.rtCalle, nombre: pedida.rtNuevo };
    return res;
  }
}

describe('La terna de la base llega a la vista de firma (HU-02 RF-06)', () => {
  let app: INestApplication;
  let consorcios: InMemoryConsorciosRepository;
  let semaforo: SemaforoCompartido;
  let hash: string;
  let idA: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcryptjs.hash(PASSWORD, 4);
  });

  async function arrancar(antes?: (repo: InMemoryConsorciosRepository) => Promise<void>) {
    const usuarios = new InMemoryUsuariosRepository();
    const lista: [string, Rol][] = [
      ['secretaria1', 'secretaria'],
      ['pablo', 'firmante'],
      ['lucia', 'firmante'],
      ['pablo.ruiz@maicon.test', 'firmante'],
      ['rt-viejo', 'rt_calle'],
      ['rt-nuevo', 'rt_calle'],
    ];
    for (const [usuario, rol] of lista) await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash });
    consorcios = new InMemoryConsorciosRepository();
    semaforo = new SemaforoCompartido(consorcios);
    if (antes) await antes(consorcios);
    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      consorcios,
      new InMemoryVisitasFallidasRepository(),
      { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
      semaforo,
    ));
  }

  const token = async (usuario: string) => {
    const res = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken}`;
  };
  // El login va ANTES de armar el pedido: dos pedidos de supertest encadenados se pisan el servidor de prueba.
  const maquinasDe = async (usuario: string) => {
    const auth = await token(usuario);
    const res = await http().get('/api/firmante/maquinas').set('Authorization', auth).expect(200);
    return res.body as { id: string; codigoAGC: string; rtCalle: string; eca: string; firmanteUsername: string; edificio: { direccion: string }; consorcioId?: string }[];
  };
  const ponerTerna = async (id: string, cuerpo: object) => {
    const auth = await token('secretaria1');
    return http().put(`/api/consorcios/${id}/roles`).set('Authorization', auth).send(cuerpo);
  };
  const crearEdificio = async (direccion = 'Calle Falsa 123, CABA', nombre = 'Consorcio Falso') => {
    const { id } = await consorcios.crear(ficha(direccion, nombre));
    return id;
  };

  afterEach(async () => {
    await app?.close();
  });

  it('criterio 1: el Firmante de la terna ve las máquinas del edificio, y otro Firmante no', async () => {
    await arrancar();
    idA = await crearEdificio();
    expect((await ponerTerna(idA, terna('rt-viejo', 'pablo'))).status).toBe(200);

    const de = await maquinasDe('pablo');
    const suyas = de.filter((m) => m.consorcioId === idA);
    expect(suyas.map((m) => m.codigoAGC).sort()).toEqual(['M1', 'M2']);
    expect(suyas.every((m) => m.rtCalle === 'rt-viejo' && m.eca === 'ECA Nueva S.A.' && m.edificio.direccion === 'Calle Falsa 123, CABA')).toBe(true);
    expect((await maquinasDe('lucia')).filter((m) => m.consorcioId === idA)).toHaveLength(0);
  });

  it('el Firmante también reconoce su máquina por el email de la terna', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'Ing. Pablo Ruiz', 'ECA Nueva S.A.', 'pablo.ruiz@maicon.test'));
    expect((await maquinasDe('pablo.ruiz@maicon.test')).filter((m) => m.consorcioId === idA)).toHaveLength(2);
  });

  it('criterio 2: cambiar el Firmante en la terna se ve en la siguiente consulta', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    expect((await maquinasDe('pablo')).filter((m) => m.consorcioId === idA)).toHaveLength(2);

    expect((await ponerTerna(idA, terna('rt-viejo', 'lucia'))).status).toBe(200);

    expect((await maquinasDe('pablo')).filter((m) => m.consorcioId === idA)).toHaveLength(0);
    expect((await maquinasDe('lucia')).filter((m) => m.consorcioId === idA)).toHaveLength(2);
  });

  it('guardar la misma terna dos veces no duplica las máquinas', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    await ponerTerna(idA, terna('rt-nuevo', 'pablo'));
    const suyas = (await maquinasDe('pablo')).filter((m) => m.consorcioId === idA);
    expect(suyas).toHaveLength(2);
    expect(suyas.every((m) => m.rtCalle === 'rt-nuevo')).toBe(true);
  });

  it('las máquinas de ejemplo se retiran al asignar una terna a un edificio real (HU-08 RF-06)', async () => {
    await arrancar();
    const id = await crearEdificio('Av. Callao 850, CABA', 'Consorcio Callao 850');

    await ponerTerna(id, terna('rt-viejo', 'pablo', 'ECA Nueva S.A.'));

    const todas = await maquinasDe('secretaria1');
    // HU-08 RF-06: la máquina de ejemplo de Callao ya no está (se retiraron los ejemplos) y no duplica
    expect(todas.find((m) => m.id === 'MAQ-CALLAO-M1')).toBeUndefined();
    expect(todas.filter((m) => m.consorcioId === id)).toHaveLength(2);
  });

  it('una máquina dada de baja en el edificio sale de la vista de firma', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    const auth = await token('secretaria1');
    await http().put(`/api/consorcios/${idA}`).set('Authorization', auth).send({ ...ficha('Calle Falsa 123, CABA', 'Consorcio Falso'), maquinas: [ficha('x', 'y').maquinas[0]] }).expect(200);
    const suyas = (await maquinasDe('pablo')).filter((m) => m.consorcioId === idA);
    expect(suyas).toHaveLength(1);
  });

  it('criterio 3: reasignar el RT desde el Semáforo cambia el RT que ven el Firmante y el Monitoreo', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo', 'ECA Nueva S.A.'));
    semaforo.edificios = [
      {
        id: idA,
        nombre: 'Consorcio Falso',
        direccion: 'Calle Falsa 123, CABA',
        maquinas: 2,
        maquinasInspeccionadas: 0,
        ultimaInspeccion: null,
        rtCalle: { nombre: 'rt-viejo', telefono: '11 5555-0000', email: null },
      },
    ];
    semaforo.rtDisponibles = [
      { usuario: 'rt-viejo', nombre: 'rt-viejo' },
      { usuario: 'rt-nuevo', nombre: 'rt-nuevo' },
    ];
    const auth = await token('secretaria1');
    const res = await http()
      .post(`/api/semaforo/${idA}/reasignacion`)
      .set('Authorization', auth)
      .send({ rtAnterior: 'rt-viejo', rtNuevo: 'rt-nuevo' });
    expect(res.status).toBe(201);

    const desdeFirmante = (await maquinasDe('pablo')).filter((m) => m.consorcioId === idA);
    expect(desdeFirmante.every((m) => m.rtCalle === 'rt-nuevo')).toBe(true);

    const authMon = await token('secretaria1');
    const monitoreo = await http().get('/api/backoffice/monitoreo').set('Authorization', authMon);
    expect(monitoreo.status).toBe(200);
    const filas = JSON.stringify(monitoreo.body);
    expect(filas).toContain('rt-nuevo');
    expect(filas).not.toContain('rt-viejo');
  });

  it('criterio 4: quitar la terna o borrar el edificio saca sus máquinas de la vista de firma', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    const auth = await token('secretaria1');
    await http().delete(`/api/consorcios/${idA}/roles`).set('Authorization', auth).expect(204);
    expect((await maquinasDe('pablo')).filter((m) => m.consorcioId === idA)).toHaveLength(0);

    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    expect((await maquinasDe('pablo')).filter((m) => m.consorcioId === idA)).toHaveLength(2);
    const auth2 = await token('secretaria1');
    await http().delete(`/api/consorcios/${idA}`).set('Authorization', auth2).expect(204);
    expect((await maquinasDe('secretaria1')).filter((m) => m.consorcioId === idA)).toHaveLength(0);
  });

  it('editar el edificio actualiza su nombre y dirección en la vista de firma', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    const auth = await token('secretaria1');
    const editado = { ...ficha('Calle Nueva 456, CABA', 'Consorcio Renombrado'), maquinas: ficha('x', 'y').maquinas };
    await http().put(`/api/consorcios/${idA}`).set('Authorization', auth).send(editado).expect(200);
    const suyas = (await maquinasDe('pablo')).filter((m) => m.consorcioId === idA);
    expect(suyas.every((m) => m.edificio.direccion === 'Calle Nueva 456, CABA')).toBe(true);
  });

  it('criterio 5: el Firmante anterior no puede autorizar ni rechazar (404) después del cambio; el nuevo sí encuentra la máquina', async () => {
    await arrancar();
    idA = await crearEdificio();
    await ponerTerna(idA, terna('rt-viejo', 'pablo'));
    const maquinaId = (await maquinasDe('pablo')).find((m) => m.consorcioId === idA)!.id;
    await ponerTerna(idA, terna('rt-viejo', 'lucia'));

    const authPablo = await token('pablo');
    expect((await http().post('/api/firmante/autorizar').set('Authorization', authPablo).send({ maquinaId })).status).toBe(404);
    const authPablo2 = await token('pablo');
    expect((await http().post('/api/firmante/rechazar').set('Authorization', authPablo2).send({ maquinaId, motivo: 'x' })).status).toBe(404);
    // Lucía sí la encuentra: la máquina no tiene visita, así que el rechazo es otro error (no un 404 de "no existe").
    const authLucia = await token('lucia');
    const res = await http().post('/api/firmante/autorizar').set('Authorization', authLucia).send({ maquinaId });
    expect(res.status).not.toBe(404);
  });

  it('criterio 6: al arrancar la API, los edificios con terna salen de la base', async () => {
    await arrancar(async (repo) => {
      const { id } = await repo.crear(ficha('Calle Arranque 9, CABA', 'Consorcio Arranque'));
      idA = id;
      await repo.asignarRoles(id, {
        rtCalle: { nombre: 'rt-viejo', telefono: '11 5555-0000', email: null },
        firmante: { nombre: 'pablo', telefono: '11 5555-1111', email: null },
        eca: { nombre: 'ECA Nueva S.A.', telefono: null, email: 'eca@test.com' },
      });
    });
    const suyas = (await maquinasDe('pablo')).filter((m) => m.consorcioId === idA);
    expect(suyas).toHaveLength(2);
  });

  it('si sincronizar falla no rompe el guardado de la terna', async () => {
    await arrancar();
    idA = await crearEdificio();
    const servicio = app.get(AsignacionesFirmanteService);
    jest.spyOn(consorcios, 'obtener').mockRejectedValueOnce(new Error('base caída'));
    await expect(servicio.sincronizarEdificio(idA)).resolves.toBeUndefined();
  });
});
