(function () {
  const PROFILE_KEY = "diszkertek-munkalap-profile-v1";
  const EMAILS = {
    "Ádám": "adam@munkalap.diszkertek.hu",
    "Ági": "agi@munkalap.diszkertek.hu",
    "Attila": "attila@munkalap.diszkertek.hu",
    "Bendegúz": "bendeguz@munkalap.diszkertek.hu",
    "Gábor": "gabor@munkalap.diszkertek.hu",
    "Marci": "marci@munkalap.diszkertek.hu",
    "Márk": "mark@munkalap.diszkertek.hu",
    "Tamás": "tamas@munkalap.diszkertek.hu"
  };

  const config = window.MUNKALAP_SUPABASE || {};
  const previewMode = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).has("bemutato");
  const remoteConfigured = Boolean(
    config.url
    && config.publishableKey
    && !config.url.startsWith("IDE_")
    && !config.publishableKey.startsWith("IDE_")
    && window.supabase
  );
  const configured = previewMode || remoteConfigured;
  let client = null;
  let channel = null;
  let previewProfile = null;
  let previewWorksheets = [];

  if (remoteConfigured) {
    client = window.supabase.createClient(config.url, config.publishableKey, {
      db: { schema: "munkalap" },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "diszkertek-munkalap-auth-v1"
      }
    });
  }

  function previewDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function createPreviewWorksheets() {
    const rows = [
      {
        id: "bemutato-agi-1", userId: "bemutato-agi", leader: "Ági",
        customer: "Minta Ügyfél", address: "Budapest, Virág utca 12.", date: previewDate(0),
        data: {
          teamLeader: "Ági", customerName: "Minta Ügyfél", address: "Budapest, Virág utca 12.",
          date: "", team_1_size: "4", team_1_arrival: "07:30", team_1_departure: "15:45",
          subcontractor: "Minta Alvállalkozó", subcontractorArrival: "09:00", subcontractorDeparture: "12:00",
          description: "Sövénynyírás, gyomlálás és öntözőrendszer ellenőrzése.",
          maintenance_0: "3", maintenance_20: "cső és idomok", rental1: "mini kotró"
        }
      },
      {
        id: "bemutato-mark-1", userId: "bemutato-mark", leader: "Márk",
        customer: "Kiss Bendegúz", address: "Szentendre, Tölgyfa köz 4.", date: previewDate(1),
        data: {
          teamLeader: "Márk", customerName: "Kiss Bendegúz", address: "Szentendre, Tölgyfa köz 4.",
          date: "", team_1_size: "5", team_1_arrival: "08:00", team_1_departure: "16:10",
          description: "Kertfenntartás és zöldhulladék elszállítás.", maintenance_0: "5", maintenance_9: "2"
        }
      },
      {
        id: "bemutato-tamas-1", userId: "bemutato-tamas", leader: "Tamás",
        customer: "Próba Kert Kft.", address: "Budakalász, Zöld utca 8.", date: previewDate(2),
        data: {
          teamLeader: "Tamás", customerName: "Próba Kert Kft.", address: "Budakalász, Zöld utca 8.",
          date: "", team_1_size: "3", team_1_arrival: "07:45", team_1_departure: "14:30",
          team_2_size: "2", team_2_arrival: "09:15", team_2_departure: "13:00",
          description: "Térkő előkészítés és anyagmozgatás.", construction_0: "2", construction_8: "4", rental1: "lapvibrátor"
        }
      },
      {
        id: "bemutato-bendeguz-1", userId: "bemutato-bendeguz", leader: "Bendegúz",
        customer: "Nagy Anna", address: "Pomáz, Akácfa utca 21.", date: previewDate(3),
        data: {
          teamLeader: "Bendegúz", customerName: "Nagy Anna", address: "Pomáz, Akácfa utca 21.",
          date: "", team_1_size: "4", team_1_arrival: "08:10", team_1_departure: "15:20",
          description: "Faültetés és talajelőkészítés.", maintenance_13: "6", maintenance_17: "3"
        }
      }
    ];
    const now = Date.now();
    return rows.map((row, index) => ({
      ...row,
      data: { ...row.data, date: row.date },
      createdAt: new Date(now - index * 3600000).toISOString(),
      updatedAt: new Date(now - index * 3600000).toISOString()
    }));
  }

  if (previewMode) previewWorksheets = createPreviewWorksheets();

  function mapWorksheet(row) {
    return {
      id: row.id,
      userId: row.user_id,
      leader: row.leader_name,
      customer: row.customer_name,
      address: row.address,
      date: row.work_date,
      data: row.form_data || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function toRow(item, userId) {
    return {
      id: item.id,
      user_id: userId,
      leader_name: item.leader,
      customer_name: item.customer,
      address: item.address,
      work_date: item.date,
      form_data: item.data || {}
    };
  }

  async function profileFor(user) {
    const { data, error } = await client
      .from("profiles")
      .select("id,display_name,role")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    const profile = { userId: data.id, name: data.display_name, role: data.role };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  }

  window.MunkalapDB = {
    configured,
    previewMode,

    async login(name, pin) {
      if (previewMode) {
        if (pin !== "123456") throw new Error("A bemutató PIN-kód: 123456");
        previewProfile = {
          userId: `bemutato-${EMAILS[name]?.split("@")[0] || "felhasznalo"}`,
          name,
          role: ["Ági", "Tamás"].includes(name) ? "manager" : "worker"
        };
        return previewProfile;
      }
      if (!client) throw new Error("Az adatbázis-kapcsolat még nincs beállítva.");
      const email = EMAILS[name];
      if (!email) throw new Error("Ehhez a névhez még nincs belépés beállítva.");
      const { data, error } = await client.auth.signInWithPassword({ email, password: pin });
      if (error) throw new Error("Hibás PIN-kód.");
      const profile = await profileFor(data.user);
      if (profile.name !== name) {
        await client.auth.signOut();
        throw new Error("A PIN-kód nem ehhez a névhez tartozik.");
      }
      return profile;
    },

    async restore() {
      if (previewMode) return null;
      if (!client) return null;
      const { data } = await client.auth.getSession();
      if (!data.session) {
        localStorage.removeItem(PROFILE_KEY);
        return null;
      }
      try {
        const cached = JSON.parse(localStorage.getItem(PROFILE_KEY));
        if (cached?.userId === data.session.user.id) return cached;
      } catch (_) {
        localStorage.removeItem(PROFILE_KEY);
      }
      return profileFor(data.session.user);
    },

    async logout() {
      if (previewMode) {
        previewProfile = null;
        return;
      }
      if (channel) await client.removeChannel(channel);
      channel = null;
      localStorage.removeItem(PROFILE_KEY);
      if (client) await client.auth.signOut();
    },

    async list() {
      if (previewMode) {
        if (!previewProfile) return [];
        const visible = previewProfile.role === "manager"
          ? previewWorksheets
          : previewWorksheets.filter(item => item.userId === previewProfile.userId).slice(0, 10);
        return visible.map(item => ({ ...item, data: { ...item.data } }));
      }
      const { data, error } = await client
        .from("worksheets")
        .select("*")
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapWorksheet);
    },

    async create(item, userId) {
      if (previewMode) {
        const now = new Date().toISOString();
        const saved = { ...item, userId, createdAt: now, updatedAt: now, data: { ...item.data } };
        previewWorksheets.unshift(saved);
        return { ...saved, data: { ...saved.data } };
      }
      const { data, error } = await client
        .from("worksheets")
        .insert(toRow(item, userId))
        .select()
        .single();
      if (error) throw error;
      return mapWorksheet(data);
    },

    async update(id, item) {
      if (previewMode) {
        const index = previewWorksheets.findIndex(record => record.id === id);
        if (index < 0) throw new Error("A bemutató munkalap nem található.");
        previewWorksheets[index] = {
          ...previewWorksheets[index], ...item,
          data: { ...item.data }, updatedAt: new Date().toISOString()
        };
        return { ...previewWorksheets[index], data: { ...previewWorksheets[index].data } };
      }
      const row = {
        customer_name: item.customer,
        address: item.address,
        work_date: item.date,
        form_data: item.data || {}
      };
      const { data, error } = await client
        .from("worksheets")
        .update(row)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapWorksheet(data);
    },

    async databaseSize() {
      if (previewMode) return 8 * 1024 * 1024;
      const { data, error } = await client.rpc("database_size");
      if (error) throw error;
      return Number(data || 0);
    },

    subscribe(onChange) {
      if (previewMode) return;
      if (!client) return;
      if (channel) client.removeChannel(channel);
      channel = client
        .channel("munkalap-live")
        .on("postgres_changes", { event: "*", schema: "munkalap", table: "worksheets" }, onChange)
        .subscribe();
    }
  };
})();
