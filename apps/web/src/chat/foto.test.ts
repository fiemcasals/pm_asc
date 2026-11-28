import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { esTeclaDeAbrir, esTeclaDeCerrar } from './foto';

// HU-19 RF-08 — la foto agrandada del chat y que ninguna parte del chat use la hora del dispositivo.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');

describe('las teclas de la foto agrandada (criterio 3)', () => {
  it('Escape (y «Esc» de los navegadores viejos) cierran la foto', () => {
    expect(esTeclaDeCerrar('Escape')).toBe(true);
    expect(esTeclaDeCerrar('Esc')).toBe(true);
  });
  it.each(['Enter', ' ', 'Tab', 'a', 'ArrowLeft', 'escape', 'ESCAPE', ''])('«%s» no cierra la foto', (t) => expect(esTeclaDeCerrar(t)).toBe(false));
  it('Enter y espacio abren la foto desde la miniatura enfocada, como un botón', () => {
    expect(esTeclaDeAbrir('Enter')).toBe(true);
    expect(esTeclaDeAbrir(' ')).toBe(true);
    expect(esTeclaDeAbrir('Spacebar')).toBe(true);
  });
  it.each(['Escape', 'Tab', 'a', 'ArrowDown', ''])('«%s» no abre la foto', (t) => expect(esTeclaDeAbrir(t)).toBe(false));
});

describe('la pantalla del chat (criterios 1 a 3)', () => {
  const vista = leer('./ChatOperativoView.tsx');
  const estilos = leer('./chat.css');

  describe('criterio 1 y 4: la hora, en 24 horas y con el formato común de la aplicación', () => {
    it('la hora de cada mensaje sale de hora() de fechas/formato, no del dispositivo', () => {
      expect(vista).toContain("import { hora } from '../fechas/formato';");
      expect(vista).toContain('{hora(m.creadoEn)}');
    });
    it('la hora de la lista de chats sale de horaOFecha(): hoy la hora, ayer «Ayer» y antes la fecha', () => {
      expect(vista).toContain("import { conSeparadores, horaOFecha } from './dias';");
      expect(vista).toContain('{horaOFecha(c.ultimoMensajeHora)}');
    });
    it('ninguna parte del chat usa el formato de hora del dispositivo (toLocaleTimeString, toLocaleString, toLocaleDateString)', () => {
      const carpeta = fileURLToPath(new URL('.', import.meta.url));
      const malos: string[] = [];
      for (const nombre of readdirSync(carpeta)) {
        const ruta = join(carpeta, nombre);
        if (!statSync(ruta).isFile() || !/\.tsx?$/.test(nombre) || /\.test\.tsx?$/.test(nombre)) continue;
        if (/toLocale(Time|Date)?String\(/.test(readFileSync(ruta, 'utf8'))) malos.push(nombre);
      }
      expect(malos).toEqual([]);
    });
  });

  describe('criterio 2: el día de los mensajes', () => {
    it('el hilo se arma con los separadores de día', () => {
      expect(vista).toContain('conSeparadores(mensajes).map((elemento) => {');
      expect(vista).toContain("if (elemento.tipo === 'dia') {");
      expect(vista).toContain('const m = elemento.mensaje;');
    });
    it('el separador muestra «Hoy», «Ayer» o la fecha, tiene su identificador de prueba y no cuenta como un mensaje', () => {
      expect(vista).toMatch(/className="chat-separador-dia" data-testid="chat-separador-dia" role="separator">\s*<span>\{elemento\.etiqueta\}<\/span>/);
      expect(vista.match(/data-testid="chat-globo-mensaje"/g)).toHaveLength(1);
    });
    it('el separador tiene estilo', () => {
      expect(estilos).toMatch(/\.chat-separador-dia\s*\{/);
      expect(estilos).toMatch(/\.chat-separador-dia span\s*\{/);
    });
  });

  describe('criterio 3: la foto agrandada', () => {
    it('es una ventana de diálogo, con título accesible', () => {
      expect(vista).toContain('role="dialog" aria-modal="true" aria-label="Foto ampliada"');
    });
    it('tiene un botón «Cerrar» visible, con su identificador de prueba', () => {
      expect(vista).toMatch(/onClick=\{cerrarFoto\} ref=\{botonCerrarFotoRef\} data-testid="chat-modal-cerrar">\s*✕ Cerrar\s*<\/button>/);
      expect(estilos).toMatch(/\.chat-modal-cerrar\s*\{[^}]*padding: 7px 14px;/);
    });
    it('Escape la cierra: se escucha el teclado solo mientras la foto está abierta', () => {
      expect(vista).toContain("if (!fotoModal) return undefined;");
      expect(vista).toContain("document.addEventListener('keydown', alTeclear);");
      expect(vista).toContain("document.removeEventListener('keydown', alTeclear);");
      expect(vista).toMatch(/if \(esTeclaDeCerrar\(e\.key\)\) \{\s*e\.preventDefault\(\);\s*cerrarFoto\(\);/);
    });
    it('al abrirse, el foco entra en «Cerrar», y Tab no se escapa a lo que quedó atrás', () => {
      expect(vista).toContain('botonCerrarFotoRef.current?.focus();\n    const alTeclear');
      expect(vista).toMatch(/else if \(e\.key === 'Tab'\) \{\s*e\.preventDefault\(\);[^\n]*\n\s*botonCerrarFotoRef\.current\?\.focus\(\);/);
    });
    it('al cerrarse, el foco vuelve a la miniatura desde la que se abrió (si sigue en pantalla)', () => {
      expect(vista).toContain('fotoOrigenRef.current = origen;');
      expect(vista).toMatch(/const origen = fotoOrigenRef\.current;\s*fotoOrigenRef\.current = null;\s*if \(origen && origen\.isConnected\) origen\.focus\(\);/);
    });
    it('Escape, «Cerrar» y tocar el fondo cierran por el mismo camino; tocar la foto no cierra', () => {
      expect(vista).toContain('<div className="chat-modal-overlay" onClick={cerrarFoto}');
      expect(vista).toContain('<div className="chat-modal-content" onClick={(e) => e.stopPropagation()}>');
      expect(vista.match(/cerrarFoto\(\)/g)).toHaveLength(1);
    });
    // HU-19 RF-05: la miniatura vive en FotoDelChat.tsx (pide la foto aparte del hilo) y le avisa a la vista con onAbrir
    it('la miniatura se puede enfocar y abrir con el teclado, y recuerda desde cuál se abrió', () => {
      const miniatura = leer('./FotoDelChat.tsx');
      expect(miniatura).toContain('tabIndex={0}');
      expect(miniatura).toContain('role="button"');
      expect(miniatura).toContain('aria-label="Ver la foto ampliada"');
      expect(miniatura).toContain('onClick={(e) => onAbrir(src, e.currentTarget)}');
      expect(miniatura).toMatch(/if \(esTeclaDeAbrir\(e\.key\)\) \{\s*e\.preventDefault\(\);\s*onAbrir\(src, e\.currentTarget\);/);
      expect(vista).toContain('onAbrir={abrirFoto}');
    });
    it('el foco se ve (para quien usa el teclado)', () => {
      expect(estilos).toMatch(/\.chat-modal-cerrar:focus-visible,\s*\.chat-globo-foto img:focus-visible\s*\{\s*outline: 3px solid/);
    });
  });
});
