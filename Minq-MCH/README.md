# 🏠🤖 inquilinos-bot

> Bot de WhatsApp automático para notificaciones de inquilinos, integrado con Google Sheets.
>
> Hecho con ❤️ por **JaquiClau**

---

## ✨ Características

• 📅 Envío automático de mensajes de WhatsApp según fechas de reserva, entrada y salida.
• 🏷️ Plantillas personalizables por dirección.
• 🔒 Persistencia de sesión WhatsApp (no pide QR cada vez).
• 📊 Integración con Google Sheets (inquilinos, plantillas y log de envíos).
• 🐳 Corre en Docker, Fly.io, o local.
• ⏰ Ejecuta el ciclo de envíos todos los días a las **12:59** (hora de Madrid).
• 💊 Las PÍLDORAS se envían automáticamente los miércoles a las **13:00** (hora de Madrid).
• 🧑‍🤝‍🧑 Los mensajes RRHH se envían de lunes a viernes a las **13:00** siempre que existan mensajes en la plantilla.

---

## ⚙️ Requisitos

- Node.js 18+
- Google Service Account con acceso de editor al Sheet
- WhatsApp Web (whatsapp-web.js)
- Docker (opcional)

---

## 🚀 Instalación

1. Clona el repositorio y entra en la carpeta:
   ```sh
   git clone <repo-url>
   cd inqi
   ```
2. Instala dependencias:
   ```sh
   npm install whatsapp-web.js qrcode-terminal googleapis express qrcode dotenv
   ```
3. Crea el archivo de credenciales de Google (`service-account.json`) o usa la variable `GOOGLE_CREDS_JSON_B64`.
4. Configura el ID de tu Google Sheet en `index.js` (`const SPREADSHEET_ID`).
5. (Opcional) Configura variables de entorno:
   - `SESSION_PATH`: ruta para guardar la sesión de WhatsApp
   - `GOOGLE_CREDS_JSON_B64`: credenciales Google en base64
   - `CHROME_PATH`: ruta a Chromium si es necesario
   - `QR_TOKEN`: token para proteger el endpoint `/qr`

---

## 🖥️ Ejecución local

```sh
node index.js
```

- Abre [http://localhost:8081/qr](http://localhost:8081/qr) para escanear el QR la primera vez.
- El bot enviará mensajes automáticamente cada día a las **12:59** (hora de Madrid).

---

## 🐳 Docker

1. Construye la imagen:
   ```sh
   docker build -t inquilinos-bot .
   ```
2. Ejecuta el contenedor:
   ```sh
   docker run -p 8081:8081 -v $(pwd)/sessions-inquilinos:/app/sessions-inquilinos --env-file .env inquilinos-bot
   ```

---

## 🚁 Fly.io

- Usa el archivo `fly.toml` para desplegar y montar el volumen de sesión.
- Sube las credenciales y variables con `fly secrets set`.

---

## 📊 Google Sheets

- Hoja de inquilinos: `INQUILINOS NOTIFICACIONES`
- Plantillas: `TODAS LAS CASAS`
- Log: `LOG`

---

## 🎨 Personalización

- Modifica las plantillas en Google Sheets.
- Cambia el horario de envío ajustando la lógica al final de `tick` en `index.js`.

## Añadir nueva plantilla

   1. En el index.js.

   - Crear una constante 
      const SHEET_TEMPL_NOMBRE_DE_LA_PLANTILLA = 'NOMBRE_DE_LA_PLANTILLA';
   - En loadAllTemplates():
      # Al final de la lista de templates:
         loadTemplatesFor(SHEET_TEMPL_NOMBRE_DE_LA_PLANTILLA)
      # Al final de la declaración de constantes y en el return:
         nombreDeLaConstante

   2. En la hoja de cálculo

   - Crear una nueva hoja con nombre NOMBRE_DE_LA_PLANTILLA
   
---

## 📝 Notas

- Si no hay mensajes para enviar, el bot duerme hasta el siguiente ciclo.
- Si tienes problemas de cuota con Google Sheets, revisa la frecuencia de lectura.
- IMPORTANTE ! El telefono registrado : " 633 335 208 " MCH
---

<p align="center">
  Hecho con ❤️ por <b>JaquiClau</b> para automatizar la gestión de inquilinos.<br>
  🏠
</p>
