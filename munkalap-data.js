(function () {
  const PROFILE_KEY = "diszkertek-munkalap-profile-v1";
  const DEVICE_SESSION_KEY = "diszkertek-munkalap-device-session-v1";
  const DEVICE_SESSIONS_KEY = "diszkertek-munkalap-device-sessions-v2";
  const EMAILS = {
    "Ádám": "adam@munkalap.diszkertek.hu",
    "Ági": "agi@munkalap.diszkertek.hu",
    "Attila": "attila@munkalap.diszkertek.hu",
    "Bendegúz": "bendeguz@munkalap.diszkertek.hu",
    "Gábor": "gabor@munkalap.diszkertek.hu",
    "Márk": "mark@munkalap.diszkertek.hu",
    "Tamás": "tamas@munkalap.diszkertek.hu"
  };
  const MANAGER_NAMES = ["Ági", "Tamás"];

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
  let previewCustomers = [];

  function readRememberedSessions() {
    try {
      const sessions = JSON.parse(localStorage.getItem(DEVICE_SESSIONS_KEY));
      return sessions && typeof sessions === "object" && !Array.isArray(sessions) ? sessions : {};
    }
    catch (_) { return {}; }
  }

  function writeRememberedSessions(sessions) {
    try { localStorage.setItem(DEVICE_SESSIONS_KEY, JSON.stringify(sessions)); }
    catch (_) { /* A belépés tárhelykorlátozás esetén is folytatódhat. */ }
  }

  function rememberSession(currentSession) {
    const email = currentSession?.user?.email?.toLocaleLowerCase("hu-HU");
    if (!email || !currentSession?.access_token || !currentSession?.refresh_token) return;
    const sessions = readRememberedSessions();
    sessions[email] = {
      access_token: currentSession.access_token,
      refresh_token: currentSession.refresh_token
    };
    writeRememberedSessions(sessions);
    try { localStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify(sessions[email])); }
    catch (_) { /* A Supabase saját munkamenet-kezelése továbbra is működik. */ }
  }

  function forgetRememberedSession(name) {
    const email = EMAILS[name]?.toLocaleLowerCase("hu-HU");
    if (!email) return;
    const sessions = readRememberedSessions();
    delete sessions[email];
    writeRememberedSessions(sessions);
  }

  function rememberedSessionFor(name) {
    const email = EMAILS[name]?.toLocaleLowerCase("hu-HU");
    return email ? readRememberedSessions()[email] : null;
  }

  function rememberedManagerSessions() {
    return MANAGER_NAMES
      .map(name => ({ name, session: rememberedSessionFor(name) }))
      .filter(item => item.session?.access_token && item.session?.refresh_token);
  }

  if (remoteConfigured) {
    client = window.supabase.createClient(config.url, config.publishableKey, {
      db: { schema: "munkalap" },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage,
        storageKey: "diszkertek-munkalap-auth-v1"
      }
    });
    client.auth.onAuthStateChange((event, currentSession) => {
      if (currentSession?.access_token && currentSession?.refresh_token) {
        rememberSession(currentSession);
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
      customerId: row.customer_id || null,
      locationId: row.location_id || null,
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
      customer_id: item.customerId || null,
      location_id: item.locationId || null,
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
    if (!EMAILS[data?.display_name]) {
      localStorage.removeItem(PROFILE_KEY);
      throw new Error("Ez a felhasználó már nem jogosult a MUNKALAP használatára.");
    }
    const profile = { userId: data.id, name: data.display_name, role: data.role };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
    catch (_) { /* A profil ettől még használható az aktuális munkamenetben. */ }
    return profile;
  }

  window.MunkalapDB = {
    configured,
    previewMode,

    hasRememberedLogin(name) {
      if (previewMode) return false;
      const saved = rememberedSessionFor(name);
      return Boolean(saved?.access_token && saved?.refresh_token) || rememberedManagerSessions().length > 0;
    },

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
      let data;
      const remembered = rememberedSessionFor(name);
      if (!pin && remembered?.access_token && remembered?.refresh_token) {
        const restored = await client.auth.setSession(remembered);
        if (restored.error || !restored.data?.user) {
          forgetRememberedSession(name);
          if (rememberedManagerSessions().length) return window.MunkalapDB.login(name, "");
          throw new Error("A korábbi belépés lejárt. Add meg újra egyszer a PIN-kódot.");
        }
        data = restored.data;
      } else if (!pin) {
        let managerProfile = null;
        let managerUser = null;
        for (const rememberedManager of rememberedManagerSessions()) {
          const restored = await client.auth.setSession(rememberedManager.session);
          if (restored.error || !restored.data?.user) {
            forgetRememberedSession(rememberedManager.name);
            continue;
          }
          const verified = await profileFor(restored.data.user);
          if (verified.role === "manager") {
            managerProfile = verified;
            managerUser = restored.data.user;
            rememberSession(restored.data.session);
            break;
          }
        }
        if (!managerProfile || !managerUser) {
          throw new Error("Az irodai belépés lejárt. Ági vagy Tamás PIN-kódját add meg újra egyszer.");
        }
        const { data: target, error: targetError } = await client
          .from("profiles")
          .select("id,display_name,role")
          .eq("display_name", name)
          .single();
        if (targetError) throw targetError;
        const delegated = {
          userId: target.id,
          authUserId: managerUser.id,
          name: target.display_name,
          role: target.role,
          delegatedBy: managerProfile.name
        };
        try { localStorage.setItem(PROFILE_KEY, JSON.stringify(delegated)); }
        catch (_) { /* A névváltás ettől még használható az aktuális munkamenetben. */ }
        return delegated;
      } else {
        const signedIn = await client.auth.signInWithPassword({ email, password: pin });
        if (signedIn.error) throw new Error("Hibás PIN-kód.");
        data = signedIn.data;
      }
      rememberSession(data.session);
      const profile = await profileFor(data.user);
      if (profile.name !== name) {
        forgetRememberedSession(name);
        throw new Error("A PIN-kód nem ehhez a névhez tartozik.");
      }
      return profile;
    },

    async restore() {
      if (previewMode) return null;
      if (!client) return null;
      let { data } = await client.auth.getSession();
      if (!data.session) {
        try {
          const savedSession = JSON.parse(localStorage.getItem(DEVICE_SESSION_KEY));
          if (savedSession?.access_token && savedSession?.refresh_token) {
            const restored = await client.auth.setSession(savedSession);
            if (!restored.error) data = restored.data;
          }
        } catch (_) {
          localStorage.removeItem(DEVICE_SESSION_KEY);
        }
      }
      if (!data.session) {
        localStorage.removeItem(PROFILE_KEY);
        return null;
      }
      try {
        const cached = JSON.parse(localStorage.getItem(PROFILE_KEY));
        const sameUser = cached?.userId === data.session.user.id || cached?.authUserId === data.session.user.id;
        if (sameUser && EMAILS[cached?.name]) return cached;
        localStorage.removeItem(PROFILE_KEY);
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
      // Ez névváltás: a korábban ellenőrzött belépéseket ezen az eszközön
      // szándékosan megőrizzük, ezért nem vonjuk vissza a refresh tokent.
    },

    async listRecent(userId) {
      if (previewMode) {
        if (!previewProfile) return [];
        const visible = previewWorksheets
          .filter(item => item.userId === previewProfile.userId)
          .slice(0, 10);
        return visible.map(item => ({ ...item, data: { ...item.data } }));
      }
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData?.user) {
        throw authError || new Error("Nincs aktív belépés.");
      }
      const { data, error } = await client
        .from("worksheets")
        .select("*")
        .eq("user_id", userId || authData.user.id)
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data.map(mapWorksheet);
    },

    async listAll() {
      if (previewMode) {
        if (previewProfile?.role !== "manager") throw new Error("Nincs jogosultság.");
        return previewWorksheets.map(item => ({ ...item, data: { ...item.data } }));
      }
      const pageSize = 500;
      const result = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client
          .from("worksheets")
          .select("*")
          .order("work_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        result.push(...data.map(mapWorksheet));
        if (data.length < pageSize) break;
      }
      return result;
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
        .upsert(toRow(item, userId), { onConflict: "id" })
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
        customer_id: item.customerId || null,
        location_id: item.locationId || null,
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

    async listCustomers(manager = false) {
      if (previewMode) {
        return previewCustomers
          .filter(item => manager || (item.active && item.reviewStatus === "approved"))
          .map(item => ({ ...item, locations: item.locations.map(location => ({ ...location })) }));
      }
      const { data: customerRows, error: customerError } = await client
        .from("customers")
        .select("id,full_name,active,review_status,created_at,updated_at")
        .order("full_name", { ascending: true });
      if (customerError) throw customerError;
      const ids = customerRows.map(row => row.id);
      let locationRows = [];
      let detailRows = [];
      if (ids.length) {
        const locationsResult = await client
          .from("customer_locations")
          .select("id,customer_id,label,address,active,review_status")
          .in("customer_id", ids)
          .order("address", { ascending: true });
        if (locationsResult.error) throw locationsResult.error;
        locationRows = locationsResult.data || [];
        if (manager) {
          const detailsResult = await client
            .from("customer_details")
            .select("customer_id,customer_type,contact_name,email,phone,tax_number,billing_mode,monthly_flat_fee,notes")
            .in("customer_id", ids);
          if (detailsResult.error) throw detailsResult.error;
          detailRows = detailsResult.data || [];
        }
      }
      const detailsByCustomer = new Map(detailRows.map(row => [row.customer_id, row]));
      return customerRows.map(row => {
        const detail = detailsByCustomer.get(row.id) || {};
        return {
          id: row.id,
          fullName: row.full_name,
          active: row.active,
          reviewStatus: row.review_status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          customerType: detail.customer_type || "",
          contactName: detail.contact_name || "",
          email: detail.email || "",
          phone: detail.phone || "",
          taxNumber: detail.tax_number || "",
          billingMode: detail.billing_mode || "per_job",
          monthlyFlatFee: detail.monthly_flat_fee == null ? null : Number(detail.monthly_flat_fee),
          notes: detail.notes || "",
          locations: locationRows.filter(location => location.customer_id === row.id).map(location => ({
            id: location.id,
            label: location.label || "",
            address: location.address,
            active: location.active,
            reviewStatus: location.review_status
          }))
        };
      });
    },

    async saveCustomer(customer) {
      if (previewMode) {
        const saved = {
          ...customer,
          id: customer.id || `bemutato-ugyfel-${Date.now()}`,
          locations: (customer.locations || []).map((location, index) => ({
            ...location,
            id: location.id || `bemutato-hely-${Date.now()}-${index}`
          }))
        };
        const index = previewCustomers.findIndex(item => item.id === saved.id);
        if (index >= 0) previewCustomers[index] = saved;
        else previewCustomers.push(saved);
        return saved;
      }
      const { data, error } = await client.rpc("save_customer", {
        saved_customer_id: customer.id || null,
        saved_full_name: customer.fullName.trim(),
        saved_active: customer.active !== false,
        saved_review_status: customer.reviewStatus || "approved",
        saved_customer_type: customer.customerType || "",
        saved_contact_name: customer.contactName || "",
        saved_email: customer.email || "",
        saved_phone: customer.phone || "",
        saved_tax_number: customer.taxNumber || "",
        saved_billing_mode: customer.billingMode || "per_job",
        saved_monthly_flat_fee: customer.monthlyFlatFee == null || customer.monthlyFlatFee === "" ? null : Number(customer.monthlyFlatFee),
        saved_notes: customer.notes || "",
        saved_locations: customer.locations || [],
        removed_location_ids: customer.removedLocationIds || []
      });
      if (error) throw error;
      return data;
    },

    async registerCustomerSuggestion(name, address) {
      if (previewMode) return { customerId: null, locationId: null };
      const { data, error } = await client.rpc("register_customer_suggestion", {
        proposed_name: name,
        proposed_address: address
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { customerId: row?.customer_id || null, locationId: row?.location_id || null };
    },

    async removeCustomer(id) {
      if (previewMode) {
        const index = previewCustomers.findIndex(customer => customer.id === id);
        if (index < 0) throw new Error("Az ügyfél nem található.");
        previewCustomers.splice(index, 1);
        return id;
      }
      const { data, error } = await client
        .from("customers")
        .delete()
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async remove(id) {
      if (previewMode) {
        if (previewProfile?.role !== "manager") throw new Error("Nincs jogosultság.");
        const index = previewWorksheets.findIndex(record => record.id === id);
        if (index < 0) throw new Error("A munkalap nem található.");
        previewWorksheets.splice(index, 1);
        return id;
      }
      const { data, error } = await client
        .from("worksheets")
        .delete()
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
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
