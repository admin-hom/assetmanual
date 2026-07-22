# assetmanual

Generate & simpan nomor aset pribadi + QR code yang menampilkan data saat discan.

## Cara deploy

1. **Upload semua file ini ke repo** `admin-hom/assetmanual` (pertahankan struktur folder: `index.html`, `js/`, `css/`).
2. **Aktifkan GitHub Pages**: Settings → Pages → Source: branch `main`, folder `/ (root)`. URL nanti jadi `https://admin-hom.github.io/assetmanual/`.
3. **Pasang Security Rules**: buka Firebase Console → Firestore Database → Rules → copy-paste isi `firestore.rules` di sini → Publish.
4. **Aktifkan Google Sign-in**: Firebase Console → Authentication → Sign-in method → aktifkan Google.
5. Buka `https://admin-hom.github.io/assetmanual/`, klik **Login Google**, coba tambah kategori/lokasi buat mastiin semuanya nyambung ke Firestore.
6. Setelah login sekali, cek Firebase Console → Authentication → Users → copy **UID** kamu.
7. Update `firestore.rules` — ganti `allow write: if request.auth != null;` di tiap collection jadi `allow write: if request.auth != null && request.auth.uid == "UID_KAMU";` biar cuma akun kamu yang bisa nulis. Publish ulang rules-nya.

## Alur pakai

1. **Kategori & Jenis** → tambah kategori dulu (misal "Elektronik"), lalu tambah jenis di bawah kategori itu (misal "Laptop").
2. **Lokasi** → tambah daftar ruangan.
3. **Beranda** → pilih Satker, Kategori, Jenis (otomatis kefilter sesuai kategori), Lokasi, bulan/tahun → klik Generate. Nomor aset otomatis terbentuk beserta QR-nya.
4. Centang aset yang mau dicetak di daftar Beranda → **Cetak Label Terpilih** → halaman Cetak Label menampilkan grid 3 kolom siap print di A4.
5. Scan QR yang tertempel di barang fisik → otomatis buka halaman Detail Aset dengan data lengkap.

## Format nomor aset

```
AST-001/BMN/PND/MNL/ELK/LTP/BTR/07/2026
    │    │   │   │   │   │   │  │   └ tahun perolehan
    │    │   │   │   │   │   │  └──── bulan perolehan
    │    │   │   │   │   │   └─────── kode lokasi ruangan
    │    │   │   │   │   └─────────── kode jenis barang
    │    │   │   │   └─────────────── kode kategori barang
    │    │   │   └─────────────────── teks tetap "MNL" (Manual)
    │    │   └─────────────────────── kode satker (Pendis/Pakis/Sekjen/Bimas)
    │    └─────────────────────────── teks tetap "BMN"
    └──────────────────────────────── nomor urut global
```

Kode kategori/jenis/lokasi dibuat otomatis dari 3-4 huruf pertama nama (kapital), tabrakan kode auto-ditambah angka.
