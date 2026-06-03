import { useState, useMemo, type ReactNode } from "react";
import { Plus, Trash2, Building2, FileText, Target } from "lucide-react";
import { SoaParserModal } from "./SoaParserModal";
import { FitStrategicProfileModal } from "./FitStrategicProfileModal";
import { FitPortfolioView } from "./FitPortfolioView";
import {
  clusterGareByFitStrategic,
  buildFitParticipationHistory,
} from "../lib/fitEngineStrategic";
import type {
  CompanyAvailableResource,
  CompanyProfile as CompanyProfileType,
  CompanyResourceAvailability,
  CompanyResourceType,
  CompanyActiveProject,
  CompanyActiveProjectStatus,
  CompanyOperationalPreferences,
  CompanyHistoricalMargin,
  CompanyProductivityData,
  CompanySimilarWork,
  ExecutionSpeed,
  MarginDataReliability,
  OperationalRiskTolerance,
  OrganizationalEfficiency,
  PreferredProjectDuration,
  PreferredTenderSize,
  PreferredWorkType,
  SaturationPreference,
  CompanyTenderHistoryItem,
  CompanyTenderOutcome,
  SOACategory,
  SOACategoryCode,
  SOAClassifica,
  SOAStructured,
  FitStrategicProfile,
  GeographicArea,
  WorkSector,
  HistoricalTender,
  TenderOutcome,
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

function newTenderHistoryId(): string {
  return `gara-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newSimilarWorkId(): string {
  return `lavoro-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newActiveProjectId(): string {
  return `cantiere-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newHistoricalMarginId(): string {
  return `margine-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MARGIN_RELIABILITY_OPTIONS: { value: MarginDataReliability; label: string }[] = [
  { value: "basso", label: "Basso" },
  { value: "medio", label: "Medio" },
  { value: "alto", label: "Alto" },
];

const ACTIVE_PROJECT_STATUSES: { value: CompanyActiveProjectStatus; label: string }[] = [
  { value: "avvio", label: "Avvio" },
  { value: "operativo", label: "Operativo" },
  { value: "quasi_completato", label: "Quasi completato" },
  { value: "sospeso", label: "Sospeso" },
];

const TENDER_OUTCOMES: { value: CompanyTenderOutcome; label: string }[] = [
  { value: "vinta", label: "Vinta" },
  { value: "persa", label: "Persa" },
  { value: "partecipata", label: "Partecipata" },
];

const TENDER_SIZE_OPTIONS: { value: PreferredTenderSize; label: string }[] = [
  { value: "piccole", label: "Piccole" },
  { value: "medie", label: "Medie" },
  { value: "grandi", label: "Grandi" },
];

const WORK_TYPE_OPTIONS: { value: PreferredWorkType; label: string }[] = [
  { value: "pubblici", label: "Pubblici" },
  { value: "privati", label: "Privati" },
  { value: "misti", label: "Misti" },
];

const RISK_TOLERANCE_OPTIONS: { value: OperationalRiskTolerance; label: string }[] = [
  { value: "basso", label: "Basso" },
  { value: "medio", label: "Medio" },
  { value: "alto", label: "Alto" },
];

const SATURATION_OPTIONS: { value: SaturationPreference; label: string }[] = [
  { value: "conservativa", label: "Conservativa" },
  { value: "bilanciata", label: "Bilanciata" },
  { value: "aggressiva", label: "Aggressiva" },
];

const PROJECT_DURATION_OPTIONS: { value: PreferredProjectDuration; label: string }[] = [
  { value: "breve", label: "Breve" },
  { value: "media", label: "Media" },
  { value: "lunga", label: "Lunga" },
];

const emptyOperationalPreferences: CompanyOperationalPreferences = {
  preferredCategories: [],
};

function normalizeOperationalPreferences(
  raw?: Partial<CompanyOperationalPreferences>
): CompanyOperationalPreferences {
  return {
    ...emptyOperationalPreferences,
    ...raw,
    preferredCategories: Array.isArray(raw?.preferredCategories) ? raw.preferredCategories : [],
  };
}

const EXECUTION_SPEED_OPTIONS: { value: ExecutionSpeed; label: string }[] = [
  { value: "lenta", label: "Lenta" },
  { value: "standard", label: "Standard" },
  { value: "veloce", label: "Veloce" },
];

const ORGANIZATIONAL_EFFICIENCY_OPTIONS: { value: OrganizationalEfficiency; label: string }[] = [
  { value: "bassa", label: "Bassa" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];

const emptyProductivityData: CompanyProductivityData = {};

function normalizeProductivityData(
  raw?: Partial<CompanyProductivityData>
): CompanyProductivityData {
  return { ...emptyProductivityData, ...raw };
}

const emptyProfile: CompanyProfileType = {
  companyName: "", vatNumber: "", legalForm: "", foundedYear: new Date().getFullYear(),
  soaCategories: [], soaAttestatoreName: "",
  geographicAreas: [], workSectors: [],
  targetImportMin: 0, targetImportMax: 0,
  employeesCount: 0, activeSquads: 0, activeJobsites: 0,
  oreGiornaliereSquadra: 8, rendimentoSquadrePercent: 100, giorniLavorativiSettimana: 5,
  durataMediaCantieriMesi: 6,
  availableResources: [],
  tenderHistory: [],
  similarWorks: [],
  activeProjects: [],
  operationalPreferences: emptyOperationalPreferences,
  productivityData: emptyProductivityData,
  historicalMargins: [],
  historicalTenders: [],
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
    tenderHistory: Array.isArray(raw.tenderHistory) ? raw.tenderHistory : [],
    similarWorks: Array.isArray(raw.similarWorks) ? raw.similarWorks : [],
    activeProjects: Array.isArray(raw.activeProjects) ? raw.activeProjects : [],
    operationalPreferences: normalizeOperationalPreferences(raw.operationalPreferences),
    productivityData: normalizeProductivityData(raw.productivityData),
    historicalMargins: Array.isArray(raw.historicalMargins) ? raw.historicalMargins : [],
    historicalTenders: Array.isArray(raw.historicalTenders) ? raw.historicalTenders : [],
    soaAttuale: raw.soaAttuale,
    storicoSOA: Array.isArray(raw.storicoSOA) ? raw.storicoSOA : [],
    fitStrategicProfile: raw.fitStrategicProfile,
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
  const [isSoaParserOpen, setIsSoaParserOpen] = useState(false);
  const [isFitModalOpen, setIsFitModalOpen] = useState(false);

  const resources = profile.availableResources ?? [];
  const tenderHistory = profile.tenderHistory ?? [];
  const similarWorks = profile.similarWorks ?? [];
  const activeProjects = profile.activeProjects ?? [];
  const historicalMargins = profile.historicalMargins ?? [];
  const historicalTenders = profile.historicalTenders ?? [];
  const fitPortfolioClusters = useMemo(() => {
    if (!profile.fitStrategicProfile) return [];
    const participation = buildFitParticipationHistory(
      profile.fitStrategicProfile,
      profile.historicalTenders,
      profile.tenderHistory
    );
    const tenders = participation.map((p) => p.tender);
    return clusterGareByFitStrategic(tenders, profile.fitStrategicProfile);
  }, [profile.fitStrategicProfile, profile.historicalTenders, profile.tenderHistory]);
  const prefs = profile.operationalPreferences ?? emptyOperationalPreferences;
  const preferredCategories = prefs.preferredCategories ?? [];
  const [saved, setSaved] = useState(false);
  const [showAddTender, setShowAddTender] = useState(false);
  const [newTender, setNewTender] = useState<Omit<HistoricalTender, "id">>({
    anno: new Date().getFullYear(),
    categoriaSOA: "",
    importoGara: 0,
    regioneGara: "",
    ribasso: 0,
    esito: "vinta",
    margineRealizzato: undefined,
    noteGara: "",
  });

  const addHistoricalTender = () => {
    const item: HistoricalTender = { ...newTender, id: crypto.randomUUID() };
    set("historicalTenders", [...historicalTenders, item]);
    setNewTender({
      anno: new Date().getFullYear(),
      categoriaSOA: "",
      importoGara: 0,
      regioneGara: "",
      ribasso: 0,
      esito: "vinta",
      margineRealizzato: undefined,
      noteGara: "",
    });
    setShowAddTender(false);
  };

  const removeHistoricalTender = (id: string) => {
    set("historicalTenders", historicalTenders.filter((t) => t.id !== id));
  };

  const setPrefs = (patch: Partial<CompanyOperationalPreferences>) => {
    set("operationalPreferences", { ...prefs, ...patch });
  };

  const togglePreferredCategory = (code: string) => {
    setPrefs({
      preferredCategories: preferredCategories.includes(code)
        ? preferredCategories.filter((c) => c !== code)
        : [...preferredCategories, code],
    });
  };

  const productivity = profile.productivityData ?? emptyProductivityData;

  const setProductivity = (patch: Partial<CompanyProductivityData>) => {
    set("productivityData", { ...productivity, ...patch });
  };

  const parseNullableNumber = (value: string): number | null =>
    value === "" ? null : parseFloat(value);

  const parseNullableInt = (value: string): number | null =>
    value === "" ? null : parseInt(value, 10);

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

  const handleSOAParsed = (soa: SOAStructured) => {
    const updated: CompanyProfileType = {
      ...profile,
      soaAttuale: soa,
      storicoSOA: [...(profile.storicoSOA ?? []), soa],
      lastUpdated: new Date().toISOString(),
    };
    setProfile(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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

  const addTenderHistory = () => {
    const item: CompanyTenderHistoryItem = {
      id: newTenderHistoryId(),
      title: "",
      ente: "",
      category: "",
      amount: null,
      year: new Date().getFullYear(),
      outcome: "partecipata",
    };
    set("tenderHistory", [...tenderHistory, item]);
  };

  const removeTenderHistory = (id: string) => {
    set(
      "tenderHistory",
      tenderHistory.filter((t) => t.id !== id)
    );
  };

  const updateTenderHistory = (id: string, patch: Partial<CompanyTenderHistoryItem>) => {
    set(
      "tenderHistory",
      tenderHistory.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  };

  const addSimilarWork = () => {
    const item: CompanySimilarWork = {
      id: newSimilarWorkId(),
      title: "",
      category: "",
      amount: null,
      location: "",
      year: new Date().getFullYear(),
    };
    set("similarWorks", [...similarWorks, item]);
  };

  const removeSimilarWork = (id: string) => {
    set(
      "similarWorks",
      similarWorks.filter((w) => w.id !== id)
    );
  };

  const updateSimilarWork = (id: string, patch: Partial<CompanySimilarWork>) => {
    set(
      "similarWorks",
      similarWorks.map((w) => (w.id === id ? { ...w, ...patch } : w))
    );
  };

  const addHistoricalMargin = () => {
    const item: CompanyHistoricalMargin = {
      id: newHistoricalMarginId(),
      category: "",
      averageMarginPercentage: null,
      analyzedProjectsCount: null,
      reliability: "medio",
    };
    set("historicalMargins", [...historicalMargins, item]);
  };

  const removeHistoricalMargin = (id: string) => {
    set(
      "historicalMargins",
      historicalMargins.filter((m) => m.id !== id)
    );
  };

  const updateHistoricalMargin = (id: string, patch: Partial<CompanyHistoricalMargin>) => {
    set(
      "historicalMargins",
      historicalMargins.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  const addActiveProject = () => {
    const item: CompanyActiveProject = {
      id: newActiveProjectId(),
      title: "",
      category: "",
      amount: null,
      location: "",
      status: "operativo",
    };
    set("activeProjects", [...activeProjects, item]);
  };

  const removeActiveProject = (id: string) => {
    set(
      "activeProjects",
      activeProjects.filter((p) => p.id !== id)
    );
  };

  const updateActiveProject = (id: string, patch: Partial<CompanyActiveProject>) => {
    set(
      "activeProjects",
      activeProjects.map((p) => (p.id === id ? { ...p, ...patch } : p))
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
            Gare: <span className="text-brand-gold font-bold">{tenderHistory.length}</span>
          </span>
          <span className="text-slate-600">—</span>
          <span className="text-xs text-slate-400">
            Lavori simili: <span className="text-brand-gold font-bold">{similarWorks.length}</span>
          </span>
          <span className="text-slate-600">—</span>
          <span className="text-xs text-slate-400">
            In corso: <span className="text-brand-gold font-bold">{activeProjects.length}</span>
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
          <button
            type="button"
            onClick={() => setIsSoaParserOpen(true)}
            className="cursor-pointer flex items-center gap-2 text-[10px] font-bold text-white bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded transition-colors"
          >
            <FileText className="w-3 h-3 text-brand-gold" />
            Importa SOA da PDF/Excel
          </button>
          {profile.soaAttuale && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mt-1">
              <div className="text-[9px] text-slate-500 mb-1">SOA importato (file)</div>
              <div className="text-[10px] text-white font-bold">{profile.soaAttuale.fileName}</div>
              <div className="text-[9px] text-emerald-400 mt-1">
                {profile.soaAttuale.totalCategorie} categorie · €
                {profile.soaAttuale.importoTotaleMassimoRealizzabile.toLocaleString("it-IT")} max
                realizzabile · {profile.soaAttuale.statoValidazione}
              </div>
              {(profile.storicoSOA?.length ?? 0) > 1 && (
                <div className="text-[8px] text-slate-500 mt-1">
                  Storico import: {profile.storicoSOA?.length} versioni
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Strategia / Fit */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Profilo strategico (Fit Engine)</SectionTitle>
        <p className="text-[10px] text-slate-500">
          Definisci nicchie e aree target per valutare l&apos;allineamento strategico delle gare in
          Bid/No-Bid.
        </p>
        <button
          type="button"
          onClick={() => setIsFitModalOpen(true)}
          className="cursor-pointer flex items-center gap-2 text-[10px] font-bold text-white bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded transition-colors"
        >
          <Target className="w-3 h-3 text-brand-gold" />
          Profilo strategico
        </button>
        {profile.fitStrategicProfile && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
            <div className="text-[9px] text-slate-500 mb-1">Profilo strategico attivo</div>
            <div className="text-[10px] text-white space-y-1">
              <div className="font-bold">
                Nicchie: {profile.fitStrategicProfile.strategiaAttiva.nicchieTarget.length}
              </div>
              <div className="font-bold">
                Aree: {profile.fitStrategicProfile.strategiaAttiva.areeTarget.length}
              </div>
              <div className="text-emerald-400">
                Target: €
                {(
                  profile.fitStrategicProfile.strategiaAttiva.importoTargetAnnuale / 1_000_000
                ).toFixed(1)}
                M · margine {profile.fitStrategicProfile.strategiaAttiva.margineTargetMedio}%
              </div>
            </div>
          </div>
        )}
        {profile.fitStrategicProfile && fitPortfolioClusters.length > 0 && (
          <FitPortfolioView clusters={fitPortfolioClusters} />
        )}
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

      {/* Preferenze operative */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Preferenze operative</SectionTitle>
        <p className="text-xs text-slate-500 -mt-1">
          Preferenze strategiche usate per orientare scoring e motori decisionali (configurazione non definitiva).
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              Preferenza lavori vicini alla sede
            </label>
            <div className="flex gap-2">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setPrefs({ prefersLocalProjects: val })}
                  className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    prefs.prefersLocalProjects === val
                      ? "bg-brand-gold border-brand-gold text-black font-bold"
                      : "bg-neutral-950 border-neutral-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {val ? "Sì" : "No"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              Disponibilità trasferte
            </label>
            <div className="flex gap-2">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setPrefs({ availableForTransfers: val })}
                  className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    prefs.availableForTransfers === val
                      ? "bg-brand-gold border-brand-gold text-black font-bold"
                      : "bg-neutral-950 border-neutral-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {val ? "Sì" : "No"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Dimensione gare preferita
            </label>
            <select
              className={inputCls()}
              value={prefs.preferredTenderSize ?? ""}
              onChange={(e) =>
                setPrefs({
                  preferredTenderSize: (e.target.value || undefined) as PreferredTenderSize | undefined,
                })
              }
            >
              <option value="">— Nessuna preferenza —</option>
              {TENDER_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Tipologia lavori
            </label>
            <select
              className={inputCls()}
              value={prefs.preferredWorkType ?? ""}
              onChange={(e) =>
                setPrefs({
                  preferredWorkType: (e.target.value || undefined) as PreferredWorkType | undefined,
                })
              }
            >
              <option value="">— Nessuna preferenza —</option>
              {WORK_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Tolleranza rischio operativo
            </label>
            <select
              className={inputCls()}
              value={prefs.operationalRiskTolerance ?? ""}
              onChange={(e) =>
                setPrefs({
                  operationalRiskTolerance: (e.target.value || undefined) as
                    | OperationalRiskTolerance
                    | undefined,
                })
              }
            >
              <option value="">— Nessuna preferenza —</option>
              {RISK_TOLERANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Tolleranza saturazione aziendale
            </label>
            <select
              className={inputCls()}
              value={prefs.saturationPreference ?? ""}
              onChange={(e) =>
                setPrefs({
                  saturationPreference: (e.target.value || undefined) as SaturationPreference | undefined,
                })
              }
            >
              <option value="">— Nessuna preferenza —</option>
              {SATURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Durata lavori preferita
            </label>
            <select
              className={inputCls("max-w-xs")}
              value={prefs.preferredProjectDuration ?? ""}
              onChange={(e) =>
                setPrefs({
                  preferredProjectDuration: (e.target.value || undefined) as
                    | PreferredProjectDuration
                    | undefined,
                })
              }
            >
              <option value="">— Nessuna preferenza —</option>
              {PROJECT_DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Categorie lavori preferite (SOA)
          </label>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-neutral-950 border border-neutral-800 rounded-lg">
            {SOA_CODES.map((code) => {
              const active = preferredCategories.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => togglePreferredCategory(code)}
                  className={`cursor-pointer text-[10px] px-2 py-1 rounded border transition-colors ${
                    active
                      ? "bg-brand-gold border-brand-gold text-black font-bold"
                      : "bg-neutral-900 border-neutral-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
          {preferredCategories.length > 0 && (
            <p className="text-[9px] text-slate-600 mt-1">
              Selezionate: {preferredCategories.join(", ")}
            </p>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
            Note strategiche
          </label>
          <textarea
            className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:border-brand-gold focus:outline-none px-3 py-2 w-full resize-none h-24"
            value={prefs.strategicNotes ?? ""}
            onChange={(e) => setPrefs({ strategicNotes: e.target.value || undefined })}
            placeholder="Es. focus su gare regionali, evitare lavori in quota elevata, priorità infrastrutture…"
          />
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
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Ore lavorative/giorno per squadra
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.oreGiornaliereSquadra}
              onChange={(e) =>
                set("oreGiornaliereSquadra", e.target.value === "" ? 8 : parseInt(e.target.value, 10))
              }
              step="1"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Rendimento medio squadre (%)
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.rendimentoSquadrePercent}
              onChange={(e) =>
                set("rendimentoSquadrePercent", e.target.value === "" ? 100 : parseInt(e.target.value, 10))
              }
              step="5"
            />
            <p className="text-[9px] text-slate-600 mt-1">100% = piena capacità teorica</p>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Giorni lavorativi/settimana
            </label>
            <input
              type="number"
              className={inputCls()}
              value={profile.giorniLavorativiSettimana}
              onChange={(e) =>
                set("giorniLavorativiSettimana", e.target.value === "" ? 5 : parseInt(e.target.value, 10))
              }
              step="1"
              min="1"
              max="7"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
            Durata media cantieri in corso (mesi)
          </label>
          <input
            type="number"
            className={inputCls("max-w-xs")}
            value={profile.durataMediaCantieriMesi}
            onChange={(e) =>
              set("durataMediaCantieriMesi", e.target.value === "" ? 6 : parseInt(e.target.value, 10))
            }
            step="1"
          />
          <p className="text-[9px] text-slate-600 mt-1">
            stima media durata residua dei cantieri aperti
          </p>
        </div>
      </div>

      {/* Dati di produttività interna */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Dati di produttività interna</SectionTitle>
        <p className="text-xs text-slate-500 -mt-1">
          Metriche operative per Capacity, Profitability e Pricing (configurazione non definitiva).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Produttività media squadre
            </label>
            <input
              type="number"
              className={inputCls()}
              value={
                productivity.averageTeamProductivity == null
                  ? ""
                  : productivity.averageTeamProductivity
              }
              onChange={(e) =>
                setProductivity({ averageTeamProductivity: parseNullableNumber(e.target.value) })
              }
              step="0.1"
              placeholder="Es. 85 (% o indice interno)"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Cantieri gestibili contemporaneamente
            </label>
            <input
              type="number"
              className={inputCls()}
              value={
                productivity.concurrentProjectsCapacity == null
                  ? ""
                  : productivity.concurrentProjectsCapacity
              }
              onChange={(e) =>
                setProductivity({ concurrentProjectsCapacity: parseNullableInt(e.target.value) })
              }
              placeholder="Es. 4"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Ore operative medie settimanali
            </label>
            <input
              type="number"
              className={inputCls()}
              value={
                productivity.averageWeeklyOperationalHours == null
                  ? ""
                  : productivity.averageWeeklyOperationalHours
              }
              onChange={(e) =>
                setProductivity({
                  averageWeeklyOperationalHours: parseNullableNumber(e.target.value),
                })
              }
              placeholder="Es. 42"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Capacità gestione gare contemporanee
            </label>
            <input
              type="number"
              className={inputCls()}
              value={
                productivity.concurrentTenderManagementCapacity == null
                  ? ""
                  : productivity.concurrentTenderManagementCapacity
              }
              onChange={(e) =>
                setProductivity({
                  concurrentTenderManagementCapacity: parseNullableInt(e.target.value),
                })
              }
              placeholder="Es. 3"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Velocità esecuzione stimata
            </label>
            <select
              className={inputCls()}
              value={productivity.executionSpeed ?? ""}
              onChange={(e) =>
                setProductivity({
                  executionSpeed: (e.target.value || undefined) as ExecutionSpeed | undefined,
                })
              }
            >
              <option value="">— Non specificata —</option>
              {EXECUTION_SPEED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Efficienza organizzativa
            </label>
            <select
              className={inputCls()}
              value={productivity.organizationalEfficiency ?? ""}
              onChange={(e) =>
                setProductivity({
                  organizationalEfficiency: (e.target.value || undefined) as
                    | OrganizationalEfficiency
                    | undefined,
                })
              }
            >
              <option value="">— Non specificata —</option>
              {ORGANIZATIONAL_EFFICIENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
            Note operative
          </label>
          <textarea
            className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:border-brand-gold focus:outline-none px-3 py-2 w-full resize-none h-24"
            value={productivity.operationalNotes ?? ""}
            onChange={(e) => setProductivity({ operationalNotes: e.target.value || undefined })}
            placeholder="Es. picchi stagionali Q2, vincoli su squadre specializzate…"
          />
        </div>
      </div>

      {/* Lavori in corso */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Lavori in corso</SectionTitle>
        {activeProjects.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nessun cantiere attivo registrato. Aggiungi i lavori in corso per valutare la capacità operativa residua.
          </p>
        ) : (
          <div className="space-y-2">
            {activeProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-end gap-2 flex-wrap bg-neutral-950 border border-neutral-800 rounded-lg p-3"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Progetto / Cantiere</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.title}
                    onChange={(e) => updateActiveProject(project.id, { title: e.target.value })}
                    placeholder="Es. Ristrutturazione palestra comunale"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Categoria lavori</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.category}
                    onChange={(e) => updateActiveProject(project.id, { category: e.target.value })}
                    placeholder="Es. OG1"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[110px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Importo (€)</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.amount === null ? "" : project.amount}
                    onChange={(e) =>
                      updateActiveProject(project.id, {
                        amount: e.target.value === "" ? null : parseFloat(e.target.value),
                      })
                    }
                    placeholder="500000"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Località</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.location}
                    onChange={(e) => updateActiveProject(project.id, { location: e.target.value })}
                    placeholder="Es. Torino"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Stato avanzamento</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.status}
                    onChange={(e) =>
                      updateActiveProject(project.id, { status: e.target.value as CompanyActiveProjectStatus })
                    }
                  >
                    {ACTIVE_PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[130px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Data inizio</label>
                  <input
                    type="date"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.startDate ?? ""}
                    onChange={(e) =>
                      updateActiveProject(project.id, { startDate: e.target.value || undefined })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[130px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Fine prevista</label>
                  <input
                    type="date"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.expectedEndDate ?? ""}
                    onChange={(e) =>
                      updateActiveProject(project.id, { expectedEndDate: e.target.value || undefined })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Note</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={project.notes ?? ""}
                    onChange={(e) => updateActiveProject(project.id, { notes: e.target.value || undefined })}
                    placeholder="Opzionale"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeActiveProject(project.id)}
                  className="cursor-pointer p-1.5 rounded-lg border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                  title="Rimuovi cantiere"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addActiveProject}
          className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Aggiungi lavoro in corso
        </button>
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

      {/* Margini storici per categoria */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Margini storici per categoria</SectionTitle>
        {historicalMargins.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nessun margine storico per categoria. Aggiungi i dati per alimentare Profitability, Pricing e ROI.
          </p>
        ) : (
          <div className="space-y-2">
            {historicalMargins.map((margin) => (
              <div
                key={margin.id}
                className="flex items-end gap-2 flex-wrap bg-neutral-950 border border-neutral-800 rounded-lg p-3"
              >
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Categoria</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={margin.category}
                    onChange={(e) => updateHistoricalMargin(margin.id, { category: e.target.value })}
                  >
                    <option value="">—</option>
                    {SOA_CODES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[90px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Margine medio (%)</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={margin.averageMarginPercentage === null ? "" : margin.averageMarginPercentage}
                    onChange={(e) =>
                      updateHistoricalMargin(margin.id, {
                        averageMarginPercentage: parseNullableNumber(e.target.value),
                      })
                    }
                    step="0.1"
                    placeholder="14"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[80px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">N. lavori</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={margin.analyzedProjectsCount == null ? "" : margin.analyzedProjectsCount}
                    onChange={(e) =>
                      updateHistoricalMargin(margin.id, {
                        analyzedProjectsCount: parseNullableInt(e.target.value),
                      })
                    }
                    placeholder="12"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Affidabilità</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={margin.reliability ?? ""}
                    onChange={(e) =>
                      updateHistoricalMargin(margin.id, {
                        reliability: (e.target.value || undefined) as MarginDataReliability | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {MARGIN_RELIABILITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Note</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={margin.notes ?? ""}
                    onChange={(e) =>
                      updateHistoricalMargin(margin.id, { notes: e.target.value || undefined })
                    }
                    placeholder="Opzionale"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeHistoricalMargin(margin.id)}
                  className="cursor-pointer p-1.5 rounded-lg border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                  title="Rimuovi margine"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addHistoricalMargin}
          className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Aggiungi margine per categoria
        </button>
      </div>

      {/* Storico gare */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Storico gare</SectionTitle>
        {tenderHistory.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nessuna gara nello storico. Aggiungi le gare passate per arricchire il profilo aziendale.
          </p>
        ) : (
          <div className="space-y-2">
            {tenderHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-end gap-2 flex-wrap bg-neutral-950 border border-neutral-800 rounded-lg p-3"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Titolo gara</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.title}
                    onChange={(e) => updateTenderHistory(item.id, { title: e.target.value })}
                    placeholder="Es. Riqualificazione scuola comunale"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Ente / Stazione appaltante</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.ente}
                    onChange={(e) => updateTenderHistory(item.id, { ente: e.target.value })}
                    placeholder="Es. Comune di Milano"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Categoria lavori</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.category}
                    onChange={(e) => updateTenderHistory(item.id, { category: e.target.value })}
                    placeholder="Es. OG1"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[110px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Importo (€)</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.amount === null ? "" : item.amount}
                    onChange={(e) =>
                      updateTenderHistory(item.id, {
                        amount: e.target.value === "" ? null : parseFloat(e.target.value),
                      })
                    }
                    placeholder="850000"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[72px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Anno</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.year === null ? "" : item.year}
                    onChange={(e) =>
                      updateTenderHistory(item.id, {
                        year: e.target.value === "" ? null : parseInt(e.target.value, 10),
                      })
                    }
                    placeholder="2024"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Esito</label>
                  <select
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.outcome}
                    onChange={(e) =>
                      updateTenderHistory(item.id, { outcome: e.target.value as CompanyTenderOutcome })
                    }
                  >
                    {TENDER_OUTCOMES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Note</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={item.notes ?? ""}
                    onChange={(e) => updateTenderHistory(item.id, { notes: e.target.value || undefined })}
                    placeholder="Opzionale"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeTenderHistory(item.id)}
                  className="cursor-pointer p-1.5 rounded-lg border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                  title="Rimuovi gara"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addTenderHistory}
          className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Aggiungi gara
        </button>
      </div>

      {/* Storico lavori simili */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Storico lavori simili</SectionTitle>
        {similarWorks.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nessun lavoro simile registrato. Aggiungi commesse passate rilevanti per le gare future.
          </p>
        ) : (
          <div className="space-y-2">
            {similarWorks.map((work) => (
              <div
                key={work.id}
                className="flex items-end gap-2 flex-wrap bg-neutral-950 border border-neutral-800 rounded-lg p-3"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Nome lavoro</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={work.title}
                    onChange={(e) => updateSimilarWork(work.id, { title: e.target.value })}
                    placeholder="Es. Riqualificazione edificio scolastico"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Categoria lavori</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={work.category}
                    onChange={(e) => updateSimilarWork(work.id, { category: e.target.value })}
                    placeholder="Es. OG1"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[110px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Importo (€)</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={work.amount === null ? "" : work.amount}
                    onChange={(e) =>
                      updateSimilarWork(work.id, {
                        amount: e.target.value === "" ? null : parseFloat(e.target.value),
                      })
                    }
                    placeholder="1200000"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[120px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Località / Regione</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={work.location}
                    onChange={(e) => updateSimilarWork(work.id, { location: e.target.value })}
                    placeholder="Es. Lombardia"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[72px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Anno</label>
                  <input
                    type="number"
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={work.year === null ? "" : work.year}
                    onChange={(e) =>
                      updateSimilarWork(work.id, {
                        year: e.target.value === "" ? null : parseInt(e.target.value, 10),
                      })
                    }
                    placeholder="2023"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                  <label className="text-[9px] uppercase tracking-wider text-slate-600">Descrizione breve</label>
                  <input
                    className="bg-neutral-900 border border-neutral-800 rounded text-xs text-white focus:border-brand-gold focus:outline-none px-2 py-1.5"
                    value={work.description ?? ""}
                    onChange={(e) => updateSimilarWork(work.id, { description: e.target.value || undefined })}
                    placeholder="Opzionale"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSimilarWork(work.id)}
                  className="cursor-pointer p-1.5 rounded-lg border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                  title="Rimuovi lavoro"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addSimilarWork}
          className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Aggiungi lavoro simile
        </button>
      </div>

      {/* Archivio gare passate */}
      <div className="bg-black border border-neutral-800 rounded-xl p-5 space-y-4">
        <SectionTitle>Archivio gare passate</SectionTitle>

        {historicalTenders.length === 0 && !showAddTender && (
          <p className="text-xs text-slate-500 italic">Nessuna gara archiviata.</p>
        )}

        <div className="space-y-2">
          {historicalTenders.map((t) => {
            const esitoCls =
              t.esito === "vinta" ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
              : t.esito === "persa" ? "bg-red-950/40 border-red-800 text-red-400"
              : t.esito === "in_corso" ? "bg-blue-950/40 border-blue-800 text-blue-400"
              : "bg-neutral-800 border-neutral-700 text-slate-400";
            return (
              <div key={t.id} className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-mono text-slate-400 shrink-0">{t.anno}</span>
                <span className="text-xs font-bold text-white">{t.categoriaSOA || "—"}</span>
                <span className="text-xs text-slate-300">€{(t.importoGara / 1000).toFixed(0)}k</span>
                <span className="text-xs text-slate-400">-{t.ribasso}%</span>
                {t.margineRealizzato !== undefined && (
                  <span className="text-xs text-emerald-400 font-mono">+{t.margineRealizzato}% marg.</span>
                )}
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono uppercase ${esitoCls}`}>
                  {t.esito.replace("_", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => removeHistoricalTender(t.id)}
                  className="cursor-pointer ml-auto p-1 rounded border border-neutral-700 hover:border-red-700 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {showAddTender && (
          <div className="bg-neutral-950 border border-neutral-700 rounded-xl p-4 space-y-3">
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Nuova gara passata</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Anno</label>
                <input
                  type="number"
                  className={inputCls()}
                  value={newTender.anno === 0 ? "" : newTender.anno}
                  onChange={(e) => setNewTender((p) => ({ ...p, anno: e.target.value === "" ? 0 : parseInt(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Categoria SOA</label>
                <input
                  className={inputCls()}
                  value={newTender.categoriaSOA}
                  onChange={(e) => setNewTender((p) => ({ ...p, categoriaSOA: e.target.value }))}
                  placeholder="es. OG1"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Importo gara (€)</label>
                <input
                  type="number"
                  className={inputCls()}
                  value={newTender.importoGara === 0 ? "" : newTender.importoGara}
                  onChange={(e) => setNewTender((p) => ({ ...p, importoGara: e.target.value === "" ? 0 : parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Regione</label>
                <input
                  className={inputCls()}
                  value={newTender.regioneGara}
                  onChange={(e) => setNewTender((p) => ({ ...p, regioneGara: e.target.value }))}
                  placeholder="es. Lombardia"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Ribasso offerto (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls()}
                  value={newTender.ribasso === 0 ? "" : newTender.ribasso}
                  onChange={(e) => setNewTender((p) => ({ ...p, ribasso: e.target.value === "" ? 0 : parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Esito</label>
                <select
                  className="bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white focus:border-brand-gold focus:outline-none px-3 py-2 w-full"
                  value={newTender.esito}
                  onChange={(e) => setNewTender((p) => ({ ...p, esito: e.target.value as TenderOutcome }))}
                >
                  <option value="vinta">Vinta</option>
                  <option value="persa">Persa</option>
                  <option value="ritirata">Ritirata</option>
                  <option value="in_corso">In corso</option>
                </select>
              </div>
              {newTender.esito === "vinta" && (
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Margine realizzato (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls()}
                    value={newTender.margineRealizzato === undefined || newTender.margineRealizzato === 0 ? "" : newTender.margineRealizzato}
                    onChange={(e) => setNewTender((p) => ({ ...p, margineRealizzato: e.target.value === "" ? undefined : parseFloat(e.target.value) }))}
                    placeholder="opzionale"
                  />
                </div>
              )}
              <div className={newTender.esito === "vinta" ? "" : "col-span-2"}>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Note (opzionale)</label>
                <textarea
                  className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:border-brand-gold focus:outline-none px-3 py-2 w-full resize-none h-16"
                  value={newTender.noteGara ?? ""}
                  onChange={(e) => setNewTender((p) => ({ ...p, noteGara: e.target.value.slice(0, 200) }))}
                  maxLength={200}
                  placeholder="max 200 caratteri"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addHistoricalTender}
                className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Aggiungi
              </button>
              <button
                type="button"
                onClick={() => setShowAddTender(false)}
                className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:border-neutral-500 text-slate-300 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {!showAddTender && (
          <button
            type="button"
            onClick={() => setShowAddTender(true)}
            className="cursor-pointer flex items-center gap-2 text-xs text-brand-gold border border-brand-gold/40 hover:border-brand-gold rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Aggiungi gara passata
          </button>
        )}
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

      <SoaParserModal
        isOpen={isSoaParserOpen}
        onClose={() => setIsSoaParserOpen(false)}
        onSOAParsed={handleSOAParsed}
        currentSOA={profile.soaAttuale}
        storicoSOA={profile.storicoSOA}
      />

      <FitStrategicProfileModal
        isOpen={isFitModalOpen}
        onClose={() => setIsFitModalOpen(false)}
        onSaveProfile={(fitProfile: FitStrategicProfile) => {
          const updated: CompanyProfileType = {
            ...profile,
            fitStrategicProfile: fitProfile,
            lastUpdated: new Date().toISOString(),
          };
          setProfile(updated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          setSaved(true);
        }}
        currentProfile={profile.fitStrategicProfile}
        historicalTenders={profile.historicalTenders}
        tenderHistory={profile.tenderHistory}
      />
    </div>
  );
}
