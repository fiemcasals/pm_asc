import { escaparHtml, renderInformeAviso, VistaInformeAviso } from '../src/avisos/informe-publico';

// HU-11 RF-06: la página pública del informe no deja pasar HTML ni esquemas peligrosos.
const vista = (extra: Partial<VistaInformeAviso> = {}): VistaInformeAviso => ({
  titulo: 'Falla crítica reportada', equipo: 'M1 - Principal', direccion: 'Calle 1', consorcio: 'Consorcio', eca: 'ECA', fecha: '2026-11-17T12:00:00.000Z',
  detalle: ['Botón de PARE: Falla'], observaciones: '', fotografias: [], ...extra,
});

describe('escaparHtml', () => {
  it('escapa los cinco caracteres que abren HTML', () => {
    expect(escaparHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('renderInformeAviso', () => {
  it('escapa todo lo que escribió una persona', () => {
    const html = renderInformeAviso(vista({ equipo: '<b>M1</b>', eca: '"><script>x</script>', observaciones: '<img src=x onerror=alert(1)>', detalle: ['<i>a</i>'] }));

    expect(html).not.toMatch(/<script>x|<b>M1|<img src=x|<i>a/);
    expect(html).toContain('&lt;b&gt;M1');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('muestra fotos https y data URL de imagen, y descarta javascript:, otros esquemas y data URL que no son imagen', () => {
    const buena1 = 'https://fotos.example/a.jpg';
    const buena2 = 'data:image/png;base64,iVBORw0KGgo=';
    const html = renderInformeAviso(vista({ fotografias: [buena1, buena2, 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'ftp://x/y.jpg', 'https://a.example/x" onerror="y'] }));

    expect(html).toContain(`src="${buena1}"`);
    expect(html).toContain(`src="${buena2}"`);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('text/html');
    expect(html).not.toContain('ftp://');
    expect(html).not.toContain('onerror');
  });

  it('pide que no se indexe y no muestra la sección de observaciones si está vacía', () => {
    const html = renderInformeAviso(vista());

    expect(html).toContain('noindex');
    expect(html).toContain('Botón de PARE: Falla');
  });
});
