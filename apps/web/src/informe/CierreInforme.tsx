import React, { useState } from 'react';
import { fetchConSesion } from '../auth/sesion';
import { comprimirFotoAnomalia } from '../checklist/fotos';
import { type EquipoInspeccion } from '../checklist/navegacion';
import { FirmaPad } from './FirmaPad';
import {
  CARACTERES,
  type DatosFirmante,
  type EstadoVisita,
  type InformeCerrado,
  type Punto,
  armarInforme,
  enviarInforme,
  selloCorto,
  erroresFirmante,
  erroresSinFirma,
  firmaTrazada,
  puedeConsolidar,
} from './consolidacion';

interface Props {
  consorcioId: string;
  equipos: readonly EquipoInspeccion[];
  visita: EstadoVisita;
  /** El informe se cerró (con firma o «Sin firma»). */
  onCerrado?: (informe: InformeCerrado) => void;
}

/**
 * Cierre de la visita (HU-18 RF-01): «Consolidar Informe y Proceder a Firma» se habilita sólo con todos los equipos completos o resueltos como
 * fuera de servicio. La firma es única para todo el edificio: nombre, apellido y carácter (DNI opcional) y el trazo del dedo, que no se acepta
 * vacío. Si el encargado no firma, «Sin firma» exige motivo y foto y deja el informe marcado para la Secretaría y el Firmante.
 */
export function CierreInforme({ consorcioId, equipos, visita, onCerrado }: Props) {
  const { puede, pendientes } = puedeConsolidar(equipos, visita);
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'firma' | 'sin_firma'>('firma');
  const [datos, setDatos] = useState<DatosFirmante>({ nombre: '', apellido: '', caracter: '', dni: '' });
  const [firma, setFirma] = useState<{ trazos: Punto[][]; imagen: string }>({ trazos: [], imagen: '' });
  const [motivo, setMotivo] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [cerrado, setCerrado] = useState<InformeCerrado | null>(null);

  const elegirFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setFoto((await comprimirFotoAnomalia(archivo)).dataUrl);
    } catch (err) {
      setErrores([err instanceof Error ? err.message : 'No se pudo cargar la foto']);
    }
  };

  const cerrar = async () => {
    const mal = modo === 'firma' ? [...erroresFirmante(datos), ...(firmaTrazada(firma.trazos) && firma.imagen ? [] : ['La firma está vacía: firmá con el dedo en el recuadro.'])] : erroresSinFirma({ motivo, foto });
    setErrores(mal);
    if (mal.length > 0) return;
    setEnviando(true);
    const cuerpo = armarInforme(consorcioId, equipos, visita, modo === 'firma' ? { firma: { datos, imagen: firma.imagen, trazos: firma.trazos } } : { sinFirma: { motivo, foto } });
    const r = await enviarInforme(cuerpo, fetchConSesion);
    setEnviando(false);
    if (!r.ok) return setErrores([r.error]);
    setCerrado(r.informe);
    onCerrado?.(r.informe);
  };

  if (cerrado) {
    return (
      <section className="cierre-informe" data-testid="informe-cerrado" role="status">
        <h3>Informe cerrado</h3>
        <p>{cerrado.requiereRevision ? 'Quedó cerrado «Sin firma»: la Secretaría y el Firmante lo van a revisar.' : 'Quedó firmado por el encargado y cerrado.'}</p>
        {selloCorto(cerrado.hashSha256) && (
          <p className="portal-desc" data-testid="informe-sello" title={cerrado.hashSha256 ?? undefined}>
            Sello digital (SHA-256): {selloCorto(cerrado.hashSha256)} · el informe ya no se puede modificar.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="cierre-informe" aria-labelledby="cierre-titulo" data-testid="cierre-informe" style={{ margin: '16px 0', maxWidth: '100%', overflowX: 'hidden' }}>
      <h3 id="cierre-titulo">Cierre de la visita</h3>
      <button type="button" className="btn btn-primary" disabled={!puede} onClick={() => setAbierto(true)} data-testid="btn-consolidar">
        Consolidar Informe y Proceder a Firma
      </button>
      {!puede && (
        <ul className="portal-desc" data-testid="consolidar-pendientes">
          {pendientes.map((p) => (
            <li key={p.equipo}>
              {p.equipo}: {p.motivo}
            </li>
          ))}
        </ul>
      )}

      {puede && abierto && (
        <div data-testid="panel-firma" style={{ marginTop: 12 }}>
          <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button type="button" role="tab" aria-selected={modo === 'firma'} className={`btn ${modo === 'firma' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setModo('firma'); setErrores([]); }} data-testid="modo-firma">
              Firma del encargado
            </button>
            <button type="button" role="tab" aria-selected={modo === 'sin_firma'} className={`btn ${modo === 'sin_firma' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setModo('sin_firma'); setErrores([]); }} data-testid="modo-sin-firma">
              Sin firma
            </button>
          </div>

          {modo === 'firma' ? (
            <div data-testid="form-firma">
              <p className="portal-desc">Una sola firma para todo el edificio.</p>
              <label htmlFor="firma-nombre">Nombre</label>
              <input id="firma-nombre" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} autoComplete="given-name" data-testid="firma-nombre" />
              <label htmlFor="firma-apellido">Apellido</label>
              <input id="firma-apellido" value={datos.apellido} onChange={(e) => setDatos({ ...datos, apellido: e.target.value })} autoComplete="family-name" data-testid="firma-apellido" />
              <label htmlFor="firma-caracter">Carácter en que firma</label>
              <select id="firma-caracter" value={datos.caracter} onChange={(e) => setDatos({ ...datos, caracter: e.target.value as DatosFirmante['caracter'] })} data-testid="firma-caracter">
                <option value="">Elegí…</option>
                {CARACTERES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label htmlFor="firma-dni">DNI (opcional)</label>
              <input id="firma-dni" inputMode="numeric" value={datos.dni} onChange={(e) => setDatos({ ...datos, dni: e.target.value })} data-testid="firma-dni" />
              <p style={{ marginBottom: 4 }}>Firma</p>
              <FirmaPad onChange={(trazos, imagen) => setFirma({ trazos, imagen })} />
            </div>
          ) : (
            <div data-testid="form-sin-firma">
              <p className="portal-desc">El informe queda marcado para que lo vean la Secretaría y el Firmante.</p>
              <label htmlFor="sin-firma-motivo">Motivo (al menos 10 caracteres)</label>
              <textarea id="sin-firma-motivo" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ width: '100%' }} data-testid="sin-firma-motivo" />
              <label htmlFor="sin-firma-foto">Foto que lo respalda</label>
              <input id="sin-firma-foto" type="file" accept="image/*" capture="environment" onChange={(e) => void elegirFoto(e.target.files?.[0])} data-testid="sin-firma-foto" />
              {foto && <img src={foto} alt="Foto que respalda el motivo" style={{ maxWidth: '100%', maxHeight: 140 }} />}
            </div>
          )}

          {errores.length > 0 && (
            <ul role="alert" className="error" data-testid="cierre-errores">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => void cerrar()} data-testid="btn-cerrar-informe" style={{ marginTop: 8 }}>
            {enviando ? 'Cerrando…' : modo === 'firma' ? 'Firmar y cerrar el informe' : 'Cerrar «Sin firma»'}
          </button>
        </div>
      )}
    </section>
  );
}
