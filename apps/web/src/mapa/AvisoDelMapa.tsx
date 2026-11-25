import React from 'react';

/** Cómo está el mapa base: lo que se ve encima del recuadro cuando no está dibujado. */
export type EstadoMapaBase = 'cargando' | 'listo' | 'sin-descargar' | 'sin-webgl' | 'sin-archivo' | 'error';

/**
 * El cartel que se pone sobre el mapa según su estado (nada si está listo). `sin-archivo` es cuando el servidor no tiene el archivo del
 * mapa: sin este aviso el mapa quedaba vacío y la app lo daba por listo.
 */
export function AvisoDelMapa({ estado, onReintentar }: { estado: EstadoMapaBase; onReintentar: () => void }) {
  if (estado === 'cargando') {
    return (
      <div className="mapa-base__aviso" role="status">
        Cargando el mapa…
      </div>
    );
  }
  if (estado === 'sin-descargar') {
    return (
      <div className="mapa-base__aviso mapa-base__aviso--bloqueo" role="alert" data-testid="mapa-sin-descargar">
        <strong>Mapa sin descargar: conectate a una red para bajarlo.</strong>
        <span>Sin señal no se puede dibujar el mapa hasta que se baje una vez.</span>
      </div>
    );
  }
  if (estado === 'sin-webgl') {
    return (
      <div className="mapa-base__aviso mapa-base__aviso--bloqueo" role="alert" data-testid="mapa-sin-webgl">
        <strong>Este dispositivo no puede dibujar el mapa.</strong>
        <span>Los edificios se ven igual en la lista.</span>
      </div>
    );
  }
  if (estado === 'sin-archivo') {
    return (
      <div className="mapa-base__aviso mapa-base__aviso--bloqueo" role="alert" data-testid="mapa-sin-archivo">
        <strong>El mapa no está disponible.</strong>
        <span>Falta cargar el archivo del mapa en el servidor: avisale al administrador.</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    );
  }
  if (estado === 'error') {
    return (
      <div className="mapa-base__aviso mapa-base__aviso--bloqueo" role="alert" data-testid="mapa-error">
        <strong>No se pudo dibujar el mapa.</strong>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    );
  }
  return null;
}
