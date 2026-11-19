import type { RangeResponse, Source } from 'pmtiles';

/**
 * Fuente de PMTiles que lee el mapa desde un archivo ya guardado en el celular (un Blob), sin pedirle nada a la red.
 * PMTiles pide rangos de bytes (la cabecera, el directorio, cada mosaico): acá se cortan del Blob.
 */
export class BlobSource implements Source {
  constructor(
    private readonly blob: Blob,
    private readonly clave: string,
  ) {}

  getKey(): string {
    return this.clave;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await this.blob.slice(offset, offset + length).arrayBuffer();
    return { data };
  }
}
