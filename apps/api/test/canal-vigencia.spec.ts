import { FallasCriticasController, VIGENCIA_CANAL_POR_DEFECTO_MS } from '../src/fallas-criticas/fallas-criticas.controller';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { FirmanteService } from '../src/firmante/firmante.service';
import { AppConfig } from '../src/config';

// HU-06 RF-07 — cuánto dura una conexión al canal en tiempo real de fallas críticas.
describe('Vigencia del canal en tiempo real', () => {
  const usuario = { id: 'u1', usuario: 'secretaria.e2e', rol: 'secretaria' as const, eca: null };
  const servicio = () => new FallasCriticasService(new FirmanteService());

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Abre el canal y dice si el servidor ya lo cerró tras `ms` milisegundos. */
  const cerradoTras = (controller: FallasCriticasController, ms: number) => {
    let cerrado = false;
    const sub = controller.eventos(usuario).subscribe({ complete: () => (cerrado = true) });
    jest.advanceTimersByTime(ms);
    sub.unsubscribe();
    return cerrado;
  };

  it('el valor por defecto es de 5 minutos', () => {
    expect(VIGENCIA_CANAL_POR_DEFECTO_MS).toBe(300_000);
  });

  it('sin configuración el servidor cierra el canal a los 5 minutos, ni un instante antes', () => {
    const controller = new FallasCriticasController(servicio());
    expect(cerradoTras(controller, 299_999)).toBe(false);
    expect(cerradoTras(controller, 300_000)).toBe(true);
  });

  it('con configuración usa la de la configuración', () => {
    const controller = new FallasCriticasController(servicio(), { canalFallasVigenciaMs: 45_000 } as AppConfig);
    expect(cerradoTras(controller, 44_999)).toBe(false);
    expect(cerradoTras(controller, 45_000)).toBe(true);
  });
});
