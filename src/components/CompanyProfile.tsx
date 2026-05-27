import { useState, type ReactNode } from "react";
import { Plus, Trash2, Building2 } from "lucide-react";
import type {
  CompanyAvailableResource,
  CompanyProfile as CompanyProfileType,
  CompanyResourceAvailability,
  CompanyResourceType,
  SOACategory,
  SOACategoryCode,
  SOAClassifica,
  GeographicArea,
  WorkSector,
} from "../types";

const STORAGE_KEY = "gm_company_profile";

const SOA_CODES: SOACategoryCode[] = [
  "OG1", "OG2", "OG3", "OG4", "OG5", "OG6", "OG7", "OG8", "OG9", "OG10", "OG11", "OG12", "OG13",
  "OS1", "OS2-A", "OS2-B", "OS3", "OS4", "OS5", "OS6", "OS7", "OS8", "OS9", "OS10", "OS11",
  "OS12-A", "OS12-B", "OS13", "OS14", "OS15", "OS16", "OS17", "OS18-A", "OS18-B",
  "OS19", "OS20-A", "OS20-B", "OS21", "OS22", "OS23", "OS24", "OS25", "OS26", "OS27",
  "OS28", "OS29", "OS30", "OS31", "OS32", "OS33", "OS34", "OS35",
];

const SOA_CLASSIFICHE: SOAClassifica[] = ["I", "II", "III", "III-bis", "IV", "IV-bis", "V", "VI", "VII", "VIII"];
const GEOGRAPHIC_AREAS: GeographicArea[] = ["Nord-Ovest", "Nord-Est", "Centro", "Sud", "Isole", "Nazionale"];
const WORK_SECTORS: WorkSector[] = [
  "Edilizia civile", "Edilizia industriale", "Infrastrutture", "Impianti",
  "Restauro", "Verde pubblico", "Strade e autostrade", "Idraulica", "Bonifica", "Altro",
];

const RESOURCE_TYPES: { value: CompanyResourceType; label: string }[] = [
  { value: "mezzo", label: "Mezzo" },
  { value: "attrezzatura", label: "Attrezzatura" },
  { value: "risorsa_tecnica", label: "Risorsa tecnica" },
  { value: "altro", label: "Altro" },
];

const RESOURCE_AVAILABILITY: { value: CompanyResourceAvailability; label: string }[] = [
  { value: "disponibile", label: "Disponibile" },
  { value: "parzialmente_disponibile", label: "Parzialmente disponibile" },
  { value: "occupato", label: "Occupato" },
  { value: "non_disponibile", label: "Non disponibile" },
];

function newResourceId(): string {
  return `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const emptyProfile: CompanyProfileType = {
  companyName: "", vatNumber: "", legalForm: "", foundedYear: new Date().getFullYear(),
  soaCategories: [], soaAttestatoreName: "",
  geographicAreas: [], workSectors: [],
  targetImportMin: 0, targetImportMax: 0,
  employeesCount: 0, activeSquads: 0, activeJobsites: 0,
  availableResources: [],
  lastYearRevenue: 0, avgMarginPercent: 0,
  avgRibassoPercent: 0, avgWinRatePercent: 0, minMargineAccettabile: 0,
  costoOraOperaio: 0, costoOraCaposquadra: 0, incidenzaSpeseGenerali: 0, incidenzaRischioMedio: 0,
  historicalNotes: "", lastUpdated: "",
};

function normalizeProfile(raw: Partial<CompanyProfileType>): CompanyProfileType {
  return {
    ...emptyProfile,
    ...raw,
    availableResources: Array.isArray(raw.availableResources) ? raw.availableResources : [],
  };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-3">
      {children}
    </h2>
  );
}

const inputCls = (extra = "") =>
  `bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:border-brand-gold focus:outline-none px-3 py-2 w-full ${extra}`;

export function CompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfileType>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeProfile(JSON.parse(stored) as Partial<CompanyProfileType>) : emptyProfile;
  });

  const resources = profile.availableResources ?? [];
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof CompanyProfileType>(key: K, value: CompanyProfileType[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const updated = { ...profile, lastUpdated: new Date().toISOString() };
    setProfile(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addSOA = () => {
    const newCat: SOACategory = { code: "OG1", classifica: "I", expiryDate: "" };
    set("soaCategories", [...profile.soaCategories, newCat]);
  };

  const removeSOA = (idx: number) => {
    set("soaCategories", profile.soaCategories.filter((_, i) => i !== idx));
  };

  const updateSOA = (idx: number, patch: Partial<SOACategory>) => {
    set("soaCategories", profile.soaCategories.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const toggleArea = (area: GeographicArea) => {
    set(
      "geographicAreas",
      profile.geographicAreas.includes(area)
        ? profile.geographicAreas.filter((a) => a !== area)
        : [...profile.geographicAreas, area]
    );
  };

  const toggleSector = (sector: WorkSector) => {
    set(
      "workSectors",
      profile.workSectors.includes(sector)
        ? profile.workSectors.filter((s) => s !== sector)
        : [...profile.workSectors, sector]
    );
  };

  const addResource = () => {
    const newRes: CompanyAvailableResource = {
      id: newResourceId(),
      name: "",
      type: "mezzo",
      quantity: "1",
      availability: "disponibile",
    };
    set("availableResources", [...resources, newRes]);
  };

  const removeResource = (id: string) => {
    set(
      "availableResources",
      resources.filter((r) => r.id !== id)
    );
  };

  const updateResource = (id: string, patch: Partial<CompanyAvailableResource>) => {
    set(
      "availableResources",
      resources.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const hasProfile = !!profile.lastUpdated && !!profile.companyName;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-8">
      {/* Summary bar */}
      {hasProfile && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <Building2 className="w-4 h-4 text-brand-gold shrink-0" />
          <span className="text-xs font-bold text-white">{profile.companyName}</span>
          <span className="text-slate-600">—</span>
          <span className="text-xs text-slate-400">
            SOA: <span className="text-brand-gold font-bold">{profile.soaCategories.length}</span> categorie
          </span>
          <span className="text-slate-600">—</span>
          <span className="text-xs text-slate-400">
            Risorse: <span className="text-brand-gold font-bold">{resources.length}</span>
          </span>
          <span className="text-slate-600">—</span>
          <span className="text-xs text-slate-400">
            Aree: <span className="text-white">{profile.geographicAreas.join(", ") || "—"}</span>
          </span>
          <span className="text-slate-600">—</span>
          <span className="text-xs text-slate-400">
            Aggiornato:{" "}
            <span className="text-white">{new Date(profile.lastUpdated).toLocaleDateString("it-IT")}</span>
          </span>
        </div>
      )}

      {/* Anagrafica */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Anagrafica</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Ragione sociale
            </label>
            <input
              className={inputCls()}
              value={profile.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Es. Impresa Rossi SRL"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Partita IVA
            </label>
            <input
              className={inputCls()}
              value={profile.vatNumber}
              onChange={(e) => set("vatNumber", e.target.value)}
              placeholder="IT12345678901"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Forma giuridica
            </label>
            <input
              className={inputCls()}
              value={profile.legalForm}
              onChange={(e) => set("legalForm", e.target.value)}
              placeholder="Es. SRL, SPA, Individuale"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Anno fondazione
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.foundedYear === 0 ? "" : profile.foundedYear}
              onChange={(e) => set("foundedYear", e.target.value === "" ? 0 : parseInt(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Qualificazioni SOA */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Qualificazioni SOA</SectionTitle>
        <div className="space-y-2">
          {profile.soaCategories.map((cat, idx) => (
            <div
              key={idx}
              className="flex items-end gap-2 flex-wrap bg-neutral-950 border border-neutral-800 rounded-lg p-3"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-600">Categoria</label>
                <select
                  className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                  value={cat.code}
                  onChange={(e) => updateSOA(idx, { code: e.target.value as SOACategoryCode })}
                >
                  {SOA_CODES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-600">Classifica</label>
                <select
                  className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                  value={cat.classifica}
                  onChange={(e) => updateSOA(idx, { classifica: e.target.value as SOAClassifica })}
                >
                  {SOA_CLASSIFICHE.map((cl) => (
                    <option key={cl} value={cl}>{cl}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                <label className="text-[9px] uppercase tracking-wider text-slate-600">Scadenza attestazione</label>
                <input
                  type="date"
                  className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                  value={cat.expiryDate}
                  onChange={(e) => updateSOA(idx, { expiryDate: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeSOA(idx)}
                className="cursor-pointer p-1.5 rounded-lg border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                title="Rimuovi categoria"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Ente attestatore (SOA)
            </label>
            <input
              className={inputCls("max-w-sm")}
              value={profile.soaAttestatoreName ?? ""}
              onChange={(e) => set("soaAttestatoreName", e.target.value)}
              placeholder="Es. Cesi Multimedia, Ance SOA…"
            />
          </div>
          <button
            type="button"
            onClick={addSOA}
            className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Aggiungi categoria SOA
          </button>
        </div>
      </div>

      {/* Operatività */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Operatività</SectionTitle>
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Aree geografiche operative
          </label>
          <div className="flex flex-wrap gap-2">
            {GEOGRAPHIC_AREAS.map((area) => {
              const active = profile.geographicAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleArea(area)}
                  className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    active
                      ? "bg-brand-gold border-brand-gold text-black font-bold"
                      : "bg-neutral-950 border-neutral-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Settori lavorativi
          </label>
          <div className="flex flex-wrap gap-2">
            {WORK_SECTORS.map((sector) => {
              const active = profile.workSectors.includes(sector);
              return (
                <button
                  key={sector}
                  type="button"
                  onClick={() => toggleSector(sector)}
                  className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    active
                      ? "bg-brand-gold border-brand-gold text-black font-bold"
                      : "bg-neutral-950 border-neutral-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {sector}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Importo target min (€)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.targetImportMin === 0 ? "" : profile.targetImportMin}
              onChange={(e) => set("targetImportMin", e.target.value === "" ? 0 : parseFloat(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Importo target max (€)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.targetImportMax === 0 ? "" : profile.targetImportMax}
              onChange={(e) => set("targetImportMax", e.target.value === "" ? 0 : parseFloat(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Capacità operativa */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Capacità operativa</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Dipendenti
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.employeesCount === 0 ? "" : profile.employeesCount}
              onChange={(e) => set("employeesCount", e.target.value === "" ? 0 : parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Squadre attive
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.activeSquads === 0 ? "" : profile.activeSquads}
              onChange={(e) => set("activeSquads", e.target.value === "" ? 0 : parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Cantieri aperti
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.activeJobsites === 0 ? "" : profile.activeJobsites}
              onChange={(e) => set("activeJobsites", e.target.value === "" ? 0 : parseInt(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Mezzi e risorse disponibili */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Mezzi e risorse disponibili</SectionTitle>
        {resources.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nessuna risorsa registrata. Aggiungi mezzi, attrezzature o risorse tecniche disponibili per le gare.
          </p>
        ) : (
          <div className="space-y-2">
            {resources.map((res) => (
              <div
                key={res.id}
                className="flex items-end gap-2 flex-wrap bg-neutral-950 border border-neutral-800 rounded-lg p-3"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Nome risorsa</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={res.name}
                    onChange={(e) => updateResource(res.id, { name: e.target.value })}
                    placeholder="Es. Escavatore 35q"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Tipologia</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={res.type}
                    onChange={(e) => updateResource(res.id, { type: e.target.value as CompanyResourceType })}
                  >
                    {RESOURCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[80px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Quantità</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={res.quantity}
                    onChange={(e) => updateResource(res.id, { quantity: e.target.value })}
                    placeholder="1"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Disponibilità</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={res.availability}
                    onChange={(e) =>
                      updateResource(res.id, { availability: e.target.value as CompanyResourceAvailability })
                    }
                  >
                    {RESOURCE_AVAILABILITY.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Note operative</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={res.notes ?? ""}
                    onChange={(e) => updateResource(res.id, { notes: e.target.value || undefined })}
                    placeholder="Opzionale"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeResource(res.id)}
                  className="cursor-pointer p-1.5 rounded-lg border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                  title="Rimuovi risorsa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addResource}
          className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Aggiungi risorsa
        </button>
      </div>

      {/* Dati economici */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Dati economici</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Fatturato ultimo anno (€)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.lastYearRevenue === 0 ? "" : profile.lastYearRevenue}
              onChange={(e) => set("lastYearRevenue", e.target.value === "" ? 0 : parseFloat(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Margine medio storico (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.avgMarginPercent === 0 ? "" : profile.avgMarginPercent}
              onChange={(e) => set("avgMarginPercent", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              step="0.1"
            />
          </div>
        </div>
      </div>

      {/* Storico pricing & costi interni */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Storico pricing &amp; costi interni</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Ribasso medio storico offerto (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.avgRibassoPercent === 0 ? "" : profile.avgRibassoPercent}
              onChange={(e) => set("avgRibassoPercent", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              step="0.1"
              placeholder="12"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Tasso aggiudicazione storico (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.avgWinRatePercent === 0 ? "" : profile.avgWinRatePercent}
              onChange={(e) => set("avgWinRatePercent", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              step="0.1"
              placeholder="25"
            />
            <p className="text-[9px] text-slate-600 mt-1">Stima prudente basata sullo storico</p>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Margine minimo accettabile (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.minMargineAccettabile === 0 ? "" : profile.minMargineAccettabile}
              onChange={(e) => set("minMargineAccettabile", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              step="0.1"
              placeholder="8"
            />
            <p className="text-[9px] text-slate-600 mt-1">Sotto questa soglia il sistema lancia alert</p>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Incidenza spese generali (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.incidenzaSpeseGenerali === 0 ? "" : profile.incidenzaSpeseGenerali}
              onChange={(e) => set("incidenzaSpeseGenerali", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              step="0.1"
              placeholder="15"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Incidenza rischio medio (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.incidenzaRischioMedio === 0 ? "" : profile.incidenzaRischioMedio}
              onChange={(e) => set("incidenzaRischioMedio", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              step="0.1"
              placeholder="3"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Costo ora operaio interno (€/h)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.costoOraOperaio === 0 ? "" : profile.costoOraOperaio}
              onChange={(e) => set("costoOraOperaio", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              placeholder="28"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Costo ora caposquadra (€/h)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.costoOraCaposquadra === 0 ? "" : profile.costoOraCaposquadra}
              onChange={(e) => set("costoOraCaposquadra", e.target.value === "" ? 0 : parseFloat(e.target.value))}
              placeholder="38"
            />
          </div>
        </div>
      </div>

      {/* Note storico */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Note storico gare</SectionTitle>
        <textarea
          className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:border-brand-gold focus:outline-none px-3 py-2 w-full resize-none h-32"
          value={profile.historicalNotes}
          onChange={(e) => set("historicalNotes", e.target.value)}
          placeholder="Note libere su storico gare, esperienze passate, tipologie di lavori eseguiti…"
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-6 py-2.5 rounded-lg transition-colors"
        >
          Salva profilo
        </button>
        {saved && <span className="text-xs text-emerald-400 font-semibold">Profilo salvato ✓</span>}
      </div>
    </div>
  );
}
