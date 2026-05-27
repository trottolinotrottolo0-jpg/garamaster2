/**
 * ROI partecipazione gara:
 * ROI% = ((Importo × margine%) − costi partecipazione) / costi partecipazione × 100
 */
export function computeGaraRoiPercent(
  importoGara: number,
  marginePercent: number,
  costiPartecipazione: number
): number | null {
  if (costiPartecipazione <= 0 || importoGara <= 0) return null;
  const profittoAtteso = importoGara * (marginePercent / 100) - costiPartecipazione;
  return (profittoAtteso / costiPartecipazione) * 100;
}

export function computeCostiPreparazione(
  oreStimate: number,
  tariffaOrariaEuro: number,
  costiAggiuntiviEuro: number
): number {
  return Math.max(0, oreStimate * tariffaOrariaEuro + costiAggiuntiviEuro);
}
