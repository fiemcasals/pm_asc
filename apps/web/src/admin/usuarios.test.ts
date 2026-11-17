import { describe, expect, it } from 'vitest';
import {
  cuerpoNuevoUsuario,
  erroresDelFormulario,
  ETIQUETA_ROL,
  MIN_PASSWORD,
  passwordAlAzar,
  ROLES_DISPONIBLES,
  type FormularioUsuario,
} from './usuarios';

const base: FormularioUsuario = {
  usuario: 'jperez',
  nombre: 'Juan Pérez',
  email: 'jperez@ejemplo.com',
  rol: 'rt_calle',
  eca: '',
  password: '',
};

describe('alta de usuarios del Administrador', () => {
  it('un formulario completo no tiene errores', () => {
    expect(erroresDelFormulario(base)).toEqual([]);
  });

  it('exige email cuando no se escribe una contraseña a mano', () => {
    expect(erroresDelFormulario({ ...base, email: '' })).toHaveLength(1);
    expect(erroresDelFormulario({ ...base, email: '', password: 'Clave-Larga-1' })).toEqual([]);
  });

  it('rechaza usuario con espacios, nombre vacío, email inválido y contraseña corta', () => {
    expect(erroresDelFormulario({ ...base, usuario: 'juan perez' })).not.toEqual([]);
    expect(erroresDelFormulario({ ...base, nombre: '  ' })).not.toEqual([]);
    expect(erroresDelFormulario({ ...base, email: 'jperez@' })).not.toEqual([]);
    expect(erroresDelFormulario({ ...base, password: 'corta' })).not.toEqual([]);
  });

  it('el rol ECA pide la empresa y los demás no la mandan', () => {
    expect(erroresDelFormulario({ ...base, rol: 'eca' })).toHaveLength(1);
    expect(cuerpoNuevoUsuario({ ...base, rol: 'eca', eca: ' MAICON ' }).eca).toBe('MAICON');
    expect(cuerpoNuevoUsuario({ ...base, eca: 'MAICON' }).eca).toBeUndefined();
  });

  it('sin contraseña escrita genera una al azar que cumple el mínimo de la API', () => {
    const cuerpo = cuerpoNuevoUsuario(base);
    expect(cuerpo.password.length).toBeGreaterThanOrEqual(MIN_PASSWORD);
    expect(cuerpo.password).not.toBe(cuerpoNuevoUsuario(base).password);
    expect(passwordAlAzar()).toMatch(/^[A-Za-z2-9]{18}$/);
  });

  it('respeta la contraseña escrita a mano y recorta los campos', () => {
    const cuerpo = cuerpoNuevoUsuario({ ...base, usuario: ' jperez ', password: 'Clave-A-Mano-1' });
    expect(cuerpo).toMatchObject({ usuario: 'jperez', password: 'Clave-A-Mano-1' });
  });

  it('todos los roles de la pantalla tienen etiqueta', () => {
    expect(ROLES_DISPONIBLES.map((r) => r.rol).sort()).toEqual(Object.keys(ETIQUETA_ROL).sort());
  });
});
