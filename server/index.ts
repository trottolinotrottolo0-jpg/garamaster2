import express from "express";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { ChatRequestBody, ChatResponseBody } from "./chatTypes";
import { generateGaraMasterReply } from "./geminiChat";
import { safeGeneratePortfolioScore } from "./portfolioScore";
import type { PortfolioScoreRequestBody } from "./portfolioScoreTypes";
import { safeGenerateRtiAvvalimento } from "./rtiAvvalimento";
import type { RtiAvvalimentoRequestBody } from "./rtiAvvalimentoTypes";
import { generateGaraRoi } from "./garaRoi";
import type { GaraRoiRequestBody } from "./garaRoiTypes";
import { transcribeAudio } from "./transcribeAudio";
import { parseDisciplinarePdf } from "./parseDisciplinare";
import { parsePrezzarioPdf } from "./parsePrezzario";
import { generatePostGaraForensics } from "./postGaraForensics";
import { generateSoaGapForecast } from "./soaGapForecast";
import type { SoaGapForecastRequestBody } from "./soaGapForecastTypes";
import type { PostGaraForensicsRequestBody } from "./postGaraForensicsTypes";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "./resolveSupabaseUrl";
import { deepseekChatCompletion } from "./deepseekChat";
import { runAnacSync } from "./anacSync/runAnacSync";
import { fetchLastAnacSyncLog } from "./anacSync/syncToSupabase";
import { scheduleAnacSync } from "./anacSync/scheduleAnacSync";
import { resolveSupabaseServiceRoleKey } from "./resolveSupabaseUrl";
import { processGaraDocumento } from "./scouting/processGaraDocumento";
import { runDocumentSync } from "./scouting/runDocumentSync";
import { runScoutingEnrichment } from "./scouting/runScoutingEnrichment";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

async function createApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", async (_req, res) => {
    const anonKey = resolveSupabaseAnonKey();
    const supabaseUrl = resolveSupabaseUrl();
    const supabaseConfigured = Boolean(
      supabaseUrl &&
        anonKey &&
        anonKey !== "YOUR_SUPABASE_ANON_KEY" &&
        anonKey !== "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
    );

    let supabaseReachable = false;
    if (supabaseConfigured && supabaseUrl && anonKey) {
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
          headers: { apikey: anonKey },
        });
        supabaseReachable = response.ok;
      } catch {
        supabaseReachable = false;
      }
    }

    res.json({
      ok: true,
      port: PORT,
      appUrl: process.env.VITE_APP_URL ?? process.env.APP_URL ?? `http://localhost:${PORT}`,
      llm: Boolean(
        process.env.OPENROUTER_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim()
      ),
      supabase: supabaseConfigured,
      supabaseReachable,
    });
  });

  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };
      if (!audio?.trim()) {
        res.status(400).json({ error: "Audio mancante." });
        return;
      }
      const text = await transcribeAudio(audio, mimeType ?? "audio/webm");
      res.json({ text });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore durante la trascrizione.";
      console.error("[/api/transcribe]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/internal-llm", async (req, res) => {
    try {
      const body = req.body as {
        prompt?: string;
        systemInstruction?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
      };

      if (!body?.prompt?.trim()) {
        res.status(400).json({ error: "Prompt mancante." });
        return;
      }

      const result = await deepseekChatCompletion({
        prompt: body.prompt,
        systemInstruction: body.systemInstruction,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
      });

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore chiamata internal-llm.";
      console.error("[/api/internal-llm]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/portfolio-score", async (req, res) => {
    try {
      const body = req.body as PortfolioScoreRequestBody;
      if (!body?.tenders?.length) {
        res.status(400).json({ error: "Catalogo gare vuoto." });
        return;
      }
      const result = await safeGeneratePortfolioScore(body);
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore calcolo portfolio score.";
      console.error("[/api/portfolio-score]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/gara-roi", async (req, res) => {
    try {
      const body = req.body as GaraRoiRequestBody;
      if (!body?.tender?.cig) {
        res.status(400).json({ error: "Contesto gara mancante." });
        return;
      }
      if (!body.importoGaraEuro || body.importoGaraEuro <= 0) {
        res.status(400).json({ error: "Importo gara non valido." });
        return;
      }
      const result = await generateGaraRoi(body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore calcolo ROI gara.";
      console.error("[/api/gara-roi]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/rti-avvalimento", async (req, res) => {
    try {
      const body = req.body as RtiAvvalimentoRequestBody;
      if (!body?.tender?.cig) {
        res.status(400).json({ error: "Contesto gara (tender) mancante." });
        return;
      }
      const result = await safeGenerateRtiAvvalimento(body);
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore analisi RTI/Avvalimento.";
      console.error("[/api/rti-avvalimento]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/soa-gap-forecast", async (req, res) => {
    try {
      const body = req.body as SoaGapForecastRequestBody;
      if (!body?.profiloSoa) {
        res.status(400).json({ error: "Profilo SOA mancante." });
        return;
      }
      const result = await generateSoaGapForecast(body);
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore SOA Gap Forecasting.";
      console.error("[/api/soa-gap-forecast]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/post-gara-forensics", async (req, res) => {
    try {
      const body = req.body as PostGaraForensicsRequestBody;
      if (body.esito !== "vinta" && body.esito !== "persa") {
        res.status(400).json({ error: "Esito deve essere vinta o persa." });
        return;
      }
      if (!body.cig?.trim()) {
        res.status(400).json({ error: "CIG gara mancante." });
        return;
      }
      const result = await generatePostGaraForensics(body);
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore analisi post-gara.";
      console.error("[/api/post-gara-forensics]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/parse-disciplinare", async (req, res) => {
    try {
      const { pdfBase64, fileName, mimeType } = req.body as {
        pdfBase64?: string;
        fileName?: string;
        mimeType?: string;
      };

      if (!pdfBase64?.trim()) {
        res.status(400).json({ error: "PDF disciplinare mancante." });
        return;
      }

      const name = fileName?.trim() || "disciplinare.pdf";
      const result = await parseDisciplinarePdf({
        pdfBase64,
        fileName: name,
        mimeType: mimeType ?? "application/pdf",
      });

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore parser disciplinare.";
      console.error("[/api/parse-disciplinare]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/parse-prezzario", async (req, res) => {
    try {
      const { pdfBase64, fileName, mimeType } = req.body as {
        pdfBase64?: string;
        fileName?: string;
        mimeType?: string;
      };

      if (!pdfBase64?.trim()) {
        res.status(400).json({ error: "PDF prezzario mancante." });
        return;
      }

      const name = fileName?.trim() || "prezzario.pdf";
      const result = await parsePrezzarioPdf({
        pdfBase64,
        fileName: name,
        mimeType: mimeType ?? "application/pdf",
      });

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore parser prezzario.";
      console.error("[/api/parse-prezzario]", message);
      res.status(503).json({ error: message });
    }
  });

  app.get("/api/scouting/sync-status", async (_req, res) => {
    try {
      const last = resolveSupabaseServiceRoleKey()
        ? await fetchLastAnacSyncLog().catch(() => null)
        : null;
      res.json({
        configured: Boolean(resolveSupabaseServiceRoleKey()),
        demoExpand: process.env.ANAC_SYNC_USE_DEMO_EXPAND === "true",
        hasJsonUrl: Boolean(process.env.ANAC_SYNC_JSON_URL?.trim()),
        hasCkanPackage: Boolean(process.env.ANAC_CKAN_PACKAGE_ID?.trim()),
        intervalMinutes: Number(process.env.ANAC_SYNC_INTERVAL_MINUTES) || 0,
        last,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore status sync";
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/scouting/sync", async (req, res) => {
    try {
      const secret = process.env.ANAC_SYNC_SECRET?.trim();
      const headerSecret = req.headers["x-anac-sync-secret"];
      if (secret && headerSecret !== secret) {
        res.status(401).json({ error: "Secret sync non valido." });
        return;
      }

      const body = (req.body ?? {}) as {
        limit?: number;
        demoExpand?: boolean;
        enrichAfter?: boolean;
      };
      const result = await runAnacSync({
        limit: body.limit,
        preferDemoExpand: body.demoExpand,
      });

      if (body.enrichAfter !== false && resolveSupabaseServiceRoleKey()) {
        try {
          const enrich = await runScoutingEnrichment({ limit: 20 });
          result.warnings = [
            ...result.warnings,
            `Enrichment AI: ${enrich.enriched} gare arricchite.`,
            ...enrich.warnings.slice(0, 5),
          ];
        } catch (enrichErr) {
          const message = enrichErr instanceof Error ? enrichErr.message : "Enrichment fallito";
          result.warnings.push(`Enrichment AI: ${message}`);
        }
      }

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sync ANAC";
      console.error("[/api/scouting/sync]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/scouting/documents/upload", async (req, res) => {
    try {
      if (!resolveSupabaseServiceRoleKey()) {
        res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY mancante." });
        return;
      }
      const body = req.body as {
        gareAnacId?: string;
        pdfBase64?: string;
        fileName?: string;
        skipParse?: boolean;
      };
      if (!body.gareAnacId?.trim() || !body.pdfBase64?.trim()) {
        res.status(400).json({ error: "gareAnacId e pdfBase64 obbligatori." });
        return;
      }
      const result = await processGaraDocumento({
        gareAnacId: body.gareAnacId.trim(),
        pdfBase64: body.pdfBase64,
        fileName: body.fileName,
        skipParse: body.skipParse,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload documento fallito";
      console.error("[/api/scouting/documents/upload]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/scouting/documents/sync", async (req, res) => {
    try {
      if (!resolveSupabaseServiceRoleKey()) {
        res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY mancante." });
        return;
      }
      const body = (req.body ?? {}) as {
        limit?: number;
        gareAnacIds?: string[];
        force?: boolean;
      };
      const result = await runDocumentSync(body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync documenti fallito";
      console.error("[/api/scouting/documents/sync]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/scouting/documents/process", async (req, res) => {
    try {
      if (!resolveSupabaseServiceRoleKey()) {
        res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY mancante." });
        return;
      }
      const body = req.body as { gareAnacId?: string; sourceUrl?: string };
      if (!body.gareAnacId?.trim()) {
        res.status(400).json({ error: "gareAnacId obbligatorio." });
        return;
      }
      const result = await processGaraDocumento({
        gareAnacId: body.gareAnacId.trim(),
        sourceUrl: body.sourceUrl,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Process documento fallito";
      console.error("[/api/scouting/documents/process]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/scouting/enrich", async (req, res) => {
    try {
      if (!resolveSupabaseServiceRoleKey()) {
        res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY mancante." });
        return;
      }
      const body = (req.body ?? {}) as {
        limit?: number;
        gareAnacIds?: string[];
        userId?: string;
        force?: boolean;
      };
      const result = await runScoutingEnrichment(body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enrichment scouting fallito";
      console.error("[/api/scouting/enrich]", message);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const body = req.body as ChatRequestBody;

      if (!body?.message?.trim() && !body?.attachments?.length) {
        res.status(400).json({ error: "Messaggio o allegato richiesto." });
        return;
      }

      const isGeneral = body.chatMode === "general";
      if (!isGeneral && !body.tender?.cig) {
        res.status(400).json({ error: "Contesto gara (tender) mancante." });
        return;
      }

      const result = await generateGaraMasterReply(body);
      res.json(result satisfies ChatResponseBody);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore durante la generazione della risposta.";
      console.error("[/api/chat]", message);
      res.status(503).json({ error: message });
    }
  });

  if (isProd) {
    const distPath = path.join(root, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root,
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }

      try {
        const indexPath = path.join(root, "index.html");
        let template = await fs.readFile(indexPath, "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  }

  return app;
}

createApp()
  .then((app) => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Gara Master AI → http://localhost:${PORT}`);
      console.log(`Porta ufficiale: ${PORT} (usa solo npm run dev)`);
      if (!process.env.OPENROUTER_API_KEY?.trim() && !process.env.DEEPSEEK_API_KEY?.trim()) {
        console.warn(
          "⚠ OPENROUTER_API_KEY assente: configura OPENROUTER_API_KEY in .env.local per attivare l'LLM."
        );
      }
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
      if (!anonKey || anonKey === "YOUR_SUPABASE_ANON_KEY") {
        console.warn("⚠ Supabase non configurato: aggiungi VITE_SUPABASE_* in .env.local");
      } else {
        console.log("✓ Supabase anon/publishable configurato (.env / .env.local)");
      }
      if (resolveSupabaseServiceRoleKey()) {
        console.log("✓ Supabase service role configurata (sync ANAC)");
        scheduleAnacSync();
      } else {
        console.warn(
          "⚠ SUPABASE_SERVICE_ROLE_KEY assente: sync ANAC disabilitato fino a configurazione."
        );
      }
    });
  })
  .catch((err) => {
    console.error("Avvio server fallito:", err);
    process.exit(1);
  });
