import type React from 'react';
import type { CommandItem, Vista } from './command';
import { IconBrand, IconChat, IconChecklist, IconEca, IconFirmante, IconMapa, IconSecretaria, IconUsuarios } from './Icons';

export interface ItemNavegacion {
  id: Vista;
  label: string;
  shortLabel: string;
  testId: string;
  icon: (props: { size?: number }) => React.ReactElement;
}

/** La pestaña del Mapa del RT: es la primera que ve el RT de Calle. */
export const NAV_RT: ItemNavegacion = {
  id: 'rt',
  label: 'Mapa del RT',
  shortLabel: 'Mapa',
  testId: 'tab-rt',
  icon: IconBrand,
};

/** El chat interno entre operarios e ingenieros (HU-19). */
export const NAV_CHAT: ItemNavegacion = {
  id: 'chat',
  label: 'Chat Operativo',
  shortLabel: 'Chat',
  testId: 'tab-chat',
  icon: IconChat,
};

export const NAV_ITEMS: ItemNavegacion[] = [
  { id: 'firmante', label: 'Portal Firmante (RT Legal)', shortLabel: 'Firmante', testId: 'tab-firmante', icon: IconFirmante },
  { id: 'inspeccion', label: 'Inspección Técnica (Checklist)', shortLabel: 'Inspección', testId: 'tab-inspeccion', icon: IconChecklist },
  { id: 'eca', label: 'Portal ECA (Conservadoras)', shortLabel: 'Portal ECA', testId: 'tab-eca', icon: IconEca },
  { id: 'secretaria', label: 'Secretaría (Edificios y Máquinas)', shortLabel: 'Secretaría', testId: 'tab-secretaria', icon: IconSecretaria },
  NAV_CHAT,
  { id: 'mapa-sin-conexion', label: 'Mapa sin conexión', shortLabel: 'Sin conexión', testId: 'tab-mapa-sin-conexion', icon: IconMapa },
  { id: 'usuarios', label: 'Usuarios y permisos', shortLabel: 'Usuarios', testId: 'tab-usuarios', icon: IconUsuarios },
];

/**
 * Las pestañas del menú lateral y de la barra del celular según quién ingresó. El RT de Calle ve su mapa, la inspección técnica y el chat
 * operativo (HU-19); el resto, los portales del sistema. Las empresas conservadoras (ECA) no tienen acceso al chat interno. Usuarios y permisos
 * es sólo del Administrador (la API además lo exige).
 */
export function itemsDeNavegacion(rol: string): ItemNavegacion[] {
  if (rol === 'rt_calle') return [NAV_RT, ...NAV_ITEMS.filter((item) => item.id === 'inspeccion'), NAV_CHAT];
  return NAV_ITEMS.filter((item) => {
    if (item.id === 'usuarios' && rol !== 'administrador') return false;
    if (item.id === 'chat' && rol === 'eca') return false;
    return true;
  });
}

/** Los comandos de «Navegación» del buscador global: llevan a cada portal. */
export function comandosDeNavegacion(onNavigate: (vista: Vista) => void): CommandItem[] {
  return [
    {
      id: 'nav-firmante',
      group: 'Navegación',
      title: 'Portal Firmante (RT Legal)',
      subtitle: 'Liquidación, auditoría de fotos y firma AGC',
      keywords: 'firmante rt legal agc liquidacion',
      action: () => onNavigate('firmante'),
    },
    {
      id: 'nav-inspeccion',
      group: 'Navegación',
      title: 'Inspección Técnica (Checklist)',
      subtitle: 'Relevamiento móvil por solapas para RT de Calle',
      keywords: 'inspeccion checklist solapas rt calle ascensor',
      action: () => onNavigate('inspeccion'),
    },
    {
      id: 'nav-eca',
      group: 'Navegación',
      title: 'Portal ECA (Conservadoras)',
      subtitle: 'Cobertura mensual, alertas críticas y WhatsApp',
      keywords: 'eca conservadora cobertura alerta whatsapp',
      action: () => onNavigate('eca'),
    },
    {
      id: 'nav-secretaria',
      group: 'Navegación',
      title: 'Secretaría (Edificios y Máquinas)',
      subtitle: 'Alta de consorcios, fichas técnicas y roles',
      keywords: 'secretaria consorcios edificios maquinas roles',
      action: () => onNavigate('secretaria'),
    },
    {
      id: 'nav-mapa-sin-conexion',
      group: 'Navegación',
      title: 'Mapa sin conexión',
      subtitle: 'Mapa de CABA para bajar al celular y usar sin señal',
      keywords: 'mapa sin conexion offline senal descargar celular caba',
      action: () => onNavigate('mapa-sin-conexion'),
    },
  ];
}
