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
  {
    id: '004_visitas_fallidas',
    sql: `
      -- Historial persistente de visitas fallidas y advertencias por consorcio (HU-07 RF-03).
      -- consorcio_id es text para admitir tanto UUIDs de la tabla consorcios como IDs simbólicos.
      CREATE TABLE visitas_fallidas (
        orden              bigserial NOT NULL,
        id                 text PRIMARY KEY,
        consorcio_id       text NOT NULL,
        consorcio_nombre   text NOT NULL,
        direccion          text NOT NULL,
        numero_advertencia smallint NOT NULL CHECK (numero_advertencia IN (1, 2, 3)),
        motivo             text NOT NULL,
        foto_frente_url    text NOT NULL,
        gps_latitud        double precision NOT NULL,
        gps_longitud       double precision NOT NULL,
        gps_precision      double precision NOT NULL,
        gps_timestamp      timestamptz NOT NULL,
        inspector          text NOT NULL,
        fecha_hora         timestamptz NOT NULL DEFAULT now(),
        email_notificacion jsonb,
        created_at         timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX visitas_fallidas_consorcio_orden_idx ON visitas_fallidas (consorcio_id, orden ASC);
    `,
  },
  {
    id: '005_usuarios_y_sesiones',
    sql: `
      -- Usuarios del sistema (HU-14). La contraseña se guarda sólo como hash bcrypt.
      CREATE TABLE usuarios (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario       text NOT NULL,
        nombre        text NOT NULL,
        rol           text NOT NULL
                      CHECK (rol IN ('rt_calle', 'secretaria', 'firmante', 'eca', 'administrador')),
        password_hash text NOT NULL,
        activo        boolean NOT NULL DEFAULT true,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      -- El nombre de usuario no distingue mayúsculas: "Ana" y "ana" son la misma cuenta.
      CREATE UNIQUE INDEX usuarios_usuario_unico ON usuarios (lower(usuario));

      -- Sesiones de refresco: se guarda el hash SHA-256 del token, nunca el token.
      -- Revocar una sesión es borrarla.
      CREATE TABLE sesiones (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id   uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
        refresh_hash text NOT NULL UNIQUE,
        expira_en    timestamptz NOT NULL,
        creada_en    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX sesiones_usuario_idx ON sesiones (usuario_id);

      -- Intentos fallidos por nombre de usuario, exista o no la cuenta,
      -- para que el bloqueo no revele qué usuarios existen.
      CREATE TABLE intentos_login (
        usuario         text PRIMARY KEY,
        fallidos        integer NOT NULL DEFAULT 0,
        bloqueado_hasta timestamptz
      );
    `,
  },
  {
    id: '006_consentimiento_y_revocacion',
    sql: `
      -- Aceptación del aviso de uso de ubicación (Ley 25.326), una fila por usuario y versión del texto.
      CREATE TABLE consentimientos_ubicacion (
        usuario_id  uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
        version     text NOT NULL,
        aceptado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (usuario_id, version)
      );

      -- Revocación de sesiones por un Administrador. En el usuario, para invalidar también los
      -- tokens de acceso ya emitidos; en cada sesión, para poder informar el motivo al refrescar.
      ALTER TABLE usuarios ADD COLUMN sesiones_revocadas_en timestamptz;
      ALTER TABLE sesiones ADD COLUMN revocada_en timestamptz;
    `,
  },
  {
    id: '007_datos_operativos_edificio_equipo',
    sql: `
      -- Datos operativos del edificio y del equipo para el trabajo en calle (HU-01 RF-05).
      ALTER TABLE consorcios
        ADD COLUMN IF NOT EXISTS encargado_nombre text,
        ADD COLUMN IF NOT EXISTS encargado_telefono text,
        ADD COLUMN IF NOT EXISTS pisos jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS ubicacion geometry(Point, 4326);

      CREATE INDEX IF NOT EXISTS consorcios_ubicacion_gix
        ON consorcios USING GIST (ubicacion);

      ALTER TABLE maquinas
        ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'traccion'
          CHECK (tipo IN ('traccion', 'hidraulico', 'montavehiculos')),
        ADD COLUMN IF NOT EXISTS sala_compartida_id text;
    `,
  },
  {
    id: '008_rls_por_eca',
    sql: `
      -- Rol runtime sin SUPERUSER ni BYPASSRLS ni propiedad de tablas (HU-15 RNF-01).
      -- La contraseña se sincroniza desde DATABASE_APP_PASSWORD (.env) en DatabaseService.onModuleInit().
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ascensores_app') THEN
          CREATE ROLE ascensores_app LOGIN
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
        ELSE
          ALTER ROLE ascensores_app WITH LOGIN
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
        END IF;
      END $$;

      -- Discriminador de ECA propietaria para tablas operativas que no lo tenían explícito.
      ALTER TABLE consorcios
        ADD COLUMN IF NOT EXISTS eca_nombre text NOT NULL
        DEFAULT COALESCE(NULLIF(current_setting('app.eca_actual', true), ''), 'ECA_SISTEMA_DEV');

      ALTER TABLE visitas_fallidas
        ADD COLUMN IF NOT EXISTS eca_nombre text NOT NULL
        DEFAULT COALESCE(NULLIF(current_setting('app.eca_actual', true), ''), 'ECA_SISTEMA_DEV');

      CREATE INDEX IF NOT EXISTS consorcios_eca_nombre_idx ON consorcios (eca_nombre);
      CREATE INDEX IF NOT EXISTS visitas_fallidas_eca_nombre_idx ON visitas_fallidas (eca_nombre);

      -- Permisos sobre todas las tablas/secuencias existentes y sobre las que creen futuras migraciones.
      GRANT USAGE ON SCHEMA public TO ascensores_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ascensores_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ascensores_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ascensores_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ascensores_app;

      -- RLS activo en TODAS las tablas con datos de una ECA.
      ALTER TABLE consorcios ENABLE ROW LEVEL SECURITY;
      ALTER TABLE maquinas ENABLE ROW LEVEL SECURITY;
      ALTER TABLE roles_edificio ENABLE ROW LEVEL SECURITY;
      ALTER TABLE acuses_recibo_legal ENABLE ROW LEVEL SECURITY;
      ALTER TABLE visitas_fallidas ENABLE ROW LEVEL SECURITY;

      -- Sin contexto app.eca_actual (NULL o ''), la comparación con NULL devuelve 0 filas.
      DROP POLICY IF EXISTS rls_consorcios_eca ON consorcios;
      CREATE POLICY rls_consorcios_eca ON consorcios
        USING (eca_nombre = NULLIF(current_setting('app.eca_actual', true), ''))
        WITH CHECK (eca_nombre = NULLIF(current_setting('app.eca_actual', true), ''));

      DROP POLICY IF EXISTS rls_maquinas_eca ON maquinas;
      CREATE POLICY rls_maquinas_eca ON maquinas
        USING (
          EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = maquinas.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = maquinas.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        );

      DROP POLICY IF EXISTS rls_roles_edificio_eca ON roles_edificio;
      CREATE POLICY rls_roles_edificio_eca ON roles_edificio
        USING (
          eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          OR EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = roles_edificio.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        )
        WITH CHECK (
          eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          OR EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = roles_edificio.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        );

      DROP POLICY IF EXISTS rls_acuses_recibo_eca ON acuses_recibo_legal;
      CREATE POLICY rls_acuses_recibo_eca ON acuses_recibo_legal
        USING (eca = NULLIF(current_setting('app.eca_actual', true), ''))
        WITH CHECK (eca = NULLIF(current_setting('app.eca_actual', true), ''));

      DROP POLICY IF EXISTS rls_visitas_fallidas_eca ON visitas_fallidas;
      CREATE POLICY rls_visitas_fallidas_eca ON visitas_fallidas
        USING (eca_nombre = NULLIF(current_setting('app.eca_actual', true), ''))
        WITH CHECK (eca_nombre = NULLIF(current_setting('app.eca_actual', true), ''));
    `,
  },
  {
    id: '009_rls_multi_eca_rt_firmante',
    sql: `
      -- Función SECURITY DEFINER para evaluar la asignación viva de RT de Calle o Firmante en roles_edificio
      -- evitando recursión infinita en políticas RLS. Se consulta en vivo en cada query (revocación inmediata).
      CREATE OR REPLACE FUNCTION usuario_asignado_en_edificio(p_consorcio_id uuid)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM roles_edificio r
           WHERE r.consorcio_id = p_consorcio_id
             AND NULLIF(current_setting('app.usuario_actual', true), '') IS NOT NULL
             AND (
               (current_setting('app.rol_actual', true) = 'rt_calle'
                 AND (r.rt_calle_nombre = current_setting('app.usuario_actual', true)
                   OR r.rt_calle_email = current_setting('app.usuario_actual', true)))
               OR
               (current_setting('app.rol_actual', true) = 'firmante'
                 AND (r.firmante_nombre = current_setting('app.usuario_actual', true)
                   OR r.firmante_email = current_setting('app.usuario_actual', true)))
             )
        );
      $$;

      REVOKE ALL ON FUNCTION usuario_asignado_en_edificio(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION usuario_asignado_en_edificio(uuid) TO ascensores_app;

      -- Lectura multi-ECA para RT de Calle y Firmante únicamente en edificios asignados.
      DROP POLICY IF EXISTS rls_consorcios_rt_firmante_select ON consorcios;
      CREATE POLICY rls_consorcios_rt_firmante_select ON consorcios
        FOR SELECT
        USING (usuario_asignado_en_edificio(id));

      DROP POLICY IF EXISTS rls_maquinas_rt_firmante_select ON maquinas;
      CREATE POLICY rls_maquinas_rt_firmante_select ON maquinas
        FOR SELECT
        USING (usuario_asignado_en_edificio(consorcio_id));

      DROP POLICY IF EXISTS rls_roles_edificio_rt_firmante_select ON roles_edificio;
      CREATE POLICY rls_roles_edificio_rt_firmante_select ON roles_edificio
        FOR SELECT
        USING (usuario_asignado_en_edificio(consorcio_id));

      DROP POLICY IF EXISTS rls_visitas_fallidas_rt_firmante_select ON visitas_fallidas;
      CREATE POLICY rls_visitas_fallidas_rt_firmante_select ON visitas_fallidas
        FOR SELECT
        USING (
          consorcio_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND usuario_asignado_en_edificio(consorcio_id::uuid)
        );
    `,
  },
  {
    id: '010_checklist_inspecciones',
    sql: `
      -- Inspecciones ejecutadas por el RT usando el motor de checklist configurable (HU-17 RF-01).
      CREATE TABLE inspecciones_checklist (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id      text NOT NULL,
        maquina_id        text NOT NULL,
        referencia_agc    text NOT NULL,
        tipo_maquina      text NOT NULL CHECK (tipo_maquina IN ('traccion', 'hidraulico', 'montavehiculos')),
        estado_equipo     text NOT NULL DEFAULT 'en_uso' CHECK (estado_equipo IN ('en_uso', 'fuera_de_servicio')),
        version_checklist text NOT NULL,
        datos             jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX inspecciones_checklist_consorcio_idx ON inspecciones_checklist (consorcio_id, maquina_id);
    `,
  },
  {
    id: '011_eca_en_usuarios',
    sql: `
      -- ECA a la que pertenece un usuario (HU-15). Sólo la tienen los usuarios con rol 'eca':
      -- el RLS toma de acá la ECA de la sesión. Los usuarios que ya existían quedan con NULL.
      ALTER TABLE usuarios ADD COLUMN eca text;
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_eca_solo_rol_eca CHECK (rol = 'eca' OR eca IS NULL);
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_eca_no_vacia CHECK (eca IS NULL OR btrim(eca) <> '');
    `,
  },
];
