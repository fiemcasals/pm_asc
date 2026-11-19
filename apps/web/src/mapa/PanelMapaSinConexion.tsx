import React from 'react';
import { MapaBase } from './MapaBase';
import './mapa.css';

/**
 * «Mapa de CABA sin conexión», en el Estado del sistema: muestra el mapa base y deja bajarlo al celular con wifi para
 * usarlo después sin señal. Los mapas de las demás pantallas se apoyan en este mismo archivo.
 */
export function PanelMapaSinConexion(): React.JSX.Element {
  return (
    <section className="card panel-mapa" aria-labelledby="panel-mapa-titulo" data-testid="panel-mapa-sin-conexion">
      <div>
        <span className="neo-bento-kicker">MAPA · SIN CONEXIÓN</span>
        <h3 id="panel-mapa-titulo" className="portal-title">
          Mapa de CABA para usar sin señal
        </h3>
        <p className="panel-mapa__nota">
          Las calles se dibujan desde un archivo propio de la app, sin pedirle nada a Internet. Bajalo una vez con wifi y el mapa se ve completo
          aunque no tengas señal.
        </p>
      </div>
      <MapaBase testId="mapa-sistema" alto={380} ariaLabel="Mapa base de CABA" gestosCooperativos />
    </section>
  );
}
