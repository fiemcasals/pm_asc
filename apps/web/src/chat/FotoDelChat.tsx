import React, { useEffect, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { CacheDeFotos, crearCacheDeFotos } from './fotosDelChat';
import { esTeclaDeAbrir } from './foto';

// HU-19 RF-05 — la miniatura de la foto de un mensaje: la pide a la API una sola vez (con la sesión) y la muestra; al tocarla se agranda.

/** Una memoria de fotos por usuario: si entra otra persona en el mismo navegador, lo de la anterior se suelta. */
let cache: { usuarioId: string; fotos: CacheDeFotos } | null = null;

function fotosDe(usuarioId: string): CacheDeFotos {
  if (!cache || cache.usuarioId !== usuarioId) {
    cache?.fotos.vaciar();
    cache = {
      usuarioId,
      fotos: crearCacheDeFotos(async (ruta) => {
        const res = await fetchConSesion(ruta);
        if (!res.ok) throw new Error(`No se pudo traer la foto (${res.status})`);
        return res.blob();
      }),
    };
  }
  return cache.fotos;
}

interface Props {
  ruta: string;
  usuarioId: string;
  onAbrir: (src: string, origen: HTMLElement) => void;
  onCargada: () => void;
}

export function FotoDelChat({ ruta, usuarioId, onAbrir, onCargada }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setFallo(false);
    fotosDe(usuarioId)
      .obtener(ruta)
      .then((u) => vigente && setSrc(u))
      .catch(() => vigente && setFallo(true));
    return () => {
      vigente = false;
    };
  }, [ruta, usuarioId, intento]);

  if (fallo) {
    return (
      <button type="button" className="chat-foto-reintentar" onClick={() => setIntento((n) => n + 1)} data-testid="chat-foto-reintentar">
        No se pudo cargar la foto. Tocá para reintentar.
      </button>
    );
  }
  if (!src) return <div className="chat-foto-cargando" data-testid="chat-foto-cargando">Cargando foto…</div>;
  return (
    <img
      src={src}
      alt="Adjunto del chat"
      tabIndex={0}
      role="button"
      aria-label="Ver la foto ampliada"
      onClick={(e) => onAbrir(src, e.currentTarget)}
      onKeyDown={(e) => {
        if (esTeclaDeAbrir(e.key)) {
          e.preventDefault();
          onAbrir(src, e.currentTarget);
        }
      }}
      onLoad={onCargada}
      data-testid="chat-foto-mensaje"
    />
  );
}
