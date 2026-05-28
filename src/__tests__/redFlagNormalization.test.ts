import { describe, it, expect } from "vitest";
import {
  normalizeRedFlagCategory,
  buildRedFlagExplainabilityFallback,
  resolveRedFlagExplainability,
} from "../lib/redFlagNormalization";
import type { RedFlag } from "../types";

describe("normalizeRedFlagCategory", () => {
  it("riconosce requisito_sproporzionato", () => {
    expect(normalizeRedFlagCategory("requisito_sproporzionato")).toBe("requisito_sproporzionato");
    expect(normalizeRedFlagCategory("requisito sproporzionato")).toBe("requisito_sproporzionato");
    expect(normalizeRedFlagCategory("requisiti sproporzionati")).toBe("requisito_sproporzionato");
  });

  it("riconosce clausola_sensibile", () => {
    expect(normalizeRedFlagCategory("clausola_sensibile")).toBe("clausola_sensibile");
    expect(normalizeRedFlagCategory("clausola sensibile")).toBe("clausola_sensibile");
    expect(normalizeRedFlagCategory("clausole sensibili")).toBe("clausola_sensibile");
  });

  it("riconosce rischio_operativo", () => {
    expect(normalizeRedFlagCategory("rischio_operativo")).toBe("rischio_operativo");
    expect(normalizeRedFlagCategory("rischio operativo")).toBe("rischio_operativo");
    expect(normalizeRedFlagCategory("clausola operativa rischiosa")).toBe("rischio_operativo");
  });

  it("riconosce rischio_esclusione", () => {
    expect(normalizeRedFlagCategory("rischio_esclusione")).toBe("rischio_esclusione");
    expect(normalizeRedFlagCategory("aumento rischio esclusione")).toBe("rischio_esclusione");
    expect(normalizeRedFlagCategory("requisito che aumenta rischio esclusione")).toBe(
      "rischio_esclusione"
    );
  });
});

describe("resolveRedFlagExplainability", () => {
  const sampleFlags: RedFlag[] = [
    {
      title: "Test",
      type: "clausola_sensibile",
      clause: "c",
      articleRef: "art",
      severity: "medium",
      simpleExplanation: "e",
      remedy: "r",
      clarificationText: "t",
    },
  ];

  it("fornisce fallback explainability quando il LLM non lo restituisce", () => {
    const result = resolveRedFlagExplainability(undefined, sampleFlags, {
      rischioComplessivo: "medium",
      tender: { title: "Gara test", cig: "ABC123" },
    });
    expect(result).toBeDefined();
    expect(result?.perche).toContain("rilevato");
    expect(result?.verifica).toContain("Verificare coerenza");
    expect(result?.verifica).toContain("revisione umana");
    expect(result?.confidenza).toBeTruthy();
  });

  it("usa explainability LLM quando presente e completa", () => {
    const llm = {
      perche: "Motivo LLM",
      datiUsati: "Dati",
      verifica: "Verifica",
      confidenza: "Alto",
    };
    const result = resolveRedFlagExplainability(llm, sampleFlags, {});
    expect(result?.perche).toBe("Motivo LLM");
  });
});

describe("buildRedFlagExplainabilityFallback", () => {
  it("non restituisce campi vuoti", () => {
    const data = buildRedFlagExplainabilityFallback(
      [
        {
          title: "Alta",
          type: "rischio_esclusione",
          clause: "x",
          articleRef: "y",
          severity: "high",
          simpleExplanation: "z",
          remedy: "w",
          clarificationText: "q",
        },
      ],
      { rischioComplessivo: "high" }
    );
    expect(data.perche.length).toBeGreaterThan(10);
    expect(data.verifica.length).toBeGreaterThan(10);
    expect(data.datiUsati.length).toBeGreaterThan(5);
  });
});
