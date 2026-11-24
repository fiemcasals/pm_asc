import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  CARACTERES_FIRMANTE,
  CLAVE_FOTO_OBLIGATORIA,
  CLIENT_REPORT_ID,
  ContenidoSellado,
  ESTADOS_EQUIPO,
  ETIQUETA_FOTO_OBLIGATORIA,
  EquipoInforme,
  FirmaInforme,
  FotoObligatoria,
  InformeNuevo,
  InformeVisita,
  MAX_MOTIVO,
  MIN_MOTIVO,
  MIN_PUNTOS_FIRMA,
  MIN_TAMANO_FIRMA_PX,
  Punto,
  ResumenInforme,
  SinFirmaInforme,
  TIPOS_EQUIPO,
} from './informes.types';

const DATA_PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const DATA_IMAGEN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_IMAGEN_FIRMA = 400_000;
const MAX_FOTO = 2_000_000;
const MAX_EQUIPOS = 50;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * ¿Los trazos forman una firma? Hace falta un mínimo de puntos y que el dibujo tenga un tamaño: un toque suelto o una raya mínima no
 * cuentan (la firma no se acepta vacía).
 */
export function firmaTrazada(trazos: readonly (readonly Punto[])[]): boolean {
  const puntos = trazos.flat();
  if (puntos.length < MIN_PUNTOS_FIRMA) return false;
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  return Math.max(...xs) - Math.min(...xs) >= MIN_TAMANO_FIRMA_PX || Math.max(...ys) - Math.min(...ys) >= MIN_TAMANO_FIRMA_PX;
}

/** Los DNI argentinos tienen 7 u 8 dígitos; se aceptan puntos y espacios y se guardan sólo los dígitos. */
export function normalizarDni(v: unknown): { ok: true; dni: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, dni: null };
  if (typeof v !== 'string' && typeof v !== 'number') return { ok: false };
  const s = String(v).trim();
  if (s === '') return { ok: true, dni: null };
  if (!/^[\d.\s]+$/.test(s)) return { ok: false };
  const digitos = s.replace(/\D/g, '');
  return /^\d{7,8}$/.test(digitos) ? { ok: true, dni: digitos } : { ok: false };
}

function validarFirma(f: unknown, errores: string[]): FirmaInforme | null {
  if (!esObjeto(f)) {
    errores.push('firma tiene que ser un objeto');
    return null;
  }
  const nombre = texto(f.nombre);
  const apellido = texto(f.apellido);
  if (nombre.length < 2 || nombre.length > 60) errores.push('firma.nombre es obligatorio (2 a 60 caracteres)');
  if (apellido.length < 2 || apellido.length > 60) errores.push('firma.apellido es obligatorio (2 a 60 caracteres)');
  const caracter = texto(f.caracter);
  if (!(CARACTERES_FIRMANTE as readonly string[]).includes(caracter)) errores.push(`firma.caracter tiene que ser ${CARACTERES_FIRMANTE.join(', ')}`);
  const dni = normalizarDni(f.dni);
  if (!dni.ok) errores.push('firma.dni, si se indica, tiene que tener 7 u 8 dígitos');
  const imagen = typeof f.imagen === 'string' ? f.imagen : '';
  if (!DATA_PNG.test(imagen) || imagen.length > MAX_IMAGEN_FIRMA) errores.push('firma.imagen tiene que ser la firma en PNG (data URL) de hasta 400 KB');
  let trazos: Punto[][] = [];
  if (!Array.isArray(f.trazos) || !f.trazos.every((t) => Array.isArray(t) && t.every((p) => Array.isArray(p) && p.length === 2 && esNumero(p[0]) && esNumero(p[1])))) {
    errores.push('firma.trazos tiene que ser la lista de trazos, cada uno con puntos [x, y]');
  } else {
    trazos = f.trazos as Punto[][];
    if (!firmaTrazada(trazos)) errores.push('La firma está vacía: firmá con el dedo en el recuadro.');
  }
  if (errores.length > 0) return null;
  return { nombre, apellido, caracter: caracter as FirmaInforme['caracter'], dni: dni.ok ? dni.dni : null, imagen, trazos };
}

function validarSinFirma(s: unknown, errores: string[]): SinFirmaInforme | null {
  if (!esObjeto(s)) {
    errores.push('sinFirma tiene que ser un objeto');
    return null;
  }
  const motivo = texto(s.motivo);
  const foto = typeof s.foto === 'string' ? s.foto : '';
  if (motivo.length < MIN_MOTIVO) errores.push(`«Sin firma» exige el motivo (al menos ${MIN_MOTIVO} caracteres)`);
  if (motivo.length > MAX_MOTIVO) errores.push(`El motivo no puede superar los ${MAX_MOTIVO} caracteres`);
  if (!DATA_IMAGEN.test(foto) || foto.length > MAX_FOTO) errores.push('«Sin firma» exige una foto (imagen en data URL, de hasta 2 MB)');
  return errores.length > 0 ? null : { motivo, foto };
}

/**
 * Qué fotos obligatorias lleva un equipo: el hidráulico no tiene cables de tracción, sólo la del frente; tracción y montavehículos llevan las
 * dos. Un equipo fuera de servicio no las necesita (ya lleva su reporte de parada con fotos).
 */
export function fotosObligatoriasDelEquipo(tipo: EquipoInforme['tipo'], estado: EquipoInforme['estadoEquipo']): FotoObligatoria[] {
  if (estado === 'fuera_de_servicio') return [];
  return tipo === 'hidraulico' ? ['frente'] : ['frente', 'cables'];
}

/** Controla que cada foto obligatoria del equipo esté y sea una imagen (data URL jpeg, png o webp) de hasta 2 MB. */
function validarFotosObligatorias(e: Record<string, unknown>, donde: string, referenciaAgc: string, errores: string[]): void {
  if (!esObjeto(e.fotos)) return; // ya se informó que `fotos` no es un objeto
  if (!(TIPOS_EQUIPO as readonly string[]).includes(e.tipo as string) || !(ESTADOS_EQUIPO as readonly string[]).includes(e.estadoEquipo as string)) return;
  const equipo = `El equipo ${referenciaAgc || donde} (${donde})`;
  for (const id of fotosObligatoriasDelEquipo(e.tipo as EquipoInforme['tipo'], e.estadoEquipo as EquipoInforme['estadoEquipo'])) {
    const clave = CLAVE_FOTO_OBLIGATORIA[id];
    const foto = e.fotos[clave];
    if (foto === undefined || foto === null) {
      errores.push(`${equipo} no trae la foto de ${ETIQUETA_FOTO_OBLIGATORIA[id]} (${clave}): se saca en cada equipo en uso, aunque no haya fallas`);
      continue;
    }
    const dataUrl = esObjeto(foto) && typeof foto.dataUrl === 'string' ? foto.dataUrl : '';
    if (!DATA_IMAGEN.test(dataUrl) || dataUrl.length > MAX_FOTO) {
      errores.push(`${equipo}: la foto de ${ETIQUETA_FOTO_OBLIGATORIA[id]} (${clave}) tiene que ser una imagen en data URL (jpeg, png o webp) de hasta 2 MB`);
    }
  }
}

function validarEquipo(e: unknown, i: number, errores: string[]): EquipoInforme | null {
  const donde = `equipos[${i}]`;
  if (!esObjeto(e)) {
    errores.push(`${donde} tiene que ser un objeto`);
    return null;
  }
  const maquinaId = texto(e.maquinaId);
  const referenciaAgc = texto(e.referenciaAgc);
  if (!maquinaId) errores.push(`${donde}.maquinaId es obligatorio`);
  if (!referenciaAgc) errores.push(`${donde}.referenciaAgc es obligatorio`);
  if (!(TIPOS_EQUIPO as readonly string[]).includes(e.tipo as string)) errores.push(`${donde}.tipo tiene que ser ${TIPOS_EQUIPO.join(', ')}`);
  if (!(ESTADOS_EQUIPO as readonly string[]).includes(e.estadoEquipo as string)) errores.push(`${donde}.estadoEquipo tiene que ser ${ESTADOS_EQUIPO.join(' o ')}`);
  for (const campo of ['respuestas', 'observaciones', 'fotos'] as const) {
    if (!esObjeto(e[campo])) errores.push(`${donde}.${campo} tiene que ser un objeto`);
  }
  validarFotosObligatorias(e, donde, referenciaAgc, errores);
  return {
    maquinaId, referenciaAgc, tipo: e.tipo as EquipoInforme['tipo'], estadoEquipo: e.estadoEquipo as EquipoInforme['estadoEquipo'],
    respuestas: esObjeto(e.respuestas) ? (e.respuestas as EquipoInforme['respuestas']) : {},
    observaciones: esObjeto(e.observaciones) ? (e.observaciones as Record<string, string>) : {},
    fotos: esObjeto(e.fotos) ? e.fotos : {},
  };
}

/**
 * Valida el informe que cierra el RT: al menos un equipo; **o** la firma (con nombre, apellido y carácter —el DNI es opcional— y el trazo
 * del dedo, no vacío) **o** «Sin firma» con motivo y foto, nunca las dos ni ninguna. «Sin firma» deja el informe marcado para revisión.
 */
export function validarInforme(cuerpo: unknown): InformeNuevo {
  const errores: string[] = [];
  if (!esObjeto(cuerpo)) throw new BadRequestException({ message: 'Datos inválidos', errores: ['El cuerpo tiene que ser un objeto JSON'] });
  const consorcioId = texto(cuerpo.consorcioId);
  if (!consorcioId) errores.push('consorcioId es obligatorio');
  const hora = typeof cuerpo.horaDispositivo === 'string' ? Date.parse(cuerpo.horaDispositivo) : NaN;
  if (Number.isNaN(hora)) errores.push('horaDispositivo tiene que ser una fecha y hora válida (ISO 8601)');

  const equipos: EquipoInforme[] = [];
  if (!Array.isArray(cuerpo.equipos) || cuerpo.equipos.length === 0) errores.push('equipos tiene que traer al menos un equipo');
  else if (cuerpo.equipos.length > MAX_EQUIPOS) errores.push(`equipos admite hasta ${MAX_EQUIPOS}`);
  else {
    cuerpo.equipos.forEach((e, i) => {
      const eq = validarEquipo(e, i, errores);
      if (eq) equipos.push(eq);
    });
  }

  const hayFirma = cuerpo.firma !== undefined && cuerpo.firma !== null;
  const haySinFirma = cuerpo.sinFirma !== undefined && cuerpo.sinFirma !== null;
  let firma: FirmaInforme | null = null;
  let sinFirma: SinFirmaInforme | null = null;
  if (hayFirma && haySinFirma) errores.push('Mandá la firma o «Sin firma», no las dos');
  else if (!hayFirma && !haySinFirma) errores.push('Falta la firma del encargado o el cierre «Sin firma» con su motivo y foto');
  else if (hayFirma) firma = validarFirma(cuerpo.firma, errores);
  else sinFirma = validarSinFirma(cuerpo.sinFirma, errores);

  let clientReportId: string | null = null;
  if (cuerpo.clientReportId !== undefined && cuerpo.clientReportId !== null) {
    if (typeof cuerpo.clientReportId !== 'string' || !CLIENT_REPORT_ID.test(cuerpo.clientReportId)) errores.push('clientReportId tiene que ser un identificador de 8 a 100 caracteres (letras, números, - y _)');
    else clientReportId = cuerpo.clientReportId;
  }

  if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });
  return { consorcioId, equipos, firma, sinFirma, requiereRevision: sinFirma !== null, horaDispositivo: new Date(hora).toISOString(), clientReportId };
}

/**
 * JSON canónico: las claves de los objetos van ordenadas y no hay espacios, así que el mismo contenido da siempre el mismo texto sin
 * importar el orden en que llegó o en que lo devolvió la base. Un `undefined` se trata como ausente.
 */
export function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map((v) => canonicalizar(v === undefined ? null : v)).join(',')}]`;
  const claves = Object.keys(valor as Record<string, unknown>).filter((k) => (valor as Record<string, unknown>)[k] !== undefined).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonicalizar((valor as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** El SHA-256 (hexadecimal) del informe cerrado: contenido, firma, fotos, usuario, id y las dos horas. */
export function hashInforme(contenido: ContenidoSellado): string {
  return createHash('sha256').update(canonicalizar(contenido), 'utf8').digest('hex');
}

/** Lo que se sella de un informe guardado (todo menos el hash y su versión). */
export function contenidoSellado(i: InformeVisita): ContenidoSellado {
  const { hashSha256: _h, versionHash: _v, clientReportId: _c, ...resto } = i;
  return resto;
}

export function aResumen(i: InformeVisita): ResumenInforme {
  return {
    id: i.id, consorcioId: i.consorcioId, usuario: i.usuario, equipos: i.equipos.length,
    firmante: i.firma ? `${i.firma.nombre} ${i.firma.apellido} (${i.firma.caracter})` : null,
    motivoSinFirma: i.sinFirma?.motivo ?? null, requiereRevision: i.requiereRevision, horaDispositivo: i.horaDispositivo, horaServidor: i.horaServidor, hashSha256: i.hashSha256,
  };
}
