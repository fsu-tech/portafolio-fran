// mainFlow.js
// Lógica del flujo principal (11–14, NF, 2NF, DES)

// CONFIRM_REGEX: detecta si el usuario confirma su interés
const CONFIRM_REGEX = /(hola[, ]*)?confirm(o|amos)([^\w]|$)|confirmo asistencia([^\w]|$)|sí([^\w]|$)|de acuerdo([^\w]|$)|adelante([^\w]|$)|list[ao]([^\w]|$)|interesad[oa]([^\w]|$)|me apunto([^\w]|$)|quiero([^\w]|$)|perfecto([^\w]|$)|yes([^\w]|$)|confirm([^\w]|$)/i;

// UNINTERESTED_REGEX: detecta frases de desinterés
const UNINTERESTED_REGEX = /no (quiero|me interesa|puedo|continuar|asistir|seguir|interesa|voy|gracias|estoy interesado|participar|seguir|asistir|interesad[oa]|confirmo)|no confirmo|yo no me interesa|no gracias|no, gracias|no puedo|no voy|no asistir|no participo|no deseo|no deseo continuar|no deseo seguir|no deseo participar|no deseo asistir|no deseo seguir/i;

// FLOW: pasos del flujo principal
const FLOW = ['11','12','13','14','15'];
const NF_CODE  = 'NF';
const DES_CODE = '2NF';
const UNINTERESTED_CODE = 'DES';

// isStrongUninterested: función para detectar desinterés fuerte
function isStrongUninterested(text) {
  const trimmed = String(text || '').trim().toLowerCase();
  if (/^no[.!?\s]*$/i.test(trimmed)) return false; // Solo "no" no cuenta
  return UNINTERESTED_REGEX.test(trimmed);
}

// sendMainStep: envía el siguiente paso del flujo principal y programa NF/2NF si no responde
function sendMainStep(jid, name, TEMPLATES, updateAvWPP, sendWhatsApp, state, clearTimers, FLOW, NF_CODE, TIME_NF_MS, sendNF) {
  // Estado actual
  const s = state[jid] || {};
  const idx = s.step || 0;
  if (idx >= FLOW.length) return;
  const code = FLOW[idx];
  const body = TEMPLATES[code] ? TEMPLATES[code].replace(/\{\{name\}\}/g, name) : '';
  const phone = (jid || '').replace(/@c\.us$/, '');
  updateAvWPP(phone, code);
  sendWhatsApp(jid, body);
  console.log(`✅ [mainFlow] Enviado (${code}) a ${jid}`);
  clearTimers(jid);

  // Si es el último paso (14), pasar a scheduled_flow
  if (idx + 1 >= FLOW.length) {
    state[jid] = { ...s, step: idx + 1, phase: 'scheduled_flow', nfCount: 0, nfTimer: null, desTimer: null };
    return;
  }

  // Para pasos 11, 12, 13: programar NF
  // Permitir múltiples NFs, y solo 2NF tras dos NFs consecutivas sin respuesta
  state[jid] = {
    ...s,
    step: idx + 1,
    phase: 'wait_reply',
    nfCount: 0,
    nfTimer: setTimeout(() => {
      // Timer NF
      const sActual = state[jid] || {};
      if (sActual.phase !== 'wait_reply') {
        console.log(`[NF][SKIP] Respuesta detectada antes de NF, no se envía NF a ${jid}`);
        return;
      }
      // Enviar NF
      if (typeof sendNF === 'function') {
        sendNF(jid, name);
      }
      // Actualizar estado para esperar respuesta al NF
      state[jid] = {
        ...state[jid],
        phase: 'wait_nf_response',
        nfCount: 1,
        nfTimer: setTimeout(() => {
          // Timer 2NF: solo si sigue sin responder tras NF
          const s2 = state[jid] || {};
          if (s2.phase !== 'wait_nf_response' || s2.nfCount !== 1) {
            console.log(`[2NF][SKIP] Respuesta detectada antes de 2NF, no se envía 2NF a ${jid}`);
            return;
          }
          // Enviar 2NF solo si hubo dos NFs consecutivos
          if (typeof sendNF === 'function') {
            sendNF(jid, name, true); // true = 2NF
          }
          // Marcar como no interesado y finalizar
          state[jid] = {
            ...state[jid],
            phase: 'done',
            nfCount: 2,
            nfTimer: null,
            desTimer: null
          };
        }, TIME_NF_MS)
      };
    }, TIME_NF_MS)
  };
}

module.exports = {
  CONFIRM_REGEX,
  UNINTERESTED_REGEX,
  FLOW,
  NF_CODE,
  DES_CODE,
  UNINTERESTED_CODE,
  isStrongUninterested,
  sendMainStep 
};

