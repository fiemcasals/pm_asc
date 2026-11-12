import {
  CHECKLIST_VERSION,
  CHECKLIST_CONFIG,
  obtenerChecklistParaTipo,
  obtenerFallasCriticasDefinidas,
  requiereFotoChecklist,
} from '../src/checklist/checklist.config';

describe('Motor del checklist configurable (HU-17 RF-01)', () => {
  it('define las 5 solapas versionadas con sus subgrupos e ítems', () => {
    expect(CHECKLIST_CONFIG.version).toBe(CHECKLIST_VERSION);
    expect(CHECKLIST_CONFIG.solapas.map((s) => s.id)).toEqual([
      'sala_maquinas',
      'cabina',
      'accesos',
      'caja',
      'fosa',
    ]);
    expect(CHECKLIST_CONFIG.solapas.map((s) => s.nombre)).toEqual([
      'Sala de Máquinas',
      'Cabina',
      'Accesos',
      'Caja',
      'Fosa',
    ]);
    for (const solapa of CHECKLIST_CONFIG.solapas) {
      expect(solapa.subgrupos.length).toBeGreaterThan(0);
      for (const sub of solapa.subgrupos) {
        expect(sub.items.length).toBeGreaterThan(0);
        for (const item of sub.items) {
          expect(item.opciones.length).toBeGreaterThanOrEqual(2);
          for (const op of item.opciones) {
            expect(typeof op.esFalla).toBe('boolean');
            expect(typeof op.esFallaCritica).toBe('boolean');
            expect(typeof op.fotoObligatoria).toBe('boolean');
            if (op.esFallaCritica) {
              expect(op.esFalla).toBe(true);
              expect(op.fotoObligatoria).toBe(true);
            }
          }
        }
      }
    }
  });

  it('hidráulico oculta cables/poleas/extensión de cables e incluye Aceite de batea', () => {
    const hidraulico = obtenerChecklistParaTipo('hidraulico');
    const itemsH = hidraulico.solapas.flatMap((s) => s.subgrupos.flatMap((g) => g.items.map((i) => i.id)));
    expect(itemsH).toContain('aceite_batea');
    expect(itemsH).not.toContain('cables_traccion');
    expect(itemsH).not.toContain('poleas_traccion');
    expect(itemsH).not.toContain('extension_cables');

    const traccion = obtenerChecklistParaTipo('traccion');
    const itemsT = traccion.solapas.flatMap((s) => s.subgrupos.flatMap((g) => g.items.map((i) => i.id)));
    expect(itemsT).toContain('cables_traccion');
    expect(itemsT).toContain('poleas_traccion');
    expect(itemsT).toContain('extension_cables');
    expect(itemsT).not.toContain('aceite_batea');
  });

  it('sincroniza 1 a 1 las 14 fallas críticas definidas con HU-06 RF-03', () => {
    const criticas = obtenerFallasCriticasDefinidas();
    const codigos = criticas.map((c) => c.codigoFallaCritica);
    expect(codigos).toEqual([
      'CABLES_DESGASTADOS',
      'LIMITADOR_ANULADO',
      'ACEITE_BATEA_INSUFICIENTE',
      'CORTE_FUERZA_MOTRIZ_NO_ACTUA',
      'BOTON_PARE_FALLA',
      'PARACAIDAS_ANOMALIA',
      'DESTRABE_MANUAL_TRABADO_INEXISTENTE',
      'CERRADURA_NO_TRABA',
      'CONTACTO_ELECTRICO_PUENTEADO_FALLA',
      'ESPACIO_ENTRE_PUERTAS_MAYOR_12CM',
      'INSTALACIONES_AJENAS_SI',
      'ESPACIOS_CON_ABERTURAS',
      'LIMITES_FALLAN_ANULADOS',
      'STOP_FOSA_DEFICIENTE_INEXISTENTE',
    ]);
  });

  it('mantiene como fallas comunes no críticas los ítems excluidos en HU-06 RF-03', () => {
    const itemsMap = new Map(
      CHECKLIST_CONFIG.solapas
        .flatMap((s) => s.subgrupos.flatMap((g) => g.items))
        .map((i) => [i.id, i]),
    );

    const noCriticosEsperados: [string, string][] = [
      ['perdida_aceite', 'con_perdida'],
      ['limitador_velocidad', 'deficiente'],
      ['tablero_control', 'fuera_norma'],
      ['puerta_cabina', 'puerta_tijera'],
      ['alarma_cabina', 'falla'],
      ['piso_madera', 'deteriorado'],
      ['baranda_techo', 'deficiente'],
      ['extension_cables', 'anomalia'],
    ];

    for (const [itemId, opcionId] of noCriticosEsperados) {
      const opcion = itemsMap.get(itemId)?.opciones.find((o) => o.id === opcionId);
      expect(opcion).toBeDefined();
      expect(opcion?.esFalla).toBe(true);
      expect(opcion?.esFallaCritica).toBe(false);
    }
  });

  it('exige foto obligatoria en falla crítica o cuando el equipo está Fuera de Servicio', () => {
    expect(
      requiereFotoChecklist({ esFallaCritica: false, fotoObligatoria: false }, 'en_uso'),
    ).toBe(false);
    expect(
      requiereFotoChecklist({ esFallaCritica: true, fotoObligatoria: false }, 'en_uso'),
    ).toBe(true);
    expect(
      requiereFotoChecklist({ esFallaCritica: false, fotoObligatoria: false }, 'fuera_de_servicio'),
    ).toBe(true);
  });
});
