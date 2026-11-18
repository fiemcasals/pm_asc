# Aviso de uso de la ubicación del RT — para revisión de MAICON

**Fecha:** 18/11/2026
**Versión del texto:** `ubicacion-2026-11-v1` (provisoria, redactada por el equipo de desarrollo)

> Esto **no es asesoramiento legal**. Es el texto que hoy ve el RT, lo que el sistema hace con la ubicación y los puntos que detectamos para que MAICON, o su abogado, los revise antes de usar el sistema en serio.

## Por qué hay que revisarlo

Los RT usan su **celular personal** (respuesta de MAICON a P2), así que su ubicación es un **dato personal** y la Ley 25.326 de Protección de Datos Personales exige informarles para qué se usa, cuándo se toma y quién la ve.

Cómo funciona en la app: la primera vez que un RT ingresa, la app le muestra este texto y **no lo deja seguir hasta que toca «Acepto»**. Queda guardado quién lo aceptó, qué versión y cuándo. Si el texto cambia, cambia la versión y **todos los RT vuelven a aceptarlo**.

## El texto que ve hoy el RT (literal)

> **Uso de tu ubicación**
>
> MAICON S.R.L. usa la ubicación de este celular sólo para dejar constancia de que estuviste en el edificio.
>
> Cuándo se toma: una sola vez, al tocar "Iniciar Inspección" o "No se pudo realizar la inspección". No hay seguimiento en segundo plano ni mientras recorrés la calle.
>
> Qué se guarda: las coordenadas, su precisión y la hora, junto con el registro de esa visita.
>
> Quién la ve: la Secretaría y el RT Firmante del edificio. No se usa para controlar tu recorrido ni tu horario.
>
> Podés pedir acceso, rectificación o supresión de tus datos a MAICON S.R.L. (Ley 25.326).

## Qué hace el sistema con la ubicación (verificado en el código)

- **Cuándo se toma:** una sola vez por acción —al tocar «Iniciar Inspección» o «No se pudo realizar la inspección»—, sin seguimiento. Coincide con el texto.
- **Qué se guarda:** coordenadas, precisión y hora, junto con el registro de esa visita (el inicio de la inspección o la visita fallida). Coincide con el texto.
- **Cuánto tiempo:** hoy **no se borran nunca**. No hay un plazo de conservación definido.
- **Quién la recibe — esto NO coincide con el texto:** en la **notificación formal de visita fallida que recibe la administración del consorcio** figuran las **coordenadas GPS del RT (con 6 decimales)**, el nombre del inspector y la foto del frente del edificio. El aviso que acepta el RT dice que sólo la ven la Secretaría y el Firmante.

## Puntos para revisar

| # | Punto | Hoy | Propuesta o pregunta |
|---|---|---|---|
| 1 | **Coordenadas en el mail a la administración** | Salen en el mail y el aviso no lo dice. | **A)** Dejarlas (sirven como constancia fehaciente de la visita) y agregarlo al aviso. **B)** Sacarlas del mail y dejar sólo la foto del frente. Hay que elegir una: hoy el RT acepta algo distinto de lo que pasa. |
| 2 | **Responsable y contacto** | El texto dice «pedir a MAICON S.R.L.» sin un canal. | Agregar razón social, domicilio y un correo de contacto para ejercer los derechos. |
| 3 | **Plazo de conservación** | No se borra. | Definir por cuánto tiempo se guardan las coordenadas (a decidir por MAICON y su abogado). |
| 4 | **Finalidad** | «Dejar constancia de que estuviste en el edificio». | ¿Alcanza o se usará para algo más (liquidaciones, reclamos, auditorías)? Si hay otros usos, tienen que estar en el texto. |
| 5 | **Base legal** | El RT acepta con un botón. | Que el abogado confirme si alcanza el consentimiento del RT o si además debe constar en su contrato o en una política interna. |
| 6 | **Derechos de acceso, rectificación y supresión** | El texto los menciona sin canal ni plazo. | Definir quién responde, por qué medio y en qué plazo (la ley fija plazos). |
| 7 | **Registro de la base de datos** | No lo sabemos. | Confirmar si MAICON debe registrar esta base ante la autoridad de protección de datos y si ya lo hizo. |

## Borrador de texto si se elige la opción A del punto 1

Sólo es un borrador para que lo revisen; **no está en el sistema**. Entre corchetes, lo que tiene que completar MAICON.

> **Uso de tu ubicación**
>
> [Razón social, CUIT y domicilio de MAICON S.R.L.] usa la ubicación de este celular sólo para dejar constancia de que estuviste en el edificio.
>
> Cuándo se toma: una sola vez, al tocar "Iniciar Inspección" o "No se pudo realizar la inspección". No hay seguimiento en segundo plano ni mientras recorrés la calle.
>
> Qué se guarda: las coordenadas, su precisión y la hora, junto con el registro de esa visita. Se conservan [plazo].
>
> Quién la ve: la Secretaría y el RT Firmante del edificio. **Si la visita no se pudo realizar, las coordenadas también figuran en la notificación que se envía a la administración del consorcio.** No se usa para controlar tu recorrido ni tu horario.
>
> Podés pedir acceso, rectificación o supresión de tus datos escribiendo a [correo de contacto]. Respondemos en [plazo] (Ley 25.326).

## Cómo responder

Igual que el resto de las definiciones: **«Acepto»** si el texto actual les sirve, o **«Cambio — …»** con lo que quieren. Con la respuesta, el equipo publica la nueva versión del texto (`ubicacion-2026-11-v2`) y, si en el punto 1 se elige sacar las coordenadas del mail, se hace ese cambio en el sistema.
