import { INestApplication } from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ConsorcioInput } from '../src/consorcios/consorcio.types';
import { InMemoryFirmaRepository } from '../src/firmante/firma.repository';
import { FirmanteService } from '../src/firmante/firmante.service';
import { VisitaInspeccion } from '../src/firmante/firmante.types';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';

/**
 * HU-08 RF-05: las visitas, firmas AGC, rechazos y avisos de plazo del Portal Firmante sobreviven a un reinicio de la API.
 * Reiniciar = cerrar la aplicación y arrancar otra con los MISMOS repositorios (la "base"), sin nada en memoria.
 */
const PASSWORD = 'Clave-Segura-2026';

const ficha = (direccion: string): ConsorcioInput => ({
  nombre: 'Consorcio Persistente',
  direccion,
  administracion: { nombre: 'Admin Test', telefono: null, email: null },
  encargado: { nombre: null, telefono: null },
  pisos: [],
  ubicacion: null,
  maquinas: [{ referenciaAgc: 'M1', descripcion: 'Principal', tipo: 'traccion', salaCompartidaId: null }],
});

const visitaCompleta = (id: string): VisitaInspeccion => ({
  id,
  fecha: '2026-11-04T10:30:00.000Z',
  inspector: 'rt1',
  estado: 'Recorrida',
  fotosObligatorias: { cables: 'https://fotos.test/cables.jpg', frente: 'https://fotos.test/frente.jpg' },
  firmaEncargado: 'data:image/svg+xml;base64,AAAA',
  nombreEncargado: 'Encargado Test',
  autorizada: false,
  fechaAutorizacion: null,
  autorizadoPor: null,
  protocoloAGC: null,
});

describe('Visitas, firmas y avisos del Portal Firmante guardados en la base (HU-08 RF-05)', () => {
  let hash: string;
  let usuarios: InMemoryUsuariosRepository;
  let consorcios: InMemoryConsorciosRepository;
  let firma: InMemoryFirmaRepository;
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcryptjs.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    const lista: [string, Rol][] = [['gonza', 'firmante'], ['lucia', 'firmante'], ['secretaria1', 'secretaria']];
    for (const [usuario, rol] of lista) await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash });
    consorcios = new InMemoryConsorciosRepository();
    firma = new InMemoryFirmaRepository();
    await arrancar();
  });

  afterEach(async () => {
    await app?.close();
  });

  /** Arranca la API (también lo usa «reiniciar»). */
  async function arrancar() {
    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      consorcios,
      undefined,
      { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      firma,
    ));
  }

  /** Reinicio: la API vieja se apaga (sin perder lo que esperaba guardarse) y arranca una nueva sobre la misma base. */
  async function reiniciar() {
    await app.get(FirmanteService).esperarGuardados();
    await app.close();
    await arrancar();
  }

  const token = async (usuario: string) => {
    const res = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken}`;
  };
  // El login va ANTES de armar el pedido: dos pedidos de supertest encadenados se pisan el servidor de prueba.
  const maquinasDe = async (usuario: string) => {
    const auth = await token(usuario);
    return (await http().get('/api/firmante/maquinas').set('Authorization', auth).expect(200)).body as {
      id: string;
      estado: string;
      consorcioId?: string;
      visita: VisitaInspeccion | null;
    }[];
  };
  const unaMaquina = async (usuario: string, id: string) => (await maquinasDe(usuario)).find((m) => m.id === id)!;
  const bandeja = async () => {
    const auth = await token('secretaria1');
    return (await http().get('/api/firmante/bandeja-secretaria').set('Authorization', auth).expect(200)).body as {
      rechazados: { maquinaId: string; motivo: string; rechazadoPor: string; fecha: string }[];
      avisosPlazo: { visitaId: string; fecha: string }[];
    };
  };
  const ponerTerna = async (id: string, firmante: string) => {
    const auth = await token('secretaria1');
    await http()
      .put(`/api/consorcios/${id}/roles`)
      .set('Authorization', auth)
      .send({ rtCalle: { nombre: 'rt1', telefono: '11 5555-0000' }, firmante: { nombre: firmante, telefono: '11 5555-1111' }, eca: { nombre: 'ECA Test', email: 'e@test.com' } })
      .expect(200);
  };

  it('criterio 1: la firma AGC autorizada sigue igual después de reiniciar (fecha, protocolo y quién la autorizó)', async () => {
    const auth = await token('gonza');
    const res = await http().post('/api/firmante/autorizar').set('Authorization', auth).send({ maquinaId: 'MAQ-CORRIENTES-M1' });
    expect(res.status).toBe(200);
    const { fechaAutorizacion, autorizadoPor, protocoloAGC } = res.body.autorizacion;

    await reiniciar();

    const m = await unaMaquina('gonza', 'MAQ-CORRIENTES-M1');
    expect(m.visita).toMatchObject({ autorizada: true, fechaAutorizacion, autorizadoPor: 'gonza', protocoloAGC });
  });

  it('criterio 1: una vez firmada, no se puede firmar de nuevo ni rechazar después del reinicio', async () => {
    const auth = await token('gonza');
    await http().post('/api/firmante/autorizar').set('Authorization', auth).send({ maquinaId: 'MAQ-CORRIENTES-M1' }).expect(200);
    await reiniciar();
    const auth2 = await token('gonza');
    const res = await http().post('/api/firmante/rechazar').set('Authorization', auth2).send({ maquinaId: 'MAQ-CORRIENTES-M1', motivo: 'tarde' });
    expect(res.status).toBe(409);
  });

  it('criterio 2: el rechazo con su motivo sigue en la bandeja de la Secretaría después de reiniciar, y el informe no se puede autorizar', async () => {
    const auth = await token('gonza');
    await http().post('/api/firmante/rechazar').set('Authorization', auth).send({ maquinaId: 'MAQ-SANTAFE-M1', motivo: 'Faltan fotos del foso' }).expect(200);
    const antes = (await bandeja()).rechazados.find((r) => r.maquinaId === 'MAQ-SANTAFE-M1')!;

    await reiniciar();

    const despues = (await bandeja()).rechazados.find((r) => r.maquinaId === 'MAQ-SANTAFE-M1')!;
    expect(despues).toEqual(antes);
    expect(despues).toMatchObject({ motivo: 'Faltan fotos del foso', rechazadoPor: 'gonza' });
    const auth2 = await token('gonza');
    expect((await http().post('/api/firmante/autorizar').set('Authorization', auth2).send({ maquinaId: 'MAQ-SANTAFE-M1' })).status).toBe(409);
  });

  it('criterio 3: el aviso de plazo vencido no se pierde ni se genera de nuevo después de reiniciar', async () => {
    const servicio = app.get(FirmanteService);
    const generados = servicio.generarAvisosDePlazo(new Date('2026-12-01T12:00:00Z'));
    expect(generados.length).toBeGreaterThan(0);

    await reiniciar();

    const otra = app.get(FirmanteService);
    const luego = otra.generarAvisosDePlazo(new Date('2026-12-20T12:00:00Z'));
    expect(luego.map((a) => a.visitaId).sort()).toEqual(generados.map((a) => a.visitaId).sort());
    expect(luego.map((a) => a.fecha).sort()).toEqual(generados.map((a) => a.fecha).sort()); // la fecha del primero, no una nueva
    expect(firma.avisos.size).toBe(generados.length);
  });

  it('criterio 3: aunque la visita haya quedado sin su marca, un aviso ya guardado no se duplica', async () => {
    const servicio = app.get(FirmanteService);
    const generados = servicio.generarAvisosDePlazo(new Date('2026-12-01T12:00:00Z'));
    await servicio.esperarGuardados();
    firma.visitas.clear(); // la visita nunca llegó a guardarse con su marca
    await reiniciar();
    const luego = app.get(FirmanteService).generarAvisosDePlazo(new Date('2026-12-02T12:00:00Z'));
    expect(luego).toHaveLength(generados.length);
  });

  it('una visita registrada para una máquina de un edificio con terna sobrevive al reinicio, y un reinicio no la mezcla con otro mes', async () => {
    const { id } = await consorcios.crear(ficha('Calle Persistente 1, CABA'));
    await ponerTerna(id, 'lucia');
    const maquina = (await maquinasDe('lucia')).find((m) => m.consorcioId === id)!;
    await app.get(FirmanteService).registrarVisita(maquina.id, visitaCompleta('VIS-1'));
    // Una visita de un mes viejo, guardada aparte, no se aplica a la máquina de este mes.
    await firma.guardarVisita({ maquinaId: maquina.id, mes: '2020-01', estado: 'Advertencia', visita: { ...visitaCompleta('VIS-VIEJA'), estado: 'Advertencia' } });

    await reiniciar();

    const despues = await unaMaquina('lucia', maquina.id);
    expect(despues.estado).toBe('Recorrida');
    expect(despues.visita?.id).toBe('VIS-1');
    const auth = await token('lucia');
    const res = await http().post('/api/firmante/autorizar').set('Authorization', auth).send({ maquinaId: maquina.id });
    expect(res.status).toBe(200);
  });

  it('criterio 4: después del reinicio cada Firmante ve y firma solo lo suyo', async () => {
    const { id } = await consorcios.crear(ficha('Calle Persistente 2, CABA'));
    await ponerTerna(id, 'lucia');
    const maquina = (await maquinasDe('lucia')).find((m) => m.consorcioId === id)!;
    await app.get(FirmanteService).registrarVisita(maquina.id, visitaCompleta('VIS-2'));
    await reiniciar();

    expect((await maquinasDe('gonza')).find((m) => m.id === maquina.id)).toBeUndefined();
    const auth = await token('gonza');
    expect((await http().post('/api/firmante/autorizar').set('Authorization', auth).send({ maquinaId: maquina.id })).status).toBe(404);
    expect((await maquinasDe('lucia')).find((m) => m.id === maquina.id)?.visita?.id).toBe('VIS-2');
  });

  it('si la base no responde, la firma NO se da por hecha: responde 500, la visita sigue sin firmar y se puede reintentar', async () => {
    firma.errorAlGuardar = new Error('base caída');
    const auth = await token('gonza');
    const res = await http().post('/api/firmante/autorizar').set('Authorization', auth).send({ maquinaId: 'MAQ-CORRIENTES-M1' });
    expect(res.status).toBe(500);
    expect((await unaMaquina('gonza', 'MAQ-CORRIENTES-M1')).visita).toMatchObject({ autorizada: false, protocoloAGC: null });

    firma.errorAlGuardar = null;
    const auth2 = await token('gonza');
    expect((await http().post('/api/firmante/autorizar').set('Authorization', auth2).send({ maquinaId: 'MAQ-CORRIENTES-M1' })).status).toBe(200);
    await reiniciar();
    expect((await unaMaquina('gonza', 'MAQ-CORRIENTES-M1')).visita?.autorizada).toBe(true);
  });

  it('si la base no responde, el rechazo tampoco se da por hecho', async () => {
    firma.errorAlGuardar = new Error('base caída');
    const auth = await token('gonza');
    const res = await http().post('/api/firmante/rechazar').set('Authorization', auth).send({ maquinaId: 'MAQ-SANTAFE-M1', motivo: 'x' });
    expect(res.status).toBe(500);
    expect((await unaMaquina('gonza', 'MAQ-SANTAFE-M1')).visita?.rechazada).toBeFalsy();
    expect((await bandeja()).rechazados.some((r) => r.maquinaId === 'MAQ-SANTAFE-M1')).toBe(false);
  });

  it('si la base no responde al generar un aviso, la Secretaría igual ve su bandeja y el aviso se vuelve a generar después', async () => {
    firma.errorAlGuardar = new Error('base caída');
    const servicio = app.get(FirmanteService);
    expect(servicio.generarAvisosDePlazo(new Date('2026-12-01T12:00:00Z')).length).toBeGreaterThan(0);
    await servicio.esperarGuardados();
    expect(firma.avisos.size).toBe(0);

    firma.errorAlGuardar = null;
    await reiniciar();
    expect(app.get(FirmanteService).generarAvisosDePlazo(new Date('2026-12-02T12:00:00Z')).length).toBeGreaterThan(0);
    await app.get(FirmanteService).esperarGuardados();
    expect(firma.avisos.size).toBeGreaterThan(0);
  });

  it('registrarVisita en una máquina que no existe responde 404 y no guarda nada', async () => {
    await expect(app.get(FirmanteService).registrarVisita('MAQ-NO-EXISTE', visitaCompleta('VIS-X'))).rejects.toMatchObject({ status: 404 });
    expect(firma.visitas.size).toBe(0);
  });
});
