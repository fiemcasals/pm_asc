import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { etiquetaDeRol } from './etiquetaRol';

// HU-19 RF-03 — la Secretaría figura como contacto del chat: su rol se nombra bien en la insignia y en la lista.
describe('etiquetaDeRol (etiqueta de cada rol en el chat)', () => {
  it('nombra a la Secretaría «Secretaría», no con el valor interno «secretaria»', () => {
    expect(etiquetaDeRol('secretaria')).toBe('Secretaría');
  });

  it('conserva las etiquetas de los demás roles del chat', () => {
    expect(etiquetaDeRol('firmante')).toBe('Ing. Legal');
    expect(etiquetaDeRol('rt_calle')).toBe('Técnico RT');
    expect(etiquetaDeRol('administrador')).toBe('Admin');
  });

  it('sin rol devuelve texto vacío y un rol desconocido se muestra tal cual', () => {
    expect(etiquetaDeRol(undefined)).toBe('');
    expect(etiquetaDeRol(null)).toBe('');
    expect(etiquetaDeRol('')).toBe('');
    expect(etiquetaDeRol('otro_rol')).toBe('otro_rol');
  });
});

describe('la pantalla del chat usa esa etiqueta y la insignia de la Secretaría tiene estilo propio', () => {
  const vista = readFileSync(fileURLToPath(new URL('./ChatOperativoView.tsx', import.meta.url)), 'utf8');
  const estilos = readFileSync(fileURLToPath(new URL('./chat.css', import.meta.url)), 'utf8');

  it('la vista nombra los roles con etiquetaDeRol (insignia propia, de cada contacto y de cada mensaje)', () => {
    expect(vista).toContain("from './etiquetaRol'");
    expect(vista.match(/etiquetaDeRol\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(vista).not.toContain('rolLabel');
  });

  it('hay estilo para la insignia de la Secretaría', () => {
    expect(estilos).toMatch(/\.chat-badge-rol\.secretaria\s*\{/);
  });
});
