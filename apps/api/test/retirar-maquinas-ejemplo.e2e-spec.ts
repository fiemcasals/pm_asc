import { INestApplication } from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { ConsorcioInput } from '../src/consorcios/consorcio.types';
import { FirmanteService } from '../src/firmante/firmante.service';
import { InMemoryConsorciosRepository, createTestApp, fakeDatabase } from './create-test-app';

/**
 * HU-08 RF-06: Retirar las máquinas de ejemplo de la vista de firma.
 */
const PASSWORD = 'Clave-Segura-2026';

const edificioTerna = (direccion: string, nombre: string): ConsorcioInput => ({
  nombre,
  direccion,
  administracion: { nombre: 'Administración Balvanera SRL', telefono: '11 4444-5555', email: 'admin@balvanera.com' },
  encargado: { nombre: 'Carlos Rodríguez', telefono: '11 9999-8888' },
  pisos: [],
  ubicacion: null,
  maquinas: [
    { referenciaAgc: 'M1', descripcion: 'Ascensor Principal', tipo: 'traccion', salaCompartidaId: null },
    { referenciaAgc: 'M2', descripcion: 'Ascensor Servicio', tipo: 'hidraulico', salaCompartidaId: null },
  ],
});

describe('HU-08 RF-06: Retirar las máquinas de ejemplo de la vista de firma', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let consorcios: InMemoryConsorciosRepository;
  let firmanteService: FirmanteService;
  let hash: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcryptjs.hash(PASSWORD, 4);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  const token = async (usuario: string) => {
    const res = await http().post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return `Bearer ${res.body.accessToken}`;
  };

  it('criterio 1: con edificios con terna, en Portal Firmante sólo aparecen máquinas de esos edificios (sin ejemplos)', async () => {
    usuarios = new InMemoryUsuariosRepository();
    await usuarios.crear({ usuario: 'secretaria1', nombre: 'Secretaria 1', rol: 'secretaria', passwordHash: hash });
    await usuarios.crear({ usuario: 'firmante1', nombre: 'Firmante 1', rol: 'firmante', passwordHash: hash });

    consorcios = new InMemoryConsorciosRepository();
    const creado = await consorcios.crear(edificioTerna('Av. Pueyrredón 500, CABA', 'DEMO Pueyrredon'));

    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      consorcios,
      undefined,
      { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
    ));

    const authSec = await token('secretaria1');
    await http()
      .put(`/api/consorcios/${creado.id}/roles`)
      .set('Authorization', authSec)
      .send({
        rtCalle: { nombre: 'rt_calle1', telefono: '11 0000-0000' },
        firmante: { nombre: 'firmante1', email: 'f1@demo.com' },
        eca: { nombre: 'ECA Demo', email: 'eca@demo.com' },
      })
      .expect(200);

    const res = await http().get('/api/firmante/maquinas').set('Authorization', authSec).expect(200);

    // Sólo deben estar las máquinas del edificio con terna creado
    expect(res.body.length).toBe(2);
    expect(res.body.every((m: any) => m.consorcioId === creado.id)).toBe(true);

    // Ninguna de las 5 máquinas de ejemplo hardcodeadas debe existir
    const ids = res.body.map((m: any) => m.id);
    expect(ids).not.toContain('MAQ-CORRIENTES-M1');
    expect(ids).not.toContain('MAQ-CORRIENTES-M2');
    expect(ids).not.toContain('MAQ-CALLAO-M1');
    expect(ids).not.toContain('MAQ-SANTAFE-M1');
    expect(ids).not.toContain('MAQ-SANTAFE-M2');
  });

  it('criterio 2: sin ningún edificio con terna, el Portal Firmante responde 200 con lista vacía y no un error', async () => {
    usuarios = new InMemoryUsuariosRepository();
    await usuarios.crear({ usuario: 'secretaria1', nombre: 'Secretaria 1', rol: 'secretaria', passwordHash: hash });

    consorcios = new InMemoryConsorciosRepository(); // sin edificios

    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      consorcios,
      undefined,
      { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
    ));

    firmanteService = app.get(FirmanteService);
    firmanteService.limpiarMaquinasDeEjemplo();

    const authSec = await token('secretaria1');
    const res = await http().get('/api/firmante/maquinas').set('Authorization', authSec).expect(200);

    // Lista vacía sin error
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('criterio 4: los datos reales no se duplican por dirección (ej. Santa Fe 3200)', async () => {
    usuarios = new InMemoryUsuariosRepository();
    await usuarios.crear({ usuario: 'secretaria1', nombre: 'Secretaria 1', rol: 'secretaria', passwordHash: hash });
    await usuarios.crear({ usuario: 'firmante_sf', nombre: 'Firmante SF', rol: 'firmante', passwordHash: hash });

    consorcios = new InMemoryConsorciosRepository();
    const sf = await consorcios.crear(edificioTerna('Av. Santa Fe 3200, CABA', 'DEMO Santa Fe 3200'));

    ({ app } = await createTestApp(
      { NODE_ENV: 'test' },
      fakeDatabase(),
      consorcios,
      undefined,
      { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
    ));

    const authSec = await token('secretaria1');
    await http()
      .put(`/api/consorcios/${sf.id}/roles`)
      .set('Authorization', authSec)
      .send({
        rtCalle: { nombre: 'rt_calle1', telefono: '11 0000-0000' },
        firmante: { nombre: 'firmante_sf', email: 'sf@demo.com' },
        eca: { nombre: 'ECA Demo', email: 'eca@demo.com' },
      })
      .expect(200);

    const res = await http().get('/api/firmante/maquinas').set('Authorization', authSec).expect(200);

    const maquinasSantaFe = res.body.filter((m: any) => m.edificio.direccion.includes('Santa Fe 3200'));
    // Sólo las 2 máquinas del edificio creado en la base, no duplicado con el seed anterior
    expect(maquinasSantaFe.length).toBe(2);
    expect(maquinasSantaFe.every((m: any) => m.consorcioId === sf.id)).toBe(true);
  });

  const CARGA = process.env.CARGA ? parseInt(process.env.CARGA, 10) : 0;
  if (CARGA > 0) {
    it(`prueba de carga: ${CARGA} consultas al Portal Firmante sin máquinas de ejemplo`, async () => {
      usuarios = new InMemoryUsuariosRepository();
      await usuarios.crear({ usuario: 'secretaria1', nombre: 'Secretaria 1', rol: 'secretaria', passwordHash: hash });
      consorcios = new InMemoryConsorciosRepository();
      const edif = await consorcios.crear(edificioTerna('Av. Corrientes 5000, CABA', 'DEMO Corrientes'));

      ({ app } = await createTestApp(
        { NODE_ENV: 'test' },
        fakeDatabase(),
        consorcios,
        undefined,
        { usuarios, reloj: { ahora: () => Date.parse('2026-11-25T15:00:00Z') } },
      ));

      const authSec = await token('secretaria1');
      await http()
        .put(`/api/consorcios/${edif.id}/roles`)
        .set('Authorization', authSec)
        .send({
          rtCalle: { nombre: 'rt_calle1', telefono: '11 0000-0000' },
          firmante: { nombre: 'firmante1', email: 'f1@demo.com' },
          eca: { nombre: 'ECA Demo', email: 'eca@demo.com' },
        })
        .expect(200);

      const tiempos: number[] = [];
      let fallas = 0;
      for (let i = 0; i < CARGA; i++) {
        const t0 = Date.now();
        const res = await http().get('/api/firmante/maquinas').set('Authorization', authSec);
        if (res.status !== 200 || res.body.length !== 2) fallas++;
        tiempos.push(Date.now() - t0);
      }

      tiempos.sort((a, b) => a - b);
      const promedio = Math.round(tiempos.reduce((s, v) => s + v, 0) / tiempos.length);
      const p95 = Math.round(tiempos[Math.max(0, Math.ceil(tiempos.length * 0.95) - 1)]);
      const max = Math.round(tiempos[tiempos.length - 1]);

      console.log(`[CARGA ${CARGA}] ${CARGA} consultas: 0 fallas · promedio ${promedio} ms · p95 ${p95} ms · máx ${max} ms`);
      expect(fallas).toBe(0);
    });
  }
});
