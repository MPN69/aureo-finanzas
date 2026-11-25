(function (global) {
  'use strict';

  const U = global.AureoUtils;

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/)[0] || '';
    const counts = {
      ',': (firstLine.match(/,/g) || []).length,
      ';': (firstLine.match(/;/g) || []).length,
      '\t': (firstLine.match(/\t/g) || []).length
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
  }

  function parseCSVText(text) {
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean) return { headers: [], rows: [] };
    const delim = detectDelimiter(clean);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      const next = clean[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field.trim());
      rows.push(row);
    }

    const headers = rows[0] || [];
    const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== ''));
    return { headers, rows: dataRows };
  }

  function guessColumnMapping(headers) {
    const findIdx = (patterns) => headers.findIndex((h) => patterns.some((p) => h.toLowerCase().includes(p)));
    return {
      date: Math.max(0, findIdx(['fecha', 'date', 'día', 'dia', 'f. op'])),
      merchant: Math.max(0, findIdx(['descrip', 'concepto', 'comercio', 'merchant', 'detalle', 'movimiento', 'memo'])),
      amount: findIdx(['monto', 'importe', 'amount', 'valor', 'total']),
      debit: findIdx(['cargo', 'retiro', 'débito', 'debito', 'egreso', 'debit']),
      credit: findIdx(['abono', 'depósito', 'deposito', 'crédito', 'credito', 'ingreso', 'credit'])
    };
  }

  function normalizeDateString(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${U.pad2(m[2])}-${U.pad2(m[3])}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${U.pad2(m[2])}-${U.pad2(m[1])}`;
    }
    return U.todayISO();
  }

  function parseNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return 0;
    let s = String(raw).replace(/[^0-9.,-]/g, '').trim();
    if (!s) return 0;
    // Handle 1.234,56 vs 1,234.56
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',') && /,\d{2}$/.test(s)) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    return Number(s) || 0;
  }

  function buildTransactionsFromCSV(parsed, mapping, opts, store) {
    const existing = store.state.transactions;
    const imported = [];
    let duplicates = 0;

    for (const r of parsed.rows) {
      const date = normalizeDateString(r[mapping.date]);
      const merchant = (r[mapping.merchant] || 'Movimiento Bancario').trim();
      let signedAmt = 0;
      if (mapping.amount >= 0) {
        signedAmt = parseNumber(r[mapping.amount]);
      } else {
        const deb = mapping.debit >= 0 ? Math.abs(parseNumber(r[mapping.debit])) : 0;
        const cred = mapping.credit >= 0 ? Math.abs(parseNumber(r[mapping.credit])) : 0;
        signedAmt = cred - deb;
      }
      if (signedAmt === 0) continue;

      const type = signedAmt > 0 ? 'income' : 'expense';
      const amount = Math.round(Math.abs(signedAmt) * 100) / 100;

      const isDup = existing.some((t) => t.date === date && Math.abs(t.amount - amount) < 0.01 && (t.merchant || '').toLowerCase() === merchant.toLowerCase());
      if (isDup) {
        duplicates++;
        continue;
      }

      const draft = {
        type,
        date,
        time: '12:00',
        amount,
        currency: opts.currency || store.getBaseCurrency(),
        accountId: opts.accountId,
        categoryId: type === 'income' ? 'cat_other_inc' : global.AureoAI.matchCategoryId(merchant, store.state.categories, 'expense'),
        merchant,
        memo: 'Importado CSV',
        tags: ['csv'],
        items: [],
        scope: opts.scope || 'personal',
        paidBy: opts.paidBy || 'a',
        splitMode: opts.scope === 'couple' ? '50_50' : '100_a',
        splitRatioA: opts.scope === 'couple' ? 50 : 100
      };
      store.applyAutoRules(draft);
      imported.push(draft);
    }
    return { imported, duplicates };
  }

  function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportTransactionsCSV(transactions, store) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Fecha', 'Hora', 'Tipo', 'Comercio/Concepto', 'Categoría', 'Cuenta', 'Cuenta Destino', 'Monto', 'Moneda', 'Ámbito', 'Pagado Por', 'Notas', 'Artículos', 'Etiquetas'];
    const lines = [header.map(q).join(',')];

    for (const tx of transactions) {
      const cat = store.getCategory(tx.categoryId)?.name || (tx.type === 'transfer' ? 'Transferencia' : 'Sin categoría');
      const acc = store.getAccount(tx.accountId)?.name || '';
      const toAcc = tx.toAccountId ? (store.getAccount(tx.toAccountId)?.name || '') : '';
      const itemsStr = (tx.items || []).map((i) => `${i.name}:${i.amount}`).join(' | ');
      const tagsStr = (tx.tags || []).join(';');
      lines.push([
        tx.date, tx.time || '', tx.type, tx.merchant, cat, acc, toAcc,
        tx.amount, tx.currency, tx.scope, tx.paidBy, tx.memo || '', itemsStr, tagsStr
      ].map(q).join(','));
    }

    // UTF-8 BOM for clean Windows Excel compatibility
    downloadFile(`aureo-finanzas-${U.todayISO()}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  global.AureoCSV = {
    parseCSVText,
    guessColumnMapping,
    buildTransactionsFromCSV,
    exportTransactionsCSV,
    downloadFile
  };
})(window);
