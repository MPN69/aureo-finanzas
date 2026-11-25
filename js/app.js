(function (global) {
  "use strict";

  const U = global.AureoUtils;
  const Store = global.AureoStore;
  const Meta = global.AureoStoreMeta;
  const Charts = global.AureoCharts;
  const AI = global.AureoAI;
  const CSV = global.AureoCSV;

  const ui = {
    view: "dashboard",
    cycleRefISO: U.todayISO(),
    calendarMonthISO: U.todayISO().slice(0, 7) + "-01",
    selectedDate: null,
    budgetScope: "couple",
    ledgerFilters: {
      q: "",
      type: "all",
      categoryId: "all",
      accountId: "all",
      scope: "all",
    },
    deferredInstallPrompt: null,
    csvParsed: null,
  };

  const VIEW_META = {
    dashboard: {
      title: "Resumen Ejecutivo",
      subtitle: "Panorama financiero personal y en pareja",
    },
    ledger: {
      title: "Movimientos y Calendario",
      subtitle: "Historial cronológico, búsqueda y flujo diario",
    },
    budgets: {
      title: "Presupuestos y Fijos",
      subtitle: "Control por categoría, ciclo de nómina y recurrentes",
    },
    analytics: {
      title: "Analítica y Reportes",
      subtitle: "Tendencias, comercios, desglose de artículos y patrimonio",
    },
    accounts: {
      title: "Cuentas y Patrimonio",
      subtitle: "Efectivo, bancos, tarjetas, billeteras e inversiones",
    },
    couple: {
      title: "Pareja y Metas",
      subtitle: "Balance compartido, liquidación, metas y sincronización",
    },
    settings: {
      title: "Importar, Exportar y Ajustes",
      subtitle: "CSV bancario, Gemini IA, tasas de cambio y respaldos",
    },
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function toast(msg, kind = "info") {
    const box = $("#toast-container");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast";
    const dot = kind === "error" ? "🔴" : kind === "success" ? "🟢" : "💠";
    el.innerHTML = `<span>${dot}</span><span>${U.esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 220);
    }, 3200);
  }

  let activeModalOnClose = null;

  function openModal({
    title,
    bodyHtml,
    footerHtml,
    large = false,
    onMount = null,
    onClose = null,
  }) {
    if (activeModalOnClose) {
      try { activeModalOnClose(); } catch {}
    }
    activeModalOnClose = onClose;
    const backdrop = $("#modal-backdrop");
    const box = $("#modal-box");
    box.classList.toggle("modal-lg", Boolean(large));
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = bodyHtml;
    $("#modal-footer").innerHTML = footerHtml || "";
    backdrop.classList.add("open");
    if (onMount) onMount($("#modal-body"), $("#modal-footer"));
  }

  function closeModal() {
    if (activeModalOnClose) {
      try { activeModalOnClose(); } catch {}
      activeModalOnClose = null;
    }
    $("#modal-backdrop").classList.remove("open");
    $("#modal-body").innerHTML = "";
    $("#modal-footer").innerHTML = "";
  }

  function getActiveRange() {
    const s = Store.state.settings;
    return U.getCycleRange(ui.cycleRefISO, s.paydayDay, s.cycleMode);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute("content", theme === "light" ? "#ffffff" : "#0f172a");
  }

  function syncChrome() {
    const s = Store.state.settings;
    applyTheme(s.theme || "dark");

    const meta = VIEW_META[ui.view] || VIEW_META.dashboard;
    $("#view-title").textContent = meta.title;
    $("#view-subtitle").textContent = meta.subtitle;

    $all("#sidebar-nav .nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === ui.view);
    });
    $all(".m-nav-btn").forEach((btn) => {
      const active =
        btn.dataset.view === ui.view ||
        (btn.dataset.view === "more" &&
          ["analytics", "accounts", "couple", "settings"].includes(ui.view));
      btn.classList.toggle("active", active);
    });

    $all(".ws-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.ws === s.activeWorkspace);
    });
    const mWs = $("#mobile-ws-select");
    if (mWs) mWs.value = s.activeWorkspace;

    const range = getActiveRange();
    const pill = $("#sidebar-cycle-pill strong");
    if (pill) pill.textContent = range.label;
  }

  function navigate(view) {
    if (view === "more") {
      openMoreMenuModal();
      return;
    }
    ui.view = view;
    render();
  }

  function render() {
    syncChrome();
    const main = $("#app-main");
    if (!main) return;

    switch (ui.view) {
      case "dashboard":
        renderDashboard(main);
        break;
      case "ledger":
        renderLedger(main);
        break;
      case "budgets":
        renderBudgets(main);
        break;
      case "analytics":
        renderAnalytics(main);
        break;
      case "accounts":
        renderAccounts(main);
        break;
      case "couple":
        renderCouple(main);
        break;
      case "settings":
        renderSettings(main);
        break;
      default:
        renderDashboard(main);
    }
  }

  function sumCycleStats(ws, range) {
    const txs = Store.getVisibleTransactions(ws, range);
    let income = 0;
    let expense = 0;
    const byCat = {};
    for (const tx of txs) {
      if (tx.type === "transfer") continue;
      const val = Store.toBase(tx.effectiveAmount, tx.currency);
      if (tx.type === "income") {
        income += val;
      } else if (tx.type === "expense") {
        expense += val;
        if (
          tx.items &&
          tx.items.length > 0 &&
          ws !== "solo_a" &&
          ws !== "solo_b"
        ) {
          for (const it of tx.items) {
            const cid = it.categoryId || tx.categoryId || "cat_other_exp";
            byCat[cid] =
              (byCat[cid] || 0) + Store.toBase(it.amount, tx.currency);
          }
        } else {
          const cid = tx.categoryId || "cat_other_exp";
          byCat[cid] = (byCat[cid] || 0) + val;
        }
      }
    }
    return { txs, income, expense, net: income - expense, byCat };
  }

  function renderTxRowHtml(tx) {
    const cat = Store.getCategory(tx.categoryId);
    const acc = Store.getAccount(tx.accountId);
    const toAcc = tx.toAccountId ? Store.getAccount(tx.toAccountId) : null;
    const ws = Store.state.settings.activeWorkspace;
    const partnerA = Store.state.settings.partners.a.name;
    const partnerB = Store.state.settings.partners.b.name;

    let icon = "💸";
    let bg = "var(--expense-soft)";
    if (tx.type === "income") {
      icon = cat?.icon || "💰";
      bg = "var(--income-soft)";
    } else if (tx.type === "transfer") {
      icon = "⇄";
      bg = "var(--transfer-soft)";
    } else if (cat) {
      icon = cat.icon;
      bg = `${cat.color}22`;
    }

    const title =
      tx.merchant ||
      cat?.name ||
      (tx.type === "transfer" ? "Transferencia" : "Movimiento");
    const accText =
      tx.type === "transfer"
        ? `${acc?.name || "Origen"} → ${toAcc?.name || "Destino"}`
        : acc?.name || "Cuenta";
    const scopeBadge =
      tx.scope === "couple"
        ? `<span class="badge badge-couple">Pareja · ${U.esc(tx.paidBy === "b" ? partnerB : partnerA)}</span>`
        : "";
    const itemsBadge =
      tx.items && tx.items.length
        ? `<span class="badge badge-neutral">${tx.items.length} ítems</span>`
        : "";

    const displayAmt =
      (ws === "solo_a" || ws === "solo_b") &&
      tx.scope === "couple" &&
      tx.type !== "transfer"
        ? tx.effectiveAmount
        : tx.amount;
    const prefix =
      tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
    const amtClass =
      tx.type === "income"
        ? "income"
        : tx.type === "transfer"
          ? "transfer"
          : "expense";
    const splitNote =
      (ws === "solo_a" || ws === "solo_b") &&
      tx.scope === "couple" &&
      tx.type !== "transfer"
        ? `<div style="font-size:10.5px;color:var(--text-muted);">Tu parte de ${U.formatMoney(tx.amount, tx.currency)}</div>`
        : "";

    return `
      <div class="tx-row" data-tx-id="${U.esc(tx.id)}">
        <div class="tx-icon" style="background:${bg};">${icon}</div>
        <div class="tx-main">
          <div class="tx-title">${U.esc(title)} ${scopeBadge} ${itemsBadge}</div>
          <div class="tx-sub">
            <span>${U.esc(U.formatDateHuman(tx.date))}</span>
            <span>·</span>
            <span>${U.esc(cat?.name || (tx.type === "transfer" ? "Transferencia interna" : "General"))}</span>
            <span>·</span>
            <span>${U.esc(accText)}</span>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount num ${amtClass}">${prefix}${U.formatMoney(displayAmt, tx.currency)}</div>
          ${splitNote}
        </div>
      </div>`;
  }

  /* ========================================================================
     1. DASHBOARD VIEW
     ======================================================================== */
  function renderDashboard(container) {
    const s = Store.state.settings;
    const ws = s.activeWorkspace;
    const baseCur = Store.getBaseCurrency();
    const range = getActiveRange();
    const stats = sumCycleStats(ws, range);
    const nw = Store.getNetWorth(ws);
    const settle = Store.getCoupleSettlement();
    const daysLeft = U.daysRemainingInRange(range.end);

    const budgetScopeKey = ws === "couple" ? "couple" : "personal";
    const activeBudgets = Store.state.budgets[budgetScopeKey] || {};
    const totalBudget = Object.values(activeBudgets).reduce(
      (a, b) => a + (Number(b) || 0),
      0,
    );
    const budgetedSpent = Object.keys(activeBudgets).reduce(
      (sum, cid) => sum + (stats.byCat[cid] || 0),
      0,
    );
    const budgetRemaining = totalBudget - budgetedSpent;
    const dailyAllowance =
      totalBudget > 0
        ? budgetRemaining / daysLeft
        : Math.max(0, stats.net / daysLeft);

    const savingsRate =
      stats.income > 0
        ? Math.round(((stats.income - stats.expense) / stats.income) * 100)
        : 0;

    let fourthCardTitle = "Disponible Diario";
    let fourthCardVal = U.formatMoney(dailyAllowance, baseCur);
    let fourthCardMeta =
      totalBudget > 0
        ? `Quedan ${U.formatMoney(budgetRemaining, baseCur)} de presupuesto (${daysLeft} días)`
        : `Flujo neto del ciclo: ${U.formatMoney(stats.net, baseCur, { showPlus: true })}`;

    if (ws === "couple") {
      fourthCardTitle = "Balance Pareja";
      const absSettle = Math.abs(settle.netBalanceA);
      fourthCardVal =
        absSettle < 1 ? "Al día" : U.formatMoney(absSettle, baseCur);
      if (absSettle < 1) {
        fourthCardMeta = "Sin saldos pendientes entre ambos";
      } else if (settle.netBalanceA > 0) {
        fourthCardMeta = `${s.partners.b.name} debe a ${s.partners.a.name}`;
      } else {
        fourthCardMeta = `${s.partners.a.name} debe a ${s.partners.b.name}`;
      }
    }

    const demoBanner = Store.state.isDemo
      ? `
      <div class="card" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-color:rgba(14,165,233,0.35);background:var(--accent-primary-soft);">
        <div style="font-size:13px;">
          <strong>Modo Demostración Activo:</strong> Estás explorando datos de ejemplo para Solo y Pareja.
        </div>
        <button class="btn btn-sm btn-primary" id="btn-clear-demo">Empezar con mis datos en cero</button>
      </div>`
      : "";

    const favChips = Store.state.favorites
      .map(
        (f) => `
      <button class="fav-chip" data-fav-id="${U.esc(f.id)}" title="Registrar en 1 clic">
        <span>${f.type === "transfer" ? "⇄" : Store.getCategory(f.categoryId)?.icon || "⭐"}</span>
        <div style="text-align:left;">
          <div style="font-weight:600;font-size:12.5px;">${U.esc(f.label)}</div>
          <div class="num" style="font-size:11px;color:var(--text-muted);">${U.formatMoney(f.amount, f.currency)}</div>
        </div>
      </button>`,
      )
      .join("");

    const budgetEntries = Object.entries(activeBudgets)
      .map(([cid, limit]) => {
        const cat = Store.getCategory(cid);
        const spent = stats.byCat[cid] || 0;
        const pct = limit > 0 ? (spent / limit) * 100 : 0;
        return { cid, cat, limit, spent, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);

    const budgetHtml = budgetEntries.length
      ? budgetEntries
          .map((b) => {
            const barColor =
              b.pct >= 100
                ? "var(--expense)"
                : b.pct >= 80
                  ? "var(--warning)"
                  : "var(--income)";
            return `
            <div style="margin-bottom:13px;">
              <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;">
                <span>${U.esc(b.cat?.icon || "📌")} <strong>${U.esc(b.cat?.name || b.cid)}</strong></span>
                <span class="num">${U.formatMoney(b.spent, baseCur)} / <span style="color:var(--text-muted);">${U.formatMoney(b.limit, baseCur)}</span></span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${Math.min(100, b.pct).toFixed(1)}%;background:${barColor};"></div>
              </div>
            </div>`;
          })
          .join("")
      : `<div class="empty-state">No hay presupuestos configurados para esta vista.<br><button class="btn btn-sm" style="margin-top:10px;" data-goto="budgets">Configurar presupuestos</button></div>`;

    const upcomingRec =
      Store.state.recurring
        .filter((r) => r.active)
        .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
        .slice(0, 4)
        .map(
          (r) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
          <div>
            <div style="font-weight:600;font-size:13px;">${U.esc(r.title)}</div>
            <div style="font-size:11.5px;color:var(--text-muted);">Próximo: ${U.esc(U.formatDateHuman(r.nextRunDate))} · ${U.esc(r.scope === "couple" ? "Pareja" : "Personal")}</div>
          </div>
          <div class="num" style="font-weight:700;">${U.formatMoney(r.amount, r.currency)}</div>
        </div>`,
        )
        .join("") ||
      `<div class="empty-state">Sin gastos fijos programados</div>`;

    container.innerHTML = `
      ${demoBanner}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-sm btn-icon" id="btn-prev-cycle" title="Ciclo anterior">‹</button>
          <span class="badge badge-neutral" style="padding:6px 12px;font-size:12.5px;">📅 ${U.esc(range.label)}</span>
          <button class="btn btn-sm btn-icon" id="btn-next-cycle" title="Siguiente ciclo">›</button>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" id="btn-dash-transfer">⇄ Transferencia</button>
          <button class="btn btn-sm btn-primary" id="btn-dash-add">+ Nuevo Movimiento</button>
        </div>
      </div>

      <div class="grid-kpi">
        <div class="card kpi-card">
          <div class="kpi-label"><span>Patrimonio Neto</span><span class="badge badge-neutral">${U.esc(baseCur)}</span></div>
          <div class="kpi-value num">${U.formatMoney(nw.net, baseCur)}</div>
          <div class="kpi-meta">Activos ${U.formatMoney(nw.assets, baseCur, { compact: true })} · Deuda ${U.formatMoney(nw.debt, baseCur, { compact: true })}</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label"><span>Ingresos del Ciclo</span><span class="badge badge-income">+Entrada</span></div>
          <div class="kpi-value num" style="color:var(--income);">${U.formatMoney(stats.income, baseCur)}</div>
          <div class="kpi-meta">Tasa de ahorro: <strong>${savingsRate}%</strong></div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label"><span>Gastos del Ciclo</span><span class="badge badge-expense">-Salida</span></div>
          <div class="kpi-value num" style="color:var(--expense);">${U.formatMoney(stats.expense, baseCur)}</div>
          <div class="kpi-meta">${stats.txs.filter((t) => t.type === "expense").length} movimientos registrados</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label"><span>${U.esc(fourthCardTitle)}</span><span class="badge ${ws === "couple" ? "badge-couple" : "badge-transfer"}">${ws === "couple" ? "Pareja" : "Ritmo"}</span></div>
          <div class="kpi-value num">${U.esc(fourthCardVal)}</div>
          <div class="kpi-meta">${U.esc(fourthCardMeta)}</div>
        </div>
      </div>

      ${
        Store.state.favorites.length
          ? `
      <div class="card" style="margin-bottom:20px;padding:14px 18px;">
        <div class="card-header" style="margin-bottom:10px;">
          <h3 class="card-title">⚡ Favoritos — Registro en 1 clic</h3>
          <span class="card-subtitle">Atajos rápidos tipo Zaim</span>
        </div>
        <div class="fav-strip">${favChips}</div>
      </div>`
          : ""
      }

      <div class="grid-asym">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Distribución de Gastos</h3>
            <button class="btn btn-ghost btn-sm" data-goto="analytics">Ver analítica →</button>
          </div>
          <div id="dash-donut"></div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Presupuestos (${ws === "couple" ? "Pareja" : "Personal"})</h3>
            <button class="btn btn-ghost btn-sm" data-goto="budgets">Gestionar →</button>
          </div>
          ${budgetHtml}
        </div>
      </div>

      <div class="grid-asym">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Últimos Movimientos</h3>
            <button class="btn btn-ghost btn-sm" data-goto="ledger">Ver todos →</button>
          </div>
          <div class="tx-list">
            ${stats.txs.slice(0, 7).map(renderTxRowHtml).join("") || '<div class="empty-state">No hay movimientos en este ciclo.</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Próximos Gastos Fijos</h3>
            <button class="btn btn-ghost btn-sm" data-goto="budgets">Configurar →</button>
          </div>
          ${upcomingRec}
        </div>
      </div>
    `;

    // Donut chart
    const slices = Object.entries(stats.byCat)
      .map(([cid, val]) => {
        const cat = Store.getCategory(cid);
        return {
          label: cat?.name || "Otros",
          icon: cat?.icon || "",
          color: cat?.color || "#64748b",
          value: val,
        };
      })
      .sort((a, b) => b.value - a.value);
    Charts.renderDonutChart($("#dash-donut"), slices, {
      currency: baseCur,
      centerLabel: "Gastado",
    });

    // Events
    $("#btn-prev-cycle")?.addEventListener("click", () => {
      ui.cycleRefISO = U.shiftCycleRef(
        ui.cycleRefISO,
        -1,
        s.paydayDay,
        s.cycleMode,
      );
      render();
    });
    $("#btn-next-cycle")?.addEventListener("click", () => {
      ui.cycleRefISO = U.shiftCycleRef(
        ui.cycleRefISO,
        1,
        s.paydayDay,
        s.cycleMode,
      );
      render();
    });
    $("#btn-dash-add")?.addEventListener("click", () => openTxModal());
    $("#btn-dash-transfer")?.addEventListener("click", () =>
      openTxModal({ type: "transfer" }),
    );
    $("#btn-clear-demo")?.addEventListener("click", async () => {
      await Store.resetState(true);
      toast(
        "Datos de demostración limpiados. ¡Listo para tus finanzas reales!",
        "success",
      );
      render();
    });
    $all("[data-goto]").forEach((b) =>
      b.addEventListener("click", () => navigate(b.dataset.goto)),
    );
    $all("[data-fav-id]").forEach((b) => {
      b.addEventListener("click", async () => {
        const fav = Store.state.favorites.find((f) => f.id === b.dataset.favId);
        if (!fav) return;
        await Store.addTransaction({
          type: fav.type,
          amount: fav.amount,
          currency: fav.currency,
          accountId: fav.accountId,
          toAccountId: fav.toAccountId || null,
          categoryId: fav.categoryId || null,
          merchant: fav.merchant || fav.label,
          memo: "Desde favorito",
          tags: ["favorito"],
          scope: fav.scope || "personal",
          paidBy: s.activeWorkspace === "solo_b" ? "b" : "a",
          splitMode: fav.scope === "couple" ? "50_50" : "100_a",
          splitRatioA: fav.scope === "couple" ? 50 : 100,
        });
        toast(`Registrado: ${fav.label}`, "success");
        render();
      });
    });
    $all(".tx-row[data-tx-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const tx = Store.state.transactions.find(
          (t) => t.id === row.dataset.txId,
        );
        if (tx) openTxModal(tx);
      });
    });
  }

  /* ========================================================================
     2. LEDGER & CALENDAR VIEW
     ======================================================================== */
  function renderLedger(container) {
    const s = Store.state.settings;
    const ws = s.activeWorkspace;
    const baseCur = Store.getBaseCurrency();
    const allTxs = Store.getVisibleTransactions(ws);

    // Calendar computations
    const calDate = U.parseISODate(ui.calendarMonthISO);
    const cy = calDate.getFullYear();
    const cm = calDate.getMonth();
    const firstDow = (new Date(cy, cm, 1).getDay() + 6) % 7; // Monday = 0
    const daysCount = U.daysInMonth(cy, cm);
    const monthPrefix = `${cy}-${U.pad2(cm + 1)}`;

    const dailyMap = {};
    for (const tx of allTxs) {
      if (!tx.date.startsWith(monthPrefix) || tx.type === "transfer") continue;
      if (!dailyMap[tx.date]) dailyMap[tx.date] = { inc: 0, exp: 0 };
      const val = Store.toBase(tx.effectiveAmount, tx.currency);
      if (tx.type === "income") dailyMap[tx.date].inc += val;
      else dailyMap[tx.date].exp += val;
    }

    const calCells = [];
    for (let i = 0; i < firstDow; i++) {
      calCells.push('<div class="cal-cell other-month"></div>');
    }
    const todayStr = U.todayISO();
    for (let d = 1; d <= daysCount; d++) {
      const iso = `${monthPrefix}-${U.pad2(d)}`;
      const dm = dailyMap[iso];
      const cls = ["cal-cell"];
      if (iso === todayStr) cls.push("today");
      if (ui.selectedDate === iso) cls.push("selected");
      calCells.push(`
        <div class="${cls.join(" ")}" data-cal-date="${iso}">
          <span class="cal-day">${d}</span>
          <div class="cal-totals num">
            ${dm && dm.inc > 0 ? `<span style="color:var(--income);">+${U.formatMoney(dm.inc, baseCur, { compact: true })}</span>` : ""}
            ${dm && dm.exp > 0 ? `<span style="color:var(--expense);">-${U.formatMoney(dm.exp, baseCur, { compact: true })}</span>` : ""}
          </div>
        </div>`);
    }

    // Filtered transactions
    const f = ui.ledgerFilters;
    const filtered = allTxs.filter((tx) => {
      if (ui.selectedDate && tx.date !== ui.selectedDate) return false;
      if (f.type !== "all" && tx.type !== f.type) return false;
      if (f.scope !== "all" && tx.scope !== f.scope) return false;
      if (f.categoryId !== "all" && tx.categoryId !== f.categoryId)
        return false;
      if (
        f.accountId !== "all" &&
        tx.accountId !== f.accountId &&
        tx.toAccountId !== f.accountId
      )
        return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        const hay =
          `${tx.merchant || ""} ${tx.memo || ""} ${(tx.tags || []).join(" ")} ${(tx.items || []).map((i) => i.name).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const catOpts = Store.state.categories
      .map(
        (c) =>
          `<option value="${U.esc(c.id)}" ${f.categoryId === c.id ? "selected" : ""}>${U.esc(c.icon + " " + c.name)}</option>`,
      )
      .join("");
    const accOpts = Store.getVisibleAccounts(ws)
      .map(
        (a) =>
          `<option value="${U.esc(a.id)}" ${f.accountId === a.id ? "selected" : ""}>${U.esc(a.name)}</option>`,
      )
      .join("");

    container.innerHTML = `
      <div class="grid-asym">
        <div class="card">
          <div class="calendar-header">
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn btn-sm btn-icon" id="cal-prev">‹</button>
              <strong style="text-transform:capitalize;">${U.esc(calDate.toLocaleDateString("es-MX", { month: "long", year: "numeric" }))}</strong>
              <button class="btn btn-sm btn-icon" id="cal-next">›</button>
            </div>
            <div style="display:flex;gap:8px;">
              ${ui.selectedDate ? `<button class="btn btn-sm" id="cal-clear-day">Ver todo (${U.esc(ui.selectedDate)}) ✕</button>` : ""}
              <button class="btn btn-sm btn-primary" id="cal-add-day">+ Agregar ${ui.selectedDate ? "en fecha" : ""}</button>
            </div>
          </div>
          <div class="calendar-grid">
            <div class="cal-dow">Lun</div><div class="cal-dow">Mar</div><div class="cal-dow">Mié</div>
            <div class="cal-dow">Jue</div><div class="cal-dow">Vie</div><div class="cal-dow">Sáb</div><div class="cal-dow">Dom</div>
            ${calCells.join("")}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Filtros y Búsqueda</h3>
            <button class="btn btn-ghost btn-sm" id="btn-reset-filters">Limpiar</button>
          </div>
          <div class="form-grid">
            <div class="form-group full">
              <label>Buscar comercio, nota, artículo o etiqueta</label>
              <input type="text" id="flt-q" value="${U.esc(f.q)}" placeholder="Ej. Supermercado, café, recibo..." />
            </div>
            <div class="form-group">
              <label>Tipo</label>
              <select id="flt-type">
                <option value="all" ${f.type === "all" ? "selected" : ""}>Todos</option>
                <option value="expense" ${f.type === "expense" ? "selected" : ""}>Gastos</option>
                <option value="income" ${f.type === "income" ? "selected" : ""}>Ingresos</option>
                <option value="transfer" ${f.type === "transfer" ? "selected" : ""}>Transferencias</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ámbito</label>
              <select id="flt-scope">
                <option value="all" ${f.scope === "all" ? "selected" : ""}>Personal y Pareja</option>
                <option value="personal" ${f.scope === "personal" ? "selected" : ""}>Solo Personal</option>
                <option value="couple" ${f.scope === "couple" ? "selected" : ""}>Solo Pareja</option>
              </select>
            </div>
            <div class="form-group">
              <label>Categoría</label>
              <select id="flt-cat"><option value="all">Todas</option>${catOpts}</select>
            </div>
            <div class="form-group">
              <label>Cuenta</label>
              <select id="flt-acc"><option value="all">Todas</option>${accOpts}</select>
            </div>
          </div>
          <div class="divider"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;">
            <span>Mostrando <strong>${filtered.length}</strong> movimientos</span>
            <button class="btn btn-sm" id="btn-export-filtered-csv">Exportar CSV</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Libro de Movimientos ${ui.selectedDate ? `(${U.formatDateHuman(ui.selectedDate)})` : ""}</h3>
        </div>
        <div class="tx-list">
          ${filtered.slice(0, 150).map(renderTxRowHtml).join("") || '<div class="empty-state">No se encontraron movimientos con estos filtros.</div>'}
        </div>
      </div>
    `;

    $("#cal-prev").addEventListener("click", () => {
      const dt = new Date(cy, cm - 1, 1);
      ui.calendarMonthISO = U.toISODate(dt);
      render();
    });
    $("#cal-next").addEventListener("click", () => {
      const dt = new Date(cy, cm + 1, 1);
      ui.calendarMonthISO = U.toISODate(dt);
      render();
    });
    $("#cal-clear-day")?.addEventListener("click", () => {
      ui.selectedDate = null;
      render();
    });
    $("#cal-add-day").addEventListener("click", () =>
      openTxModal({ date: ui.selectedDate || U.todayISO() }),
    );

    $all(".cal-cell[data-cal-date]").forEach((cell) => {
      cell.addEventListener("click", () => {
        const d = cell.dataset.calDate;
        ui.selectedDate = ui.selectedDate === d ? null : d;
        render();
      });
    });

    $("#flt-q").addEventListener("input", (e) => {
      ui.ledgerFilters.q = e.target.value;
    });
    $("#flt-q").addEventListener("change", () => render());
    $("#flt-type").addEventListener("change", (e) => {
      ui.ledgerFilters.type = e.target.value;
      render();
    });
    $("#flt-scope").addEventListener("change", (e) => {
      ui.ledgerFilters.scope = e.target.value;
      render();
    });
    $("#flt-cat").addEventListener("change", (e) => {
      ui.ledgerFilters.categoryId = e.target.value;
      render();
    });
    $("#flt-acc").addEventListener("change", (e) => {
      ui.ledgerFilters.accountId = e.target.value;
      render();
    });
    $("#btn-reset-filters").addEventListener("click", () => {
      ui.selectedDate = null;
      ui.ledgerFilters = {
        q: "",
        type: "all",
        categoryId: "all",
        accountId: "all",
        scope: "all",
      };
      render();
    });
    $("#btn-export-filtered-csv").addEventListener("click", () => {
      CSV.exportTransactionsCSV(filtered, Store);
      toast("CSV exportado correctamente", "success");
    });
    $all(".tx-row[data-tx-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const tx = Store.state.transactions.find(
          (t) => t.id === row.dataset.txId,
        );
        if (tx) openTxModal(tx);
      });
    });
  }

  /* ========================================================================
     3. BUDGETS & RECURRING VIEW
     ======================================================================== */
  function renderBudgets(container) {
    const s = Store.state.settings;
    const baseCur = Store.getBaseCurrency();
    const range = getActiveRange();
    const daysLeft = U.daysRemainingInRange(range.end);
    const scopeKey = ui.budgetScope;
    const wsForScope = scopeKey === "couple" ? "couple" : "solo_a";
    const stats = sumCycleStats(wsForScope, range);
    const budgetsMap = Store.state.budgets[scopeKey] || {};
    const expCats = Store.state.categories.filter((c) => c.type === "expense");

    const totalBudget = Object.values(budgetsMap).reduce(
      (a, b) => a + (Number(b) || 0),
      0,
    );
    const totalSpentInBudget = expCats.reduce(
      (sum, c) => sum + (budgetsMap[c.id] ? stats.byCat[c.id] || 0 : 0),
      0,
    );

    const budgetRows = expCats
      .map((c) => {
        const limit = Number(budgetsMap[c.id]) || 0;
        const spent = stats.byCat[c.id] || 0;
        const pct = limit > 0 ? (spent / limit) * 100 : 0;
        const rem = limit - spent;
        const color =
          pct >= 100
            ? "var(--expense)"
            : pct >= 80
              ? "var(--warning)"
              : "var(--income)";
        return `
        <tr>
          <td>${U.esc(c.icon)} <strong>${U.esc(c.name)}</strong></td>
          <td class="num">${U.formatMoney(spent, baseCur)}</td>
          <td style="width:150px;">
            <input type="number" min="0" step="100" class="budget-input num" data-cat-id="${U.esc(c.id)}" value="${limit || ""}" placeholder="Sin límite" style="padding:6px 8px;" />
          </td>
          <td style="min-width:160px;">
            ${
              limit > 0
                ? `
              <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${color};"></div></div>
              <div class="num" style="font-size:11px;color:var(--text-muted);margin-top:3px;">${pct.toFixed(0)}% · ${rem >= 0 ? `Quedan ${U.formatMoney(rem, baseCur)} (${U.formatMoney(rem / daysLeft, baseCur)}/día)` : `Excedido por ${U.formatMoney(Math.abs(rem), baseCur)}`}</div>
            `
                : '<span style="font-size:12px;color:var(--text-muted);">Sin tope asignado</span>'
            }
          </td>
        </tr>`;
      })
      .join("");

    const freqLabel = {
      daily: "Diario",
      weekly: "Semanal",
      biweekly: "Quincenal",
      monthly: "Mensual",
      yearly: "Anual",
    };
    const recRows =
      Store.state.recurring
        .map(
          (r) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-subtle);">
        <div>
          <div style="font-weight:600;">${U.esc(r.title)} <span class="badge ${r.scope === "couple" ? "badge-couple" : "badge-neutral"}">${r.scope === "couple" ? "Pareja" : "Personal"}</span></div>
          <div style="font-size:12px;color:var(--text-muted);">
            ${U.esc(freqLabel[r.frequency] || r.frequency)} · Próximo: ${U.esc(r.nextRunDate)} · ${U.esc(Store.getAccount(r.accountId)?.name || "")}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <strong class="num">${U.formatMoney(r.amount, r.currency)}</strong>
          <button class="btn btn-sm" data-edit-rec="${U.esc(r.id)}">Editar</button>
          <button class="btn btn-sm btn-danger" data-del-rec="${U.esc(r.id)}">✕</button>
        </div>
      </div>`,
        )
        .join("") ||
      '<div class="empty-state">No hay gastos fijos o suscripciones configuradas aún.</div>';

    container.innerHTML = `
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header" style="flex-wrap:wrap;">
          <div>
            <h3 class="card-title">Presupuestos por Categoría (${U.esc(range.label)})</h3>
            <span class="card-subtitle">Ciclo basado en tu día de nómina (día ${s.paydayDay}${s.cycleMode === "biweekly" ? ", quincenal" : ""}) · Quedan ${daysLeft} días</span>
          </div>
          <div class="seg-tabs">
            <button class="seg-tab ${scopeKey === "personal" ? "active" : ""}" data-bscope="personal">Solo Personal</button>
            <button class="seg-tab ${scopeKey === "couple" ? "active" : ""}" data-bscope="couple">En Pareja</button>
          </div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;padding:12px;background:var(--bg-elevated);border-radius:12px;">
          <div><span style="font-size:11.5px;color:var(--text-muted);display:block;">Presupuesto Total</span><strong class="num" style="font-size:17px;">${U.formatMoney(totalBudget, baseCur)}</strong></div>
          <div><span style="font-size:11.5px;color:var(--text-muted);display:block;">Gastado</span><strong class="num" style="font-size:17px;color:var(--expense);">${U.formatMoney(totalSpentInBudget, baseCur)}</strong></div>
          <div><span style="font-size:11.5px;color:var(--text-muted);display:block;">Disponible</span><strong class="num" style="font-size:17px;color:${totalBudget - totalSpentInBudget >= 0 ? "var(--income)" : "var(--expense)"};">${U.formatMoney(totalBudget - totalSpentInBudget, baseCur)}</strong></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Categoría</th><th>Gastado</th><th>Límite (${U.esc(baseCur)})</th><th>Progreso y Ritmo</th></tr></thead>
            <tbody>${budgetRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Gastos Fijos, Suscripciones e Ingresos Recurrentes</h3>
            <span class="card-subtitle">Se generan automáticamente al llegar su fecha</span>
          </div>
          <button class="btn btn-sm btn-primary" id="btn-add-rec">+ Nuevo Recurrente</button>
        </div>
        ${recRows}
      </div>
    `;

    $all("[data-bscope]").forEach((b) =>
      b.addEventListener("click", () => {
        ui.budgetScope = b.dataset.bscope;
        render();
      }),
    );
    $all(".budget-input").forEach((inp) => {
      inp.addEventListener("change", async () => {
        await Store.setBudget(scopeKey, inp.dataset.catId, inp.value);
        toast("Presupuesto actualizado", "success");
        render();
      });
    });
    $("#btn-add-rec").addEventListener("click", () => openRecurringModal());
    $all("[data-edit-rec]").forEach((b) =>
      b.addEventListener("click", () => {
        const rec = Store.state.recurring.find(
          (r) => r.id === b.dataset.editRec,
        );
        if (rec) openRecurringModal(rec);
      }),
    );
    $all("[data-del-rec]").forEach((b) =>
      b.addEventListener("click", async () => {
        await Store.deleteRecurring(b.dataset.delRec, false);
        toast("Recurrente eliminado (movimientos pasados conservados)", "info");
        render();
      }),
    );
  }

  /* ========================================================================
     4. ANALYTICS VIEW
     ======================================================================== */
  function renderAnalytics(container) {
    const s = Store.state.settings;
    const ws = s.activeWorkspace;
    const baseCur = Store.getBaseCurrency();

    // Last 6 cycles
    const series = [];
    let ref = ui.cycleRefISO;
    const refs = [];
    for (let i = 0; i < 6; i++) {
      refs.unshift(ref);
      ref = U.shiftCycleRef(ref, -1, s.paydayDay, s.cycleMode);
    }
    for (const r of refs) {
      const range = U.getCycleRange(r, s.paydayDay, s.cycleMode);
      const st = sumCycleStats(ws, range);
      series.push({
        label: range.label.slice(0, 12),
        income: st.income,
        expense: st.expense,
        net: st.net,
      });
    }

    // Current cycle breakdown
    const curRange = getActiveRange();
    const curStats = sumCycleStats(ws, curRange);

    // Top Merchants
    const merchantTotals = {};
    const itemTotals = {};
    for (const tx of curStats.txs) {
      if (tx.type !== "expense") continue;
      const m = (tx.merchant || "Sin comercio").trim();
      merchantTotals[m] =
        (merchantTotals[m] || 0) +
        Store.toBase(tx.effectiveAmount, tx.currency);
      for (const it of tx.items || []) {
        const name = it.name || "Artículo";
        itemTotals[name] =
          (itemTotals[name] || 0) + Store.toBase(it.amount, tx.currency);
      }
    }

    const topMerchants = Object.entries(merchantTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({
        label,
        value,
        color: "var(--accent-primary)",
      }));

    const topItems = Object.entries(itemTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({
        label,
        value,
        color: "var(--accent-couple)",
      }));

    // Cumulative balance curve across 6 cycles
    let running =
      Store.getNetWorth(ws).net - series.reduce((acc, x) => acc + x.net, 0);
    const netPoints = series.map((x) => {
      running += x.net;
      return { label: x.label, value: running };
    });

    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Ingresos vs Gastos (Últimos 6 ciclos)</h3></div>
          <div id="ana-bars"></div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Tendencia de Patrimonio Estimado</h3></div>
          <div id="ana-line"></div>
        </div>
      </div>

      <div class="grid-3">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Gastos por Categoría (${U.esc(curRange.label)})</h3></div>
          <div id="ana-donut"></div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Top Comercios / Tiendas</h3></div>
          <div id="ana-merchants"></div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Desglose por Artículos (Recibos)</h3></div>
          <div id="ana-items"></div>
        </div>
      </div>
    `;

    Charts.renderBarTrendChart($("#ana-bars"), series, { currency: baseCur });
    Charts.renderAreaLineChart($("#ana-line"), netPoints, {
      currency: baseCur,
      color: "#10b981",
    });

    const slices = Object.entries(curStats.byCat)
      .map(([cid, val]) => {
        const cat = Store.getCategory(cid);
        return {
          label: cat?.name || "Otros",
          icon: cat?.icon || "",
          color: cat?.color || "#64748b",
          value: val,
        };
      })
      .sort((a, b) => b.value - a.value);
    Charts.renderDonutChart($("#ana-donut"), slices, {
      currency: baseCur,
      centerLabel: "Ciclo",
    });
    Charts.renderHorizontalBars($("#ana-merchants"), topMerchants, {
      currency: baseCur,
      emptyText: "Sin comercios en este ciclo",
    });
    Charts.renderHorizontalBars($("#ana-items"), topItems, {
      currency: baseCur,
      emptyText: "Escanea o desglosa recibos para ver artículos",
    });
  }

  /* ========================================================================
     5. ACCOUNTS & NET WORTH VIEW
     ======================================================================== */
  function renderAccounts(container) {
    const ws = Store.state.settings.activeWorkspace;
    const baseCur = Store.getBaseCurrency();
    const nw = Store.getNetWorth(ws);
    const accounts = Store.getVisibleAccounts(ws);

    const cards = accounts
      .map((acc) => {
        const typeMeta =
          Meta.ACCOUNT_TYPES[acc.type] || Meta.ACCOUNT_TYPES.bank;
        const bal = Store.getAccountBalance(acc.id);
        const balBase = Store.toBase(bal, acc.currency);
        const isShared = acc.visibility === "shared" || acc.owner === "shared";
        const ownerLabel =
          acc.owner === "shared"
            ? "Compartida"
            : acc.owner === "b"
              ? Store.state.settings.partners.b.name
              : Store.state.settings.partners.a.name;

        let creditExtra = "";
        if (acc.type === "credit" && acc.creditLimit) {
          const used = Math.max(0, -bal);
          const pct = Math.min(100, (used / acc.creditLimit) * 100);
          creditExtra = `
          <div style="margin-top:10px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
              <span>Crédito usado: ${pct.toFixed(0)}%</span>
              <span>Límite: ${U.formatMoney(acc.creditLimit, acc.currency)}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${pct > 75 ? "var(--expense)" : "var(--accent-primary)"};"></div></div>
          </div>`;
        }

        return `
        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="tx-icon" style="background:${U.esc(acc.color)}22;">${typeMeta.icon}</div>
                <div>
                  <div style="font-weight:700;font-size:14.5px;">${U.esc(acc.name)}</div>
                  <div style="font-size:12px;color:var(--text-muted);">${U.esc(typeMeta.label)}${acc.institution ? " · " + U.esc(acc.institution) : ""}</div>
                </div>
              </div>
              <span class="badge ${isShared ? "badge-couple" : "badge-neutral"}">${isShared ? "Compartida" : "Privada · " + U.esc(ownerLabel)}</span>
            </div>
            <div class="num" style="font-size:22px;font-weight:700;margin-top:14px;color:${bal < 0 ? "var(--expense)" : "var(--text-primary)"};">
              ${U.formatMoney(bal, acc.currency, { showCode: true })}
            </div>
            ${acc.currency !== baseCur ? `<div class="num" style="font-size:12px;color:var(--text-muted);">≈ ${U.formatMoney(balBase, baseCur, { showCode: true })}</div>` : ""}
            ${creditExtra}
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border-subtle);">
            <button class="btn btn-sm" data-acc-transfer="${U.esc(acc.id)}">⇄ Transferir</button>
            <button class="btn btn-sm btn-ghost" data-acc-edit="${U.esc(acc.id)}">Editar</button>
          </div>
        </div>`;
      })
      .join("");

    container.innerHTML = `
      <div class="grid-3">
        <div class="card kpi-card"><div class="kpi-label">Activos Totales</div><div class="kpi-value num" style="color:var(--income);">${U.formatMoney(nw.assets, baseCur)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Pasivos / Tarjetas</div><div class="kpi-value num" style="color:var(--expense);">${U.formatMoney(nw.debt, baseCur)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Patrimonio Neto</div><div class="kpi-value num">${U.formatMoney(nw.net, baseCur)}</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;">Tus Cuentas y Billeteras (${accounts.length})</h3>
        <button class="btn btn-primary btn-sm" id="btn-add-account">+ Nueva Cuenta</button>
      </div>

      <div class="grid-3">${cards || '<div class="empty-state">No hay cuentas en esta vista.</div>'}</div>
    `;

    $("#btn-add-account").addEventListener("click", () => openAccountModal());
    $all("[data-acc-edit]").forEach((b) =>
      b.addEventListener("click", () => {
        const acc = Store.getAccount(b.dataset.accEdit);
        if (acc) openAccountModal(acc);
      }),
    );
    $all("[data-acc-transfer]").forEach((b) =>
      b.addEventListener("click", () => {
        openTxModal({ type: "transfer", accountId: b.dataset.accTransfer });
      }),
    );
  }

  /* ========================================================================
     6. COUPLE & GOALS VIEW
     ======================================================================== */
  function renderCouple(container) {
    const s = Store.state.settings;
    const baseCur = Store.getBaseCurrency();
    const settle = Store.getCoupleSettlement();
    const pA = s.partners.a;
    const pB = s.partners.b;

    const absNet = Math.abs(settle.netBalanceA);
    let settleMsg = "Están completamente a mano en gastos compartidos.";
    if (absNet >= 1) {
      settleMsg =
        settle.netBalanceA > 0
          ? `<strong>${U.esc(pB.name)}</strong> le debe <strong>${U.formatMoney(absNet, baseCur)}</strong> a <strong>${U.esc(pA.name)}</strong>`
          : `<strong>${U.esc(pA.name)}</strong> le debe <strong>${U.formatMoney(absNet, baseCur)}</strong> a <strong>${U.esc(pB.name)}</strong>`;
    }

    const goalsHtml =
      Store.state.goals
        .map((g) => {
          const pct =
            g.targetAmount > 0
              ? Math.min(100, (g.currentAmount / g.targetAmount) * 100)
              : 0;
          return `
        <div class="card" style="background:var(--bg-elevated);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <strong style="font-size:14.5px;">${U.esc(g.name)}</strong>
              <span class="badge ${g.scope === "couple" ? "badge-couple" : "badge-neutral"}" style="margin-left:6px;">${g.scope === "couple" ? "En Pareja" : "Personal"}</span>
            </div>
            <button class="btn btn-sm btn-ghost" data-del-goal="${U.esc(g.id)}">✕</button>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;">
            <span class="num"><strong>${U.formatMoney(g.currentAmount, g.currency)}</strong> ahorrados</span>
            <span class="num" style="color:var(--text-muted);">Meta: ${U.formatMoney(g.targetAmount, g.currency)} (${pct.toFixed(0)}%)</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${U.esc(g.color || "var(--income)")};"></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
            <span style="font-size:11.5px;color:var(--text-muted);">Fecha objetivo: ${U.esc(g.deadline || "Sin fecha")}</span>
            <button class="btn btn-sm btn-primary" data-fund-goal="${U.esc(g.id)}">+ Abonar</button>
          </div>
        </div>`;
        })
        .join("") ||
      '<div class="empty-state">Aún no tienes metas de ahorro.</div>';

    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🤝 Centro de Liquidación en Pareja</h3>
            <span class="badge badge-couple">Zaim Pair Pro</span>
          </div>
          <div style="padding:16px;border-radius:12px;background:var(--accent-couple-soft);border:1px solid rgba(168,85,247,0.3);margin-bottom:14px;">
            <div style="font-size:14px;">${settleMsg}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">
              Calculado sobre gastos compartidos pagados desde cuentas personales (los pagados desde cuenta conjunta ya salen del fondo común).
            </div>
            ${absNet >= 1 ? `<button class="btn btn-sm btn-couple" id="btn-settle-up" style="margin-top:10px;">Registrar Liquidación (${U.formatMoney(absNet, baseCur)})</button>` : ""}
          </div>
          <div class="grid-2" style="margin-bottom:0;">
            <div style="padding:12px;background:var(--bg-elevated);border-radius:10px;">
              <div style="font-size:12px;color:var(--text-muted);">${U.esc(pA.name)} pagó</div>
              <div class="num" style="font-size:18px;font-weight:700;">${U.formatMoney(settle.paidByA, baseCur)}</div>
              <div class="num" style="font-size:11.5px;color:var(--text-muted);">Su parte: ${U.formatMoney(settle.shareA, baseCur)}</div>
            </div>
            <div style="padding:12px;background:var(--bg-elevated);border-radius:10px;">
              <div style="font-size:12px;color:var(--text-muted);">${U.esc(pB.name)} pagó</div>
              <div class="num" style="font-size:18px;font-weight:700;">${U.formatMoney(settle.paidByB, baseCur)}</div>
              <div class="num" style="font-size:11.5px;color:var(--text-muted);">Su parte: ${U.formatMoney(settle.shareB, baseCur)}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">👥 Perfiles y División Proporcional</h3>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Nombre Perfil 1 (Tú)</label>
              <input type="text" id="p-a-name" value="${U.esc(pA.name)}" />
            </div>
            <div class="form-group">
              <label>Peso Proporcional % (Perfil 1)</label>
              <input type="number" id="p-a-weight" min="0" max="100" value="${U.esc(pA.incomeWeight)}" />
            </div>
            <div class="form-group">
              <label>Nombre Perfil 2 (Tu Pareja)</label>
              <input type="text" id="p-b-name" value="${U.esc(pB.name)}" />
            </div>
            <div class="form-group">
              <label>Peso Proporcional % (Pareja)</label>
              <input type="number" id="p-b-weight" value="${100 - (Number(pA.incomeWeight) || 50)}" disabled />
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap;gap:8px;">
            <button class="btn btn-primary btn-sm" id="btn-save-partners">Guardar Perfiles</button>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm" id="btn-export-couple-sync">📤 Exportar Sync Pareja</button>
              <label class="btn btn-sm" style="cursor:pointer;">
                📥 Fusionar Sync Pareja
                <input type="file" id="inp-import-couple-sync" accept=".json" style="display:none;" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">🎯 Metas de Ahorro (Personales y Compartidas)</h3>
            <span class="card-subtitle">Fondo de emergencia, viajes, hogar o metas individuales</span>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-goal">+ Nueva Meta</button>
        </div>
        <div class="grid-2">${goalsHtml}</div>
      </div>
    `;

    $("#p-a-weight").addEventListener("input", (e) => {
      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      $("#p-b-weight").value = 100 - v;
    });

    $("#btn-save-partners").addEventListener("click", async () => {
      const wA = Math.max(
        0,
        Math.min(100, Number($("#p-a-weight").value) || 50),
      );
      s.partners.a.name = $("#p-a-name").value.trim() || "Yo";
      s.partners.b.name = $("#p-b-name").value.trim() || "Mi Pareja";
      s.partners.a.incomeWeight = wA;
      s.partners.b.incomeWeight = 100 - wA;
      await Store.save();
      toast("Perfiles de pareja guardados", "success");
      render();
    });

    $("#btn-settle-up")?.addEventListener("click", async () => {
      const payer = settle.netBalanceA > 0 ? "b" : "a";
      await Store.addTransaction({
        type: "transfer",
        date: U.todayISO(),
        amount: Math.round(absNet * 100) / 100,
        currency: baseCur,
        accountId: Store.state.accounts[0]?.id || "",
        toAccountId: Store.state.accounts[0]?.id || "",
        merchant: `Liquidación entre ${pA.name} y ${pB.name}`,
        memo: "Ajuste de gastos compartidos",
        tags: ["liquidacion", "pareja"],
        scope: "couple",
        paidBy: payer,
        splitMode: payer === "a" ? "100_a" : "100_b",
        splitRatioA: payer === "a" ? 100 : 0,
      });
      toast("Liquidación registrada", "success");
      render();
    });

    $("#btn-export-couple-sync").addEventListener("click", () => {
      const pkg = Store.exportCoupleSyncPackage();
      CSV.downloadFile(
        `aureo-pareja-sync-${U.todayISO()}.json`,
        JSON.stringify(pkg, null, 2),
        "application/json",
      );
      toast("Paquete de sincronización de pareja exportado", "success");
    });

    $("#inp-import-couple-sync").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const pkg = JSON.parse(await file.text());
        const res = await Store.mergeCoupleSyncPackage(pkg);
        toast(
          `Sincronización completa: ${res.mergedTx} movimientos fusionados`,
          "success",
        );
        render();
      } catch (err) {
        toast(err.message, "error");
      }
    });

    $("#btn-add-goal").addEventListener("click", () => openGoalModal());
    $all("[data-del-goal]").forEach((b) =>
      b.addEventListener("click", async () => {
        await Store.deleteGoal(b.dataset.delGoal);
        render();
      }),
    );
    $all("[data-fund-goal]").forEach((b) =>
      b.addEventListener("click", async () => {
        const g = Store.state.goals.find((x) => x.id === b.dataset.fundGoal);
        if (!g) return;
        openModal({
          title: `Abonar a ${g.name}`,
          bodyHtml: `<div class="form-group"><label>Monto a abonar (${U.esc(g.currency)})</label><input type="number" id="goal-add-amt" step="0.01" min="1" value="1000" /></div>`,
          footerHtml: `<button class="btn" id="g-cancel">Cancelar</button><button class="btn btn-primary" id="g-ok">Abonar</button>`,
          onMount: (body, foot) => {
            $("#g-cancel", foot).addEventListener("click", closeModal);
            $("#g-ok", foot).addEventListener("click", async () => {
              const add = Number($("#goal-add-amt", body).value) || 0;
              await Store.saveGoal(
                Object.assign({}, g, {
                  currentAmount: (Number(g.currentAmount) || 0) + add,
                }),
              );
              closeModal();
              toast("Abono registrado en la meta", "success");
              render();
            });
          },
        });
      }),
    );
  }

  /* ========================================================================
     7. SETTINGS, CSV IMPORT/EXPORT, AI & RULES VIEW
     ======================================================================== */
  function renderSettings(container) {
    const s = Store.state.settings;
    const curOpts = Object.values(U.CURRENCIES)
      .map(
        (c) =>
          `<option value="${c.code}" ${s.baseCurrency === c.code ? "selected" : ""}>${c.code} — ${c.name}</option>`,
      )
      .join("");
    const accOpts = Store.state.accounts
      .map(
        (a) =>
          `<option value="${U.esc(a.id)}">${U.esc(a.name)} (${a.currency})</option>`,
      )
      .join("");

    const rulesRows =
      Store.state.rules
        .map(
          (r) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
        <div>
          <code>${U.esc(r.pattern)}</code> →
          <strong>${r.targetType === "transfer" ? "Transferencia a " + U.esc(Store.getAccount(r.toAccountId)?.name || "") : U.esc(Store.getCategory(r.categoryId)?.name || "")}</strong>
          <span class="badge badge-neutral">${r.scope === "couple" ? "Pareja" : "Personal"}</span>
        </div>
        <button class="btn btn-sm btn-ghost" data-del-rule="${U.esc(r.id)}">✕</button>
      </div>`,
        )
        .join("") || '<div class="empty-state">Sin reglas automáticas</div>';

    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3 class="card-title">⚙️ Preferencias Generales y Ciclo Zaim</h3></div>
          <div class="form-grid">
            <div class="form-group">
              <label>Moneda Base</label>
              <select id="set-currency">${curOpts}</select>
            </div>
            <div class="form-group">
              <label>Modo de Ciclo</label>
              <select id="set-cycle-mode">
                <option value="monthly" ${s.cycleMode === "monthly" ? "selected" : ""}>Mensual (desde día de corte)</option>
                <option value="biweekly" ${s.cycleMode === "biweekly" ? "selected" : ""}>Quincenal (1–15 / 16–fin)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Día de inicio / nómina (1–28)</label>
              <input type="number" id="set-payday" min="1" max="28" value="${s.paydayDay}" />
            </div>
            <div class="form-group">
              <label>Tasa USD → MXN</label>
              <input type="number" id="set-rate-usd" step="0.01" value="${s.exchangeRates.USD}" />
            </div>
            <div class="form-group full">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="set-always-items" ${s.alwaysShowItems ? "checked" : ""} style="width:auto;" />
                Mostrar siempre desglose de artículos (品目) al registrar un gasto
              </label>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-save-general" style="margin-top:12px;">Guardar Preferencias</button>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title">📸 Escáner de Recibos con IA (Gemini)</h3></div>
          <p style="font-size:12.5px;color:var(--text-secondary);margin-top:0;">
            Tu clave se guarda únicamente en tu dispositivo y se envía directo a Google Gemini API cuando escaneas un ticket. Sin servidor intermedio.
          </p>
          <div class="form-grid">
            <div class="form-group full">
              <label>Gemini API Key</label>
              <input type="password" id="set-gemini-key" value="${U.esc(s.geminiApiKey || "")}" placeholder="AIzaSy..." />
            </div>
            <div class="form-group full">
              <label>Modelo Gemini</label>
              <select id="set-gemini-model">${buildGeminiModelOptions(s.geminiModel)}</select>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-primary btn-sm" id="btn-save-ai">Guardar Clave IA</button>
            <button class="btn btn-sm" id="btn-test-scanner">Probar Escáner</button>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3 class="card-title">🏦 Importar Estado de Cuenta Bancario (CSV / Excel)</h3></div>
          <div class="form-grid">
            <div class="form-group full">
              <label>Archivo CSV del banco</label>
              <input type="file" id="csv-file-input" accept=".csv,.txt,.tsv" />
            </div>
            <div class="form-group">
              <label>Cuenta destino</label>
              <select id="csv-target-acc">${accOpts}</select>
            </div>
            <div class="form-group">
              <label>Ámbito por defecto</label>
              <select id="csv-target-scope">
                <option value="personal">Personal</option>
                <option value="couple">En Pareja</option>
              </select>
            </div>
          </div>
          <div id="csv-preview-box" style="margin-top:12px;"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🤖 Reglas Automáticas (Categoría / Transferencia)</h3>
            <button class="btn btn-sm" id="btn-add-rule">+ Regla</button>
          </div>
          ${rulesRows}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">💾 Respaldos, Exportación y Mantenimiento</h3></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-sm" id="btn-exp-csv">Exportar Todo a CSV (Excel)</button>
          <button class="btn btn-sm" id="btn-exp-json">Descargar Respaldo Completo (.json)</button>
          <label class="btn btn-sm" style="cursor:pointer;">
            Restaurar Respaldo (.json)
            <input type="file" id="inp-restore-json" accept=".json" style="display:none;" />
          </label>
          <button class="btn btn-sm btn-danger" id="btn-reset-empty">Borrar Todo y Empezar en Cero</button>
          <button class="btn btn-sm" id="btn-reset-demo">Cargar Datos Demo</button>
        </div>
      </div>
    `;

    $("#btn-save-general").addEventListener("click", async () => {
      s.baseCurrency = $("#set-currency").value;
      s.cycleMode = $("#set-cycle-mode").value;
      s.paydayDay = Math.max(
        1,
        Math.min(28, Number($("#set-payday").value) || 1),
      );
      s.exchangeRates.USD = Number($("#set-rate-usd").value) || 20.15;
      s.alwaysShowItems = $("#set-always-items").checked;
      await Store.save();
      toast("Preferencias guardadas", "success");
      render();
    });

    $("#btn-save-ai").addEventListener("click", async () => {
      s.geminiApiKey = $("#set-gemini-key").value.trim();
      s.geminiModel = $("#set-gemini-model").value;
      await Store.save();
      toast("Configuración de IA guardada", "success");
    });
    $("#btn-test-scanner").addEventListener("click", () =>
      openReceiptScannerModal(),
    );

    $("#csv-file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const parsed = CSV.parseCSVText(text);
      ui.csvParsed = parsed;
      const map = CSV.guessColumnMapping(parsed.headers);
      const colOpts = (sel) =>
        parsed.headers
          .map(
            (h, i) =>
              `<option value="${i}" ${sel === i ? "selected" : ""}>${U.esc(h)}</option>`,
          )
          .join("");
      $("#csv-preview-box").innerHTML = `
        <div style="font-size:12.5px;margin-bottom:8px;">Detectadas <strong>${parsed.rows.length}</strong> filas. Verifica el mapeo de columnas:</div>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-group"><label>Fecha</label><select id="map-date">${colOpts(map.date)}</select></div>
          <div class="form-group"><label>Concepto / Comercio</label><select id="map-merchant">${colOpts(map.merchant)}</select></div>
          <div class="form-group"><label>Monto único</label><select id="map-amount"><option value="-1">-- Usar Cargo/Abono --</option>${colOpts(map.amount)}</select></div>
          <div class="form-group"><label>Cargo (si aplica)</label><select id="map-debit"><option value="-1">-- Ninguno --</option>${colOpts(map.debit)}</select></div>
          <div class="form-group"><label>Abono (si aplica)</label><select id="map-credit"><option value="-1">-- Ninguno --</option>${colOpts(map.credit)}</select></div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-run-csv-import">Importar Movimientos</button>
      `;
      $("#btn-run-csv-import").addEventListener("click", async () => {
        const finalMap = {
          date: Number($("#map-date").value),
          merchant: Number($("#map-merchant").value),
          amount: Number($("#map-amount").value),
          debit: Number($("#map-debit").value),
          credit: Number($("#map-credit").value),
        };
        const accId = $("#csv-target-acc").value;
        const acc = Store.getAccount(accId);
        const res = CSV.buildTransactionsFromCSV(
          parsed,
          finalMap,
          {
            accountId: accId,
            currency: acc?.currency || Store.getBaseCurrency(),
            scope: $("#csv-target-scope").value,
            paidBy: s.activeWorkspace === "solo_b" ? "b" : "a",
          },
          Store,
        );
        for (const tx of res.imported) {
          await Store.addTransaction(tx);
        }
        toast(
          `Importados ${res.imported.length} movimientos (${res.duplicates} duplicados omitidos)`,
          "success",
        );
        $("#csv-preview-box").innerHTML = "";
      });
    });

    $("#btn-add-rule").addEventListener("click", () => openRuleModal());
    $all("[data-del-rule]").forEach((b) =>
      b.addEventListener("click", async () => {
        await Store.deleteRule(b.dataset.delRule);
        render();
      }),
    );

    $("#btn-exp-csv").addEventListener("click", () => {
      CSV.exportTransactionsCSV(Store.state.transactions, Store);
      toast("CSV completo exportado", "success");
    });
    $("#btn-exp-json").addEventListener("click", () => {
      CSV.downloadFile(
        `aureo-respaldo-${U.todayISO()}.json`,
        JSON.stringify(Store.state, null, 2),
        "application/json",
      );
      toast("Respaldo JSON descargado", "success");
    });
    $("#inp-restore-json").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        Store.state = Store.migrate(data);
        await Store.save();
        toast("Respaldo restaurado correctamente", "success");
        render();
      } catch {
        toast("El archivo JSON no es un respaldo válido", "error");
      }
    });
    $("#btn-reset-empty").addEventListener("click", async () => {
      if (
        !global.confirm(
          "¿Seguro que deseas borrar todos los movimientos y empezar desde cero?",
        )
      )
        return;
      await Store.resetState(true);
      toast("Base limpia creada", "info");
      render();
    });
    $("#btn-reset-demo").addEventListener("click", async () => {
      await Store.resetState(false);
      toast("Datos demo cargados", "success");
      render();
    });
  }

  /* ========================================================================
     MODALS: TRANSACTION, RECEIPT AI, ACCOUNT, RECURRING, GOAL, RULE, MORE
     ======================================================================== */
  function openTxModal(initial = {}) {
    const s = Store.state.settings;
    const isEdit = Boolean(initial.id);
    const txType = initial.type || "expense";
    const baseCur = initial.currency || Store.getBaseCurrency();
    const accounts = Store.state.accounts.filter((a) => !a.archived);
    const defaultAcc = initial.accountId || accounts[0]?.id || "";
    const defaultToAcc = initial.toAccountId || accounts[1]?.id || defaultAcc;
    const defaultScope =
      initial.scope || (s.activeWorkspace === "couple" ? "couple" : "personal");
    const items = Array.isArray(initial.items)
      ? initial.items.map((x) => Object.assign({}, x))
      : [];

    const merchants = Array.from(
      new Set(Store.state.transactions.map((t) => t.merchant).filter(Boolean)),
    ).slice(0, 40);
    const datalist = `<datalist id="merchant-list">${merchants.map((m) => `<option value="${U.esc(m)}">`).join("")}</datalist>`;

    const buildCatOptions = (type, selectedId) =>
      Store.state.categories
        .filter((c) => c.type === (type === "income" ? "income" : "expense"))
        .map(
          (c) =>
            `<option value="${U.esc(c.id)}" ${selectedId === c.id ? "selected" : ""}>${U.esc(c.icon + " " + c.name)}</option>`,
        )
        .join("");

    const buildAccOptions = (selectedId) =>
      accounts
        .map(
          (a) =>
            `<option value="${U.esc(a.id)}" ${selectedId === a.id ? "selected" : ""}>${U.esc(a.name)} (${a.currency})</option>`,
        )
        .join("");

    const curOptions = Object.keys(U.CURRENCIES)
      .map(
        (c) =>
          `<option value="${c}" ${baseCur === c ? "selected" : ""}>${c}</option>`,
      )
      .join("");

    openModal({
      title: isEdit ? "Editar Movimiento" : "Registrar Movimiento",
      large: true,
      bodyHtml: `
        ${datalist}
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <div class="seg-tabs" id="tx-type-tabs">
            <button type="button" class="seg-tab ${txType === "expense" ? "active" : ""}" data-tx-type="expense">Gasto</button>
            <button type="button" class="seg-tab ${txType === "income" ? "active" : ""}" data-tx-type="income">Ingreso</button>
            <button type="button" class="seg-tab ${txType === "transfer" ? "active" : ""}" data-tx-type="transfer">Transferencia (振替)</button>
          </div>
          ${!isEdit ? `<button type="button" class="btn btn-sm" id="tx-open-scanner">📸 Escanear Recibo IA</button>` : ""}
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Monto</label>
            <input type="number" id="tx-amount" step="0.01" min="0" value="${initial.amount || ""}" placeholder="0.00" style="font-size:18px;font-weight:700;" />
          </div>
          <div class="form-group">
            <label>Moneda</label>
            <select id="tx-currency">${curOptions}</select>
          </div>
          <div class="form-group">
            <label id="lbl-tx-acc">${txType === "transfer" ? "Cuenta Origen" : "Cuenta / Tarjeta"}</label>
            <select id="tx-account">${buildAccOptions(defaultAcc)}</select>
          </div>
          <div class="form-group" id="grp-tx-to-acc" style="display:${txType === "transfer" ? "flex" : "none"};">
            <label>Cuenta Destino</label>
            <select id="tx-to-account">${buildAccOptions(defaultToAcc)}</select>
          </div>
          <div class="form-group" id="grp-tx-cat" style="display:${txType === "transfer" ? "none" : "flex"};">
            <label>Categoría</label>
            <select id="tx-category">${buildCatOptions(txType, initial.categoryId)}</select>
          </div>
          <div class="form-group">
            <label>Comercio / Concepto</label>
            <input type="text" id="tx-merchant" list="merchant-list" value="${U.esc(initial.merchant || "")}" placeholder="Ej. Supermercado, Café, Nómina..." />
          </div>
          <div class="form-group">
            <label>Fecha</label>
            <input type="date" id="tx-date" value="${initial.date || U.todayISO()}" />
          </div>
          <div class="form-group">
            <label>Hora</label>
            <input type="time" id="tx-time" value="${initial.time || U.nowTime()}" />
          </div>

          <div class="form-group">
            <label>Ámbito (Solo vs Pareja)</label>
            <select id="tx-scope">
              <option value="personal" ${defaultScope === "personal" ? "selected" : ""}>Personal (Solo)</option>
              <option value="couple" ${defaultScope === "couple" ? "selected" : ""}>Compartido (En Pareja)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Pagado / Registrado por</label>
            <select id="tx-paid-by">
              <option value="a" ${(initial.paidBy || "a") === "a" ? "selected" : ""}>${U.esc(s.partners.a.name)}</option>
              <option value="b" ${initial.paidBy === "b" ? "selected" : ""}>${U.esc(s.partners.b.name)}</option>
            </select>
          </div>
          <div class="form-group full" id="grp-split-mode" style="display:${defaultScope === "couple" ? "flex" : "none"};">
            <label>División en Pareja</label>
            <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;">
              <select id="tx-split-mode">
                <option value="50_50" ${(initial.splitMode || "50_50") === "50_50" ? "selected" : ""}>50% / 50% (Mitades iguales)</option>
                <option value="proportional" ${initial.splitMode === "proportional" ? "selected" : ""}>Proporcional al ingreso (${s.partners.a.incomeWeight}% / ${100 - s.partners.a.incomeWeight}%)</option>
                <option value="100_a" ${initial.splitMode === "100_a" ? "selected" : ""}>100% ${U.esc(s.partners.a.name)}</option>
                <option value="100_b" ${initial.splitMode === "100_b" ? "selected" : ""}>100% ${U.esc(s.partners.b.name)}</option>
                <option value="custom" ${initial.splitMode === "custom" ? "selected" : ""}>Porcentaje personalizado</option>
              </select>
              <input type="number" id="tx-split-a" min="0" max="100" value="${initial.splitRatioA ?? 50}" placeholder="% Tú" ${initial.splitMode === "custom" ? "" : "disabled"} />
            </div>
          </div>

          <div class="form-group">
            <label>Etiquetas (separadas por coma)</label>
            <input type="text" id="tx-tags" value="${U.esc((initial.tags || []).join(", "))}" placeholder="recibo, viaje, deducible" />
          </div>
          <div class="form-group">
            <label>Nota / Memo</label>
            <input type="text" id="tx-memo" value="${U.esc(initial.memo || "")}" placeholder="Detalle adicional..." />
          </div>
        </div>

        <div id="tx-items-section" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-subtle);display:${txType === "expense" && (s.alwaysShowItems || items.length) ? "block" : "none"};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="font-size:13px;">🧾 Desglose de Artículos (Estilo Zaim 品目)</strong>
            <button type="button" class="btn btn-sm" id="btn-add-item">+ Artículo</button>
          </div>
          <div id="tx-items-list"></div>
        </div>

        ${initial.receiptImage ? `<div style="margin-top:12px;"><label>Ticket adjunto</label><img src="${initial.receiptImage}" alt="Recibo" style="max-height:140px;border-radius:8px;margin-top:4px;display:block;border:1px solid var(--border-subtle);" /></div>` : ""}
      `,
      footerHtml: `
        ${isEdit ? `<button class="btn btn-danger" id="tx-del" style="margin-right:auto;">Eliminar</button>` : `<label style="display:flex;align-items:center;gap:6px;margin-right:auto;font-size:12px;cursor:pointer;"><input type="checkbox" id="tx-save-fav" style="width:auto;" /> Guardar como Favorito</label>`}
        <button class="btn" id="tx-cancel">Cancelar</button>
        <button class="btn btn-primary" id="tx-save">${isEdit ? "Guardar Cambios" : "Registrar"}</button>
      `,
      onMount: (body, foot) => {
        let currentType = txType;
        const expCats = Store.state.categories.filter(
          (c) => c.type === "expense",
        );

        function renderItems() {
          const list = $("#tx-items-list", body);
          if (!items.length) {
            list.innerHTML =
              '<div style="font-size:12px;color:var(--text-muted);">Opcional: divide una compra en artículos con categorías distintas.</div>';
            return;
          }
          list.innerHTML = items
            .map(
              (it, idx) => `
            <div class="item-row" data-item-idx="${idx}">
              <input type="text" class="it-name" value="${U.esc(it.name)}" placeholder="Artículo" />
              <input type="number" step="0.01" class="it-amt num" value="${it.amount || ""}" placeholder="0.00" />
              <select class="it-cat">${expCats.map((c) => `<option value="${U.esc(c.id)}" ${it.categoryId === c.id ? "selected" : ""}>${U.esc(c.icon + " " + c.name)}</option>`).join("")}</select>
              <button type="button" class="btn btn-sm btn-ghost it-del">✕</button>
            </div>`,
            )
            .join("");

          $all(".item-row", list).forEach((row) => {
            const idx = Number(row.dataset.itemIdx);
            $(".it-name", row).addEventListener("input", (e) => {
              items[idx].name = e.target.value;
            });
            $(".it-amt", row).addEventListener("input", (e) => {
              items[idx].amount = Number(e.target.value) || 0;
              const sum = items.reduce(
                (a, b) => a + (Number(b.amount) || 0),
                0,
              );
              if (sum > 0) $("#tx-amount", body).value = sum.toFixed(2);
            });
            $(".it-cat", row).addEventListener("change", (e) => {
              items[idx].categoryId = e.target.value;
            });
            $(".it-del", row).addEventListener("click", () => {
              items.splice(idx, 1);
              renderItems();
            });
          });
        }
        renderItems();

        $("#btn-add-item", body).addEventListener("click", () => {
          items.push({
            id: Meta.uid("it"),
            name: "",
            amount: 0,
            categoryId: $("#tx-category", body).value || expCats[0]?.id,
          });
          renderItems();
        });

        $all("#tx-type-tabs .seg-tab", body).forEach((tab) => {
          tab.addEventListener("click", () => {
            currentType = tab.dataset.txType;
            $all("#tx-type-tabs .seg-tab", body).forEach((t) =>
              t.classList.toggle("active", t === tab),
            );
            $("#lbl-tx-acc", body).textContent =
              currentType === "transfer" ? "Cuenta Origen" : "Cuenta / Tarjeta";
            $("#grp-tx-to-acc", body).style.display =
              currentType === "transfer" ? "flex" : "none";
            $("#grp-tx-cat", body).style.display =
              currentType === "transfer" ? "none" : "flex";
            $("#tx-category", body).innerHTML = buildCatOptions(
              currentType,
              null,
            );
            $("#tx-items-section", body).style.display =
              currentType === "expense" && (s.alwaysShowItems || items.length)
                ? "block"
                : "none";
          });
        });

        $("#tx-scope", body).addEventListener("change", (e) => {
          $("#grp-split-mode", body).style.display =
            e.target.value === "couple" ? "flex" : "none";
        });

        if (!isEdit) {
          $("#tx-merchant", body).addEventListener("blur", () => {
            const draft = {
              type: currentType,
              merchant: $("#tx-merchant", body).value,
              memo: $("#tx-memo", body).value,
            };
            Store.applyAutoRules(draft);
            if (
              draft.type === "transfer" &&
              currentType !== "transfer" &&
              draft.toAccountId
            ) {
              $(`#tx-type-tabs [data-tx-type="transfer"]`, body)?.click();
              $("#tx-to-account", body).value = draft.toAccountId;
            } else if (draft.categoryId && currentType !== "transfer") {
              $("#tx-category", body).value = draft.categoryId;
            }
          });
        }

        $("#tx-split-mode", body).addEventListener("change", (e) => {
          const mode = e.target.value;
          const inp = $("#tx-split-a", body);
          inp.disabled = mode !== "custom";
          if (mode === "50_50") inp.value = 50;
          else if (mode === "proportional")
            inp.value = s.partners.a.incomeWeight;
          else if (mode === "100_a") inp.value = 100;
          else if (mode === "100_b") inp.value = 0;
        });

        $("#tx-open-scanner", body)?.addEventListener("click", () => {
          closeModal();
          openReceiptScannerModal();
        });

        $("#tx-cancel", foot).addEventListener("click", closeModal);
        $("#tx-del", foot)?.addEventListener("click", async () => {
          await Store.deleteTransaction(initial.id);
          closeModal();
          toast("Movimiento eliminado", "info");
          render();
        });

        $("#tx-save", foot).addEventListener("click", async () => {
          const amount = Number($("#tx-amount", body).value);
          if (!amount || amount <= 0) {
            toast("Ingresa un monto mayor a 0", "error");
            return;
          }
          const scope = $("#tx-scope", body).value;
          const splitMode =
            scope === "couple"
              ? $("#tx-split-mode", body).value
              : $("#tx-paid-by", body).value === "b"
                ? "100_b"
                : "100_a";
          const splitRatioA = Number($("#tx-split-a", body).value) ?? 50;
          const tags = $("#tx-tags", body)
            .value.split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          const payload = {
            type: currentType,
            amount,
            currency: $("#tx-currency", body).value,
            accountId: $("#tx-account", body).value,
            toAccountId:
              currentType === "transfer"
                ? $("#tx-to-account", body).value
                : null,
            categoryId:
              currentType === "transfer" ? null : $("#tx-category", body).value,
            merchant: $("#tx-merchant", body).value.trim(),
            date: $("#tx-date", body).value || U.todayISO(),
            time: $("#tx-time", body).value || U.nowTime(),
            scope,
            paidBy: $("#tx-paid-by", body).value,
            splitMode,
            splitRatioA,
            tags,
            memo: $("#tx-memo", body).value.trim(),
            items:
              currentType === "expense"
                ? items.filter((i) => i.name || i.amount > 0)
                : [],
            receiptImage: initial.receiptImage || null,
          };

          if (isEdit) {
            await Store.updateTransaction(initial.id, payload);
            toast("Movimiento actualizado", "success");
          } else {
            await Store.addTransaction(payload);
            if ($("#tx-save-fav", foot)?.checked) {
              await Store.addFavorite({
                label:
                  payload.merchant ||
                  Store.getCategory(payload.categoryId)?.name ||
                  "Favorito",
                type: payload.type,
                amount: payload.amount,
                currency: payload.currency,
                accountId: payload.accountId,
                toAccountId: payload.toAccountId,
                categoryId: payload.categoryId,
                merchant: payload.merchant,
                scope: payload.scope,
              });
            }
            toast("Movimiento registrado", "success");
          }
          closeModal();
          render();
        });
      },
    });
  }

  function buildGeminiModelOptions(selected) {
    const models = [
      { id: "gemini-3.8-flash", label: "gemini-3.8-flash (Rápido y preciso)" },
      { id: "gemini-3.8-pro", label: "gemini-3.8-pro (Pro)" },
      { id: "gemini-4-hydrogen", label: "gemini-4-hydrogen (Gemini 4 equilibrado)" },
      { id: "gemini-4-carbon", label: "gemini-4-carbon (Gemini 4 máxima precisión)" },
    ];
    return models
      .map(
        (m) =>
          `<option value="${U.esc(m.id)}" ${selected === m.id ? "selected" : ""}>${U.esc(m.label)}</option>`,
      )
      .join("");
  }

  function openReceiptScannerModal() {
    const s = Store.state.settings;
    let compressed = null;
    let stream = null;

    function stopStream() {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    }

    openModal({
      title: "📸 Escáner de Recibos con IA",
      large: true,
      onClose: stopStream,
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" class="scanner-grid">
          <div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <label class="btn btn-primary btn-sm" style="cursor:pointer;">
                📁 Subir Imagen
                <input type="file" id="scan-file-inp" accept="image/*" style="display:none;" />
              </label>
              <label class="btn btn-sm" style="cursor:pointer;" title="Abrir cámara nativa del teléfono">
                📱 Foto Móvil
                <input type="file" id="scan-mobile-cam-inp" accept="image/*" capture="environment" style="display:none;" />
              </label>
              <button type="button" class="btn btn-sm" id="btn-webcam">🎥 Cámara en vivo</button>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label for="scan-camera-select">Cámara para escaneo en vivo</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <select id="scan-camera-select">
                  <option value="">Cámara predeterminada (trasera / principal)</option>
                </select>
                <button type="button" class="btn btn-sm btn-icon" id="btn-refresh-cams" title="Detectar cámaras disponibles">↻</button>
              </div>
            </div>
            <div id="scan-preview" style="border:1px dashed var(--border-strong);border-radius:12px;min-height:190px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);overflow:hidden;padding:8px;text-align:center;">
              Selecciona o toma una foto de tu ticket para extraer tienda, fecha, total y desglose de artículos.
            </div>
            <video id="scan-video" autoplay playsinline muted style="display:none;width:100%;border-radius:10px;margin-top:8px;background:#000;"></video>
            <button type="button" class="btn btn-success btn-sm" id="btn-snap-webcam" style="display:none;margin-top:8px;width:100%;">📸 Capturar Foto</button>
          </div>
          <div>
            <div class="form-group" style="margin-bottom:10px;">
              <label for="scan-model-select">Modelo Gemini IA</label>
              <select id="scan-model-select">${buildGeminiModelOptions(s.geminiModel)}</select>
            </div>
            <label>O pega texto de un ticket digital (sin API Key)</label>
            <textarea id="scan-raw-text" rows="6" placeholder="Ejemplo:\nSUPERMERCADO FRESKO\n2026-11-25\nAguacate Hass 68.50\nPechuga de pollo 145.00\nDetergente liquido 119.00\nTOTAL 332.50" style="margin-top:6px;"></textarea>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm" id="btn-sample-ticket">Cargar Ticket Ejemplo</button>
              <button type="button" class="btn btn-sm" id="btn-parse-text">Analizar Texto Local</button>
            </div>
            <div style="margin-top:12px;font-size:12px;color:var(--text-muted);">
              Estado Gemini IA: ${s.geminiApiKey ? '<strong style="color:var(--income);">Clave configurada ✓</strong>' : '<strong style="color:var(--warning);">Sin clave (configúrala en Ajustes para lectura de fotos)</strong>'}
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn" id="scan-cancel">Cerrar</button>
        <button class="btn btn-primary" id="scan-run-ai" disabled>✨ Extraer con Gemini IA</button>
      `,
      onMount: (body, foot) => {
        const preview = $("#scan-preview", body);
        const btnAI = $("#scan-run-ai", foot);
        const video = $("#scan-video", body);
        const btnSnap = $("#btn-snap-webcam", body);
        const camSelect = $("#scan-camera-select", body);
        const modelSelect = $("#scan-model-select", body);

        async function loadImageFromInput(file) {
          if (!file) return;
          stopStream();
          video.style.display = "none";
          btnSnap.style.display = "none";
          preview.style.display = "flex";
          compressed = await AI.compressImageFile(file);
          preview.innerHTML = `<img src="${compressed.dataUrl}" style="max-height:240px;max-width:100%;border-radius:8px;" />`;
          btnAI.disabled = false;
        }

        async function populateCameras(activeId = s.preferredCameraId) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return [];
          }
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter((d) => d.kind === "videoinput");
            if (!cams.length) {
              camSelect.innerHTML = `<option value="">Sin cámaras detectadas</option>`;
              return [];
            }
            const opts = cams.map((c, idx) => {
              const label = c.label || `Cámara ${idx + 1}`;
              return `<option value="${U.esc(c.deviceId)}">${U.esc(label)}</option>`;
            });
            camSelect.innerHTML = opts.join("");
            if (activeId && cams.some((c) => c.deviceId === activeId)) {
              camSelect.value = activeId;
            }
            return cams;
          } catch {
            return [];
          }
        }

        async function startCamera(deviceId) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast(
              "La cámara en vivo requiere http://localhost o HTTPS. Usa 'Subir Imagen' o 'Foto Móvil'.",
              "error",
            );
            return;
          }
          stopStream();
          const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId } } }
            : { video: { facingMode: { ideal: "environment" } } };
          try {
            try {
              stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch {
              stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            video.srcObject = stream;
            video.style.display = "block";
            preview.style.display = "none";
            btnSnap.style.display = "inline-flex";

            const activeTrack = stream.getVideoTracks()[0];
            const activeId = activeTrack?.getSettings?.().deviceId || deviceId || "";
            if (activeId) {
              s.preferredCameraId = activeId;
              Store.save(false);
            }
            await populateCameras(activeId);
          } catch {
            toast("No se pudo acceder a la cámara seleccionada", "error");
          }
        }

        populateCameras(s.preferredCameraId);

        modelSelect.addEventListener("change", async () => {
          s.geminiModel = modelSelect.value;
          await Store.save(false);
        });

        $("#scan-file-inp", body).addEventListener("change", (e) =>
          loadImageFromInput(e.target.files[0]),
        );
        $("#scan-mobile-cam-inp", body).addEventListener("change", (e) =>
          loadImageFromInput(e.target.files[0]),
        );

        $("#btn-refresh-cams", body).addEventListener("click", async () => {
          const cams = await populateCameras(camSelect.value || s.preferredCameraId);
          if (cams.length && cams.every((c) => !c.label)) {
            await startCamera(camSelect.value || "");
          } else {
            toast(`${cams.length} cámara(s) detectada(s)`, "info");
          }
        });

        $("#btn-webcam", body).addEventListener("click", () => {
          startCamera(camSelect.value || s.preferredCameraId);
        });

        camSelect.addEventListener("change", async () => {
          s.preferredCameraId = camSelect.value;
          await Store.save(false);
          if (stream) {
            await startCamera(camSelect.value);
          }
        });

        btnSnap.addEventListener("click", () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 1024;
          canvas.height = video.videoHeight || 768;
          canvas.getContext("2d").drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          compressed = {
            dataUrl,
            base64: dataUrl.split(",")[1],
            mimeType: "image/jpeg",
          };
          stopStream();
          video.style.display = "none";
          btnSnap.style.display = "none";
          preview.style.display = "flex";
          preview.innerHTML = `<img src="${dataUrl}" style="max-height:240px;max-width:100%;border-radius:8px;" />`;
          btnAI.disabled = false;
        });

        $("#btn-sample-ticket", body).addEventListener("click", () => {
          $("#scan-raw-text", body).value =
            `HEB SUPERMERCADO\n${U.todayISO()}\nManzana Gala 1kg 54.00\nLeche deslactosada 28.50\nCafe tostado 189.00\nJabon ropa 112.00\nTOTAL 383.50`;
        });

        $("#btn-parse-text", body).addEventListener("click", () => {
          try {
            const parsed = AI.parseReceiptTextLocal(
              $("#scan-raw-text", body).value,
              Store.state.categories,
            );
            stopStream();
            closeModal();
            openTxModal({
              type: "expense",
              amount: parsed.total,
              currency: parsed.currency,
              merchant: parsed.merchant,
              date: parsed.date,
              time: parsed.time,
              categoryId: parsed.categoryId,
              memo: parsed.memo,
              items: parsed.items,
              tags: ["recibo"],
            });
          } catch (err) {
            toast(err.message, "error");
          }
        });

        btnAI.addEventListener("click", async () => {
          if (!compressed) return;
          btnAI.disabled = true;
          btnAI.textContent = "Analizando ticket...";
          try {
            const chosenModel = modelSelect.value || s.geminiModel;
            const parsed = await AI.extractReceiptWithGemini({
              base64: compressed.base64,
              mimeType: compressed.mimeType,
              apiKey: s.geminiApiKey,
              model: chosenModel,
              categories: Store.state.categories,
            });
            stopStream();
            closeModal();
            openTxModal({
              type: "expense",
              amount: parsed.total,
              currency: parsed.currency,
              merchant: parsed.merchant,
              date: parsed.date,
              time: parsed.time,
              categoryId: parsed.categoryId,
              memo: parsed.memo,
              items: parsed.items,
              tags: ["recibo", "ia"],
              receiptImage: compressed.dataUrl,
            });
            toast(`Recibo extraído con ${chosenModel}`, "success");
          } catch (err) {
            btnAI.disabled = false;
            btnAI.textContent = "✨ Extraer con Gemini IA";
            toast(err.message, "error");
          }
        });

        $("#scan-cancel", foot).addEventListener("click", () => {
          stopStream();
          closeModal();
        });
      },
    });
  }

  function openAccountModal(initial = {}) {
    const s = Store.state.settings;
    const isEdit = Boolean(initial.id);
    const typeOpts = Object.entries(Meta.ACCOUNT_TYPES)
      .map(
        ([k, v]) =>
          `<option value="${k}" ${initial.type === k ? "selected" : ""}>${v.icon} ${v.label}</option>`,
      )
      .join("");
    const curOpts = Object.keys(U.CURRENCIES)
      .map(
        (c) =>
          `<option value="${c}" ${(initial.currency || Store.getBaseCurrency()) === c ? "selected" : ""}>${c}</option>`,
      )
      .join("");

    openModal({
      title: isEdit ? "Editar Cuenta" : "Nueva Cuenta / Billetera",
      bodyHtml: `
        <div class="form-grid">
          <div class="form-group"><label>Nombre</label><input type="text" id="acc-name" value="${U.esc(initial.name || "")}" placeholder="Ej. BBVA Débito, Efectivo..." /></div>
          <div class="form-group"><label>Tipo</label><select id="acc-type">${typeOpts}</select></div>
          <div class="form-group"><label>Institución</label><input type="text" id="acc-inst" value="${U.esc(initial.institution || "")}" placeholder="Ej. Nu, BBVA, Cartera" /></div>
          <div class="form-group"><label>Moneda</label><select id="acc-cur">${curOpts}</select></div>
          <div class="form-group"><label>Saldo Inicial</label><input type="number" step="0.01" id="acc-init" value="${initial.initialBalance ?? 0}" /></div>
          <div class="form-group"><label>Límite de Crédito (si es TDC)</label><input type="number" step="100" id="acc-limit" value="${initial.creditLimit || ""}" placeholder="Opcional" /></div>
          <div class="form-group">
            <label>Propietario</label>
            <select id="acc-owner">
              <option value="a" ${initial.owner === "a" ? "selected" : ""}>${U.esc(s.partners.a.name)}</option>
              <option value="b" ${initial.owner === "b" ? "selected" : ""}>${U.esc(s.partners.b.name)}</option>
              <option value="shared" ${initial.owner === "shared" ? "selected" : ""}>Cuenta Conjunta (Pareja)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Privacidad (Zaim Pair)</label>
            <select id="acc-vis">
              <option value="private" ${initial.visibility === "private" ? "selected" : ""}>Privada (Solo propietario)</option>
              <option value="shared" ${initial.visibility === "shared" ? "selected" : ""}>Compartida con Pareja</option>
            </select>
          </div>
        </div>
      `,
      footerHtml: `
        ${isEdit ? '<button class="btn btn-danger" id="acc-del" style="margin-right:auto;">Eliminar</button>' : ""}
        <button class="btn" id="acc-cancel">Cancelar</button>
        <button class="btn btn-primary" id="acc-save">Guardar</button>
      `,
      onMount: (body, foot) => {
        $("#acc-cancel", foot).addEventListener("click", closeModal);
        $("#acc-del", foot)?.addEventListener("click", async () => {
          await Store.deleteAccount(initial.id);
          closeModal();
          render();
        });
        $("#acc-save", foot).addEventListener("click", async () => {
          const type = $("#acc-type", body).value;
          await Store.saveAccount({
            id: initial.id,
            name: $("#acc-name", body).value.trim() || "Cuenta",
            type,
            institution: $("#acc-inst", body).value.trim(),
            currency: $("#acc-cur", body).value,
            initialBalance: Number($("#acc-init", body).value) || 0,
            creditLimit: Number($("#acc-limit", body).value) || undefined,
            owner: $("#acc-owner", body).value,
            visibility: $("#acc-vis", body).value,
            color: Meta.ACCOUNT_TYPES[type]?.color || "#0ea5e9",
          });
          closeModal();
          toast("Cuenta guardada", "success");
          render();
        });
      },
    });
  }

  function openRecurringModal(initial = {}) {
    const accounts = Store.state.accounts.filter((a) => !a.archived);
    const cats = Store.state.categories;
    openModal({
      title: initial.id
        ? "Editar Gasto/Ingreso Fijo"
        : "Nuevo Movimiento Recurrente",
      bodyHtml: `
        <div class="form-grid">
          <div class="form-group"><label>Título</label><input type="text" id="rec-title" value="${U.esc(initial.title || "")}" placeholder="Ej. Renta, Netflix, Nómina" /></div>
          <div class="form-group"><label>Tipo</label><select id="rec-type"><option value="expense" ${initial.type !== "income" ? "selected" : ""}>Gasto Fijo</option><option value="income" ${initial.type === "income" ? "selected" : ""}>Ingreso Fijo</option></select></div>
          <div class="form-group"><label>Monto</label><input type="number" step="0.01" id="rec-amt" value="${initial.amount || ""}" /></div>
          <div class="form-group"><label>Frecuencia</label><select id="rec-freq">
            <option value="monthly" ${initial.frequency === "monthly" ? "selected" : ""}>Mensual</option>
            <option value="biweekly" ${initial.frequency === "biweekly" ? "selected" : ""}>Quincenal</option>
            <option value="weekly" ${initial.frequency === "weekly" ? "selected" : ""}>Semanal</option>
            <option value="yearly" ${initial.frequency === "yearly" ? "selected" : ""}>Anual</option>
          </select></div>
          <div class="form-group"><label>Cuenta</label><select id="rec-acc">${accounts.map((a) => `<option value="${U.esc(a.id)}" ${initial.accountId === a.id ? "selected" : ""}>${U.esc(a.name)}</option>`).join("")}</select></div>
          <div class="form-group"><label>Categoría</label><select id="rec-cat">${cats.map((c) => `<option value="${U.esc(c.id)}" ${initial.categoryId === c.id ? "selected" : ""}>${U.esc(c.icon + " " + c.name)}</option>`).join("")}</select></div>
          <div class="form-group"><label>Próxima ejecución</label><input type="date" id="rec-next" value="${initial.nextRunDate || U.todayISO()}" /></div>
          <div class="form-group"><label>Ámbito</label><select id="rec-scope"><option value="personal" ${initial.scope === "personal" ? "selected" : ""}>Personal</option><option value="couple" ${initial.scope === "couple" ? "selected" : ""}>En Pareja</option></select></div>
        </div>
      `,
      footerHtml: `<button class="btn" id="rec-cancel">Cancelar</button><button class="btn btn-primary" id="rec-save">Guardar</button>`,
      onMount: (body, foot) => {
        $("#rec-cancel", foot).addEventListener("click", closeModal);
        $("#rec-save", foot).addEventListener("click", async () => {
          const acc = Store.getAccount($("#rec-acc", body).value);
          await Store.saveRecurring({
            id: initial.id,
            title: $("#rec-title", body).value.trim() || "Recurrente",
            merchant: $("#rec-title", body).value.trim() || "Recurrente",
            type: $("#rec-type", body).value,
            amount: Number($("#rec-amt", body).value) || 0,
            currency: acc?.currency || Store.getBaseCurrency(),
            frequency: $("#rec-freq", body).value,
            accountId: $("#rec-acc", body).value,
            categoryId: $("#rec-cat", body).value,
            nextRunDate: $("#rec-next", body).value,
            scope: $("#rec-scope", body).value,
            splitMode:
              $("#rec-scope", body).value === "couple" ? "50_50" : "100_a",
            splitRatioA: $("#rec-scope", body).value === "couple" ? 50 : 100,
          });
          closeModal();
          toast("Movimiento recurrente guardado", "success");
          render();
        });
      },
    });
  }

  function openGoalModal() {
    openModal({
      title: "Nueva Meta de Ahorro",
      bodyHtml: `
        <div class="form-grid">
          <div class="form-group full"><label>Nombre de la Meta</label><input type="text" id="g-name" placeholder="Ej. Enganche auto, Viaje Japón..." /></div>
          <div class="form-group"><label>Objetivo</label><input type="number" id="g-target" step="100" /></div>
          <div class="form-group"><label>Ahorro actual</label><input type="number" id="g-cur" step="100" value="0" /></div>
          <div class="form-group"><label>Fecha límite</label><input type="date" id="g-date" /></div>
          <div class="form-group"><label>Ámbito</label><select id="g-scope"><option value="couple">En Pareja</option><option value="personal">Personal</option></select></div>
        </div>`,
      footerHtml: `<button class="btn" id="g-cancel">Cancelar</button><button class="btn btn-primary" id="g-save">Crear Meta</button>`,
      onMount: (body, foot) => {
        $("#g-cancel", foot).addEventListener("click", closeModal);
        $("#g-save", foot).addEventListener("click", async () => {
          await Store.saveGoal({
            name: $("#g-name", body).value.trim() || "Meta",
            targetAmount: Number($("#g-target", body).value) || 10000,
            currentAmount: Number($("#g-cur", body).value) || 0,
            currency: Store.getBaseCurrency(),
            deadline: $("#g-date", body).value,
            scope: $("#g-scope", body).value,
            color:
              $("#g-scope", body).value === "couple" ? "#a855f7" : "#10b981",
          });
          closeModal();
          toast("Meta creada", "success");
          render();
        });
      },
    });
  }

  function openRuleModal() {
    const cats = Store.state.categories;
    const accs = Store.state.accounts;
    openModal({
      title: "Nueva Regla Automática",
      bodyHtml: `
        <div class="form-grid">
          <div class="form-group full"><label>Si el comercio/concepto contiene (texto):</label><input type="text" id="r-pat" placeholder="Ej. UBER, STARBUCKS, PAGO TDC" /></div>
          <div class="form-group"><label>Acción</label><select id="r-type"><option value="expense">Asignar Categoría</option><option value="transfer">Convertir a Transferencia</option></select></div>
          <div class="form-group"><label>Ámbito</label><select id="r-scope"><option value="personal">Personal</option><option value="couple">Pareja</option></select></div>
          <div class="form-group" id="r-cat-g"><label>Categoría</label><select id="r-cat">${cats.map((c) => `<option value="${U.esc(c.id)}">${U.esc(c.icon + " " + c.name)}</option>`).join("")}</select></div>
          <div class="form-group" id="r-acc-g" style="display:none;"><label>Cuenta Destino</label><select id="r-acc">${accs.map((a) => `<option value="${U.esc(a.id)}">${U.esc(a.name)}</option>`).join("")}</select></div>
        </div>`,
      footerHtml: `<button class="btn" id="r-cancel">Cancelar</button><button class="btn btn-primary" id="r-save">Guardar Regla</button>`,
      onMount: (body, foot) => {
        $("#r-type", body).addEventListener("change", (e) => {
          const isTr = e.target.value === "transfer";
          $("#r-cat-g", body).style.display = isTr ? "none" : "flex";
          $("#r-acc-g", body).style.display = isTr ? "flex" : "none";
        });
        $("#r-cancel", foot).addEventListener("click", closeModal);
        $("#r-save", foot).addEventListener("click", async () => {
          await Store.addRule({
            pattern: $("#r-pat", body).value.trim(),
            targetType: $("#r-type", body).value,
            categoryId: $("#r-cat", body).value,
            toAccountId: $("#r-acc", body).value,
            scope: $("#r-scope", body).value,
          });
          closeModal();
          render();
        });
      },
    });
  }

  function openMoreMenuModal() {
    openModal({
      title: "Secciones",
      bodyHtml: `
        <div style="display:grid;gap:10px;">
          <button class="btn" data-m-go="analytics">📈 Analítica y Reportes</button>
          <button class="btn" data-m-go="accounts">💳 Cuentas y Patrimonio</button>
          <button class="btn btn-couple" data-m-go="couple">🤝 Pareja, Liquidación y Metas</button>
          <button class="btn" data-m-go="settings">⚙️ Importar CSV, IA y Ajustes</button>
        </div>`,
      footerHtml: `<button class="btn" id="m-close">Cerrar</button>`,
      onMount: (body, foot) => {
        $("#m-close", foot).addEventListener("click", closeModal);
        $all("[data-m-go]", body).forEach((b) => {
          b.addEventListener("click", () => {
            closeModal();
            navigate(b.dataset.mGo);
          });
        });
      },
    });
  }

  /* ========================================================================
     BOOTSTRAP
     ======================================================================== */
  async function boot() {
    const res = await Store.init();
    if (res.generatedCount > 0) {
      toast(
        `Se generaron ${res.generatedCount} movimientos recurrentes programados`,
        "info",
      );
    }

    // Service Worker & PWA Install (only over http/https)
    if (
      "serviceWorker" in navigator &&
      (location.protocol === "http:" || location.protocol === "https:")
    ) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
    global.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      ui.deferredInstallPrompt = e;
      const btn = $("#btn-install-pwa");
      if (btn) btn.style.display = "inline-flex";
    });
    $("#btn-install-pwa")?.addEventListener("click", async () => {
      if (!ui.deferredInstallPrompt) return;
      ui.deferredInstallPrompt.prompt();
      await ui.deferredInstallPrompt.userChoice;
      ui.deferredInstallPrompt = null;
      $("#btn-install-pwa").style.display = "none";
    });

    // Global Chrome Events
    $all("#sidebar-nav .nav-item, .m-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.view));
    });
    $all("#desktop-ws-switcher .ws-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        Store.state.settings.activeWorkspace = btn.dataset.ws;
        await Store.save(false);
        render();
      });
    });
    $("#mobile-ws-select")?.addEventListener("change", async (e) => {
      Store.state.settings.activeWorkspace = e.target.value;
      await Store.save(false);
      render();
    });

    const toggleTheme = async () => {
      Store.state.settings.theme =
        Store.state.settings.theme === "dark" ? "light" : "dark";
      await Store.save(false);
      syncChrome();
    };
    $("#btn-theme-toggle")?.addEventListener("click", toggleTheme);
    $("#btn-topbar-theme")?.addEventListener("click", toggleTheme);

    $("#btn-new-tx")?.addEventListener("click", () => openTxModal());
    $("#btn-mobile-fab")?.addEventListener("click", () => openTxModal());
    $("#btn-scan-receipt")?.addEventListener("click", () =>
      openReceiptScannerModal(),
    );
    $("#btn-topbar-scan")?.addEventListener("click", () =>
      openReceiptScannerModal(),
    );

    $("#modal-close")?.addEventListener("click", closeModal);
    $("#modal-backdrop")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})(window);
