import { ConsorcioInput, MaquinaInput } from './consorcio.types';

export const LIMITES = {
  nombre: 200,
  direccion: 300,
  administracionNombre: 200,
  telefono: 50,
  email: 200,
  referenciaAgc: 20,
  descripcion: 200,
  maquinas: 50,
} as const;

export type ResultadoValidacion =
  | { ok: true; valor: ConsorcioInput }
  | { ok: false; errores: string[] };

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Texto obligatorio: string no vacío (tras recortar) y dentro del límite. */
export function textoObligatorio(valor: unknown, campo: string, max: number, errores: string[]): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    errores.push(`${campo} es obligatorio`);
    return '';
  }
  const limpio = valor.trim();
  if (limpio.length > max) errores.push(`${campo} no puede superar ${max} caracteres`);
  return limpio;
}

/** Texto opcional: ausente, null o vacío → null. Si viene, tiene que ser string dentro del límite. */
export function textoOpcional(valor: unknown, campo: string, max: number, errores: string[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    errores.push(`${campo} tiene que ser texto`);
    return null;
  }
  const limpio = valor.trim();
  if (limpio === '') return null;
  if (limpio.length > max) errores.push(`${campo} no puede superar ${max} caracteres`);
  return limpio;
}

/**
 * Valida y normaliza el cuerpo de POST/PUT /api/consorcios.
 * Devuelve TODOS los errores juntos, para que quien llama corrija de una vez.
 * La referencia AGC se guarda en mayúsculas ("m1" → "M1") y no puede repetirse en el edificio.
 */
export function validarConsorcio(cuerpo: unknown): ResultadoValidacion {
  const errores: string[] = [];
  if (!esObjeto(cuerpo)) {
    return { ok: false, errores: ['El cuerpo tiene que ser un objeto JSON'] };
  }

  const nombre = textoObligatorio(cuerpo.nombre, 'nombre', LIMITES.nombre, errores);
  const direccion = textoObligatorio(cuerpo.direccion, 'direccion', LIMITES.direccion, errores);

  let administracion = { nombre: null as string | null, telefono: null as string | null, email: null as string | null };
  if (cuerpo.administracion !== undefined && cuerpo.administracion !== null) {
    if (!esObjeto(cuerpo.administracion)) {
      errores.push('administracion tiene que ser un objeto');
    } else {
      const adm = cuerpo.administracion;
      administracion = {
        nombre: textoOpcional(adm.nombre, 'administracion.nombre', LIMITES.administracionNombre, errores),
        telefono: textoOpcional(adm.telefono, 'administracion.telefono', LIMITES.telefono, errores),
        email: textoOpcional(adm.email, 'administracion.email', LIMITES.email, errores),
      };
      if (administracion.email !== null && !EMAIL.test(administracion.email)) {
        errores.push('administracion.email no es un email válido');
      }
    }
  }

  const maquinas: MaquinaInput[] = [];
  if (cuerpo.maquinas !== undefined && cuerpo.maquinas !== null) {
    if (!Array.isArray(cuerpo.maquinas)) {
      errores.push('maquinas tiene que ser una lista');
    } else if (cuerpo.maquinas.length > LIMITES.maquinas) {
      errores.push(`maquinas no puede tener más de ${LIMITES.maquinas} elementos`);
    } else {
      const vistas = new Set<string>();
      cuerpo.maquinas.forEach((item: unknown, i: number) => {
        const donde = `maquinas[${i}]`;
        if (!esObjeto(item)) {
          errores.push(`${donde} tiene que ser un objeto`);
          return;
        }
        const referenciaAgc = textoObligatorio(
          item.referenciaAgc,
          `${donde}.referenciaAgc`,
          LIMITES.referenciaAgc,
          errores,
        ).toUpperCase();
        const descripcion = textoOpcional(item.descripcion, `${donde}.descripcion`, LIMITES.descripcion, errores);
        if (referenciaAgc !== '') {
          if (vistas.has(referenciaAgc)) {
            errores.push(`${donde}.referenciaAgc "${referenciaAgc}" está repetida en el consorcio`);
          }
          vistas.add(referenciaAgc);
        }
        maquinas.push({ referenciaAgc, descripcion });
      });
    }
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, valor: { nombre, direccion, administracion, maquinas } };
}
