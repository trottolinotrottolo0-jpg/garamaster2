import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { TenderDocument } from "../types";
import { 
  ShieldAlert, AlertTriangle, AlertCircle, Sparkles, HelpCircle, 
  ArrowRight, FileText, CheckCircle2, ChevronRight, MessageSquare, Copy 
} from "lucide-react";

interface VessatorieModalProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  onInjectClarification: (text: string) => void;
}

export const VessatorieModal: React.FC<VessatorieModalProps> = ({
  isOpen,
  onClose,
  tender,
  onInjectClarification,
}) => {
  if (!isOpen) return null;

  // Render dynamic legal analyses based on tender ID
  const isRoma = tender.id === "scuola-roma";

  const legalItems = isRoma ? [
    {
      title: "Requisito di Fatturato Specifico Sproporzionato",
      type: "Requisito di Partecipazione",
      clause: "Fatturato specifico nel triennio precedente non inferiore a € 2.000.000,00 su una gara da € 1.250.000,00.",
      articleRef: "Articolo 10 (Principio di tassatività) e Articolo 3 (Principio dell'accesso al mercato) del D.Lgs. 36/2023",
      severity: "high" as const,
      simpleExplanation: "Per legge, i requisiti finanziari devono essere proporzionati al valore del contratto. Richiedere quasi il doppio dell'importo di gara scoraggia la partecipazione delle piccole-medie imprese ed è contestabile alla stazione appaltante.",
      remedy: "Richiesta di rettifica formale del bando con parere di riduzione della soglia di fatturato o, in alternativa, utilizzo dell'Avvalimento con un'impresa ausiliaria.",
      clarificationText: `Oggetto: Richiesta chiarimenti e rettifica in autotutela - Gara: ${tender.title} - CIG: ${tender.cig}.
Spett.le Stazione Appaltante, con riferimento al requisito di fatturato specifico annuo richiesto pari a € 2.000.000,00, si evidenzia che tale importo appare palesemente sproporzionato rispetto all'importo a base d'asta di € 1.250.000,00, in palese violazione del Principio dell'Accesso al Mercato (Art. 3 D.Lgs. 36/2023) e del principio di proporzionalità (Art. 10). Si richiede pertanto di voler rettificare la soglia riducendola ad una misura non superiore all'importo annuo stimato dell'appalto.`
    },
    {
      title: "Penale per Mancato Uso Materiali Isolanti CAM",
      type: "Penale Contrattuale Vessatoria",
      clause: "Penalizzazione dello 0.5‰ in caso di mancato uso provato di materiali isolanti provvisti di etichetta ecologica CAM.",
      articleRef: "Articolo 60 e Articolo 113 del D.Lgs. 36/2023 (Divieto di doppia sanzione e proporzionalità)",
      severity: "medium" as const,
      simpleExplanation: "Dato che il bando assegna già fino a 15 punti qualitativi preferenziali (Criterio C) per l'uso di materiali ecologici CAM, l'applicazione di una penale contrattuale automatica per lo stesso aspetto costituisce una 'doppia penalizzazione' contraria alla buona fede nell'esecuzione.",
      remedy: "Chiarimento per far escludere o ridefinire l'applicazione della penale esclusivamente in caso di dolo o colpa grave accertati.",
      clarificationText: `Oggetto: Chiarimenti su penale CAM - CIG: ${tender.cig}.
In merito alla penale dello 0.5‰ per mancato uso di isolanti CAM, si fa presente che la conformità ai CAM è già ampiamente oggetto di valutazione dell'Offerta Tecnica (Criterio C - max 15 punti). L'introduzione di una penale giornaliera automatica configura una duplice sanzione sproporzionata. Si richiede di chiarire che tale penale non troverà applicazione qualora l'impresa offra soluzioni alternative equivalenti certificate.`
    },
    {
      title: "Cronoprogramma Rigido in Periodo Feriale (Agosto)",
      type: "Anomalia Operativa",
      clause: "Previsione di riqualificazione degli infissi in sole 3 settimane d'agosto.",
      articleRef: "Articolo 2 (Principio della fiducia e della lealtà reciproca) e Articolo 1 (Principio del risultato)",
      severity: "medium" as const,
      simpleExplanation: "Prevedere la quasi totalità delle lavorazioni complesse sugli infissi in concomitanza con la chiusura estiva dei fornitori e produttori nazionali (agosto) viola le regole di fattibilità tecnica e buona fede, aumentando esponenzialmente il rischio di penali oggettivamente non imputabili all'appaltatore.",
      remedy: "Sollecitare una proroga dei termini di esecuzione o la rimodulazione del cronoprogramma per escludere il computo di Agosto nei giorni utili.",
      clarificationText: `Oggetto: Richiesta estensione e flessibilità del Cronoprogramma - CIG: ${tender.cig}.
Si segnala che l'esecuzione delle lavorazioni sugli infissi nel solo periodo di agosto (3 settimane) coincide con il periodo di fermo ferie nazionale della filiera dei serramenti. Si richiede pertanto di poter rimodulare il cronoprogramma di gara concedendo un'estensione o specificando che i giorni di sospensione estiva non verranno computati ai fini del calcolo delle penali da ritardo.`
    }
  ] : [
    {
      title: "Penale Contrattuale Oltre i Limiti di Legge (1.5‰)",
      type: "Clausola Contra Legem",
      clause: "Penale in deroga al Codice pari all'1.5‰ al giorno per ritardi di ultimazione.",
      articleRef: "Articolo 113, comma 2 del D.Lgs. 36/2023 (Tetto Massimo delle Penali)",
      severity: "high" as const,
      simpleExplanation: "ATTENZIONE: Questa clausola è illegale! L'Art. 113 comma 2 del Nuovo Codice stabilisce tassativamente che le penali giornaliere non possono superare l'1‰ (uno per mille) e non possono essere inferiori allo 0.3‰. Un'aliquota dell'1.5‰ viola una norma imperativa di legge.",
      remedy: "Richiesta formale e immediata alla Stazione Appaltante di rettificare l'aliquota riducendola entro i limiti massimi stabiliti dall'Art. 113 (max 1.0‰).",
      clarificationText: `Oggetto: Segnalazione clausola difforme e richiesta rettifica - CIG: ${tender.cig}.
Si segnala che l'Articolo del Disciplinare che prevede una penale giornaliera pari all'1,5‰ (uno virgola cinque per mille) dell'importo contrattuale è palesemente in contrasto con l'art. 113, comma 2 del D.Lgs. 36/2023. Tale disposizione impone che le penali siano commisurate al ritardo in misura compresa tra lo 0,3‰ e l'1‰ giornaliero. Si richiede pertanto l'immediata rettifica del disciplinare in conformità al tetto di legge massimo del 1‰.`
    },
    {
      title: "Obbligo Discriminatorio di Campionatura Asfalto",
      type: "Requisito Discriminatorio",
      clause: "Obbligo di consegna campionatura fisica entro 5 giorni dalla chiusura delle offerte.",
      articleRef: "Articolo 10 (Tassatività ed esclusione fittizia) del D.Lgs. 36/2023",
      severity: "high" as const,
      simpleExplanation: "Richiedere campionature fisiche complesse prima della valutazione, specialmente in tempi estremamente ristretti (5 giorni), costituisce una barriera ingiustificata all'accesso e viola la parità di trattamento. La campionatura va chiesta di norma in fase esecutiva o solo all'aggiudicatario provvisorio.",
      remedy: "Diffida e richiesta di chiarimenti per posticipare la campionatura alla sola fase successiva all'aggiudicazione.",
      clarificationText: `Oggetto: Istanza di chiarimento su obbligo campionatura - CIG: ${tender.cig}.
Si rileva che l'obbligo di fornire una campionatura fisica dell'asfalto entro 5 giorni dal termine di presentazione delle offerte lede il principio di proporzionalità e massima partecipazione (Art. 3 D.Lgs. 36/2023). Si richiede di disporre che tale fornitura sia richiesta unicamente all'aggiudicatario in fase di stipula del contratto o esecuzione.`
    }
  ];

  const severityColor = (sev: "high" | "medium") => {
    if (sev === "high") return "border-red-900/50 bg-red-955 text-red-400";
    return "border-amber-905 bg-amber-955 text-amber-400";
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Testo chiarimento copiato negli appunti! Puoi usarlo sul portale o inviarlo in chat.");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-brand-gold" />
              </div>
              <div>
                <h3 className="text-white font-extrabold text-sm tracking-wider uppercase font-sans">
                  Scudo Legale GaraMaster (D.Lgs. 36/2023)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Rilevamento e neutralizzazione clausole abusive su: <strong className="text-brand-gold">{tender.title.slice(0, 45)}...</strong>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors cursor-pointer text-lg font-bold p-1 hover:bg-neutral-900 rounded"
              id="close-vessatorie-modal"
            >
              ✕
            </button>
          </div>

          {/* Simple Reassuring Staff Intro */}
          <div className="bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-850 space-y-1.5">
            <div className="flex items-center gap-1.5 text-brand-gold">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider">Linguaggio Semplificato per Imprese e Segreterie</span>
            </div>
            <p className="text-[11.5px] text-slate-300 leading-relaxed">
              Il nostro algoritmo di Intelligenza Artificiale ha confrontato il bando corrente con il <strong>Nuovo Codice Contratti Pubblici</strong>. Di seguito trovi le clausole contrattuali dannose o illegittime identificate e i moduli pronti all'uso per chiedere chiarimenti alla Stazione Appaltante a <strong>sforzo zero</strong>.
            </p>
          </div>

          {/* Legal items accordion/scroll list */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1.5 scrollbar-thin">
            {legalItems.map((item, index) => (
              <div 
                key={index} 
                className="bg-neutral-950 border border-neutral-850 rounded-xl overflow-hidden shadow-md"
              >
                {/* Header item */}
                <div className="p-3 bg-neutral-900/40 border-b border-neutral-850 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${severityColor(item.severity)}`}>
                      {item.severity === "high" ? "CRITICITÀ CONTESTABILE" : "ATTENZIONE"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {item.type}
                    </span>
                  </div>
                  <span className="text-[10px] text-brand-gold font-bold font-sans">
                    Ref: {item.articleRef.split(" (")[0]}
                  </span>
                </div>

                {/* Inner Body */}
                <div className="p-4 space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-white font-sans flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 text-brand-gold" />
                      {item.title}
                    </h4>
                    <p className="text-[10.5px] italic text-slate-400 bg-black p-2 rounded mt-1.5 border border-neutral-850 font-mono">
                      "{item.clause}"
                    </p>
                  </div>

                  {/* Clear non-jargon translation */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
                    <div className="bg-neutral-900/30 p-2.5 rounded-lg border border-neutral-850">
                      <span className="text-brand-gold font-bold block mb-1">Cosa significa nella pratica?</span>
                      <p className="text-slate-300 leading-relaxed font-sans text-[10.5px]">
                        {item.simpleExplanation}
                      </p>
                    </div>

                    <div className="bg-neutral-900/30 p-2.5 rounded-lg border border-neutral-850">
                      <span className="text-emerald-450 font-bold block mb-1">Come risolviamo (Sforzo Zero):</span>
                      <p className="text-slate-300 leading-relaxed font-sans text-[10.5px]">
                        {item.remedy}
                      </p>
                    </div>
                  </div>

                  {/* Ready to use draft code block */}
                  <div className="space-y-1.5">
                    <span className="text-[9.5px] font-sans font-extrabold text-slate-450 uppercase tracking-wider block">
                      Testo di Chiarimento Pronto per il Portale Gare / RUP:
                    </span>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={item.clarificationText}
                        className="w-full h-24 bg-black border border-neutral-850 p-2 text-[10.5px] text-slate-300 font-sans rounded-lg resize-none focus:outline-hidden focus:border-neutral-700 leading-relaxed"
                      />
                      <div className="absolute right-2 bottom-2 flex gap-1.5">
                        <button
                          onClick={() => handleCopy(item.clarificationText)}
                          className="bg-neutral-900 border border-neutral-800 hover:border-brand-gold hover:text-white p-1.5 rounded-md text-slate-400 cursor-pointer transition-colors"
                          title="Copia negli appunti"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            onInjectClarification(item.clarificationText);
                            onClose();
                          }}
                          className="bg-brand-gold text-black hover:bg-yellow-400 p-1.5 rounded-md font-bold text-[9.5px] font-sans flex items-center gap-1 cursor-pointer transition-colors"
                          title="Invia la bozza nell'editor di chat"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Usa in Chat</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer message */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-slate-450">
            <span>D.Lgs. 36/2023 • Commissione Europea • Linee Guida ANAC</span>
            <button
              onClick={onClose}
              className="cursor-pointer bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            >
              Chiudi Scudo Legale
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
