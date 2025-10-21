// scheduledFlow.js
// Lógica de mensajes programados y respuestas automáticas (21, 22, 23, 24, 31, 33, 41)

// SCHEDULED_FLOW: define cuándo y a qué hora se envía cada mensaje programado
const SCHEDULED_FLOW = [
  { codes: ['21'], offsetDays: 2, hour: 11, minute: 0 },   // 2 días antes, 11:00
  { codes: ['23'], offsetDays: 1, hour: 11, minute: 0 },   // 1 día antes, 11:00
  { codes: ['31'], offsetDays: 0, hour: 11, minute: 0 },   // Día 0, 11:00
  { codes: ['41'], offsetDays: -1, hour: 11, minute: 0 }   // 1 día después, 11:00
];

// RESPONSE_PAIRS: para cada mensaje programado, cuál es el código de respuesta automática
const RESPONSE_PAIRS = {
  '21': '22', // Si responde a 21, se envía 22
  '23': '24', // Si responde a 23, se envía 24
  '31': '33'  // Si responde a 31, se envía 33
};

// RESPONSE_DEPENDENCIES: define dependencias, no se envía el siguiente hasta que se haya respondido el anterior
const RESPONSE_DEPENDENCIES = {
  '23': '22', // No enviar 23 hasta que se haya respondido 22
  '31': '24', // No enviar 31 hasta que se haya respondido 24
  '41': '33'  // No enviar 41 hasta que se haya respondido 33
};

// isPositiveResponse: detecta si la respuesta del usuario es positiva (para avanzar el flujo)
function isPositiveResponse(text) {
  const positiveRegex = /(gracias|perfecto|genial|excelente|ok|vale|bien|entendido|recibido|de acuerdo|correcto|sí|si|okey|okay|👍|✅)/i;
  return positiveRegex.test(text);
}

module.exports = {
  SCHEDULED_FLOW,
  RESPONSE_PAIRS,
  RESPONSE_DEPENDENCIES,
  isPositiveResponse
};
