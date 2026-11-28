// HU-17 RF-12 (memoriaDeFotos.ts) — la foto de la alerta de una parada se pide aparte, una sola vez. La API la sirve con la sesión (un <img src> no manda el
// encabezado de la sesión), así que la pantalla la baja con fetch, la guarda en memoria y la muestra desde ahí. Además la API la marca para que
// el navegador la guarde un año: si se recarga la página, tampoco se vuelve a bajar.
import { fetchConSesion, leerPerfil } from '../auth/sesion';

/** Cuántas fotos se guardan en memoria a la vez: las más viejas se sueltan. */
export const MAXIMO_FOTOS_EN_MEMORIA = 60;

/** ¿Es la ruta de la foto de un reporte de parada (la que trae la alerta en `fotoRuta`)? */
export function esRutaDeFotoDeParada(ruta: string | null | undefined): ruta is string {
  return typeof ruta === 'string' && /^\/api\/paradas\/[A-Za-z0-9-]+\/foto$/.test(ruta);
}

export interface CacheDeFotos {
  /**
   * La dirección para mostrar la foto. Pide cada clave una sola vez aunque se la pida muchas veces; si falla, la próxima vez se vuelve a intentar.
   * `clave` identifica quién la pide (ver `claveDeFoto`): lo que bajó un usuario no se le muestra a otro que inicie sesión en la misma pestaña.
   */
  obtener(clave: string, ruta: string): Promise<string>;
  /** Cuántas fotos hay guardadas. */
  cantidad(): number;
  /** Suelta todas (por ejemplo al cerrar sesión). */
  vaciar(): void;
}

export function crearCacheDeFotos(
  pedir: (ruta: string) => Promise<Blob>,
  crearUrl: (b: Blob) => string = (b) => URL.createObjectURL(b),
  soltarUrl: (u: string) => void = (u) => URL.revokeObjectURL(u),
  maximo = MAXIMO_FOTOS_EN_MEMORIA,
): CacheDeFotos {
  const fotos = new Map<string, Promise<string>>();
  return {
    obtener(clave, ruta) {
      const ya = fotos.get(clave);
      if (ya) return ya;
      const pedido = pedir(ruta).then(crearUrl);
      fotos.set(clave, pedido);
      pedido.catch(() => {
        if (fotos.get(clave) === pedido) fotos.delete(clave);
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

/** Baja la foto con la sesión del usuario. */
export async function pedirFotoConSesion(ruta: string): Promise<Blob> {
  const res = await fetchConSesion(ruta);
  if (!res.ok) throw new Error(`No se pudo bajar la foto (error ${res.status})`);
  return res.blob();
}

/** La clave de una foto en la memoria: el usuario y la ruta. */
export function claveDeFoto(ruta: string, usuario: string | null | undefined = leerPerfil()?.usuario): string {
  return `${usuario ?? ''}|${ruta}`;
}

/** La memoria de fotos de las alertas de la pantalla. */
export const fotosDeAlertas: CacheDeFotos = crearCacheDeFotos(pedirFotoConSesion);
