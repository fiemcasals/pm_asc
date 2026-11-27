import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_MENSAJE } from './limites';

// HU-19 RF-04, criterio 4 — la caja de texto del chat no deja escribir más de lo que la API acepta.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');

describe('límite del texto de un mensaje del chat', () => {
  it('son 2.000 caracteres', () => {
    expect(MAX_CARACTERES_MENSAJE).toBe(2000);
  });

  it('es el mismo número que valida la API (si cambia uno, tiene que cambiar el otro)', () => {
    const tiposApi = leer('../../../api/src/chat/chat.types.ts');
    const enApi = /export const LIMITE_CONTENIDO = (\d+);/.exec(tiposApi);
    expect(enApi).not.toBeNull();
    expect(Number(enApi![1])).toBe(MAX_CARACTERES_MENSAJE);
  });

  it('la caja de texto de la pantalla usa ese límite', () => {
    const vista = leer('./ChatOperativoView.tsx');
    expect(vista).toContain("from './limites'");
    expect(vista).toMatch(/<input[^>]*?[\s\S]*?maxLength=\{MAX_CARACTERES_MENSAJE\}[\s\S]*?data-testid="chat-input-texto"/);
  });

  it('el límite está sobre la caja de texto del mensaje y no sobre otro campo', () => {
    const vista = leer('./ChatOperativoView.tsx');
    const fin = vista.indexOf('data-testid="chat-input-texto"');
    const inicio = vista.lastIndexOf('<input', fin);
    expect(fin).toBeGreaterThan(0);
    expect(inicio).toBeGreaterThan(0);
    expect(vista.slice(inicio, fin)).toContain('maxLength={MAX_CARACTERES_MENSAJE}');
    expect(vista.match(/maxLength=\{MAX_CARACTERES_MENSAJE\}/g)).toHaveLength(1);
  });
});
