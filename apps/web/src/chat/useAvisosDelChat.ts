import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activarAvisos,
  armarAviso,
  decidirAvisos,
  desactivarAvisos,
  estadoDeAvisos,
  mostrarAviso,
  salaDeLaDireccion,
  type EstadoAvisos,
  type RespuestaNoLeidos,
} from './avisos';
import { conversacionVista } from './visto';

export interface AvisosDelChat {
  estado: EstadoAvisos;
  /** Pide permiso al navegador y activa los avisos: solo se llama cuando la persona toca el botón. */
  activar: () => Promise<void>;
  desactivar: () => void;
  /** Se llama con cada respuesta de «mensajes sin leer»: avisa de lo que llegó desde la anterior. */
  procesar: (respuesta: RespuestaNoLeidos) => void;
}

/**
 * Los avisos del navegador del chat (HU-19 RF-10). Nunca pide permiso por su cuenta. Con los avisos activados, por cada mensaje nuevo de otra persona
 * muestra un aviso, salvo que la persona esté mirando esa conversación con la pestaña a la vista. Al tocar un aviso (la página o el service worker) se abre esa
 * conversación con `abrirConversacion`.
 */
export function useAvisosDelChat(usuarioId: string, habilitado: boolean, abrirConversacion: (sala: string) => void): AvisosDelChat {
  const [estado, setEstado] = useState<EstadoAvisos>(() => (habilitado ? estadoDeAvisos(usuarioId) : 'desactivados'));
  const baseRef = useRef<Record<string, string> | null>(null);
  const abrirRef = useRef(abrirConversacion);
  abrirRef.current = abrirConversacion;

  // El permiso lo puede cambiar la persona en los ajustes del navegador: se vuelve a mirar al volver a la pestaña
  useEffect(() => {
    if (!habilitado) return undefined;
    const revisar = () => setEstado(estadoDeAvisos(usuarioId));
    revisar();
    window.addEventListener('focus', revisar);
    document.addEventListener('visibilitychange', revisar);
    return () => {
      window.removeEventListener('focus', revisar);
      document.removeEventListener('visibilitychange', revisar);
    };
  }, [habilitado, usuarioId]);

  // Al tocar un aviso con la aplicación abierta, el service worker pide abrir la conversación
  useEffect(() => {
    if (!habilitado || typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined;
    const alMensaje = (evento: MessageEvent) => {
      const datos = evento.data as { tipo?: unknown; sala?: unknown } | null;
      if (datos && datos.tipo === 'abrir-chat' && typeof datos.sala === 'string') abrirRef.current(datos.sala);
    };
    navigator.serviceWorker.addEventListener('message', alMensaje);
    return () => navigator.serviceWorker.removeEventListener('message', alMensaje);
  }, [habilitado]);

  // Al tocar un aviso con la aplicación cerrada, el service worker la abre en /?chat=<conversación>
  useEffect(() => {
    if (!habilitado) return;
    const sala = salaDeLaDireccion(window.location.search);
    if (!sala) return;
    const direccion = new URL(window.location.href);
    direccion.searchParams.delete('chat');
    window.history.replaceState(null, '', `${direccion.pathname}${direccion.search}${direccion.hash}`);
    abrirRef.current(sala);
  }, [habilitado]);

  const procesar = useCallback(
    (respuesta: RespuestaNoLeidos) => {
      const { avisos, siguiente } = decidirAvisos(baseRef.current, respuesta.conversaciones ?? [], {
        visible: document.visibilityState === 'visible',
        conversacionVista: conversacionVista(),
      });
      baseRef.current = siguiente; // la base se actualiza siempre: al activar los avisos no se muestra lo que ya estaba
      if (estadoDeAvisos(usuarioId) !== 'activados') return;
      for (const aviso of avisos) void mostrarAviso(armarAviso(aviso), (sala) => abrirRef.current(sala));
    },
    [usuarioId],
  );

  const activar = useCallback(async () => {
    setEstado(await activarAvisos(usuarioId));
  }, [usuarioId]);

  const desactivar = useCallback(() => {
    setEstado(desactivarAvisos(usuarioId));
  }, [usuarioId]);

  return { estado, activar, desactivar, procesar };
}
