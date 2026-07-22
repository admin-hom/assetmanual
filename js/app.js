import { db, auth } from "./firebase-config.js";
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc,
  onSnapshot, query, orderBy, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ---------- constants ---------- */
const SATKER = [
  { name: "Pendis", code: "PND" },
  { name: "Pakis", code: "PKS" },
  { name: "Sekjen", code: "SJN" },
  { name: "Bimas", code: "BMS" }
];

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];

/* ---------- state ---------- */
let categories = [];
let types = [];
let locations = [];
let assets = [];
let currentUser = null;
let selectedForPrint = new Set();

/* ---------- helpers ---------- */
// Consonant-skeleton abbreviation, ala kode bandara/saham: huruf pertama +
// konsonan berikutnya (vokal di-skip), diisi huruf apa aja kalau kurang.
function consonantSkeleton(word, len) {
  const w = (word || "").replace(/[^a-zA-Z]/g, "");
  if (!w) return "X".repeat(len);
  const vowels = "AEIOU";
  let result = w[0].toUpperCase();
  for (let i = 1; i < w.length && result.length < len; i++) {
    const ch = w[i].toUpperCase();
    if (!vowels.includes(ch)) result += ch;
  }
  for (let i = 1; i < w.length && result.length < len; i++) {
    const ch = w[i].toUpperCase();
    result += ch;
  }
  return (result + "XXX").slice(0, len);
}

function genCode(name, existingCodes) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  const candidates = [];

  if (words.length >= 3) {
    candidates.push(words.slice(0, 3).map(w => w[0].toUpperCase()).join(""));
  } else if (words.length === 2) {
    candidates.push((words[0][0] + consonantSkeleton(words[1], 2)).toUpperCase());
    candidates.push((words[0][0] + words[1].replace(/[^a-zA-Z]/g, "").slice(0, 2)).toUpperCase());
  }
  candidates.push(consonantSkeleton(words[0] || name, 3));

  for (const c of candidates) {
    if (c && c.length === 3 && !existingCodes.includes(c)) return c;
  }

  // Tabrakan: tetep 3 huruf kalau bisa, coba geser skeleton-nya
  const base = (words[0] || name || "X").replace(/[^a-zA-Z]/g, "").toUpperCase();
  for (let offset = 1; offset < base.length; offset++) {
    const shifted = (base[0] + base.slice(offset)).slice(0, 3).padEnd(3, "X");
    if (!existingCodes.includes(shifted)) return shifted;
  }

  // Fallback terakhir: 2 huruf + angka (jarang kejadian)
  let n = 2;
  let code = candidates[0].slice(0, 2) + n;
  while (existingCodes.includes(code) && n < 20) {
    n++;
    code = candidates[0].slice(0, 2) + n;
  }
  return code;
}

// Kompres foto jadi thumbnail base64 kecil biar aman disimpen langsung di Firestore
// (nggak butuh Firebase Storage / upgrade billing).
function compressImage(file, maxDim = 320, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function el(id) { return document.getElementById(id); }

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el("view-" + name).classList.add("active");
  const tab = document.querySelector(`.tab[data-view="${name}"]`);
  if (tab) tab.classList.add("active");
}

function fillMonthSelect(select) {
  select.innerHTML = MONTHS.map(m => `<option value="${m}">${m}</option>`).join("");
}

/* ---------- auth ---------- */
function initAuth() {
  el("btn-login").addEventListener("click", () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
      alert("Gagal login: " + err.message);
    });
  });
  el("btn-logout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, user => {
    currentUser = user;
    const loggedIn = !!user;
    el("btn-login").classList.toggle("hidden", loggedIn);
    el("btn-logout").classList.toggle("hidden", !loggedIn);
    el("user-badge").classList.toggle("hidden", !loggedIn);
    if (user) {
      el("user-badge").textContent = user.email + " · UID: " + user.uid;
    }
    document.querySelectorAll(".auth-only").forEach(n => n.classList.toggle("locked", !loggedIn));
  });
}

/* ---------- live data ---------- */
function initListeners() {
  onSnapshot(query(collection(db, "categories"), orderBy("name")), snap => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategories();
    fillCategorySelects();
  });

  onSnapshot(query(collection(db, "types"), orderBy("name")), snap => {
    types = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTypes();
    fillTypeSelect();
  });

  onSnapshot(query(collection(db, "locations"), orderBy("name")), snap => {
    locations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLocations();
    fillLocationSelects();
  });

  onSnapshot(query(collection(db, "assets"), orderBy("seq", "desc")), snap => {
    assets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAssetList();
  });
}

/* ---------- categories ---------- */
function renderCategories() {
  el("list-categories").innerHTML = categories.map(c => `
    <li>
      <span class="code">${c.code}</span>
      <span class="name">${c.name}</span>
      <button class="auth-only mini danger" data-del-cat="${c.id}">Hapus</button>
    </li>`).join("") || `<li class="empty">Belum ada kategori</li>`;

  document.querySelectorAll("[data-del-cat]").forEach(btn => {
    btn.onclick = () => deleteCategory(btn.dataset.delCat);
  });
}

async function addCategory(name) {
  if (!currentUser) return alert("Login dulu untuk menambah kategori.");
  const existing = categories.map(c => c.code);
  const code = genCode(name, existing);
  await addDoc(collection(db, "categories"), { name, code });
}

async function deleteCategory(id) {
  if (!currentUser) return;
  if (types.some(t => t.categoryId === id)) {
    return alert("Kategori ini masih punya Jenis Barang di dalamnya. Hapus Jenis-nya dulu.");
  }
  if (!confirm("Hapus kategori ini?")) return;
  await deleteDoc(doc(db, "categories", id));
}

function fillCategorySelects() {
  const opts = `<option value="">-- pilih kategori --</option>` +
    categories.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join("");
  el("gen-category").innerHTML = opts;
  el("type-category").innerHTML = opts;
}

/* ---------- types (jenis barang) ---------- */
function renderTypes() {
  el("list-types").innerHTML = types.map(t => {
    const cat = categories.find(c => c.id === t.categoryId);
    return `<li>
      <span class="code">${t.code}</span>
      <span class="name">${t.name}</span>
      <span class="sub">↳ ${cat ? cat.name : "?"}</span>
      <button class="auth-only mini danger" data-del-type="${t.id}">Hapus</button>
    </li>`;
  }).join("") || `<li class="empty">Belum ada jenis barang</li>`;

  document.querySelectorAll("[data-del-type]").forEach(btn => {
    btn.onclick = () => deleteType(btn.dataset.delType);
  });
}

async function addType(name, categoryId) {
  if (!currentUser) return alert("Login dulu untuk menambah jenis barang.");
  if (!categoryId) return alert("Pilih kategori dulu.");
  const existing = types.map(t => t.code);
  const code = genCode(name, existing);
  await addDoc(collection(db, "types"), { name, code, categoryId });
}

async function deleteType(id) {
  if (!currentUser) return;
  if (!confirm("Hapus jenis barang ini?")) return;
  await deleteDoc(doc(db, "types", id));
}

function fillTypeSelect() {
  const catId = el("gen-category").value;
  const filtered = types.filter(t => t.categoryId === catId);
  el("gen-type").innerHTML = filtered.length
    ? filtered.map(t => `<option value="${t.id}">${t.name} (${t.code})</option>`).join("")
    : `<option value="">-- pilih kategori dulu --</option>`;
}

/* ---------- locations ---------- */
function renderLocations() {
  el("list-locations").innerHTML = locations.map(l => `
    <li>
      <span class="code">${l.code}</span>
      <span class="name">${l.name}</span>
      <button class="auth-only mini danger" data-del-loc="${l.id}">Hapus</button>
    </li>`).join("") || `<li class="empty">Belum ada lokasi</li>`;

  document.querySelectorAll("[data-del-loc]").forEach(btn => {
    btn.onclick = () => deleteLocation(btn.dataset.delLoc);
  });
}

async function addLocation(name) {
  if (!currentUser) return alert("Login dulu untuk menambah lokasi.");
  const existing = locations.map(l => l.code);
  const code = genCode(name, existing);
  await addDoc(collection(db, "locations"), { name, code });
}

async function deleteLocation(id) {
  if (!currentUser) return;
  if (!confirm("Hapus lokasi ini?")) return;
  await deleteDoc(doc(db, "locations", id));
}

function fillLocationSelects() {
  el("gen-location").innerHTML = `<option value="">-- pilih lokasi --</option>` +
    locations.map(l => `<option value="${l.id}">${l.name} (${l.code})</option>`).join("");
}

function fillSatkerSelect() {
  el("gen-satker").innerHTML = SATKER.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join("");
}

/* ---------- generate asset ---------- */
async function generateAsset(formData) {
  if (!currentUser) return alert("Login dulu untuk generate aset.");

  const cat = categories.find(c => c.id === formData.categoryId);
  const type = types.find(t => t.id === formData.typeId);
  const loc = locations.find(l => l.id === formData.locationId);
  const satker = SATKER.find(s => s.code === formData.satkerCode);

  if (!cat || !type || !loc || !satker) return alert("Lengkapi semua field dulu.");

  const counterRef = doc(db, "counters", "global");
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = snap.exists() ? (snap.data().seq || 0) + 1 : 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });

  const seqStr = pad3(seq);
  const displayId = `AST-${seqStr}/BMN/${satker.code}/MNL/${cat.code}/${type.code}/${loc.code}/${formData.month}/${formData.year}`;
  const docId = `AST-${seqStr}_BMN_${satker.code}_MNL_${cat.code}_${type.code}_${loc.code}_${formData.month}-${formData.year}`;

  await setDoc(doc(db, "assets", docId), {
    seq,
    displayId,
    satker,
    category: { id: cat.id, name: cat.name, code: cat.code },
    type: { id: type.id, name: type.name, code: type.code },
    location: { id: loc.id, name: loc.name, code: loc.code },
    month: formData.month,
    year: formData.year,
    merek: formData.merek || "",
    seri: formData.seri || "",
    photo: formData.photo || "",
    createdAt: serverTimestamp()
  });

  return docId;
}

/* ---------- asset list + selection ---------- */
function renderAssetList() {
  el("list-assets").innerHTML = assets.map(a => `
    <li>
      <label class="chk">
        <input type="checkbox" data-select="${a.id}" ${selectedForPrint.has(a.id) ? "checked" : ""}>
      </label>
      <span class="mono display-id" data-open="${a.id}">${a.displayId}</span>
      <button class="auth-only mini danger" data-del-asset="${a.id}">Hapus</button>
    </li>`).join("") || `<li class="empty">Belum ada aset tercatat</li>`;

  document.querySelectorAll("[data-select]").forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) selectedForPrint.add(cb.dataset.select);
      else selectedForPrint.delete(cb.dataset.select);
      updatePrintCount();
    };
  });
  document.querySelectorAll("[data-open]").forEach(span => {
    span.onclick = () => openDetail(span.dataset.open);
  });
  document.querySelectorAll("[data-del-asset]").forEach(btn => {
    btn.onclick = () => deleteAsset(btn.dataset.delAsset);
  });
  updatePrintCount();
}

async function deleteAsset(id) {
  if (!currentUser) return alert("Login dulu untuk menghapus aset.");
  if (!confirm("Hapus aset ini? Nomor asetnya nggak akan dipakai ulang.")) return;
  selectedForPrint.delete(id);
  await deleteDoc(doc(db, "assets", id));
}

function updatePrintCount() {
  el("print-count").textContent = selectedForPrint.size;
  el("btn-goto-print").classList.toggle("hidden", selectedForPrint.size === 0);
}

/* ---------- detail view ---------- */
async function openDetail(assetId) {
  const url = new URL(window.location.href);
  url.searchParams.set("id", assetId);
  window.history.pushState({}, "", url);
  await renderDetail(assetId);
  showView("detail");
}

async function renderDetail(assetId) {
  const box = el("detail-box");
  box.innerHTML = `<p class="muted">Memuat data...</p>`;
  const snap = await getDoc(doc(db, "assets", assetId));
  if (!snap.exists()) {
    box.innerHTML = `<p class="error">Aset dengan ID ini tidak ditemukan.</p>`;
    return;
  }
  const a = snap.data();
  box.innerHTML = `
    <div class="stamp-card">
      ${a.photo ? `<img class="detail-photo" src="${a.photo}" alt="Foto aset">` : ""}
      <div class="mono big-id">${a.displayId}</div>
      <table class="detail-table">
        <tr><td>Satker</td><td>${a.satker.name} (${a.satker.code})</td></tr>
        <tr><td>Kategori</td><td>${a.category.name} (${a.category.code})</td></tr>
        <tr><td>Jenis Barang</td><td>${a.type.name} (${a.type.code})</td></tr>
        <tr><td>Lokasi Ruangan</td><td>${a.location.name} (${a.location.code})</td></tr>
        <tr><td>Merek</td><td>${a.merek || "-"}</td></tr>
        <tr><td>Seri</td><td>${a.seri || "-"}</td></tr>
        <tr><td>Bulan / Tahun Perolehan</td><td>${a.month} / ${a.year}</td></tr>
      </table>
    </div>`;
}

/* ---------- print labels ---------- */
function renderPrintGrid() {
  const grid = el("print-grid");
  grid.innerHTML = "";
  const selected = assets.filter(a => selectedForPrint.has(a.id));
  selected.forEach(a => {
    const cell = document.createElement("div");
    cell.className = "label-cell";
    const qrHolder = document.createElement("div");
    qrHolder.className = "qr-holder";
    cell.appendChild(qrHolder);
    const caption = document.createElement("div");
    caption.className = "mono label-caption";
    caption.textContent = a.displayId;
    cell.appendChild(caption);
    grid.appendChild(cell);

    const detailUrl = `${window.location.origin}${window.location.pathname}?id=${a.id}`;
    new QRCode(qrHolder, { text: detailUrl, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
  });
  el("print-empty").classList.toggle("hidden", selected.length > 0);
}

/* ---------- wiring ---------- */
function initTabs() {
  document.querySelectorAll(".tab[data-view]").forEach(tab => {
    tab.addEventListener("click", () => {
      showView(tab.dataset.view);
      if (tab.dataset.view === "cetak") renderPrintGrid();
    });
  });
  el("btn-goto-print").addEventListener("click", () => {
    showView("cetak");
    document.querySelector('.tab[data-view="cetak"]').classList.add("active");
    renderPrintGrid();
  });
  el("btn-back-detail").addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.pushState({}, "", url);
    showView("beranda");
  });
  el("btn-print-now").addEventListener("click", () => window.print());
}

function initForms() {
  el("form-category").addEventListener("submit", e => {
    e.preventDefault();
    const input = el("input-category-name");
    if (input.value.trim()) addCategory(input.value.trim());
    input.value = "";
  });

  el("form-type").addEventListener("submit", e => {
    e.preventDefault();
    const input = el("input-type-name");
    const categoryId = el("type-category").value;
    if (input.value.trim()) addType(input.value.trim(), categoryId);
    input.value = "";
  });

  el("form-location").addEventListener("submit", e => {
    e.preventDefault();
    const input = el("input-location-name");
    if (input.value.trim()) addLocation(input.value.trim());
    input.value = "";
  });

  el("gen-category").addEventListener("change", fillTypeSelect);

  el("form-generate").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = el("btn-generate");
    btn.disabled = true;
    try {
      const photoFile = el("gen-photo").files[0];
      const photoDataUrl = photoFile ? await compressImage(photoFile) : "";

      const docId = await generateAsset({
        satkerCode: el("gen-satker").value,
        categoryId: el("gen-category").value,
        typeId: el("gen-type").value,
        locationId: el("gen-location").value,
        month: el("gen-month").value,
        year: el("gen-year").value,
        merek: el("gen-merek").value.trim(),
        seri: el("gen-seri").value.trim(),
        photo: photoDataUrl
      });
      if (docId) {
        el("gen-result").classList.remove("hidden");
        el("gen-result-text").textContent = "Aset berhasil dibuat: " + docId;
        e.target.reset();
        el("photo-preview").innerHTML = "";
        fillSatkerSelect();
      }
    } catch (err) {
      alert("Gagal generate: " + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  el("gen-photo").addEventListener("change", async () => {
    const file = el("gen-photo").files[0];
    const preview = el("photo-preview");
    if (!file) { preview.innerHTML = ""; return; }
    const dataUrl = await compressImage(file);
    preview.innerHTML = `<img src="${dataUrl}" alt="preview">`;
  });
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) {
    renderDetail(id);
    showView("detail");
  }
}

function init() {
  fillMonthSelect(el("gen-month"));
  el("gen-year").value = new Date().getFullYear();
  fillSatkerSelect();
  initAuth();
  initListeners();
  initTabs();
  initForms();
  initFromUrl();
}

document.addEventListener("DOMContentLoaded", init);
