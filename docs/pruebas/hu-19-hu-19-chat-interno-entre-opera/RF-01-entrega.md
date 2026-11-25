# HU-19 · RF-01 · Entrega — Chat interno entre operarios e ingenieros

- **Historia de Usuario:** HU-19 (`US-1795609150548`)
- **Requerimiento / Tarea:** RF-01 (`REQ-1795609195313`) — *Chat interno para operarios e ingenieros con mensajes, fotos y enlaces*
- **Desarrollador asignado:** `gonza` (`USR-1793292123166`)
- **Rama Git:** `feature/hu-19-hu-19-chat-interno-entre-opera/req-1795609195313-rf-01-chat-interno-para-operarios-e-inge`
- **Script de prueba automatizada:** [RF-01-entrega.sh](RF-01-entrega.sh)

---

## 1. ¿De qué se trata esta funcionalidad?

Permite que los técnicos que están en la calle (operarios RT) y los ingenieros responsables (Ingenieros Firmantes y Secretaría/Administración) tengan un medio de comunicación directo y en tiempo real dentro de la misma aplicación, sin tener que salir a WhatsApp u otras apps externas.

El chat tiene una estética moderna estilo WhatsApp y Linear, adaptada para celulares y computadoras:
1. **Salas de conversación:**
   - **Grupo General:** Una sala compartida donde todo el equipo técnico ve los avisos y consultas generales de la jornada.
   - **Chats 1 a 1:** Conversaciones directas y privadas con cada ingeniero o técnico individual.
2. **Envío de mensajes instantáneos:** Envío y recepción rápida de texto con actualización automática en pantalla sin recargar la página.
3. **Fotos y evidencias:** Se pueden sacar fotos o adjuntar imágenes directamente desde el celular o la computadora. Al hacer clic sobre cualquier imagen en la conversación, se abre en tamaño completo para ver números de serie, placas o fallas en detalle.
4. **Enlaces web clickeables:** Cualquier link a páginas web (`https://...` o `http://...`) se convierte en un botón interactivo que abre en una pestaña nueva con un solo toque.
5. **Etiqueta opcional de edificio o máquina:** Para que no haya confusiones, quien envía el mensaje puede asociar el edificio sobre el que está trabajando, quedando el nombre bien visible en la cabecera del mensaje.
6. **Seguridad y privacidad (RBAC):** Las empresas conservadoras externas (ECA) tienen bloqueado el acceso a este chat. Es un canal 100% interno y confidencial del equipo técnico y legal.

---

## 2. Cambios técnicos realizados

### Base de datos (PostgreSQL + PostGIS)
- **Migración `038_chat_mensajes`**:
  - Tabla `chat_mensajes`: Almacena el emisor, destinatario (null en salas globales), tipo de sala (`global` o `directo`), contenido de texto, URL o base64 de la foto adjunta, referencias al consorcio y máquina, y marcas de tiempo.
  - Índices optimizados para orden cronológico por sala y búsqueda por emisor/destinatario.
  - Reglas de Row Level Security (RLS) y permisos concedidos a `ascensores_app`.

### Backend (NestJS)
- **`apps/api/src/chat/`**:
  - `chat.types.ts`: Definición clara de modelos de datos (`MensajeChat`, `CanalChat`, `ContactoChat`, `CrearMensajeDto`).
  - `chat.repository.ts`: Repositorio abstracto con implementación PostgreSQL (`PgChatRepository`) e implementación para tests en memoria (`InMemoryChatRepository`).
  - `chat.service.ts`: Lógica de negocio para listar canales, filtrar mensajes por sala y emisor/destinatario, y guardar nuevos mensajes asociando los datos del usuario logueado.
  - `chat.controller.ts`: Endpoints bajo `/api/chat` protegidos por `@UseGuards(SesionGuard, RolesGuard)` y limitados a roles autorizados: `@Roles('rt_calle', 'firmante', 'administrador', 'secretaria')`.
- **Endpoints disponibles:**
  - `GET /api/chat/canales`: Devuelve la lista de canales disponibles (Grupo General y lista de contactos disponibles para chat directo con su último mensaje).
  - `GET /api/chat/mensajes?sala=global|directo&contactoId=UUID`: Trae el historial de mensajes ordenado por hora.
  - `POST /api/chat/mensajes`: Envía un nuevo mensaje con texto, foto opcional, enlace y etiqueta de edificio.

### Frontend (React + Vite PWA)
- **`apps/web/src/chat/`**:
  - `ChatOperativoView.tsx`: Pantalla completa de chat con barra lateral de canales, área de conversación con burbujas de mensaje diferenciadas (propios y recibidos), vista previa de fotos con zoom modal, selector de consorcio para etiquetar, y sondeo periódico automático cada 3,5 segundos.
  - `chat.css`: Estilos visuales con diseño fluido y responsivo en modo oscuro y claro.
- **`apps/web/src/App.tsx`**:
  - Pestaña `tab-chat` incorporada en la barra de navegación para operarios RT, ingenieros firmantes, secretaría y administradores.
  - Oculta y denegada explícitamente para el rol de conservadoras ECA.

---

## 3. Pruebas y verificación

### Pruebas unitarias de Backend (Jest)
Ubicadas en `apps/api/test/chat.spec.ts`:
- **8 de 8 pruebas aprobadas (100% pass):**
  1. Lista correctamente el canal global y los contactos directos.
  2. Guarda y devuelve mensajes de la sala global.
  3. Aísla correctamente los mensajes privados entre dos usuarios sin filtrarse a terceros.
  4. Valida y guarda fotos adjuntas y etiquetas de edificio.
  5. Formatea enlaces web interactivos.
  6. Rechaza mensajes vacíos sin contenido ni imagen.
  7. Ordena cronológicamente los mensajes más recientes al final.
  8. Respeta los permisos de rol de usuario.

### Script de prueba automatizada
El script `RF-01-entrega.sh` realiza la verificación completa de extremo a extremo:
```bash
bash docs/pruebas/hu-19-hu-19-chat-interno-entre-opera/RF-01-entrega.sh
```

Salida de la ejecución:
```
=== HU-19 · RF-01 · Verificación de Chat Interno ===
Objetivo: http://127.0.0.1:3050
  ✅ Criterio 1: Obtención de canales exitosa (incluye sala general y contactos individuales)
  ✅ Criterios 2 y 4: Envío de mensaje grupal con enlace web exitoso
  ✅ Criterios 3 y 5: Envío de mensaje con foto adjunta y etiqueta de edificio exitoso
  ✅ Criterio 6: Historial de mensajes consultado y actualizado en tiempo real
  ✅ Criterio 7: Acceso denegado con 403 a usuarios con rol conservadora (ECA)

=== Resumen de Verificación ===
Pruebas exitosas: 5
Pruebas fallidas: 0
RESULTADO: APROBADO ✅
```

---

## 4. Estado de cumplimiento de Criterios de Aceptación

| Criterio | Descripción sencilla | Estado |
|---|---|---|
| **1. Salas de chat** | Se puede alternar con un clic entre el Grupo General y chats individuales con cada compañero. | **Aprobado ✅** |
| **2. Mensajes instantáneos** | Se pueden escribir y enviar mensajes de texto que aparecen de inmediato en la conversación. | **Aprobado ✅** |
| **3. Envío y zoom de fotos** | Se pueden adjuntar fotos desde la cámara o archivo, y al tocarlas se agrandan para ver detalles técnicos. | **Aprobado ✅** |
| **4. Enlaces interactivos** | Cualquier dirección web escrita en el chat se puede cliquear directamente y abre la página web. | **Aprobado ✅** |
| **5. Etiqueta de edificio** | Quien escribe puede marcar fácilmente el edificio sobre el que está consultando. | **Aprobado ✅** |
| **6. Actualización automática** | Los nuevos mensajes llegan y se muestran automáticamente sin tener que apretar F5 ni recargar. | **Aprobado ✅** |
| **7. Privacidad frente a ECA** | Las empresas conservadoras externas no pueden ver ni entrar al chat interno bajo ningún concepto. | **Aprobado ✅** |

Desarrollado y certificado bajo la cuenta del desarrollador **gonza**.
