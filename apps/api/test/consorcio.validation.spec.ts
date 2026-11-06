import { LIMITES, validarConsorcio } from '../src/consorcios/consorcio.validation';

const valido = {
  nombre: 'Consorcio Av. Rivadavia 1234',
  direccion: 'Av. Rivadavia 1234, CABA',
  administracion: { nombre: 'Administración Pérez', telefono: '11 4444-5555', email: 'admin@perez.com' },
  maquinas: [
    { referenciaAgc: 'M1', descripcion: 'Derecha' },
    { referenciaAgc: 'M2', descripcion: 'Izquierda' },
  ],
};

function errores(cuerpo: unknown): string[] {
  const r = validarConsorcio(cuerpo);
  if (r.ok) throw new Error('se esperaba un error de validación');
  return r.errores;
}

describe('validarConsorcio', () => {
  it('acepta un consorcio completo y lo devuelve normalizado', () => {
    const r = validarConsorcio(valido);
    expect(r).toEqual({ ok: true, valor: valido });
  });

  it('sólo exige nombre y dirección: administración y máquinas son opcionales', () => {
    const r = validarConsorcio({ nombre: 'Edificio Sur', direccion: 'Calle 1' });
    expect(r).toEqual({
      ok: true,
      valor: {
        nombre: 'Edificio Sur',
        direccion: 'Calle 1',
        administracion: { nombre: null, telefono: null, email: null },
        maquinas: [],
      },
    });
  });

  it('recorta espacios y pasa la referencia AGC a mayúsculas', () => {
    const r = validarConsorcio({
      nombre: '  Edificio  ',
      direccion: ' Calle 1 ',
      maquinas: [{ referenciaAgc: ' m3 ', descripcion: '   ' }],
    });
    expect(r.ok && r.valor.nombre).toBe('Edificio');
    expect(r.ok && r.valor.maquinas).toEqual([{ referenciaAgc: 'M3', descripcion: null }]);
  });

  it('rechaza un cuerpo que no es un objeto', () => {
    expect(errores(null)).toEqual(['El cuerpo tiene que ser un objeto JSON']);
    expect(errores([])).toEqual(['El cuerpo tiene que ser un objeto JSON']);
    expect(errores('texto')).toEqual(['El cuerpo tiene que ser un objeto JSON']);
  });

  it('informa todos los errores juntos', () => {
    const e = errores({ nombre: '', maquinas: [{ descripcion: 'sin referencia' }] });
    expect(e).toEqual(
      expect.arrayContaining([
        'nombre es obligatorio',
        'direccion es obligatorio',
        'maquinas[0].referenciaAgc es obligatorio',
      ]),
    );
  });

  it('rechaza una referencia AGC repetida dentro del consorcio, sin distinguir mayúsculas', () => {
    const e = errores({
      ...valido,
      maquinas: [{ referenciaAgc: 'M1' }, { referenciaAgc: 'm1' }],
    });
    expect(e).toEqual(['maquinas[1].referenciaAgc "M1" está repetida en el consorcio']);
  });

  it('rechaza un email inválido y tipos incorrectos', () => {
    expect(errores({ ...valido, administracion: { email: 'no-es-email' } })).toEqual([
      'administracion.email no es un email válido',
    ]);
    expect(errores({ ...valido, administracion: 'x' })).toEqual(['administracion tiene que ser un objeto']);
    expect(errores({ ...valido, maquinas: 'M1' })).toEqual(['maquinas tiene que ser una lista']);
    expect(errores({ ...valido, nombre: 123 })).toEqual(['nombre es obligatorio']);
  });

  it('respeta los límites de largo y de cantidad de máquinas', () => {
    expect(errores({ ...valido, nombre: 'x'.repeat(LIMITES.nombre + 1) })).toEqual([
      `nombre no puede superar ${LIMITES.nombre} caracteres`,
    ]);
    const muchas = Array.from({ length: LIMITES.maquinas + 1 }, (_, i) => ({ referenciaAgc: `M${i + 1}` }));
    expect(errores({ ...valido, maquinas: muchas })).toEqual([
      `maquinas no puede tener más de ${LIMITES.maquinas} elementos`,
    ]);
  });
});
