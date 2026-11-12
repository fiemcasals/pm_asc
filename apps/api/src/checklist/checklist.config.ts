export type TipoMaquinaChecklist = 'traccion' | 'hidraulico' | 'montavehiculos';

export type SolapaId = 'sala_maquinas' | 'cabina' | 'accesos' | 'caja' | 'fosa';

export type EstadoEquipoUso = 'en_uso' | 'fuera_de_servicio';

export interface ChecklistOpcionConfig {
  id: string;
  etiqueta: string;
  esFalla: boolean;
  esFallaCritica: boolean;
  fotoObligatoria: boolean;
  /** Código de falla crítica alineado con HU-06 RF-03, si esFallaCritica === true. */
  codigoFallaCritica?: string;
}

export interface ChecklistItemConfig {
  id: string;
  etiqueta: string;
  /** Si está presente, sólo aplica a estos tipos de equipo. */
  tiposAplicables: readonly TipoMaquinaChecklist[];
  /** Verdadero en ítems de entorno de Sala de Máquinas compartida (HU-17 RF-07). */
  esEntornoSala?: boolean;
  opciones: readonly ChecklistOpcionConfig[];
}

export interface ChecklistSubgrupoConfig {
  id: string;
  titulo: string;
  esEntornoCompartido?: boolean;
  items: readonly ChecklistItemConfig[];
}

export interface ChecklistSolapaConfig {
  id: SolapaId;
  nombre: string;
  orden: number;
  subgrupos: readonly ChecklistSubgrupoConfig[];
}

export interface ChecklistMotorConfig {
  version: string;
  solapas: readonly ChecklistSolapaConfig[];
}

const TODOS_LOS_TIPOS: readonly TipoMaquinaChecklist[] = ['traccion', 'hidraulico', 'montavehiculos'];
const SOLO_CABLES_TRACCION: readonly TipoMaquinaChecklist[] = ['traccion', 'montavehiculos'];
const SOLO_HIDRAULICO: readonly TipoMaquinaChecklist[] = ['hidraulico'];

export const CHECKLIST_VERSION = '2026.11.1';

export const CHECKLIST_SOLAPAS: readonly ChecklistSolapaConfig[] = [
  {
    id: 'sala_maquinas',
    nombre: 'Sala de Máquinas',
    orden: 1,
    subgrupos: [
      {
        id: 'entorno_sala',
        titulo: 'Entorno de Sala',
        esEntornoCompartido: true,
        items: [
          {
            id: 'entorno_iluminacion',
            etiqueta: 'Iluminación de sala',
            tiposAplicables: TODOS_LOS_TIPOS,
            esEntornoSala: true,
            opciones: [
              { id: 'normal', etiqueta: 'Normal', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'deficiente', etiqueta: 'Deficiente', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'entorno_ventilacion',
            etiqueta: 'Ventilación y acceso',
            tiposAplicables: TODOS_LOS_TIPOS,
            esEntornoSala: true,
            opciones: [
              { id: 'normal', etiqueta: 'Normal', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'obstruida', etiqueta: 'Obstruida / Deficiente', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'entorno_extintor',
            etiqueta: 'Matafuegos y orden',
            tiposAplicables: TODOS_LOS_TIPOS,
            esEntornoSala: true,
            opciones: [
              { id: 'vigente', etiqueta: 'Vigente', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'vencido', etiqueta: 'Vencido / Ausente', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
      {
        id: 'traccion_mecanica',
        titulo: 'Tracción, Cables y Limitador',
        items: [
          {
            id: 'cables_traccion',
            etiqueta: 'Cables de tracción',
            tiposAplicables: SOLO_CABLES_TRACCION,
            opciones: [
              { id: 'correctos', etiqueta: 'Correctos', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'desgaste_leve', etiqueta: 'Leve desgaste', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'desgastados',
                etiqueta: 'DESGASTADOS',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'CABLES_DESGASTADOS',
              },
            ],
          },
          {
            id: 'extension_cables',
            etiqueta: 'Extensión de cables de tracción',
            tiposAplicables: SOLO_CABLES_TRACCION,
            opciones: [
              { id: 'correcta', etiqueta: 'Correcta', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'anomalia', etiqueta: 'Requiere compensación', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'poleas_traccion',
            etiqueta: 'Poleas de tracción y desvío',
            tiposAplicables: SOLO_CABLES_TRACCION,
            opciones: [
              { id: 'correctas', etiqueta: 'Correctas', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'desgaste', etiqueta: 'Desgaste / Ruido', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'limitador_velocidad',
            etiqueta: 'Limitador de velocidad',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'correcto', etiqueta: 'Correcto', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'deficiente', etiqueta: 'DEFICIENTE', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'anulado',
                etiqueta: 'ANULADO',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'LIMITADOR_ANULADO',
              },
            ],
          },
        ],
      },
      {
        id: 'sistema_hidraulico',
        titulo: 'Central Hidráulica',
        items: [
          {
            id: 'aceite_batea',
            etiqueta: 'Aceite de batea',
            tiposAplicables: SOLO_HIDRAULICO,
            opciones: [
              { id: 'correcto', etiqueta: 'Nivel correcto', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'insuficiente',
                etiqueta: 'Insuficiente',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'ACEITE_BATEA_INSUFICIENTE',
              },
            ],
          },
          {
            id: 'perdida_aceite',
            etiqueta: 'Pérdida de aceite',
            tiposAplicables: SOLO_HIDRAULICO,
            opciones: [
              { id: 'sin_perdida', etiqueta: 'Sin pérdidas', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'con_perdida', etiqueta: 'Pérdida menor', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
      {
        id: 'fuerza_motriz_tablero',
        titulo: 'Fuerza Motriz y Tablero',
        items: [
          {
            id: 'corte_fuerza_motriz',
            etiqueta: 'Corte de fuerza motriz',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'actua', etiqueta: 'Actúa correctamente', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'no_actua',
                etiqueta: 'NO ACTÚA',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'CORTE_FUERZA_MOTRIZ_NO_ACTUA',
              },
            ],
          },
          {
            id: 'tablero_control',
            etiqueta: 'Tablero de control',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'en_norma', etiqueta: 'En norma', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'fuera_norma', etiqueta: 'Fuera de norma', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'maquina_freno',
            etiqueta: 'Máquina y freno',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'normal', etiqueta: 'Normal', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'observado', etiqueta: 'Desajuste / Pérdida', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'cabina',
    nombre: 'Cabina',
    orden: 2,
    subgrupos: [
      {
        id: 'seguridad_cabina',
        titulo: 'Seguridad de Cabina',
        items: [
          {
            id: 'boton_pare',
            etiqueta: 'Botón de PARE',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'funciona', etiqueta: 'Funciona', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'falla',
                etiqueta: 'Falla',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'BOTON_PARE_FALLA',
              },
            ],
          },
          {
            id: 'paracaidas',
            etiqueta: 'Paracaídas',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'operativo', etiqueta: 'Operativo', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'anomalia',
                etiqueta: 'Anomalía',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'PARACAIDAS_ANOMALIA',
              },
            ],
          },
        ],
      },
      {
        id: 'equipamiento_cabina',
        titulo: 'Equipamiento e Interior',
        items: [
          {
            id: 'alarma_cabina',
            etiqueta: 'Alarma y luz de emergencia',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'funciona', etiqueta: 'Funciona', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'falla', etiqueta: 'No funciona', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'piso_madera',
            etiqueta: 'Piso y revestimiento',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'correcto', etiqueta: 'Correcto', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'deteriorado', etiqueta: 'Piso de madera / deterioro', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'baranda_techo',
            etiqueta: 'Baranda de techo',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'en_norma', etiqueta: 'En norma', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'deficiente', etiqueta: 'Deficiente / Ausente', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'puerta_cabina',
            etiqueta: 'Puerta de cabina',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'normal', etiqueta: 'Normal', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'puerta_tijera', etiqueta: 'Puerta tijera / Desajuste', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'accesos',
    nombre: 'Accesos',
    orden: 3,
    subgrupos: [
      {
        id: 'seguridad_critica',
        titulo: 'Seguridad Crítica',
        items: [
          {
            id: 'destrabe_manual',
            etiqueta: 'Destrabe manual',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'operativo', etiqueta: 'Operativo', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'trabado_inexistente',
                etiqueta: 'TRABADO / INEXISTENTE',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'DESTRABE_MANUAL_TRABADO_INEXISTENTE',
              },
            ],
          },
          {
            id: 'cerradura_puerta',
            etiqueta: 'Cerradura',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'traba', etiqueta: 'Traba correctamente', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'no_traba',
                etiqueta: 'No traba',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'CERRADURA_NO_TRABA',
              },
            ],
          },
          {
            id: 'contacto_electrico',
            etiqueta: 'Contacto eléctrico',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'normal', etiqueta: 'Normal', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'puenteado_falla',
                etiqueta: 'Puenteado / Falla',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'CONTACTO_ELECTRICO_PUENTEADO_FALLA',
              },
            ],
          },
          {
            id: 'espacio_entre_puertas',
            etiqueta: 'Espacio entre puertas mayor a 12 cm',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'en_norma', etiqueta: 'En norma (<= 12 cm)', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'mayor_12cm',
                etiqueta: 'Mayor a 12 cm (requiere suplemento)',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'ESPACIO_ENTRE_PUERTAS_MAYOR_12CM',
              },
            ],
          },
        ],
      },
      {
        id: 'mecanica_puerta',
        titulo: 'Mecánica de Puerta',
        items: [
          {
            id: 'hojas_guias_patin',
            etiqueta: 'Hojas, guías y patín',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'correctas', etiqueta: 'Correctas', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'desajuste', etiqueta: 'Con roce o juego', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'cierrapuertas',
            etiqueta: 'Cierrapuertas y amortiguador',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'correcto', etiqueta: 'Correcto', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'desregulado', etiqueta: 'Desregulado', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
      {
        id: 'llamadores',
        titulo: 'Llamadores',
        items: [
          {
            id: 'llamadores_piso',
            etiqueta: 'Llamadores e indicadores de piso',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'operativos', etiqueta: 'Operativos', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'falla_botonera', etiqueta: 'Pulsador / Display con falla', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'caja',
    nombre: 'Caja',
    orden: 4,
    subgrupos: [
      {
        id: 'condiciones_caja',
        titulo: 'Seguridad en Pasadizo',
        items: [
          {
            id: 'instalaciones_ajenas',
            etiqueta: 'Instalaciones ajenas',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'no', etiqueta: 'NO', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'si',
                etiqueta: 'SÍ',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'INSTALACIONES_AJENAS_SI',
              },
            ],
          },
          {
            id: 'espacios_aberturas',
            etiqueta: 'Espacios',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'cerrados', etiqueta: 'Cerrados', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'con_aberturas',
                etiqueta: 'CON ABERTURAS',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'ESPACIOS_CON_ABERTURAS',
              },
            ],
          },
          {
            id: 'limites_carrera',
            etiqueta: 'Límites superiores o inferiores',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'actuan', etiqueta: 'Actúan correctamente', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'fallan_anulados',
                etiqueta: 'FALLAN / ANULADOS',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'LIMITES_FALLAN_ANULADOS',
              },
            ],
          },
          {
            id: 'guias_pasadizo',
            etiqueta: 'Guías de cabina y contrapeso',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'normal', etiqueta: 'Normal', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'lubricacion_faltante', etiqueta: 'Falta lubricación / Desajuste', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fosa',
    nombre: 'Fosa',
    orden: 5,
    subgrupos: [
      {
        id: 'seguridad_fosa',
        titulo: 'Seguridad y Parada en Fosa',
        items: [
          {
            id: 'stop_fosa',
            etiqueta: 'Stop de fosa',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'operativo', etiqueta: 'Operativo', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              {
                id: 'deficiente_inexistente',
                etiqueta: 'DEFICIENTE / INEXISTENTE',
                esFalla: true,
                esFallaCritica: true,
                fotoObligatoria: true,
                codigoFallaCritica: 'STOP_FOSA_DEFICIENTE_INEXISTENTE',
              },
            ],
          },
          {
            id: 'amortiguadores_fosa',
            etiqueta: 'Amortiguadores',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'normal', etiqueta: 'En buen estado', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'deteriorados', etiqueta: 'Deteriorados', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'polea_tensora',
            etiqueta: 'Polea tensora',
            tiposAplicables: SOLO_CABLES_TRACCION,
            opciones: [
              { id: 'normal', etiqueta: 'Libre y limpia', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'trabada', etiqueta: 'Trabada / Con óxido', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
          {
            id: 'limpieza_fosa',
            etiqueta: 'Limpieza y estanqueidad de fosa',
            tiposAplicables: TODOS_LOS_TIPOS,
            opciones: [
              { id: 'limpia', etiqueta: 'Limpia y seca', esFalla: false, esFallaCritica: false, fotoObligatoria: false },
              { id: 'humeda_sucia', etiqueta: 'Con residuos / Agua', esFalla: true, esFallaCritica: false, fotoObligatoria: false },
            ],
          },
        ],
      },
    ],
  },
] as const;

export const CHECKLIST_CONFIG: ChecklistMotorConfig = {
  version: CHECKLIST_VERSION,
  solapas: CHECKLIST_SOLAPAS,
};

/** Filtra el motor del checklist por tipo de equipo (`hidraulico` excluye poleas/cables e incluye Aceite de batea). */
export function obtenerChecklistParaTipo(tipo: TipoMaquinaChecklist): ChecklistMotorConfig {
  return {
    version: CHECKLIST_VERSION,
    solapas: CHECKLIST_SOLAPAS.map((solapa) => ({
      ...solapa,
      subgrupos: solapa.subgrupos
        .map((sub) => ({
          ...sub,
          items: sub.items.filter((item) => item.tiposAplicables.includes(tipo)),
        }))
        .filter((sub) => sub.items.length > 0),
    })),
  };
}

/** La foto es obligatoria cuando la opción es Falla Crítica o cuando el equipo está Fuera de Servicio. */
export function requiereFotoChecklist(
  opcion: Pick<ChecklistOpcionConfig, 'esFallaCritica' | 'fotoObligatoria'>,
  estadoEquipo: EstadoEquipoUso = 'en_uso',
): boolean {
  return Boolean(opcion.esFallaCritica || opcion.fotoObligatoria || estadoEquipo === 'fuera_de_servicio');
}

export interface FallaCriticaDefinida {
  solapaId: SolapaId;
  solapaNombre: string;
  itemId: string;
  itemEtiqueta: string;
  opcionId: string;
  opcionEtiqueta: string;
  codigoFallaCritica: string;
  tiposAplicables: readonly TipoMaquinaChecklist[];
}

/** Lista exacta de opciones críticas configuradas en el motor (sincronizada con HU-06 RF-03). */
export function obtenerFallasCriticasDefinidas(): FallaCriticaDefinida[] {
  const resultado: FallaCriticaDefinida[] = [];
  for (const solapa of CHECKLIST_SOLAPAS) {
    for (const subgrupo of solapa.subgrupos) {
      for (const item of subgrupo.items) {
        for (const opcion of item.opciones) {
          if (opcion.esFallaCritica) {
            resultado.push({
              solapaId: solapa.id,
              solapaNombre: solapa.nombre,
              itemId: item.id,
              itemEtiqueta: item.etiqueta,
              opcionId: opcion.id,
              opcionEtiqueta: opcion.etiqueta,
              codigoFallaCritica: opcion.codigoFallaCritica ?? opcion.id.toUpperCase(),
              tiposAplicables: item.tiposAplicables,
            });
          }
        }
      }
    }
  }
  return resultado;
}
