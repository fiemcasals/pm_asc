import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { actualizacionFallida, avisoDeEnvio, falloDeRespuesta, motivoDelRechazo, textoDeConexion } from './envio';

// HU-19 RF-06 — el chat dice cuándo un mensaje no se envió y muestra el estado real de la conexión.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
const respuesta = (status: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('criterio 1: sin red o con un error del servidor, aviso con «Reintentar»', () => {
  it('sin red (no hubo respuesta)', async () => {
    const fallo = await falloDeRespuesta(null);
    expect(fallo).toEqual({ tipo: 'red' });
    expect(avisoDeEnvio(fallo!)).toEqual({ texto: 'No se pudo enviar el mensaje: no hay conexión. Tu mensaje sigue en la caja.', reintentar: true });
  });

  it.each([500, 502, 503, 504])('un error %i del servidor', async (status) => {
    const fallo = await falloDeRespuesta(respuesta(status, { message: 'Internal server error' }));
    expect(fallo).toEqual({ tipo: 'servidor', status });
    expect(avisoDeEnvio(fallo!)).toEqual({ texto: 'No se pudo enviar el mensaje: el servidor tuvo un problema. Tu mensaje sigue en la caja.', reintentar: true });
  });

  it('si salió bien no hay aviso', async () => {
    expect(await falloDeRespuesta(respuesta(201, { id: 'x' }))).toBeNull();
  });
});

describe('criterio 2: un rechazo del servidor (400) muestra el motivo', () => {
  it('con el mensaje que manda la API', async () => {
    const fallo = await falloDeRespuesta(respuesta(400, { message: 'El mensaje no puede superar los 2000 caracteres.', statusCode: 400 }));
    expect(avisoDeEnvio(fallo!)).toEqual({ texto: 'No se envió el mensaje: El mensaje no puede superar los 2000 caracteres.', reintentar: false });
  });

  it('si el mensaje viene como lista, los junta', () => {
    expect(motivoDelRechazo({ message: ['El destinatario no es válido.', 'Falta el texto.'] })).toBe('El destinatario no es válido. Falta el texto.');
  });

  it('si no viene un motivo, uno genérico en lenguaje claro (nunca «undefined» ni el código)', async () => {
    for (const cuerpo of [{}, { message: '' }, null, 'no es JSON']) {
      const fallo = await falloDeRespuesta(respuesta(400, cuerpo === null ? undefined : cuerpo));
      expect(avisoDeEnvio(fallo!).texto).toBe('No se envió el mensaje: el servidor no lo aceptó. Revisá el texto o la foto e intentá de nuevo.');
    }
  });
});

describe('criterio 3: la cabecera dice el estado real', () => {
  it('«Conectado», «Sin conexión, reintentando…» o «Conectando…» mientras llega la primera respuesta', () => {
    expect(textoDeConexion('conectado')).toBe('Conectado');
    expect(textoDeConexion('sin_conexion')).toBe('Sin conexión, reintentando…');
    expect(textoDeConexion('conectando')).toBe('Conectando…');
  });

  it.each([
    [null, true],
    [500, true],
    [503, true],
    [200, false],
    [400, false],
    [403, false],
  ])('una actualización con %s cuenta como sin conexión: %s', (status, esperado) => {
    expect(actualizacionFallida(status)).toBe(esperado);
  });

  it('la pantalla ya no tiene «Equipo conectado» ni «En línea» fijos, y el estado sale de la última actualización', () => {
    const vista = leer('./ChatOperativoView.tsx');
    expect(vista).not.toContain("'Equipo conectado'");
    expect(vista).not.toContain('· En línea');
    expect(vista).toContain("setConexion(actualizacionFallida(res.status) ? 'sin_conexion' : 'conectado');");
    expect(vista).toContain("if (!(err instanceof SesionRevocadaError)) setConexion('sin_conexion');");
    expect(vista).toContain('data-testid="chat-estado-conexion"');
  });
});

describe('criterios 1, 2 y 4 en la pantalla', () => {
  const vista = leer('./ChatOperativoView.tsx');
  it('el aviso va debajo de la caja de texto, con «Reintentar» solo cuando sirve', () => {
    expect(vista).toMatch(/<\/form>\s*\{\/\* HU-19 RF-06[^}]*\*\/\}\s*\{avisoEnvio && \(/);
    expect(vista).toContain('{avisoEnvio.reintentar && (');
    expect(vista).toContain('onClick={() => void handleEnviar()}');
  });
  it('el texto se borra solo si el envío salió bien', () => {
    const enviar = vista.slice(vista.indexOf('const handleEnviar'), vista.indexOf('const canalActivo'));
    expect(enviar.match(/setTexto\(''\)/g)).toHaveLength(1);
    expect(enviar.indexOf("setTexto('')")).toBeGreaterThan(enviar.indexOf('if (res.ok) {'));
    expect(enviar.indexOf("setTexto('')")).toBeLessThan(enviar.indexOf('} else {'));
  });
  it('criterio 4: mientras se envía, Enviar queda deshabilitado y un segundo envío no sale', () => {
    expect(vista).toContain('disabled={enviando || (!texto.trim() && !fotoBase64)}');
    expect(vista).toMatch(/if \(enviandoRef\.current\) return;\s*enviandoRef\.current = true;/);
    expect(vista).toMatch(/finally \{\s*enviandoRef\.current = false;\s*setEnviando\(false\);/);
  });
});
