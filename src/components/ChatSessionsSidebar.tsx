import { MessageSquarePlus, MessagesSquare, Trash2 } from "lucide-react";
import type { ChatSession } from "../types/chat";

type ChatSessionsSidebarProps = {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelect: (id: string) => void;
  onNewGeneral: () => void;
  onNewTender: () => void;
  onDelete: (id: string) => void;
};

export function ChatSessionsSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewGeneral,
  onNewTender,
  onDelete,
}: ChatSessionsSidebarProps) {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <aside className="w-56 shrink-0 flex flex-col border border-neutral-800 rounded-2xl bg-neutral-950 overflow-hidden h-full">
      <div className="p-3 border-b border-neutral-800 space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
          Le tue chat
        </p>
        <button
          type="button"
          onClick={onNewGeneral}
          className="cursor-pointer w-full flex items-center gap-2 rounded-lg bg-brand-gold text-black text-[11px] font-bold px-3 py-2 hover:bg-yellow-400 transition-colors"
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" />
          Nuova chat libera
        </button>
        <button
          type="button"
          onClick={onNewTender}
          className="cursor-pointer w-full flex items-center gap-2 rounded-lg border border-neutral-700 text-slate-200 text-[11px] font-semibold px-3 py-2 hover:border-brand-gold hover:text-white transition-colors"
        >
          <MessagesSquare className="w-4 h-4 shrink-0 text-brand-gold" />
          Chat su gara corrente
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
        {sorted.map((session) => (
          <li key={session.id}>
            <div
              className={`group flex items-start gap-1 rounded-lg border transition-colors ${
                session.id === activeSessionId
                  ? "border-brand-gold/60 bg-neutral-900"
                  : "border-transparent hover:border-neutral-700 hover:bg-neutral-900/60"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                className="cursor-pointer flex-1 text-left px-2.5 py-2 min-w-0"
              >
                <p className="text-[11px] font-semibold text-white truncate">{session.title}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  {session.mode === "general"
                    ? "Chat libera"
                    : session.mode === "offer_preparation"
                      ? "Preparazione offerta"
                      : "Gara collegata"}
                </p>
              </button>
              {sessions.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDelete(session.id)}
                  className="cursor-pointer p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Elimina chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
