import {
  calcularEdificio,
  colorDelTramo,
  estadoDelEdificio,
  fechaEnZona,
  formatearFecha,
  ordenarPorUrgencia,
  parsearFecha,
  ultimoDiaDelMes,
} from '../src/semaforo/semaforo.logic';
import { EdificioBase, SemaforoEdificio } from '../src/semaforo/semaforo.types';

const base = (cambios: Partial<EdificioBase> = {}): EdificioBase => ({
  id: 'e1',
  nombre: 'Edificio',
  direccion: 'Calle 1',
  maquinas: 2,
  maquinasInspeccionadas: 0,
  ultimaInspeccion: null,
  rtCalle: null,
  ...cambios,
});

const fecha = (anio: number, mes: number, dia: number) => ({ anio, mes, dia });

describe('colorDelTramo (criterio 2): 1-10 verde, 11-20 amarillo, 21 al último día rojo', () => {
  it.each([
    [1, 'verde'], [5, 'verde'], [10, 'verde'],
    [11, 'amarillo'], [15, 'amarillo'], [20, 'amarillo'],
    [21, 'rojo'], [25, 'rojo'], [28, 'rojo'], [29, 'rojo'], [30, 'rojo'], [31, 'rojo'],
  ])('día %i → %s', (dia, color) => {
    expect(colorDelTramo(dia)).toBe(color);
  });

  it('cubre los 31 días sin huecos: 10 verdes, 10 amarillos y 11 rojos', () => {
    const colores = Array.from({ length: 31 }, (_, i) => colorDelTramo(i + 1));
    expect(colores.filter((c) => c === 'verde')).toHaveLength(10);
    expect(colores.filter((c) => c === 'amarillo')).toHaveLength(10);
    expect(colores.filter((c) => c === 'rojo')).toHaveLength(11);
  });
});

describe('calcularEdificio', () => {
  it('criterio 2: un pendiente es rojo el último día de cualquier mes (28, 29, 30 y 31 días), incluido el 31', () => {
    for (const [anio, mes] of [[2026, 2], [2028, 2], [2026, 11], [2026, 12], [2026, 1]]) {
      const ultimo = ultimoDiaDelMes(anio, mes);
      expect(calcularEdificio(base(), fecha(anio, mes, ultimo))).toMatchObject({ estado: 'pendiente', color: 'rojo' });
      expect(calcularEdificio(base(), fecha(anio, mes, 21)).color).toBe('rojo');
      expect(calcularEdificio(base(), fecha(anio, mes, 20)).color).toBe('amarillo');
    }
    expect([2026, 2028, 2026, 2026].map((a, i) => ultimoDiaDelMes(a, [2, 2, 11, 12][i]))).toEqual([28, 29, 30, 31]);
  });

  it('criterio 1: un edificio inspeccionado en el mes está en verde cualquiera sea el día', () => {
    const inspeccionado = base({ maquinasInspeccionadas: 2, ultimaInspeccion: '2026-11-04T15:00:00.000Z' });
    for (const dia of [1, 10, 11, 20, 21, 30]) {
      expect(calcularEdificio(inspeccionado, fecha(2026, 11, dia))).toMatchObject({ estado: 'inspeccionado', color: 'verde' });
    }
    expect(calcularEdificio(inspeccionado, fecha(2026, 12, 31)).color).toBe('verde');
  });

  it('criterio 3: el 1.º, sin inspecciones del mes, todos son pendientes (aunque el color del tramo sea verde)', () => {
    expect(calcularEdificio(base(), fecha(2026, 12, 1))).toMatchObject({
      estado: 'pendiente',
      color: 'verde',
      diaUltimaInspeccion: null,
    });
  });

  it('criterio 4: devuelve color, día de la última inspección del mes y el RT de Calle asignado', () => {
    const e = calcularEdificio(
      base({
        maquinasInspeccionadas: 1,
        ultimaInspeccion: '2026-11-08T14:30:00.000Z',
        rtCalle: { nombre: 'Ana Pérez', telefono: '11 5555-1111', email: null },
      }),
      fecha(2026, 11, 12),
    );
    expect(e).toMatchObject({
      color: 'amarillo',
      diaUltimaInspeccion: 8,
      rtCalle: { nombre: 'Ana Pérez', telefono: '11 5555-1111', email: null },
    });
  });

  it('el día de la última inspección se cuenta en hora de Buenos Aires, no en UTC', () => {
    // 01:30 UTC del 1 de noviembre = 22:30 del 31 de octubre en Buenos Aires.
    const e = calcularEdificio(base({ maquinasInspeccionadas: 2, ultimaInspeccion: '2026-11-01T01:30:00.000Z' }), fecha(2026, 10, 31));
    expect(e.diaUltimaInspeccion).toBe(31);
  });

  it('un edificio con inspecciones parciales sigue pendiente y conserva el día de la última', () => {
    const e = calcularEdificio(base({ maquinasInspeccionadas: 1, ultimaInspeccion: '2026-11-03T15:00:00.000Z' }), fecha(2026, 11, 22));
    expect(e).toMatchObject({ estado: 'pendiente', color: 'rojo', diaUltimaInspeccion: 3, maquinasInspeccionadas: 1 });
  });
});

describe('estadoDelEdificio', () => {
  it('inspeccionado sólo si tiene máquinas y todas están inspeccionadas', () => {
    expect(estadoDelEdificio({ maquinas: 2, maquinasInspeccionadas: 2 })).toBe('inspeccionado');
    expect(estadoDelEdificio({ maquinas: 2, maquinasInspeccionadas: 1 })).toBe('pendiente');
    expect(estadoDelEdificio({ maquinas: 2, maquinasInspeccionadas: 0 })).toBe('pendiente');
  });

  it('un edificio sin máquinas no se puede inspeccionar: queda pendiente', () => {
    expect(estadoDelEdificio({ maquinas: 0, maquinasInspeccionadas: 0 })).toBe('pendiente');
  });
});

describe('fechaEnZona (hora de Buenos Aires, UTC-3)', () => {
  it('el límite de medianoche local: 02:59 UTC es todavía el día anterior y 03:00 UTC ya es el nuevo', () => {
    expect(fechaEnZona(Date.parse('2026-11-01T02:59:59Z'))).toEqual({ anio: 2026, mes: 10, dia: 31 });
    expect(fechaEnZona(Date.parse('2026-11-01T03:00:00Z'))).toEqual({ anio: 2026, mes: 11, dia: 1 });
  });

  it('cruza el fin de año', () => {
    expect(fechaEnZona(Date.parse('2027-01-01T02:00:00Z'))).toEqual({ anio: 2026, mes: 12, dia: 31 });
  });
});

describe('parsearFecha', () => {
  it('acepta AAAA-MM-DD con un día real, incluido el 29 de febrero de un año bisiesto', () => {
    expect(parsearFecha('2026-11-12')).toEqual({ anio: 2026, mes: 11, dia: 12 });
    expect(parsearFecha('2028-02-29')).toEqual({ anio: 2028, mes: 2, dia: 29 });
    expect(parsearFecha('2026-12-31')).toEqual({ anio: 2026, mes: 12, dia: 31 });
  });

  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-11-00', '2026-1-5', '12/11/2026', '2026-11-12T10:00:00Z', '', ' 2026-11-12', 'hoy', '1999-01-01'])(
    'rechaza "%s"',
    (texto) => {
      expect(parsearFecha(texto)).toBeNull();
    },
  );

  it('formatearFecha es la inversa', () => {
    expect(formatearFecha(fecha(2026, 3, 5))).toBe('2026-03-05');
  });
});

describe('ordenarPorUrgencia', () => {
  const e = (id: string, nombre: string, color: SemaforoEdificio['color']): SemaforoEdificio => ({
    ...calcularEdificio(base({ id, nombre }), fecha(2026, 11, 1)),
    color,
  });

  it('rojos primero, después amarillos y verdes; dentro de cada color, por nombre y por id', () => {
    const orden = ordenarPorUrgencia([e('1', 'Zeta', 'verde'), e('2', 'Beta', 'rojo'), e('3', 'Álamo', 'amarillo'), e('4', 'Alfa', 'rojo'), e('5', 'Alfa', 'rojo')]);
    expect(orden.map((x) => `${x.color}:${x.nombre}:${x.id}`)).toEqual([
      'rojo:Alfa:4', 'rojo:Alfa:5', 'rojo:Beta:2', 'amarillo:Álamo:3', 'verde:Zeta:1',
    ]);
  });

  it('no modifica la lista original', () => {
    const original = [e('1', 'B', 'verde'), e('2', 'A', 'rojo')];
    ordenarPorUrgencia(original);
    expect(original.map((x) => x.id)).toEqual(['1', '2']);
  });
});
