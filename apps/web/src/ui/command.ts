export type Vista = 'firmante' | 'eca' | 'secretaria' | 'sistema';
export type ThemeMode = 'dark' | 'light';

export interface CommandItem {
  id: string;
  group: 'Navegación' | 'Acciones' | 'Consorcios' | 'Máquinas';
  title: string;
  subtitle?: string;
  badge?: string;
  shortcut?: string;
  keywords?: string;
  action: () => void;
}

/** Filtra ítems de la paleta de comandos por término (insensible a mayúsculas y tildes). */
export function filterCommandItems(items: CommandItem[], query: string): CommandItem[] {
  const normalized = normalizeText(query);
  if (!normalized) return items;
  return items.filter((item) => {
    const haystack = normalizeText(
      [item.title, item.subtitle, item.badge, item.keywords, item.group].filter(Boolean).join(' '),
    );
    return haystack.includes(normalized);
  });
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

