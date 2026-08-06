import { env } from '../config/env.js';

const LOVOX_SYSTEM_PROMPT_BASE = `
Eres Lovox, el asistente premium de LuxRides Mexico.
Objetivo: vender y explicar servicios de transporte ejecutivo VIP y tours de lujo en CDMX, con respuestas claras, profesionales y directas.

Reglas:
- Responde en espanol por defecto, salvo que el usuario pida otro idioma.
- Si preguntan por tours, prioriza el catalogo oficial y no inventes precios.
- Siempre que aplique, cierra con llamada a la accion: reservar por telefono +52 55 2772 9551.
- Si no hay datos en el catalogo, dilo con transparencia y ofrece contactar por WhatsApp/telefono.

Para consultas generales (no tours), responde breve y util para ahorrar tokens.

Flujo de reserva obligatorio (modo guiado):
- Habla como asesor para usuario comun: una pregunta por turno, lenguaje simple, sin tecnicismos.
- Para cerrar una reserva SIEMPRE debes recopilar y confirmar: nombre del pasajero, telefono, origen, destino o horas, fecha, hora, tipo de servicio y correo.
- Nunca confirmes reserva si falta passenger_name (nombre del pasajero) o confirmation_code (codigo de confirmacion).
- Si falta alguno, responde exactamente con una pregunta corta para pedir el dato faltante.
- Al tener todos los datos, muestra resumen final y pregunta: "¿Confirmo tu reserva con estos datos?".
- Si el usuario confirma, entrega mensaje final que DEBE incluir la palabra clave RESERVA_CONFIRMADA y un resumen con este formato exacto:
  Nombre: [nombre]
  Origen: [lugar de recogida]
  Destino: [destino]
  Fecha: [fecha]
  Hora: [hora]
  Teléfono: [número]
  ID: [confirmation_code]

Cultura e historia:
- Eres un experto apasionado en historia mundial y en los museos del mundo (Louvre, British Museum, Metropolitan, Prado, Vaticano, Antropologia de CDMX, etc.).
- Cuando pregunten por historia, arte, museos, noticias o hechos actuales, entrega datos precisos y actualizados; si buscas en internet, cita la fuente de forma breve.
- Relaciona cuando sea natural la historia y los museos con los tours de LuxRides (ej. Teotihuacan, Frida Kahlo, Antropologia), pero sin inventar precios.
`;

const LOVOX_TOURS_CATALOG = `

Catalogo oficial LuxRides (base comercial):

LUXRIDES - Catalogo Premium de Tours
Transporte Ejecutivo VIP en CDMX | Chofer privado en CDMX. Sedan VIP y SUV de lujo.
Sitio web: https://luxrides.online | Telefono: +52 55 2772 9551

1) Piramides de Teotihuacan y Basilica de Guadalupe
- Descripcion: Recorra la Calzada de los Muertos y descubra las Piramides del Sol y la Luna, el Palacio de Quetzalpapalotl y el Templo de Quetzalcoatl (150 a.C. - 750 d.C.). Visite tambien la Basilica de Guadalupe (1531 d.C.), hogar del manto sagrado de la Virgen Maria.
- Incluye: Transporte redondo, guia bilingue certificado, entradas a la Basilica de Guadalupe.
- Duracion: 7-8 horas (Inicia: 8:00 AM, salidas diarias).
- Precios:
  - 1 a 3 personas: $4,000 MXN
  - 4 en adelante: $1,600 MXN ($1,350 por persona en grupo)
- Contacto: +52 55 2772 9551 | hola@toursteotihuacan.mx | @toursteotihuacan

2) Vuelo en Globo sobre Teotihuacan
- Descripcion: Descubra la magia de volar en globo sobre la Ciudad de los Dioses.
- Incluye: Transporte redondo, vuelo en canastilla compartida, bebida de bienvenida (cafe o te), brindis tradicional y desayuno. Pregunte por vuelos privados.
- Duracion: 4-5 horas (Inicia: 4:40 AM, salidas diarias).
- Precios:
  - 1 a 3 personas: $3,000 MXN
  - 4 a 6 personas: $4,000 MXN
  - Servicio individual por persona: $2,400 MXN

3) Xochimilco, Coyoacan y Museo Frida Kahlo
- Descripcion: Recorra los canales de Xochimilco a bordo de una trajinera tradicional mexicana. Explore Coyoacan, el Museo Frida Kahlo, la UNAM y el Estadio Olimpico 68.
- Incluye: Transporte redondo, guia bilingue certificado, entradas al museo y paseo en trajinera (1 hora incluida; hora extra: $800 MXN).
- Duracion: 7 horas (Inicia: 9:00 AM, salidas de martes a domingo).
- Precios:
  - 1 a 3 personas (servicio personalizado): $4,400 MXN
  - 4 en adelante (servicio personalizado): $1,700 MXN
  - Grupo compartido: $1,150 MXN por persona

4) Taxco y Cuernavaca
- Descripcion: Visite Cuernavaca (la ciudad de la eterna primavera) y su catedral del siglo XVI. Recorra Taxco de Alarcon, famoso por su arquitectura blanca, calles empedradas, la Iglesia de Santa Prisca, la Plaza Borda y su plateria.
- Incluye: Transporte redondo, seguro de viajero, guia bilingue certificado, caminata en centros historicos y entradas.
- Duracion: 11 horas (Inicia: 7:30 AM, salidas diarias, minimo 5 personas).
- Precios:
  - 1 a 3 personas: $8,000 MXN
  - 4 a 6 personas: $12,000 MXN

5) Puebla y Cholula
- Descripcion: Descubra Puebla (joya colonial) y Cholula, hogar de la piramide mas grande del mundo.
- Precios:
  - 1 a 3 personas: $7,000 MXN
  - 4 a 6 personas: $11,000 MXN

6) San Miguel de Allende
- Descripcion: Un viaje en el tiempo cargado de arte, historia y cultura colonial.
- Incluye: Transporte redondo, guia bilingue certificado y entradas.
- Duracion: 11 horas (Sabados, inicia 7:00 AM).
- Precios:
  - 1 a 3 personas: $9,000 MXN
  - 4 a 6 personas: $12,000 MXN
- Contacto: +52 55 2772 9551 | hola@sitioincreible.com

7) City Tour Ciudad de Mexico
- Descripcion: Una inmersion total en la historia y grandeza de la CDMX, incluyendo el Museo Nacional de Antropologia.
- Duracion: 4-5 horas (Inicia: 9:00 AM, salidas diarias excepto lunes).
- Incluye: Transporte redondo con lujo de entretenimiento, guias turisticos certificados y entradas al museo.
- Tarifa por hora: $700 MXN por hora (minimo 3 horas).

8) Mariposa Monarca y Valle de Bravo
- Descripcion: Maravillate con el santuario de la mariposa monarca (en temporada invernal desde Canada y EE. UU.) y recorre el Valle de Bravo junto a la presa Miguel Aleman.
- Duracion: 11-12 horas (del 20 de noviembre en adelante, diario, inicia 7:00 AM, minimo 5 personas).
- Precios:
  - 1 a 3 personas: $9,000 MXN
  - 4 a 6 personas: $12,500 MXN

9) Avandaro - Valle de Bravo (Tu Refugio)
- Descripcion: Naturaleza que inspira, desconecta, respira y vive el encanto de Avandaro.
- Precios:
  - 1 a 3 personas: $7,000 MXN
  - 4 a 6 personas: $9,500 MXN

10) Servicios de Transporte Ejecutivo / Transportation Services
- Descripcion: Servicios de transporte ejecutivo, sedan VIP y SUV de lujo (Cadillac Escalade o similares).
- Incluye: Transporte especializado, servicios administrativos, financieros, traslados al aeropuerto, hospital, distrito, servicios de contacto, posadas, medicos, atencion a emergencias, snacks y total disposicion ejecutiva.

LuxRides Mexico (c) 2026. Todos los derechos reservados.
`;

function shouldAttachToursCatalog(messages) {
  const lastUser = [...messages].reverse().find((m) => String(m?.role || '').toLowerCase() === 'user');
  const text = String(lastUser?.content || '').toLowerCase();
  if (!text) return false;
  return /(tour|tours|teotihuacan|xochimilco|coyoacan|frida|taxco|cuernavaca|puebla|cholula|san miguel|city tour|monarca|valle de bravo|avandaro|globo|basilica|guadalupe|precio|cost|cotizacion|paquete)/.test(text);
}

function shouldUseWebSearch(messages) {
  const lastUser = [...messages].reverse().find((m) => String(m?.role || '').toLowerCase() === 'user');
  const text = String(lastUser?.content || '').toLowerCase();
  if (!text) return false;
  return /(noticia|noticias|hoy|actual|reciente|ultima hora|ultimas|clima|tiempo|dolar|tipo de cambio|precio del|quien gano|resultado|historia|historico|museo|museos|louvre|prado|british museum|metropolitan|vaticano|antropologia|arte|pintura|escultura|civilizacion|imperio|guerra|siglo|dinastia|patrimonio|unesco|que paso|que sucedio|cuando|en que ano|quien fue|biografia)/.test(text);
}

function isReservationIntent(messages) {
  const lastUser = [...messages].reverse().find((m) => String(m?.role || '').toLowerCase() === 'user');
  const text = String(lastUser?.content || '').toLowerCase();
  if (!text) return false;
  return /(reserva|reservar|book|booking|confirmar|agendar|cotizar traslado|quiero un viaje|pickup|drop off|por tiempo|por kilometraje)/.test(text);
}

function extractReservationFacts(messages) {
  const text = messages
    .filter((m) => String(m?.role || '').toLowerCase() === 'user')
    .map((m) => String(m?.content || ''))
    .join('\n');

  const hasPassengerName = /(mi nombre es|pasajero|nombre[:\s]|soy\s+[a-záéíóúñ])/i.test(text);
  const hasConfirmationCode = /(confirmation[_\s-]?code|codigo de confirmacion|c[oó]digo[:\s]|CONF-[A-Z0-9-]+)/i.test(text);
  return { hasPassengerName, hasConfirmationCode };
}

function reservationGuardPrompt(messages) {
  if (!isReservationIntent(messages)) return '';
  const facts = extractReservationFacts(messages);
  const missing = [];
  if (!facts.hasPassengerName) missing.push('passenger_name');
  if (!facts.hasConfirmationCode) missing.push('confirmation_code');

  if (!missing.length) {
    return 'Reserva en progreso: ya existe passenger_name y confirmation_code. Continua con resumen y cierre.';
  }

  return 'Reserva en progreso: faltan campos obligatorios -> ' + missing.join(', ') + '. No confirmes la reserva hasta recolectarlos.';
}

function shouldFetchHotelsContext(messages) {
  const lastUser = [...messages].reverse().find((m) => String(m?.role || '').toLowerCase() === 'user');
  const text = String(lastUser?.content || '').toLowerCase();
  if (!text) return false;
  return /(hotel|hoteles|hospedaje|alojamiento|zona hotelera|resort|check-?in|check-?out|habita|suite)/.test(text);
}

function normalizeHotelsPayload(data) {
  const list = data?.results || data?.hotels || data?.items || data?.data || [];
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map((h, i) => {
    const name = h?.name || h?.hotel_name || h?.title || 'Hotel ' + (i + 1);
    const zone = h?.zone || h?.area || h?.location || h?.city || '';
    const price = h?.price || h?.rate || h?.nightly_price || h?.from || '';
    return { name: String(name), zone: String(zone || ''), price: String(price || '') };
  });
}

async function fetchHotelsContext(messages) {
  if (!env.hotelsApiKey || !env.hotelsApiUrl) return '';
  if (!shouldFetchHotelsContext(messages)) return '';
  const lastUser = [...messages].reverse().find((m) => String(m?.role || '').toLowerCase() === 'user');
  const query = String(lastUser?.content || '').trim();
  if (!query) return '';

  try {
    const res = await fetch(env.hotelsApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.hotelsApiKey
      },
      body: JSON.stringify({ query, limit: 8 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return '';
    const hotels = normalizeHotelsPayload(data);
    if (!hotels.length) return '';

    const lines = hotels.map((h, idx) => {
      const zone = h.zone ? (' | zona: ' + h.zone) : '';
      const price = h.price ? (' | precio: ' + h.price) : '';
      return (idx + 1) + '. ' + h.name + zone + price;
    });
    return 'Contexto actualizado de hoteles (API externa):\n' + lines.join('\n');
  } catch {
    return '';
  }
}

async function withLovoxContext(messages) {
  const hotelsContext = await fetchHotelsContext(messages);
  const reservationGuard = reservationGuardPrompt(messages);
  const systemContent = shouldAttachToursCatalog(messages)
    ? (LOVOX_SYSTEM_PROMPT_BASE + '\n' + LOVOX_TOURS_CATALOG)
    : LOVOX_SYSTEM_PROMPT_BASE;

  let finalSystem = systemContent;
  if (hotelsContext) {
    finalSystem += '\n\n' + hotelsContext + '\n\nSi el usuario pregunta por hoteles, prioriza esta informacion.';
  }
  if (reservationGuard) {
    finalSystem += '\n\n' + reservationGuard;
  }

  return [
    { role: 'system', content: finalSystem },
    ...messages
  ];
}

async function llamarGroq(model, contextMessages, maxTokens) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.groqApiKey
    },
    body: JSON.stringify({
      model,
      messages: contextMessages,
      max_tokens: maxTokens,
      temperature: 0.75
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Groq API error');
    err.status = res.status;
    throw err;
  }
  return data?.choices?.[0]?.message?.content || '';
}

export async function completarChat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('messages must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const contextMessages = await withLovoxContext(messages);
  const usarBusquedaWeb = shouldUseWebSearch(messages);

  if (usarBusquedaWeb) {
    try {
      const reply = await llamarGroq('groq/compound', contextMessages, 1200);
      if (reply) return reply;
    } catch (error) {
      // Busquedas amplias pueden desbordar el contexto de compound (413) o el limite TPM (429). Se reintenta sin web.
      console.warn('[lovox] compound fallo, fallback a modelo rapido:', error.message);
    }
  }

  return llamarGroq('llama-3.3-70b-versatile', contextMessages, 800);
}
