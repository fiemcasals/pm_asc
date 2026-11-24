import { hora } from '../fechas/formato';
import { type FotoAnomalia } from './fotos';
import {
  claveFotoObligatoria,
  FOTOS_OBLIGATORIAS,
  fotosObligatoriasDelTipo,
  type FotoObligatoriaId,
} from './fotosObligatorias';
import { type TipoMaquinaChecklist } from './checklist.config';

interface Props {
  referenciaAgc: string;
  tipo: TipoMaquinaChecklist;
  /** Las fotos del equipo (anomalías y obligatorias): acá se miran sólo las obligatorias. */
  fotos: Record<string, FotoAnomalia | undefined>;
  onAdjuntar: (id: FotoObligatoriaId, archivo: File | null) => void;
  onQuitar: (id: FotoObligatoriaId) => void;
}

/**
 * «Fotos obligatorias del equipo» (HU-17 RF-11): el frente de cabina y botonera y, si el equipo tiene cables de tracción, los cables. Se sacan
 * aunque no haya ninguna falla; sin ellas no se puede consolidar el informe.
 */
export function FotosObligatoriasEquipo({ referenciaAgc, tipo, fotos, onAdjuntar, onQuitar }: Props) {
  const ids = fotosObligatoriasDelTipo(tipo);
  const faltan = ids.filter((id) => !fotos[claveFotoObligatoria(id)]).length;

  return (
    <section className="card checklist-fotos-obligatorias" aria-labelledby="fotos-obligatorias-titulo" data-testid="fotos-obligatorias">
      <h3 id="fotos-obligatorias-titulo">Fotos obligatorias del equipo · {referenciaAgc}</h3>
      <p className="portal-desc" data-testid="fotos-obligatorias-estado" role="status">
        {faltan === 0
          ? 'Están todas las fotos obligatorias de este equipo.'
          : `Falta${faltan === 1 ? '' : 'n'} ${faltan} de ${ids.length}: se sacan aunque el equipo no tenga ninguna falla y hacen falta para consolidar el informe.`}
      </p>
      {tipo === 'hidraulico' && (
        <p className="portal-desc" data-testid="fotos-obligatorias-hidraulico">
          Equipo hidráulico: no tiene cables de tracción, sólo lleva la foto del frente.
        </p>
      )}
      <div className="checklist-fotos-obligatorias-lista">
        {ids.map((id) => {
          const cfg = FOTOS_OBLIGATORIAS[id];
          const foto = fotos[claveFotoObligatoria(id)];
          return (
            <div className="checklist-foto-box" key={id} data-testid={`foto-obligatoria-box-${id}`}>
              <strong>{cfg.etiqueta}</strong>
              <span className={foto ? 'checklist-foto-lista' : 'checklist-foto-aviso'} data-testid={`foto-obligatoria-estado-${id}`}>
                {foto ? '✓ Lista' : '✗ Falta'}
              </span>
              <label className="checklist-foto-btn" data-testid={`btn-foto-obligatoria-${id}`}>
                <span>{foto ? 'Volver a sacar' : 'Sacar'} — {cfg.etiqueta}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only-input"
                  data-testid={`input-foto-obligatoria-${id}`}
                  onChange={(e) => {
                    const archivo = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    onAdjuntar(id, archivo);
                  }}
                />
              </label>
              {!foto && <p className="checklist-foto-opcional">{cfg.ayuda}</p>}
              {foto && (
                <div className="checklist-foto-preview" data-testid={`foto-obligatoria-preview-${id}`}>
                  <img src={foto.dataUrl} alt={`${cfg.etiqueta} de ${referenciaAgc}`} />
                  <div className="checklist-foto-meta">
                    <span>{Math.max(1, Math.round(foto.sizeBytes / 1024))} KB</span>
                    <time dateTime={foto.tomadaEn}>{hora(foto.tomadaEn, { segundos: true })}</time>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onQuitar(id)} data-testid={`btn-quitar-foto-obligatoria-${id}`}>
                      Quitar foto
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
