# WABOT-RRHH

Bot de WhatsApp para gestión de candidatos y procesos de RRHH.

## Estructura del proyecto
- `index.js`: Punto de entrada principal. Coordina los flujos y la integración con WhatsApp y Google Sheets.
- `mainFlow.js`: Lógica del flujo principal (mensajes 11–14, NF, 2NF, DES).
- `scheduledFlow.js`: Lógica de mensajes programados y respuestas automáticas (21, 22, 23, 24, 31, 33, 41).

## Requisitos
- Node.js >= 14
- Archivo `service-account.json` con credenciales de Google API
- Dependencias instaladas:
	- whatsapp-web.js
	- qrcode-terminal
	- qrcode
	- express
	- googleapis

Instala las dependencias con:
```powershell
npm install
```

## Uso
1. Configura el archivo `service-account.json` en la raíz del proyecto.
2. Ejecuta el bot:
	 ```powershell
	 node index.js
	 ```
3. Abre el navegador en `http://localhost:3000`(MBE)// `http://localhost:3003`(MCH) para escanear el QR y activar el bot.

## Personalización
- Modifica los flujos en `mainFlow.js` y `scheduledFlow.js` según tus necesidades.
- Cambia las plantillas de mensajes en la hoja de Google Sheets configurada.

## Notas
- El bot requiere acceso a internet para funcionar correctamente.
- Revisa la configuración de zona horaria y país en `index.js` si trabajas fuera de España.

---
Desarrollado por ATIC-MBE.
# 🚀 Proce-Bot

¡Hecho por Jose Luis y Alexandro ft ATICMBE! ✨

## 📋 Descripción
Este proyecto te permite enviar mensajes de WhatsApp de forma automatizada usando Node.js y Google Sheets. ¡Ideal para bots, envíos masivos y automatización! 💬📊

---

## 🛠️ Requisitos previos
- 🟢 Node.js instalado
- ☁️ Cuenta de Google Cloud y acceso a Google Sheets
- 🔑 Credenciales de servicio de Google (`service-account.json`)

---

## 📝 Pasos para usar el proyecto

### 1️⃣ Clona el repositorio
```bash
git clone https://github.com/ATIC-MBE/WABOT-RRHH.git
cd WABOT-RRHH
```

### 2️⃣ Instala las dependencias
```bash
npm install / npm i
```

### 3️⃣ Obtén tus credenciales de Google
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto y habilita la API de Google Sheets
3. Crea una cuenta de servicio y descarga el archivo `service-account.json`
4. Coloca el archivo `service-account.json` en la raíz del proyecto (¡no lo compartas ni subas a GitHub!)

### 4️⃣ Configura tus variables de entorno
Crea un archivo `.env` con tus variables necesarias (por ejemplo: credenciales de WhatsApp, IDs de hoja, etc.)

### 5️⃣ Ejecuta el bot


```bash
node index.js
```

---

## ⚠️ Notas importantes
- 🚫 **NO compartas tu archivo `service-account.json`**. Cada usuario debe generar el suyo.
- 🛡️ El archivo `.gitignore` ya está configurado para evitar subir archivos sensibles.
- 📄 Si quieres compartir la estructura de las credenciales, usa el archivo `service-account.example.json` (sin datos reales).

---

## 🤝 Compartir sesiones y archivos WA
¿Tu amiga quiere usar el bot y tener acceso a las sesiones y archivos WA?
1. Copia la carpeta `.wwebjs_auth` y compártela de forma privada (no la subas a GitHub).
2. Tu amiga debe colocar esa carpeta en la raíz del proyecto antes de ejecutar el bot.
3. Cada quien debe tener su propio `service-account.json`.

---

## 📁 Estructura recomendada
```
WABOT-RRHH/
├── index.js
├── package.json
├── package-lock.json
├── README.md
├── service-account.example.json
└── .wwebjs_auth/ (solo compartir por privado)
```

---

## 💌 Contacto
Para dudas o soporte, contacta a **ATICMBE**.

---

# 🚀 WABOT-RRHH (ENGLISH)
# 🚀 WABOT-RRHH (ENGLISH)

Made by Jose Luis y Alexandro ft ATICMBE! ✨

## 📋 Description
This project lets you send WhatsApp messages automatically using Node.js and Google Sheets. Perfect for bots, mass messaging, and automation! 💬📊

---

## 🛠️ Prerequisites
- 🟢 Node.js installed
- ☁️ Google Cloud account and access to Google Sheets
- 🔑 Google service credentials (`service-account.json`)

---

## 📝 How to use

### 1️⃣ Clone the repository
```bash
git clone https://github.com/ATIC-MBE/WABOT-RRHH
cd WABOT-RRHH

### 2️⃣ Install dependencies
```bash
npm install
```

### 3️⃣ Get your Google credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the Google Sheets API
3. Create a service account and download the `service-account.json` file
4. Place `service-account.json` in the project root (never share or upload it to GitHub!)

### 4️⃣ Set up your environment variables
Create a `.env` file with your required variables (e.g., WhatsApp credentials, sheet IDs, etc.)

### 5️⃣ Run the bot
```bash
node index.js
```

---

## ⚠️ Important notes
- 🚫 **DO NOT share your `service-account.json` file**. Each user must generate their own.
- 🛡️ The `.gitignore` file is already set up to avoid uploading sensitive files.
- 📄 To share the credential structure, use `service-account.example.json` (no real data).

---

## 🤝 Sharing sessions and WA files
If your friend wants to use the bot and access WA sessions/files:
1. Copy the `.wwebjs_auth` folder and share it privately (never upload to GitHub).
2. Your friend must place that folder in the project root before running the bot.
3. Everyone must have their own `service-account.json`.

---

## 📁 Recommended structure
```
WABOT-RRHH/
WABOT-RRHH/
├── index.js
├── package.json
├── package-lock.json
├── README.md
├── service-account.example.json
└── .wwebjs_auth/ (share privately only)
```

---

## 💌 Contact
For questions or support, contact **ATICMBE**.
For questions or support, contact **ATICMBE**.

---

<p align="center">✨ Ready to automate WhatsApp! ✨<br>Made by ATICMBE</p>

<p align="center">✨ Ready to automate WhatsApp! ✨<br>Made by ATICMBE</p>

