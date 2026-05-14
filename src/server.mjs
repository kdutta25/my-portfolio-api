import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const PORT = parseInt(process.env.PORT ?? "3001", 10);

/** e.g. `/api` when a reverse proxy serves this app under a path prefix. Portfolio base URL must include this prefix. */
function normalizeApiMountPath() {
  const raw = (process.env.API_BASE_PATH ?? "").trim();
  if (!raw || raw === "/") return "";
  const p = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "");
  return p || "";
}

const API_MOUNT = normalizeApiMountPath();

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

/** Log mismatches between FRAGMENTS and locale files (missing keys → GET 404). */
function validateLocaleFragmentKeys() {
  const issues = [];
  for (const lng of ["en", "fr"]) {
    const path = join(DATA, "locales", `${lng}.json`);
    let obj;
    try {
      obj = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      issues.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const key of FRAGMENTS) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        issues.push(`${lng}.json: missing top-level key "${key}" (GET /v1/fragments/${lng}/${key} → 404)`);
      }
    }
  }
  if (issues.length) {
    console.error(
      "[locale] Fragment / locale mismatch — fix data/locales before deploying:\n  - " +
        issues.join("\n  - "),
    );
  }
}

validateLocaleFragmentKeys();

const app = express();
app.use(
  cors({
    origin: parseOrigins(process.env.SITE_CONTENT_CORS_ORIGINS),
  }),
);

const api = express.Router();

api.get("/", (_req, res) => {
  res.json({
    service: "my-portfolio-api",
    mount: API_MOUNT || "/",
    health: `${API_MOUNT || ""}/health`,
    fragments: `${API_MOUNT || ""}/v1/fragments/:lng/:fragment`,
    knowledge: [
      `${API_MOUNT || ""}/v1/knowledge/resume`,
      `${API_MOUNT || ""}/v1/knowledge/linkedin`,
    ],
    siteContent: `${API_MOUNT || ""}/v1/site-content`,
  });
});

api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

api.get("/v1/site-content", async (_req, res) => {
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

api.get("/v1/fragments/:lng/:fragment", async (req, res) => {
  const { lng, fragment } = req.params;
  if (lng !== "en" && lng !== "fr") {
    res.status(400).json({ error: "Invalid language" });
    return;
  }
  if (!FRAGMENTS.has(fragment)) {
    res.status(404).json({
      error: "Unknown fragment",
      reason: "unknown_fragment",
      lng,
      fragment,
    });
    return;
  }
  try {
    const locale = await loadLocale(lng);
    if (!Object.prototype.hasOwnProperty.call(locale, fragment)) {
      res.status(404).json({
        error: "Missing fragment in locale file",
        reason: "missing_locale_key",
        lng,
        fragment,
        hint: `Add a "${fragment}" object to data/locales/${lng}.json (same top-level keys as en/fr peers).`,
      });
      return;
    }
    res.json({ fragment, data: locale[fragment] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read fragment" });
  }
});

api.get("/v1/knowledge/resume", async (_req, res) => {
  try {
    const raw = await readFile(join(DATA, "resume-corpus.json"), "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read resume corpus" });
  }
});

api.get("/v1/knowledge/linkedin", async (_req, res) => {
  try {
    const raw = await readFile(join(DATA, "linkedin-snapshot.json"), "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read LinkedIn snapshot" });
  }
});

if (API_MOUNT) {
  app.use(API_MOUNT, api);
} else {
  app.use(api);
}

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
    mount: API_MOUNT || "/",
    hint:
      "If you use a reverse proxy path prefix, set API_BASE_PATH (e.g. /api) and VITE_CONTENT_API_BASE_URL must include that prefix. Otherwise expect /health, /v1/fragments/..., /v1/knowledge/*, /v1/site-content at the server root. The portfolio static site is not this API.",
  });
});

const server = app.listen(PORT, () => {
  const mountLabel = API_MOUNT || "(root)";
  console.log(`my-portfolio-api listening on http://localhost:${PORT}`);
  console.log(`  Routes mounted at: ${mountLabel}`);
  console.log(`  GET ${API_MOUNT || ""}/v1/fragments/:lng/:fragment`);
  console.log(`  GET ${API_MOUNT || ""}/v1/knowledge/resume | ${API_MOUNT || ""}/v1/knowledge/linkedin`);
  console.log(`  GET ${API_MOUNT || ""}/v1/site-content (full bundle)`);
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
