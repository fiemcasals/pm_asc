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
  {
    id: '002_acuses_recibo_legal',
    sql: `
      -- Registro formal y vinculante del acuse de recibo legal de remitos técnicos por parte de la ECA
      CREATE TABLE acuses_recibo_legal (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        alerta_id       text NOT NULL,
        maquina_id      text NOT NULL,
        eca             text NOT NULL,
        usuario         text NOT NULL,
        fecha_hora      timestamptz NOT NULL DEFAULT now(),
        tipo_alerta     text NOT NULL,
        remito_url      text,
        created_at      timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX acuses_recibo_alerta_idx ON acuses_recibo_legal (alerta_id);
      CREATE INDEX acuses_recibo_eca_idx ON acuses_recibo_legal (eca);
    `,
  },
  {
    id: '003_roles_por_edificio',
    sql: `
      -- La terna de trabajo de cada edificio: una fila por consorcio, que se reemplaza entera.
      -- Son datos de contacto en texto: el sistema todavía no tiene cuentas de usuario.
      CREATE TABLE roles_edificio (
        consorcio_id      uuid PRIMARY KEY REFERENCES consorcios (id) ON DELETE CASCADE,
        rt_calle_nombre   text NOT NULL,
        rt_calle_telefono text,
        rt_calle_email    text,
        firmante_nombre   text NOT NULL,
        firmante_telefono text,
        firmante_email    text,
        eca_nombre        text NOT NULL,
        eca_telefono      text,
        eca_email         text,
        updated_at        timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
];
