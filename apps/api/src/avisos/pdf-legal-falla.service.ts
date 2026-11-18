import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { textoParaPdf } from '../eca/pdf-texto';

export interface DatosPdfLegalFalla {
  avisoId: string;
  alertaId: string;
  consorcio: string;
  direccion: string;
  equipo: string;
  eca: string;
  fechaDeteccion: string;
  fallas: string[];
  observaciones?: string;
  fotografias?: string[];
  aprobadoPor?: string | null;
  aprobadoEn?: string | null;
  enlaceInforme?: string | null;
}

export interface PdfLegalGenerado {
  filename: string;
  buffer: Buffer;
  mimeType: 'application/pdf';
  sha256: string;
}

const DATA_URL_IMAGEN = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * Genera el PDF legal formal con membrete provisorio de MAICON S.R.L. para el deslinde
 * de responsabilidad por Falla Crítica (HU-06 RF-02 / REQ-1791910396553).
 * Todo texto pasa por `textoParaPdf` para evitar caracteres inválidos en fuentes WinAnsi.
 */
@Injectable()
export class PdfLegalFallaService {
  async generarPdf(datos: DatosPdfLegalFalla): Promise<PdfLegalGenerado> {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
          Title: `Notificación Formal de Falla Crítica - ${textoParaPdf(datos.alertaId)}`,
          Author: 'MAICON S.R.L.',
          Subject: 'Deslinde de Responsabilidad Técnica - Falla Crítica de Elevadores',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const t = (v: unknown) => textoParaPdf(v);
      const fechaEmision = new Date().toISOString();

      // Membrete oficial (provisorio hasta recibir arte final de MAICON - P13.a)
      doc.rect(48, 42, 499, 64).fill('#0f172a');
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('MAICON S.R.L.', 62, 54);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#cbd5e1')
        .text('Conservacion y Mantenimiento de Elevadores · CABA (Membrete Provisorio P13.a)', 62, 74);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#f8fafc')
        .text(`DOC: ${t(datos.avisoId)}`, 360, 56, { width: 175, align: 'right' })
        .font('Helvetica')
        .text(`EMISION: ${t(fechaEmision)}`, 360, 72, { width: 175, align: 'right' });

      // Título principal
      doc
        .fillColor('#991b1b')
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .text('NOTIFICACION FORMAL DE FALLA CRITICA Y DESLINDE DE RESPONSABILIDAD', 48, 122, {
          width: 499,
          align: 'center',
        });

      doc
        .moveTo(48, 144)
        .lineTo(547, 144)
        .strokeColor('#dc2626')
        .lineWidth(1.5)
        .stroke();

      // Bloque 1: Datos del Edificio y la Máquina
      let y = 158;
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('1. DATOS DEL EDIFICIO Y DE LA MAQUINA', 48, y);
      y += 18;

      const filasDatos: [string, string][] = [
        ['Consorcio / Edificio:', t(datos.consorcio)],
        ['Direccion:', t(datos.direccion)],
        ['Maquina / Matricula AGC:', t(datos.equipo)],
        ['Empresa Conservadora (ECA):', t(datos.eca)],
        ['ID de Alerta / Informe:', t(datos.alertaId)],
        ['Fecha y Hora de Deteccion:', t(datos.fechaDeteccion)],
      ];

      doc.fontSize(9.5);
      for (const [etiqueta, valor] of filasDatos) {
        doc.font('Helvetica-Bold').fillColor('#334155').text(etiqueta, 56, y, { width: 165 });
        doc.font('Helvetica').fillColor('#0f172a').text(valor || 'Sin informar', 225, y, { width: 315 });
        y += 16;
      }

      // Bloque 2: Detalle de Fallas Críticas
      y += 10;
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('2. DETALLE DE FALLAS CRITICAS DETECTADAS', 48, y);
      y += 18;

      const fallas = datos.fallas.length > 0 ? datos.fallas : ['Falla critica informada sin descripcion especifica'];
      doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b');
      fallas.forEach((falla, idx) => {
        const linea = `${idx + 1}. ${t(falla)}`;
        doc.text(linea, 56, y, { width: 485 });
        y = doc.y + 4;
      });

      if (datos.observaciones && t(datos.observaciones)) {
        y += 6;
        doc.font('Helvetica-Bold').fillColor('#334155').text('Observaciones tecnicas:', 56, y);
        y = doc.y + 2;
        doc.font('Helvetica').fillColor('#0f172a').text(t(datos.observaciones), 56, y, { width: 485 });
        y = doc.y + 8;
      }

      // Bloque 3: Fotos adjuntas
      y += 10;
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('3. FOTOS ADJUNTAS DE EVIDENCIA', 48, y);
      y = doc.y + 8;

      const fotos = (datos.fotografias ?? []).filter((f) => typeof f === 'string' && f.trim().length > 0);
      if (fotos.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#64748b').text('Sin fotografias adjuntas en el informe original.', 56, y);
        y = doc.y + 8;
      } else {
        for (let i = 0; i < fotos.length; i++) {
          const foto = fotos[i].trim();
          const match = DATA_URL_IMAGEN.exec(foto);
          if (y > 680) {
            doc.addPage();
            y = 54;
          }
          if (match) {
            try {
              const imgBuf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
              doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`Foto adjunta #${i + 1} (imagen embebida):`, 56, y);
              y = doc.y + 4;
              doc.image(imgBuf, 56, y, { fit: [220, 130] });
              y += 138;
              continue;
            } catch {
              // Si la imagen base64 estuviera corrupta, dejar referencia textual sin abortar el PDF.
            }
          }
          doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(`Foto adjunta #${i + 1}: ${t(foto)}`, 56, y, { width: 485 });
          y = doc.y + 5;
        }
      }

      // Bloque 4: Cláusula Legal de Deslinde de Responsabilidad
      if (y > 650) {
        doc.addPage();
        y = 54;
      }
      y += 12;
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('4. DESLINDE DE RESPONSABILIDAD LEGAL', 48, y);
      y = doc.y + 6;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#1e293b')
        .text(
          'Por medio del presente documento, MAICON S.R.L. notifica fehacientemente a la Empresa Conservadora de Ascensores (ECA) responsable del edificio la deteccion de las fallas criticas arriba detalladas, dejando expresa constancia de deslinde de responsabilidad ante la continuidad operativa del equipo sin la correspondiente intervencion tecnica correctiva conforme normativa vigente de la AGC (CABA).',
          56,
          y,
          { width: 485, align: 'justify' },
        );

      // Bloque 5: Aprobación de Secretaría
      y = doc.y + 14;
      doc.rect(48, y, 499, 52).fillAndStroke('#f8fafc', '#cbd5e1');
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('CONSTANCIA DE REVISION Y APROBACION (SECRETARIA MAICON S.R.L.)', 58, y + 8);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(
          `Aprobado por: ${t(datos.aprobadoPor || 'Pendiente de aprobacion')} | Fecha aprobacion: ${t(datos.aprobadoEn || 'Pendiente')}`,
          58,
          y + 22,
          { width: 480 },
        )
        .text(
          `Enlace al informe tecnico: ${t(datos.enlaceInforme || 'Disponible al aprobar el aviso')}`,
          58,
          y + 35,
          { width: 480 },
        );

      doc.end();
    });

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const idLimpio = datos.alertaId.replace(/[^A-Za-z0-9_-]/g, '_');
    return {
      filename: `deslinde-maicon-${idLimpio}.pdf`,
      buffer,
      mimeType: 'application/pdf',
      sha256,
    };
  }
}
