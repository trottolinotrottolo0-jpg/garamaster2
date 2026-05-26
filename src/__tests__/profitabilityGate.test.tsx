import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import {
  calcImportoOfferto,
  calcMargine,
  determineProfitabilityVerdict,
  validateBreakdownSum,
} from "../lib/bidCalculations";
import type { ProfitabilityGateResult, TenderDocument } from "../types";

// ─── MOCK DATI ────────────────────────────────────────────────────────────────

const IMPORTO_GARA = 1_250_000;
const RIBASSO = 12;
const IMPORTO_OFFERTO = IMPORTO_GARA * (1 - RIBASSO / 100); // 1_100_000

const baseProfile = {
  companyName: "Test SRL",
  vatNumber: "IT00000000000",
  legalForm: "SRL",
  foundedYear: 2000,
  soaCategories: [],
  geographicAreas: [] as any[],
  workSectors: [] as any[],
  targetImportMin: 500_000,
  targetImportMax: 3_000_000,
  employeesCount: 20,
  activeSquads: 4,
  activeJobsites: 2,
  lastYearRevenue: 2_000_000,
  avgMarginPercent: 15,
  avgRibassoPercent: RIBASSO,
  avgWinRatePercent: 25,
  minMargineAccettabile: 8,
  costoOraOperaio: 28,
  costoOraCaposquadra: 38,
  incidenzaSpeseGenerali: 15,
  incidenzaRischioMedio: 3,
  historicalNotes: "",
  lastUpdated: new Date().toISOString(),
};

const mockTender: TenderDocument = {
  id: "test-1",
  title: "Riqualificazione Scuola Test",
  cig: "TEST0000001",
  region: "Lombardia",
  value: "€ 1.250.000,00",
  category: "OG1",
  deadline: "2025-12-31",
  requirements: [],
  sections: [],
  anomalies: [],
  penalties: [],
};

function makeMockResult(overrides: Partial<ProfitabilityGateResult> = {}): ProfitabilityGateResult {
  return {
    verdict: "PROFITTEVOLE",
    scoreProfittabilita: 72,
    margineAttesoPercent: 14.5,
    margineAttesoEuro: 159_500,
    breakdownCosti: [
      { categoria: "Manodopera", importoStimato: 385_000, percentualeImporto: 35, note: "Stimato su costoOra operai" },
      { categoria: "Materiali", importoStimato: 330_000, percentualeImporto: 30, note: "Categoria OG1 standard" },
      { categoria: "Noli/Mezzi", importoStimato: 88_000, percentualeImporto: 8, note: "Attrezzature da cantiere" },
      { categoria: "Spese generali", importoStimato: 165_000, percentualeImporto: 15, note: "15% dell'importo" },
      { categoria: "Accantonamento rischio", importoStimato: 33_000, percentualeImporto: 3, note: "3% dell'importo" },
      { categoria: "Utile atteso", importoStimato: 99_000, percentualeImporto: 9, note: "Differenza residua" },
    ],
    costoTotaleStimato: 1_100_000,
    rischioEconomico: "basso",
    motivazione: "Gara ben calibrata sul profilo impresa con margine adeguato.",
    alertMargineInsufficiente: false,
    alertMargineNegativo: false,
    alertText: null,
    scenarioOttimistico: 18.2,
    scenarioRealistico: 14.5,
    scenarioPessimistico: 9.1,
    puntiAttenzione: ["Variazioni prezzi materiali", "Ritardi cantiere"],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── TEST 1: CALCOLO IMPORTO OFFERTO (funzione pura) ─────────────────────────

describe("calcImportoOfferto", () => {
  it("ribasso 12% su €1.25M → €1.1M", () => {
    const importoOfferto = calcImportoOfferto(IMPORTO_GARA, RIBASSO);
    expect(importoOfferto).toBeCloseTo(1_100_000, -2);
  });

  it("ribasso 0% lascia invariato l'importo", () => {
    expect(calcImportoOfferto(1_000_000, 0)).toBe(1_000_000);
  });

  it("ribasso 100% porta a zero", () => {
    expect(calcImportoOfferto(1_000_000, 100)).toBe(0);
  });
});

// ─── TEST 2: BREAKDOWN 6 VOCI + COERENZA SOMMA ───────────────────────────────

describe("Breakdown costi", () => {
  const result = makeMockResult();

  it("contiene esattamente 6 voci distinte", () => {
    expect(result.breakdownCosti).toHaveLength(6);
    const categorie = result.breakdownCosti.map((i) => i.categoria);
    const uniche = new Set(categorie);
    expect(uniche.size).toBe(6);
  });

  it("somma voci ≈ costoTotaleStimato (entro 5%)", () => {
    const sum = result.breakdownCosti.reduce((acc, item) => acc + item.importoStimato, 0);
    const delta = Math.abs(sum - result.costoTotaleStimato) / result.costoTotaleStimato;
    expect(delta).toBeLessThanOrEqual(0.05);
  });

  it("costoTotaleStimato ≈ importoOfferto da ribasso 12%", () => {
    const delta = Math.abs(result.costoTotaleStimato - IMPORTO_OFFERTO) / IMPORTO_OFFERTO;
    expect(delta).toBeLessThanOrEqual(0.05);
  });

  it("helper validateBreakdownSum approva dati coerenti", () => {
    expect(validateBreakdownSum(result)).toBe(true);
  });
});

// ─── TEST 3: GERARCHIA SCENARI ────────────────────────────────────────────────

describe("Gerarchia scenari", () => {
  const result = makeMockResult();

  it("Ottimistico > Realistico > Pessimistico", () => {
    expect(result.scenarioOttimistico).toBeGreaterThan(result.scenarioRealistico);
    expect(result.scenarioRealistico).toBeGreaterThan(result.scenarioPessimistico);
  });

  it("scenari hanno valori numericamente distinti", () => {
    expect(result.scenarioOttimistico).not.toBe(result.scenarioRealistico);
    expect(result.scenarioRealistico).not.toBe(result.scenarioPessimistico);
  });
});

// ─── TEST 4: SCENARIO RISCHIO — minMargine 25% → PERICOLOSA + ALERT ──────────

describe("Alert rischio — margine minimo elevato", () => {
  it("determineProfitabilityVerdict → PERICOLOSA con minMargine 25%", () => {
    const margineAtteso = calcMargine(
      IMPORTO_OFFERTO,
      baseProfile.avgMarginPercent,
      baseProfile.incidenzaSpeseGenerali,
      baseProfile.incidenzaRischioMedio
    ).marginePercent;

    const verdict = determineProfitabilityVerdict(margineAtteso, 25);
    expect(verdict).toBe("PERICOLOSA");
  });

  it("alertMargineInsufficiente true quando margine < minMargine 25%", () => {
    const result = makeMockResult({
      verdict: "PERICOLOSA",
      scoreProfittabilita: 22,
      margineAttesoPercent: 14.5,
      alertMargineInsufficiente: true,
      alertMargineNegativo: false,
      alertText: "Il margine atteso del 14.5% è inferiore al minimo accettabile del 25%.",
    });
    expect(result.alertMargineInsufficiente).toBe(true);
    expect(result.alertText).not.toBeNull();
  });

  it("render componente mostra box alert rosso con PERICOLOSA", async () => {
    vi.mock("../lib/gemini", () => ({
      runProfitabilityGate: vi.fn().mockResolvedValue(
        makeMockResult({
          verdict: "PERICOLOSA",
          scoreProfittabilita: 22,
          alertMargineInsufficiente: true,
          alertText: "Margine insufficiente: 14.5% < soglia 25%.",
        })
      ),
    }));

    localStorage.setItem("gm_company_profile", JSON.stringify(baseProfile));

    const { ProfitabilityGate } = await import("../components/ProfitabilityGate");

    const { unmount } = render(
      <ProfitabilityGate
        tender={mockTender}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("PERICOLOSA")).toBeInTheDocument();
    });

    // Il componente mostra "Alert margine insufficiente" come label span + alertText come p
    const alertLabel = screen.getByText("Alert margine insufficiente");
    expect(alertLabel).toBeInTheDocument();
    const alertBox = alertLabel.closest("div");
    expect(alertBox).not.toBeNull();

    unmount();
    vi.clearAllMocks();
  });
});

// ─── TEST 5: PROPORZIONI — Manodopera > Rischio ───────────────────────────────

describe("Proporzioni breakdown", () => {
  const result = makeMockResult();

  it("Manodopera ha importo maggiore di Accantonamento rischio", () => {
    const manodopera = result.breakdownCosti.find((i) => i.categoria === "Manodopera");
    const rischio = result.breakdownCosti.find((i) =>
      i.categoria.toLowerCase().includes("rischio") || i.categoria.toLowerCase().includes("accantonamento")
    );
    expect(manodopera).toBeDefined();
    expect(rischio).toBeDefined();
    expect(manodopera!.importoStimato).toBeGreaterThan(rischio!.importoStimato);
  });

  it("Manodopera ha percentualeImporto maggiore di Accantonamento rischio", () => {
    const manodopera = result.breakdownCosti.find((i) => i.categoria === "Manodopera")!;
    const rischio = result.breakdownCosti.find((i) =>
      i.categoria.toLowerCase().includes("rischio") || i.categoria.toLowerCase().includes("accantonamento")
    )!;
    expect(manodopera.percentualeImporto).toBeGreaterThan(rischio.percentualeImporto);
  });
});

// ─── TEST 6: parseTenderValue (utility) ──────────────────────────────────────

describe("parseTenderValue", () => {
  it("parsa formato italiano €1.250.000,00", async () => {
    const { parseTenderValue } = await import("../lib/bidCalculations");
    expect(parseTenderValue("€ 1.250.000,00")).toBeCloseTo(1_250_000, 0);
  });
});
