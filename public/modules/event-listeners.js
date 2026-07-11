import {
  currentMonth,
  currentCoach,
  coaches,
  setCurrentCoach,
  setCurrentMonth
} from "./app-context.js";
let _handlers = {};
function initEventListeners(handlers) {
  _handlers = handlers;
}
let _competitionsVisible = false;
function toggleCompetitionsSection(show) {
  const section = document.getElementById("competitionsSection");
  if (!section) return;
  _competitionsVisible = show !== void 0 ? show : !_competitionsVisible;
  section.style.display = _competitionsVisible ? "block" : "none";
  if (_competitionsVisible) {
    const membersSection = document.getElementById("membersSection");
    if (membersSection) membersSection.style.display = "none";
  }
  const planningEls = [
    document.getElementById("coachSelectorGroup"),
    document.getElementById("monthSelect")?.closest("label") ?? null,
    document.getElementById("frozenBanner"),
    document.getElementById("calendar"),
    document.querySelector(".summary.card"),
    document.querySelector(".legend.card"),
    document.getElementById("coachGreeting")
  ];
  planningEls.forEach((el) => {
    if (el) el.style.display = _competitionsVisible ? "none" : "";
  });
  if (_competitionsVisible) {
    import("./competitions-ui.js").then((m) => {
      m.showCompetitionsSection?.();
    });
  }
}
function setupEventListeners() {
  const {
    updateCalendar,
    updateSummary,
    openCoachModal,
    saveCoach,
    deleteCoach,
    inviteCoach,
    inviteAdmin,
    openDayModal,
    saveDay,
    deleteDay,
    toggleFreezeMonth,
    openAuditLogsModal,
    loadAuditLogs,
    openHelloAssoModal,
    toggleMembersSection,
    exportDeclarationXLS,
    exportTimesheetHTML,
    exportExpenseHTML,
    exportMonthlyExpenses,
    openMileagePreviewModal,
    openMonthlySummaryPreviewModal,
    importCoachData,
    exportBackupJSON,
    supabase
  } = _handlers;
  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`WARN missing element for click binding: #${id}`);
      return null;
    }
    el.onclick = handler;
    return el;
  };
  const bindChange = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`WARN missing element for change binding: #${id}`);
      return null;
    }
    el.onchange = handler;
    return el;
  };
  const monthSelectEl = document.getElementById("monthSelect");
  if (monthSelectEl) monthSelectEl.value = currentMonth;
  const logoutBtnApp = document.getElementById("logoutBtnApp");
  if (logoutBtnApp) {
    logoutBtnApp.addEventListener("click", async () => {
      logoutBtnApp.disabled = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: "global" });
        if (error) {
          alert("D\xE9connexion \xE9chou\xE9e : " + error.message);
          return;
        }
        document.getElementById("appContainer").style.display = "none";
        document.getElementById("authContainer").style.display = "flex";
      } catch (e) {
        alert("Erreur de d\xE9connexion : " + e.message);
      } finally {
        logoutBtnApp.disabled = false;
      }
    });
  }
  bindChange("monthSelect", (e) => {
    const val = e.target.value;
    setCurrentMonth(val);
    const topMonth = document.getElementById("adminTopBarMonthSelect");
    if (topMonth && topMonth.value !== val) topMonth.value = val;
    updateCalendar?.();
    updateSummary?.();
  });
  const adminTopBarMonthEl = document.getElementById("adminTopBarMonthSelect");
  if (adminTopBarMonthEl) {
    const sidebarMonthEl = document.getElementById("monthSelect");
    if (sidebarMonthEl) adminTopBarMonthEl.value = sidebarMonthEl.value;
    adminTopBarMonthEl.addEventListener("change", (e) => {
      const val = e.target.value;
      setCurrentMonth(val);
      if (sidebarMonthEl && sidebarMonthEl.value !== val) sidebarMonthEl.value = val;
      updateCalendar?.();
      updateSummary?.();
    });
  }
  bindChange("coachSelect", async (e) => {
    const val = e.target.value;
    const coach = coaches.find((c) => String(c.id) === val) ?? null;
    setCurrentCoach(coach);
    const topCoach = document.getElementById("adminTopBarCoachSelect");
    if (topCoach && topCoach.value !== val) topCoach.value = val;
    if (_competitionsVisible) toggleCompetitionsSection(false);
    await updateCalendar?.();
    updateSummary?.();
  });
  const adminTopBarCoachEl = document.getElementById("adminTopBarCoachSelect");
  if (adminTopBarCoachEl) {
    const sidebarCoachEl = document.getElementById("coachSelect");
    adminTopBarCoachEl.addEventListener("change", async (e) => {
      const val = e.target.value;
      const coach = coaches.find((c) => String(c.id) === val) ?? null;
      setCurrentCoach(coach);
      if (sidebarCoachEl && sidebarCoachEl.value !== val) sidebarCoachEl.value = val;
      if (_competitionsVisible) toggleCompetitionsSection(false);
      await updateCalendar?.();
      updateSummary?.();
    });
  }
  bindClick("addCoachBtn", () => openCoachModal?.("add"));
  bindClick("editCoachBtn", () => openCoachModal?.("edit", currentCoach));
  bindClick("cancelCoach", () => document.getElementById("coachModal")?.classList.remove("active"));
  bindClick("cancelDay", () => document.getElementById("dayModal")?.classList.remove("active"));
  bindClick("inviteAdminBtn", () => inviteAdmin?.());
  bindClick("freezeBtn", () => toggleFreezeMonth?.());
  bindClick("auditLogsBtn", () => openAuditLogsModal?.());
  bindClick("helloAssoBtn", () => toggleMembersSection?.());
  bindClick("competitionsBtn", () => toggleCompetitionsSection());
  bindClick("adminProfileBtn", async () => {
    const { data: _apUser } = await supabase.auth.getUser();
    const { data } = await supabase.from("admin_profiles").select("*").eq("owner_uid", _apUser?.user?.id ?? "").maybeSingle();
    const f = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = String(val ?? "");
    };
    f("adminProfileName", data?.name);
    f("adminProfileFirstName", data?.first_name);
    f("adminProfileFunction", data?.function_title);
    f("adminProfileAddress", data?.address);
    f("adminProfileVehicle", data?.vehicle);
    f("adminProfileFiscalPower", data?.fiscal_power);
    f("adminProfileKmRate", data?.km_rate ?? 0.35);
    document.getElementById("adminProfileModal")?.classList.add("active");
  });
  bindClick("cancelAdminProfile", () => document.getElementById("adminProfileModal")?.classList.remove("active"));
  bindClick("saveAdminProfile", async () => {
    const btn = document.getElementById("saveAdminProfile");
    if (btn) btn.disabled = true;
    try {
      const g = (id) => document.getElementById(id)?.value?.trim() || null;
      const payload = {
        name: g("adminProfileName"),
        first_name: g("adminProfileFirstName"),
        function_title: g("adminProfileFunction"),
        address: g("adminProfileAddress"),
        vehicle: g("adminProfileVehicle"),
        fiscal_power: g("adminProfileFiscalPower"),
        km_rate: parseFloat(document.getElementById("adminProfileKmRate")?.value) || 0.35,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const user = (await supabase.auth.getUser()).data?.user;
      if (!user) {
        alert("Non connect\xE9.");
        return;
      }
      payload.owner_uid = user.id;
      const { error } = await supabase.from("admin_profiles").upsert([payload], { onConflict: "owner_uid" });
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
      try {
        await supabase.rpc("sync_admin_profile_to_profiles");
      } catch (e) {
        console.warn("sync_admin_profile_to_profiles failed:", e);
      }
      if (_handlers.reloadData) {
        await _handlers.reloadData({ isAdminOverride: true }).catch((e) => console.warn("reloadData failed:", e));
      }
      document.getElementById("adminProfileModal")?.classList.remove("active");
    } catch (e) {
      alert("Erreur inattendue : " + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  bindClick("exportMonthlyExpensesBtn", () => openMonthlySummaryPreviewModal?.());
  bindClick("backupBtn", () => exportBackupJSON?.());
  document.addEventListener("click", (e) => {
    const id = e.target?.id;
    if (id === "exportDeclarationBtn") exportDeclarationXLS?.();
    else if (id === "exportTimesheetBtn" || id === "timesheetBtn") exportTimesheetHTML?.();
    else if (id === "exportExpenseBtn" || id === "mileageBtn") exportExpenseHTML?.();
    else if (id === "exportMileagePreviewBtn") openMileagePreviewModal?.();
    else if (id === "monthlySummaryPreviewBtn") openMonthlySummaryPreviewModal?.();
  });
  const importInput = document.getElementById("importFile");
  if (importInput) {
    importInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) importCoachData?.(file);
      importInput.value = "";
    };
  }
  bindClick("saveCoach", () => saveCoach?.());
  bindClick("deleteCoach", () => deleteCoach?.());
  bindClick("inviteCoach", () => inviteCoach?.());
  bindClick("saveDay", () => saveDay?.());
  bindClick("deleteDay", () => deleteDay?.());
  const competitionDayCb = document.getElementById("competitionDay");
  if (competitionDayCb) {
    competitionDayCb.addEventListener("change", () => {
      const travelGroup = document.getElementById("travelGroup");
      if (travelGroup) travelGroup.style.display = competitionDayCb.checked ? "" : "none";
    });
  }
  document.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.onclick = () => btn.closest(".modal")?.classList.remove("active");
  });
  ["closeAuditLogs", "closeHelloAsso", "closeReconciliation", "closeHelp"].forEach((id) => {
    bindClick(id, () => document.getElementById(id)?.closest(".modal")?.classList.remove("active"));
  });
  bindClick("helpBtn", () => document.getElementById("helpModal")?.classList.add("active"));
  bindClick("refreshAuditLogsBtn", () => _handlers.loadAuditLogs?.());
  const calendarGrid = document.getElementById("calendarGrid");
  if (calendarGrid) {
    calendarGrid.onclick = (e) => {
      const dayEl = e.target?.closest("[data-date]");
      const date = dayEl?.dataset?.date;
      if (date) openDayModal?.(date);
    };
  }
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebarEl = document.getElementById("appSidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const openSidebar = () => {
    const scrollW = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty("--scrollbar-width", scrollW + "px");
    sidebarEl?.classList.add("is-open");
    sidebarOverlay?.classList.add("is-open");
    document.body.classList.add("sidebar-open");
  };
  const closeSidebar = () => {
    sidebarEl?.classList.remove("is-open");
    sidebarOverlay?.classList.remove("is-open");
    document.body.classList.remove("sidebar-open");
    document.documentElement.style.removeProperty("--scrollbar-width");
  };
  sidebarToggle?.addEventListener("click", () => {
    if (sidebarEl?.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  sidebarOverlay?.addEventListener("click", closeSidebar);
  sidebarEl?.querySelectorAll(".sidebar-nav-btn").forEach((btn) => {
    btn.addEventListener("click", closeSidebar);
  });
  const adminPanelEl = document.getElementById("adminActionsPanel");
  const sidebarAdminEl = document.getElementById("sidebarAdminSection");
  if (adminPanelEl && sidebarAdminEl) {
    const syncAdminSection = () => {
      const vis = adminPanelEl.style.display !== "none" && adminPanelEl.style.display !== "";
      sidebarAdminEl.style.display = vis ? "block" : "none";
    };
    syncAdminSection();
    new MutationObserver(syncAdminSection).observe(adminPanelEl, { attributes: true, attributeFilter: ["style"] });
  }
  document.documentElement.dataset.theme = "dark";
}
export {
  initEventListeners,
  setupEventListeners
};
