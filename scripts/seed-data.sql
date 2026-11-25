DO $terna$
DECLARE
  cid uuid;
BEGIN
  SELECT id INTO cid FROM consorcios WHERE nombre = 'Edificio Auditoria Playwright';
  IF cid IS NULL THEN
    INSERT INTO consorcios (nombre, direccion, eca_nombre, administracion_nombre, administracion_telefono, administracion_email, ubicacion, pisos)
    VALUES ('Edificio Auditoria Playwright', 'Av. Corrientes 1234, CABA', 'ECA Demo', 'Admin Central', '11-4000-0000', 'admin@central.com', ST_SetSRID(ST_MakePoint(-58.3816, -34.6037), 4326), '["PB", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]'::jsonb)
    RETURNING id INTO cid;

    INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion, tipo)
    VALUES (cid, 'M1', 'Ascensor Principal Tracción', 'traccion');
  ELSE
    UPDATE consorcios SET eca_nombre = 'ECA Demo', ubicacion = ST_SetSRID(ST_MakePoint(-58.3816, -34.6037), 4326) WHERE id = cid;
  END IF;

  INSERT INTO roles_edificio (consorcio_id, rt_calle_nombre, rt_calle_email, firmante_nombre, firmante_email, eca_nombre)
  VALUES (cid, 'rt.ana', 'rt.ana@demo.com', 'demo.firmante', 'firmante@demo.com', 'ECA Demo')
  ON CONFLICT (consorcio_id) DO UPDATE SET rt_calle_nombre = 'rt.ana', rt_calle_email = 'rt.ana@demo.com', firmante_nombre = 'demo.firmante', firmante_email = 'firmante@demo.com', eca_nombre = 'ECA Demo';
END $terna$;
