import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { validarConsorcio } from './consorcio.validation';
import { Consorcio, ConsorcioMapaItem, ConsorcioResumen } from './consorcio.types';
import { ConsorciosRepository, ReferenciaAgcDuplicadaError } from './consorcios.repository';
import { RolesEdificio } from './roles.types';
import { validarRoles } from './roles.validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un id mal formado no puede existir: es 404 y nunca llega a la base (que lanzaría un 500). */
function exigirId(id: string): void {
  if (!UUID.test(id)) throw new NotFoundException('Consorcio no encontrado');
}

@Controller('consorcios')
export class ConsorciosController {
  constructor(private readonly consorcios: ConsorciosRepository) {}

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
    return ficha;
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Param('id') id: string): Promise<void> {
    exigirId(id);
    if (!(await this.consorcios.eliminar(id))) throw new NotFoundException('Consorcio no encontrado');
  }

  /** Terna del edificio con sus porcentajes operativos y datos de contacto. */
  @Get(':id/roles')
  async obtenerRoles(@Param('id') id: string): Promise<RolesEdificio> {
    exigirId(id);
    const roles = await this.consorcios.obtenerRoles(id);
    if (!roles) throw new NotFoundException('Consorcio no encontrado');
    return roles;
  }

  /** Asigna o reemplaza la terna completa: RT de Calle, Firmante AGC y ECA Responsable. */
  @Put(':id/roles')
  async asignarRoles(@Param('id') id: string, @Body() cuerpo: unknown): Promise<RolesEdificio> {
    exigirId(id);
    const resultado = validarRoles(cuerpo);
    if (!resultado.ok) {
      throw new BadRequestException({ message: 'Datos inválidos', errores: resultado.errores });
    }
    const roles = await this.consorcios.asignarRoles(id, resultado.valor);
    if (!roles) throw new NotFoundException('Consorcio no encontrado');
    return roles;
  }

  /** Quita la asignación vigente de roles en el edificio (revoca acceso de RT/Firmante de inmediato). */
  @Delete(':id/roles')
  @HttpCode(204)
  async quitarRoles(@Param('id') id: string): Promise<void> {
    exigirId(id);
    if (!(await this.consorcios.quitarRoles(id))) throw new NotFoundException('Consorcio o asignación no encontrada');
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
