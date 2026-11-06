import { EMAIL, LIMITES, esObjeto, textoObligatorio, textoOpcional } from './consorcio.validation';
import { ResponsableInput, RolesInput } from './roles.types';

export type ResultadoValidacionRoles =
  | { ok: true; valor: RolesInput }
  | { ok: false; errores: string[] };

function responsable(valor: unknown, campo: string, errores: string[]): ResponsableInput {
  const vacio: ResponsableInput = { nombre: '', telefono: null, email: null };
  if (valor === undefined || valor === null) {
    errores.push(`${campo} es obligatorio`);
    return vacio;
  }
  if (!esObjeto(valor)) {
    errores.push(`${campo} tiene que ser un objeto`);
    return vacio;
  }

  const nombre = textoObligatorio(valor.nombre, `${campo}.nombre`, LIMITES.administracionNombre, errores);
  const telefono = textoOpcional(valor.telefono, `${campo}.telefono`, LIMITES.telefono, errores);
  const email = textoOpcional(valor.email, `${campo}.email`, LIMITES.email, errores);
  if (email !== null && !EMAIL.test(email)) errores.push(`${campo}.email no es un email válido`);
  if (telefono === null && email === null) {
    errores.push(`${campo} necesita al menos un dato de contacto (telefono o email)`);
  }
  return { nombre, telefono, email };
}

/**
 * Valida y normaliza el cuerpo de PUT /api/consorcios/:id/roles.
 * Los tres roles son obligatorios y devuelve TODOS los errores juntos.
 */
export function validarRoles(cuerpo: unknown): ResultadoValidacionRoles {
  if (!esObjeto(cuerpo)) {
    return { ok: false, errores: ['El cuerpo tiene que ser un objeto JSON'] };
  }
  const errores: string[] = [];
  const rtCalle = responsable(cuerpo.rtCalle, 'rtCalle', errores);
  const firmante = responsable(cuerpo.firmante, 'firmante', errores);
  const eca = responsable(cuerpo.eca, 'eca', errores);

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, valor: { rtCalle, firmante, eca } };
}
