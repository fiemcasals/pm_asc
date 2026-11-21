import { describe, expect, it } from 'vitest';
import {
  a6Decimales,
  aGeoJSON,
  claveDeMarcadores,
  distanciaMetros,
  etiquetaAccesible,
  limitesDe,
  metrosPorPixel,
  prioridadDeEtiqueta,
  separacionEnPixeles,
  type MarcadorMapa,
} from './marcadores';

const m = (id: string, colorNombre: string | undefined, latitud = -34.6, longitud = -58.4): MarcadorMapa => ({
  id,
  etiqueta: `Edificio ${id}`,
  subtitulo: colorNombre ? `${colorNombre}: pendiente` : undefined,
  ubicacion: { latitud, longitud },
  colorNombre,
});

describe('prioridadDeEtiqueta (HU-16 RF-04, criterio 4)', () => {
  it('los rojos se conservan primero, después amarillos, verdes y el resto', () => {
    const orden = [m('a', 'verde'), m('b', undefined), m('c', 'rojo'), m('d', 'amarillo')].sort((x, y) => prioridadDeEtiqueta(x) - prioridadDeEtiqueta(y));
    expect(orden.map((x) => x.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('el edificio seleccionado pasa por delante de todos, también de los rojos', () => {
    expect(prioridadDeEtiqueta(m('a', 'verde'), true)).toBeLessThan(prioridadDeEtiqueta(m('b', 'rojo')));
  });
});

describe('etiquetaAccesible (criterio 5)', () => {
  it('es «Nombre. Color: estado», igual que el dibujo anterior', () => {
    expect(etiquetaAccesible({ etiqueta: 'DEMO Santa Fe 3200', subtitulo: 'Verde: Inspeccionado' })).toBe('DEMO Santa Fe 3200. Verde: Inspeccionado');
  });

  it('sin subtítulo es sólo el nombre', () => {
    expect(etiquetaAccesible({ etiqueta: 'DEMO Cabildo 1540' })).toBe('DEMO Cabildo 1540');
  });
});

describe('a6Decimales (criterio 7)', () => {
  it('devuelve latitud y longitud con 6 decimales', () => {
    expect(a6Decimales({ lat: -34.6037227891, lng: -58.3815917012 })).toEqual({ latitud: -34.603723, longitud: -58.381592 });
  });

  it('no inventa decimales: un número corto queda como está', () => {
    expect(a6Decimales({ lat: -34.6, lng: -58.4 })).toEqual({ latitud: -34.6, longitud: -58.4 });
  });
});

describe('aGeoJSON', () => {
  it('pone [longitud, latitud], en ese orden, y la prioridad de cada edificio', () => {
    const geo = aGeoJSON([m('r', 'rojo', -34.61, -58.39), m('v', 'verde')], 'v');

    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features[0].geometry.coordinates).toEqual([-58.39, -34.61]);
    expect(geo.features.map((f) => f.properties.prioridad)).toEqual([0, -1]);
    expect(geo.features[0].properties).toMatchObject({ id: 'r', etiqueta: 'Edificio r' });
  });
});

describe('limitesDe y claveDeMarcadores (criterio 3)', () => {
  it('es el rectángulo que contiene todos los puntos', () => {
    expect(
      limitesDe([
        { latitud: -34.6, longitud: -58.4 },
        { latitud: -34.65, longitud: -58.45 },
        { latitud: -34.55, longitud: -58.38 },
      ]),
    ).toEqual([[-58.45, -34.65], [-58.38, -34.55]]);
  });

  it('sin puntos no hay rectángulo, y con uno es un punto', () => {
    expect(limitesDe([])).toBeNull();
    expect(limitesDe([{ latitud: -34.6, longitud: -58.4 }])).toEqual([[-58.4, -34.6], [-58.4, -34.6]]);
  });

  it('la clave no depende del orden y cambia cuando cambia el conjunto', () => {
    expect(claveDeMarcadores([{ id: 'b' }, { id: 'a' }])).toBe(claveDeMarcadores([{ id: 'a' }, { id: 'b' }]));
    expect(claveDeMarcadores([{ id: 'a' }])).not.toBe(claveDeMarcadores([{ id: 'a' }, { id: 'b' }]));
  });
});

describe('proyección sin distorsión (criterio 2)', () => {
  // El Obelisco, en pleno CABA. El segundo punto se arma 500 m al este y 500 m al norte, con la fórmula de la esfera.
  const origen = { latitud: -34.603722, longitud: -58.381592 };
  const R = 6_371_008.8;
  const aGrados = (r: number) => (r * 180) / Math.PI;
  const alEste = { latitud: origen.latitud, longitud: origen.longitud + aGrados(500 / (R * Math.cos((origen.latitud * Math.PI) / 180))) };
  const alNorte = { latitud: origen.latitud + aGrados(500 / R), longitud: origen.longitud };

  it('las coordenadas de prueba están a 500 m, medidos sobre la Tierra', () => {
    expect(distanciaMetros(origen, alEste)).toBeCloseTo(500, 0);
    expect(distanciaMetros(origen, alNorte)).toBeCloseTo(500, 0);
  });

  it.each([11, 13, 15, 16, 17])('a zoom %i, dos edificios a 500 m se ven a 500 m (error menor al 0,5 %)', (zoom) => {
    const { total } = separacionEnPixeles(origen, alEste, zoom);
    const metrosEnPantalla = total * metrosPorPixel(origen.latitud, zoom);

    expect(Math.abs(metrosEnPantalla - 500) / 500).toBeLessThan(0.005);
  });

  it.each([11, 15, 17])('a zoom %i, 500 m al este y 500 m al norte miden lo mismo en pantalla: el mapa no estira ningún eje', (zoom) => {
    const este = separacionEnPixeles(origen, alEste, zoom);
    const norte = separacionEnPixeles(origen, alNorte, zoom);

    expect(Math.abs(este.dx - norte.dy) / este.dx).toBeLessThan(0.005);
    expect(este.dy).toBeCloseTo(0, 6); // al este no se mueve en vertical
    expect(norte.dx).toBeCloseTo(0, 6); // al norte no se mueve en horizontal
  });

  it('el dibujo anterior sí distorsionaba: el recuadro de CABA (0,2° × 0,18°) se estiraba a 600 × 260 px', () => {
    // 0,2° de longitud miden unos 18,3 km y 0,18° de latitud unos 20 km: el recuadro real es casi cuadrado (0,92), y se mostraba 2,3 veces más ancho que alto.
    const ancho = distanciaMetros({ latitud: -34.615, longitud: -58.535 }, { latitud: -34.615, longitud: -58.335 });
    const alto = distanciaMetros({ latitud: -34.705, longitud: -58.435 }, { latitud: -34.525, longitud: -58.435 });
    const proporcionReal = ancho / alto;
    const proporcionDibujada = 600 / 260;

    expect(proporcionReal).toBeCloseTo(0.92, 1);
    expect(proporcionDibujada / proporcionReal).toBeGreaterThan(2.4);
  });
});
