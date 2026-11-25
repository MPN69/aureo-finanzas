(function (global) {
  "use strict";

  const U = global.AureoUtils;
  const DB_NAME = "aureo_finanzas_db";
  const DB_VERSION = 1;
  const STORE_NAME = "app_state";
  const STATE_KEY = "main_v1";
  const LS_BACKUP_KEY = "aureo_finanzas_state_v1";

  const ACCOUNT_TYPES = {
    cash: { label: "Efectivo", icon: "💵", color: "#10b981" },
    bank: { label: "Cuenta Bancaria", icon: "🏦", color: "#0ea5e9" },
    credit: { label: "Tarjeta de Crédito", icon: "💳", color: "#f43f5e" },
    emoney: { label: "Billetera Digital", icon: "📱", color: "#a855f7" },
    investment: { label: "Inversión / Ahorro", icon: "📈", color: "#f59e0b" },
  };

  const DEFAULT_CATEGORIES = [
    // Gastos
    {
      id: "cat_food",
      name: "Alimentación y Súper",
      type: "expense",
      icon: "🛒",
      color: "#10b981",
    },
    {
      id: "cat_dining",
      name: "Restaurantes y Café",
      type: "expense",
      icon: "🍽️",
      color: "#f59e0b",
    },
    {
      id: "cat_home",
      name: "Hogar y Renta",
      type: "expense",
      icon: "🏠",
      color: "#6366f1",
    },
    {
      id: "cat_utilities",
      name: "Servicios e Internet",
      type: "expense",
      icon: "⚡",
      color: "#0ea5e9",
    },
    {
      id: "cat_transport",
      name: "Transporte y Gasolina",
      type: "expense",
      icon: "🚗",
      color: "#3b82f6",
    },
    {
      id: "cat_health",
      name: "Salud y Farmacia",
      type: "expense",
      icon: "🩺",
      color: "#ec4899",
    },
    {
      id: "cat_subs",
      name: "Entretenimiento y Suscripciones",
      type: "expense",
      icon: "🎬",
      color: "#a855f7",
    },
    {
      id: "cat_personal",
      name: "Ropa y Cuidado Personal",
      type: "expense",
      icon: "👔",
      color: "#14b8a6",
    },
    {
      id: "cat_edu",
      name: "Educación y Libros",
      type: "expense",
      icon: "📚",
      color: "#8b5cf6",
    },
    {
      id: "cat_travel",
      name: "Viajes y Escapadas",
      type: "expense",
      icon: "✈️",
      color: "#06b6d4",
    },
    {
      id: "cat_pets",
      name: "Mascotas",
      type: "expense",
      icon: "🐾",
      color: "#eab308",
    },
    {
      id: "cat_tax",
      name: "Impuestos y Comisiones",
      type: "expense",
      icon: "🧾",
      color: "#64748b",
    },
    {
      id: "cat_other_exp",
      name: "Otros Gastos",
      type: "expense",
      icon: "📦",
      color: "#94a3b8",
    },
    // Ingresos
    {
      id: "cat_salary",
      name: "Nómina / Salario",
      type: "income",
      icon: "💼",
      color: "#10b981",
    },
    {
      id: "cat_freelance",
      name: "Freelance / Negocio",
      type: "income",
      icon: "💻",
      color: "#0ea5e9",
    },
    {
      id: "cat_invest_inc",
      name: "Rendimientos / Dividendos",
      type: "income",
      icon: "📈",
      color: "#f59e0b",
    },
    {
      id: "cat_refund",
      name: "Reembolsos",
      type: "income",
      icon: "↩️",
      color: "#6366f1",
    },
    {
      id: "cat_bonus",
      name: "Bonos y Regalos",
      type: "income",
      icon: "🎁",
      color: "#ec4899",
    },
    {
      id: "cat_other_inc",
      name: "Otros Ingresos",
      type: "income",
      icon: "✨",
      color: "#14b8a6",
    },
  ];

  function uid(prefix = "id") {
    if (global.crypto && global.crypto.randomUUID) {
      return `${prefix}_${global.crypto.randomUUID().slice(0, 12)}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createSeedState(empty = false) {
    const today = U.todayISO();
    const d = U.parseISODate(today);
    const y = d.getFullYear();
    const m = d.getMonth();
    const iso = (dayOffset) => {
      const dt = new Date(y, m, Math.max(1, d.getDate() + dayOffset));
      return U.toISODate(dt);
    };

    const base = {
      version: 1,
      isDemo: !empty,
      settings: {
        theme: "dark",
        baseCurrency: "MXN",
        exchangeRates: Object.assign({}, U.DEFAULT_RATES_TO_MXN),
        paydayDay: 1,
        cycleMode: "monthly",
        alwaysShowItems: true,
        activeWorkspace: "all",
        partners: {
          a: { id: "a", name: "Yo", color: "#0ea5e9", incomeWeight: 55 },
          b: { id: "b", name: "Mi Pareja", color: "#a855f7", incomeWeight: 45 },
        },
        geminiApiKey: "",
        geminiModel: "gemini-3.8-flash",
        preferredCameraId: "",
      },
      categories: DEFAULT_CATEGORIES.map((c) => Object.assign({}, c)),
      accounts: empty
        ? [
            {
              id: "acc_cash_a",
              name: "Efectivo Personal",
              type: "cash",
              currency: "MXN",
              initialBalance: 0,
              owner: "a",
              visibility: "private",
              institution: "Cartera",
              color: "#10b981",
              archived: false,
            },
            {
              id: "acc_bank_shared",
              name: "Cuenta Compartida Hogar",
              type: "bank",
              currency: "MXN",
              initialBalance: 0,
              owner: "shared",
              visibility: "shared",
              institution: "Banco",
              color: "#a855f7",
              archived: false,
            },
          ]
        : [
            {
              id: "acc_cash_a",
              name: "Efectivo Personal",
              type: "cash",
              currency: "MXN",
              initialBalance: 2800,
              owner: "a",
              visibility: "private",
              institution: "Cartera",
              color: "#10b981",
              archived: false,
            },
            {
              id: "acc_bank_a",
              name: "Nómina Débito",
              type: "bank",
              currency: "MXN",
              initialBalance: 24500,
              owner: "a",
              visibility: "private",
              institution: "BBVA",
              color: "#0ea5e9",
              archived: false,
            },
            {
              id: "acc_tdc_a",
              name: "Tarjeta Oro",
              type: "credit",
              currency: "MXN",
              initialBalance: -3400,
              owner: "a",
              visibility: "private",
              creditLimit: 45000,
              billingDay: 18,
              dueDay: 8,
              institution: "Santander",
              color: "#f43f5e",
              archived: false,
            },
            {
              id: "acc_bank_shared",
              name: "Cuenta Hogar Pareja",
              type: "bank",
              currency: "MXN",
              initialBalance: 18200,
              owner: "shared",
              visibility: "shared",
              institution: "Nu / Banco",
              color: "#a855f7",
              archived: false,
            },
            {
              id: "acc_inv_a",
              name: "CETES & Fondo Emergencia",
              type: "investment",
              currency: "MXN",
              initialBalance: 52000,
              owner: "shared",
              visibility: "shared",
              institution: "Cetesdirecto",
              color: "#f59e0b",
              archived: false,
            },
            {
              id: "acc_usd_a",
              name: "Billetera USD",
              type: "emoney",
              currency: "USD",
              initialBalance: 320,
              owner: "a",
              visibility: "private",
              institution: "PayPal / Wise",
              color: "#06b6d4",
              archived: false,
            },
          ],
      transactions: empty
        ? []
        : [
            {
              id: "tx_demo_1",
              type: "income",
              date: iso(-12),
              time: "09:00",
              amount: 28500,
              currency: "MXN",
              accountId: "acc_bank_a",
              categoryId: "cat_salary",
              merchant: "Empresa Nómina",
              memo: "Quincena / Mensualidad",
              tags: ["fijo"],
              items: [],
              scope: "personal",
              paidBy: "a",
              splitMode: "100_a",
              splitRatioA: 100,
              updatedAt: Date.now() - 86400000 * 12,
            },
            {
              id: "tx_demo_2",
              type: "transfer",
              date: iso(-11),
              time: "10:15",
              amount: 8000,
              currency: "MXN",
              accountId: "acc_bank_a",
              toAccountId: "acc_bank_shared",
              categoryId: null,
              merchant: "Aportación Hogar",
              memo: "Fondo mensual compartido",
              tags: ["pareja"],
              items: [],
              scope: "couple",
              paidBy: "a",
              splitMode: "100_a",
              splitRatioA: 100,
              updatedAt: Date.now() - 86400000 * 11,
            },
            {
              id: "tx_demo_3",
              type: "expense",
              date: iso(-8),
              time: "18:40",
              amount: 1680,
              currency: "MXN",
              accountId: "acc_tdc_a",
              categoryId: "cat_food",
              merchant: "Supermercado Fresko",
              memo: "Despensa semanal en pareja",
              tags: ["recibo", "despensa"],
              items: [
                {
                  id: "it_1",
                  name: "Frutas, verduras y proteínas",
                  amount: 1120,
                  categoryId: "cat_food",
                },
                {
                  id: "it_2",
                  name: "Artículos de limpieza",
                  amount: 340,
                  categoryId: "cat_home",
                },
                {
                  id: "it_3",
                  name: "Café en grano",
                  amount: 220,
                  categoryId: "cat_dining",
                },
              ],
              scope: "couple",
              paidBy: "a",
              splitMode: "50_50",
              splitRatioA: 50,
              updatedAt: Date.now() - 86400000 * 8,
            },
            {
              id: "tx_demo_4",
              type: "expense",
              date: iso(-6),
              time: "11:20",
              amount: 9500,
              currency: "MXN",
              accountId: "acc_bank_shared",
              categoryId: "cat_home",
              merchant: "Renta Departamento",
              memo: "Mensualidad departamento",
              tags: ["fijo", "hogar"],
              items: [],
              scope: "couple",
              paidBy: "a",
              splitMode: "50_50",
              splitRatioA: 50,
              updatedAt: Date.now() - 86400000 * 6,
            },
            {
              id: "tx_demo_5",
              type: "expense",
              date: iso(-4),
              time: "08:35",
              amount: 145,
              currency: "MXN",
              accountId: "acc_cash_a",
              categoryId: "cat_dining",
              merchant: "Café Punta del Cielo",
              memo: "Americano y panini",
              tags: ["favorito"],
              items: [],
              scope: "personal",
              paidBy: "a",
              splitMode: "100_a",
              splitRatioA: 100,
              updatedAt: Date.now() - 86400000 * 4,
            },
            {
              id: "tx_demo_6",
              type: "expense",
              date: iso(-3),
              time: "20:10",
              amount: 890,
              currency: "MXN",
              accountId: "acc_bank_shared",
              categoryId: "cat_dining",
              merchant: "Restaurante La Toscana",
              memo: "Cena de aniversario",
              tags: ["pareja"],
              items: [],
              scope: "couple",
              paidBy: "b",
              splitMode: "50_50",
              splitRatioA: 50,
              updatedAt: Date.now() - 86400000 * 3,
            },
            {
              id: "tx_demo_7",
              type: "expense",
              date: iso(-2),
              time: "14:05",
              amount: 599,
              currency: "MXN",
              accountId: "acc_tdc_a",
              categoryId: "cat_utilities",
              merchant: "Totalplay Fibra",
              memo: "Internet casa",
              tags: ["fijo"],
              items: [],
              scope: "couple",
              paidBy: "a",
              splitMode: "50_50",
              splitRatioA: 50,
              updatedAt: Date.now() - 86400000 * 2,
            },
            {
              id: "tx_demo_8",
              type: "expense",
              date: iso(-1),
              time: "16:50",
              amount: 420,
              currency: "MXN",
              accountId: "acc_cash_a",
              categoryId: "cat_transport",
              merchant: "Uber / Gasolina",
              memo: "Traslados semana",
              tags: [],
              items: [],
              scope: "personal",
              paidBy: "a",
              splitMode: "100_a",
              splitRatioA: 100,
              updatedAt: Date.now() - 86400000,
            },
          ],
      budgets: empty
        ? { personal: {}, couple: {} }
        : {
            personal: {
              cat_dining: 2200,
              cat_transport: 2500,
              cat_personal: 2000,
              cat_subs: 800,
            },
            couple: {
              cat_food: 6500,
              cat_home: 10500,
              cat_utilities: 1800,
              cat_dining: 3000,
              cat_travel: 4000,
            },
          },
      favorites: empty
        ? []
        : [
            {
              id: "fav_1",
              label: "Café Mañana",
              type: "expense",
              amount: 85,
              currency: "MXN",
              accountId: "acc_cash_a",
              categoryId: "cat_dining",
              merchant: "Cafetería",
              scope: "personal",
            },
            {
              id: "fav_2",
              label: "Súper Pareja",
              type: "expense",
              amount: 1200,
              currency: "MXN",
              accountId: "acc_bank_shared",
              categoryId: "cat_food",
              merchant: "Supermercado",
              scope: "couple",
            },
            {
              id: "fav_3",
              label: "Pago Tarjeta",
              type: "transfer",
              amount: 3000,
              currency: "MXN",
              accountId: "acc_bank_a",
              toAccountId: "acc_tdc_a",
              merchant: "Pago TDC",
              scope: "personal",
            },
          ],
      recurring: empty
        ? []
        : [
            {
              id: "rec_1",
              title: "Renta Departamento",
              type: "expense",
              amount: 9500,
              currency: "MXN",
              accountId: "acc_bank_shared",
              categoryId: "cat_home",
              merchant: "Renta Departamento",
              frequency: "monthly",
              dayOfMonth: 5,
              nextRunDate: iso(15),
              scope: "couple",
              paidBy: "a",
              splitMode: "50_50",
              splitRatioA: 50,
              active: true,
            },
            {
              id: "rec_2",
              title: "Internet Fibra",
              type: "expense",
              amount: 599,
              currency: "MXN",
              accountId: "acc_tdc_a",
              categoryId: "cat_utilities",
              merchant: "Totalplay Fibra",
              frequency: "monthly",
              dayOfMonth: 15,
              nextRunDate: iso(10),
              scope: "couple",
              paidBy: "a",
              splitMode: "50_50",
              splitRatioA: 50,
              active: true,
            },
          ],
      goals: empty
        ? []
        : [
            {
              id: "goal_1",
              name: "Fondo de Emergencia (6 meses)",
              targetAmount: 120000,
              currentAmount: 52000,
              currency: "MXN",
              deadline: `${y + 1}-06-30`,
              scope: "couple",
              color: "#10b981",
            },
            {
              id: "goal_2",
              name: "Viaje de Aniversario",
              targetAmount: 35000,
              currentAmount: 14500,
              currency: "MXN",
              deadline: `${y + 1}-11-01`,
              scope: "couple",
              color: "#a855f7",
            },
          ],
      rules: empty
        ? []
        : [
            {
              id: "rule_1",
              pattern: "PAGO TARJETA",
              targetType: "transfer",
              toAccountId: "acc_tdc_a",
              categoryId: null,
              scope: "personal",
            },
            {
              id: "rule_2",
              pattern: "UBER",
              targetType: "expense",
              categoryId: "cat_transport",
              scope: "personal",
            },
            {
              id: "rule_3",
              pattern: "NETFLIX",
              targetType: "expense",
              categoryId: "cat_subs",
              scope: "couple",
            },
          ],
    };

    return base;
  }

  class AureoStore {
    constructor() {
      this.state = null;
      this.listeners = new Set();
      this.db = null;
    }

    openIDB() {
      return new Promise((resolve) => {
        if (!global.indexedDB || global.location?.protocol === "file:")
          return resolve(null);
        let settled = false;
        const done = (val) => {
          if (!settled) {
            settled = true;
            resolve(val);
          }
        };
        const timer = setTimeout(() => done(null), 700);
        try {
          const req = global.indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          req.onsuccess = (e) => {
            clearTimeout(timer);
            done(e.target.result);
          };
          req.onerror = () => {
            clearTimeout(timer);
            done(null);
          };
          req.onblocked = () => {
            clearTimeout(timer);
            done(null);
          };
        } catch (err) {
          clearTimeout(timer);
          done(null);
        }
      });
    }

    readIDB(db) {
      return new Promise((resolve) => {
        if (!db) return resolve(null);
        let settled = false;
        const done = (val) => {
          if (!settled) {
            settled = true;
            resolve(val);
          }
        };
        const timer = setTimeout(() => done(null), 700);
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(STATE_KEY);
          req.onsuccess = () => {
            clearTimeout(timer);
            done(req.result || null);
          };
          req.onerror = () => {
            clearTimeout(timer);
            done(null);
          };
        } catch {
          clearTimeout(timer);
          done(null);
        }
      });
    }

    writeIDB(db, data) {
      return new Promise((resolve) => {
        if (!db) return resolve(false);
        let settled = false;
        const done = (val) => {
          if (!settled) {
            settled = true;
            resolve(val);
          }
        };
        const timer = setTimeout(() => done(false), 700);
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.put(data, STATE_KEY);
          tx.oncomplete = () => {
            clearTimeout(timer);
            done(true);
          };
          tx.onerror = () => {
            clearTimeout(timer);
            done(false);
          };
        } catch {
          clearTimeout(timer);
          done(false);
        }
      });
    }

    async init() {
      this.db = await this.openIDB();
      let loaded = await this.readIDB(this.db);
      if (!loaded) {
        try {
          const raw = global.localStorage.getItem(LS_BACKUP_KEY);
          if (raw) loaded = JSON.parse(raw);
        } catch {
          loaded = null;
        }
      }
      this.state = loaded ? this.migrate(loaded) : createSeedState(false);
      const generated = this.materializeRecurring(false);
      await this.save(false);
      return { loaded: Boolean(loaded), generatedCount: generated };
    }

    migrate(s) {
      const def = createSeedState(true);
      s.settings = Object.assign({}, def.settings, s.settings || {});
      if (s.settings.geminiModel === "gemini-2.5-flash") {
        s.settings.geminiModel = "gemini-3.8-flash";
      } else if (s.settings.geminiModel === "gemini-2.5-pro") {
        s.settings.geminiModel = "gemini-3.8-pro";
      }
      s.settings.partners = Object.assign(
        {},
        def.settings.partners,
        s.settings.partners || {},
      );
      s.settings.exchangeRates = Object.assign(
        {},
        def.settings.exchangeRates,
        s.settings.exchangeRates || {},
      );
      if (!Array.isArray(s.categories) || !s.categories.length)
        s.categories = def.categories;
      if (!Array.isArray(s.accounts)) s.accounts = [];
      if (!Array.isArray(s.transactions)) s.transactions = [];
      if (!s.budgets) s.budgets = { personal: {}, couple: {} };
      if (!s.budgets.personal) s.budgets.personal = {};
      if (!s.budgets.couple) s.budgets.couple = {};
      if (!Array.isArray(s.favorites)) s.favorites = [];
      if (!Array.isArray(s.recurring)) s.recurring = [];
      if (!Array.isArray(s.goals)) s.goals = [];
      if (!Array.isArray(s.rules)) s.rules = [];
      return s;
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    notify() {
      this.listeners.forEach((fn) => fn(this.state));
    }

    async save(notify = true) {
      try {
        global.localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(this.state));
      } catch {
        // Ignore quota errors if receipt thumbnails are large; IDB handles larger payloads
      }
      await this.writeIDB(this.db, this.state);
      if (notify) this.notify();
    }

    getBaseCurrency() {
      return this.state.settings.baseCurrency || "MXN";
    }

    toBase(amount, currency) {
      return U.convertCurrency(
        amount,
        currency || this.getBaseCurrency(),
        this.getBaseCurrency(),
        this.state.settings.exchangeRates,
      );
    }

    getCategory(id) {
      return this.state.categories.find((c) => c.id === id) || null;
    }

    getAccount(id) {
      return this.state.accounts.find((a) => a.id === id) || null;
    }

    getAccountBalance(accountId) {
      const acc = this.getAccount(accountId);
      if (!acc) return 0;
      let bal = Number(acc.initialBalance) || 0;
      for (const tx of this.state.transactions) {
        if (tx.type === "income" && tx.accountId === accountId) {
          bal += U.convertCurrency(
            tx.amount,
            tx.currency,
            acc.currency,
            this.state.settings.exchangeRates,
          );
        } else if (tx.type === "expense" && tx.accountId === accountId) {
          bal -= U.convertCurrency(
            tx.amount,
            tx.currency,
            acc.currency,
            this.state.settings.exchangeRates,
          );
        } else if (tx.type === "transfer") {
          if (tx.accountId === accountId) {
            bal -= U.convertCurrency(
              tx.amount,
              tx.currency,
              acc.currency,
              this.state.settings.exchangeRates,
            );
          }
          if (tx.toAccountId === accountId) {
            bal += U.convertCurrency(
              tx.amount,
              tx.currency,
              acc.currency,
              this.state.settings.exchangeRates,
            );
          }
        }
      }
      return bal;
    }

    getVisibleAccounts(ws = this.state.settings.activeWorkspace) {
      const active = this.state.accounts.filter((a) => !a.archived);
      if (ws === "all") return active;
      if (ws === "couple")
        return active.filter(
          (a) => a.owner === "shared" || a.visibility === "shared",
        );
      if (ws === "solo_a")
        return active.filter(
          (a) =>
            a.owner === "a" ||
            (a.owner === "shared" && a.visibility === "shared"),
        );
      if (ws === "solo_b")
        return active.filter(
          (a) =>
            a.owner === "b" ||
            (a.owner === "shared" && a.visibility === "shared"),
        );
      return active;
    }

    getEffectiveSplitRatioA(tx) {
      if (tx.scope !== "couple") return tx.paidBy === "b" ? 0 : 100;
      if (tx.splitMode === "100_a") return 100;
      if (tx.splitMode === "100_b") return 0;
      if (tx.splitMode === "proportional") {
        return Number(this.state.settings.partners.a.incomeWeight) || 50;
      }
      if (tx.splitMode === "custom") {
        return Math.max(0, Math.min(100, Number(tx.splitRatioA) ?? 50));
      }
      return 50;
    }

    getVisibleTransactions(
      ws = this.state.settings.activeWorkspace,
      range = null,
    ) {
      return this.state.transactions
        .filter((tx) => {
          if (range && (tx.date < range.start || tx.date > range.end))
            return false;
          if (ws === "couple") return tx.scope === "couple";
          if (ws === "solo_a") {
            return tx.scope === "couple" || tx.paidBy !== "b";
          }
          if (ws === "solo_b") {
            return tx.scope === "couple" || tx.paidBy === "b";
          }
          return true;
        })
        .map((tx) => {
          // Compute workspace-adjusted amount for personal views on shared couple expenses
          let effectiveAmount = Number(tx.amount) || 0;
          if (
            (ws === "solo_a" || ws === "solo_b") &&
            tx.scope === "couple" &&
            tx.type !== "transfer"
          ) {
            const ratioA = this.getEffectiveSplitRatioA(tx) / 100;
            effectiveAmount =
              effectiveAmount * (ws === "solo_a" ? ratioA : 1 - ratioA);
          }
          return Object.assign({}, tx, { effectiveAmount });
        })
        .sort((a, b) =>
          (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")),
        );
    }

    getNetWorth(ws = this.state.settings.activeWorkspace) {
      const accounts = this.getVisibleAccounts(ws);
      let assets = 0;
      let debt = 0;
      for (const acc of accounts) {
        const balBase = this.toBase(
          this.getAccountBalance(acc.id),
          acc.currency,
        );
        if (acc.type === "credit" || balBase < 0) {
          if (balBase < 0) debt += Math.abs(balBase);
          else assets += balBase;
        } else {
          assets += balBase;
        }
      }
      return { assets, debt, net: assets - debt };
    }

    getCoupleSettlement() {
      // Positive netBalance means Partner B owes Partner A; negative means Partner A owes Partner B
      let totalCoupleExpenses = 0;
      let paidByA = 0;
      let paidByB = 0;
      let shareA = 0;
      let shareB = 0;

      for (const tx of this.state.transactions) {
        if (tx.scope !== "couple" || tx.type !== "expense") continue;
        const acc = this.getAccount(tx.accountId);
        // Expenses paid from a 'shared' joint account are already joint funds unless marked otherwise
        const baseAmt = this.toBase(tx.amount, tx.currency);
        totalCoupleExpenses += baseAmt;
        const rA = this.getEffectiveSplitRatioA(tx) / 100;
        if (acc && acc.owner === "shared") {
          // Paid from joint pool: does not create personal debt between partners
          continue;
        }
        shareA += baseAmt * rA;
        shareB += baseAmt * (1 - rA);
        if (tx.paidBy === "b") paidByB += baseAmt;
        else paidByA += baseAmt;
      }

      // Include direct personal settlement transfers between partners if tagged 'liquidacion'
      for (const tx of this.state.transactions) {
        if (tx.type === "transfer" && (tx.tags || []).includes("liquidacion")) {
          const baseAmt = this.toBase(tx.amount, tx.currency);
          if (tx.paidBy === "b") paidByB += baseAmt;
          else paidByA += baseAmt;
        }
      }

      const netA = paidByA - shareA; // If positive, A overpaid -> B owes A netA
      return {
        totalCoupleExpenses,
        paidByA,
        paidByB,
        shareA,
        shareB,
        netBalanceA: netA,
      };
    }

    applyAutoRules(draft) {
      const text = `${draft.merchant || ""} ${draft.memo || ""}`.toUpperCase();
      for (const r of this.state.rules) {
        if (!r.pattern) continue;
        if (text.includes(r.pattern.toUpperCase())) {
          if (r.targetType === "transfer" && r.toAccountId) {
            draft.type = "transfer";
            draft.toAccountId = r.toAccountId;
          } else if (r.categoryId) {
            draft.categoryId = r.categoryId;
          }
          if (r.scope) draft.scope = r.scope;
          break;
        }
      }
      return draft;
    }

    async addTransaction(tx) {
      const entry = Object.assign(
        {
          id: uid("tx"),
          type: "expense",
          date: U.todayISO(),
          time: U.nowTime(),
          amount: 0,
          currency: this.getBaseCurrency(),
          accountId: this.state.accounts[0]?.id || "",
          toAccountId: null,
          categoryId: null,
          merchant: "",
          memo: "",
          tags: [],
          items: [],
          scope:
            this.state.settings.activeWorkspace === "couple"
              ? "couple"
              : "personal",
          paidBy: "a",
          splitMode: "50_50",
          splitRatioA: 50,
          updatedAt: Date.now(),
        },
        tx,
      );
      this.state.transactions.push(entry);
      await this.save();
      return entry;
    }

    async updateTransaction(id, patch) {
      const idx = this.state.transactions.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      this.state.transactions[idx] = Object.assign(
        {},
        this.state.transactions[idx],
        patch,
        { updatedAt: Date.now() },
      );
      await this.save();
      return this.state.transactions[idx];
    }

    async deleteTransaction(id) {
      this.state.transactions = this.state.transactions.filter(
        (t) => t.id !== id,
      );
      await this.save();
    }

    async saveAccount(acc) {
      if (acc.id) {
        const idx = this.state.accounts.findIndex((a) => a.id === acc.id);
        if (idx !== -1) {
          this.state.accounts[idx] = Object.assign(
            {},
            this.state.accounts[idx],
            acc,
          );
          await this.save();
          return this.state.accounts[idx];
        }
      }
      const created = Object.assign(
        {
          id: uid("acc"),
          name: "Nueva Cuenta",
          type: "bank",
          currency: this.getBaseCurrency(),
          initialBalance: 0,
          owner: "a",
          visibility: "private",
          institution: "",
          color: "#0ea5e9",
          archived: false,
        },
        acc,
      );
      this.state.accounts.push(created);
      await this.save();
      return created;
    }

    async deleteAccount(id) {
      this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
      await this.save();
    }

    async setBudget(scope, categoryId, amount) {
      if (!this.state.budgets[scope]) this.state.budgets[scope] = {};
      const val = Number(amount) || 0;
      if (val <= 0) delete this.state.budgets[scope][categoryId];
      else this.state.budgets[scope][categoryId] = val;
      await this.save();
    }

    async addFavorite(fav) {
      const entry = Object.assign({ id: uid("fav") }, fav);
      this.state.favorites.push(entry);
      await this.save();
      return entry;
    }

    async deleteFavorite(id) {
      this.state.favorites = this.state.favorites.filter((f) => f.id !== id);
      await this.save();
    }

    async saveRecurring(rec) {
      if (rec.id) {
        const idx = this.state.recurring.findIndex((r) => r.id === rec.id);
        if (idx !== -1) {
          this.state.recurring[idx] = Object.assign(
            {},
            this.state.recurring[idx],
            rec,
          );
          await this.save();
          return this.state.recurring[idx];
        }
      }
      const created = Object.assign({ id: uid("rec"), active: true }, rec);
      this.state.recurring.push(created);
      this.materializeRecurring(false);
      await this.save();
      return created;
    }

    async deleteRecurring(id, deleteGenerated = false) {
      this.state.recurring = this.state.recurring.filter((r) => r.id !== id);
      if (deleteGenerated) {
        this.state.transactions = this.state.transactions.filter(
          (t) => t.recurringId !== id,
        );
      }
      await this.save();
    }

    advanceDate(iso, frequency) {
      const d = U.parseISODate(iso);
      if (frequency === "daily") d.setDate(d.getDate() + 1);
      else if (frequency === "weekly") d.setDate(d.getDate() + 7);
      else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
      else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
      return U.toISODate(d);
    }

    materializeRecurring(shouldSave = true) {
      const today = U.todayISO();
      let count = 0;
      for (const rec of this.state.recurring) {
        if (!rec.active || !rec.nextRunDate) continue;
        let guard = 0;
        while (rec.nextRunDate <= today && guard < 24) {
          guard++;
          const exists = this.state.transactions.some(
            (t) => t.recurringId === rec.id && t.date === rec.nextRunDate,
          );
          if (!exists) {
            this.state.transactions.push({
              id: uid("tx"),
              type: rec.type || "expense",
              date: rec.nextRunDate,
              time: "09:00",
              amount: Number(rec.amount) || 0,
              currency: rec.currency || this.getBaseCurrency(),
              accountId: rec.accountId,
              toAccountId: rec.toAccountId || null,
              categoryId: rec.categoryId || null,
              merchant: rec.merchant || rec.title,
              memo: `${rec.title} (Recurrente)`,
              tags: ["fijo", "recurrente"],
              items: [],
              scope: rec.scope || "personal",
              paidBy: rec.paidBy || "a",
              splitMode: rec.splitMode || "50_50",
              splitRatioA: rec.splitRatioA ?? 50,
              recurringId: rec.id,
              updatedAt: Date.now(),
            });
            count++;
          }
          rec.nextRunDate = this.advanceDate(rec.nextRunDate, rec.frequency);
        }
      }
      if (count > 0 && shouldSave) this.save();
      return count;
    }

    async saveGoal(goal) {
      if (goal.id) {
        const idx = this.state.goals.findIndex((g) => g.id === goal.id);
        if (idx !== -1) {
          this.state.goals[idx] = Object.assign(
            {},
            this.state.goals[idx],
            goal,
          );
          await this.save();
          return;
        }
      }
      this.state.goals.push(
        Object.assign(
          { id: uid("goal"), currentAmount: 0, color: "#10b981" },
          goal,
        ),
      );
      await this.save();
    }

    async deleteGoal(id) {
      this.state.goals = this.state.goals.filter((g) => g.id !== id);
      await this.save();
    }

    async addRule(rule) {
      this.state.rules.push(Object.assign({ id: uid("rule") }, rule));
      await this.save();
    }

    async deleteRule(id) {
      this.state.rules = this.state.rules.filter((r) => r.id !== id);
      await this.save();
    }

    async addCategory(cat) {
      this.state.categories.push(Object.assign({ id: uid("cat") }, cat));
      await this.save();
    }

    async resetState(empty = true) {
      this.state = createSeedState(empty);
      await this.save();
    }

    exportCoupleSyncPackage() {
      return {
        type: "aureo_couple_sync_v1",
        exportedAt: Date.now(),
        accounts: this.state.accounts.filter(
          (a) => a.visibility === "shared" || a.owner === "shared",
        ),
        transactions: this.state.transactions.filter(
          (t) => t.scope === "couple",
        ),
        budgetsCouple: this.state.budgets.couple,
        goalsCouple: this.state.goals.filter((g) => g.scope === "couple"),
      };
    }

    async mergeCoupleSyncPackage(pkg) {
      if (!pkg || pkg.type !== "aureo_couple_sync_v1") {
        throw new Error("Archivo de sincronización de pareja inválido.");
      }
      let mergedTx = 0;
      for (const acc of pkg.accounts || []) {
        if (!this.state.accounts.some((a) => a.id === acc.id)) {
          this.state.accounts.push(acc);
        }
      }
      for (const tx of pkg.transactions || []) {
        const idx = this.state.transactions.findIndex((t) => t.id === tx.id);
        if (idx === -1) {
          this.state.transactions.push(tx);
          mergedTx++;
        } else if (
          (tx.updatedAt || 0) > (this.state.transactions[idx].updatedAt || 0)
        ) {
          this.state.transactions[idx] = tx;
          mergedTx++;
        }
      }
      if (pkg.budgetsCouple) {
        this.state.budgets.couple = Object.assign(
          {},
          this.state.budgets.couple,
          pkg.budgetsCouple,
        );
      }
      for (const g of pkg.goalsCouple || []) {
        if (!this.state.goals.some((x) => x.id === g.id))
          this.state.goals.push(g);
      }
      await this.save();
      return { mergedTx };
    }
  }

  global.AureoStore = new AureoStore();
  global.AureoStoreMeta = { ACCOUNT_TYPES, DEFAULT_CATEGORIES, uid };
})(window);
