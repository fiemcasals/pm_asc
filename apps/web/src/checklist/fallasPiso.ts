export type GrupoFallaPisoId = 'mecanica_puerta' | 'seguridad_critica' | 'llamadores';

export interface ComponenteAccesoCatalogo {
  id: string;
  grupo: GrupoFallaPisoId;
  grupoTitulo: string;
  etiqueta: string;
  esFallaCritica: boolean;
  codigoFallaCritica?: string;
}

export interface FallaPisoRegistro {
  id: string;
  piso: string;
  componenteId: string;
  componenteEtiqueta: string;
  grupo: GrupoFallaPisoId;
  grupoTitulo: string;
  esFallaCritica: boolean;
  codigoFallaCritica?: string;
  detalle?: string;
  creadaEn: string;
}

export const PISOS_EDIFICIO_DEFAULT: readonly string[] = [
  'SS',
  'PB',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
];

export const GRUPOS_COMPONENTES_ACCESOS: ReadonlyArray<{
  id: GrupoFallaPisoId;
  titulo: string;
}> = [
  { id: 'seguridad_critica', titulo: 'Seguridad Crítica' },
  { id: 'mecanica_puerta', titulo: 'Mecánica de Puerta' },
  { id: 'llamadores', titulo: 'Llamadores' },
];

/**
 * Catálogo de componentes de acceso alineado al documento del cliente (HU-17 RF-06).
 */
export const COMPONENTES_ACCESOS_POR_PISO: readonly ComponenteAccesoCatalogo[] = [
  {
    id: 'espacio_entre_puertas',
    grupo: 'seguridad_critica',
    grupoTitulo: 'Seguridad Crítica',
    etiqueta: 'Espacio entre puertas mayor a 12 cm',
    esFallaCritica: true,
    codigoFallaCritica: 'ESPACIO_ENTRE_PUERTAS_MAYOR_12CM',
  },
  {
    id: 'destrabe_manual',
    grupo: 'seguridad_critica',
    grupoTitulo: 'Seguridad Crítica',
    etiqueta: 'Destrabe manual trabado / inexistente',
    esFallaCritica: true,
    codigoFallaCritica: 'DESTRABE_MANUAL_TRABADO_INEXISTENTE',
  },
  {
    id: 'cerradura_puerta',
    grupo: 'seguridad_critica',
    grupoTitulo: 'Seguridad Crítica',
    etiqueta: 'Cerradura no traba',
    esFallaCritica: true,
    codigoFallaCritica: 'CERRADURA_NO_TRABA',
  },
  {
    id: 'contacto_electrico',
    grupo: 'seguridad_critica',
    grupoTitulo: 'Seguridad Crítica',
    etiqueta: 'Contacto eléctrico puenteado / falla',
    esFallaCritica: true,
    codigoFallaCritica: 'CONTACTO_ELECTRICO_PUENTEADO_FALLA',
  },
  {
    id: 'hojas_guias_patin',
    grupo: 'mecanica_puerta',
    grupoTitulo: 'Mecánica de Puerta',
    etiqueta: 'Hojas / Batiente / Guías / Patín con roce o juego',
    esFallaCritica: false,
  },
  {
    id: 'cierrapuertas',
    grupo: 'mecanica_puerta',
    grupoTitulo: 'Mecánica de Puerta',
    etiqueta: 'Cierrapuertas o amortiguador desregulado',
    esFallaCritica: false,
  },
  {
    id: 'umbral_rellano',
    grupo: 'mecanica_puerta',
    grupoTitulo: 'Mecánica de Puerta',
    etiqueta: 'Umbral / Marco desalineado o deteriorado',
    esFallaCritica: false,
  },
  {
    id: 'llamadores_piso',
    grupo: 'llamadores',
    grupoTitulo: 'Llamadores',
    etiqueta: 'Botonera / Pulsador de piso dañado',
    esFallaCritica: false,
  },
  {
    id: 'indicador_piso',
    grupo: 'llamadores',
    grupoTitulo: 'Llamadores',
    etiqueta: 'Indicador / Display de piso apagado o roto',
    esFallaCritica: false,
  },
];

export function buscarComponenteAcceso(componenteId: string): ComponenteAccesoCatalogo | undefined {
  return COMPONENTES_ACCESOS_POR_PISO.find((c) => c.id === componenteId);
}

export function claveFotoFallaPiso(fallaId: string): string {
  return `accesos:piso:${fallaId}`;
}

export function generarListaPisosEdificio(
  cantidadPisos = 8,
  incluyeSubsuelo = true,
): string[] {
  const pisos: string[] = [];
  if (incluyeSubsuelo) pisos.push('SS');
  pisos.push('PB');
  for (let i = 1; i <= Math.max(1, cantidadPisos); i += 1) {
    pisos.push(String(i));
  }
  return pisos;
}

export function crearFallaPiso(
  piso: string,
  componenteId: string,
  detalle?: string,
  ahoraIso = new Date().toISOString(),
): FallaPisoRegistro {
  const comp = buscarComponenteAcceso(componenteId);
  if (!comp) {
    throw new Error(`Componente de acceso desconocido: ${componenteId}`);
  }
  const pisoLimpio = piso.trim();
  if (!pisoLimpio) {
    throw new Error('Debe seleccionar un piso válido del edificio.');
  }
  return {
    id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    piso: pisoLimpio,
    componenteId: comp.id,
    componenteEtiqueta: comp.etiqueta,
    grupo: comp.grupo,
    grupoTitulo: comp.grupoTitulo,
    esFallaCritica: comp.esFallaCritica,
    codigoFallaCritica: comp.codigoFallaCritica,
    detalle: detalle?.trim() || undefined,
    creadaEn: ahoraIso,
  };
}

export function agregarFallaPiso(
  actuales: readonly FallaPisoRegistro[],
  nueva: FallaPisoRegistro,
): FallaPisoRegistro[] {
  return [...actuales, nueva];
}

export function eliminarFallaPiso(
  actuales: readonly FallaPisoRegistro[],
  fallaId: string,
): FallaPisoRegistro[] {
  return actuales.filter((f) => f.id !== fallaId);
}
