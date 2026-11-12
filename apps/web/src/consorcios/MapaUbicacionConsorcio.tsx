import React from 'react';
import { PuntoGeografico } from './consorcios';

export interface MarcadorMapa {
  id: string;
  etiqueta: string;
  subtitulo?: string;
  ubicacion: PuntoGeografico;
}

interface MapaUbicacionConsorcioProps {
  ubicacion: PuntoGeografico | null;
  marcadores?: MarcadorMapa[];
  editable?: boolean;
  onCambiarUbicacion?: (punto: PuntoGeografico | null) => void;
  testId?: string;
}

// Límites geográficos de CABA para proyectar lat/lon en coordenadas del lienzo SVG (600x260).
const LIMITES_CABA = {
  latMax: -34.525,
  latMin: -34.705,
  lonMin: -58.535,
  lonMax: -58.335,
} as const;

const ANCHO = 600;
const ALTO = 260;

function proyectar(punto: PuntoGeografico): { x: number; y: number } {
  const rx = (punto.longitud - LIMITES_CABA.lonMin) / (LIMITES_CABA.lonMax - LIMITES_CABA.lonMin);
  const ry = (LIMITES_CABA.latMax - punto.latitud) / (LIMITES_CABA.latMax - LIMITES_CABA.latMin);
  return {
    x: Math.max(12, Math.min(ANCHO - 12, rx * ANCHO)),
    y: Math.max(12, Math.min(ALTO - 12, ry * ALTO)),
  };
}

function desproyectar(x: number, y: number): PuntoGeografico {
  const rx = Math.max(0, Math.min(1, x / ANCHO));
  const ry = Math.max(0, Math.min(1, y / ALTO));
  const latitud = Number((LIMITES_CABA.latMax - ry * (LIMITES_CABA.latMax - LIMITES_CABA.latMin)).toFixed(6));
  const longitud = Number((LIMITES_CABA.lonMin + rx * (LIMITES_CABA.lonMax - LIMITES_CABA.lonMin)).toFixed(6));
  return { latitud, longitud };
}

/**
 * Mapa interactivo de CABA (sin dependencias externas) para ubicar el punto PostGIS del edificio
 * y renderizar múltiples consorcios georreferenciados.
 */
export function MapaUbicacionConsorcio({
  ubicacion,
  marcadores = [],
  editable = false,
  onCambiarUbicacion,
  testId = 'mapa-postgis-caba',
}: MapaUbicacionConsorcioProps) {
  const manejarClickMapa = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editable || !onCambiarUbicacion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * ANCHO;
    const y = ((e.clientY - rect.top) / rect.height) * ALTO;
    onCambiarUbicacion(desproyectar(x, y));
  };

  const puntoPrincipal = ubicacion ? proyectar(ubicacion) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        onClick={manejarClickMapa}
        data-testid={testId}
        role={editable ? 'button' : 'img'}
        aria-label={editable ? 'Mapa interactivo para fijar ubicación del edificio' : 'Mapa de edificios en CABA'}
        style={{
          width: '100%',
          maxWidth: '600px',
          height: 'auto',
          borderRadius: '8px',
          border: '1px solid var(--border, #cbd5e1)',
          background: 'linear-gradient(135deg, #e0f2fe 0%, #f1f5f9 60%, #e2e8f0 100%)',
          cursor: editable ? 'crosshair' : 'default',
          display: 'block',
        }}
      >
        {/* Cuadrícula de referencia */}
        {[1, 2, 3, 4].map((n) => (
          <line
            key={`v-${n}`}
            x1={(ANCHO / 5) * n}
            y1={0}
            x2={(ANCHO / 5) * n}
            y2={ALTO}
            stroke="#cbd5e1"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}
        {[1, 2, 3].map((n) => (
          <line
            key={`h-${n}`}
            x1={0}
            y1={(ALTO / 4) * n}
            x2={ANCHO}
            y2={(ALTO / 4) * n}
            stroke="#cbd5e1"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Referencias urbanas CABA */}
        <path d="M 40 148 Q 300 132 540 120" stroke="#94a3b8" strokeWidth="2.5" fill="none" />
        <text x="235" y="128" fontSize="10" fill="#475569" fontWeight="600">
          Av. Rivadavia
        </text>
        <path d="M 425 22 L 440 240" stroke="#94a3b8" strokeWidth="2" fill="none" />
        <text x="444" y="42" fontSize="10" fill="#475569" fontWeight="600">
          Av. 9 de Julio
        </text>
        <path d="M 190 25 L 360 112" stroke="#94a3b8" strokeWidth="2" fill="none" />
        <text x="198" y="38" fontSize="10" fill="#475569" fontWeight="600">
          Av. Cabildo / Santa Fe
        </text>

        {/* Marcadores múltiples (Vista Mapa de Edificios) */}
        {marcadores.map((m) => {
          const p = proyectar(m.ubicacion);
          return (
            <g key={m.id} data-testid={`marcador-mapa-${m.id}`}>
              <circle cx={p.x} cy={p.y} r="7" fill="#0f766e" stroke="#ffffff" strokeWidth="2" />
              <text x={p.x + 10} y={p.y + 4} fontSize="11" fill="#0f172a" fontWeight="700">
                {m.etiqueta}
              </text>
            </g>
          );
        })}

        {/* Marcador único del edificio seleccionado */}
        {puntoPrincipal && (
          <g data-testid="pin-ubicacion-edificio">
            <circle cx={puntoPrincipal.x} cy={puntoPrincipal.y} r="13" fill="rgba(220,38,38,0.18)" />
            <circle cx={puntoPrincipal.x} cy={puntoPrincipal.y} r="7" fill="#dc2626" stroke="#ffffff" strokeWidth="2.5" />
            <text x={puntoPrincipal.x + 12} y={puntoPrincipal.y + 4} fontSize="11" fill="#991b1b" fontWeight="700">
              {ubicacion?.latitud.toFixed(4)}, {ubicacion?.longitud.toFixed(4)}
            </text>
          </g>
        )}

        {!puntoPrincipal && marcadores.length === 0 && (
          <text x={ANCHO / 2} y={ALTO / 2} textAnchor="middle" fontSize="13" fill="#64748b" fontWeight="600">
            {editable ? 'Haga clic en el mapa para fijar el punto del edificio' : 'Sin punto geográfico asignado'}
          </text>
        )}
      </svg>

      {editable && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', flexWrap: 'wrap', gap: '8px' }}>
          <span>
            {ubicacion
              ? `Punto PostGIS: ${ubicacion.latitud}, ${ubicacion.longitud} (clic en el mapa para mover)`
              : 'Sin ubicación fijada: haga clic en el mapa para ubicar el edificio.'}
          </span>
          {ubicacion && onCambiarUbicacion && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onCambiarUbicacion(null)}
              data-testid="btn-quitar-ubicacion"
            >
              Quitar ubicación
            </button>
          )}
        </div>
      )}
    </div>
  );
}
