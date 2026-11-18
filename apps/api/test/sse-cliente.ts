import http from 'node:http';

export interface MensajeSseRecibido {
  event: string;
  data: unknown;
}

export interface CanalAbierto {
  status: number;
  contentType: string;
  /** Todo lo que llegó por el canal, en orden (los `ping` también). */
  mensajes: MensajeSseRecibido[];
  /** Se resuelve cuando la conexión se cierra, la haya cerrado el servidor o el cliente. */
  cerrado: Promise<void>;
  /** Espera a que lleguen `cantidad` mensajes de ese tipo (rechaza si no llegan en `ms`). */
  esperar(tipo: string, cantidad?: number, ms?: number): Promise<MensajeSseRecibido[]>;
  cerrar(): void;
}

/**
 * Abre un canal SSE con una conexión HTTP real (supertest no sirve para respuestas que no terminan) y lo va leyendo. Con `token`
 * manda `Authorization: Bearer`. Si el servidor responde con otra cosa que un flujo (401, 403), `status` lo dice y `cerrado` se resuelve.
 */
export function abrirCanal(port: number, token?: string, ruta = '/api/fallas-criticas/eventos'): Promise<CanalAbierto> {
  return new Promise((resolver, rechazar) => {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const mensajes: MensajeSseRecibido[] = [];
    let marcarCerrado!: () => void;
    const cerrado = new Promise<void>((r) => (marcarCerrado = r));

    const req = http.get({ host: '127.0.0.1', port, path: ruta, headers }, (res) => {
      const esFlujo = String(res.headers['content-type'] ?? '').includes('text/event-stream');
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        if (!esFlujo) return;
        buffer += chunk;
        let corte: number;
        while ((corte = buffer.indexOf('\n\n')) >= 0) {
          const bloque = buffer.slice(0, corte);
          buffer = buffer.slice(corte + 2);
          const lineas = bloque.split('\n');
          const event = lineas.find((l) => l.startsWith('event: '))?.slice(7);
          const data = lineas.find((l) => l.startsWith('data: '))?.slice(6);
          if (event) mensajes.push({ event, data: data ? JSON.parse(data) : undefined });
        }
      });
      res.on('close', marcarCerrado);
      res.on('error', marcarCerrado);

      const esperar = async (tipo: string, cantidad = 1, ms = 3000) => {
        const limite = Date.now() + ms;
        for (;;) {
          const hay = mensajes.filter((m) => m.event === tipo);
          if (hay.length >= cantidad) return hay;
          if (Date.now() > limite) throw new Error(`No llegaron ${cantidad} mensaje(s) «${tipo}» en ${ms} ms (llegaron: ${JSON.stringify(mensajes.map((m) => m.event))})`);
          await new Promise((r) => setTimeout(r, 10));
        }
      };

      resolver({
        status: res.statusCode ?? 0,
        contentType: String(res.headers['content-type'] ?? ''),
        mensajes,
        cerrado,
        esperar,
        cerrar: () => req.destroy(),
      });
    });
    req.on('error', (e) => {
      if ((e as NodeJS.ErrnoException).code === 'ECONNRESET') marcarCerrado();
      else rechazar(e);
    });
  });
}
