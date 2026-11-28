// HU-19 RF-05 — las fotos del chat se piden aparte del hilo, una sola vez. La API las sirve con la sesión (no alcanza un <img src>, que no manda
// el encabezado de la sesión), así que la pantalla las baja con fetch, las guarda en memoria y las muestra desde ahí. Además la API las marca para
// que el navegador las guarde un año: si se recarga la página, tampoco se vuelven a bajar.

/** Cuántas fotos se guardan en memoria a la vez: las más viejas se sueltan. */
export const MAXIMO_FOTOS_EN_MEMORIA = 120;

export interface CacheDeFotos {
  /** La dirección para mostrar la foto. Pide cada ruta una sola vez aunque se la pida muchas veces; si falla, la próxima vez se vuelve a intentar. */
  obtener(ruta: string): Promise<string>;
  /** Cuántas fotos hay guardadas. */
  cantidad(): number;
  /** Suelta todas (al cerrar sesión). */
  vaciar(): void;
}

/** ¿Es una foto que hay que pedir a la API (y no una que ya está en la pantalla, como la vista previa)? */
export const esRutaDeFoto = (ruta: string): boolean => /^\/api\/chat\/mensajes\/[0-9a-f-]{36}\/foto$/i.test(ruta);

export function crearCacheDeFotos(
  pedir: (ruta: string) => Promise<Blob>,
  crearUrl: (b: Blob) => string = (b) => URL.createObjectURL(b),
  soltarUrl: (u: string) => void = (u) => URL.revokeObjectURL(u),
  maximo = MAXIMO_FOTOS_EN_MEMORIA,
): CacheDeFotos {
  const fotos = new Map<string, Promise<string>>();
  return {
    obtener(ruta) {
      if (!esRutaDeFoto(ruta)) return Promise.resolve(ruta);
      const ya = fotos.get(ruta);
      if (ya) return ya;
      const pedido = pedir(ruta).then(crearUrl);
      fotos.set(ruta, pedido);
      pedido.catch(() => {
        if (fotos.get(ruta) === pedido) fotos.delete(ruta);
      });
      while (fotos.size > maximo) {
        const [vieja, url] = fotos.entries().next().value as [string, Promise<string>];
        fotos.delete(vieja);
        void url.then(soltarUrl, () => undefined);
      }
      return pedido;
    },
    cantidad: () => fotos.size,
    vaciar() {
      for (const url of fotos.values()) void url.then(soltarUrl, () => undefined);
      fotos.clear();
    },
  };
}
