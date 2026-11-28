import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bytesDeDataUrl,
  CALIDADES_FOTO,
  esArchivoDeImagen,
  medidasReducidas,
  MENSAJE_DEMASIADO_PESADA,
  MENSAJE_NO_ES_IMAGEN,
  MENSAJE_NO_SE_PUDO_ABRIR,
  prepararFoto,
} from './fotoReducida';
import { LADO_MAXIMO_FOTO, LIMITE_FOTO_BYTES, OBJETIVO_FOTO_BYTES } from './limites';

// HU-19 RF-05 — la foto se reduce en el dispositivo antes de enviarla.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
/** Un JPEG «falso» de n bytes, como lo devolvería el lienzo. */
const jpegDe = (bytes: number) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString('base64')}`;

describe('criterio 1: el tamaño y el peso de la foto enviada', () => {
  it('el lado mayor es 1.600 px y el tope 600 KB, el mismo que valida la API', () => {
    expect(LADO_MAXIMO_FOTO).toBe(1600);
    expect(OBJETIVO_FOTO_BYTES).toBe(500 * 1000);
    const api = /export const LIMITE_FOTO_BYTES = (\d+) \* 1024;/.exec(leer('../../../api/src/chat/chat.types.ts'));
    expect(api).not.toBeNull();
    expect(Number(api![1]) * 1024).toBe(LIMITE_FOTO_BYTES);
  });

  it.each([
    [4000, 3000, 1600, 1200], // foto apaisada de celular
    [3000, 4000, 1200, 1600], // foto vertical
    [4032, 3024, 1600, 1200],
    [8000, 1000, 1600, 200], // panorámica
    [1600, 1200, 1600, 1200], // ya tiene el tamaño: no cambia
    [800, 600, 800, 600], // más chica: no se agranda
  ])('%i × %i se envía a %i × %i', (a, b, c, d) => {
    expect(medidasReducidas(a, b)).toEqual({ ancho: c, alto: d });
  });

  it('cuenta los bytes de la imagen igual que la API', () => {
    expect(bytesDeDataUrl(jpegDe(1000))).toBe(1000);
    expect(bytesDeDataUrl(jpegDe(1001))).toBe(1001);
    expect(bytesDeDataUrl(jpegDe(1002))).toBe(1002);
  });

  it('una foto de 4000 × 3000 se dibuja a 1600 × 1200 en JPEG y se queda con la mejor calidad que pesa menos de 500 KB', async () => {
    const pedidos: [number, number, number][] = [];
    const r = await prepararFoto('image/jpeg', async () => ({ ancho: 4000, alto: 3000 }), async (w, h, q) => {
      pedidos.push([w, h, q]);
      return jpegDe(q > 0.75 ? 640 * 1000 : 310 * 1000); // con 0,82 pesa 640 KB; con 0,72, 310 KB
    });
    expect(r).toMatchObject({ ok: true, ancho: 1600, alto: 1200, calidad: 0.72, bytes: 310 * 1000 });
    expect(r.ok && r.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(pedidos).toEqual([[1600, 1200, 0.82], [1600, 1200, 0.72]]);
  });

  it('si con la primera calidad ya pesa menos de 500 KB, no prueba otras (se lee mejor al agrandarla)', async () => {
    let veces = 0;
    const r = await prepararFoto('image/png', async () => ({ ancho: 1200, alto: 900 }), async () => (veces++, jpegDe(120 * 1000)));
    expect(r).toMatchObject({ ok: true, calidad: CALIDADES_FOTO[0] });
    expect(veces).toBe(1);
  });

  it('entre 500 y 600 KB con la peor calidad, se envía igual (está dentro del tope)', async () => {
    const r = await prepararFoto('image/jpeg', async () => ({ ancho: 4000, alto: 3000 }), async () => jpegDe(550 * 1000));
    expect(r).toMatchObject({ ok: true, calidad: 0.5 });
  });
});

describe('criterio 5: lo que no se puede enviar se dice y no se envía', () => {
  it.each(['application/pdf', 'text/plain', 'video/mp4', '', undefined, null])('un archivo «%s» no es una imagen', async (tipo) => {
    let abierto = false;
    const r = await prepararFoto(tipo, async () => ((abierto = true), { ancho: 10, alto: 10 }), async () => jpegDe(10));
    expect(r).toEqual({ ok: false, motivo: MENSAJE_NO_ES_IMAGEN });
    expect(abierto).toBe(false);
  });

  it('una imagen que el navegador no puede abrir lo dice', async () => {
    expect(await prepararFoto('image/heic', async () => null, async () => jpegDe(10))).toEqual({ ok: false, motivo: MENSAJE_NO_SE_PUDO_ABRIR });
    expect(await prepararFoto('image/jpeg', async () => { throw new Error('roto'); }, async () => jpegDe(10))).toEqual({ ok: false, motivo: MENSAJE_NO_SE_PUDO_ABRIR });
  });

  it('si reducida a la peor calidad sigue pasando 600 KB, se rechaza con el motivo', async () => {
    const r = await prepararFoto('image/jpeg', async () => ({ ancho: 4000, alto: 3000 }), async () => jpegDe(LIMITE_FOTO_BYTES + 1));
    expect(r).toEqual({ ok: false, motivo: MENSAJE_DEMASIADO_PESADA });
    expect(MENSAJE_DEMASIADO_PESADA).toMatch(/hasta 600 KB/);
  });

  it('esArchivoDeImagen solo acepta tipos image/…', () => {
    expect(esArchivoDeImagen('image/jpeg')).toBe(true);
    expect(esArchivoDeImagen('image/webp')).toBe(true);
    expect(esArchivoDeImagen('imagex')).toBe(false);
  });
});

describe('la pantalla usa la foto reducida', () => {
  const vista = leer('./ChatOperativoView.tsx');
  it('al elegir la foto la reduce, muestra «Preparando foto…» y no deja enviar mientras tanto', () => {
    expect(vista).toContain('const foto = await reducirFoto(file);');
    expect(vista).toContain('disabled={enviando || preparandoFoto || (!texto.trim() && !fotoBase64)}');
    expect(vista).toContain('📷 Preparando foto…');
  });
  it('el motivo de una foto que no se puede usar se muestra en pantalla', () => {
    expect(vista).toMatch(/role="alert" data-testid="chat-error-foto">\s*\{errorFoto\}/);
  });
  it('ya no lee la foto entera con FileReader', () => {
    expect(vista).not.toContain('readAsDataURL');
  });
});
