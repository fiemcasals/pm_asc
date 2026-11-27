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
  {
    id: '012_reasignaciones_rt',
    sql: `
      -- Registro de las reasignaciones del RT de Calle de un edificio en rojo (HU-04 RF-02): quién la confirmó,
      -- cuándo, y quién era y quién pasó a ser el RT. Es un registro de auditoría: sólo se agrega, no se edita.
      CREATE TABLE reasignaciones_rt (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id uuid NOT NULL REFERENCES consorcios (id) ON DELETE CASCADE,
        rt_anterior  text NOT NULL,
        rt_nuevo     text NOT NULL,
        usuario      text NOT NULL,
        fecha        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT reasignaciones_rt_cambia CHECK (rt_anterior <> rt_nuevo)
      );

      CREATE INDEX reasignaciones_rt_consorcio_idx ON reasignaciones_rt (consorcio_id, fecha DESC);

      -- RLS por ECA, igual que el edificio al que pertenece. Sólo hay políticas de lectura y de alta: sin política
      -- de UPDATE ni de DELETE, el rol de la aplicación no puede modificar ni borrar un registro ya escrito.
      ALTER TABLE reasignaciones_rt ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS rls_reasignaciones_rt_select ON reasignaciones_rt;
      CREATE POLICY rls_reasignaciones_rt_select ON reasignaciones_rt
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = reasignaciones_rt.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        );

      DROP POLICY IF EXISTS rls_reasignaciones_rt_insert ON reasignaciones_rt;
      CREATE POLICY rls_reasignaciones_rt_insert ON reasignaciones_rt
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = reasignaciones_rt.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        );
    `,
  },
  {
    id: '013_rls_admin_secretaria',
    sql: `
      -- Políticas RLS para administrador y secretaría en todas las tablas protegidas por ECA (HU-15 RNF-03)
      DROP POLICY IF EXISTS rls_consorcios_admin_secretaria ON consorcios;
      CREATE POLICY rls_consorcios_admin_secretaria ON consorcios
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      DROP POLICY IF EXISTS rls_maquinas_admin_secretaria ON maquinas;
      CREATE POLICY rls_maquinas_admin_secretaria ON maquinas
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      DROP POLICY IF EXISTS rls_roles_edificio_admin_secretaria ON roles_edificio;
      CREATE POLICY rls_roles_edificio_admin_secretaria ON roles_edificio
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      DROP POLICY IF EXISTS rls_acuses_recibo_admin_secretaria ON acuses_recibo_legal;
      CREATE POLICY rls_acuses_recibo_admin_secretaria ON acuses_recibo_legal
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      DROP POLICY IF EXISTS rls_visitas_fallidas_admin_secretaria ON visitas_fallidas;
      CREATE POLICY rls_visitas_fallidas_admin_secretaria ON visitas_fallidas
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      -- Eliminar valor por defecto ECA_SISTEMA_DEV en consorcios y visitas_fallidas
      ALTER TABLE consorcios
        ALTER COLUMN eca_nombre SET DEFAULT COALESCE(NULLIF(current_setting('app.eca_actual', true), ''), 'SIN_ASIGNAR');

      ALTER TABLE visitas_fallidas
        ALTER COLUMN eca_nombre SET DEFAULT COALESCE(NULLIF(current_setting('app.eca_actual', true), ''), 'SIN_ASIGNAR');
    `,
  },
  {
    id: '014_rls_admin_secretaria_reasignaciones',
    sql: `
      -- La Secretaría y el Administrador leen y registran las reasignaciones del RT (HU-04 RF-02) bajo el RLS estricto
      -- de HU-15 RNF-03, donde no tienen ECA propia. Siguen sin poder modificar ni borrar un registro: sólo SELECT e INSERT.
      DROP POLICY IF EXISTS rls_reasignaciones_rt_admin_secretaria_select ON reasignaciones_rt;
      CREATE POLICY rls_reasignaciones_rt_admin_secretaria_select ON reasignaciones_rt
        FOR SELECT
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      DROP POLICY IF EXISTS rls_reasignaciones_rt_admin_secretaria_insert ON reasignaciones_rt;
      CREATE POLICY rls_reasignaciones_rt_admin_secretaria_insert ON reasignaciones_rt
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
    `,
  },
  {
    id: '015_indice_inspecciones_por_fecha',
    sql: `
      -- HU-04 RNF-01: el semáforo filtra las inspecciones por rango de created_at (el mes consultado) y sólo necesita
      -- consorcio_id y maquina_id para cruzarlas con las máquinas. Con INCLUDE la consulta se resuelve con el índice,
      -- sin leer la tabla, y deja de recorrer todas las inspecciones históricas.
      CREATE INDEX IF NOT EXISTS inspecciones_checklist_created_at_idx
        ON inspecciones_checklist (created_at) INCLUDE (consorcio_id, maquina_id);
    `,
  },
  {
    id: '016_usuarios_contacto',
    sql: `
      -- HU-02 RF-05: el teléfono y el email del RT de Calle viven en su usuario, así al reasignar un edificio la terna
      -- se completa con los datos del RT nuevo en vez de quedar sin contacto. Opcionales: sólo se cargan a los rt_calle.
      ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS telefono text,
        ADD COLUMN IF NOT EXISTS email text;
    `,
  },
  {
    id: '017_acuses_recibo_unicos_por_alerta',
    sql: `
      -- HU-10 RF-05: un acuse de recibo legal por alerta. Si ya hubiera repetidos (cada POST insertaba una fila nueva) se
      -- conserva el primero, que es el que vale legalmente, y se borran los posteriores; después la base lo impide sola.
      DELETE FROM acuses_recibo_legal a
       USING (
         SELECT id, row_number() OVER (PARTITION BY alerta_id ORDER BY fecha_hora, created_at, id) AS orden
           FROM acuses_recibo_legal
       ) repetidos
       WHERE a.id = repetidos.id AND repetidos.orden > 1;

      ALTER TABLE acuses_recibo_legal
        ADD CONSTRAINT acuses_recibo_alerta_unica UNIQUE (alerta_id);
    `,
  },
  {
    id: '018_recargos_anulados',
    sql: `
      -- HU-07 RF-04: un Administrador puede anular el recargo del 45 % de una máquina. Es un registro de auditoría: quién,
      -- cuándo y por qué; sólo se agrega. El recargo se identifica por la 3.ª visita fallida que lo originó y la máquina,
      -- así que no se puede anular dos veces y un ciclo nuevo de advertencias (otra 3.ª visita) vuelve a poder anularse.
      CREATE TABLE recargos_anulados (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id       uuid NOT NULL REFERENCES consorcios (id) ON DELETE CASCADE,
        maquina_id         text NOT NULL,
        visita_fallida_id  text NOT NULL,
        usuario            text NOT NULL,
        motivo             text NOT NULL,
        fecha              timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT recargos_anulados_motivo_no_vacio CHECK (btrim(motivo) <> ''),
        CONSTRAINT recargos_anulados_unico UNIQUE (visita_fallida_id, maquina_id)
      );

      CREATE INDEX recargos_anulados_consorcio_idx ON recargos_anulados (consorcio_id);

      -- RLS: sin política de UPDATE ni de DELETE, la aplicación no puede modificar ni borrar una anulación ya escrita.
      -- Leen las del edificio su ECA, la Secretaría y el Administrador, y el RT y el Firmante asignados. Sólo el
      -- Administrador la escribe (el controlador también lo exige).
      ALTER TABLE recargos_anulados ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS rls_recargos_anulados_select ON recargos_anulados;
      CREATE POLICY rls_recargos_anulados_select ON recargos_anulados
        FOR SELECT
        USING (
          NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador')
          OR usuario_asignado_en_edificio(consorcio_id)
          OR EXISTS (
            SELECT 1 FROM consorcios c
             WHERE c.id = recargos_anulados.consorcio_id
               AND c.eca_nombre = NULLIF(current_setting('app.eca_actual', true), '')
          )
        );

      DROP POLICY IF EXISTS rls_recargos_anulados_insert ON recargos_anulados;
      CREATE POLICY rls_recargos_anulados_insert ON recargos_anulados
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') = 'administrador');
    `,
  },
  {
    id: '019_alertas_avisos',
    sql: `
      -- HU-10 RF-04: los recordatorios a la ECA (24 h) y los avisos a la Secretaría (48 h) de una alerta sin acuse de recibo.
      -- Cada uno se registra una sola vez por alerta (UNIQUE), así que no se repite aunque se reinicie la API o se procese varias
      -- veces. Es el historial de la alerta: sólo se agrega.
      CREATE TABLE alertas_avisos (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        alerta_id  text NOT NULL,
        tipo       text NOT NULL,
        eca        text NOT NULL,
        edificio   text NOT NULL,
        mensaje    text NOT NULL,
        fecha      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT alertas_avisos_tipo CHECK (tipo IN ('recordatorio_eca_24h', 'aviso_secretaria_48h')),
        CONSTRAINT alertas_avisos_unico UNIQUE (alerta_id, tipo)
      );

      CREATE INDEX alertas_avisos_eca_idx ON alertas_avisos (eca);

      -- RLS: la ECA ve y registra los de sus alertas; la Secretaría y el Administrador leen los de todas. Sin política de
      -- UPDATE ni de DELETE, la aplicación no puede modificar ni borrar un aviso ya registrado.
      ALTER TABLE alertas_avisos ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS rls_alertas_avisos_select ON alertas_avisos;
      CREATE POLICY rls_alertas_avisos_select ON alertas_avisos
        FOR SELECT
        USING (
          eca = NULLIF(current_setting('app.eca_actual', true), '')
          OR NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador')
        );

      DROP POLICY IF EXISTS rls_alertas_avisos_insert ON alertas_avisos;
      CREATE POLICY rls_alertas_avisos_insert ON alertas_avisos
        FOR INSERT
        WITH CHECK (eca = NULLIF(current_setting('app.eca_actual', true), ''));
    `,
  },
  {
    id: '020_desbloqueos_edificio',
    sql: `
      -- HU-07 RF-05: la Secretaría puede desbloquear un edificio bloqueado por la 3.ª visita fallida, con motivo obligatorio; vuelve al
      -- recorrido del RT. El desbloqueo cubre las visitas fallidas hasta la indicada (la última al desbloquear): si el edificio
      -- vuelve a fallar después, se bloquea de nuevo. Es un registro de auditoría: sólo se agrega.
      -- consorcio_id es text, igual que en visitas_fallidas (admite ids simbólicos).
      CREATE TABLE desbloqueos_edificio (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id     text NOT NULL,
        hasta_visita_id  text NOT NULL,
        usuario          text NOT NULL,
        motivo           text NOT NULL,
        fecha            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT desbloqueos_edificio_motivo_no_vacio CHECK (btrim(motivo) <> ''),
        CONSTRAINT desbloqueos_edificio_unico UNIQUE (hasta_visita_id)
      );

      CREATE INDEX desbloqueos_edificio_consorcio_idx ON desbloqueos_edificio (consorcio_id);

      -- RLS: lo ve quien ve el edificio (la política de consorcios ya filtra por ECA, por rol y por RT/Firmante asignado) y sólo la
      -- Secretaría y el Administrador lo escriben. Sin política de UPDATE ni de DELETE, la aplicación no puede modificarlo ni borrarlo.
      ALTER TABLE desbloqueos_edificio ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS rls_desbloqueos_edificio_select ON desbloqueos_edificio;
      CREATE POLICY rls_desbloqueos_edificio_select ON desbloqueos_edificio
        FOR SELECT
        USING (
          NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador')
          OR EXISTS (SELECT 1 FROM consorcios c WHERE c.id::text = desbloqueos_edificio.consorcio_id)
        );

      DROP POLICY IF EXISTS rls_desbloqueos_edificio_insert ON desbloqueos_edificio;
      CREATE POLICY rls_desbloqueos_edificio_insert ON desbloqueos_edificio
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
    `,
  },
  {
    id: '021_pago_por_maquina',
    sql: `
      -- HU-02 RF-04: el abono mensual y los porcentajes de pago del RT de Calle y del Firmante son de cada máquina (antes eran constantes del código).
      -- Una máquina nueva arranca con 60 % y 25 %; el abono queda sin definir hasta que se carga (la liquidación usa entonces el valor por defecto).
      ALTER TABLE maquinas
        ADD COLUMN IF NOT EXISTS abono_mensual numeric(12, 2),
        ADD COLUMN IF NOT EXISTS porcentaje_rt numeric(5, 2) NOT NULL DEFAULT 60,
        ADD COLUMN IF NOT EXISTS porcentaje_firmante numeric(5, 2) NOT NULL DEFAULT 25;

      ALTER TABLE maquinas
        ADD CONSTRAINT maquinas_abono_no_negativo CHECK (abono_mensual IS NULL OR abono_mensual >= 0),
        ADD CONSTRAINT maquinas_porcentajes_validos CHECK (
          porcentaje_rt BETWEEN 0 AND 100 AND porcentaje_firmante BETWEEN 0 AND 100 AND porcentaje_rt + porcentaje_firmante <= 100
        );

      -- Cada cambio de abono o de porcentaje queda registrado: quién, cuándo, qué valor había y cuál quedó. Sólo se agrega.
      CREATE TABLE maquinas_pago_historial (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        maquina_id      uuid NOT NULL REFERENCES maquinas (id) ON DELETE CASCADE,
        consorcio_id    uuid NOT NULL,
        campo           text NOT NULL CHECK (campo IN ('abono_mensual', 'porcentaje_rt', 'porcentaje_firmante')),
        valor_anterior  text,
        valor_nuevo     text,
        usuario         text NOT NULL,
        fecha           timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX maquinas_pago_historial_maquina_idx ON maquinas_pago_historial (maquina_id, fecha);

      ALTER TABLE maquinas_pago_historial ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_maquinas_pago_historial_select ON maquinas_pago_historial;
      CREATE POLICY rls_maquinas_pago_historial_select ON maquinas_pago_historial
        FOR SELECT
        USING (
          NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador')
          OR EXISTS (SELECT 1 FROM maquinas mq WHERE mq.id = maquinas_pago_historial.maquina_id)
        );
      DROP POLICY IF EXISTS rls_maquinas_pago_historial_insert ON maquinas_pago_historial;
      CREATE POLICY rls_maquinas_pago_historial_insert ON maquinas_pago_historial
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
    `,
  },
  {
    id: '022_email_para_recupero',
    sql: `
      -- HU-14: restricciones del email de usuario, que usa el recupero de contraseña por correo. La columna la crea
      -- 016_usuarios_contacto; acá sólo van el formato y la unicidad, que el recupero necesita para no mandar el enlace
      -- a dos cuentas.
      --
      -- Va con IF NOT EXISTS / DROP IF EXISTS porque esto ya corrió en la base de la beta dos veces con otro número
      -- (013 y 021, los dos pisados después por una migración del equipo con el mismo id). Así corre igual sobre esa
      -- base, que ya tiene los objetos, y sobre una nueva. Los ids viejos quedan en schema_migrations de la beta como
      -- huérfanos; el migrador ignora los que no conoce.
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email text;

      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_email_formato;
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_formato
        CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$');

      CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico ON usuarios (lower(email)) WHERE email IS NOT NULL;
    `,
  },
  {
    id: '023_constancia_visita_fallida',
    sql: `
      -- HU-07 RF-06: la constancia guarda también la hora que marcaba el celular del RT (la del servidor es fecha_hora).
      ALTER TABLE visitas_fallidas ADD COLUMN IF NOT EXISTS hora_dispositivo timestamptz;

      -- El RT de Calle registra la constancia de los edificios que tiene asignados (antes sólo la podían cargar Secretaría y Administrador).
      DROP POLICY IF EXISTS rls_visitas_fallidas_rt_insert ON visitas_fallidas;
      CREATE POLICY rls_visitas_fallidas_rt_insert ON visitas_fallidas
        FOR INSERT
        WITH CHECK (
          NULLIF(current_setting('app.rol_actual', true), '') = 'rt_calle'
          AND consorcio_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND usuario_asignado_en_edificio(consorcio_id::uuid)
        );

      -- La constancia no se edita: ni el GPS, ni la hora, ni la foto, ni la causa, ni quién la cargó, por ninguna vía.
      CREATE OR REPLACE FUNCTION visitas_fallidas_inmutable() RETURNS trigger AS $f$
      BEGIN
        -- Lo hace cumplir para la aplicación (cualquier usuario de la API); el dueño de la base puede corregir datos de prueba o de soporte.
        IF current_user = 'ascensores_app' AND (NEW.gps_latitud IS DISTINCT FROM OLD.gps_latitud
           OR NEW.gps_longitud IS DISTINCT FROM OLD.gps_longitud
           OR NEW.gps_precision IS DISTINCT FROM OLD.gps_precision
           OR NEW.gps_timestamp IS DISTINCT FROM OLD.gps_timestamp
           OR NEW.hora_dispositivo IS DISTINCT FROM OLD.hora_dispositivo
           OR NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora
           OR NEW.foto_frente_url IS DISTINCT FROM OLD.foto_frente_url
           OR NEW.motivo IS DISTINCT FROM OLD.motivo
           OR NEW.inspector IS DISTINCT FROM OLD.inspector) THEN
          RAISE EXCEPTION 'La constancia de visita fallida no se puede modificar (GPS, hora, foto, causa e inspector quedan fijos)';
        END IF;
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS visitas_fallidas_inmutable_trg ON visitas_fallidas;
      CREATE TRIGGER visitas_fallidas_inmutable_trg BEFORE UPDATE ON visitas_fallidas
        FOR EACH ROW EXECUTE FUNCTION visitas_fallidas_inmutable();
    `,
  },
  {
    id: '024_horarios_edificio',
    sql: `
      -- HU-01 RF-04: horarios de atención por edificio. Sin fila rige el horario por defecto (lunes a viernes 08:00–12:00 y 17:00–20:00).
      -- franjas: { "lunes": [{"desde":"08:00","hasta":"12:00"}, …], … } con hasta 2 franjas por día; a_coordinar reemplaza las franjas.
      CREATE TABLE horarios_edificio (
        consorcio_id    uuid PRIMARY KEY REFERENCES consorcios (id) ON DELETE CASCADE,
        a_coordinar     boolean NOT NULL DEFAULT false,
        franjas         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(franjas) = 'object'),
        actualizado_en  timestamptz NOT NULL DEFAULT now(),
        actualizado_por text NOT NULL
      );

      ALTER TABLE horarios_edificio ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_horarios_edificio_admin_secretaria ON horarios_edificio;
      CREATE POLICY rls_horarios_edificio_admin_secretaria ON horarios_edificio
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- El RT de Calle y el Firmante leen los horarios de los edificios que tienen asignados.
      DROP POLICY IF EXISTS rls_horarios_edificio_rt_firmante_select ON horarios_edificio;
      CREATE POLICY rls_horarios_edificio_rt_firmante_select ON horarios_edificio
        FOR SELECT
        USING (usuario_asignado_en_edificio(consorcio_id));
    `,
  },
  {
    id: '025_zona_del_rt',
    sql: `
      -- HU-16 RF-01: la zona del RT de Calle (por ejemplo «Norte»), que se muestra en el encabezado de su pantalla.
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS zona text;
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_zona_no_vacia;
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_zona_no_vacia CHECK (zona IS NULL OR btrim(zona) <> '');
    `,
  },
  {
    id: '026_inicios_inspeccion',
    sql: `
      -- HU-16 RF-02: el RT inicia la inspección a 30 m o menos del edificio. Se guardan las coordenadas, la precisión, la hora del
      -- dispositivo y la del servidor; sin buena señal GPS se exige foto del frente y justificación y la Secretaría revisa la visita.
      CREATE TABLE inicios_inspeccion (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id     uuid NOT NULL REFERENCES consorcios (id) ON DELETE CASCADE,
        usuario          text NOT NULL,
        gps_latitud      double precision NOT NULL,
        gps_longitud     double precision NOT NULL,
        gps_precision    double precision NOT NULL CHECK (gps_precision >= 0),
        distancia_m      double precision,
        hora_dispositivo timestamptz NOT NULL,
        hora_servidor    timestamptz NOT NULL DEFAULT now(),
        sin_buena_senal  boolean NOT NULL DEFAULT false,
        foto_frente_url  text,
        justificacion    text,
        revision         text NOT NULL DEFAULT 'no_requiere' CHECK (revision IN ('no_requiere', 'pendiente', 'revisada')),
        revisada_por     text,
        revisada_en      timestamptz,
        CHECK (NOT sin_buena_senal OR (foto_frente_url IS NOT NULL AND btrim(foto_frente_url) <> '' AND justificacion IS NOT NULL AND btrim(justificacion) <> '')),
        CHECK (NOT sin_buena_senal OR revision <> 'no_requiere')
      );
      CREATE INDEX inicios_inspeccion_revision_idx ON inicios_inspeccion (revision, hora_servidor);

      ALTER TABLE inicios_inspeccion ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_inicios_inspeccion_admin_secretaria ON inicios_inspeccion;
      CREATE POLICY rls_inicios_inspeccion_admin_secretaria ON inicios_inspeccion
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- El RT de Calle registra el inicio en los edificios que tiene asignados y los ve.
      DROP POLICY IF EXISTS rls_inicios_inspeccion_rt_insert ON inicios_inspeccion;
      CREATE POLICY rls_inicios_inspeccion_rt_insert ON inicios_inspeccion
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') = 'rt_calle' AND usuario_asignado_en_edificio(consorcio_id));
      DROP POLICY IF EXISTS rls_inicios_inspeccion_rt_select ON inicios_inspeccion;
      CREATE POLICY rls_inicios_inspeccion_rt_select ON inicios_inspeccion
        FOR SELECT
        USING (usuario_asignado_en_edificio(consorcio_id));

      -- El registro no se edita: ni el GPS, ni la hora, ni la foto, ni la justificación, ni quién lo hizo. Sólo cambia la revisión.
      CREATE OR REPLACE FUNCTION inicios_inspeccion_inmutable() RETURNS trigger AS $f$
      BEGIN
        IF current_user = 'ascensores_app' AND (NEW.consorcio_id IS DISTINCT FROM OLD.consorcio_id
           OR NEW.usuario IS DISTINCT FROM OLD.usuario
           OR NEW.gps_latitud IS DISTINCT FROM OLD.gps_latitud
           OR NEW.gps_longitud IS DISTINCT FROM OLD.gps_longitud
           OR NEW.gps_precision IS DISTINCT FROM OLD.gps_precision
           OR NEW.distancia_m IS DISTINCT FROM OLD.distancia_m
           OR NEW.hora_dispositivo IS DISTINCT FROM OLD.hora_dispositivo
           OR NEW.hora_servidor IS DISTINCT FROM OLD.hora_servidor
           OR NEW.sin_buena_senal IS DISTINCT FROM OLD.sin_buena_senal
           OR NEW.foto_frente_url IS DISTINCT FROM OLD.foto_frente_url
           OR NEW.justificacion IS DISTINCT FROM OLD.justificacion) THEN
          RAISE EXCEPTION 'El inicio de la inspección no se puede modificar (GPS, hora, foto y justificación quedan fijos)';
        END IF;
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS inicios_inspeccion_inmutable_trg ON inicios_inspeccion;
      CREATE TRIGGER inicios_inspeccion_inmutable_trg BEFORE UPDATE ON inicios_inspeccion
        FOR EACH ROW EXECUTE FUNCTION inicios_inspeccion_inmutable();
    `,
  },
  {
    id: '027_remitos_eca',
    sql: `
      -- HU-05 RF-01: el envío del remito digital de una visita a la empresa conservadora (ECA): quién lo mandó y cuándo.
      -- Un remito por visita. maquina_id y visita_id son los del módulo de visitas (identificadores de texto).
      CREATE TABLE remitos_eca (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        maquina_id   text NOT NULL,
        visita_id    text NOT NULL UNIQUE,
        eca          text NOT NULL,
        direccion    text NOT NULL,
        enviado_por  text NOT NULL,
        enviado_en   timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE remitos_eca ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_remitos_eca_admin_secretaria ON remitos_eca;
      CREATE POLICY rls_remitos_eca_admin_secretaria ON remitos_eca
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- El remito enviado no se edita ni se borra desde la aplicación: queda como constancia.
      REVOKE UPDATE, DELETE ON remitos_eca FROM ascensores_app;
    `,
  },
  {
    id: '028_reclamos_admin',
    sql: `
      -- HU-05 RF-02: el reclamo a la administración del consorcio por una visita con advertencia: quién lo hizo y cuándo. Uno por visita.
      CREATE TABLE reclamos_admin (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        maquina_id     text NOT NULL,
        visita_id      text NOT NULL UNIQUE,
        administracion text NOT NULL,
        direccion      text NOT NULL,
        reclamado_por  text NOT NULL,
        reclamado_en   timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE reclamos_admin ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_reclamos_admin_admin_secretaria ON reclamos_admin;
      CREATE POLICY rls_reclamos_admin_admin_secretaria ON reclamos_admin
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- El reclamo registrado no se edita ni se borra desde la aplicación: queda como constancia.
      REVOKE UPDATE, DELETE ON reclamos_admin FROM ascensores_app;
    `,
  },
  {
    id: '029_informes_visita',
    sql: `
      -- HU-18 RF-01: el informe consolidado de la visita a un edificio, con la firma única del encargado o el cierre «Sin firma».
      -- Hay firma o sin_firma, nunca las dos ni ninguna; «Sin firma» queda marcado para revisión (Secretaría y Firmante).
      CREATE TABLE informes_visita (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consorcio_id      uuid NOT NULL REFERENCES consorcios (id) ON DELETE CASCADE,
        usuario           text NOT NULL,
        contenido         jsonb NOT NULL,
        firma             jsonb,
        sin_firma         jsonb,
        requiere_revision boolean NOT NULL,
        hora_dispositivo  timestamptz NOT NULL,
        hora_servidor     timestamptz NOT NULL DEFAULT now(),
        CHECK ((firma IS NOT NULL) <> (sin_firma IS NOT NULL)),
        CHECK (requiere_revision = (sin_firma IS NOT NULL)),
        CHECK (jsonb_typeof(contenido -> 'equipos') = 'array' AND jsonb_array_length(contenido -> 'equipos') > 0)
      );
      CREATE INDEX informes_visita_revision_idx ON informes_visita (requiere_revision, hora_servidor DESC);
      CREATE INDEX informes_visita_consorcio_idx ON informes_visita (consorcio_id, hora_servidor DESC);

      ALTER TABLE informes_visita ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_informes_visita_admin_secretaria ON informes_visita;
      CREATE POLICY rls_informes_visita_admin_secretaria ON informes_visita
        FOR SELECT
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- El RT de Calle cierra el informe de los edificios que tiene asignados; él y el Firmante del edificio lo ven.
      DROP POLICY IF EXISTS rls_informes_visita_rt_insert ON informes_visita;
      CREATE POLICY rls_informes_visita_rt_insert ON informes_visita
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') = 'rt_calle' AND usuario_asignado_en_edificio(consorcio_id));
      DROP POLICY IF EXISTS rls_informes_visita_asignados_select ON informes_visita;
      CREATE POLICY rls_informes_visita_asignados_select ON informes_visita
        FOR SELECT
        USING (usuario_asignado_en_edificio(consorcio_id));
      -- El informe cerrado no se modifica ni se borra desde la aplicación (sin políticas de UPDATE ni DELETE, y sin permisos).
      REVOKE UPDATE, DELETE ON informes_visita FROM ascensores_app;
    `,
  },
  {
    id: '030_sellado_informe',
    sql: `
      -- HU-18 RNF-01: el informe cerrado se sella con un SHA-256 de su contenido, su firma y sus fotos. Los informes anteriores al sellado
      -- quedan sin hash (la verificación los marca como no coincidentes).
      ALTER TABLE informes_visita
        ADD COLUMN IF NOT EXISTS hash_sha256 text CHECK (hash_sha256 IS NULL OR hash_sha256 ~ '^[0-9a-f]{64}$'),
        ADD COLUMN IF NOT EXISTS version_hash text;

      -- Cada intento de modificar o borrar un informe cerrado (se rechaza con 409): quién, con qué rol, qué método y cuándo. Sólo se agrega.
      CREATE TABLE intentos_modificacion_informe (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        informe_id uuid NOT NULL REFERENCES informes_visita (id) ON DELETE CASCADE,
        usuario    text NOT NULL,
        rol        text NOT NULL,
        metodo     text NOT NULL CHECK (metodo IN ('PUT', 'PATCH', 'DELETE')),
        fecha      timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX intentos_modificacion_informe_idx ON intentos_modificacion_informe (informe_id, fecha);

      -- Cada verificación del sello: el hash guardado contra el recalculado, y quién verificó. Sólo se agrega.
      CREATE TABLE verificaciones_informe (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        informe_id     uuid NOT NULL REFERENCES informes_visita (id) ON DELETE CASCADE,
        usuario        text NOT NULL,
        rol            text NOT NULL,
        hash_guardado  text,
        hash_calculado text NOT NULL CHECK (hash_calculado ~ '^[0-9a-f]{64}$'),
        coincide       boolean NOT NULL,
        verificado_en  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX verificaciones_informe_idx ON verificaciones_informe (informe_id, verificado_en);

      ALTER TABLE intentos_modificacion_informe ENABLE ROW LEVEL SECURITY;
      ALTER TABLE verificaciones_informe ENABLE ROW LEVEL SECURITY;
      -- Cualquier usuario con sesión deja registrado su intento (el rol sale de la sesión); la auditoría la leen la Secretaría y el Administrador.
      DROP POLICY IF EXISTS rls_intentos_informe_insert ON intentos_modificacion_informe;
      CREATE POLICY rls_intentos_informe_insert ON intentos_modificacion_informe
        FOR INSERT
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IS NOT NULL);
      DROP POLICY IF EXISTS rls_intentos_informe_select ON intentos_modificacion_informe;
      CREATE POLICY rls_intentos_informe_select ON intentos_modificacion_informe
        FOR SELECT
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      DROP POLICY IF EXISTS rls_verificaciones_informe_admin_secretaria ON verificaciones_informe;
      CREATE POLICY rls_verificaciones_informe_admin_secretaria ON verificaciones_informe
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      REVOKE UPDATE, DELETE ON intentos_modificacion_informe FROM ascensores_app;
      REVOKE UPDATE, DELETE ON verificaciones_informe FROM ascensores_app;
    `,
  },
  {
    id: '031_informes_idempotentes',
    sql: `
      -- HU-18 RNF-02: el celular genera un identificador al cerrar el informe y lo reenvía igual si se corta la conexión: la base garantiza
      -- que el mismo identificador no cree dos informes (ni siquiera con dos envíos simultáneos).
      ALTER TABLE informes_visita
        ADD COLUMN IF NOT EXISTS client_report_id text UNIQUE CHECK (client_report_id IS NULL OR client_report_id ~ '^[A-Za-z0-9_-]{8,100}$');
    `,
  },
  {
    id: '032_maquinas_estado_agc',
    sql: `
      -- HU-01 RF-03: estado informado en el padrón oficial Excel de la AGC (APTO, NO APTO, OBSERVADO, etc.).
      ALTER TABLE maquinas
        ADD COLUMN IF NOT EXISTS estado_agc text;
    `,
  },
  {
    id: '033_firma_visitas',
    sql: `
      -- HU-08 RF-05: las visitas, firmas AGC y rechazos del Portal Firmante, y los avisos de plazo vencido, sobreviven a un reinicio de la API.
      -- Una visita por máquina y mes. «maquina_id» es el identificador de la vista de firma (no una clave foránea: también hay máquinas de ejemplo).
      CREATE TABLE firma_visitas (
        maquina_id     text NOT NULL,
        mes            text NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        estado         text NOT NULL CHECK (estado IN ('Recorrida', 'Pendiente de Visita', 'Advertencia')),
        visita         jsonb NOT NULL CHECK (jsonb_typeof(visita) = 'object'),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (maquina_id, mes)
      );
      -- Un solo aviso de plazo vencido por visita: la base impide generarlo dos veces.
      CREATE TABLE firma_avisos_plazo (
        visita_id     text PRIMARY KEY,
        maquina_id    text NOT NULL,
        codigo_agc    text NOT NULL,
        edificio      text NOT NULL,
        fecha_informe timestamptz NOT NULL,
        dias_habiles  integer NOT NULL CHECK (dias_habiles > 0),
        fecha         timestamptz NOT NULL
      );
      ALTER TABLE firma_visitas ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_firma_visitas_admin_secretaria ON firma_visitas;
      CREATE POLICY rls_firma_visitas_admin_secretaria ON firma_visitas
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      ALTER TABLE firma_avisos_plazo ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_firma_avisos_plazo_admin_secretaria ON firma_avisos_plazo;
      CREATE POLICY rls_firma_avisos_plazo_admin_secretaria ON firma_avisos_plazo
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- Los avisos ya generados no se editan ni se borran desde la aplicación.
      REVOKE UPDATE, DELETE ON firma_avisos_plazo FROM ascensores_app;
    `,
  },
  {
    id: '034_whatsapp_envios',
    sql: `
      -- HU-11 RF-12: el historial de envíos de WhatsApp sobrevive a un reinicio de la API. Un registro por intento de envío; los avisos de
      -- estado del proveedor (RF-09) lo actualizan, y se buscan por el id de mensaje (wamid de Meta o SM de Twilio).
      CREATE TABLE whatsapp_envios (
        id             text PRIMARY KEY,
        id_mensaje     text,
        alerta_id      text,
        estado_entrega text NOT NULL,
        registro       jsonb NOT NULL CHECK (jsonb_typeof(registro) = 'object'),
        creado_en      timestamptz NOT NULL,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX whatsapp_envios_id_mensaje ON whatsapp_envios (id_mensaje) WHERE id_mensaje IS NOT NULL;
      CREATE INDEX whatsapp_envios_alerta ON whatsapp_envios (alerta_id);
      ALTER TABLE whatsapp_envios ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_whatsapp_envios_admin_secretaria ON whatsapp_envios;
      CREATE POLICY rls_whatsapp_envios_admin_secretaria ON whatsapp_envios
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- Los envíos no se borran desde la aplicación: el historial es la constancia de lo que salió.
      REVOKE DELETE ON whatsapp_envios FROM ascensores_app;
    `,
  },
  {
    id: '035_avisos_falla',
    sql: `
      -- HU-11 RF-11: los avisos de falla crítica de la bandeja (pendientes, aprobados, enviados) sobreviven a un reinicio de la API, con el
      -- enlace sin contraseña que viaja en el WhatsApp: el token y cuándo se emitió (vence a los 7 días de emitido, no del reinicio).
      CREATE TABLE avisos_falla (
        alerta_id      text PRIMARY KEY,
        aviso_id       text NOT NULL UNIQUE,
        estado         text NOT NULL CHECK (estado IN ('Pendiente de revisión', 'Enviado', 'Falló el envío')),
        aviso          jsonb NOT NULL CHECK (jsonb_typeof(aviso) = 'object'),
        vista          jsonb NOT NULL CHECK (jsonb_typeof(vista) = 'object'),
        token          text UNIQUE,
        emitido_en     timestamptz,
        creado_en      timestamptz NOT NULL,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE avisos_falla ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_avisos_falla_admin_secretaria ON avisos_falla;
      CREATE POLICY rls_avisos_falla_admin_secretaria ON avisos_falla
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- Un aviso no se borra desde la aplicación: es la constancia de lo que se avisó y a quién.
      REVOKE DELETE ON avisos_falla FROM ascensores_app;
    `,
  },
  {
    id: '036_reportes_parada',
    sql: `
      -- HU-17 RF-09: los reportes de parada (Fuera de Servicio / Reparación Urgente) que carga el RT sobreviven a un reinicio de la API.
      -- «client_report_id» es el id que genera el celular: un reintento del mismo reporte no se duplica.
      CREATE TABLE reportes_parada (
        id                text PRIMARY KEY,
        maquina_id        text NOT NULL,
        client_report_id  text UNIQUE,
        confirmacion      text NOT NULL CHECK (confirmacion IN ('Pendiente de confirmación', 'Confirmado', 'Rechazado')),
        reporte           jsonb NOT NULL CHECK (jsonb_typeof(reporte) = 'object'),
        fecha             timestamptz NOT NULL,
        actualizado_en    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX reportes_parada_maquina ON reportes_parada (maquina_id, fecha);
      ALTER TABLE reportes_parada ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_reportes_parada_admin_secretaria ON reportes_parada;
      CREATE POLICY rls_reportes_parada_admin_secretaria ON reportes_parada
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- Un reporte no se borra desde la aplicación: es la constancia de que el equipo estuvo parado.
      REVOKE DELETE ON reportes_parada FROM ascensores_app;
    `,
  },
  {
    id: '037_informes_falla',
    sql: `
      -- HU-06 RF-08: los informes de falla crítica que carga el RT sobreviven a un reinicio de la API, con su clientReportId (el reintento
      -- del celular no se duplica ni vuelve a avisar) y quién abrió la alerta primero.
      CREATE TABLE informes_falla (
        id                text PRIMARY KEY,
        client_report_id  text UNIQUE,
        maquina_id        text NOT NULL,
        informe           jsonb NOT NULL CHECK (jsonb_typeof(informe) = 'object'),
        registrado_en     timestamptz NOT NULL,
        actualizado_en    timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX informes_falla_maquina ON informes_falla (maquina_id, registrado_en);
      ALTER TABLE informes_falla ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rls_informes_falla_admin_secretaria ON informes_falla;
      CREATE POLICY rls_informes_falla_admin_secretaria ON informes_falla
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));
      -- Un informe de falla no se borra desde la aplicación: es la constancia de lo que encontró el RT.
      REVOKE DELETE ON informes_falla FROM ascensores_app;
    `,
  },
  {
    id: '038_chat_mensajes',
    sql: `
      -- HU-19 RF-01: Chat interno entre operarios e ingenieros con salas global e individual, fotos y enlaces.
      CREATE TABLE chat_mensajes (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        emisor_id       uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
        destinatario_id uuid REFERENCES usuarios (id) ON DELETE CASCADE,
        tipo_sala       text NOT NULL CHECK (tipo_sala IN ('global', 'directo')),
        contenido       text NOT NULL CHECK (length(btrim(contenido)) > 0 OR adjunto_url IS NOT NULL),
        adjunto_url     text,
        consorcio_id    uuid REFERENCES consorcios (id) ON DELETE SET NULL,
        maquina_ref     text,
        creado_en       timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX chat_mensajes_tipo_sala_idx ON chat_mensajes (tipo_sala, creado_en);
      CREATE INDEX chat_mensajes_destinatario_idx ON chat_mensajes (destinatario_id, creado_en) WHERE destinatario_id IS NOT NULL;
      CREATE INDEX chat_mensajes_emisor_idx ON chat_mensajes (emisor_id, creado_en);

      ALTER TABLE chat_mensajes ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS rls_chat_mensajes_admin_secretaria ON chat_mensajes;
      CREATE POLICY rls_chat_mensajes_admin_secretaria ON chat_mensajes
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('secretaria', 'administrador'));

      DROP POLICY IF EXISTS rls_chat_mensajes_operarios ON chat_mensajes;
      CREATE POLICY rls_chat_mensajes_operarios ON chat_mensajes
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('rt_calle', 'firmante', 'administrador', 'secretaria'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('rt_calle', 'firmante', 'administrador', 'secretaria'));

      GRANT SELECT, INSERT, UPDATE, DELETE ON chat_mensajes TO ascensores_app;
    `,
  },
  {
    id: '039_chat_lecturas',
    sql: `
      -- HU-19 RF-09: hasta dónde leyó cada usuario cada conversación del chat. Lo no leído de una conversación son los mensajes de otros que
      -- vienen después de ese punto. «sala» es 'global' o el identificador del compañero con quien se habla (en minúscula).
      CREATE TABLE chat_lecturas (
        usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
        sala       text NOT NULL CHECK (sala = 'global' OR sala ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
        leido_en   timestamptz NOT NULL,
        leido_id   uuid NOT NULL,
        PRIMARY KEY (usuario_id, sala)
      );

      ALTER TABLE chat_lecturas ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS rls_chat_lecturas_chat ON chat_lecturas;
      CREATE POLICY rls_chat_lecturas_chat ON chat_lecturas
        USING (NULLIF(current_setting('app.rol_actual', true), '') IN ('rt_calle', 'firmante', 'administrador', 'secretaria'))
        WITH CHECK (NULLIF(current_setting('app.rol_actual', true), '') IN ('rt_calle', 'firmante', 'administrador', 'secretaria'));

      GRANT SELECT, INSERT, UPDATE, DELETE ON chat_lecturas TO ascensores_app;

      -- Lo que ya está escrito se da por leído: los contadores empiezan en cero y cuentan lo que llegue desde ahora.
      INSERT INTO chat_lecturas (usuario_id, sala, leido_en, leido_id)
      SELECT u.id, 'global', g.creado_en, g.id
        FROM usuarios u
        CROSS JOIN LATERAL (SELECT creado_en, id FROM chat_mensajes WHERE tipo_sala = 'global' ORDER BY creado_en DESC, id DESC LIMIT 1) g
       WHERE u.rol IN ('rt_calle', 'firmante', 'administrador', 'secretaria');

      INSERT INTO chat_lecturas (usuario_id, sala, leido_en, leido_id)
      SELECT DISTINCT ON (m.destinatario_id, m.emisor_id) m.destinatario_id, m.emisor_id::text, m.creado_en, m.id
        FROM chat_mensajes m
       WHERE m.tipo_sala = 'directo' AND m.destinatario_id IS NOT NULL
       ORDER BY m.destinatario_id, m.emisor_id, m.creado_en DESC, m.id DESC;
    `,
  },
];
