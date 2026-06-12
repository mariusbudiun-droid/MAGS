// Vercel Serverless Function — api/import-spesa.js
// Riceve un'immagine base64 (screenshot di una lista della spesa: Alexa, Google Keep, note...),
// chiama Gemini 2.5 Flash Vision e restituisce l'elenco delle voci in JSON.
// Variabile d'ambiente richiesta: GEMINI_API_KEY (la stessa già usata dal roster).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY non configurata sul server' });

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Nessuna immagine fornita' });

  const prompt = `Stai leggendo lo screenshot di una lista della spesa (può venire da Alexa, Google Keep, Note, WhatsApp o simili).

Estrai TUTTE le voci della lista, una per riga. Regole:
- Restituisci ogni prodotto come stringa breve e pulita, in italiano, senza numeri di riga, pallini, checkbox o emoji.
- Mantieni eventuali quantità se presenti (es. "2 litri latte", "pane 1kg").
- Ignora titoli, intestazioni, date, nomi dell'app, pubblicità.
- Non inventare prodotti non presenti.
- Se la stessa voce compare due volte, includila una volta sola.

Rispondi SOLO con un oggetto JSON in questo formato, senza testo prima o dopo, senza markdown:
{ "items": ["voce 1", "voce 2", "voce 3"] }`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mediaType || 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 }
    };

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: `Gemini API error ${r.status}`, detail: t.slice(0, 300) });
    }

    const data = await r.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'Risposta non valida dall\'AI', raw: text.slice(0, 300) }); }

    const items = Array.isArray(parsed.items) ? parsed.items.map(s => String(s).trim()).filter(Boolean) : [];
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ error: 'Errore server: ' + (e.message || e) });
  }
}
