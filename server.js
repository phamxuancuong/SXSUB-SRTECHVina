const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "25mb" }));

const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");
const KPI_FILE = path.join(DATA_DIR, "kpi_data.json");

const GH_TOKEN = process.env.GITHUB_TOKEN || "";
const GH_REPO = process.env.GITHUB_REPO || "phamxuancuong/SXSUB-SRTECHVina";
const GH_BRANCH = process.env.GITHUB_BRANCH || "main";

function ensureJsonFile(filePath, defaultObj) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultObj, null, 2), "utf8");
  }
}

ensureJsonFile(DATA_FILE, {
  ontime: [],
  ckd_pcell: [],
  ml_svc: [],
  po_ontime: [],
  po_ckd_pcell: [],
  po_svc: []
});

ensureJsonFile(KPI_FILE, {
  version: 1,
  sections: {
    FRONT: [],
    PRE_FRONT: [],
    BGL_SUB_UB: [],
    OTHER: [],
    SUB: [],
    MOLDING: [],
    G_TOTAL: []
  },
  targets: {
    sub_week: 28,
    total_week: 30,
    next_week_target: "30"
  }
});

function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

async function pushFileToGitHub(repoFilePath, jsonPayload, commitMessage) {
  if (!GH_TOKEN || !GH_REPO) return { synced: false, reason: "Chưa cấu hình GITHUB_TOKEN" };

  const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${repoFilePath}`;
  const headers = {
    "Authorization": `Bearer ${GH_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "sr-tech-sub-server"
  };

  let sha = undefined;
  const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(GH_BRANCH)}`, { headers });
  if (getResp.ok) {
    const currentMeta = await getResp.json();
    sha = currentMeta.sha;
  }

  const contentBase64 = Buffer.from(JSON.stringify(jsonPayload, null, 2), "utf8").toString("base64");
  const body = {
    message: commitMessage,
    content: contentBase64,
    branch: GH_BRANCH
  };
  if (sha) body.sha = sha;

  const putResp = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(body)
  });

  if (!putResp.ok) {
    const errText = await putResp.text();
    throw new Error(`GitHub API ${putResp.status}: ${errText}`);
  }
  return { synced: true };
}

app.get("/api/data", (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const kpi = JSON.parse(fs.readFileSync(KPI_FILE, "utf8"));
    res.json({ db, kpi });
  } catch (err) {
    res.status(500).json({ error: "Không đọc được file dữ liệu: " + err.message });
  }
});

app.post("/api/save", async (req, res) => {
  try {
    const { db, kpi } = req.body || {};
    if (db && typeof db === "object") {
      writeJsonAtomic(DATA_FILE, db);
    }
    if (kpi && typeof kpi === "object") {
      writeJsonAtomic(KPI_FILE, kpi);
    }

    const warnings = [];
    if (GH_TOKEN) {
      if (db && typeof db === "object") {
        try {
          await pushFileToGitHub("data.json", db, "Update data.json from web app");
        } catch (e) {
          warnings.push("data.json: " + e.message);
        }
      }
      if (kpi && typeof kpi === "object") {
        try {
          await pushFileToGitHub("kpi_data.json", kpi, "Update kpi_data.json from web app");
        } catch (e) {
          warnings.push("kpi_data.json: " + e.message);
        }
      }
    }

    res.json({
      ok: true,
      githubSynced: Boolean(GH_TOKEN) && warnings.length === 0,
      warnings,
      savedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: "Lỗi lưu dữ liệu: " + err.message });
  }
});

app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`SR TECH VINA server running at http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`GitHub sync enabled: ${Boolean(GH_TOKEN)}`);
});
