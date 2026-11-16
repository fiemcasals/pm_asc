import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { RemitoTecnicoResponse } from './eca.types';

@Injectable()
export class RemitoPdfService {
  /**
   * Genera el remito técnico oficial en formato PDF con membrete institucional de MAICON S.R.L.,
   * datos del consorcio, diagnóstico técnico de la falla crítica y sello de acuse legal fehaciente.
   */
  async generarPdf(remito: RemitoTecnicoResponse): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Remito Técnico Oficial - ${remito.codigoAGC} - ${remito.id}`,
          Author: 'MAICON S.R.L. - Sistema de Gestión de Elevadores',
          Subject: 'Notificación Fehaciente de Falla Crítica y Acuse Legal AGC',
          Keywords: 'elevador, remito, ascensor, agc, maicon, falla critica, acuse legal',
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const MARGIN = 40;
      const PAGE_WIDTH = 595.28;
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 515.28 pt

      // 1. Barra Superior Institucional
      const headerY = 40;
      const headerHeight = 52;
      doc
        .rect(MARGIN, headerY, CONTENT_WIDTH, headerHeight)
        .fill('#881337'); // Maroon / Red AGC oficial

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text('MAICON S.R.L. · SISTEMA DE INSPECCIÓN Y SEGURIDAD VERTICAL', MARGIN + 14, headerY + 12);

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#fecdd3')
        .text('Habilitación AGC Registro Oficial CABA · Conforme Ley 6100 y Ordenanza 49308', MARGIN + 14, headerY + 30);

      // 2. Encabezado del Remito
      let currentY = headerY + headerHeight + 16;

      doc
        .fillColor('#991b1b')
        .font('Helvetica-Bold')
        .fontSize(15)
        .text('REMITO TÉCNICO OFICIAL DE NOTIFICACIÓN CRÍTICA', MARGIN, currentY);

      currentY += 18;
      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(8.5)
        .text('DOCUMENTO DE DESLINDE LEGAL DE RESPONSABILIDAD Y COMUNICACIÓN FEHACIENTE A LA ECA', MARGIN, currentY);

      currentY += 16;

      // 3. Fila de Identificadores (Pills / Resumen)
      const pillY = currentY;
      const pillHeight = 28;
      doc
        .rect(MARGIN, pillY, CONTENT_WIDTH, pillHeight)
        .fillAndStroke('#f8fafc', '#cbd5e1');

      doc
        .fillColor('#1e293b')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text('N° REMITO: ', MARGIN + 10, pillY + 9, { continued: true })
        .font('Helvetica')
        .text(`${remito.id}   |   `, { continued: true })
        .font('Helvetica-Bold')
        .text('ALERTA ID: ', { continued: true })
        .font('Helvetica')
        .text(`${remito.alertaId}   |   `, { continued: true })
        .font('Helvetica-Bold')
        .text('FECHA EMISIÓN: ', { continued: true })
        .font('Helvetica')
        .text(`${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR')}`);

      currentY = pillY + pillHeight + 14;

      // 4. Bloque de Datos del Edificio y Elevador
      const box1Height = 84;
      doc
        .rect(MARGIN, currentY, CONTENT_WIDTH, box1Height)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('DATOS DEL CONSORCIO Y MÁQUINA INSPECCIONADA', MARGIN + 12, currentY + 10);

      const col1X = MARGIN + 12;
      const col2X = MARGIN + (CONTENT_WIDTH / 2) + 6;
      const dataRowY1 = currentY + 28;
      const dataRowY2 = currentY + 44;
      const dataRowY3 = currentY + 60;

      // Columna 1
      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
        .text('Consorcio: ', col1X, dataRowY1, { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(remito.edificio.consorcio);

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
        .text('Dirección: ', col1X, dataRowY2, { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(remito.edificio.direccion);

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
        .text('Administración: ', col1X, dataRowY3, { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(remito.edificio.administracion || 'No informada');

      // Columna 2
      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
        .text('Código AGC: ', col2X, dataRowY1, { continued: true })
        .font('Helvetica-Bold').fillColor('#991b1b').text(remito.codigoAGC);

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
        .text('Elevador: ', col2X, dataRowY2, { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(remito.nombreMaquina);

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
        .text('Conservadora (ECA): ', col2X, dataRowY3, { continued: true })
        .font('Helvetica-Bold').fillColor('#0f172a').text(remito.eca);

      currentY += box1Height + 14;

      // 5. Bloque de Falla Crítica
      const box2Y = currentY;
      const box2Height = 90;
      doc
        .rect(MARGIN, box2Y, CONTENT_WIDTH, box2Height)
        .fillAndStroke('#fff1f2', '#fecdd3');

      doc
        .fillColor('#9f1239')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`DIAGNÓSTICO TÉCNICO DE FALLA CRÍTICA: ${remito.titulo.toUpperCase()}`, MARGIN + 12, box2Y + 10);

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#881337')
        .text('Tipo de Alerta: ', MARGIN + 12, box2Y + 28, { continued: true })
        .font('Helvetica-Bold').fillColor('#b91c1c').text(remito.tipoAlerta, { continued: true })
        .font('Helvetica-Bold').fillColor('#881337').text('   |   Fecha Detección: ', { continued: true })
        .font('Helvetica').fillColor('#0f172a').text(new Date(remito.fechaDeteccion).toLocaleString('es-AR'));

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#881337')
        .text('Descripción / Motivo:', MARGIN + 12, box2Y + 44);

      doc
        .font('Helvetica').fontSize(8.5).fillColor('#1e293b')
        .text(remito.motivo, MARGIN + 12, box2Y + 56, {
          width: CONTENT_WIDTH - 24,
          align: 'left',
        });

      currentY = box2Y + box2Height + 14;

      // 6. Checklist de Seguridad (si existe)
      if (remito.checklist && remito.checklist.length > 0) {
        doc
          .fillColor('#0f172a')
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text('CHECKLIST DE SEGURIDAD INSPECCIONADO', MARGIN, currentY);

        currentY += 14;

        // Tabla de ítems
        const rowHeight = 20;
        doc
          .rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight)
          .fill('#f1f5f9');

        doc
          .font('Helvetica-Bold').fontSize(8).fillColor('#334155')
          .text('COMPONENTE / ÍTEM', MARGIN + 8, currentY + 6)
          .text('ESTADO', MARGIN + 170, currentY + 6)
          .text('OBSERVACIONES TÉCNICAS', MARGIN + 260, currentY + 6);

        currentY += rowHeight;

        for (const item of remito.checklist) {
          doc
            .rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight)
            .stroke('#e2e8f0');

          doc
            .font('Helvetica-Bold').fontSize(8).fillColor('#0f172a')
            .text(item.item, MARGIN + 8, currentY + 6, { width: 155, ellipsis: true });

          doc
            .font('Helvetica-Bold').fontSize(8).fillColor('#b91c1c')
            .text(`⚠️ ${item.estado}`, MARGIN + 170, currentY + 6);

          doc
            .font('Helvetica').fontSize(8).fillColor('#475569')
            .text(item.observaciones, MARGIN + 260, currentY + 6, { width: CONTENT_WIDTH - 270, ellipsis: true });

          currentY += rowHeight;
        }

        currentY += 14;
      }

      // 7. Bloque de Acuse Legal Fehaciente (Sello de Notificación)
      const acuseBoxHeight = 110;
      doc
        .rect(MARGIN, currentY, CONTENT_WIDTH, acuseBoxHeight)
        .fillAndStroke('#f0fdf4', '#86efac'); // Verde oficial acuse

      doc
        .fillColor('#166534')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('CERTIFICADO DE ACUSE DE RECIBO LEGAL Y DESLINDE FEHACIENTE', MARGIN + 12, currentY + 10);

      doc
        .font('Helvetica').fontSize(8)
        .fillColor('#15803d')
        .text(
          'Se deja constancia fehaciente de que la Empresa Conservadora de Ascensores (ECA) responsable ha tomado conocimiento vinculante del estado crítico del equipo elevador. La descarga del presente remito genera acuse inalterable auditado por el sistema.',
          MARGIN + 12,
          currentY + 26,
          { width: CONTENT_WIDTH - 24 },
        );

      const acuseFecha = remito.acuseLegal?.fechaHora
        ? new Date(remito.acuseLegal.fechaHora).toLocaleString('es-AR')
        : new Date().toLocaleString('es-AR');

      const acuseUser = remito.acuseLegal?.usuario || 'responsable.tecnico@eca.com.ar';

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#14532d')
        .text('✓ Acuse Legal Registrado: ', MARGIN + 12, currentY + 62, { continued: true })
        .font('Helvetica').text(`SÍ (Conforme Ley CABA)   |   Fecha/Hora: `, { continued: true })
        .font('Helvetica-Bold').text(acuseFecha);

      doc
        .font('Helvetica-Bold').fontSize(8.5).fillColor('#14532d')
        .text('✓ Usuario Notificado: ', MARGIN + 12, currentY + 78, { continued: true })
        .font('Helvetica').text(`${acuseUser}   |   ECA: `, { continued: true })
        .font('Helvetica-Bold').text(remito.eca);

      doc
        .font('Helvetica-Oblique').fontSize(7.5).fillColor('#166534')
        .text('Registro inalterable almacenado en base de datos PostgreSQL con RLS context.', MARGIN + 12, currentY + 94);

      currentY += acuseBoxHeight + 20;

      // 8. Pie de Página Institucional
      const footerY = 790;
      doc
        .strokeColor('#e2e8f0')
        .moveTo(MARGIN, footerY)
        .lineTo(MARGIN + CONTENT_WIDTH, footerY)
        .stroke();

      doc
        .font('Helvetica').fontSize(7.5).fillColor('#64748b')
        .text(
          'MAICON S.R.L. · Elevadores y Transporte Vertical · Documento generado electrónicamente con firma de auditoría',
          MARGIN,
          footerY + 8,
          { align: 'center', width: CONTENT_WIDTH },
        );

      doc.end();
    });
  }
}
