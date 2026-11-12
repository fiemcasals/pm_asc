/**
 * Aviso de uso de la ubicación del RT de Calle (Ley 25.326 de Protección de Datos Personales).
 * Los RT usan su celular personal (respuesta de MAICON a P2), así que la ubicación es un dato
 * personal: se informa para qué, cuándo se toma y quién la ve, y se pide aceptación expresa.
 *
 * Cambiar el texto obliga a cambiar la VERSIÓN: cada RT tiene que volver a aceptarlo.
 * Texto provisorio: MAICON tiene que revisarlo junto con sus textos legales (P13.a).
 */
export const VERSION_CONSENTIMIENTO_UBICACION = 'ubicacion-2026-11-v1';

export const TEXTO_CONSENTIMIENTO_UBICACION = {
  titulo: 'Uso de tu ubicación',
  parrafos: [
    'MAICON S.R.L. usa la ubicación de este celular sólo para dejar constancia de que estuviste en el edificio.',
    'Cuándo se toma: una sola vez, al tocar "Iniciar Inspección" o "No se pudo realizar la inspección". No hay seguimiento en segundo plano ni mientras recorrés la calle.',
    'Qué se guarda: las coordenadas, su precisión y la hora, junto con el registro de esa visita.',
    'Quién la ve: la Secretaría y el RT Firmante del edificio. No se usa para controlar tu recorrido ni tu horario.',
    'Podés pedir acceso, rectificación o supresión de tus datos a MAICON S.R.L. (Ley 25.326).',
  ],
};
