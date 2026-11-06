import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AutorizarFirmaDto,
  AutorizarFirmaResponse,
  MaquinaAsignada,
} from './firmante.types';

@Injectable()
export class FirmanteService {
  private maquinas: MaquinaAsignada[] = [];

  constructor() {
    this.resetSeed();
  }

  resetSeed(): void {
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

  async getMaquinasDelMes(
    firmanteIdOrUsername?: string,
    mes?: string,
  ): Promise<MaquinaAsignada[]> {
    return this.maquinas.filter((m) => {
      const matchFirmante =
        !firmanteIdOrUsername ||
        m.firmanteId === firmanteIdOrUsername ||
        m.firmanteUsername.toLowerCase() === firmanteIdOrUsername.toLowerCase();
      const matchMes = !mes || m.mes === mes;
      return matchFirmante && matchMes;
    });
  }

  async autorizarFirma(
    dto: AutorizarFirmaDto,
    firmanteUsername: string = 'gonza',
  ): Promise<AutorizarFirmaResponse> {
    if (!dto || (!dto.maquinaId && !dto.visitaId)) {
      throw new BadRequestException('maquinaId o visitaId es requerido');
    }

    const maquina = this.maquinas.find(
      (m) =>
        (dto.maquinaId && m.id === dto.maquinaId) ||
        (dto.visitaId && m.visita?.id === dto.visitaId),
    );

    if (!maquina) {
      throw new NotFoundException('Máquina o visita no encontrada');
    }

    // Validación 1: La visita debe estar en estado 'Recorrida'
    if (maquina.estado !== 'Recorrida' || !maquina.visita) {
      throw new BadRequestException(
        `No se puede autorizar: la visita debe estar en estado Recorrida (estado actual: ${maquina.estado})`,
      );
    }

    const visita = maquina.visita;

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
}
