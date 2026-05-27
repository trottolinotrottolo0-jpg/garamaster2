import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATTING_ADDENDUM = `

## FORMATTAZIONE RISPOSTE IN CHAT
- Rispondi sempre in italiano professionale da consulente appalti edili.
- Usa **grassetto** per concetti chiave e *corsivo* per note legali o termini latini.
- Usa ### per i titoli di sezione e elenchi puntati con * oppure numerati.
- NON usare linee orizzontali (---), hashtag isolati o simboli markdown non necessari.
- Mantieni i marker di stato: [CONFORME], [NON CONFORME], [ATTENZIONE / RISCHIO CONTRATTUALE].
`;

let cachedPrompt: string | null = null;

export function loadSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;

  const promptPath = path.resolve(
    __dirname,
    "../scripts/system_instructions_procurement.md"
  );
  const base = fs.readFileSync(promptPath, "utf-8");
  cachedPrompt = base + FORMATTING_ADDENDUM;
  return cachedPrompt;
}
