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
function genCode(name, existingCodes) {
  let base = (name || "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
  if (!base) base = "XXX";
  let code = base;
  let n = 2;
  while (existingCodes.includes(code)) {
    code = base + n;
    n++;
  }
  return code;
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
  updatePrintCount();
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
      <div class="mono big-id">${a.displayId}</div>
      <table class="detail-table">
        <tr><td>Satker</td><td>${a.satker.name} (${a.satker.code})</td></tr>
        <tr><td>Kategori</td><td>${a.category.name} (${a.category.code})</td></tr>
        <tr><td>Jenis Barang</td><td>${a.type.name} (${a.type.code})</td></tr>
        <tr><td>Lokasi Ruangan</td><td>${a.location.name} (${a.location.code})</td></tr>
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
      const docId = await generateAsset({
        satkerCode: el("gen-satker").value,
        categoryId: el("gen-category").value,
        typeId: el("gen-type").value,
        locationId: el("gen-location").value,
        month: el("gen-month").value,
        year: el("gen-year").value
      });
      if (docId) {
        el("gen-result").classList.remove("hidden");
        el("gen-result-text").textContent = "Aset berhasil dibuat: " + docId;
        e.target.reset();
        fillSatkerSelect();
      }
    } catch (err) {
      alert("Gagal generate: " + err.message);
    } finally {
      btn.disabled = false;
    }
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
