/**
 * Migraciones del esquema, en orden. Cada una corre una sola vez y queda registrada en
 * la tabla `schema_migrations`.
 *
 * Reglas para agregar una:
 * - Se agrega al FINAL con el siguiente número; nunca se edita una que ya salió a `dev`.
 * - Va como SQL plano (no hay ORM en el proyecto): el modelo se lee acá.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_consorcios_y_maquinas',
    sql: `
      -- Un consorcio es el edificio: dirección, datos de administración y sus máquinas.
      CREATE TABLE consorcios (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre                  text NOT NULL,
        direccion               text NOT NULL,
        administracion_nombre   text,
        administracion_telefono text,
        administracion_email    text,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now()
      );

      -- Cada máquina lleva la referencia con que la nombra la AGC (M1, M2, ...) y una
      -- descripción libre (Derecha, Izquierda). La referencia no se repite dentro del edificio.
      CREATE TABLE maquinas (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id    uuid NOT NULL REFERENCES consorcios (id) ON DELETE CASCADE,
        referencia_agc  text NOT NULL,
        descripcion     text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT maquinas_referencia_unica UNIQUE (consorcio_id, referencia_agc)
      );

      CREATE INDEX maquinas_consorcio_idx ON maquinas (consorcio_id);
    `,
  },
];
