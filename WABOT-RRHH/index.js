// Envía el mensaje programado correspondiente según la lógica de dependencias y tiempos
// - Solo envía el siguiente mensaje si el anterior fue respondido (dependencias)
// - Programa NF y 2NF independientes para cada mensaje programado
async function checkAndSendScheduled(jid, name, procesoDate) {
  // Solo permitir mensajes programados si el usuario ha terminado el mainFlow
  if (!state[jid] || (state[jid].phase !== 'scheduled_flow' && state[jid].phase !== 'done')) {
    console.log(`[SCHEDULED][SKIP] ${jid} aún no ha terminado el mainFlow (phase=${state[jid]?.phase})`);
    return;
  }
  // Validación de datos mínimos
  if (!jid || !name || !procesoDate) {
    console.log(`[SCHEDULED][SKIP] Faltan datos: jid=${jid}, name=${name}, procesoDate=${procesoDate}`);
    return;
  }
  // Validación de estructura de flujo programado
  if (!Array.isArray(scheduledFlow.SCHEDULED_FLOW)) {
    console.log('[SCHEDULED][SKIP] SCHEDULED_FLOW no es un array');
    return;
  }
  const now = new Date();
  if (!state[jid]) state[jid] = {};
  if (!state[jid].scheduled) state[jid].scheduled = {};

  // Lógica estricta: solo enviar el siguiente mensaje programado si el anterior fue respondido (dependencias)
  for (const block of scheduledFlow.SCHEDULED_FLOW) {
    for (const code of block.codes) {
      // Si ya fue enviado este mensaje, saltar
      if (state[jid].scheduled[code]) continue;

      // Si tiene dependencia, solo enviar si la respuesta fue recibida
      const dep = scheduledFlow.RESPONSE_DEPENDENCIES[code];
      if (dep && !state[jid].scheduled[dep]) {
        // Espera a que se responda la dependencia antes de enviar este mensaje
        console.log(`[SCHEDULED][WAIT] ${jid} esperando respuesta a dependencia ${dep} antes de enviar ${code}`);
        return;
      }

      // Calcular fecha/hora objetivo para el envío
      let targetDate = new Date(procesoDate);
      if (block.offsetDays) targetDate.setDate(targetDate.getDate() + block.offsetDays);
      targetDate.setHours(block.hour, block.minute, 0, 0);

      // Solo enviar si está dentro de la ventana de tiempo
      if (!isWithinWindow(now, targetDate, 5)) {
        console.log(`[SCHEDULED][FUTURE] ${jid} ${code} programado para ${targetDate.toLocaleString()} (ahora: ${now.toLocaleString()})`);
        continue;
      }

      // Enviar mensaje programado y registrar en hoja
      const body = TEMPLATES[code] ? fillVars(TEMPLATES[code], { name }) : '';
      await updateAvWPP(jid.replace(/@c\.us$/, ''), code);
      await sendWhatsApp(jid, body);
      state[jid].scheduled[code] = true;
      state[jid].lastScheduledSent = code;
      console.log(`[SCHEDULED][SEND] Enviado ${code} a ${jid}`);

      // Programar NF (No Finalizado) para este mensaje programado
      if (!state[jid].scheduledNF) state[jid].scheduledNF = {};
      if (!state[jid].scheduled2NF) state[jid].scheduled2NF = {};
      if (state[jid].scheduledNF[code]) return; // Ya hay NF programado para este code
      state[jid].scheduledNF[code] = setTimeout(async () => {
        // Si ya respondió, no enviar NF
        if (state[jid].scheduled && state[jid].scheduled[scheduledFlow.RESPONSE_PAIRS[code]]) return;
        // Enviar NF programado
        const nfBody = TEMPLATES['NF'] ? fillVars(TEMPLATES['NF'], { name }) : 'No Finalizado';
        await updateNotes(jid.replace(/@c\.us$/, ''), `NF`);
        await sendWhatsApp(jid, nfBody);
        console.log(`[SCHEDULED][NF] Enviado NF programado tras no respuesta a ${code} (${jid})`);
        // Programar 2NF si sigue sin responder
        if (state[jid].scheduled2NF[code]) return;
        state[jid].scheduled2NF[code] = setTimeout(async () => {
          if (state[jid].scheduled && state[jid].scheduled[scheduledFlow.RESPONSE_PAIRS[code]]) return;
          const nf2Body = TEMPLATES['2NF'] ? fillVars(TEMPLATES['2NF'], { name }) : 'Segunda No Finalización';
          await updateNotes(jid.replace(/@c\.us$/, ''), `2NF`);
          await updateStatusToInactive(jid.replace(/@c\.us$/, ''));
          await sendWhatsApp(jid, nf2Body);
          console.log(`[SCHEDULED][2NF] Enviado 2NF programado tras no respuesta a ${code} (${jid}) y status INACTIVO`);
        }, TIME_2NF_MS);
      }, TIME_NF_MS);
      return; // Solo uno por ciclo
    }
  }
}
// ========== HELPERS PARA FLUJO PRINCIPAL ========== 
// Actualiza la columna Q (AvWPP) en la hoja para el candidato
async function updateAvWPP(phone, code) {
  try {
    const sheets = await getSheetsClient();
    // Buscar la fila del candidato por teléfono
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:Z10000`
    });
    const rows = res.data.values || [];
    if (!rows.length) return;
    const phoneCol = COL.phone - 1;
    const qCol = 16; // Q = 17th column, 0-based index is 16
    let foundRow = -1;
    for (let i = 1; i < rows.length; ++i) {
      const rowPhone = (rows[i][phoneCol] || '').replace(/\s+/g, '');
      if (normalizePhoneE164(rowPhone) === normalizePhoneE164(phone)) {
        foundRow = i + 1; // +1 por el header, +1 para 1-based
        break;
      }
    }
    if (foundRow === -1) return;
    // Obtener el valor actual y concatenar si ya existe
    let current = (rows[foundRow-1][qCol] || '').trim();
    let newValue = current ? `${current}|${code}` : code;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!Q${foundRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newValue]] }
    });
    console.log(`[updateAvWPP] Guardado en Q${foundRow}: ${newValue}`);
  } catch (e) {
    console.error('[updateAvWPP ERROR]', e?.message || e);
  }
}

// Limpia los timers del usuario
function clearTimers(jid) {
  if (state[jid]) {
    if (state[jid].nfTimer) clearTimeout(state[jid].nfTimer);
    if (state[jid].desTimer) clearTimeout(state[jid].desTimer);
    state[jid].nfTimer = null;
    state[jid].desTimer = null;
  }
}

// Envía el mensaje NF (No Finalizado)
async function sendNF(jid, name) {
  try {
    // Obtener el template para NF
    const body = TEMPLATES['NF'] ? TEMPLATES['NF'].replace(/\{\{name\}\}/g, name) : 'No Finalizado';
    const phone = (jid || '').replace(/@c\.us$/, '');
    // Guardar en columna I (Notas)
    await updateNotes(phone, 'NF');
    // Enviar mensaje por WhatsApp
    await sendWhatsApp(jid, body);
    console.log(`[sendNF] Enviado NF a ${jid} y guardado en Notas`);

    // Programar 2NF si no contesta al NF
    clearTimers(jid);
    if (state[jid]) {
      state[jid].phase = 'wait_nf_response';
      state[jid].desTimer = setTimeout(() => send2NF(jid, name), TIME_2NF_MS);
      console.log(`[sendNF] Programado 2NF para ${jid} en ${TIME_2NF_MS}ms (si no contesta al NF)`);
    }
  } catch (e) {
    console.error('[sendNF ERROR]', e?.message || e);
  }
}

// Envía el mensaje 2NF (Segunda No Finalización)
async function send2NF(jid, name) {
  try {
    const body = TEMPLATES['2NF'] ? TEMPLATES['2NF'].replace(/\{\{name\}\}/g, name) : 'Segunda No Finalización';
    const phone = (jid || '').replace(/@c\.us$/, '');

    // Actualizar sheet: cambiar estatus a Inactivo y agregar a notas
    await updateStatusToInactive(phone);
    await updateNotes(phone, '2NF');

    await sendWhatsApp(jid, body);
    console.log(`[send2NF] Enviado 2NF a ${jid}`);
    clearTimers(jid);
    if (state[jid]) state[jid].phase = 'done';
  } catch (e) {
    console.error('[send2NF ERROR]', e?.message || e);
  }
}

// Envía mensaje DES (Desinteresado)
async function sendDES(jid, name) {
  try {
    const body = TEMPLATES['DES'] ? TEMPLATES['DES'].replace(/\{\{name\}\}/g, name) : 'Desinteresado';
    const phone = (jid || '').replace(/@c\.us$/, '');
    await updateStatusToInactive(phone);
    await updateNotes(phone, 'DES');
    await sendWhatsApp(jid, body);
    console.log(`[sendDES] Enviado DES a ${jid}`);
    clearTimers(jid);
    if (state[jid]) state[jid].phase = 'done';
  } catch (e) {
    console.error('[sendDES ERROR]', e?.message || e);
  }
}
// Flujos separados en módulos
const mainFlow = require('./mainFlow');
const scheduledFlow = require('./scheduledFlow');

// Usar las constantes y funciones desde mainFlow y scheduledFlow
const CONFIRM_REGEX = mainFlow.CONFIRM_REGEX;
const UNINTERESTED_REGEX = mainFlow.UNINTERESTED_REGEX;
const FLOW = mainFlow.FLOW;
const NF_CODE = mainFlow.NF_CODE;
const DES_CODE = mainFlow.DES_CODE;
const UNINTERESTED_CODE = mainFlow.UNINTERESTED_CODE;
const isPositiveResponse = scheduledFlow.isPositiveResponse;
const RESPONSE_PAIRS = scheduledFlow.RESPONSE_PAIRS;
const isStrongUninterested = mainFlow.isStrongUninterested;

// Función auxiliar para verificar desinterés (copia local por si falla la importación)
function checkUninterested(text) {
  const trimmed = String(text || '').trim().toLowerCase();
  // "no" solo no dispara desinterés
  if (/^no[.!?\s]*$/i.test(trimmed)) return false;

  // Patrones de desinterés
  const patterns = [
    /no (quiero|me interesa|puedo|continuar|asistir|seguir|interesa|voy|gracias)/i,
    /no (estoy interesado|participar|seguir|asistir|interesad[oa]|confirmo)/i,
    /no confirmo|yo no me interesa|no gracias|no, gracias/i,
    /no voy|no asistir|no participo|no deseo/i
  ];

  return patterns.some(pattern => pattern.test(trimmed));
}
const sendMainStep = (...args) => mainFlow.sendMainStep(...args, TEMPLATES, updateAvWPP, sendWhatsApp, state, clearTimers, FLOW, NF_CODE, TIME_NF_MS, sendNF);
const state = Object.create(null);

// Cuando llames a sendMainStep:
// ================== GOOGLE SHEETS CLIENT ==================
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SA_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}


// Helper: Update status from Active to Inactive when 2NF is sent
async function updateStatusToInactive(phone) {
  try {
    const sheets = await getSheetsClient();
    // Fetch all candidates to find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:Z10000`
    });
    const rows = res.data.values || [];
    if (!rows.length) return;
    
    // Find the row index (1-based for Sheets API)
    const phoneCol = COL.phone - 1;
  const statusCol = 19; // T = 20th column, 0-based index is 19
    let foundRow = -1;
    
    for (let i = 1; i < rows.length; ++i) {
      const rowPhone = (rows[i][phoneCol] || '').replace(/\s+/g, '');
      if (normalizePhoneE164(rowPhone) === normalizePhoneE164(phone)) {
        foundRow = i + 1; // +1 for header row, +1 for 1-based
        break;
      }
    }
    if (foundRow === -1) return;
    
    // Update the status cell to "Inactivo"
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!T${foundRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Inactivo']] }
    });
    console.log(`[SHEET] Updated status to Inactivo for ${phone}`);
  } catch (e) {
    console.error('[SHEET] Error updating status:', e?.message || e);
  }
}

// Helper: Update Notes column (column I = index 8)
async function updateNotes(phone, note) {
  try {
    const sheets = await getSheetsClient();
    // Fetch all candidates to find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:Z10000`
    });
    const rows = res.data.values || [];
    if (!rows.length) return;
    
    // Find the row index (1-based for Sheets API)
    const phoneCol = COL.phone - 1;
    const notesCol = 8; // I = 9th column, 0-based index is 8
    let foundRow = -1;
    
    for (let i = 1; i < rows.length; ++i) {
      const rowPhone = (rows[i][phoneCol] || '').replace(/\s+/g, '');
      if (normalizePhoneE164(rowPhone) === normalizePhoneE164(phone)) {
        foundRow = i + 1; // +1 for header row, +1 for 1-based
        break;
      }
    }
    if (foundRow === -1) return;
    
    // Get current notes and append new note
    let currentNotes = (rows[foundRow-1][notesCol] || '').trim();
    let newNotes = currentNotes ? `${currentNotes} | ${note}` : note;
    
    // Log antes de guardar en columna I
    console.log(`[LOG] Guardando nota (${note}) en columna I, fila ${foundRow}, valor: ${newNotes}`);
    // Update the notes cell
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!I${foundRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newNotes]] }
    });
    console.log(`[SHEET] Updated Notes for ${phone}: ${note}`);
  } catch (e) {
    console.error('[SHEET] Error updating Notes:', e?.message || e);
  }
}

// index.js
// Flow principal: 11 → (reply=next) o (2h→NF) → (reply=next) o (2h→2NF)
// Programados por fecha de proceso (por candidato):
//   21 (2 días antes 11:00)  • 22 (en respuesta al 21)
//   23 (1 día antes 11:00)   • 24 (en respuesta al 23)
//   31 (0 día antes 12:00)   • 33 (en respuesta al 31)
//   41 (1 día después 19:00)

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/* ================== CONFIG ================== */


// ---- Google Sheets (AppSheet escribe aquí) ----
// const SPREADSHEET_ID = process.env.SHEET_ID || '1_tWh4nGZ9qwl_Ns6AfTunQ2_MhQtZ4778qCrkpU3ZzU'; // WABOT MBE
const SPREADSHEET_ID = process.env.SHEET_ID || '1ataoMxpKoOTdoQWDEAX0vO2k7icEoPtz8TDvY51G5Fc'; // PROCE MCH
// const SPREADSHEET_ID = process.env.SHEET_ID || '1_tWh4nGZ9qwl_Ns6AfTunQ2_MhQtZ4778qCrkpU3ZzU'; // SOLO el ID (PRUEBA: 1ZW__7IeXpwzTu9TDzA8IToKwFpiq3q_gtvgYwDnhbKg)
const SHEET_RANGE    = process.env.SHEET_RANGE || 'Mensajes Wabot MCH!A:B'; // A: Code, B: Message (no esencial, usamos A1:Z)
const SA_FILE        = process.env.SA_FILE || 'service-account.json';

// ---- WhatsApp ----
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'inquilinos-bot' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// ---- Tiempos de NF / 2NF ---- (ajusta a producción)
// const TIME_NF_MS  = 1 * 60 * 1000; // 1 minutos
// const TIME_2NF_MS = 1 * 60 * 1000; // 1 minutos
const TIME_NF_MS  = 20 * 60 * 1000; // 20 min (testing)
const TIME_2NF_MS = 20 * 60 * 1000; // 20 min (testing)

// ---- Hoja "Candidatos contactados" (A=1) ----
const SHEET_NAME = 'Candidatos contactados';
const COL = {
  process: 1,  // A: Procesos (p.ej., 21ago25)
  phone:   4,  // D: Número
  name:    7   // G: Nombre
};

// Default country code for local numbers (change as needed)
const DEFAULT_CC = '34'; // Spain
const DRY_RUN = false; // true para pruebas sin enviar

// ---- Zona horaria recomendada ----
const TZ = 'Europe/Madrid';

// ---- Express Server para QR ----
const app = express();
const PORT = process.env.PORT || 3000;
let currentQR = null;
  // Removed the call to mainFlow.sendMainStep to avoid syntax errors
  // The following lines have also been removed to prevent syntax errors
// ...existing code...

// Parsea "26ago25" → Date
function parseProcesoDate(str) {
  if (!str) return null;
  const months = {
    'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
  };
  const m = str.match(/(\d{1,2})([a-z]{3})(\d{2,4})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = months[m[2].toLowerCase()];
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(mon) || isNaN(year)) return null;
  const d = new Date(Date.UTC(year, mon, day, 0, 0, 0));
  // conviértela a hora local Madrid a medianoche
  const s = d.toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T');
  return new Date(s);
}

function onlyDigits(s) { return (s || '').replace(/\D+/g, ''); }

function normalizePhoneE164(input) {
  if (!input) return '';
  let s = input.replace(/\s+/g, '');
  s = s.replace(/[^\d+]/g, '');
  // If already in + format and at least 8 digits, accept as is
  if (/^\+\d{8,}$/.test(s)) return s;
  // If starts with 00, convert to +
  if (/^00\d{8,}$/.test(s)) return `+${s.slice(2)}`;
  // If 9 digits, assume Spain (+34)
  if (/^\d{9}$/.test(s)) return `+34${s}`;
  // If 10+ digits, assume international (missing +)
  if (/^\d{10,}$/.test(s)) return `+${s}`;
  // If nothing matches, return empty
  return '';
}

function toWhatsAppJid(e164) {
  const digits = onlyDigits(e164);
  return `${digits}@c.us`;
}

function fillVars(text, ctx) {
  if (typeof text !== 'string') text = '';
  const firstName = (ctx && ctx.name ? ctx.name.split(' ')[0] : '') || '';
  return text.replace(/\{\{name\}\}/g, firstName);
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function isIndividualJid(jid) {
  return jid.endsWith('@c.us');
}

async function sendWhatsApp(jid, body) {
  if (DRY_RUN) {
    console.log(`[DRY] → ${jid}: ${body}`);
    return;
  }
  try {
    await client.sendMessage(jid, body);
  } catch (e) {
    console.error(`[WA SEND ERROR] to ${jid}:`, e?.message || e);
    // Reintento simple
    await sleep(1000);
    await client.sendMessage(jid, body);
  }
}

// Rango semanal (Lunes–Domingo) — opcional
function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dom,1=Lun
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0,0,0,0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23,59,59,999);
  return { monday, sunday };
}

function atTime(baseDate, hour, minute=0) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minusDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

function plusDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ¿Está dentro de ±windowMin minutos?
function isWithinWindow(now, target, windowMin = 10) {
  const diff = Math.abs(now.getTime() - target.getTime());
  return diff <= windowMin * 60 * 1000;
}

/* ================== TEMPLATES ================== */

// Mensajes y PROCESS_KEY
let TEMPLATES = {};
let PROCESS_KEY = '';

// Carga mensajería y PROCESS_KEY desde la hoja "Mensajes"
async function loadTemplates() {
  const sheets = await getSheetsClient();
  const range = `Mensajes Wabot MCH!A1:Z100`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range
  });
  const rows = res.data.values || [];
  const headerRow = rows[0] || [];

// Buscar PROCESS_KEY en cualquier celda del header (e.g., "PROCESS_KEY=21ago25")
  for (const cell of headerRow) {
    if (typeof cell === 'string' && cell.startsWith('PROCESS_KEY=')) {
      PROCESS_KEY = cell.split('=')[1].trim();
      break;
    }
  }

// Detectar columnas Code y Message
  const header = headerRow.map(h => (h || '').toString().trim().toLowerCase());
  const codeIdx = header.findIndex(h => h === 'code');
  const msgIdx  = header.findIndex(h => h === 'message');
  if (codeIdx === -1 || msgIdx === -1) {
    console.error('Header row recibido de Mensajes:', header);
    throw new Error('La hoja Mensajes debe tener columnas: Code, Message (en la fila 1).');
  }

  const messages = {};
  for (const row of rows.slice(1)) {
    const code = (row[codeIdx] || '').trim();
    const msg  = (row[msgIdx]  || '').trim();
    if (code && msg) messages[code] = msg;
  }
  TEMPLATES = messages;
  console.log('🗂️  Plantillas:', Object.keys(TEMPLATES), 'PROCESS_KEY:', PROCESS_KEY || '(vacío)');
}

// Alternativa: leer PROCESS_KEY desde C1 con formato "PROCESS_KEY=..."
async function getCurrentProcesoKey() {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Mensajes Wabot MCH!C1`,
    });
    const val = (res.data.values && res.data.values[0] && res.data.values[0][0]) || '';
    const m = val.match(/PROCESS_KEY\s*=\s*(\S+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/* ================== DATA (Candidatos) ================== */

async function fetchCandidates() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:Z10000`
  });
  const rows = res.data.values || [];
  if (!rows.length) return [];
  const out = [];
  // Column T = 20 (0-based index 19), columna P = 16 (0-based index 15)
  for (const r of rows.slice(1)) {
    const estatus = (r[19] || '').trim();
    const procesoStatus = (r[15] || '').trim().toLowerCase();
    // Solo incluir si estatus es Activo y procesoStatus es Proceso, Examen o Llamada
    if (estatus !== 'Activo') continue;
    if (!['proceso', 'examen', 'llamada'].includes(procesoStatus)) continue;
    out.push({
      process: (r[COL.process - 1] || '').trim(), 
      phone:   (r[COL.phone   - 1] || '').trim(),
      name:    (r[COL.name    - 1] || '').trim(),
      estatus,
      procesoStatus
    });
  }
  return out;
}

// Verificar si se debe enviar mensaje de respuesta
async function checkAndSendResponseMessage(jid, name, receivedText) {
  if (!state[jid] || !state[jid].lastScheduledSent) return false;
  const lastSent = state[jid].lastScheduledSent;
  const responseCode = RESPONSE_PAIRS[lastSent];
  if (!responseCode) return false;
  // Verificar que no se haya enviado ya este código de respuesta
  if (state[jid].scheduled && state[jid].scheduled[responseCode]) return false;
  // Si la respuesta es DES/interés fuerte, no marcar como respondido aquí (lo gestiona el handler principal)
  if (isStrongUninterested(receivedText) || checkUninterested(receivedText)) return false;
  // Cualquier otra respuesta (aunque no sea positiva) marca como respondido
  const body = TEMPLATES[responseCode] ? fillVars(TEMPLATES[responseCode], { name }) : '';
  await updateAvWPP((jid || '').replace(/@c\.us$/, ''), responseCode);
  await sendWhatsApp(jid, body);
  if (!state[jid].scheduled) state[jid].scheduled = {};
  state[jid].scheduled[responseCode] = true;
  state[jid].lastScheduledSent = responseCode;
  clearTimers(jid);
  // Cancelar NF/2NF programados para este mensaje scheduled
  if (state[jid].scheduledNF && state[jid].scheduledNF[lastSent]) {
    clearTimeout(state[jid].scheduledNF[lastSent]);
    state[jid].scheduledNF[lastSent] = null;
  }
  if (state[jid].scheduled2NF && state[jid].scheduled2NF[lastSent]) {
    clearTimeout(state[jid].scheduled2NF[lastSent]);
    state[jid].scheduled2NF[lastSent] = null;
  }
  console.log(`[SCHEDULED][RESPONSE] Enviado ${responseCode} a ${jid} en respuesta a ${lastSent}`);
  return true;
}

async function runScheduledBlocks() {
  try {
    const now = new Date();
    console.log(`[SCHEDULED][RUN] Actualización de mensajes programados a las ${now.toLocaleTimeString('es-ES', { hour12: false })}`);
    const candidates = await fetchCandidates();

    // Asegura PROCESS_KEY desde header o C1
    if (!PROCESS_KEY) {
      const pk = await getCurrentProcesoKey();
      if (pk) PROCESS_KEY = pk;
    }
    if (!PROCESS_KEY) {
      console.log('[SCHEDULED] Sin PROCESS_KEY, no se programan envíos.');
      return;
    }

    for (const c of candidates) {
      if (!c.phone || !c.process) continue;
      if (c.process.toLowerCase() !== PROCESS_KEY.toLowerCase()) continue;
      const e164 = normalizePhoneE164(c.phone);
      const jid = toWhatsAppJid(e164);
      const name = c.name || 'Candidato';
      const procesoDate = parseProcesoDate(c.process);
      if (!procesoDate) continue;
      // Se elimina la validación de canSendScheduled para permitir programados aunque el flujo principal no esté terminado
      await checkAndSendScheduled(jid, name, procesoDate);
    }
    const next = new Date(now.getTime() + 2 * 60 * 1000);
    console.log(`[SCHEDULED][NEXT] Siguiente actualización a las ${next.toLocaleTimeString('es-ES', { hour12: false })}`);
  } catch (e) {
    console.error('[SCHEDULED ERROR]', e?.message || e);
  }
}

/* ================== WEB SERVER ================== */

// Ruta para mostrar el QR
app.get('/', (req, res) => {
  if (!currentQR) {
    res.send(`
      <html>
        <head><title>WhatsApp Bot QR</title></head>
        <body style="text-align: center; font-family: Arial;">
          <h1>WhatsApp Bot</h1>
          <p>Esperando código QR...</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
      </html>
    `);
    return;
  }

  res.send(`
    <html>
      <head><title>WhatsApp Bot QR</title></head>
      <body style="text-align: center; font-family: Arial;">
        <h1>Escanea este código QR con WhatsApp</h1>
        <img src="${currentQR}" alt="QR Code" style="border: 1px solid #ccc;" />
        <p>Una vez escaneado, el bot estará listo para funcionar</p>
        <script>setTimeout(() => location.reload(), 10000);</script>
      </body>
    </html>
  `);
});

// Ruta para obtener solo el QR en formato imagen
app.get('/qr', (req, res) => {
  if (!currentQR) {
    res.status(404).send('QR no disponible');
    return;
  }
  
  // Extraer los datos base64 y enviar la imagen
  const base64Data = currentQR.replace(/^data:image\/png;base64,/, '');
  const img = Buffer.from(base64Data, 'base64');
  
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': img.length
  });
  res.end(img);
});

// Iniciar servidor Express
app.listen(PORT, () => {
  console.log(`🌐 Servidor web ejecutándose en puerto ${PORT}`);
  console.log(`🔗 QR disponible en: http://localhost:${PORT}`);
});

/* ================== WHATSAPP CLIENT ================== */

client.on('qr', async (qr) => {
  console.log('📱 Código QR generado');
  qrcode.generate(qr, { small: true });
  
  try {
    // Generar QR como imagen base64 para la web
    currentQR = await QRCode.toDataURL(qr);
    console.log('🌐 QR disponible en el servidor web');
  } catch (err) {
    console.error('Error generando QR para web:', err);
  }
});

client.on('authenticated', () => {
  console.log('✅ Cliente autenticado');
  currentQR = null; // Limpiar QR una vez autenticado
});

// Restaurar estados de todos los usuarios al inicializar
async function restoreAllStates() {
  try {
    const candidates = await fetchCandidates();
    console.log(`[RESTORE] Restaurando estados para ${candidates.length} candidatos`);

    for (const c of candidates) {
      if (!c.phone) continue;
      const e164 = normalizePhoneE164(c.phone);
      const jid = toWhatsAppJid(e164);

      // Restaurar estado individual si tiene mensajes
      const result = await restoreStateFromSheet(jid);
      if (result.hasMessages && result.state) {
        state[jid] = result.state;
        console.log(`[RESTORE] Estado restaurado para ${jid}: paso ${result.state.step}, fase ${result.state.phase}`);
      }
    }
  } catch (e) {
    console.error('[RESTORE ALL ERROR]', e?.message || e);
  }
}

client.on('ready', async () => {
  console.log('✅ Cliente listo');
  try {
    await loadTemplates();
    // Restaurar todos los estados desde Google Sheets
    await restoreAllStates();
    // refrescar plantillas y PROCESS_KEY cada 5 min
    setInterval(loadTemplates, 5 * 60 * 1000);
  } catch (e) {
    console.error('Error al cargar plantillas:', e);
  }
  // verificar programados cada 2 min
  setInterval(runScheduledBlocks, 2 * 60 * 1000);
});

client.on('message', async (msg) => {
  const jid  = msg.from;
  const text = String(msg.body || '').trim();

  // Intentar obtener un nombre legible
  let name = 'Candidato';
  if (msg.notifyName) {
    name = msg.notifyName;
  } else if (msg._data && msg._data.notifyName) {
    name = msg._data.notifyName;
  } else if (msg.sender && msg.sender.pushname) {
    name = msg.sender.pushname;
  }

  // Buscar al candidato por su teléfono
  const all = await fetchCandidates();
  const candidate = all.find(c => toWhatsAppJid(normalizePhoneE164(c.phone)) === jid);
  if (!candidate) {
    console.log(`[SKIP] Message from non-candidate: ${jid}`);
    return;
  }

  // Validar que coincide con PROCESS_KEY activo
  const procesoKey = PROCESS_KEY || (await getCurrentProcesoKey());
  if (!procesoKey || candidate.process.toLowerCase() !== procesoKey.toLowerCase()) {
    console.log(`[SKIP] Candidate ${jid} no coincide con PROCESS_KEY (${procesoKey})`);
    return;
  }


  // DES funciona en cualquier fase: si detecta desinterés fuerte o débil, termina el flujo
  if (isStrongUninterested(text) || checkUninterested(text)) {
    state[jid] = { ...(state[jid] || {}), phase: 'done' };
    await sendDES(jid, name);
    console.log(`🚫 Usuario no interesado (${jid}): ${text}`);
    return;
  }

  // NUEVO: Verificar si debe enviar mensaje de respuesta a mensajes programados
  const sentResponseMessage = await checkAndSendResponseMessage(jid, candidate.name || name, text);
  if (sentResponseMessage) {
    // Si se envió un mensaje de respuesta, cancelar timers NF/2NF
    clearTimers(jid);
    if (state[jid]) {
      state[jid].nfTimer = null;
      state[jid].desTimer = null;
    }
    return;
  }

  // Marcar respuestas a mensajes programados y cancelar timers NF/2NF
  if (isPositiveResponse(text) || CONFIRM_REGEX.test(text)) {
    if (!state[jid]) state[jid] = {};
    if (!state[jid].responses) state[jid].responses = {};
    // Cancelar timers cuando hay respuesta a mensajes programados
    clearTimers(jid);
    if (state[jid]) {
      state[jid].nfTimer = null;
      state[jid].desTimer = null;
    }
    const lastSent = state[jid].lastScheduledSent;
    if (['21', '22', '23', '24', '31', '33', '41'].includes(lastSent)) {
      console.log(`[RESPONSE] User ${jid} responded to scheduled message ${lastSent}, timers cleared`);
    }
    // Verificar si el último mensaje enviado fue 22, 24, o 33 para habilitar siguientes
    if (['22', '24', '33'].includes(lastSent)) {
      state[jid].responses[lastSent] = true;
      console.log(`[RESPONSE] User ${jid} responded to ${lastSent}, enabling next message`);
    }
  }

  // Estado inicial
  let s = state[jid] || {};
  if (!s.phase) {
    // Verificar en sheets si ya tiene mensajes enviados antes de asumir awaiting_confirmation
    const hasMessagesInSheet = await checkExistingMessagesInSheet(jid);
    s.phase = hasMessagesInSheet ? 'scheduled_flow' : 'awaiting_confirmation';
  }
  if (s.phase === 'done') return;

  // Esperando confirmación SOLO si el mensaje empieza con la frase exacta
  if (s.phase === 'awaiting_confirmation') {
    const inicioEsperado = 'hola, confirmo asistencia para el proceso de selección, mi mail es:';
    if (text.toLowerCase().startsWith(inicioEsperado)) {
      if (typeof s.step === 'number' && s.step > 0) {
        console.log(`[FLOW] Already confirmed for ${jid}`);
        return;
      }
      console.log(`✅ Confirmación de ${jid}: ${text}`);
      state[jid] = { step: 0, phase: 'wait_reply' };
      await sendMainStep(jid, name);
    } else if (isStrongUninterested(text) || checkUninterested(text)) {
      state[jid] = { ...s, phase: 'done' };
      await sendDES(jid, name); // ← Envía DES en vez de 2NF
      console.log(`🚫 Usuario no interesado (${jid}): ${text}`);
    } else {
      console.log(`[WAIT] Awaiting confirmation from ${jid}`);
    }
    return;
  }

  // Flujo programado (cuando ya tiene mensajes en sheet pero responde)
    if (s.phase === 'scheduled_flow') {
      // DES/interés fuerte funciona tras cualquier mensaje programado
      if (isStrongUninterested(text) || checkUninterested(text)) {
        state[jid] = { ...s, phase: 'done' };
        await sendDES(jid, name);
        console.log(`🚫 Usuario no interesado (${jid}): ${text}`);
        return;
      }
      // Cualquier otra respuesta (no DES) avanza el flujo programado
      if (typeof s.step === 'number' && s.step >= FLOW.length) {
        state[jid] = { ...s, phase: 'done', step: FLOW.length };
        console.log(`[SCHEDULED_FLOW] User ${jid} ya completó el flujo principal, no se reinicia`);
        return;
      }
      // Si no, continuar el flujo principal normalmente
      state[jid] = { ...s, phase: 'wait_reply' };
      await sendMainStep(jid, name);
      console.log(`[SCHEDULED_FLOW] User ${jid} vuelve al flujo principal`);
      return;
    }

  // Esperando respuesta al NF
  if (s.phase === 'wait_nf_response') {
    if (isStrongUninterested(text) || checkUninterested(text)) {
      state[jid] = { ...s, phase: 'done' };
      await sendDES(jid, name);
      console.log(`🚫 Usuario no interesado después de NF (${jid}): ${text}`);
      return;
    }
    // Si responde al NF, reiniciar el flujo desde donde iba
    clearTimers(jid); // Cancelar 2NF programado
    console.log(`[NF_RESPONSE] Usuario ${jid} respondió al NF, reiniciando flujo`);

    // Determinar desde dónde reiniciar basándose en el contexto
    if (s.lastScheduledSent && ['21', '23', '31'].includes(s.lastScheduledSent)) {
      // Estaba en flujo programado, continuar desde ahí
      state[jid] = { ...s, phase: 'scheduled_flow' };
      console.log(`[NF_RESPONSE] Reiniciando desde mensaje programado ${s.lastScheduledSent}`);
    } else if (typeof s.step === 'number' && s.step < FLOW.length) {
      // Estaba en flujo principal (11,12,13), continuar desde donde iba
      state[jid] = { ...s, phase: 'wait_reply' };
      await sendMainStep(jid, name);
      console.log(`[NF_RESPONSE] Reiniciando flujo principal en paso ${s.step}`);
    } else {
      // Flujo principal completado, ir a mensajes programados
      state[jid] = { ...s, phase: 'scheduled_flow' };
      console.log(`[NF_RESPONSE] Flujo principal completo, esperando mensajes programados`);
    }
    return;
  }

  // Flujo principal en marcha
  if (s.phase === 'wait_reply' || s.phase === 'wait_nf') {
    if (isStrongUninterested(text) || checkUninterested(text)) {
      state[jid] = { ...s, phase: 'done' };
      await sendDES(jid, name); // ← Envía DES en vez de 2NF
      console.log(`🚫 Usuario no interesado (${jid}): ${text}`);
      return;
    }
    if (typeof s.step !== 'number') s.step = 0;
    if (s.step >= FLOW.length) {
      console.log(`[FLOW] Already finished for ${jid}`);
      return;
    }
    await sendMainStep(jid, name);
    return;
  }
});

client.initialize();

async function restoreStateFromSheet(jid) {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:T10000`
    });

    const rows = res.data.values || [];
    const phoneCol = COL.phone - 1;
    const qCol = 16; // Columna Q (AvWPP)

    // Buscar fila del usuario
    for (let i = 1; i < rows.length; i++) {
      const rowPhone = (rows[i][phoneCol] || '').replace(/\s+/g, '');
      if (normalizePhoneE164(rowPhone) === normalizePhoneE164(jid.replace('@c.us', ''))) {
        const avWPP = (rows[i][qCol] || '').trim();

        if (!avWPP) {
          return { hasMessages: false, state: null };
        }

  // Analizar códigos enviados - aceptar separador "|" o "," (ambos formatos)
  const codes = avWPP.split(/\||,/).map(c => c.trim()).filter(Boolean);
        const MAIN_FLOW = ['11','12','13','14'];

        // Poblar todos los mensajes programados como enviados en memoria
        let scheduled = {};
        for (const code of codes) {
          scheduled[code] = true;
        }

        // Determinar el estado basado en los códigos
        let restoredState = { hasMessages: true };

        if (codes.includes('14')) {
          // Flujo principal completo - NO programar NF/2NF automáticamente
          // Esperar a que termine el flujo de mensajes programados (21,23,31,41)
          const name = (rows[i][COL.name - 1] || '').trim() || 'Candidato';

          // Revisar columna I (Notas) para ver el estado
          const notesCol = 8; // I = 9th column, 0-based index is 8
          const notes = (rows[i][notesCol] || '').trim();

          if (notes.includes('2NF')) {
            // Ya se envió 2NF, proceso completado
            restoredState = {
              hasMessages: true,
              state: {
                step: MAIN_FLOW.length,
                phase: 'done',
                scheduled
              }
            };
            console.log(`[RESTORE] Usuario ${jid} ya completó todo el proceso (2NF enviado)`);
          } else {
            // Flujo principal completo, esperando mensajes programados
            // NO programar NF/2NF hasta que termine el flujo programado
            restoredState = {
              hasMessages: true,
              state: {
                step: MAIN_FLOW.length,
                phase: 'scheduled_flow', // Permitir mensajes programados
                scheduled
              }
            };
            console.log(`[RESTORE] Usuario ${jid} completó flujo principal, esperando mensajes programados`);
          }
        } else {
          // Flujo principal incompleto - determinar siguiente paso
          let nextStep = 0;
          for (let j = 0; j < MAIN_FLOW.length; j++) {
            if (codes.includes(MAIN_FLOW[j])) {
              nextStep = j + 1;
            } else {
              break;
            }
          }
          restoredState = {
            hasMessages: true,
            state: {
              step: nextStep,
              phase: nextStep >= MAIN_FLOW.length ? 'done' : 'scheduled_flow',
              scheduled
            }
          };
          console.log(`[RESTORE] Usuario ${jid} en paso ${nextStep} del flujo principal`);
        }

        return restoredState;
      }
    }
    return { hasMessages: false, state: null };
  } catch (e) {
    console.error('[restoreStateFromSheet ERROR]', e);
    return { hasMessages: false, state: null };
  }
}

async function checkExistingMessagesInSheet(jid) {
  const result = await restoreStateFromSheet(jid);
  // Si ya tiene el flujo completo, restaurar estado
  if (result.hasMessages && result.state) {
    state[jid] = result.state;
  }
  return result.hasMessages;
}

async function canSendScheduled(jid) {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:T10000`
    });

    const rows = res.data.values || [];
    const phoneCol = COL.phone - 1;
    const qCol = 16; // Columna Q (AvWPP)

    // Buscar fila del usuario
    for (let i = 1; i < rows.length; i++) {
      const rowPhone = (rows[i][phoneCol] || '').replace(/\s+/g, '');
      if (normalizePhoneE164(rowPhone) === normalizePhoneE164(jid.replace('@c.us', ''))) {
        const avWPP = (rows[i][qCol] || '').trim();
        // Si contiene "14", el flujo principal está completo
        return avWPP.includes('14');
      }
    }
    return false;
  } catch (e) {
    console.error('[canSendScheduled ERROR]', e);
    return false;
  }
}
