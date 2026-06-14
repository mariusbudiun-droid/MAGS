// Vercel Serverless Function — api/import-roster.js
// Riceve un'immagine base64, chiama Gemini 2.5 Flash Vision, restituisce il roster strutturato in JSON.
//
// Riuso dalla stessa logica collaudata di CrewPSR.
// Variabile d'ambiente richiesta: GEMINI_API_KEY (su Vercel — Settings → Environment Variables).
// Ottienine una su https://aistudio.google.com/apikey (senza carta di credito).

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY non configurata sul server' });

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Nessuna immagine fornita' });

  const prompt = `You are extracting roster data from a Ryanair Connect screenshot.

This is a CABIN CREW roster from Ryanair Connect. Cabin crew at PSR follow a 16-day cycle: 5 Early + 3 Off + 5 Late + 3 Off.

Analyze this roster screenshot and extract ALL visible duty days.

IMPORTANT: Times in Ryanair Connect are in UTC (Zulu time). Return them EXACTLY as shown — do NOT convert. The app will handle timezone conversion.

For each day return:
- date: "YYYY-MM-DD"
- type: one of "flight", "hsby", "ad", "off", "al", "vto", "sick", "ul", "pl"
- assignment: one of "A1E", "A1L", "A2E", "A2L", "HSBY", "AD", "OFF", "AL", "VTO", "SICK", "UL", "PL", "CUSTOM"
  (A1E = Aereo 1 Early, A1L = Aereo 1 Late, A2E = Aereo 2 Early, A2L = Aereo 2 Late)
  If you cannot determine A1/A2 or Early/Late, use "CUSTOM"
- flights: array of flight objects (only if type is "flight"):
  { from: "PSR", to: "STN", dep: "06:25", arr: "08:05", flightNum: "FR1234" }
- hsbyStart: "HH:MM" in UTC (only if HSBY or AD, if visible)
- hsbyEnd: "HH:MM" in UTC (only if HSBY or AD, if visible)

Rules:
- Departure airport is almost always PSR (Pescara)
- Return ALL times exactly as shown in UTC — do not adjust for timezone
- Time format MUST be "HH:MM" exactly — no "Z", no "UTC", no seconds, no AM/PM. Examples: "06:25", "14:50", "23:10". WRONG: "06:25 Z", "06:25 UTC", "6:25am".
- If a day shows flight numbers and routes, it's a flight day
- HSBY = Home Standby, AD = Airport Duty
- OFF = day off (including rest days)
- AL = Annual Leave / holidays / ferie. Recognise it also when shown as "ANNUAL LEAVE", "A/L", "AL", "HOL", "LEAVE", "FERIE". Mark these days as type "al" — INCLUDING days far in the future. Always capture every annual-leave day visible, even months ahead.
- Only include days clearly visible in the screenshot

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "date": "2026-04-21",
    "type": "flight",
    "assignment": "A1E",
    "flights": [
      {"from": "PSR", "to": "STN", "dep": "04:25", "arr": "06:05", "flightNum": "FR1234"},
      {"from": "STN", "to": "PSR", "dep": "06:45", "arr": "08:30", "flightNum": "FR1235"}
    ]
  }
]`;

  // Gemini 2.5 Flash — free tier più generoso di Pro su account nuovi.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: mediaType || 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      if (response.status === 429) {
        return res.status(429).json({ error: 'Limite giornaliero raggiunto. Riprova domani.', detail: errText });
      }
      if (response.status === 403 || response.status === 401) {
        return res.status(500).json({ error: 'API key non valida o quota esaurita.', detail: errText });
      }
      return res.status(500).json({ error: `Gemini API error ${response.status}`, detail: errText });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      return res.status(500).json({ error: 'Gemini ha restituito una risposta vuota', detail: data });
    }

    const clean = text.replace(/```json|```/g, '').trim();
    const finishReason = data.candidates?.[0]?.finishReason;

    let days;
    try {
      days = JSON.parse(clean);
    } catch (parseErr) {
      const truncated = finishReason === 'MAX_TOKENS';
      return res.status(500).json({
        error: truncated
          ? 'Risposta troppo lunga. Prova uno screenshot con meno giorni alla volta.'
          : 'L\'AI ha restituito un JSON non valido. Riprova con uno screenshot più nitido.',
        finishReason,
        detail: clean.slice(0, 200),
      });
    }

    if (!Array.isArray(days)) {
      return res.status(500).json({ error: 'Formato non valido. Riprova con uno screenshot più chiaro.' });
    }

    function sanitiseTime(t) {
      if (!t || typeof t !== 'string') return t;
      const m = t.match(/(\d{1,2}):(\d{2})/);
      if (!m) return t;
      return `${m[1].padStart(2, '0')}:${m[2]}`;
    }
    for (const day of days) {
      if (day.hsbyStart) day.hsbyStart = sanitiseTime(day.hsbyStart);
      if (day.hsbyEnd)   day.hsbyEnd   = sanitiseTime(day.hsbyEnd);
      if (Array.isArray(day.flights)) {
        for (const f of day.flights) {
          if (f.dep) f.dep = sanitiseTime(f.dep);
          if (f.arr) f.arr = sanitiseTime(f.arr);
        }
      }
    }

    return res.status(200).json({ success: true, days });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
}
