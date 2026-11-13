import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EdificioBase } from '../src/semaforo/semaforo.types';
import { InMemorySemaforoRepository, createTestApp, fakeDatabase } from './create-test-app';
import { InMemoryConsorciosRepository } from './create-test-app';
import { InMemoryVisitasFallidasRepository } from '../src/visitas-fallidas/visitas-fallidas.repository';

const edificio = (cambios: Partial<EdificioBase> = {}): EdificioBase => ({
  id: 'e1',
  nombre: 'Edificio Uno',
  direccion: 'Calle 1',
  maquinas: 2,
  maquinasInspeccionadas: 0,
  ultimaInspeccion: null,
  rtCalle: null,
  ...cambios,
});

describe('GET /api/semaforo (HU-04 RF-01)', () => {
  let app: INestApplication;
  let repo: InMemorySemaforoRepository;

  /** Arranca la API con el reloj clavado en `ahoraIso` (por defecto, el 12 de noviembre de 2026 a las 12:00 en Buenos Aires). */
  async function arrancar(ahoraIso = '2026-11-12T15:00:00Z') {
    repo = new InMemorySemaforoRepository();
    ({ app } = await createTestApp(
      { NODE_ENV: 'development' },
      fakeDatabase(),
      new InMemoryConsorciosRepository(),
      new InMemoryVisitasFallidasRepository(),
      { reloj: { ahora: () => Date.parse(ahoraIso) } },
      repo,
    ));
    return request(app.getHttpServer());
  }

  afterEach(async () => {
    await app?.close();
  });

  it('criterio 4: devuelve por edificio su color, el día de la última inspección del mes y el RT de Calle asignado', async () => {
    const http = await arrancar();
    repo.edificios = [
      edificio({
        id: 'b',
        nombre: 'Con RT',
        maquinasInspeccionadas: 1,
        ultimaInspeccion: '2026-11-08T14:30:00.000Z',
        rtCalle: { nombre: 'Ana Pérez', telefono: '11 5555-1111', email: 'ana@rt.com' },
      }),
    ];

    const res = await http.get('/api/semaforo');

    expect(res.status).toBe(200);
    expect(res.body.edificios).toEqual([
      {
        id: 'b',
        nombre: 'Con RT',
        direccion: 'Calle 1',
        color: 'amarillo',
        estado: 'pendiente',
        maquinas: 2,
        maquinasInspeccionadas: 1,
        diaUltimaInspeccion: 8,
        rtCalle: { nombre: 'Ana Pérez', telefono: '11 5555-1111', email: 'ana@rt.com' },
      },
    ]);
  });

  it('sin fecha usa el día de hoy según el reloj, y informa fecha, mes y tramo del día', async () => {
    const http = await arrancar('2026-11-12T15:00:00Z');

    const res = await http.get('/api/semaforo');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fecha: '2026-11-12', mes: '2026-11', tramoDelDia: 'amarillo' });
    expect(repo.fechasConsultadas).toEqual([{ anio: 2026, mes: 11, dia: 12 }]);
  });

  it('"hoy" es el de Buenos Aires: 02:30 UTC del 1 de diciembre todavía es el 30 de noviembre (rojo)', async () => {
    const http = await arrancar('2026-12-01T02:30:00Z');
    repo.edificios = [edificio()];

    const res = await http.get('/api/semaforo');

    expect(res.body).toMatchObject({ fecha: '2026-11-30', mes: '2026-11', tramoDelDia: 'rojo' });
    expect(res.body.edificios[0].color).toBe('rojo');
  });

  describe('?fecha=AAAA-MM-DD calcula el semáforo a ese día', () => {
    it.each([
      ['2026-11-01', 'verde'], ['2026-11-10', 'verde'],
      ['2026-11-11', 'amarillo'], ['2026-11-20', 'amarillo'],
      ['2026-11-21', 'rojo'], ['2026-11-30', 'rojo'],
      ['2026-12-31', 'rojo'], ['2026-02-28', 'rojo'], ['2028-02-29', 'rojo'],
    ])('un edificio pendiente el %s es %s (criterio 2)', async (fecha, color) => {
      const http = await arrancar();
      repo.edificios = [edificio()];

      const res = await http.get('/api/semaforo').query({ fecha });

      expect(res.status).toBe(200);
      expect(res.body.fecha).toBe(fecha);
      expect(res.body.edificios[0]).toMatchObject({ estado: 'pendiente', color });
      expect(repo.fechasConsultadas).toHaveLength(1);
    });

    it('un edificio inspeccionado es verde aunque sea el día 31 (criterio 1)', async () => {
      const http = await arrancar();
      repo.edificios = [edificio({ maquinasInspeccionadas: 2, ultimaInspeccion: '2026-12-02T15:00:00Z' })];

      const res = await http.get('/api/semaforo').query({ fecha: '2026-12-31' });

      expect(res.body.edificios[0]).toMatchObject({ estado: 'inspeccionado', color: 'verde' });
    });

    it('el 1.º del mes pasa a la base la fecha del día 1, así las inspecciones del mes anterior no cuentan (criterio 3)', async () => {
      const http = await arrancar();
      repo.edificios = [edificio()];

      const res = await http.get('/api/semaforo').query({ fecha: '2026-12-01' });

      expect(repo.fechasConsultadas).toEqual([{ anio: 2026, mes: 12, dia: 1 }]);
      expect(res.body.edificios[0]).toMatchObject({ estado: 'pendiente', color: 'verde', diaUltimaInspeccion: null });
    });
  });

  it.each([
    ['con un día inexistente', '2026-02-30'],
    ['con mes 13', '2026-13-01'],
    ['sin ceros', '2026-1-5'],
    ['en otro formato', '12/11/2026'],
    ['con hora', '2026-11-12T10:00:00Z'],
    ['vacía', ''],
    ['con texto', 'hoy'],
  ])('rechaza con 400 una fecha %s, sin consultar la base', async (_caso, fecha) => {
    const http = await arrancar();

    const res = await http.get('/api/semaforo').query({ fecha });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos');
    expect(res.body.errores).toHaveLength(1);
    expect(repo.fechasConsultadas).toHaveLength(0);
  });

  it('rechaza con 400 la fecha repetida (?fecha=a&fecha=b)', async () => {
    const http = await arrancar();

    const res = await http.get('/api/semaforo?fecha=2026-11-12&fecha=2026-11-13');

    expect(res.status).toBe(400);
    expect(repo.fechasConsultadas).toHaveLength(0);
  });

  it('ordena rojos, amarillos y verdes, y cuenta los totales por color', async () => {
    const http = await arrancar();
    repo.edificios = [
      edificio({ id: '1', nombre: 'Verde ya hecho', maquinasInspeccionadas: 2, ultimaInspeccion: '2026-11-02T15:00:00Z' }),
      edificio({ id: '2', nombre: 'Pendiente B' }),
      edificio({ id: '3', nombre: 'Pendiente A' }),
    ];

    const res = await http.get('/api/semaforo').query({ fecha: '2026-11-25' });

    expect(res.body.totales).toEqual({ verde: 1, amarillo: 0, rojo: 2 });
    expect(res.body.edificios.map((e: { nombre: string }) => e.nombre)).toEqual(['Pendiente A', 'Pendiente B', 'Verde ya hecho']);
  });

  it('sin edificios devuelve la lista vacía y los totales en cero', async () => {
    const http = await arrancar();

    const res = await http.get('/api/semaforo');

    expect(res.status).toBe(200);
    expect(res.body.edificios).toEqual([]);
    expect(res.body.totales).toEqual({ verde: 0, amarillo: 0, rojo: 0 });
  });
});
