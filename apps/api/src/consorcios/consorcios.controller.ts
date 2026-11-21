import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  ConflictException,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../auth/roles.guard';
import { AsignacionesFirmanteService } from '../firmante/asignaciones-firmante.service';
import { validarConsorcio } from './consorcio.validation';
import { Consorcio, ConsorcioMapaItem, ConsorcioResumen } from './consorcio.types';
import { ConsorciosRepository, ReferenciaAgcDuplicadaError, TernaCambioError } from './consorcios.repository';
import { ArchivoExcelSubido, ImportadorAgcService } from './importador-agc.service';
import { MAX_BYTES_EXCEL_AGC, ResultadoImportacionAgc } from './importador-agc.types';
import { RolesEdificio } from './roles.types';
import { validarRoles } from './roles.validation';

/**
 * Convierte el 413 de Multer (`LIMIT_FILE_SIZE`) en 400 Bad Request, para cumplir el contrato
 * de RF-03: todo archivo que supere 5 MB se rechaza con 400 sin importar nada.
 */
@Catch(PayloadTooLargeException)
class ArchivoDemasiadoGrandeComo400Filter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'El archivo supera el tamaño máximo permitido de 5 MB.',
    });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un id mal formado no puede existir: es 404 y nunca llega a la base (que lanzaría un 500). */
/**
 * La versión de la terna que quien guarda leyó, si la manda: `undefined` (no vino: sin control), `null` (leyó que no había
 * terna) o un instante ISO (`actualizadoEn` del GET). Cualquier otra cosa es un error de datos.
 */
function leerVersionEsperada(cuerpo: unknown): string | null | undefined {
  const valor = (cuerpo as { actualizadoEn?: unknown }).actualizadoEn;
  if (valor === undefined || valor === null) return valor;
  if (typeof valor === 'string' && !Number.isNaN(Date.parse(valor))) return valor;
  throw new BadRequestException({ message: 'Datos inválidos', errores: ['actualizadoEn tiene que ser el instante que devolvió el GET de roles, o null'] });
}

function exigirId(id: string): void {
  if (!UUID.test(id)) throw new NotFoundException('Consorcio no encontrado');
}

@Controller('consorcios')
@Roles()
export class ConsorciosController {
  constructor(
    private readonly consorcios: ConsorciosRepository,
    private readonly importadorAgc: ImportadorAgcService,
    private readonly asignacionesFirmante: AsignacionesFirmanteService,
  ) {}

  /** Registra un consorcio con sus máquinas y referencias AGC. Devuelve la ficha creada. */
  @Post()
  @HttpCode(201)
  async crear(@Body() cuerpo: unknown): Promise<Consorcio> {
    const datos = this.validar(cuerpo);
    return this.conflictoComo409(() => this.consorcios.crear(datos));
  }

  @Get()
  listar(): Promise<ConsorcioResumen[]> {
    return this.consorcios.listar();
  }

  /** Consorcios con punto geográfico definido; los edificios sin ubicación quedan excluidos. */
  @Get('mapa')
  listarMapa(): Promise<ConsorcioMapaItem[]> {
    return this.consorcios.listarParaMapa();
  }

  /**
   * Las ternas de TODOS los edificios en una sola llamada (la pestaña de asignación de roles la usa al abrirse, en vez de
   * pedir una por edificio). Va antes de `:id` para que "roles" no se tome por un id.
   */
  @Get('roles')
  listarRoles(): Promise<RolesEdificio[]> {
    return this.consorcios.listarRoles();
  }

  /**
   * Importa el listado Excel (.xlsx, máx. 5 MB) del padrón AGC (HU-01 RF-03).
   * Crea máquinas nuevas y actualiza existentes identificadas por matrícula AGC sin duplicarlas.
   */
  @Post('importar-agc')
  @Roles('secretaria', 'administrador')
  @HttpCode(200)
  @UseFilters(ArchivoDemasiadoGrandeComo400Filter)
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: MAX_BYTES_EXCEL_AGC, files: 1 },
    }),
  )
  async importarExcelAgc(
    @UploadedFile() archivo?: ArchivoExcelSubido,
  ): Promise<ResultadoImportacionAgc> {
    return this.importadorAgc.importarArchivo(archivo);
  }

  /** Descarga una planilla .xlsx modelo con las columnas requeridas para la importación AGC. */
  @Get('importar-agc/plantilla')
  @Roles('secretaria', 'administrador')
  async descargarPlantillaAgc(@Res() res: Response): Promise<void> {
    const buffer = await this.importadorAgc.generarPlantillaXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-padron-agc.xlsx"');
    res.send(buffer);
  }

  /** Ficha completa del edificio: dirección, datos de administración y máquinas. */
  @Get(':id')
  async obtener(@Param('id') id: string): Promise<Consorcio> {
    exigirId(id);
    const ficha = await this.consorcios.obtener(id);
    if (!ficha) throw new NotFoundException('Consorcio no encontrado');
    return ficha;
  }

  /** Reemplaza los datos del consorcio y su lista completa de máquinas. */
  @Put(':id')
  async reemplazar(@Param('id') id: string, @Body() cuerpo: unknown): Promise<Consorcio> {
    exigirId(id);
    const datos = this.validar(cuerpo);
    const ficha = await this.conflictoComo409(() => this.consorcios.reemplazar(id, datos));
    if (!ficha) throw new NotFoundException('Consorcio no encontrado');
    await this.asignacionesFirmante.sincronizarEdificio(id);
    return ficha;
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Param('id') id: string): Promise<void> {
    exigirId(id);
    if (!(await this.consorcios.eliminar(id))) throw new NotFoundException('Consorcio no encontrado');
    await this.asignacionesFirmante.sincronizarEdificio(id);
  }

  /** Terna del edificio con sus porcentajes operativos y datos de contacto. */
  @Get(':id/roles')
  async obtenerRoles(@Param('id') id: string): Promise<RolesEdificio> {
    exigirId(id);
    const roles = await this.consorcios.obtenerRoles(id);
    if (!roles) throw new NotFoundException('Consorcio no encontrado');
    return roles;
  }

  /**
   * Asigna o reemplaza la terna completa: RT de Calle, Firmante AGC y ECA Responsable.
   * Si el cuerpo trae `actualizadoEn` (la versión que se leyó con GET), sólo se guarda si la terna sigue siendo esa:
   * si cambió, responde 409 con la versión vigente y no modifica nada. Sin `actualizadoEn` guarda como siempre.
   */
  @Put(':id/roles')
  async asignarRoles(@Param('id') id: string, @Body() cuerpo: unknown): Promise<RolesEdificio> {
    exigirId(id);
    const resultado = validarRoles(cuerpo);
    if (!resultado.ok) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: resultado.errores });
    }
    const esperado = leerVersionEsperada(cuerpo);
    try {
      const roles = await this.consorcios.asignarRoles(id, resultado.valor, esperado);
      if (!roles) throw new NotFoundException('Consorcio no encontrado');
      // HU-02 RF-06: la vista de firma sigue a la terna recién guardada.
      await this.asignacionesFirmante.sincronizarEdificio(id);
      return roles;
    } catch (err) {
      if (err instanceof TernaCambioError) {
        throw new ConflictException({
          message: 'La terna de este edificio cambió desde que la abriste: se muestra la versión vigente. Revisala y volvé a guardar.',
          vigente: err.vigente,
        });
      }
      throw err;
    }
  }

  /** Quita la asignación vigente de roles en el edificio (revoca acceso de RT/Firmante de inmediato). */
  @Delete(':id/roles')
  @HttpCode(204)
  async quitarRoles(@Param('id') id: string): Promise<void> {
    exigirId(id);
    if (!(await this.consorcios.quitarRoles(id))) throw new NotFoundException('Consorcio o asignación no encontrada');
    await this.asignacionesFirmante.sincronizarEdificio(id);
  }

  private validar(cuerpo: unknown) {
    const resultado = validarConsorcio(cuerpo);
    if (!resultado.ok) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: resultado.errores });
    }
    return resultado.valor;
  }

  private async conflictoComo409<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (err) {
      if (err instanceof ReferenciaAgcDuplicadaError) {
        throw new ConflictException('Referencia AGC repetida en el consorcio');
      }
      throw err;
    }
  }
}
