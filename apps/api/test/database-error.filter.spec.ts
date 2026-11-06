import { HttpException, NotFoundException } from '@nestjs/common';
import { SQLSTATE_TEXTO_INVALIDO, esErrorDeTextoInvalido } from '../src/database/database-error.filter';

const errorPg = (code: string) => Object.assign(new Error('mensaje de PostgreSQL'), { code, severity: 'ERROR' });

describe('esErrorDeTextoInvalido', () => {
  it('reconoce los dos SQLSTATE de texto con codificación inválida', () => {
    expect([...SQLSTATE_TEXTO_INVALIDO].sort()).toEqual(['22021', '22P05']);
    expect(esErrorDeTextoInvalido(errorPg('22021'))).toBe(true); // byte 0x00 / UTF-8 inválido
    expect(esErrorDeTextoInvalido(errorPg('22P05'))).toBe(true); // carácter no traducible
  });

  it('no toca otros errores de base: siguen siendo 500', () => {
    expect(esErrorDeTextoInvalido(errorPg('08006'))).toBe(false); // conexión caída
    expect(esErrorDeTextoInvalido(errorPg('23505'))).toBe(false); // restricción única
    expect(esErrorDeTextoInvalido(errorPg('22003'))).toBe(false); // número fuera de rango
    expect(esErrorDeTextoInvalido(errorPg('42P01'))).toBe(false); // tabla inexistente
  });

  it('no toca errores comunes ni valores que no son errores', () => {
    expect(esErrorDeTextoInvalido(new Error('boom'))).toBe(false);
    expect(esErrorDeTextoInvalido(Object.assign(new Error('x'), { code: 22021 }))).toBe(false); // code numérico
    expect(esErrorDeTextoInvalido(null)).toBe(false);
    expect(esErrorDeTextoInvalido(undefined)).toBe(false);
    expect(esErrorDeTextoInvalido('22021')).toBe(false);
  });

  it('no captura los HttpException, aunque lleven un code igual', () => {
    expect(esErrorDeTextoInvalido(Object.assign(new HttpException('x', 400), { code: '22021' }))).toBe(false);
    expect(esErrorDeTextoInvalido(new NotFoundException())).toBe(false);
  });
});
