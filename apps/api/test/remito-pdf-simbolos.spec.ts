import { RemitoPdfService } from '../src/eca/remito-pdf.service';
import { RemitoTecnicoResponse } from '../src/eca/eca.types';
import { textoDelPdf } from './pdf-extraer-texto';

// HU-10 RF-07 — El PDF del remito no tiene símbolos rotos y sigue diciendo lo mismo.
const remito = (cambios: Partial<RemitoTecnicoResponse> = {}): RemitoTecnicoResponse => ({
  id: 'REM-ALT-1',
  alertaId: 'ALT-1',
  maquinaId: 'MAQ-1',
  codigoAGC: 'M1',
  nombreMaquina: 'M1: Ascensor Frontal',
  edificio: { direccion: 'Av. Santa Fe 3200, CABA', consorcio: 'Consorcio Santa Fe 3200', administracion: 'Estudio Palermo Admin' },
  eca: 'MAICON Mantenimiento',
  tipoAlerta: 'REPARACION_URGENTE',
  titulo: '⚠️ REPARACIÓN URGENTE',
  motivo: 'Freno electromagnético con deslizamiento crítico.',
  fechaDeteccion: '2026-11-06T09:15:00.000Z',
  checklist: [
    { item: 'Freno electromagnético', estado: 'Critico', observaciones: 'Deslizamiento severo de 18 cm' },
    { item: 'Cables de tracción', estado: 'Falla', observaciones: 'Deshilachado visible' },
  ],
  acuseLegal: { registrado: true, fechaHora: '2026-11-18T12:00:00.000Z', usuario: 'operador.legal@maicon.com.ar' },
  ...cambios,
});

const pdfDe = async (r: RemitoTecnicoResponse) => textoDelPdf(await new RemitoPdfService().generarPdf(r));

describe('Remito PDF: símbolos y texto', () => {
  it('criterio 1: ningún símbolo sale roto (ni «&», ni «þ»), aunque los datos traigan emojis y símbolos', async () => {
    const texto = await pdfDe(
      remito({
        titulo: '🚨 FUERA DE SERVICIO ⚠️',
        motivo: '⚠️ Cabina trabada 🚨 con riesgo ✓',
        edificio: { direccion: '📍 Av. Santa Fe 3200', consorcio: '🏢 Consorcio Santa Fe', administracion: '✅ Estudio Palermo' },
        nombreMaquina: '🛗 M1: Ascensor',
        eca: '🔧 MAICON Mantenimiento',
        checklist: [{ item: '⚠️ Freno', estado: '❌ Critico' as never, observaciones: '🚨 Deslizamiento ✓' }],
        acuseLegal: { registrado: true, fechaHora: '2026-11-18T12:00:00.000Z', usuario: '✓ operador@maicon.com.ar' },
      }),
    );

    expect(texto).not.toMatch(/[þ&]/);
    expect(texto).not.toMatch(/[^\x20-\x7E\xA0-\xFF\n–—‘’“”•…€™]/);
  });

  it('criterio 1: cada dato dinámico sale limpio, en su propia línea (no alcanza con buscar caracteres sueltos)', async () => {
    const texto = await pdfDe(
      remito({
        id: '🆔 REM-ALT-1',
        alertaId: '🔔 ALT-1',
        codigoAGC: '🛗 M1',
        nombreMaquina: '🛗 M1: Ascensor',
        edificio: { direccion: '📍 Av. Santa Fe 3200', consorcio: '🏢 Consorcio Santa Fe', administracion: '✅ Estudio Palermo' },
        eca: '🔧 MAICON Mantenimiento',
        tipoAlerta: '⚠️REPARACION_URGENTE' as never,
        motivo: '🚨 Cabina trabada ✓',
        checklist: [{ item: '⚠️ Freno', estado: '❌ Critico' as never, observaciones: '🚨 Deslizamiento ✓' }],
        acuseLegal: { registrado: true, fechaHora: '2026-11-18T12:00:00.000Z', usuario: '✓ operador@maicon.com.ar' },
      }),
    );
    const lineas = texto.split('\n');

    for (const limpia of [
      'REM-ALT-1   |   ', 'ALT-1   |   ', 'M1', 'M1: Ascensor', 'Av. Santa Fe 3200', 'Consorcio Santa Fe', 'Estudio Palermo', 'REPARACION_URGENTE',
      'Cabina trabada', 'Freno', 'ATENCIÓN · Critico', 'Deslizamiento', 'operador@maicon.com.ar   |   ECA: ',
    ]) {
      expect([limpia, lineas.includes(limpia)]).toEqual([limpia, true]);
    }
    // La ECA aparece dos veces: en los datos del equipo y en el certificado de acuse.
    expect(lineas.filter((l) => l === 'MAICON Mantenimiento')).toHaveLength(2);
  });

  it('criterio 2: los estados del checklist y del acuse se leen como palabras', async () => {
    const texto = await pdfDe(remito());

    expect(texto).toContain('ATENCIÓN · Critico');
    expect(texto).toContain('ATENCIÓN · Falla');
    expect(texto).toContain('OK · Acuse Legal Registrado: ');
    expect(texto).toContain('OK · Usuario Notificado: ');
  });

  it('criterio 3: un título con emoji se imprime sin el emoji y sin basura', async () => {
    expect(await pdfDe(remito({ titulo: '⚠️ REPARACIÓN URGENTE' }))).toContain('DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: REPARACIÓN URGENTE');
    expect(await pdfDe(remito({ titulo: '🚨 FUERA DE SERVICIO: Cabina Trabada' }))).toContain('DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: FUERA DE SERVICIO: CABINA TRABADA');
  });

  it('el título en mayúsculas se arma con el texto ya limpio', async () => {
    expect(await pdfDe(remito({ titulo: 'ñandú ⚠️ ő' }))).toContain('FALLA CRÍTICA: ÑANDÚ O');
  });

  it('criterio 4: el membrete, los datos del consorcio, el diagnóstico, el checklist y el acuse siguen iguales', async () => {
    const texto = await pdfDe(remito());

    for (const esperado of [
      'MAICON S.R.L. · SISTEMA DE INSPECCIÓN Y SEGURIDAD VERTICAL',
      'Habilitación AGC Registro Oficial CABA · Conforme Ley 6100 y Ordenanza 49308',
      'REMITO TÉCNICO OFICIAL DE NOTIFICACIÓN CRÍTICA',
      'REM-ALT-1', 'ALT-1', 'Consorcio Santa Fe 3200', 'Av. Santa Fe 3200, CABA', 'Estudio Palermo Admin', 'M1', 'M1: Ascensor Frontal', 'MAICON Mantenimiento',
      'REPARACION_URGENTE', 'Freno electromagnético con deslizamiento crítico.',
      'CHECKLIST DE SEGURIDAD INSPECCIONADO', 'Freno electromagnético', 'Deslizamiento severo de 18 cm', 'Cables de tracción', 'Deshilachado visible',
      'CERTIFICADO DE ACUSE DE RECIBO LEGAL Y DESLINDE FEHACIENTE', 'SÍ (Conforme Ley CABA)', 'operador.legal@maicon.com.ar',
    ]) {
      expect([esperado, texto.includes(esperado)]).toEqual([esperado, true]);
    }
  });

  it('los signos de puntuación que la fuente sí tiene se imprimen bien (comillas, guion largo, viñeta, euro)', async () => {
    const texto = await pdfDe(remito({ motivo: 'Se oyó “un golpe” — reparación ≈ 1500 € • urgente' }));

    expect(texto).toContain('Se oyó “un golpe” — reparación 1500 € • urgente');
  });

  it('las letras de otro alfabeto se marcan con «?» en lugar de salir rotas', async () => {
    const texto = await pdfDe(remito({ edificio: { direccion: 'Calle 1', consorcio: 'Edificio Москва', administracion: '' } }));

    expect(texto).toContain('Edificio ??????');
    expect(texto).toContain('No informada');
  });

  it('un remito sin checklist y con campos vacíos igual se genera', async () => {
    const texto = await pdfDe(remito({ checklist: undefined, motivo: '', titulo: '⚠️' }));

    expect(texto).toContain('REMITO TÉCNICO OFICIAL');
    expect(texto).not.toContain('CHECKLIST DE SEGURIDAD');
  });
});
