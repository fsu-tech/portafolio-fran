const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const chalk = require('chalk');

// Estado en memoria: última imagen enviada por usuario (clave: número E164)
const ultimaImagenPildoraPorUsuario = {};

// Logs en memoria
let sentLogPildorasSet = null;
let sentLogPildorasEverSet = null;

// Horarios y configuración
const HORA_ENVIO_INQUILINOS = { hour: 17, minute: 8 };
const DIA_PILDORAS = 5; // 0=domingo, 5=viernes
const HORA_ENVIO_PILDORAS = { ...HORA_ENVIO_INQUILINOS };

// Imágenes disponibles
const IMAGENES_PILDORAS = [
  'semana1.png',
  'semana2.png',
  'semana3.png',
  'semana4.png',
  'semana5.png',
  'semana6.png'
];

// ========================
// FUNCIONES PRINCIPALES
// ========================

// Cargar log de PILDORAS una vez y consultar duplicados en memoria
async function loadSentLogPildoras() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `LOG_PILDORAS!A1:D10000`
  });
  const rows = res.data.values || [];
  const set = new Set();
  const setEver = new Set();

  for (const r of rows.slice(1)) {
    const num = (r[1] || '').toString().trim();
    const rawCode = (r[2] || '').toString().trim();
    const code = rawCode.toUpperCase();
    const fecha = (r[0] || '').slice(0, 10);

    if (num && code && fecha) {
      set.add(`${num}|${code}|${fecha}`);
    }
    if (num && code) {
      setEver.add(`${num}|${code}`);
    }
  }

  sentLogPildorasSet = set;
  sentLogPildorasEverSet = setEver;
}

// Verificar si ya se envió hoy
function alreadySentPildoraToday(number, code) {
  if (!sentLogPildorasSet) return false;
  const num = (number || '').toString().trim();
  const codeNorm = (code || '').toString().trim().toUpperCase();
  const hoy = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fecha = fmt.format(hoy);
  return sentLogPildorasSet.has(`${num}|${codeNorm}|${fecha}`);
}

// Verificar si se envió alguna vez
function alreadySentPildoraEver(number, code) {
  if (!sentLogPildorasEverSet) return false;
  const num = (number || '').toString().trim();
  const codeNorm = (code || '').toString().trim().toUpperCase();
  return sentLogPildorasEverSet.has(`${num}|${codeNorm}`);
}

// Devuelve número de semana desde entry_date
function getSemanaPildora(entry, today) {
  if (!entry || !today) return 1;
  const diff = daysBetween(today, entry);
  if (diff < 0) return 1;

  const semana = Math.floor(diff / 7) + 1;
  if (semana <= 6) return semana;

  // Para semana >6, elegir aleatorio entre 7 y 8
  const maxExtra = 8;
  const aleatoria = 7 + Math.floor(Math.random() * (maxExtra - 6));
  console.log(`[PILDORAS] Semana > 6: semana${semana} → semana${aleatoria}`);
  return aleatoria;
}

// Devuelve imagen según semana
function getPildoraImage(semana, ultimaImagen) {
  if (semana >= 1 && semana <= 6) {
    return IMAGENES_PILDORAS[semana - 1];
  }
  const opciones = IMAGENES_PILDORAS.filter(img => img !== ultimaImagen);
  return opciones[Math.floor(Math.random() * opciones.length)];
}

// Determina si hoy es día de pildoras
function esDiaPildoras(fechaUTC) {
  return fechaUTC.getUTCDay() === DIA_PILDORAS;
}

// ========================
// ENVÍO Y LOG
// ========================

async function sendPildoraAndLog(client, jid, semana, number, row, templates) {
  const set = templates && templates.pildoras ? templates.pildoras : {};
  const code = `SEMANA${semana}`;

  // Chequear duplicados antes de enviar
  if (alreadySentPildoraToday(number, code)) {
    console.log(`⚠️ Ya se envió ${code} a ${number} hoy, se omite.`);
    return;
  }

  // Selección de imagen
  let img = set[code] ? set[code].trim() : null;
  if (!img) {
    const ultima = ultimaImagenPildoraPorUsuario[number] || null;
    img = getPildoraImage(semana, ultima);
  }
  ultimaImagenPildoraPorUsuario[number] = img;

  const imgPath = path.join(__dirname, 'images', img);
  let media;

  try {
    media = await MessageMedia.fromFilePath(imgPath);
  } catch (e) {
    console.error(`❌ Error cargando imagen ${imgPath}:`, e.message);
    return;
  }

  try {
    await client.sendMessage(jid, media);
    console.log(`📸 Enviada imagen ${img} a ${number}`);
    await appendLogPildoras(number, code, 'SENT');

    // Actualizar sets en memoria para evitar reenvíos
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const fecha = fmt.format(new Date());
    sentLogPildorasSet.add(`${number}|${code}|${fecha}`);
    sentLogPildorasEverSet.add(`${number}|${code}`);

  } catch (err) {
    console.error(`❌ Error enviando imagen a ${number}:`, err.message);
    await appendLogPildoras(number, code, `ERROR: ${err.message}`);
  }
}

// Log en Google Sheets
async function appendLogPildoras(number, code, status) {
  const sheets = getSheetsClient();
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const [datePart, timePart] = fmt.format(now).replace(',', '').split(' ');
  const ts = `${datePart} ${timePart}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `LOG_PILDORAS!A:D`,
    valueInputOption: 'RAW',
    requestBody: { values: [[ts, number, code, status]] }
  });
}



// ==== DIAGNÓSTICO INICIAL ====
console.log('--- DIAGNÓSTICO DE ARRANQUE ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SESSION_PATH:', process.env.SESSION_PATH);
console.log('GOOGLE_CREDS_JSON_B64:', !!process.env.GOOGLE_CREDS_JSON_B64);
console.log('CHROME_PATH:', process.env.CHROME_PATH);
try {
  const fs = require('fs');
  const path = process.env.SESSION_PATH || './sessions-inquilinos';
  fs.accessSync(path, fs.constants.W_OK);
  console.log('Session path is writable:', path);
} catch (e) {
  console.error('Session path is NOT writable:', e.message);
}
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err);
});
console.log('--- FIN DIAGNÓSTICO DE ARRANQUE ---');

const express = require('express');
const QRCode = require('qrcode');
const app = express();
let lastQRDataUrl = null;
const PORT = process.env.PORT || 8080;

app.get('/health', (_req, res) => res.send('ok'));
app.get('/qr', (req, res) => {
  const t = process.env.QR_TOKEN;
  if (t && req.query.t !== t) return res.status(401).send('unauthorized');
  if (!lastQRDataUrl) return res.status(404).send('QR not ready');
  res.type('html').send(`<img alt="Scan me" src="${lastQRDataUrl}" style="width:320px">`);
});
app.listen(PORT, '0.0.0.0', () => console.log('HTTP up on :' + PORT));
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const fs = require('fs');

/* ================== CONFIGURACIÓN ================== */

// Cambia por el ID de tu Google Sheet
const SPREADSHEET_ID = '1NMFeDN2moKgutCQkpFyOZD9Z01otN6qNX7OoNKi4YSY' ; // '1NMFeDN2moKgutCQkpFyOZD9Z01otN6qNX7OoNKi4YSY'; 
const SHEET_LOG = 'LOG';
const SHEET_TENANTS = 'INQUILINOS NOTIFICACIONES';
// Nombres de hojas (ajústalos a tus pestañas reales)
const SHEET_TEMPL_C43           = 'CASITA43';
const SHEET_TEMPL_H2            = 'HOYO2';
const SHEET_TEMPL_RRHH          = 'RRHH';
const SHEET_TEMPL_ARAVACA1      = 'ARAVACA1';
const SHEET_TEMPL_AZCA11        = 'AZCA11';
const SHEET_TEMPL_BARRILERO3    = 'BARRILERO3';
const SHEET_TEMPL_GA11          = 'GA11';
const SHEET_TEMPL_GA14          = 'GA14';
const SHEET_TEMPL_HABANA1       = 'HABANA1';
const SHEET_TEMPL_MONCLOA       = 'MONCLOA';
const SHEET_TEMPL_NOVICIADO3    = 'NOVICIADO3';
const SHEET_TEMPL_PALMA1        = 'PALMA1';
const SHEET_TEMPL_PH2           = 'PH2';
const SHEET_TEMPL_PH3           = 'PH3';
const SHEET_TEMPL_RETIRO7       = 'RETIRO7';
const SHEET_TEMPL_RS4           = 'RS4';
const SHEET_TEMPL_SERRANO1      = 'SERRANO1';
const SHEET_TEMPL_SERRANO2      = 'SERRANO2';
const SHEET_TEMPL_SOL6          = 'SOL6';
const SHEET_TEMPL_SOL7          = 'SOL7';
const SHEET_TEMPL_ARAVACA1_LE   = 'ARAVACA1-LE';
const SHEET_TEMPL_AZCA6_LE      = 'AZCA6-LE';
const SHEET_TEMPL_AZCA7_LE      = 'AZCA7-LE';
const SHEET_TEMPL_AZCA11_LE     = 'AZCA11-LE';
const SHEET_TEMPL_BARRILERO3_LE = 'BARRILERO3-LE';
const SHEET_TEMPL_CASITA43_LE   = 'CASITA43-LE';
const SHEET_TEMPL_HOYO2_LE      = 'HOYO2-LE';
const SHEET_TEMPL_GA11_LE       = 'GA11-LE';
const SHEET_TEMPL_GA14_LE       = 'GA14-LE';
const SHEET_TEMPL_HABANA1_LE    = 'HABANA1-LE';
const SHEET_TEMPL_MONCLOA_LE    = 'MONCLOA-LE';
const SHEET_TEMPL_NOVICIADO3_LE = 'NOVICIADO3-LE';
const SHEET_TEMPL_PALMA1_LE     = 'PALMA1-LE';
const SHEET_TEMPL_PH2_LE        = 'PH2-LE';
const SHEET_TEMPL_PH3_LE        = 'PH3-LE';
const SHEET_TEMPL_RETIRO7_LE    = 'RETIRO7-LE';
const SHEET_TEMPL_RS4_LE        = 'RS4-LE';
const SHEET_TEMPL_SERRANO1_LE   = 'SERRANO1-LE';
const SHEET_TEMPL_SERRANO2_LE   = 'SERRANO2-LE';
const SHEET_TEMPL_SOL6_LE       = 'SOL6-LE';
const SHEET_TEMPL_SOL7_LE       = 'SOL7-LE';


// WhatsApp y loop
const DEFAULT_CC      = '34';              // prefijo por defecto (España)
const DRY_RUN         = false;             // true = no envía, sólo escribe en LOG
const LOOP_EVERY_MS   = 60 * 1000;         // revisa cada minuto
const SEND_DELAY_MS   = 600;               // pausa entre envíos para no saturar
const TZ              = 'Europe/Madrid';   // zona horaria para cálculo de "hoy"

// Columnas (1-based) conforme a tu hoja INQUILINOS_BOT
const COL = {
  name: 1,        // A
  number: 2,      // B
  entry: 3,       // C (entry_date)
  exit: 4,        // D (exit_date)
  reservation: 5, // E (reservation_date)
  active: 6,      // F (reminder_activated) -> TRUE = activa
  address: 7      // G (address)
};

/* ================== HELPERS GENERALES ================== */

function getSheetsClient() {
  let raw = process.env.GOOGLE_CREDS_JSON || process.env.GOOGLE_CREDS_JSON_B64 || fs.readFileSync('service-account.json','utf8');
  if (process.env.GOOGLE_CREDS_JSON_B64) {
    raw = Buffer.from(process.env.GOOGLE_CREDS_JSON_B64, 'base64').toString('utf8');
  }
  const creds = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

function onlyDigits(s) { return (s || '').replace(/\D+/g, ''); }

function normalizePhoneE164(input) {
  if (!input) return '';
  let s = input.replace(/\s+/g, '');
  s = s.replace(/[^\d+]/g, '');
  // Si ya empieza por + y tiene al menos 8 dígitos, lo dejamos
  if (/^\+\d{8,}$/.test(s)) return s;
  // Si empieza por 00, lo convertimos a +
  if (/^00\d{8,}$/.test(s)) return `+${s.slice(2)}`;
  // Si tiene 9 dígitos (España), anteponemos +34
  if (/^\d{9}$/.test(s)) return `+${DEFAULT_CC}${s}`;
  // Si tiene 10 o más dígitos, asumimos que ya es internacional sin +
  if (/^\d{10,}$/.test(s)) return `+${s}`;
  // Si nada coincide, devolvemos vacío
  return '';
}

function toWhatsAppJid(e164) {
  const digits = onlyDigits(e164);
  return `${digits}@c.us`;
}

function firstName(full) {
  if (!full) return '';
  return String(full).trim().split(/\s+/)[0];
}

function replaceTemplateVars(message, row) {
  const exitDateFormatted = row.exit ? 
    `${row.exit.getUTCDate().toString().padStart(2,'0')}/${(row.exit.getUTCMonth()+1).toString().padStart(2,'0')}/${row.exit.getUTCFullYear()}` : 
    '';

  return message
    .replace(/\{\{name\}\}/g, firstName(row.name))
    .replace(/\{\{exit_date\}\}/g, exitDateFormatted);
}

function parseDateES(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const m = String(ddmmyyyy).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d)); // normalizamos a UTC (dia puro)
  return isNaN(dt) ? null : dt;
}

function todayInTZ() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const [y, mo, d] = fmt.format(now).split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)); // 00:00 TZ convertido a UTC
}

function daysBetween(aUTC, bUTC) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((aUTC - bUTC) / MS); // días enteros
}

function getTimePartsInTZ(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const out = { hour: 0, minute: 0, second: 0 };
  for (const p of parts) {
    if (p.type === 'hour') out.hour = Number(p.value);
    else if (p.type === 'minute') out.minute = Number(p.value);
    else if (p.type === 'second') out.second = Number(p.value);
  }
  return out;
}

function isAtOrAfterHourTZ(hour, minute = 0, referenceDate = new Date()) {
  const { hour: h, minute: m } = getTimePartsInTZ(referenceDate);
  if (h > hour) return true;
  if (h === hour && m >= minute) return true;
  return false;
}

/* ================== PLANTILLAS ================== */

async function loadTemplatesFor(sheetName) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:D999`
  });
  const rows = res.data.values || [];
  if (!rows.length) return {};

  // Soporta dos pares de columnas: A/B y C/D
  const map = {};
  let start = 1;
  // Si la primera fila tiene cabecera, sáltala
  const header = rows[0].map(x => (x || '').toString().trim().toLowerCase());
  if (
    (header[0] && header[0].includes('code')) ||
    (header[1] && header[1].includes('message')) ||
    (header[2] && header[2].includes('code')) ||
    (header[3] && header[3].includes('message'))
  ) {
    start = 1;
  } else {
    start = 0;
  }
  for (const r of rows.slice(start)) {
    // A/B
    const code1 = (r[0] || '').toString().trim();
    const msg1  = (r[1] || '').toString();
    if (code1) map[code1] = msg1;
    // C/D
    const code2 = (r[2] || '').toString().trim();
    const msg2  = (r[3] || '').toString();
    if (code2) map[code2] = msg2;
  }
  return map;
}

async function loadAllTemplates() {
  const [
    c43, h2, rrhh, aravaca1, azca11, barrilero3, ga11, ga14, habana1, moncloa, noviciado3, palma1, ph2, ph3, retiro7, rs4, serrano1, serrano2, sol6, sol7,
    azca6_le, azca7_le, azca11_le, aravaca1_le, barrilero3_le, casita43_le, ga11_le, ga14_le, habana1_le, hoyo2_le, moncloa_le, noviciado3_le, palma1_le, ph2_le, ph3_le, retiro7_le, rs4_le, serrano1_le, serrano2_le, sol6_le, sol7_le
  ] = await Promise.all([
    loadTemplatesFor(SHEET_TEMPL_C43),
    loadTemplatesFor(SHEET_TEMPL_H2),
    loadTemplatesFor(SHEET_TEMPL_RRHH),
    loadTemplatesFor(SHEET_TEMPL_ARAVACA1),
    loadTemplatesFor(SHEET_TEMPL_AZCA11),
    loadTemplatesFor(SHEET_TEMPL_BARRILERO3),
    loadTemplatesFor(SHEET_TEMPL_GA11),
    loadTemplatesFor(SHEET_TEMPL_GA14),
    loadTemplatesFor(SHEET_TEMPL_HABANA1),
    loadTemplatesFor(SHEET_TEMPL_MONCLOA),
    loadTemplatesFor(SHEET_TEMPL_NOVICIADO3),
    loadTemplatesFor(SHEET_TEMPL_PALMA1),
    loadTemplatesFor(SHEET_TEMPL_PH2),
    loadTemplatesFor(SHEET_TEMPL_PH3),
    loadTemplatesFor(SHEET_TEMPL_RETIRO7),
    loadTemplatesFor(SHEET_TEMPL_RS4),
    loadTemplatesFor(SHEET_TEMPL_SERRANO1),
    loadTemplatesFor(SHEET_TEMPL_SERRANO2),
    loadTemplatesFor(SHEET_TEMPL_SOL6),
    loadTemplatesFor(SHEET_TEMPL_SOL7),
    loadTemplatesFor(SHEET_TEMPL_AZCA6_LE),
    loadTemplatesFor(SHEET_TEMPL_AZCA7_LE),
    loadTemplatesFor(SHEET_TEMPL_AZCA11_LE),
    loadTemplatesFor(SHEET_TEMPL_ARAVACA1_LE),
    loadTemplatesFor(SHEET_TEMPL_BARRILERO3_LE),
    loadTemplatesFor(SHEET_TEMPL_CASITA43_LE),
    loadTemplatesFor(SHEET_TEMPL_GA11_LE),
    loadTemplatesFor(SHEET_TEMPL_GA14_LE),
    loadTemplatesFor(SHEET_TEMPL_HABANA1_LE),
    loadTemplatesFor(SHEET_TEMPL_HOYO2_LE),
    loadTemplatesFor(SHEET_TEMPL_MONCLOA_LE),
    loadTemplatesFor(SHEET_TEMPL_NOVICIADO3_LE),
    loadTemplatesFor(SHEET_TEMPL_PALMA1_LE),
    loadTemplatesFor(SHEET_TEMPL_PH2_LE),
    loadTemplatesFor(SHEET_TEMPL_PH3_LE),
    loadTemplatesFor(SHEET_TEMPL_RETIRO7_LE),
    loadTemplatesFor(SHEET_TEMPL_RS4_LE),
    loadTemplatesFor(SHEET_TEMPL_SERRANO1_LE),
    loadTemplatesFor(SHEET_TEMPL_SERRANO2_LE),
    loadTemplatesFor(SHEET_TEMPL_SOL6_LE),
    loadTemplatesFor(SHEET_TEMPL_SOL7_LE)
  ]);
  return {
    c43, h2, rrhh, aravaca1, azca11, barrilero3, ga11, ga14, habana1, moncloa, noviciado3, palma1, ph2, ph3, retiro7, rs4, serrano1, serrano2, sol6, sol7,
    azca6_le, azca7_le, azca11_le, aravaca1_le, barrilero3_le, casita43_le, ga11_le, ga14_le, habana1_le, hoyo2_le, moncloa_le, noviciado3_le, palma1_le, ph2_le, ph3_le, retiro7_le, rs4_le, serrano1_le, serrano2_le, sol6_le, sol7_le
  };
}

/* ================== INQUILINOS ================== */

async function fetchTenants() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TENANTS}!A1:Z10000`
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const data = [];
  for (const r of rows.slice(1)) {
    data.push({
      name:     (r[COL.name-1] || '').toString().trim(),
      number:   (r[COL.number-1] || '').toString().trim(),
      entry:    parseDateES(r[COL.entry-1]),
      exit:     parseDateES(r[COL.exit-1]),
      reserve:  parseDateES(r[COL.reservation-1]),
      // ENVÍA SOLO CUANDO reminder_activated = TRUE (case-insensitive)
      active:   ((r[COL.active-1] || '').toString().trim().toUpperCase() === 'TRUE'),
      address:  (r[COL.address-1] || '').toString().trim()
    });
  }
  return data;
}

/* ================== LOG ================== */

async function ensureLogSheet() {
  const sheets = getSheetsClient();
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_LOG}!A1:D1`
    });
  } catch {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_LOG}!A1:D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['timestamp','number','code','status']] }
    });
  }
}

async function appendLog(number, code, status) {
  const sheets = getSheetsClient();
  // Formato: YYYY-MM-DD HH:mm:ss (Europe/Madrid)
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  // El formato puede variar según el entorno, así que lo normalizamos:
  const [datePart, timePart] = fmt.format(now).replace(',', '').split(' ');
  const ts = `${datePart} ${timePart}`; // Ejemplo: "2025-09-02 14:35:12"

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_LOG}!A:D`,
    valueInputOption: 'RAW',
    requestBody: { values: [[ts, number, code, status]] }
  });
}

// Carga el log completo una vez y consulta en memoria
let sentLogSet = null;
async function loadSentLog() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_LOG}!A1:D2000`
  });
  const rows = res.data.values || [];
  // Usamos un Set para búsquedas rápidas: clave = number|code
  const set = new Set();
  for (const r of rows.slice(1)) {
    const num = r[1] || '';
    const c = r[2] || '';
    set.add(`${num}|${c}`);
  }
  sentLogSet = set;
}

function alreadySentEver(number, code) {
  if (!sentLogSet) return false;
  return sentLogSet.has(`${number}|${code}`);
}
/* ================== LÓGICA DE CÓDIGOS ================== */

function pickTemplateSet(templates, address) {
  const addr = (address || '').toUpperCase().replace(/\s+/g, '');

  // Mapeo de dirección a clave de plantilla
  if (addr.includes('RRHH')) return templates.rrhh || {};
  if (addr.includes('CASITA43')) return templates.c43 || {};
  if (addr.includes('HOYO2')) return templates.h2 || {};
  if (addr.includes('ARAVACA1')) return templates.aravaca1 || {};
  if (addr.includes('AZCA11')) return templates.azca11 || {};
  if (addr.includes('BARRILERO3')) return templates.barrilero3 || {};
  if (addr.includes('GA11')) return templates.ga11 || {};
  if (addr.includes('GA14')) return templates.ga14 || {};
  if (addr.includes('HABANA1')) return templates.habana1 || {};
  if (addr.includes('MONCLOA')) return templates.moncloa || {};
  if (addr.includes('NOVICIADO3')) return templates.noviciado3 || {};
  if (addr.includes('PALMA1')) return templates.palma1 || {};
  if (addr.includes('PH2')) return templates.ph2 || {};
  if (addr.includes('PH3')) return templates.ph3 || {};
  if (addr.includes('RETIRO7')) return templates.retiro7 || {};
  if (addr.includes('RS4')) return templates.rs4 || {};
  if (addr.includes('SERRANO1')) return templates.serrano1 || {};
  if (addr.includes('SERRANO2')) return templates.serrano2 || {};
  if (addr.includes('SOL6')) return templates.sol6 || {};
  if (addr.includes('SOL7')) return templates.sol7 || {};

  // Larga estancia (termina en -LE)
  if (/\-LE$/.test(addr)) {
    // Puedes mapear aquí las plantillas de larga estancia si tienes varias
    if (addr.includes('ARAVACA1-LE')) return templates.aravaca1_le || {};
    if (addr.includes('AZCA6-LE')) return templates.azca6_le || {};
    if (addr.includes('AZCA7-LE')) return templates.azca7_le || {};
    if (addr.includes('AZCA11-LE')) return templates.azca11_le || {};
    if (addr.includes('BARRILERO3-LE')) return templates.barrilero3_le || {};
    if (addr.includes('CASITA43-LE')) return templates.casita43_le || {};
    if (addr.includes('HOYO2-LE')) return templates.hoyo2_le || {};
    if (addr.includes('GA11-LE')) return templates.ga11_le || {};
    if (addr.includes('GA14-LE')) return templates.ga14_le || {};
    if (addr.includes('HABANA1-LE')) return templates.habana1_le || {};
    if (addr.includes('MONCLOA-LE')) return templates.moncloa_le || {};
    if (addr.includes('NOVICIADO3-LE')) return templates.noviciado3_le || {};
    if (addr.includes('PALMA1-LE')) return templates.palma1_le || {};
    if (addr.includes('PH2-LE')) return templates.ph2_le || {};
    if (addr.includes('PH3-LE')) return templates.ph3_le || {};
    if (addr.includes('RETIRO7-LE')) return templates.retiro7_le || {};
    if (addr.includes('RS4-LE')) return templates.rs4_le || {};
    if (addr.includes('SERRANO1-LE')) return templates.serrano1_le || {};
    if (addr.includes('SERRANO2-LE')) return templates.serrano2_le || {};
    if (addr.includes('SOL6-LE')) return templates.sol6_le || {};
    if (addr.includes('SOL7-LE')) return templates.sol7_le || {};
    // Si no coincide, puedes devolver una plantilla general de larga estancia
    return templates.larga || {};
  }

  // Si no coincide nada, devuelve plantilla por defecto (por ejemplo, Madrid)
  return templates.mad || {};
}

function codeForToday(row, templates) {
  // Reglas:
  // - No hace nada antes de reservation_date
  // - Día de entrada -> E-00
  // - Antes de entrada -> E-XX (XX = días que faltan)
  // - Entre entrada y salida -> E+XX
  // - Dos días antes de salida -> S-02, luego S-01
  // - Día de salida -> S-00
  // - Después de salida -> S+XX
  if (!row.entry || !row.exit || !row.reserve) {
    console.log('[LOG codeForToday] Faltan fechas en row:', row);
    return null;
  }

  const today = todayInTZ();
  if (today < row.reserve) {
    console.log(`[LOG codeForToday] Hoy (${today.toISOString().slice(0,10)}) < reserva (${row.reserve.toISOString().slice(0,10)}), no se envía.`);
    return null;
  }

  const dToEntry = daysBetween(today, row.entry);
  const dToExit  = daysBetween(today, row.exit);

  // LOG para depuración
  console.log(`[LOG codeForToday] number: ${row.number}, name: ${row.name}, today: ${today.toISOString().slice(0,10)}, reserva: ${row.reserve ? row.reserve.toISOString().slice(0,10) : 'N/A'}, entrada: ${row.entry ? row.entry.toISOString().slice(0,10) : 'N/A'}, salida: ${row.exit ? row.exit.toISOString().slice(0,10) : 'N/A'}, dToEntry: ${dToEntry}, dToExit: ${dToExit}, address: ${row.address}`);

  let code = null;

  // Desde 30 días antes de entrada hasta entrada (incluida): E-XX
  if (today >= row.reserve && today <= row.entry) {
    const dToEntryAbs = daysBetween(row.entry, today); // días hasta entrada desde hoy
    if (dToEntryAbs >= 0 && dToEntryAbs <= 30) {
      code = `E-${String(dToEntryAbs).padStart(2,'0')}`;
      // Aquí deberías comprobar si ya se envió hoy y enviar el mensaje correspondiente
      // Esto ya lo hace el ciclo principal, solo asegúrate que no se salte el envío
    }
  }
  // Desde 30 días antes de salida hasta salida: S-XX/S-00
  else if (today <= row.exit && today >= new Date(row.exit.getTime() - 30*24*60*60*1000)) {
    const dToExitAbs = daysBetween(row.exit, today);
    if (dToExitAbs === 0) {
      code = 'S-00';
    } else if (dToExitAbs > 0 && dToExitAbs <= 30) {
      code = `S-${String(dToExitAbs).padStart(2,'0')}`;
    }
  }
  // Hasta 30 días después de la salida: S+XX
  else if (today > row.exit && daysBetween(today, row.exit) <= 30) {
    const dAfterExit = daysBetween(today, row.exit);
    code = `S+${String(dAfterExit).padStart(2,'0')}`;
  }

  // Mostrar todos los códigos posibles en la plantilla
  const set = pickTemplateSet(templates, row.address);
  const availableCodes = Object.keys(set).map(k => k.trim().toUpperCase());
  const codeNorm = code ? code.trim().toUpperCase() : '';
  console.log(`[DEBUG] Códigos disponibles en plantilla: ${availableCodes.join(', ')}`);
  console.log(`[DEBUG] Código calculado para hoy: ${codeNorm}`);

  // Buscar el código normalizado
  let msg = null;
  for (const k of Object.keys(set)) {
    if (k && k.trim().toUpperCase() === codeNorm) {
      msg = set[k];
      break;
    }
  }
  if (!msg) {
    console.log(`[DEBUG] No se encontró plantilla para el código: ${codeNorm}`);
    return null;
  }

  
  return {
    code,
    message: replaceTemplateVars(msg, row)
  };
}

function getPendingMessages(row, templates) {
  const set = pickTemplateSet(templates, row.address);
  const today = todayInTZ();

  const pendientes = [];


  // E-XX: desde E-30 hasta E-00 (orden ascendente)
  if (row.entry && today <= row.entry) {
    const maxDias = 30;
    // Si hoy es el día de entrada (E-00), enviamos todos los E-XX pendientes y por último el E-00
    if (daysBetween(row.entry, today) === 0) {
      // Primero E-30 a E-01
      for (let d = maxDias; d >= 1; d--) {
        const codeE = `E-${String(d).padStart(2,'0')}`;
        if (set[codeE]) pendientes.push({ code: codeE, msg: replaceTemplateVars(set[codeE], row) });
      }
      // Por último E-00
      const codeE00 = 'E-00';
      if (set[codeE00]) pendientes.push({ code: codeE00, msg: replaceTemplateVars(set[codeE00], row) });
    } else {
      // Comportamiento normal: solo los E-XX hasta hoy
      for (let d = maxDias; d >= 0; d--) {
        const fecha = new Date(row.entry.getTime() - d * 24 * 60 * 60 * 1000);
        if (row.reserve && fecha >= row.reserve && fecha <= row.entry && today >= fecha) {
          const codeE = `E-${String(d).padStart(2,'0')}`;
          if (set[codeE]) pendientes.push({ code: codeE, msg: replaceTemplateVars(set[codeE], row) });
        }
      }
    }
  }

  // E+XX: desde el día después de entrada hasta el día antes de salida (solo el día correspondiente, no como pendiente)
  if (row.entry && row.exit && today > row.entry && today < row.exit) {
    const diasDesdeEntrada = daysBetween(today, row.entry);
    if (diasDesdeEntrada > 0) {
      const codeEPlus = `E+${String(diasDesdeEntrada).padStart(2,'0')}`;
      if (set[codeEPlus]) pendientes.push({ code: codeEPlus, msg: replaceTemplateVars(set[codeEPlus], row) });
    }
  }

  // S-XX/S-00: desde 30 días antes de salida hasta salida
  if (row.exit && today <= row.exit && today >= new Date(row.exit.getTime() - 30*24*60*60*1000)) {
    const dToExitAbs = daysBetween(row.exit, today);
    if (dToExitAbs === 0 && set['S-00']) {
      pendientes.push({ code: 'S-00', msg: replaceTemplateVars(set['S-00'], row) });
    } else if (dToExitAbs > 0 && dToExitAbs <= 120) {
      const codeS = `S-${String(dToExitAbs).padStart(2,'0')}`;
      if (set[codeS]) pendientes.push({ code: codeS, msg: replaceTemplateVars(set[codeS], row) });
    }
  }

  // S+XX: hasta 30 días después de la salida
  if (row.exit && today > row.exit && daysBetween(today, row.exit) <= 120) {
    const dAfterExit = daysBetween(today, row.exit);
    const codeSPlus = `S+${String(dAfterExit).padStart(2,'0')}`;
    if (set[codeSPlus]) pendientes.push({ code: codeSPlus, msg: replaceTemplateVars(set[codeSPlus], row) });
  }

  return pendientes;
}

async function processRRHHRow(client, row, templates) {
  const e164 = normalizePhoneE164(row.number);
  if (!e164) {
    console.log(`[RRHH][SKIP] ${row.number}: número no válido o no normalizado`);
    return false;
  }

  const templateSet = templates.rrhh || {};
  const orderedTemplates = Object.entries(templateSet)
    .map(([code, message]) => ({
      key: (code || '').toString().trim(),
      message
    }))
    .filter(({ key, message }) => key && message && message.toString().trim())
    .sort((a, b) => a.key.localeCompare(b.key, 'es', { numeric: true, sensitivity: 'base' }));

  if (!orderedTemplates.length) {
    return false;
  }

  const today = todayInTZ();
  const dayOfWeek = today.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    rrhhWaitLogged.delete(e164);
    return false;
  }

  const canSendNow = isAtOrAfterHourTZ(HORA_ENVIO_INQUILINOS.hour, HORA_ENVIO_INQUILINOS.minute);
  if (!canSendNow) {
    if (!rrhhWaitLogged.has(e164)) {
      const horaObjetivo = `${String(HORA_ENVIO_INQUILINOS.hour).padStart(2, '0')}:${String(HORA_ENVIO_INQUILINOS.minute).padStart(2, '0')}`;
      console.log(`[INFO] RRHH ${row.name || e164}: Esperando a las ${horaObjetivo} (${TZ}) para enviar mensaje.`);
      rrhhWaitLogged.add(e164);
    }
    return false;
  }
  rrhhWaitLogged.delete(e164);

  await getCachedLogPildoras();

  const jid = toWhatsAppJid(e164);
  let sentSomething = false;
  for (const { key, message } of orderedTemplates) {
    const code = key.toUpperCase();
    if (alreadySentPildoraEver(e164, code)) continue;

    const rendered = replaceTemplateVars(message.toString(), row);
    if (!rendered || !rendered.trim()) continue;

    await sendAndLogMessage(client, jid, rendered, code, e164, row, true);

    if (!sentLogPildorasEverSet) {
      sentLogPildorasEverSet = new Set();
    }
    sentLogPildorasEverSet.add(`${e164}|${code}`);

    if (!sentLogPildorasSet) {
      sentLogPildorasSet = new Set();
    }
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fecha = fmt.format(today);
    sentLogPildorasSet.add(`${e164}|${code}|${fecha}`);

    sentSomething = true;
  }

  if (!sentSomething) {
    rrhhWaitLogged.delete(e164);
  }

  return sentSomething;
}

/* ================== WHATSAPP ================== */


let isReady = false;
// === CACHE GLOBAL para evitar exceso de lecturas a Google Sheets ===
let cacheTenants = [];
let cacheTenantsTS = 0;
let cacheLog = null;
let cacheLogTS = 0;
let cacheLogPildoras = null;
let cacheLogPildorasTS = 0;
let cacheLogPildorasEver = null;
let pildorasWaitLogged = false;
const rrhhWaitLogged = new Set();
const CACHE_MS = 5 * 60 * 1000; // 5 minutos

async function getCachedTenants() {
  const now = Date.now();
  if (!cacheTenantsTS || now - cacheTenantsTS > CACHE_MS) {
    cacheTenants = await fetchTenants();
    cacheTenantsTS = now;
  }
  return cacheTenants;
}

async function getCachedLog() {
  const now = Date.now();
  if (!cacheLogTS || now - cacheLogTS > CACHE_MS) {
    await loadSentLog();
    cacheLog = sentLogSet;
    cacheLogTS = now;
  } else {
    sentLogSet = cacheLog;
  }
  return cacheLog;
}

async function getCachedLogPildoras() {
  const now = Date.now();
  if (!cacheLogPildorasTS || now - cacheLogPildorasTS > CACHE_MS) {
    await loadSentLogPildoras();
    cacheLogPildoras = sentLogPildorasSet;
    cacheLogPildorasEver = sentLogPildorasEverSet;
    cacheLogPildorasTS = now;
  } else {
    sentLogPildorasSet = cacheLogPildoras;
    sentLogPildorasEverSet = cacheLogPildorasEver;
  }
  return { daily: sentLogPildorasSet, ever: sentLogPildorasEverSet };
}

async function main() {
  let TEMPLATES = await loadAllTemplates();
  setInterval(async () => {
    try {
      TEMPLATES = await loadAllTemplates();
    } catch (e) {
      console.error('❗ No pude refrescar plantillas:', e.message);
    }
  }, 5 * 60 * 1000);

  await ensureLogSheet();

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: process.env.SESSION_PATH || './sessions-inquilinos' }),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', async qr => {
    console.log('Escanea este QR con el WhatsApp del número emisor:');
    qrcode.generate(qr, { small: true });
    try {
      lastQRDataUrl = await QRCode.toDataURL(qr);
    } catch (e) {
      console.error('QR gen err:', e.message);
    }
  });

  // --- Ciclo principal de INQUILINOS (sin cambios) ---
  client.on('ready', async () => {
  lastQRDataUrl = null;
  isReady = true;
  console.log('✅ WhatsApp listo. Iniciando ciclo…');

    let sleeping = false;
    let ticking = false;

    const tick = async () => {
      if (sleeping) return;
      if (ticking) {
        console.warn('⚠️ tick() ya está en ejecución. Evitando solapamiento.');
        return;
      }
      if (!isReady) {
        console.log('Cliente WhatsApp no está listo, esperando...');
        return;
      }
      ticking = true;
      try {
        await getCachedLog();
        const tenants = await getCachedTenants();
        let anyMessage = false;
        for (const row of tenants) {
          if (!row.active) continue;
          const addressNormalized = (row.address || '').toUpperCase().replace(/\s+/g, '');
          if (addressNormalized === 'PILDORAS') continue; // saltar PILDORAS aquí

          if (addressNormalized.includes('RRHH')) {
            const sent = await processRRHHRow(client, row, TEMPLATES);
            if (sent) {
              anyMessage = true;
              await new Promise(res => setTimeout(res, 60000));
            }
            continue;
          }

          const e164 = normalizePhoneE164(row.number);
          if (!e164) {
            console.log(`[SKIP] ${row.number}: número no válido o no normalizado`);
            continue;
          }
          const jid = toWhatsAppJid(e164);
          const pendientes = getPendingMessages(row, TEMPLATES);
          for (const { code, msg } of pendientes) {
            const dup = alreadySentEver(e164, code);
            if (!dup) {
              anyMessage = true;
              await sendAndLogMessage(client, jid, msg, code, e164, row);
              await new Promise(res => setTimeout(res, 60000));
            }
          }
        }
        // Calcular cuánto falta para las 13:00 (Europe/Madrid) del día siguiente
        const now = new Date();
        const tz = TZ || 'Europe/Madrid';
        const next = new Date(
          new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(now) + 'T13:00:00'
        );
        const nowInTZ = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        if (nowInTZ >= next) {
          next.setUTCDate(next.getUTCDate() + 1);
        }
        const msToNext = next.getTime() - now.getTime();
        const horas = Math.floor(msToNext / (1000 * 60 * 60));
        const minutos = Math.floor((msToNext % (1000 * 60 * 60)) / (1000 * 60));
        if (!anyMessage) {
          console.log(`No hay mensajes para enviar hoy. Durmiendo hasta las 13:00 (faltan ${horas}h ${minutos}m)...`);
        } else {
          console.log(`Todos los mensajes del día enviados. Durmiendo hasta las 13:00 (faltan ${horas}h ${minutos}m)...`);
        }
        sleeping = true;
        setTimeout(() => {
          sleeping = false;
          console.log('Reanudando ciclo tras dormir hasta las 13:00.');
        }, msToNext);
      } catch (e) {
        console.error('Loop error:', e.message);
      } finally {
        ticking = false;
      }
    };
    await tick();
    setInterval(tick, LOOP_EVERY_MS);

    // --- Ciclo paralelo de PILDORAS ---
    const tickPildoras = async () => {
      try {
        const hoy = todayInTZ();
        const esHoyDia = esDiaPildoras(hoy);
        const canSendNow = isAtOrAfterHourTZ(HORA_ENVIO_PILDORAS.hour, HORA_ENVIO_PILDORAS.minute);

        if (!esHoyDia) {
          pildorasWaitLogged = false;
          return;
        }

        if (!canSendNow) {
          if (!pildorasWaitLogged) {
            const horaObjetivo = `${String(HORA_ENVIO_PILDORAS.hour).padStart(2, '0')}:${String(HORA_ENVIO_PILDORAS.minute).padStart(2, '0')}`;
            console.log(`[INFO] PILDORAS: Esperando a las ${horaObjetivo} (${TZ}) para comenzar los envíos.`);
            pildorasWaitLogged = true;
          }
          return;
        }

        pildorasWaitLogged = false;
        await getCachedLogPildoras();
        const tenants = await getCachedTenants();

        let enviadosHoy = 0;
        for (const row of tenants) {
          if (!row.active) continue;
          if ((row.address || '').toUpperCase().replace(/\s+/g, '') !== 'PILDORAS') continue;
          const e164 = normalizePhoneE164(row.number);
          if (!e164) continue;

          const jid = toWhatsAppJid(e164);
          const semana = getSemanaPildora(row.entry, hoy);
          const code = `SEMANA${semana}`;
          if (alreadySentPildoraToday(e164, code)) continue;

          await sendPildoraAndLog(client, jid, semana, e164, row, TEMPLATES);
          enviadosHoy++;
          await new Promise(res => setTimeout(res, 30000)); // 30s entre envíos
        }
        
        if (enviadosHoy > 0) {
          console.log(`[INFO] PILDORAS: Envíos del día completados (${enviadosHoy} píldoras enviadas). Esperando hasta el próximo miércoles.`);
        }
      } catch (e) {
        console.error('Loop error PILDORAS:', e.message);
      }
    };
    setInterval(tickPildoras, LOOP_EVERY_MS);
    tickPildoras();
  });

  client.on('disconnected', () => {
    isReady = false;
    console.log('Cliente WhatsApp desconectado. Esperando reconexión...');
  });

  client.initialize();
}
main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

async function sendAndLogMessage(client, jid, msg, code, number, row) {
  // Si se pasa el parámetro extra 'logPildoras', guarda en LOG_PILDORAS
  const logPildoras = arguments.length > 6 && arguments[6] === true;
  const nombre = row && row.name ? row.name : number;
  if (DRY_RUN) {
    console.log(`[DRY] ${number} -> ${code}: ${msg.slice(0, 60)}…`);
    if (logPildoras) {
      await appendLogPildoras(number, code, 'DRY');
    } else {
      await appendLog(number, code, 'DRY');
    }
  } else {
    try {
      await client.sendMessage(jid, msg);
  // Log sin color
  console.log(`Name: ${nombre} , Código: ${code} , ✅ Enviado.`);
      if (logPildoras) {
        await appendLogPildoras(number, code, 'SENT');
      } else {
        await appendLog(number, code, 'SENT');
      }
    } catch (err) {
  // Log sin color
  console.log(`Name: ${nombre} , Código: ${code} , ❌ Error: ${err.message}`);
      if (logPildoras) {
        await appendLogPildoras(number, code, `ERROR: ${err.message}`);
      } else {
        await appendLog(number, code, `ERROR: ${err.message}`);
      }
    }
    await new Promise(r => setTimeout(r, SEND_DELAY_MS));
  }
}
