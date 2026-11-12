import {
  ConsorcioInput,
  Encargado,
  MaquinaInput,
  PuntoGeografico,
  TIPOS_MAQUINA,
  TipoMaquina,
} from './consorcio.types';

export const LIMITES = {
  nombre: 200,
  direccion: 300,
  administracionNombre: 200,
  encargadoNombre: 200,
  telefono: 50,
  email: 200,
  referenciaAgc: 20,
  descripcion: 200,
  maquinas: 50,
  piso: 20,
  pisos: 120,
  salaCompartidaId: 60,
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
export function validarEncargado(valor: unknown, errores: string[]): Encargado {
  const vacio: Encargado = { nombre: null, telefono: null };
  if (valor === undefined || valor === null) return vacio;
  if (!esObjeto(valor)) {
    errores.push('encargado tiene que ser un objeto');
    return vacio;
  }
  return {
    nombre: textoOpcional(valor.nombre, 'encargado.nombre', LIMITES.encargadoNombre, errores),
    telefono: textoOpcional(valor.telefono, 'encargado.telefono', LIMITES.telefono, errores),
  };
}

export function validarPisos(valor: unknown, errores: string[]): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) {
    errores.push('pisos tiene que ser una lista');
    return [];
  }
  if (valor.length > LIMITES.pisos) {
    errores.push(`pisos no puede tener más de ${LIMITES.pisos} elementos`);
    return [];
  }
  const resultado: string[] = [];
  const vistos = new Set<string>();
  valor.forEach((item: unknown, i: number) => {
    const piso = textoObligatorio(item, `pisos[${i}]`, LIMITES.piso, errores);
    if (piso === '') return;
    const clave = piso.toUpperCase();
    if (!vistos.has(clave)) {
      vistos.add(clave);
      resultado.push(piso);
    }
  });
  return resultado;
}

export function validarUbicacion(valor: unknown, errores: string[]): PuntoGeografico | null {
  if (valor === undefined || valor === null) return null;
  if (!esObjeto(valor)) {
    errores.push('ubicacion tiene que ser un objeto');
    return null;
  }
  const { latitud, longitud } = valor;
  const latValida = typeof latitud === 'number' && Number.isFinite(latitud) && latitud >= -90 && latitud <= 90;
  const lonValida = typeof longitud === 'number' && Number.isFinite(longitud) && longitud >= -180 && longitud <= 180;
  if (!latValida) errores.push('ubicacion.latitud tiene que estar entre -90 y 90');
  if (!lonValida) errores.push('ubicacion.longitud tiene que estar entre -180 y 180');
  return latValida && lonValida ? { latitud, longitud } : null;
}

function validarTipoMaquina(valor: unknown, donde: string, errores: string[]): TipoMaquina {
  if (valor === undefined || valor === null) return 'traccion';
  if (typeof valor !== 'string' || !(TIPOS_MAQUINA as readonly string[]).includes(valor)) {
    errores.push(`${donde}.tipo debe ser uno de: ${TIPOS_MAQUINA.join(', ')}`);
    return 'traccion';
  }
  return valor as TipoMaquina;
}

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

  const encargado = validarEncargado(cuerpo.encargado, errores);
  const pisos = validarPisos(cuerpo.pisos, errores);
  const ubicacion = validarUbicacion(cuerpo.ubicacion, errores);

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
        const tipo = validarTipoMaquina(item.tipo, donde, errores);
        const salaCompartidaId = textoOpcional(
          item.salaCompartidaId,
          `${donde}.salaCompartidaId`,
          LIMITES.salaCompartidaId,
          errores,
        );
        if (referenciaAgc !== '') {
          if (vistas.has(referenciaAgc)) {
            errores.push(`${donde}.referenciaAgc "${referenciaAgc}" está repetida en el consorcio`);
          }
          vistas.add(referenciaAgc);
        }
        maquinas.push({ referenciaAgc, descripcion, tipo, salaCompartidaId });
      });
    }
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, valor: { nombre, direccion, administracion, encargado, pisos, ubicacion, maquinas } };
}
