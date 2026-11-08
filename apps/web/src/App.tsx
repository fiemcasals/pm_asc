import React, { useEffect, useState } from 'react';
import { puedeSalir } from './consorcios/roles';
import { SecretariaView } from './consorcios/SecretariaView';
import { PortalEca } from './eca/PortalEca';
import { PortalFirmante } from './firmante/PortalFirmante';
import { fetchHealth, type HealthState } from './health';

type SwState = 'verificando' | 'registrado' | 'no-soportado' | 'no-registrado';
type Vista = 'firmante' | 'eca' | 'secretaria' | 'sistema';

function useServiceWorkerState(): SwState {
  const [state, setState] = useState<SwState>('verificando');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState('no-soportado');
      return;
    }
    let active = true;
    const timeout = setTimeout(() => active && setState('no-registrado'), 10_000);
    navigator.serviceWorker.ready.then(() => {
      clearTimeout(timeout);
      if (active) setState('registrado');
    });
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  return state;
}

const SW_LABEL: Record<SwState, string> = {
  verificando: 'Verificando…',
  registrado: 'Registrado',
  'no-soportado': 'No soportado por este navegador',
  'no-registrado': 'No registrado',
};

export function App() {
  const [vista, setVista] = useState<Vista>('firmante');
  const [health, setHealth] = useState<HealthState | null>(null);
  const swState = useServiceWorkerState();

  const irA = (destino: Vista) => {
    if (destino === vista || puedeSalir()) setVista(destino);
  };

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  return (
    <main className="page">
      <header className="app-header">
        <div>
          <h1>Inspecciones de Ascensores</h1>
          <p className="subtitle">Sistema Operativo y Control AGC — CABA</p>
        </div>

        <nav className="nav-tabs" aria-label="Secciones del sistema">
          <button
            className={`tab-btn ${vista === 'firmante' ? 'active' : ''}`}
            onClick={() => irA('firmante')}
            data-testid="tab-firmante"
          >
            Portal Firmante (RT Legal)
          </button>
          <button
            className={`tab-btn ${vista === 'eca' ? 'active' : ''}`}
            onClick={() => irA('eca')}
            data-testid="tab-eca"
          >
            Portal ECA (Conservadoras)
          </button>
          <button
            className={`tab-btn ${vista === 'secretaria' ? 'active' : ''}`}
            onClick={() => irA('secretaria')}
            data-testid="tab-secretaria"
          >
            Secretaría (Edificios y Máquinas)
          </button>
          <button
            className={`tab-btn ${vista === 'sistema' ? 'active' : ''}`}
            onClick={() => irA('sistema')}
            data-testid="tab-sistema"
          >
            Estado del Sistema
          </button>
        </nav>
      </header>

      {vista === 'firmante' && <PortalFirmante />}
      {vista === 'eca' && <PortalEca />}
      {vista === 'secretaria' && <SecretariaView />}
      {vista === 'sistema' && (
        <section className="card" aria-labelledby="estado-titulo">
          <h2 id="estado-titulo">Estado del sistema</h2>
          <dl>
            <dt>API</dt>
            <dd data-testid="estado-api">
              {health === null
                ? 'Verificando…'
                : health.kind === 'api-error'
                  ? health.message
                  : 'En línea'}
            </dd>

            <dt>Base de datos</dt>
            <dd data-testid="estado-db">
              {health === null && 'Verificando…'}
              {health?.kind === 'ok' && `En línea (PostGIS ${health.postgis})`}
              {health?.kind === 'db-error' && health.message}
              {health?.kind === 'api-error' && 'Sin datos'}
            </dd>

            <dt>Service worker</dt>
            <dd data-testid="estado-sw">{SW_LABEL[swState]}</dd>
          </dl>
        </section>
      )}
    </main>
  );
}
