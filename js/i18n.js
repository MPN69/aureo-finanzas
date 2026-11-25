(function (global) {
  'use strict';

  const CURRENCIES = {
    MXN: { symbol: '$', code: 'MXN', name: 'Peso Mexicano', locale: 'es-MX' },
    USD: { symbol: '$', code: 'USD', name: 'Dólar Estadounidense', locale: 'en-US' },
    EUR: { symbol: '€', code: 'EUR', name: 'Euro', locale: 'es-ES' },
    JPY: { symbol: '¥', code: 'JPY', name: 'Yen Japonés', locale: 'ja-JP', decimals: 0 },
    CAD: { symbol: '$', code: 'CAD', name: 'Dólar Canadiense', locale: 'en-CA' },
    GBP: { symbol: '£', code: 'GBP', name: 'Libra Esterlina', locale: 'en-GB' },
    COP: { symbol: '$', code: 'COP', name: 'Peso Colombiano', locale: 'es-CO', decimals: 0 },
    ARS: { symbol: '$', code: 'ARS', name: 'Peso Argentino', locale: 'es-AR' },
    CLP: { symbol: '$', code: 'CLP', name: 'Peso Chileno', locale: 'es-CL', decimals: 0 }
  };

  const DEFAULT_RATES_TO_MXN = {
    MXN: 1,
    USD: 20.15,
    EUR: 21.30,
    JPY: 0.132,
    CAD: 14.40,
    GBP: 25.40,
    COP: 0.0046,
    ARS: 0.020,
    CLP: 0.021
  };

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseISODate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function nowTime() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function formatMoney(amount, currency = 'MXN', opts = {}) {
    const meta = CURRENCIES[currency] || CURRENCIES.MXN;
    const decimals = opts.decimals !== undefined ? opts.decimals : (meta.decimals !== undefined ? meta.decimals : 2);
    const num = Number(amount) || 0;
    const abs = Math.abs(num);
    const formatted = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: opts.compact ? 0 : decimals,
      maximumFractionDigits: opts.compact ? 1 : decimals,
      notation: opts.compact && abs >= 10000 ? 'compact' : 'standard'
    }).format(abs);
    const sign = num < 0 ? '-' : (opts.showPlus && num > 0 ? '+' : '');
    const suffix = opts.showCode ? ` ${meta.code}` : '';
    return `${sign}${meta.symbol}${formatted}${suffix}`;
  }

  function convertCurrency(amount, fromCurrency, toCurrency, ratesMap) {
    const num = Number(amount) || 0;
    if (!fromCurrency || fromCurrency === toCurrency) return num;
    const rates = Object.assign({}, DEFAULT_RATES_TO_MXN, ratesMap || {});
    const fromRate = Number(rates[fromCurrency]) || 1;
    const toRate = Number(rates[toCurrency]) || 1;
    return (num * fromRate) / toRate;
  }

  function getCycleRange(refISO, paydayDay = 1, cycleMode = 'monthly') {
    const ref = parseISODate(refISO || todayISO());
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const d = ref.getDate();

    if (cycleMode === 'biweekly') {
      if (d <= 15) {
        const start = new Date(y, m, 1);
        const end = new Date(y, m, 15);
        return {
          start: toISODate(start),
          end: toISODate(end),
          label: `1–15 ${start.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`
        };
      }
      const start = new Date(y, m, 16);
      const end = new Date(y, m, daysInMonth(y, m));
      return {
        start: toISODate(start),
        end: toISODate(end),
        label: `16–${end.getDate()} ${start.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`
      };
    }

    const pDay = Math.max(1, Math.min(28, Number(paydayDay) || 1));
    if (pDay === 1) {
      const start = new Date(y, m, 1);
      const end = new Date(y, m, daysInMonth(y, m));
      return {
        start: toISODate(start),
        end: toISODate(end),
        label: start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
      };
    }

    let start, end;
    if (d >= pDay) {
      start = new Date(y, m, Math.min(pDay, daysInMonth(y, m)));
      const nextM = m + 1;
      const nextY = y + Math.floor(nextM / 12);
      const normM = nextM % 12;
      end = new Date(nextY, normM, Math.min(pDay, daysInMonth(nextY, normM)) - 1);
    } else {
      const prevM = m - 1;
      const prevY = prevM < 0 ? y - 1 : y;
      const normPrevM = (prevM + 12) % 12;
      start = new Date(prevY, normPrevM, Math.min(pDay, daysInMonth(prevY, normPrevM)));
      end = new Date(y, m, Math.min(pDay, daysInMonth(y, m)) - 1);
    }
    const fmt = (dt) => dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    return {
      start: toISODate(start),
      end: toISODate(end),
      label: `${fmt(start)} – ${fmt(end)}`
    };
  }

  function shiftCycleRef(refISO, delta, paydayDay = 1, cycleMode = 'monthly') {
    const range = getCycleRange(refISO, paydayDay, cycleMode);
    const start = parseISODate(range.start);
    if (cycleMode === 'biweekly') {
      if (delta > 0) {
        return start.getDate() === 1
          ? toISODate(new Date(start.getFullYear(), start.getMonth(), 16))
          : toISODate(new Date(start.getFullYear(), start.getMonth() + 1, 1));
      }
      return start.getDate() === 16
        ? toISODate(new Date(start.getFullYear(), start.getMonth(), 1))
        : toISODate(new Date(start.getFullYear(), start.getMonth() - 1, 16));
    }
    const shifted = new Date(start.getFullYear(), start.getMonth() + delta, start.getDate());
    return toISODate(shifted);
  }

  function formatDateHuman(iso) {
    if (!iso) return '';
    const d = parseISODate(iso);
    const today = todayISO();
    if (iso === today) return 'Hoy';
    const yest = toISODate(new Date(Date.now() - 86400000));
    if (iso === yest) return 'Ayer';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function daysRemainingInRange(endISO) {
    const today = parseISODate(todayISO());
    const end = parseISODate(endISO);
    const diff = Math.floor((end - today) / 86400000) + 1;
    return Math.max(1, diff);
  }

  global.AureoUtils = {
    CURRENCIES,
    DEFAULT_RATES_TO_MXN,
    esc,
    pad2,
    toISODate,
    parseISODate,
    todayISO,
    nowTime,
    daysInMonth,
    formatMoney,
    convertCurrency,
    getCycleRange,
    shiftCycleRef,
    formatDateHuman,
    daysRemainingInRange
  };
})(window);
