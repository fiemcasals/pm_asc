import { useEffect, useRef, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import type { RespuestaNoLeidos } from './avisos';
import { EVENTO_LECTURAS, INTERVALO_NO_LEIDOS_MS, tituloBase, tituloConNoLeidos } from './noLeidos';

/**
 * Cuántos mensajes sin leer tiene en total quien está usando la aplicación (HU-19 RF-09). Lo pregunta al servidor cada pocos segundos, esté en la
 * pantalla que esté, y apenas la pantalla del chat marca algo como leído. Mientras haya, el título de la pestaña del navegador lo lleva por delante.
 * Si `habilitado` es falso (por ejemplo, una ECA, que no tiene chat) no pregunta nada y devuelve 0.
 * `alRecibir` recibe cada respuesta (el total y, por conversación, el último mensaje sin leer): de ahí salen los avisos del navegador (HU-19 RF-10).
 */
export function useNoLeidosChat(habilitado: boolean, alRecibir?: (respuesta: RespuestaNoLeidos) => void): number {
  const [total, setTotal] = useState(0);
  const alRecibirRef = useRef(alRecibir);
  alRecibirRef.current = alRecibir;

  useEffect(() => {
    if (!habilitado) return undefined;
    let vivo = true;
    const cargar = async () => {
      try {
        const res = await fetchConSesion('/api/chat/no-leidos');
        if (!res.ok || !vivo) return;
        const cuerpo = (await res.json()) as RespuestaNoLeidos;
        if (!vivo) return;
        setTotal(typeof cuerpo.total === 'number' && cuerpo.total > 0 ? cuerpo.total : 0);
        alRecibirRef.current?.(cuerpo);
      } catch {
        // Sin señal: se conserva el último total y se vuelve a preguntar en unos segundos
      }
    };
    void cargar();
    const intervalo = setInterval(() => void cargar(), INTERVALO_NO_LEIDOS_MS);
    window.addEventListener(EVENTO_LECTURAS, cargar);
    return () => {
      vivo = false;
      clearInterval(intervalo);
      window.removeEventListener(EVENTO_LECTURAS, cargar);
    };
  }, [habilitado]);

  useEffect(() => {
    if (!habilitado) return undefined;
    const base = tituloBase(document.title);
    document.title = tituloConNoLeidos(base, total);
    return () => {
      document.title = base;
    };
  }, [habilitado, total]);

  return habilitado ? total : 0;
}
