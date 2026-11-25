(function (global) {
  'use strict';

  const U = global.AureoUtils;

  function compressImageFile(file, maxDim = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagen no válido.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          resolve({ dataUrl, base64, mimeType: 'image/jpeg' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function matchCategoryId(suggestedName, categories, type = 'expense') {
    const list = (categories || []).filter((c) => c.type === type);
    if (!suggestedName || !list.length) return list[0]?.id || null;
    const norm = suggestedName.toLowerCase();
    const exact = list.find((c) => c.name.toLowerCase() === norm);
    if (exact) return exact.id;
    const partial = list.find((c) => norm.includes(c.name.toLowerCase().split(' ')[0]) || c.name.toLowerCase().includes(norm));
    if (partial) return partial.id;

    // Keyword heuristics
    const rules = [
      { keys: ['super', 'despensa', 'walmart', 'heb', 'soriana', 'fresko', 'chedraui', 'oxxo', 'abarrotes', 'fruta', 'leche', 'pan', 'carne', 'food', 'grocer'], id: 'cat_food' },
      { keys: ['cafe', 'café', 'starbucks', 'restaurante', 'tacos', 'pizza', 'comida', 'cena', 'almuerzo', 'bebida', 'restaurant'], id: 'cat_dining' },
      { keys: ['uber', 'didi', 'gasolina', 'pemex', 'estacionamiento', 'caseta', 'metro', 'transporte', 'taxi'], id: 'cat_transport' },
      { keys: ['farmacia', 'medicina', 'doctor', 'hospital', 'salud', 'consulta', 'guadalajara', 'san pablo'], id: 'cat_health' },
      { keys: ['luz', 'cfe', 'agua', 'internet', 'telmex', 'totalplay', 'telcel', 'at&t', 'gas'], id: 'cat_utilities' },
      { keys: ['renta', 'hogar', 'limpieza', 'detergente', 'jabon', 'jabón', 'home depot', 'ikea'], id: 'cat_home' },
      { keys: ['netflix', 'spotify', 'cine', 'amazon', 'suscrip', 'juego'], id: 'cat_subs' },
      { keys: ['ropa', 'zara', 'calzado', 'peluqueria', 'cuidado'], id: 'cat_personal' }
    ];
    for (const r of rules) {
      if (r.keys.some((k) => norm.includes(k))) {
        const found = list.find((c) => c.id === r.id);
        if (found) return found.id;
      }
    }
    return list[list.length - 1]?.id || list[0]?.id || null;
  }

  async function extractReceiptWithGemini({
    base64,
    mimeType,
    apiKey,
    model = "gemini-3.8-flash",
    categories = [],
  }) {
    if (!apiKey) {
      throw new Error(
        "Falta configurar tu Gemini API Key en Ajustes para escanear fotos con IA.",
      );
    }

    const categoryNames = categories
      .filter((c) => c.type === "expense")
      .map((c) => c.name)
      .join(", ");
    const prompt = `Analiza este recibo o ticket de compra y extrae los datos en JSON estricto con esta estructura:
{
  "merchant": "nombre de la tienda o comercio",
  "date": "YYYY-MM-DD (si no aparece, usa ${U.todayISO()})",
  "time": "HH:mm (24h, o ${U.nowTime()} si no aparece)",
  "currency": "MXN o USD o EUR según el recibo",
  "total": numero decimal del total pagado,
  "suggestedCategoryName": "elige la mejor de: ${categoryNames}",
  "items": [
    {
      "name": "nombre del artículo",
      "amount": numero decimal del importe de esa línea,
      "suggestedCategoryName": "elige la mejor de: ${categoryNames}"
    }
  ],
  "memo": "resumen breve opcional"
}
Reglas: solo devuelve JSON válido, sin texto adicional. Si hay descuento, refléjalo en el total o como línea negativa.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      if (resp.status === 404) {
        throw new Error(
          `El modelo "${model}" no está disponible en tu endpoint Gemini (404). Prueba con gemini-3.8-flash, gemini-4-hydrogen o gemini-4-carbon.`,
        );
      }
      throw new Error(
        `Error de Gemini API (${resp.status}): ${errBody.slice(0, 180)}`,
      );
    }

    const payload = await resp.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    return normalizeExtractedReceipt(parsed, categories);
  }

  function normalizeExtractedReceipt(parsed, categories) {
    const items = Array.isArray(parsed.items) ? parsed.items.map((it, idx) => ({
      id: `item_${Date.now()}_${idx}`,
      name: String(it.name || 'Artículo').trim(),
      amount: Math.round((Number(it.amount) || 0) * 100) / 100,
      categoryId: matchCategoryId(it.suggestedCategoryName || it.name, categories, 'expense')
    })).filter((it) => it.amount !== 0) : [];

    const totalNum = Number(parsed.total) || items.reduce((s, i) => s + i.amount, 0);
    return {
      merchant: String(parsed.merchant || 'Comercio').trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ? parsed.date : U.todayISO(),
      time: /^\d{2}:\d{2}$/.test(parsed.time || '') ? parsed.time : U.nowTime(),
      currency: U.CURRENCIES[parsed.currency] ? parsed.currency : 'MXN',
      total: Math.round(totalNum * 100) / 100,
      categoryId: matchCategoryId(parsed.suggestedCategoryName || parsed.merchant, categories, 'expense'),
      memo: String(parsed.memo || '').trim(),
      items
    };
  }

  function parseReceiptTextLocal(rawText, categories = []) {
    const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Pega el texto del ticket para analizarlo.');

    const merchant = lines[0].replace(/[*#=]/g, '').trim() || 'Comercio';
    let date = U.todayISO();
    let total = 0;
    const items = [];

    const dateMatch = rawText.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (dateMatch) {
      if (dateMatch[1]) {
        date = `${dateMatch[1]}-${U.pad2(dateMatch[2])}-${U.pad2(dateMatch[3])}`;
      } else {
        const yr = dateMatch[6].length === 2 ? `20${dateMatch[6]}` : dateMatch[6];
        date = `${yr}-${U.pad2(dateMatch[5])}-${U.pad2(dateMatch[4])}`;
      }
    }

    for (const line of lines.slice(1)) {
      const m = line.match(/^(.+?)\s+\$?\s*(\d{1,6}(?:[.,]\d{2}))$/);
      if (!m) continue;
      const label = m[1].trim();
      const val = Number(m[2].replace(',', '.'));
      if (/total|importe|pagar|venta/i.test(label) && !/subtotal/i.test(label)) {
        total = Math.max(total, val);
      } else if (!/iva|impuesto|cambio|efectivo|subtotal|tarjeta/i.test(label)) {
        items.push({
          id: `item_${Date.now()}_${items.length}`,
          name: label,
          amount: val,
          categoryId: matchCategoryId(label, categories, 'expense')
        });
      }
    }

    if (!total && items.length) {
      total = items.reduce((s, i) => s + i.amount, 0);
    }

    return {
      merchant,
      date,
      time: U.nowTime(),
      currency: 'MXN',
      total: Math.round(total * 100) / 100,
      categoryId: matchCategoryId(merchant, categories, 'expense'),
      memo: 'Ticket analizado localmente',
      items
    };
  }

  global.AureoAI = {
    compressImageFile,
    extractReceiptWithGemini,
    parseReceiptTextLocal,
    matchCategoryId
  };
})(window);
