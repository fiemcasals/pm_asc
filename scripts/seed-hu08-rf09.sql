DO $setup$
DECLARE
  cidA uuid;
  cidB uuid;
BEGIN
  -- Consorcio A
  SELECT id INTO cidA FROM consorcios WHERE nombre = 'Torre Alvear 500 (Edificio A)';
  IF cidA IS NULL THEN
    INSERT INTO consorcios (nombre, direccion, eca_nombre, administracion_nombre, administracion_telefono, administracion_email, ubicacion, pisos)
    VALUES ('Torre Alvear 500 (Edificio A)', 'Av. Alvear 500, CABA', 'ECA Demo', 'Admin Alvear', '11-4000-1111', 'admin@alvear.com', ST_SetSRID(ST_MakePoint(-58.3816, -34.6037), 4326), '["PB", "1", "2", "3", "4", "5"]'::jsonb)
    RETURNING id INTO cidA;

    INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion, tipo) VALUES (cidA, 'M1', 'Ascensor Principal A', 'traccion');
  END IF;

  INSERT INTO roles_edificio (consorcio_id, rt_calle_nombre, rt_calle_email, firmante_nombre, firmante_email, eca_nombre)
  VALUES (cidA, 'rt.ana', 'rt.ana@demo.com', 'demo.firmante', 'firmante@demo.com', 'ECA Demo')
  ON CONFLICT (consorcio_id) DO UPDATE SET rt_calle_nombre = 'rt.ana', firmante_nombre = 'demo.firmante', eca_nombre = 'ECA Demo';

  -- Consorcio B
  SELECT id INTO cidB FROM consorcios WHERE nombre = 'Torre Corrientes 1500 (Edificio B)';
  IF cidB IS NULL THEN
    INSERT INTO consorcios (nombre, direccion, eca_nombre, administracion_nombre, administracion_telefono, administracion_email, ubicacion, pisos)
    VALUES ('Torre Corrientes 1500 (Edificio B)', 'Av. Corrientes 1500, CABA', 'ECA Demo', 'Admin Corrientes', '11-4000-2222', 'admin@corrientes.com', ST_SetSRID(ST_MakePoint(-58.3820, -34.6040), 4326), '["PB", "1", "2", "3", "4"]'::jsonb)
    RETURNING id INTO cidB;

    INSERT INTO maquinas (consorcio_id, referencia_agc, descripcion, tipo) VALUES (cidB, 'M9', 'Ascensor M9 de Edificio B', 'traccion');
  END IF;

  INSERT INTO roles_edificio (consorcio_id, rt_calle_nombre, rt_calle_email, firmante_nombre, firmante_email, eca_nombre)
  VALUES (cidB, 'rt.ana', 'rt.ana@demo.com', 'demo.firmante', 'firmante@demo.com', 'ECA Demo')
  ON CONFLICT (consorcio_id) DO UPDATE SET rt_calle_nombre = 'rt.ana', firmante_nombre = 'demo.firmante', eca_nombre = 'ECA Demo';
END $setup$;
