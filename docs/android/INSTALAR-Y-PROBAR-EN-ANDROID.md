# Instalar y probar la app en un celular Android

Guía para abrir la app que corre en una PC de desarrollo desde el Chrome de un celular Android, instalarla como app y probar lo que el RT necesita en la calle: **que funcione sin wifi y sin señal**.

- **Para quién:** quien vaya a probar en un celular (desarrollo y QA). No hace falta saber de Android.
- **Última revisión:** 19/11/2026, con la app que incluye el mapa de CABA sin conexión (HU-16 RF-03).
- **Estado:** todo lo de esta guía se probó en Chromium de escritorio con Playwright. **Todavía no se corrió en un Android real**: los pasos del celular (certificado, `adb`, gestos táctiles) están escritos a partir de cómo funciona Android y hay que confirmarlos en la primera prueba. Al final hay una tabla para anotar el resultado.

## 1. Por qué hay que hacer todo esto

- La app **solo funciona por HTTPS**: la cookie de sesión se emite con `secure`, así que por `http://` no se puede iniciar sesión.
- El certificado de desarrollo (mkcert) está emitido para `localhost`, `127.0.0.1` y `::1`. Para que el Chrome del celular lo acepte hay que instalar en el celular la autoridad (CA) de mkcert.
- El camino más simple es **por cable USB**: con `adb reverse` el `localhost` del celular pasa a ser el `localhost` de la PC. No hace falta tocar la red, el firewall ni el certificado.
- Para probar **sin conexión** hay que usar la app **compilada** (`npm run preview`), no el servidor de desarrollo: el service worker de desarrollo no guarda la app entera.

## 2. Qué necesitás

| En la PC | En el celular |
|---|---|
| El repo clonado, con `npm install` hecho | Android con Chrome actualizado |
| Docker prendido (la base de datos) | Cable USB que transmita datos (no solo carga) |
| mkcert instalado y el certificado generado (`npm run certs`) | Bloqueo de pantalla configurado (Android lo exige para instalar un certificado) |
| El archivo del mapa generado (`npm run mapa:generar`) | |
| `adb` (ver 3.1) | |

## 3. Preparación (una sola vez)

### 3.1 En la PC: `adb`

1. Bajá **SDK Platform-Tools for Windows** de https://developer.android.com/tools/releases/platform-tools (es el sitio oficial de Android).
2. Descomprimilo en una carpeta fija, por ejemplo `C:\android\platform-tools`. No hace falta Android Studio.
3. Abrí una terminal en esa carpeta y comprobá: `.\adb.exe version`.

### 3.2 En la PC: certificado y mapa

```bash
npm run certs            # una vez; genera certs/localhost.pem con mkcert
npm run mapa:generar     # una vez; arma apps/web/public/mapa/caba.pmtiles (~11 MB, ~1 minuto, necesita Internet)
```

El archivo del mapa **no está en git** (pesa 10,7 MB y se regenera con ese comando). Si falta, la app compila igual, pero la descarga del mapa en el celular falla.

### 3.3 En el celular: activar la depuración USB

1. Ajustes › Acerca del teléfono › tocá **7 veces** «Número de compilación».
2. Ajustes › Opciones de desarrollador › activá **Depuración USB**.
3. Al conectar el cable, aceptá el cartel «¿Permitir la depuración USB?» (conviene marcar «Permitir siempre desde este equipo»).

### 3.4 En el celular: instalar el certificado de mkcert

1. En la PC, buscá la carpeta de mkcert: `mkcert -CAROOT` (en esta PC es `C:\Users\German\AppData\Local\mkcert`).
2. Copiá al celular **solo `rootCA.pem`**, por ejemplo por cable o por Drive. Si el celular no lo deja elegir, renombralo a `rootCA.crt`.
3. En el celular: **Ajustes › Seguridad › Cifrado y credenciales › Instalar un certificado › Certificado de CA**, y elegí el archivo. La ruta cambia según la marca; buscá «certificado» en el buscador de Ajustes. Android avisa que la red «puede estar supervisada»: es lo esperado, porque está instalando una CA de usuario.
4. Desde Android 11 el certificado se instala desde Ajustes: tocar el archivo en el explorador de archivos no alcanza.

> ⚠️ **Nunca copies `rootCA-key.pem`** (la clave privada de la CA). Con ese archivo se pueden emitir certificados que el celular aceptaría como válidos. Al terminar la prueba, si el celular no es solo de pruebas, quitá el certificado: Ajustes › Seguridad › Cifrado y credenciales › Credenciales de confianza › pestaña «Usuario».

## 4. Cada vez que pruebes

### 4.1 Levantar la app compilada en la PC

```bash
npm run db:up                      # la base de datos
npm run dev                        # la API (:3050); también levanta la web de desarrollo en :8050
npm run build -w apps/web          # compila la app y copia public/mapa/ (incluye caba.pmtiles)
npm run preview -w apps/web        # sirve lo compilado en https://localhost:4173
```

Dejá la API y el `preview` corriendo en dos terminales. El `preview` redirige `/api` a la API, así que el celular solo necesita llegar a un puerto.

Si cambiás código, volvé a correr el `build` y reiniciá el `preview`.

### 4.2 Conectar el celular

Con el cable enchufado, desde la carpeta de platform-tools:

```powershell
.\adb.exe devices                      # tiene que decir «device» (no «unauthorized» ni vacío)
.\adb.exe reverse tcp:4173 tcp:4173    # el localhost:4173 del celular apunta a la PC
.\adb.exe reverse --list               # confirma que quedó creado
```

En el Chrome del celular abrí **https://localhost:4173**. Si el certificado quedó bien instalado, no aparece ninguna advertencia.

Si querés probar el servidor de desarrollo en lugar de lo compilado: `.\adb.exe reverse tcp:8050 tcp:8050` y abrí https://localhost:8050 (sirve para ver cambios al instante, pero no para la prueba sin conexión).

> `adb reverse` se pierde si desenchufás el cable o reiniciás `adb`: hay que volver a correrlo.

## 5. Qué probar

Usuario de desarrollo: `admin` / `Admin-Desarrollo-2026` (solo existe en la base local).

### 5.1 Mapa de CABA sin señal (RF-03)

1. Entrá a la app e iniciá sesión. Andá a **Estado del Sistema** y bajá hasta **«Mapa de CABA para usar sin señal»**.
2. **Mapa en línea:** tiene que dibujarse con calles, parques y nombres. Un dedo mueve la página; **dos dedos** mueven y acercan el mapa («Usá dos dedos para mover el mapa»). Probá el pellizco para acercar hasta ver una cuadra.
3. Tocá **«Descargar mapa para usar sin señal»** (~11 MB). Tiene que mostrar la barra de avance y terminar en **«Mapa guardado»**. Si se corta, **Cancelar** y reintentar tiene que dejar todo consistente.
4. **Cortá la conexión de verdad:**
   - Frená el `preview` en la PC (Ctrl+C) **o** desenchufá el cable. El **modo avión no alcanza**: el túnel USB sigue andando.
   - En el celular, **recargá la página** (deslizá hacia abajo o el botón de recarga).
   - Tienen que seguir apareciendo la app y el mapa, con el aviso **«Sin señal»**.
5. **Sin mapa guardado y sin red:** en Chrome, Ajustes del sitio › Borrar datos de `localhost`; sin red, abrí otra vez la pantalla. Tiene que decir **«Mapa sin descargar: conectate a una red para bajarlo»**. Al volver la conexión, el mapa se dibuja solo.
6. Anotá: fluidez del zoom y del desplazamiento, si las calles se leen al tamaño de la pantalla, si se calienta o se pone lento, si se cierra el navegador.

### 5.2 Instalarla como app (PWA)

1. En Chrome, menú ⋮ › **Instalar app** (o «Agregar a la pantalla principal»).
2. Abrila desde el ícono: tiene que abrir a pantalla completa, sin la barra del navegador.
3. Repetí el paso 4 de 5.1 (sin conexión) desde la app instalada.

**Sin verificar:** el manifest tiene un único ícono SVG (`icon.svg`, tamaño `any`). Si Chrome no ofrece «Instalar app», es un hallazgo a registrar (probablemente haya que sumar íconos PNG de 192 y 512 px); el uso sin conexión funciona igual desde una pestaña común.

### 5.3 Resto de la app

Con el mismo cable, recorré las pantallas del RT (recorrido, checklist, firma) con el celular en vertical y apaisado, y fijate en: tamaño de los botones al tacto, texto cortado, teclado que tapa campos y rendimiento.

## 6. Ver la consola del celular desde la PC

1. En Chrome de la PC abrí `chrome://inspect/#devices`.
2. El celular aparece con sus pestañas abiertas; tocá **inspect** en la de la app.
3. En **Application** se ven los datos del mapa guardado: Cache Storage `mant-asc-mapa-v1` (el archivo) y Local Storage `mant_asc_mapa` (la versión anotada), y el estado del service worker.

## 7. Alternativa por Wi-Fi (sin cable)

Tiene más pasos y puede fallar según la red. Usala si no hay cable.

1. **IP de la PC:** `ipconfig` › «Dirección IPv4» de la placa Wi-Fi (por ejemplo `192.168.1.20`). Cambia si cambia la red.
2. **Certificado con esa IP** (el de `npm run certs` solo cubre `localhost`). Desde la raíz del repo:
   ```bash
   mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1 192.168.1.20
   ```
   Reiniciá los servidores. El celular necesita tener instalado el mismo `rootCA.pem` (paso 3.4).
3. **Servir en la red:** `npm run preview -w apps/web -- --host`.
4. **Firewall de Windows:** permitir el puerto 4173 de entrada en la red privada (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "mant_asc preview" -Direction Inbound -Protocol TCP -LocalPort 4173 -Action Allow -Profile Private
   ```
   Si Windows marca la red como «Pública», la regla no se aplica: cambiá el perfil de la red a «Privada».
5. Con el celular en la **misma** Wi-Fi, abrí `https://192.168.1.20:4173`.

Muchas redes de empresa, hospitales o invitados **aíslan a los dispositivos entre sí**; si el celular no llega a la PC, no es un error de la app: usá el cable.

Para la prueba sin conexión por Wi-Fi alcanza con frenar el `preview` o apagar el Wi-Fi del celular.

## 8. Problemas frecuentes

| Qué pasa | Causa probable | Qué hacer |
|---|---|---|
| Chrome muestra «Tu conexión no es privada» (`ERR_CERT_AUTHORITY_INVALID`) | El certificado de la CA no está instalado, o es otro `rootCA.pem` | Reinstalar `rootCA.pem` de **esta** PC (`mkcert -CAROOT`). No sirve «Continuar de todos modos»: con errores de certificado el service worker no se registra |
| `ERR_CONNECTION_REFUSED` en el celular | El `preview` está apagado, o se perdió el `adb reverse` | Revisar que el `preview` responda en la PC y repetir `adb reverse tcp:4173 tcp:4173` |
| `adb devices` no muestra el celular o dice `unauthorized` | Cable solo de carga, depuración USB apagada o cartel sin aceptar | Cambiar de cable, revisar 3.3 y aceptar el cartel; si hace falta, «Revocar autorizaciones de depuración USB» y reconectar |
| El login falla o vuelve a pedir sesión | Se entró por `http://` o por una IP que no está en el certificado | Entrar siempre por `https://localhost:4173` (o la IP incluida en el certificado) |
| «Descargar mapa» da error o dice que falta generarlo con `npm run mapa:generar` | No existe `apps/web/public/mapa/caba.pmtiles` al compilar | Correr `npm run mapa:generar`, volver a compilar y reiniciar el `preview` |
| Recargué sin conexión y la app no abre | El service worker no llegó a instalarse antes de cortar la red | Abrirla una vez con conexión, esperar unos segundos y recién ahí cortar |
| Se muestra una versión vieja de la app | El service worker sirve la versión anterior hasta que se actualice | Cerrar y abrir la app; si sigue, Ajustes del sitio › Borrar datos de `localhost` |
| El mapa dice que no hay WebGL | El celular o el navegador no lo soportan o lo tienen desactivado | Probar con otro Chrome actualizado; registrar el modelo |
| La pantalla no sigue el dedo en el mapa | Es el gesto cooperativo: un dedo desplaza la página | Usar dos dedos sobre el mapa |

## 9. Qué falta y qué no se sabe todavía

- **Es la primera vez que se corre en un Android real.** Si algún paso de esta guía no coincide con lo que se ve en el celular, corregir la guía en la misma tarea.
- **No se probó en Safari ni en iPhone.** Esta guía es solo de Android.
- **No se midió la memoria ni la batería** con el mapa abierto un rato largo.
- El mapa llega hasta el zoom 15: acercando más se agranda, no agrega calles ni números de puerta.
- Si el celular se queda sin espacio, Chrome puede borrar el mapa guardado. La app lo detecta y vuelve a ofrecer la descarga.
- Las pruebas contra `testing` y producción (los entornos reales) todavía no están configuradas: esta guía sirve solo para la PC de desarrollo.

## 10. Registro de la prueba

Completar una fila por celular:

| Fecha | Celular y Android | Versión de Chrome | Camino (USB / Wi-Fi) | Mapa en línea | Descarga | Sin señal (recarga) | Instalar como app | Observaciones |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
