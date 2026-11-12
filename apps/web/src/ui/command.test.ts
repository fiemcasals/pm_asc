import { describe, expect, it } from 'vitest';
import { filterCommandItems, type CommandItem } from './command';

const SAMPLE_ITEMS: CommandItem[] = [
  {
    id: 'nav-firmante',
    group: 'Navegación',
    title: 'Portal Firmante (RT Legal)',
    subtitle: 'Liquidación y firma AGC',
    action: () => undefined,
  },
  {
    id: 'cons-1',
    group: 'Consorcios',
    title: 'Consorcio Corrientes 1234',
    subtitle: 'Av. Corrientes 1234, CABA',
    badge: '2 máq.',
    action: () => undefined,
  },
  {
    id: 'maq-1',
    group: 'Máquinas',
    title: 'M1 · Ascensor Principal (Derecha)',
    subtitle: 'Av. Corrientes 1234 — Conservación Porteña',
    badge: 'Recorrida',
    action: () => undefined,
  },
];

describe('CommandPalette filterCommandItems', () => {
  it('devuelve todos los ítems cuando la búsqueda está vacía', () => {
    expect(filterCommandItems(SAMPLE_ITEMS, '')).toHaveLength(3);
    expect(filterCommandItems(SAMPLE_ITEMS, '   ')).toHaveLength(3);
  });

  it('filtra ignorando mayúsculas y tildes', () => {
    expect(filterCommandItems(SAMPLE_ITEMS, 'liquidacion').map((i) => i.id)).toEqual([
      'nav-firmante',
    ]);
    expect(filterCommandItems(SAMPLE_ITEMS, 'portena').map((i) => i.id)).toEqual(['maq-1']);
  });

  it('encuentra máquinas por código AGC o dirección', () => {
    expect(filterCommandItems(SAMPLE_ITEMS, 'M1').map((i) => i.id)).toEqual(['maq-1']);
    expect(filterCommandItems(SAMPLE_ITEMS, 'corrientes').map((i) => i.id)).toEqual([
      'cons-1',
      'maq-1',
    ]);
  });
});

