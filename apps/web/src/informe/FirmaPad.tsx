import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type Punto, firmaTrazada } from './consolidacion';

export const ANCHO_FIRMA = 320;
export const ALTO_FIRMA = 140;

interface Props {
  /** Se llama con los trazos y la imagen PNG cada vez que cambia la firma (imagen vacía si no hay firma). */
  onChange: (trazos: Punto[][], imagen: string) => void;
}

/** Lienzo para firmar con el dedo (o el mouse): captura los trazos y los pasa a PNG. Tiene botón «Borrar». */
export function FirmaPad({ onChange }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const trazos = useRef<Punto[][]>([]);
  const dibujando = useRef(false);
  const [firmada, setFirmada] = useState(false);

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>): Punto => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / (r.width || ANCHO_FIRMA)) * ANCHO_FIRMA), Math.round(((e.clientY - r.top) / (r.height || ALTO_FIRMA)) * ALTO_FIRMA)];
  };

  const avisar = useCallback(() => {
    const c = canvas.current;
    const hay = firmaTrazada(trazos.current);
    setFirmada(hay);
    onChange(trazos.current.map((t) => t.map((p) => [...p] as Punto)), hay && c ? c.toDataURL('image/png') : '');
  }, [onChange]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    const p = posicion(e);
    trazos.current.push([p]);
    const ctx = canvas.current?.getContext('2d');
    ctx?.beginPath();
    ctx?.moveTo(p[0], p[1]);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const p = posicion(e);
    trazos.current[trazos.current.length - 1].push(p);
    const ctx = canvas.current?.getContext('2d');
    ctx?.lineTo(p[0], p[1]);
    ctx?.stroke();
  };
  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    avisar();
  };
  const borrar = () => {
    trazos.current = [];
    canvas.current?.getContext('2d')?.clearRect(0, 0, ANCHO_FIRMA, ALTO_FIRMA);
    avisar();
  };

  return (
    <div className="firma-pad" data-testid="firma-pad">
      <canvas
        ref={canvas}
        width={ANCHO_FIRMA}
        height={ALTO_FIRMA}
        aria-label="Recuadro para firmar con el dedo"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
        data-testid="firma-canvas"
        style={{ width: '100%', maxWidth: ANCHO_FIRMA, height: 'auto', aspectRatio: `${ANCHO_FIRMA} / ${ALTO_FIRMA}`, border: '2px dashed #64748b', borderRadius: 8, background: '#fff', touchAction: 'none', display: 'block' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button type="button" className="btn btn-secondary" onClick={borrar} data-testid="firma-borrar">
          Borrar firma
        </button>
        <span className="portal-desc" data-testid="firma-estado">
          {firmada ? 'Firma capturada' : 'Firmá con el dedo en el recuadro'}
        </span>
      </div>
    </div>
  );
}
