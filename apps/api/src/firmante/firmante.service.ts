import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { diasHabilesTranscurridos, PLAZO_DIAS_HABILES } from './plazo-habil';
import {
  AutorizarFirmaDto,
  AutorizarFirmaResponse,
  AvisoPlazoVencido,
  BandejaSecretaria,
  InformeRechazado,
  MaquinaAsignada,
  RechazarInformeDto,
  RechazarInformeResponse,
  VistaTernaEdificio,
} from './firmante.types';

@Injectable()
export class FirmanteService {
  private maquinas: MaquinaAsignada[] = [];
  /** Avisos de plazo vencido ya generados, en el orden en que se generaron. */
  private avisos: AvisoPlazoVencido[] = [];

  constructor() {
    this.resetSeed();
  }

  resetSeed(): void {
    this.avisos = [];
    this.maquinas = [
      {
        id: 'MAQ-CORRIENTES-M1',
        codigoAGC: 'M1',
        nombre: 'M1: Ascensor Principal (Derecha)',
        edificio: {
          id: 'EDIF-01',
          direccion: 'Av. Corrientes 1234, CABA',
          administracion: 'Administración Balvanera SRL',
          consorcio: 'Consorcio Corrientes 1234',
        },
        eca: 'Conservación Porteña S.R.L.',
        rtCalle: 'dev-ma-2',
        firmanteId: 'USR-1793292123166',
        firmanteUsername: 'gonza',
        mes: '2026-11',
        estado: 'Recorrida',
        visita: {
          id: 'VIS-2026-11-101',
          fecha: '2026-11-04T10:30:00.000Z',
          inspector: 'dev-ma-2',
          estado: 'Recorrida',
          fotosObligatorias: {
            cables: 'https://storage.nuestrocamino.cloud/fotos/cables-maq-101.jpg',
            frente: 'https://storage.nuestrocamino.cloud/fotos/frente-maq-101.jpg',
          },
          firmaEncargado:
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMCAxMCIvPjwvc3ZnPg==',
          nombreEncargado: 'Carlos Rodríguez (Encargado)',
          autorizada: false,
          fechaAutorizacion: null,
          autorizadoPor: null,
          protocoloAGC: null,
        },
      },
      {
        id: 'MAQ-CORRIENTES-M2',
        codigoAGC: 'M2',
        tipo: 'hidraulico',
        nombre: 'M2: Ascensor Servicio (Izquierda)',
        edificio: {
          id: 'EDIF-01',
          direccion: 'Av. Corrientes 1234, CABA',
          administracion: 'Administración Balvanera SRL',
          consorcio: 'Consorcio Corrientes 1234',
        },
        eca: 'Conservación Porteña S.R.L.',
        rtCalle: 'dev-ma-2',
        firmanteId: 'USR-1793292123166',
        firmanteUsername: 'gonza',
        mes: '2026-11',
        estado: 'Pendiente de Visita',
        estadoOperativo: 'Fuera de Servicio',
        alertaCritica: {
          id: 'ALT-CP-001',
          tipo: 'FUERA_DE_SERVICIO',
          titulo: '🚨 FUERA DE SERVICIO: Cabina Trabada',
          motivo:
            'Cabina trabada mecánicamente a 40cm del piso 4 con deformación en guiadores y rotura de cuña de seguridad. Riesgo inminente de atrapamiento.',
          fotografiaCabinaTrabada:
            'https://storage.nuestrocamino.cloud/fotos/cabina-trabada-corrientes-m2.jpg',
          fechaDeteccion: '2026-11-06T08:30:00.000Z',
          remitoUrl: '/api/eca/remito/ALT-CP-001',
          acuseRecibo: null,
        },
        visita: null,
      },
      {
        id: 'MAQ-CALLAO-M1',
        codigoAGC: 'M1',
        nombre: 'M1: Ascensor Principal',
        edificio: {
          id: 'EDIF-02',
          direccion: 'Av. Callao 850, CABA',
          administracion: 'Administraciones Centro',
          consorcio: 'Consorcio Callao 850',
        },
        eca: 'Elevadores San Martín',
        rtCalle: 'germanG',
        firmanteId: 'USR-1793292123166',
        firmanteUsername: 'gonza',
        mes: '2026-11',
        estado: 'Advertencia',
        estadoOperativo: 'Normal',
        visita: {
          id: 'VIS-2026-11-201',
          fecha: '2026-11-05T14:15:00.000Z',
          inspector: 'germanG',
          estado: 'Advertencia',
          motivoAdvertencia: 'No se pudo realizar la inspección: encargado ausente',
          fotosObligatorias: null,
          firmaEncargado: null,
          autorizada: false,
        },
      },
      {
        id: 'MAQ-SANTAFE-M1',
        codigoAGC: 'M1',
        nombre: 'M1: Ascensor Frontal',
        edificio: {
          id: 'EDIF-03',
          direccion: 'Av. Santa Fe 3200, CABA',
          administracion: 'Estudio Palermo Admin',
          consorcio: 'Consorcio Santa Fe 3200',
        },
        eca: 'MAICON Mantenimiento',
        rtCalle: 'dev-ma-2',
        firmanteId: 'USR-1793292123166',
        firmanteUsername: 'gonza',
        mes: '2026-11',
        estado: 'Recorrida',
        estadoOperativo: 'Reparación Urgente',
        alertaCritica: {
          id: 'ALT-MAICON-001',
          tipo: 'REPARACION_URGENTE',
          titulo: '⚠️ REPARACIÓN URGENTE: Anomalías Graves Detectadas Operando',
          motivo:
            'Freno electromagnético con deslizamiento crítico de 18cm y cables con deshilachado severo. El equipo continúa en marcha con severo riesgo operacional.',
          checklist: [
            {
              item: 'Freno electromagnético de máquina tractora',
              estado: 'Critico',
              observaciones:
                'Deslizamiento severo de 18 cm detectado en prueba de parada con carga',
            },
            {
              item: 'Cables de tracción y amarres de cabina',
              estado: 'Falla',
              observaciones: 'Deshilachado visible en 2 torones del cable central',
            },
            {
              item: 'Seguridad y cerraduras de puertas de palier',
              estado: 'Critico',
              observaciones: 'Patín retráctil no traba cerradura mecánica en piso 3',
            },
            {
              item: 'Limitador de velocidad y paracaídas',
              estado: 'Critico',
              observaciones:
                'Traba centrífuga sin precinto oficial y con juego axial excesivo',
            },
          ],
          fotografiaCabinaTrabada: null,
          fechaDeteccion: '2026-11-06T09:15:00.000Z',
          remitoUrl: '/api/eca/remito/ALT-MAICON-001',
          acuseRecibo: null,
        },
        visita: {
          id: 'VIS-2026-11-301',
          fecha: '2026-11-05T09:00:00.000Z',
          inspector: 'dev-ma-2',
          estado: 'Recorrida',
          fotosObligatorias: {
            cables: 'https://storage.nuestrocamino.cloud/fotos/cables-maq-301.jpg',
            frente: 'https://storage.nuestrocamino.cloud/fotos/frente-maq-301.jpg',
          },
          firmaEncargado: null, // Falta firma del encargado
          nombreEncargado: null,
          autorizada: false,
        },
      },
      {
        id: 'MAQ-SANTAFE-M2',
        codigoAGC: 'M2',
        nombre: 'M2: Ascensor Posterior',
        edificio: {
          id: 'EDIF-03',
          direccion: 'Av. Santa Fe 3200, CABA',
          administracion: 'Estudio Palermo Admin',
          consorcio: 'Consorcio Santa Fe 3200',
        },
        eca: 'MAICON Mantenimiento',
        rtCalle: 'dev-ma-2',
        firmanteId: 'USR-1793292123166',
        firmanteUsername: 'gonza',
        mes: '2026-11',
        estado: 'Recorrida',
        estadoOperativo: 'Fuera de Servicio',
        alertaCritica: {
          id: 'ALT-MAICON-002',
          tipo: 'FUERA_DE_SERVICIO',
          titulo: '🚨 FUERA DE SERVICIO: Cabina Trabada',
          motivo:
            'Cabina trabada mecánicamente con rotura de guiador inferior y acuñamiento forzado en hueco de ascensor. Inmediatamente desenergizado.',
          fotografiaCabinaTrabada:
            'https://storage.nuestrocamino.cloud/fotos/cabina-trabada-santafe-m2.jpg',
          fechaDeteccion: '2026-11-06T07:45:00.000Z',
          remitoUrl: '/api/eca/remito/ALT-MAICON-002',
          acuseRecibo: null,
        },
        visita: {
          id: 'VIS-2026-11-302',
          fecha: '2026-11-05T09:45:00.000Z',
          inspector: 'dev-ma-2',
          estado: 'Recorrida',
          fotosObligatorias: {
            cables: '', // Falta foto de cables
            frente: 'https://storage.nuestrocamino.cloud/fotos/frente-maq-302.jpg',
          },
          firmaEncargado:
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMCAxMCIvPjwvc3ZnPg==',
          nombreEncargado: 'Roberto Gómez',
          autorizada: false,
        },
      },
    ];
  }

  getMaquinas(): MaquinaAsignada[] {
    return this.maquinas;
  }

  /**
   * ¿La máquina es de este Firmante? Por su usuario de login (que no distingue mayúsculas, como el login). El usuario puede ser el
   * nombre con que la terna nombra al Firmante o su email.
   */
  private esDelFirmante(m: MaquinaAsignada, firmante: string): boolean {
    const quien = firmante.trim().toLowerCase();
    return m.firmanteUsername.trim().toLowerCase() === quien || (m.firmanteEmail ?? '').trim().toLowerCase() === quien;
  }

  async getMaquinasDelMes(
    firmanteIdOrUsername?: string,
    mes?: string,
  ): Promise<MaquinaAsignada[]> {
    return this.maquinas.filter((m) => {
      const matchFirmante =
        !firmanteIdOrUsername || m.firmanteId === firmanteIdOrUsername || this.esDelFirmante(m, firmanteIdOrUsername);
      const matchMes = !mes || m.mes === mes;
      return matchFirmante && matchMes;
    });
  }

  /**
   * HU-02 RF-06: hace que las máquinas de un edificio de la base sigan a su terna. `vista` es el edificio con su terna vigente;
   * `null` si el edificio ya no existe o no tiene terna.
   * - Con terna: por cada máquina del edificio hay una máquina en la vista de firma, con el RT de Calle, el Firmante y la ECA de
   *   la terna. Las que no estaban se crean pendientes de visita. Las máquinas de ejemplo (que no vienen de la base) no se tocan.
   * - Sin terna: las máquinas del edificio se quitan.
   * Lo que ya pasó en una máquina (visita, alerta) no se pierde al resincronizar. Es idempotente.
   */
  aplicarTernaDeEdificio(consorcioId: string, vista: VistaTernaEdificio | null): void {
    if (!vista) {
      this.maquinas = this.maquinas.filter((m) => m.consorcioId !== consorcioId);
      return;
    }
    const edificio = { id: consorcioId, direccion: vista.direccion, administracion: vista.administracion ?? '', consorcio: vista.nombre };
    const mes = new Date().toISOString().slice(0, 7);
    const ids = new Set(vista.maquinas.map((q) => `MAQ-${consorcioId}-${q.id}`));
    // Las máquinas que se dieron de baja en el edificio salen de la vista de firma.
    this.maquinas = this.maquinas.filter((m) => m.consorcioId !== consorcioId || ids.has(m.id));
    for (const q of vista.maquinas) {
      const id = `MAQ-${consorcioId}-${q.id}`;
      const nombre = q.descripcion ? `${q.referenciaAgc}: ${q.descripcion}` : q.referenciaAgc;
      let m = this.maquinas.find((x) => x.id === id);
      if (!m) {
        m = {
          id,
          codigoAGC: q.referenciaAgc,
          nombre,
          edificio,
          eca: '',
          rtCalle: '',
          firmanteId: '',
          firmanteUsername: '',
          consorcioId,
          mes,
          estado: 'Pendiente de Visita',
          visita: null,
        };
        this.maquinas.push(m);
      }
      m.codigoAGC = q.referenciaAgc;
      m.tipo = q.tipo;
      m.nombre = nombre;
      m.edificio = edificio;
      m.rtCalle = vista.terna.rtCalle.nombre;
      m.firmanteUsername = vista.terna.firmante.nombre;
      m.firmanteId = vista.terna.firmante.nombre;
      m.firmanteEmail = vista.terna.firmante.email;
      m.eca = vista.terna.eca.nombre;
    }
  }

  /**
   * `firmantePermitido` (HU-08 RF-04): el Firmante de la sesión; la máquina tiene que ser suya, si no da el mismo 404 que una
   * máquina que no existe (no se revela que existe).
   */
  async autorizarFirma(
    dto: AutorizarFirmaDto,
    firmanteUsername: string = 'gonza',
    firmantePermitido?: string,
  ): Promise<AutorizarFirmaResponse> {
    if (!dto || (!dto.maquinaId && !dto.visitaId)) {
      throw new BadRequestException('maquinaId o visitaId es requerido');
    }

    const maquina = this.maquinas.find(
      (m) =>
        (dto.maquinaId && m.id === dto.maquinaId) ||
        (dto.visitaId && m.visita?.id === dto.visitaId),
    );

    if (!maquina || (firmantePermitido !== undefined && !this.esDelFirmante(maquina, firmantePermitido))) {
      throw new NotFoundException('Máquina o visita no encontrada');
    }

    // Validación 1: La visita debe estar en estado 'Recorrida'
    if (maquina.estado !== 'Recorrida' || !maquina.visita) {
      throw new BadRequestException(
        `No se puede autorizar: la visita debe estar en estado Recorrida (estado actual: ${maquina.estado})`,
      );
    }

    const visita = maquina.visita;

    // Un informe rechazado volvió a la Secretaría: no se autoriza, aunque además le falten datos.
    if (visita.rechazada) {
      throw new ConflictException('No se puede autorizar: el informe fue rechazado y volvió a la Secretaría.');
    }

    // Validación 2: Fotos obligatorias (cables y frente)
    if (
      !visita.fotosObligatorias ||
      !visita.fotosObligatorias.cables ||
      visita.fotosObligatorias.cables.trim() === '' ||
      !visita.fotosObligatorias.frente ||
      visita.fotosObligatorias.frente.trim() === ''
    ) {
      throw new BadRequestException(
        'No se puede autorizar: la visita debe contar con fotos obligatorias de cables y frente',
      );
    }

    // Validación 3: Firma del encargado
    if (
      !visita.firmaEncargado ||
      typeof visita.firmaEncargado !== 'string' ||
      visita.firmaEncargado.trim() === ''
    ) {
      throw new BadRequestException(
        'No se puede autorizar: la visita debe contar con la firma del encargado en el informe',
      );
    }

    // Registro formal de autorización digital
    visita.autorizada = true;
    visita.fechaAutorizacion = new Date().toISOString();
    visita.autorizadoPor = firmanteUsername;
    visita.protocoloAGC = `AGC-2026-AUT-${maquina.id}`;

    return {
      ok: true,
      mensaje: 'Firma digital AGC autorizada con respaldo legal',
      maquinaId: maquina.id,
      visitaId: visita.id,
      autorizacion: {
        autorizada: true,
        fechaAutorizacion: visita.fechaAutorizacion,
        autorizadoPor: visita.autorizadoPor,
        protocoloAGC: visita.protocoloAGC,
      },
    };
  }

  /**
   * HU-08 RF-03: el Firmante rechaza un informe con motivo obligatorio. El informe vuelve a la Secretaría (no al RT de
   * Calle) y se ve en su bandeja. Sólo se rechaza un informe recorrido que todavía no se autorizó ni se rechazó.
   */
  async rechazarInforme(
    dto: RechazarInformeDto,
    firmanteUsername: string = 'gonza',
    ahora: Date = new Date(),
    firmantePermitido?: string,
  ): Promise<RechazarInformeResponse> {
    if (!dto || (!dto.maquinaId && !dto.visitaId)) {
      throw new BadRequestException('maquinaId o visitaId es requerido');
    }
    const motivo = typeof dto.motivo === 'string' ? dto.motivo.trim() : '';
    if (!motivo) throw new BadRequestException('El motivo del rechazo es obligatorio.');
    if (motivo.length > 500) throw new BadRequestException('El motivo del rechazo no puede superar los 500 caracteres.');

    const maquina = this.maquinas.find(
      (m) => (dto.maquinaId && m.id === dto.maquinaId) || (dto.visitaId && m.visita?.id === dto.visitaId),
    );
    if (!maquina || (firmantePermitido !== undefined && !this.esDelFirmante(maquina, firmantePermitido))) {
      throw new NotFoundException('Máquina o visita no encontrada');
    }
    const visita = maquina.visita;
    if (maquina.estado !== 'Recorrida' || !visita) {
      throw new BadRequestException(
        `No se puede rechazar: la visita debe estar en estado Recorrida (estado actual: ${maquina.estado})`,
      );
    }
    if (visita.autorizada) throw new ConflictException('No se puede rechazar: el informe ya fue autorizado.');
    if (visita.rechazada) throw new ConflictException('El informe ya fue rechazado.');

    visita.rechazada = true;
    visita.motivoRechazo = motivo;
    visita.fechaRechazo = ahora.toISOString();
    visita.rechazadoPor = firmanteUsername;

    return {
      ok: true,
      mensaje: 'Informe rechazado: vuelve a la Secretaría.',
      maquinaId: maquina.id,
      visitaId: visita.id,
      rechazo: { motivo, rechazadoPor: firmanteUsername, fecha: visita.fechaRechazo },
    };
  }

  /**
   * Genera los avisos de plazo vencido que falten: un informe recorrido con más de 5 días hábiles (lunes a viernes) sin
   * autorizar ni rechazar avisa a la Secretaría, una sola vez. Un informe autorizado o rechazado dentro del plazo no avisa.
   * No hay un reloj que lo dispare solo: se genera cuando la Secretaría abre su bandeja (y es idempotente).
   */
  generarAvisosDePlazo(ahora: Date = new Date()): AvisoPlazoVencido[] {
    for (const m of this.maquinas) {
      const v = m.visita;
      if (!v || m.estado !== 'Recorrida' || v.autorizada || v.rechazada || v.avisoPlazoEn) continue;
      const dias = diasHabilesTranscurridos(new Date(v.fecha), ahora);
      if (dias <= PLAZO_DIAS_HABILES) continue;
      v.avisoPlazoEn = ahora.toISOString();
      this.avisos.push({
        maquinaId: m.id,
        codigoAGC: m.codigoAGC,
        edificio: m.edificio.consorcio,
        visitaId: v.id,
        fechaInforme: v.fecha,
        diasHabiles: dias,
        fecha: v.avisoPlazoEn,
      });
    }
    return this.avisos.map((a) => ({ ...a }));
  }

  /** La bandeja de la Secretaría: los informes que el Firmante rechazó (con el motivo) y los avisos de plazo vencido. */
  getBandejaSecretaria(ahora: Date = new Date()): BandejaSecretaria {
    const avisosPlazo = this.generarAvisosDePlazo(ahora);
    const rechazados: InformeRechazado[] = this.maquinas
      .filter((m) => m.visita?.rechazada)
      .map((m) => ({
        maquinaId: m.id,
        codigoAGC: m.codigoAGC,
        edificio: m.edificio.consorcio,
        visitaId: m.visita!.id,
        motivo: m.visita!.motivoRechazo ?? '',
        rechazadoPor: m.visita!.rechazadoPor ?? '',
        fecha: m.visita!.fechaRechazo ?? '',
      }));
    return { rechazados, avisosPlazo };
  }
}
