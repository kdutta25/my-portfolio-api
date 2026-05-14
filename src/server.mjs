import cors from "cors";
import express from "express";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const FRAGMENTS = new Set([
  "site",
  "nav",
  "hero",
  "about",
  "skills",
  "aiModels",
  "support",
  "githubActivity",
  "experience",
  "education",
  "projects",
  "volunteering",
  "publications",
  "chatbot",
  "footer",
]);

/** @type {Record<string, Record<string, unknown>>} */
const localeCache = {};

function parseOrigins(raw) {
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [
    "http://localhost:4044",
    "http://127.0.0.1:4044",
    "https://www.kaustubhdutta.com",
    "https://kaustubhdutta.com",
  ];
}

async function loadLocale(lng) {
  if (!localeCache[lng]) {
    const raw = await readFile(join(DATA, "locales", `${lng}.json`), "utf8");
    localeCache[lng] = JSON.parse(raw);
  }
  return localeCache[lng];
}

const app = express();
app.use(
  cors({
    origin: parseOrigins(process.env.SITE_CONTENT_CORS_ORIGINS),
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/v1/site-content", async (_req, res) => {
  try {
    const [resumeRaw, linkedinRaw, enRaw, frRaw] = await Promise.all([
      readFile(join(DATA, "resume-corpus.json"), "utf8"),
      readFile(join(DATA, "linkedin-snapshot.json"), "utf8"),
      readFile(join(DATA, "locales", "en.json"), "utf8"),
      readFile(join(DATA, "locales", "fr.json"), "utf8"),
    ]);
    res.json({
      resumeCorpus: JSON.parse(resumeRaw),
      linkedinSnapshot: JSON.parse(linkedinRaw),
      locales: {
        en: JSON.parse(enRaw),
        fr: JSON.parse(frRaw),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read site content files" });
  }
});

app.get("/v1/fragments/:lng/:fragment", async (req, res) => {
  const { lng, fragment } = req.params;
  if (lng !== "en" && lng !== "fr") {
    res.status(400).json({ error: "Invalid language" });
    return;
  }
  if (!FRAGMENTS.has(fragment)) {
    res.status(404).json({ error: "Unknown fragment" });
    return;
  }
  try {
    const locale = await loadLocale(lng);
    if (!Object.prototype.hasOwnProperty.call(locale, fragment)) {
      res.status(404).json({ error: "Missing fragment in locale file" });
      return;
    }
    res.json({ fragment, data: locale[fragment] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read fragment" });
  }
});

app.get("/v1/knowledge/resume", async (_req, res) => {
  try {
    const raw = await readFile(join(DATA, "resume-corpus.json"), "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read resume corpus" });
  }
});

app.get("/v1/knowledge/linkedin", async (_req, res) => {
  try {
    const raw = await readFile(join(DATA, "linkedin-snapshot.json"), "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read LinkedIn snapshot" });
  }
});

const server = app.listen(PORT, () => {
  console.log(`my-portfolio-api listening on http://localhost:${PORT}`);
  console.log(`  GET /v1/fragments/:lng/:fragment`);
  console.log(`  GET /v1/knowledge/resume | /v1/knowledge/linkedin`);
  console.log(`  GET /v1/site-content (full bundle)`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use (e.g. another API instance).\n\n` +
        `  Use a free port:  PORT=3002 npm start\n` +
        `  Then set the portfolio URL to match (VITE_SITE_CONTENT_URL in my-portfolio).\n\n` +
        `  Or stop the other listener:\n` +
        `  lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n`,
    );
    process.exit(1);
  }
  throw err;
});
