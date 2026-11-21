import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConSesion, leerPerfil } from '../auth/sesion';
import { horaDeLosDatos } from '../rtmapa/mapaRt';
import { ConstanciaVisitaFallida } from './ConstanciaVisitaFallida';
import {
  type EdificioRecorrido,
  type ResultadoRecorrido,
  cargarRecorridoConRespaldo,
  sacarDelRecorridoGuardado,
} from './constanciaVisita';

type Estado = { tipo: 'cargando' } | ResultadoRecorrido;

/**
 * Los edificios que el RT de Calle tiene pendientes hoy, cada uno con «No se pudo realizar la inspección» (HU-07 RF-06).
 * Al guardar la constancia, el edificio desaparece de la lista por ese día.
 * Sin conexión muestra la última lista descargada con su hora, o un aviso con «Reintentar»; nunca se queda en «Cargando…» (HU-07 RF-07).
 */
export function RecorridoRt() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [abierto, setAbierto] = useState<EdificioRecorrido | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const montado = useRef(true);
  const usuario = leerPerfil()?.usuario ?? null;

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    const r = await cargarRecorridoConRespaldo(fetchConSesion, usuario);
    if (montado.current) setEstado(r);
  }, [usuario]);

  useEffect(() => {
    montado.current = true;
    void cargar();
    // Al volver la señal, la lista se actualiza sola.
    const alVolverLaRed = () => void cargar();
    globalThis.addEventListener?.('online', alVolverLaRed);
    return () => {
      montado.current = false;
      globalThis.removeEventListener?.('online', alVolverLaRed);
    };
  }, [cargar]);

  const edificios = estado.tipo === 'servidor' || estado.tipo === 'guardado' ? estado.edificios : null;

  const sacar = (id: string) => {
    sacarDelRecorridoGuardado(usuario, id);
    setEstado((e) => (e.tipo === 'servidor' || e.tipo === 'guardado' ? { ...e, edificios: e.edificios.filter((x) => x.id !== id) } : e));
  };

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

  const reintentar = (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void cargar()} data-testid="recorrido-reintentar">
      Reintentar
    </button>
  );

  return (
    <section className="recorrido-rt" aria-labelledby="recorrido-titulo" data-testid="recorrido-rt" data-estado={estado.tipo}>
      <h3 id="recorrido-titulo">Edificios pendientes de hoy</h3>
      {aviso && (
        <p role="status" data-testid="recorrido-aviso">
          {aviso}
        </p>
      )}
      {estado.tipo === 'cargando' && <p className="portal-desc">Cargando tus edificios…</p>}
      {estado.tipo === 'sin_conexion' && (
        <div className="alert alert-warning" role="status" data-testid="recorrido-sin-conexion">
          <p>Sin conexión: no se pudo cargar la lista de tus edificios. Conectate a una red y apretá «Reintentar».</p>
          {reintentar}
        </div>
      )}
      {estado.tipo === 'error' && (
        <div className="alert alert-warning" role="alert" data-testid="recorrido-error">
          <p>No se pudo cargar la lista de tus edificios. Probá de nuevo en un momento.</p>
          {reintentar}
        </div>
      )}
      {estado.tipo === 'guardado' && (
        <div className="alert alert-warning" role="status" data-testid="recorrido-guardado">
          <p>Sin conexión: es la lista descargada a {horaDeLosDatos(estado.descargadoEn)}.</p>
          {reintentar}
        </div>
      )}
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
