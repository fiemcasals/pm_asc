import { useEffect, useState } from 'react';
import { claveDeFoto, esRutaDeFotoDeParada, fotosDeAlertas } from './memoriaDeFotos';

interface Props {
  /** La ruta que trae la alerta para pedir su foto aparte (HU-17 RF-12); sin ella, se muestra `respaldo`. */
  ruta?: string | null;
  /** La foto de siempre de la alerta (la que viene adentro, o la de ejemplo): se usa si no hay ruta o si la ruta no responde. */
  respaldo: string;
  alt: string;
  className?: string;
  testId?: string;
}

type Estado = { tipo: 'cargando' } | { tipo: 'lista'; url: string; origen: 'ruta' | 'respaldo' };

/**
 * La foto de la cabina de una alerta. Si la alerta viene de un reporte de parada, la foto se pide aparte, con la sesión, una sola vez
 * (HU-17 RF-12); si no, o si la API no la entrega, se muestra la de siempre. `data-origen` dice de dónde salió.
 */
export function FotoDeAlerta({ ruta, respaldo, alt, className, testId }: Props) {
  const porRuta = esRutaDeFotoDeParada(ruta);
  const [estado, setEstado] = useState<Estado>(porRuta ? { tipo: 'cargando' } : { tipo: 'lista', url: respaldo, origen: 'respaldo' });

  useEffect(() => {
    if (!esRutaDeFotoDeParada(ruta)) {
      setEstado({ tipo: 'lista', url: respaldo, origen: 'respaldo' });
      return;
    }
    let vigente = true;
    setEstado({ tipo: 'cargando' });
    fotosDeAlertas.obtener(claveDeFoto(ruta), ruta).then(
      (url) => vigente && setEstado({ tipo: 'lista', url, origen: 'ruta' }),
      () => vigente && setEstado({ tipo: 'lista', url: respaldo, origen: 'respaldo' }),
    );
    return () => {
      vigente = false;
    };
  }, [ruta, respaldo]);

  if (estado.tipo === 'cargando') {
    return (
      <div className={className} role="status" aria-live="polite" data-testid={testId ? `${testId}-cargando` : undefined}>
        Cargando foto…
      </div>
    );
  }
  return <img src={estado.url} alt={alt} className={className} data-testid={testId} data-origen={estado.origen} />;
}
