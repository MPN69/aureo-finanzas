(function (global) {
  'use strict';

  const U = global.AureoUtils;

  function renderDonutChart(container, slices, opts = {}) {
    if (!container) return;
    const data = (slices || []).filter((s) => s.value > 0);
    const total = data.reduce((sum, s) => sum + s.value, 0);
    if (!total) {
      container.innerHTML = `<div class="empty-state">${U.esc(opts.emptyText || 'Sin datos en este periodo')}</div>`;
      return;
    }

    const size = 188;
    const cx = size / 2;
    const cy = size / 2;
    const r = 68;
    const strokeW = 24;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    const arcs = data.map((s, idx) => {
      const pct = s.value / total;
      const dash = pct * circ;
      const gap = circ - dash;
      const html = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${U.esc(s.color)}" stroke-width="${strokeW}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" data-idx="${idx}" style="cursor:pointer;transition:opacity .15s" />`;
      offset += dash;
      return html;
    }).join('');

    const legend = data.slice(0, 8).map((s) => {
      const pct = ((s.value / total) * 100).toFixed(1);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;padding:4px 0;">
          <div style="display:flex;align-items:center;gap:7px;min-width:0;">
            <span style="width:10px;height:10px;border-radius:3px;background:${U.esc(s.color)};flex-shrink:0;"></span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${U.esc(s.icon ? s.icon + ' ' : '')}${U.esc(s.label)}</span>
          </div>
          <div class="num" style="white-space:nowrap;color:var(--text-secondary);">
            <strong style="color:var(--text-primary);">${U.formatMoney(s.value, opts.currency, { compact: true })}</strong>
            <span style="font-size:11px;margin-left:4px;">${pct}%</span>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="chart-box" style="display:grid;grid-template-columns:190px 1fr;gap:18px;align-items:center;">
        <div style="position:relative;width:188px;height:188px;margin:0 auto;">
          <svg viewBox="0 0 ${size} ${size}" width="188" height="188" style="transform:rotate(-90deg);">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-input)" stroke-width="${strokeW}" />
            ${arcs}
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center;">
            <span style="font-size:11px;color:var(--text-muted);">${U.esc(opts.centerLabel || 'Total')}</span>
            <strong class="num" style="font-size:15px;">${U.formatMoney(total, opts.currency, { compact: true })}</strong>
          </div>
        </div>
        <div>${legend}</div>
        <div class="chart-tooltip"></div>
      </div>`;

    const tip = container.querySelector('.chart-tooltip');
    container.querySelectorAll('circle[data-idx]').forEach((el) => {
      el.addEventListener('mouseenter', (e) => {
        const s = data[Number(el.dataset.idx)];
        const pct = ((s.value / total) * 100).toFixed(1);
        tip.innerHTML = `<strong>${U.esc(s.label)}</strong><br>${U.formatMoney(s.value, opts.currency)} (${pct}%)`;
        tip.style.opacity = '1';
        el.style.opacity = '0.82';
      });
      el.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        tip.style.left = `${e.clientX - rect.left + 12}px`;
        tip.style.top = `${e.clientY - rect.top - 18}px`;
      });
      el.addEventListener('mouseleave', () => {
        tip.style.opacity = '0';
        el.style.opacity = '1';
      });
    });
  }

  function renderBarTrendChart(container, series, opts = {}) {
    if (!container) return;
    if (!series || !series.length) {
      container.innerHTML = `<div class="empty-state">${U.esc(opts.emptyText || 'Sin historial suficiente')}</div>`;
      return;
    }

    const w = 640;
    const h = 230;
    const padL = 56;
    const padR = 16;
    const padT = 18;
    const padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const maxVal = Math.max(100, ...series.flatMap((d) => [d.income || 0, d.expense || 0]));

    const ticks = 4;
    let gridLines = '';
    for (let i = 0; i <= ticks; i++) {
      const y = padT + (plotH * i) / ticks;
      const val = maxVal * (1 - i / ticks);
      gridLines += `
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border-subtle)" stroke-dasharray="3 3" />
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5">${U.formatMoney(val, opts.currency, { compact: true })}</text>`;
    }

    const groupW = plotW / series.length;
    const barW = Math.min(22, Math.max(8, groupW * 0.28));

    const bars = series.map((d, idx) => {
      const cx = padL + groupW * idx + groupW / 2;
      const incH = ((d.income || 0) / maxVal) * plotH;
      const expH = ((d.expense || 0) / maxVal) * plotH;
      const incY = padT + plotH - incH;
      const expY = padT + plotH - expH;
      return `
        <g class="bar-group" data-idx="${idx}" style="cursor:pointer;">
          <rect x="${cx - barW - 2}" y="${incY}" width="${barW}" height="${Math.max(1, incH)}" rx="4" fill="var(--income)" opacity="0.9" />
          <rect x="${cx + 2}" y="${expY}" width="${barW}" height="${Math.max(1, expH)}" rx="4" fill="var(--expense)" opacity="0.9" />
          <rect x="${cx - groupW / 2}" y="${padT}" width="${groupW}" height="${plotH}" fill="transparent" />
          <text x="${cx}" y="${h - 10}" text-anchor="middle" fill="var(--text-secondary)" font-size="11">${U.esc(d.label)}</text>
        </g>`;
    }).join('');

    container.innerHTML = `
      <div class="chart-box">
        <div style="display:flex;gap:16px;justify-content:flex-end;font-size:12px;margin-bottom:6px;color:var(--text-secondary);">
          <span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--income);margin-right:5px;"></i>Ingresos</span>
          <span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--expense);margin-right:5px;"></i>Gastos</span>
        </div>
        <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;">
          ${gridLines}
          ${bars}
        </svg>
        <div class="chart-tooltip"></div>
      </div>`;

    const tip = container.querySelector('.chart-tooltip');
    container.querySelectorAll('.bar-group').forEach((g) => {
      g.addEventListener('mouseenter', () => {
        const d = series[Number(g.dataset.idx)];
        const net = (d.income || 0) - (d.expense || 0);
        tip.innerHTML = `<strong>${U.esc(d.label)}</strong><br>Ingresos: ${U.formatMoney(d.income, opts.currency)}<br>Gastos: ${U.formatMoney(d.expense, opts.currency)}<br>Balance: <strong style="color:${net >= 0 ? 'var(--income)' : 'var(--expense)'}">${U.formatMoney(net, opts.currency, { showPlus: true })}</strong>`;
        tip.style.opacity = '1';
      });
      g.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        tip.style.left = `${Math.min(rect.width - 170, Math.max(8, e.clientX - rect.left + 12))}px`;
        tip.style.top = `${e.clientY - rect.top - 32}px`;
      });
      g.addEventListener('mouseleave', () => {
        tip.style.opacity = '0';
      });
    });
  }

  function renderAreaLineChart(container, points, opts = {}) {
    if (!container) return;
    if (!points || points.length < 2) {
      container.innerHTML = `<div class="empty-state">${U.esc(opts.emptyText || 'Se necesitan al menos 2 puntos')}</div>`;
      return;
    }

    const w = 640;
    const h = 210;
    const padL = 56;
    const padR = 16;
    const padT = 18;
    const padB = 32;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const vals = points.map((p) => p.value);
    const minV = Math.min(0, ...vals);
    const maxV = Math.max(100, ...vals);
    const span = Math.max(1, maxV - minV);

    const coords = points.map((p, i) => {
      const x = padL + (plotW * i) / (points.length - 1);
      const y = padT + plotH - ((p.value - minV) / span) * plotH;
      return { x, y, label: p.label, value: p.value };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
    const color = opts.color || 'var(--accent-primary)';

    const dots = coords.map((c, i) => `
      <circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${color}" stroke="var(--bg-card)" stroke-width="2" data-idx="${i}" style="cursor:pointer;" />
      ${(points.length <= 10 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1) ? `<text x="${c.x}" y="${h - 8}" text-anchor="middle" fill="var(--text-muted)" font-size="10.5">${U.esc(c.label)}</text>` : ''}
    `).join('');

    container.innerHTML = `
      <div class="chart-box">
        <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.32" />
              <stop offset="100%" stop-color="${color}" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="var(--border-subtle)" stroke-dasharray="3 3" />
          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="var(--border-subtle)" />
          <text x="${padL - 8}" y="${padT + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5">${U.formatMoney(maxV, opts.currency, { compact: true })}</text>
          <text x="${padL - 8}" y="${padT + plotH + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10.5">${U.formatMoney(minV, opts.currency, { compact: true })}</text>
          <path d="${areaPath}" fill="url(#areaGrad)" />
          <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" />
          ${dots}
        </svg>
        <div class="chart-tooltip"></div>
      </div>`;

    const tip = container.querySelector('.chart-tooltip');
    container.querySelectorAll('circle[data-idx]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const c = coords[Number(el.dataset.idx)];
        tip.innerHTML = `<strong>${U.esc(c.label)}</strong>: ${U.formatMoney(c.value, opts.currency)}`;
        tip.style.opacity = '1';
      });
      el.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        tip.style.left = `${Math.min(rect.width - 150, Math.max(8, e.clientX - rect.left + 10))}px`;
        tip.style.top = `${e.clientY - rect.top - 26}px`;
      });
      el.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
    });
  }

  function renderHorizontalBars(container, rows, opts = {}) {
    if (!container) return;
    if (!rows || !rows.length) {
      container.innerHTML = `<div class="empty-state">${U.esc(opts.emptyText || 'Sin registros')}</div>`;
      return;
    }
    const maxV = Math.max(1, ...rows.map((r) => r.value));
    container.innerHTML = rows.map((r) => {
      const pct = Math.min(100, (r.value / maxV) * 100);
      return `
        <div style="margin-bottom:11px;">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
            <span style="font-weight:500;">${U.esc(r.label)}</span>
            <span class="num" style="font-weight:600;">${U.formatMoney(r.value, opts.currency)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct.toFixed(1)}%;background:${U.esc(r.color || 'var(--accent-primary)')};"></div>
          </div>
        </div>`;
    }).join('');
  }

  global.AureoCharts = {
    renderDonutChart,
    renderBarTrendChart,
    renderAreaLineChart,
    renderHorizontalBars
  };
})(window);
