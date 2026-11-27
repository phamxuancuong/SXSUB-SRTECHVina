const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Cho phép lưu file JSON lớn khi import Excel nhiều ngày/nhiều PO
app.use(express.json({ limit: "25mb" }));

// Hỗ trợ dùng Render Persistent Disk qua biến môi trường DATA_DIR (mặc định là thư mục hiện tại)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");
const KPI_FILE = path.join(DATA_DIR, "kpi_data.json");

// Khởi tạo file JSON nếu chưa có
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

// Ghi file an toàn (ghi file tạm rồi rename để tránh hỏng JSON nếu mất điện/restart)
function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

// API đọc dữ liệu
app.get("/api/data", (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const kpi = JSON.parse(fs.readFileSync(KPI_FILE, "utf8"));
    res.json({ db, kpi });
  } catch (err) {
    res.status(500).json({ error: "Không đọc được file dữ liệu: " + err.message });
  }
});

// API lưu toàn bộ hoặc từng phần (db / kpi)
app.post("/api/save", (req, res) => {
  try {
    const { db, kpi } = req.body || {};
    if (db && typeof db === "object") {
      writeJsonAtomic(DATA_FILE, db);
    }
    if (kpi && typeof kpi === "object") {
      writeJsonAtomic(KPI_FILE, kpi);
    }
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Lỗi lưu dữ liệu: " + err.message });
  }
});

// Phục vụ file tĩnh (index.html, logo.jpg, v.v.)
app.use(express.static(__dirname));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`SR TECH VINA server running at http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});