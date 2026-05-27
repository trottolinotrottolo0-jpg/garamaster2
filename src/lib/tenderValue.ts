/** Converte stringhe importo gara (es. "€ 1.250.000") in euro numerici */
export function parseTenderImporto(valueStr: string): number {
  if (!valueStr || valueStr === "N/D") return 0;
  const cleaned = valueStr
    .replace(/[€\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
