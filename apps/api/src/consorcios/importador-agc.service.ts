import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TipoMaquina } from './consorcio.types';
import { ConsorciosRepository } from './consorcios.repository';
import {
  ESTADOS_AGC_VALIDOS,
  ErrorFilaAgc,
  EstadoAgc,
  FilaAgcValidada,
  MAX_BYTES_EXCEL_AGC,
  ResultadoImportacionAgc,
} from './importador-agc.types';

export interface ArchivoExcelSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Cabecera ZIP (PK\x03\x04) que identifica un archivo OOXML (.xlsx) genuino. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const ALIAS_COLUMNAS = {
  direccion: ['direccion', 'domicilio', 'ubicacion', 'calle y altura', 'calle'],
  matricula: ['matricula agc', 'matricula', 'referencia agc', 'referencia', 'nro matricula', 'patente', 'codigo agc'],
  tipo: ['tipo de equipo', 'tipo equipo', 'tipo', 'tipo de maquina', 'tipo maquina', 'equipo'],
  estado: ['estado', 'estado agc', 'situacion', 'estado habilitacion'],
  nombre: ['nombre', 'consorcio', 'edificio', 'nombre edificio'],
  descripcion: ['descripcion', 'detalle', 'observaciones'],
  latitud: ['latitud', 'lat'],
  longitud: ['longitud', 'lng', 'lon'],
} as const;

const ALIAS_TIPOS: Record<string, TipoMaquina> = {
  traccion: 'traccion',
  ascensor: 'traccion',
  'ascensor traccion': 'traccion',
  electromecanico: 'traccion',
  hidraulico: 'hidraulico',
  'ascensor hidraulico': 'hidraulico',
  montavehiculos: 'montavehiculos',
  montavehiculo: 'montavehiculos',
  montacoches: 'montavehiculos',
  montacargas: 'montavehiculos',
};

const ALIAS_ESTADOS: Record<string, EstadoAgc> = {
  apto: 'APTO',
  habilitado: 'APTO',
  'no apto': 'NO APTO',
  no_apto: 'NO APTO',
  observado: 'OBSERVADO',
  condicional: 'CONDICIONAL',
  'fuera de servicio': 'FUERA DE SERVICIO',
  fuera_de_servicio: 'FUERA DE SERVICIO',
  'fuera de uso': 'FUERA DE SERVICIO',
  pendiente: 'PENDIENTE',
  clausurado: 'CLAUSURADO',
  baja: 'BAJA',
};

function normalizarClave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor).trim();
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') {
    if ('text' in valor && typeof valor.text === 'string') return valor.text.trim();
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((r) => r.text ?? '').join('').trim();
    }
    if ('result' in valor && valor.result !== undefined && valor.result !== null) {
      return String(valor.result).trim();
    }
  }
  return '';
}

function parsearNumeroOpcional(texto: string): number | null {
  if (!texto) return null;
  const normalizado = texto.replace(',', '.');
  const num = Number(normalizado);
  return Number.isFinite(num) ? num : Number.NaN;
}

@Injectable()
export class ImportadorAgcService {
  constructor(private readonly consorcios: ConsorciosRepository) {}

  /** Valida el archivo subido (.xlsx <= 5 MB), procesa filas y persiste altas/actualizaciones. */
  async importarArchivo(archivo: ArchivoExcelSubido | undefined): Promise<ResultadoImportacionAgc> {
    if (!archivo) {
      throw new BadRequestException('Debe adjuntar un archivo .xlsx en el campo "archivo".');
    }

    const nombre = (archivo.originalname ?? '').trim();
    if (!nombre.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Formato de archivo inválido: solo se admiten archivos .xlsx.');
    }

    const tamano = archivo.buffer?.length ?? archivo.size ?? 0;
    if (tamano === 0) {
      throw new BadRequestException('El archivo .xlsx está vacío.');
    }

    if (tamano > MAX_BYTES_EXCEL_AGC || (archivo.size ?? 0) > MAX_BYTES_EXCEL_AGC) {
      throw new BadRequestException('El archivo supera el tamaño máximo permitido de 5 MB.');
    }

    if (!archivo.buffer || archivo.buffer.length < 4 || !archivo.buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
      throw new BadRequestException('El contenido del archivo no corresponde a un libro Excel (.xlsx) válido.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(archivo.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo .xlsx: verifique que no esté dañado ni protegido.');
    }

    const hoja = workbook.worksheets[0];
    if (!hoja || hoja.rowCount === 0) {
      throw new BadRequestException('El archivo .xlsx no contiene hojas con datos.');
    }

    const encabezados = this.mapearEncabezados(hoja.getRow(1));
    const faltantes: string[] = [];
    if (!encabezados.direccion) faltantes.push('Dirección');
    if (!encabezados.matricula) faltantes.push('Matrícula AGC');
    if (!encabezados.tipo) faltantes.push('Tipo de equipo');
    if (!encabezados.estado) faltantes.push('Estado');

    if (faltantes.length > 0) {
      throw new BadRequestException(
        `El archivo .xlsx no contiene las columnas obligatorias: ${faltantes.join(', ')}.`,
      );
    }

    const filasValidas: FilaAgcValidada[] = [];
    const errores: ErrorFilaAgc[] = [];
    const matriculasEnArchivo = new Map<string, number>();
    let totalFilas = 0;

    for (let r = 2; r <= hoja.rowCount; r++) {
      const row = hoja.getRow(r);
      const direccion = textoCelda(row.getCell(encabezados.direccion!).value);
      const matriculaRaw = textoCelda(row.getCell(encabezados.matricula!).value);
      const tipoRaw = textoCelda(row.getCell(encabezados.tipo!).value);
      const estadoRaw = textoCelda(row.getCell(encabezados.estado!).value);
      const nombreRaw = encabezados.nombre ? textoCelda(row.getCell(encabezados.nombre).value) : '';
      const descripcionRaw = encabezados.descripcion ? textoCelda(row.getCell(encabezados.descripcion).value) : '';
      const latRaw = encabezados.latitud ? textoCelda(row.getCell(encabezados.latitud).value) : '';
      const lngRaw = encabezados.longitud ? textoCelda(row.getCell(encabezados.longitud).value) : '';

      // Fila completamente vacía: se ignora sin contarla como error.
      if (!direccion && !matriculaRaw && !tipoRaw && !estadoRaw && !nombreRaw && !descripcionRaw) {
        continue;
      }

      totalFilas += 1;
      const motivos: string[] = [];

      if (!direccion) {
        motivos.push('Falta la dirección del edificio');
      } else if (direccion.length > 200) {
        motivos.push('La dirección supera los 200 caracteres');
      }

      if (!matriculaRaw) {
        motivos.push('Falta la matrícula AGC');
      } else if (matriculaRaw.length > 40) {
        motivos.push('La matrícula AGC supera los 40 caracteres');
      }

      const tipoNorm = ALIAS_TIPOS[normalizarClave(tipoRaw)];
      if (!tipoRaw) {
        motivos.push('Falta el tipo de equipo');
      } else if (!tipoNorm) {
        motivos.push(`Tipo de equipo inválido: "${tipoRaw}" (válidos: traccion, hidraulico, montavehiculos)`);
      }

      const estadoNorm = ALIAS_ESTADOS[normalizarClave(estadoRaw)];
      if (!estadoRaw) {
        motivos.push('Falta el estado AGC');
      } else if (!estadoNorm) {
        motivos.push(`Estado AGC inválido: "${estadoRaw}" (válidos: ${ESTADOS_AGC_VALIDOS.join(', ')})`);
      }

      let ubicacion: { latitud: number; longitud: number } | null = null;
      if (latRaw || lngRaw) {
        const lat = parsearNumeroOpcional(latRaw);
        const lng = parsearNumeroOpcional(lngRaw);
        if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
          motivos.push('Latitud y longitud deben ser números válidos y venir juntas');
        } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          motivos.push('Coordenadas geográficas fuera de rango');
        } else {
          ubicacion = { latitud: lat, longitud: lng };
        }
      }

      const claveMatricula = matriculaRaw.toLowerCase();
      if (matriculaRaw && matriculasEnArchivo.has(claveMatricula)) {
        const filaPrevia = matriculasEnArchivo.get(claveMatricula);
        motivos.push(`Matrícula AGC "${matriculaRaw}" duplicada en el archivo (ya apareció en la fila ${filaPrevia})`);
      }

      if (motivos.length > 0) {
        errores.push({
          fila: r,
          matriculaAgc: matriculaRaw || null,
          motivo: motivos.join('; '),
        });
        continue;
      }

      matriculasEnArchivo.set(claveMatricula, r);
      filasValidas.push({
        fila: r,
        direccion,
        nombreEdificio: nombreRaw || direccion,
        matriculaAgc: matriculaRaw,
        tipo: tipoNorm,
        estadoAgc: estadoNorm,
        descripcion: descripcionRaw || null,
        ubicacion,
      });
    }

    const persistencia =
      filasValidas.length > 0
        ? await this.consorcios.importarMaquinasAgc(filasValidas)
        : { creadas: 0, actualizadas: 0, consorciosCreados: 0, detalle: [] };

    const rechazadas = errores.length;

    return {
      resumen: {
        totalFilas,
        creadas: persistencia.creadas,
        actualizadas: persistencia.actualizadas,
        rechazadas,
        consorciosCreados: persistencia.consorciosCreados,
      },
      creadas: persistencia.creadas,
      actualizadas: persistencia.actualizadas,
      rechazadas,
      consorciosCreados: persistencia.consorciosCreados,
      errores,
      detalle: persistencia.detalle,
    };
  }

  /** Genera un libro .xlsx modelo con las columnas esperadas por el importador AGC. */
  async generarPlantillaXlsx(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MAICON S.R.L.';
    const ws = wb.addWorksheet('Padron AGC');
    ws.columns = [
      { header: 'Dirección', key: 'direccion', width: 32 },
      { header: 'Matrícula AGC', key: 'matricula', width: 18 },
      { header: 'Tipo de equipo', key: 'tipo', width: 18 },
      { header: 'Estado', key: 'estado', width: 20 },
      { header: 'Nombre Edificio', key: 'nombre', width: 28 },
      { header: 'Descripción', key: 'descripcion', width: 24 },
    ];
    ws.addRow({
      direccion: 'Av. Corrientes 1234',
      matricula: 'AGC-1001',
      tipo: 'traccion',
      estado: 'APTO',
      nombre: 'Consorcio Corrientes 1234',
      descripcion: 'Ascensor Principal',
    });
    ws.addRow({
      direccion: 'Av. Santa Fe 2450',
      matricula: 'AGC-1002',
      tipo: 'hidraulico',
      estado: 'OBSERVADO',
      nombre: 'Consorcio Santa Fe 2450',
      descripcion: 'Montavehículos Subsuelo',
    });
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out);
  }

  private mapearEncabezados(filaEncabezado: ExcelJS.Row): {
    direccion?: number;
    matricula?: number;
    tipo?: number;
    estado?: number;
    nombre?: number;
    descripcion?: number;
    latitud?: number;
    longitud?: number;
  } {
    const mapa: Record<string, number> = {};
    filaEncabezado.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const clave = normalizarClave(textoCelda(cell.value));
      if (!clave) return;
      for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
        if (mapa[campo] === undefined && (alias as readonly string[]).includes(clave)) {
          mapa[campo] = colNumber;
        }
      }
    });
    return mapa;
  }
}
