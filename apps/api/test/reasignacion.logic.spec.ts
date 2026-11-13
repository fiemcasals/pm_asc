import { candidatosConCarga, contarPendientes, esElRt, sugerirRt } from '../src/semaforo/reasignacion.logic';
import { RtDisponible } from '../src/semaforo/reasignacion.types';
import { SemaforoEdificio } from '../src/semaforo/semaforo.types';

const edificio = (
  id: string,
  rt: string | null,
  estado: 'pendiente' | 'inspeccionado' = 'pendiente',
  email: string | null = null,
): SemaforoEdificio => ({
  id,
  nombre: `Edificio ${id}`,
  direccion: 'Calle 1',
  color: estado === 'inspeccionado' ? 'verde' : 'rojo',
  estado,
  maquinas: 1,
  maquinasInspeccionadas: estado === 'inspeccionado' ? 1 : 0,
  diaUltimaInspeccion: null,
  rtCalle: rt === null ? null : { nombre: rt, telefono: null, email },
});

const rts = (...usuarios: string[]): RtDisponible[] => usuarios.map((u) => ({ usuario: u, nombre: `RT ${u}` }));

describe('esElRt: la misma regla que el RLS (nombre o email igual al usuario, comparación exacta)', () => {
  it('coincide por nombre o por email', () => {
    expect(esElRt({ nombre: 'ana', telefono: null, email: null }, 'ana')).toBe(true);
    expect(esElRt({ nombre: 'Ana Pérez', telefono: null, email: 'ana' }, 'ana')).toBe(true);
  });

  it('no distingue por aproximación: otra capitalización o un prefijo no coinciden', () => {
    expect(esElRt({ nombre: 'Ana', telefono: null, email: null }, 'ana')).toBe(false);
    expect(esElRt({ nombre: 'ana.perez', telefono: null, email: null }, 'ana')).toBe(false);
  });

  it('un edificio sin RT no es de nadie', () => {
    expect(esElRt(null, 'ana')).toBe(false);
  });
});

describe('contarPendientes', () => {
  it('cuenta sólo los edificios del RT que siguen pendientes; los inspeccionados no suman', () => {
    const e = [edificio('1', 'ana'), edificio('2', 'ana'), edificio('3', 'ana', 'inspeccionado'), edificio('4', 'beto')];
    expect(contarPendientes(e, 'ana')).toBe(2);
    expect(contarPendientes(e, 'beto')).toBe(1);
  });

  it('un RT sin edificios tiene 0', () => {
    expect(contarPendientes([edificio('1', 'ana')], 'carla')).toBe(0);
  });

  it('cuenta también por email de la terna', () => {
    expect(contarPendientes([edificio('1', 'Ana Pérez', 'pendiente', 'ana')], 'ana')).toBe(1);
  });
});

describe('sugerirRt (criterio 3): el RT de Calle con menos edificios pendientes del mes', () => {
  it('sugiere al de menos pendientes y ordena a los demás del menos al más cargado', () => {
    const e = [
      edificio('rojo', 'ana'),
      edificio('b1', 'beto'), edificio('b2', 'beto'), edificio('b3', 'beto'),
      edificio('d1', 'diego'),
    ];

    const { sugerido, candidatos } = sugerirRt(rts('ana', 'beto', 'carla', 'diego'), e, e[0].rtCalle);

    expect(sugerido).toEqual({ usuario: 'carla', nombre: 'RT carla', pendientes: 0 });
    expect(candidatos.map((c) => `${c.usuario}:${c.pendientes}`)).toEqual(['carla:0', 'diego:1', 'beto:3']);
  });

  it('nunca sugiere al RT actual, aunque sea el menos cargado', () => {
    const e = [edificio('rojo', 'ana'), edificio('b1', 'beto'), edificio('b2', 'beto')];

    const { sugerido, candidatos } = sugerirRt(rts('ana', 'beto'), e, e[0].rtCalle);

    expect(sugerido?.usuario).toBe('beto');
    expect(candidatos.map((c) => c.usuario)).toEqual(['beto']);
  });

  it('los edificios ya inspeccionados no cuentan como carga: 5 edificios con 4 inspeccionados pesan 1', () => {
    const e = [
      edificio('rojo', 'ana'),
      edificio('b1', 'beto'), edificio('b2', 'beto', 'inspeccionado'), edificio('b3', 'beto', 'inspeccionado'),
      edificio('b4', 'beto', 'inspeccionado'), edificio('b5', 'beto', 'inspeccionado'),
      edificio('c1', 'carla'), edificio('c2', 'carla'),
    ];

    const { sugerido, candidatos } = sugerirRt(rts('ana', 'beto', 'carla'), e, e[0].rtCalle);

    expect(sugerido).toMatchObject({ usuario: 'beto', pendientes: 1 });
    expect(candidatos.map((c) => `${c.usuario}:${c.pendientes}`)).toEqual(['beto:1', 'carla:2']);
  });

  it('a igual carga desempata por nombre de usuario, siempre igual', () => {
    const e = [edificio('rojo', 'ana'), edificio('c1', 'carla'), edificio('b1', 'beto')];

    const r1 = sugerirRt(rts('ana', 'carla', 'beto'), e, e[0].rtCalle);
    const r2 = sugerirRt(rts('beto', 'carla', 'ana'), e, e[0].rtCalle);

    expect(r1.sugerido?.usuario).toBe('beto');
    expect(r2.sugerido?.usuario).toBe('beto');
  });

  it('si no hay a quién reasignar (el actual es el único RT) no sugiere a nadie', () => {
    const e = [edificio('rojo', 'ana')];
    expect(sugerirRt(rts('ana'), e, e[0].rtCalle)).toEqual({ sugerido: null, candidatos: [] });
    expect(sugerirRt([], e, e[0].rtCalle)).toEqual({ sugerido: null, candidatos: [] });
  });

  it('un edificio sin RT actual puede recibir a cualquiera: sugiere al menos cargado', () => {
    const e = [edificio('rojo', null), edificio('a1', 'ana')];
    expect(sugerirRt(rts('ana', 'beto'), e, null).sugerido?.usuario).toBe('beto');
  });
});

describe('candidatosConCarga', () => {
  it('no modifica la lista de entrada', () => {
    const entrada = rts('b', 'a');
    candidatosConCarga(entrada, []);
    expect(entrada.map((r) => r.usuario)).toEqual(['b', 'a']);
  });
});
