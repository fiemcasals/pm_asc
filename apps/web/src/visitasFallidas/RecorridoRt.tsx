import React, { useEffect, useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { ConstanciaVisitaFallida } from './ConstanciaVisitaFallida';
import { type EdificioRecorrido, cargarRecorrido } from './constanciaVisita';

/**
 * Los edificios que el RT de Calle tiene pendientes hoy, cada uno con «No se pudo realizar la inspección» (HU-07 RF-06).
 * Al guardar la constancia, el edificio desaparece de la lista por ese día. (El mapa con pines llega con HU-16.)
 */
export function RecorridoRt() {
  const [edificios, setEdificios] = useState<EdificioRecorrido[] | null>(null);
  const [abierto, setAbierto] = useState<EdificioRecorrido | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    void cargarRecorrido(fetchConSesion).then((r) => activo && setEdificios(r));
    return () => {
      activo = false;
    };
  }, []);

  const sacar = (id: string) => setEdificios((lista) => (lista ?? []).filter((e) => e.id !== id));

  if (abierto) {
    return (
      <ConstanciaVisitaFallida
        edificio={abierto}
        onCancelar={() => setAbierto(null)}
        onGuardada={(n) => {
          setAviso(`Constancia guardada: ${abierto.nombre} suma la advertencia ${n}.`);
          sacar(abierto.id);
          setAbierto(null);
        }}
        onYaRegistrada={() => {
          sacar(abierto.id);
          setAbierto(null);
          setAviso(`${abierto.nombre} ya tiene una visita fallida de hoy.`);
        }}
      />
    );
  }

  return (
    <section className="recorrido-rt" aria-labelledby="recorrido-titulo" data-testid="recorrido-rt">
      <h3 id="recorrido-titulo">Edificios pendientes de hoy</h3>
      {aviso && (
        <p role="status" data-testid="recorrido-aviso">
          {aviso}
        </p>
      )}
      {edificios === null && <p className="portal-desc">Cargando tus edificios…</p>}
      {edificios?.length === 0 && <p className="portal-desc">No tenés edificios pendientes por hoy.</p>}
      <ul className="recorrido-lista">
        {edificios?.map((e) => (
          <li key={e.id} data-testid="recorrido-edificio">
            <strong>{e.nombre}</strong> — {e.direccion}{' '}
            <button type="button" className="btn btn-secondary" onClick={() => setAbierto(e)} data-testid="recorrido-no-se-pudo">
              No se pudo realizar la inspección
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
