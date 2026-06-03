import type {
  AlertCategoria,
  AlertItem,
  AlertSeverity,
  DailyDigest,
  DailyFeedData,
  NotifPrefs,
  WeeklyDigest,
} from "../types/dailyFeed";

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  WARNING: 2,
  INFO: 3,
};

function sortBySeverity(alerts: AlertItem[]): AlertItem[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

export function generateAlerts(feed: DailyFeedData): AlertItem[] {
  const alerts: AlertItem[] = [];

  // Scadenze → SCADENZA
  for (const item of feed.scadenzaProssimi7Giorni) {
    const severity: AlertSeverity =
      item.giorniRimanenti <= 0
        ? "CRITICAL"
        : item.giorniRimanenti <= 1
          ? "CRITICAL"
          : item.giorniRimanenti <= 3
            ? "HIGH"
            : "WARNING";
    alerts.push({
      id: `alert-${item.id}`,
      titolo:
        item.giorniRimanenti <= 0
          ? "Scadenza OGGI"
          : `Scadenza tra ${item.giorniRimanenti} giorno${item.giorniRimanenti > 1 ? "i" : ""}`,
      descrizione: item.titolo,
      severity,
      categoria: "SCADENZA",
      data: item.scadenzaOfferta,
      garaId: item.garaId,
      cig: item.cig,
      actionConsigliata: "Verifica documentazione e stato offerta",
    });
  }

  // Nuove gare ANAC → FIT
  for (const item of feed.nuoveGareAnac) {
    const severity: AlertSeverity =
      item.fitScore >= 85 ? "HIGH" : item.fitScore >= 70 ? "WARNING" : "INFO";
    alerts.push({
      id: `alert-${item.id}`,
      titolo: `Nuova opportunità — fit ${item.fitScore}%`,
      descrizione: item.titolo,
      severity,
      categoria: "FIT",
      data: item.dataScadenza ?? new Date().toISOString(),
      garaId: item.gareAnacId,
      cig: item.cig,
      actionConsigliata: "Analizza il bando e valuta la partecipazione",
    });
  }

  // Scouting AI alerts → OPERATIVO
  for (const item of feed.scoutingAiAlerts) {
    alerts.push({
      id: `alert-${item.id}`,
      titolo: `Alert AI — ${item.cig}`,
      descrizione: item.alert,
      severity: "HIGH",
      categoria: "OPERATIVO",
      data: new Date().toISOString(),
      garaId: item.gareAnacId,
      cig: item.cig,
      actionConsigliata: item.strategia ?? "Verifica i dettagli nel disciplinare",
    });
  }

  // Azioni urgenti → PRIORITA
  for (const item of feed.azioniUrgenti) {
    const severity: AlertSeverity =
      item.giorniRimanenti != null && item.giorniRimanenti <= 3 ? "CRITICAL" : "HIGH";
    alerts.push({
      id: `alert-${item.id}`,
      titolo: "Gara in preparazione — azione richiesta",
      descrizione: item.titolo,
      severity,
      categoria: "PRIORITA",
      data: item.scadenzaOfferta ?? new Date().toISOString(),
      garaId: item.garaId,
      cig: item.cig,
      actionConsigliata: "Completa la preparazione dell'offerta",
    });
  }

  return sortBySeverity(alerts);
}

export function filterAlertsByPrefs(alerts: AlertItem[], prefs: NotifPrefs): AlertItem[] {
  return alerts.filter((a) => {
    if (a.severity === "CRITICAL" && !prefs.alertCritici) return false;
    if (a.categoria === "SCADENZA" && !prefs.gareUrgenti) return false;
    if (a.categoria === "PRIORITA" && !prefs.gareAltaPriorita) return false;
    if (a.categoria === "DOCUMENTI" && !prefs.documentiMancanti) return false;
    if (a.categoria === "TASK" && !prefs.task) return false;
    if (a.categoria === "COMPLIANCE" && !prefs.compliance) return false;
    return true;
  });
}

export function generateDailyDigest(feed: DailyFeedData, alerts: AlertItem[]): DailyDigest {
  const critici = alerts.filter(
    (a) => a.severity === "CRITICAL" || a.severity === "HIGH"
  ).length;
  const urgenti = feed.scadenzaProssimi7Giorni.filter(
    (i) => i.giorniRimanenti <= 3
  ).length;

  let raccomandazione: string;
  if (urgenti > 0) {
    raccomandazione = `Hai ${urgenti} gara${urgenti > 1 ? "e" : ""} in scadenza entro 3 giorni — priorità assoluta.`;
  } else if (feed.azioniUrgenti.length > 0) {
    raccomandazione = `${feed.azioniUrgenti.length} gara${feed.azioniUrgenti.length > 1 ? "e" : ""} in preparazione. Controlla lo stato dei documenti.`;
  } else if (feed.nuoveGareAnac.length > 0) {
    raccomandazione = `${feed.nuoveGareAnac.length} nuove opportunità ANAC da valutare. Inizia da quella con fit più alto.`;
  } else {
    raccomandazione =
      "Nessuna urgenza critica oggi. Ottimo momento per analizzare nuove opportunità.";
  }

  const gareMonitorate =
    feed.scadenzaProssimi7Giorni.length +
    feed.nuoveGareAnac.length +
    feed.azioniUrgenti.length;

  return {
    generatedAt: feed.generatedAt,
    gareMonitorate,
    gareUrgenti: urgenti,
    alertCritici: critici,
    taskAperti: feed.azioniUrgenti.length,
    raccomandazione,
  };
}

export function generateWeeklyDigest(feed: DailyFeedData): WeeklyDigest {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // lunedì

  const raccomandazione =
    feed.nuoveGareAnac.length > 0
      ? `Questa settimana ci sono ${feed.nuoveGareAnac.length} nuove opportunità con fit elevato.`
      : "Tieni monitorato il portale ANAC per nuove opportunità nella tua area.";

  return {
    settimana: `${weekStart.toLocaleDateString("it-IT", { day: "numeric", month: "long" })} — ${now.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`,
    nuoveOpportunita: feed.nuoveGareAnac.length,
    gareAnalizzate: feed.totalAlerts,
    alertRisolti: 0,
    raccomandazione,
  };
}

export function severityLabel(s: AlertSeverity): string {
  switch (s) {
    case "CRITICAL": return "Critico";
    case "HIGH":     return "Alto";
    case "WARNING":  return "Attenzione";
    case "INFO":     return "Info";
  }
}

export function severityColors(s: AlertSeverity): { border: string; bg: string; badge: string; text: string } {
  switch (s) {
    case "CRITICAL":
      return {
        border: "border-red-700/50",
        bg: "bg-red-950/30",
        badge: "bg-red-600 text-white",
        text: "text-red-300",
      };
    case "HIGH":
      return {
        border: "border-amber-700/50",
        bg: "bg-amber-950/20",
        badge: "bg-amber-500 text-black",
        text: "text-amber-300",
      };
    case "WARNING":
      return {
        border: "border-yellow-700/40",
        bg: "bg-yellow-950/20",
        badge: "bg-yellow-600/80 text-white",
        text: "text-yellow-300",
      };
    case "INFO":
      return {
        border: "border-neutral-700/50",
        bg: "bg-neutral-900/50",
        badge: "bg-neutral-700 text-slate-300",
        text: "text-slate-400",
      };
  }
}

export function categoriaLabel(c: AlertCategoria): string {
  const map: Record<AlertCategoria, string> = {
    SCADENZA: "Scadenza",
    FIT: "Fit profilo",
    PRIORITA: "Priorità",
    DOCUMENTI: "Documenti",
    TASK: "Task",
    COMPLIANCE: "Compliance",
    GARA: "Gara",
    OPERATIVO: "Operativo",
  };
  return map[c] ?? c;
}
