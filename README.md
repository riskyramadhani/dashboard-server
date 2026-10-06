# Dashboard Server — PT. Bina Sarana Sukses

Sistem monitoring infrastruktur server, jaringan, dan aplikasi berbasis web terpusat untuk Divisi IT & NOC PT. Bina Sarana Sukses. Terintegrasi penuh dengan PRTG Network Monitor API, modul Uptime SLA Availability, Network Diagnostic Tools, serta Audit Logging.

---

## 🚀 Fitur Utama

- **Integrasi PRTG Network Monitor (v2)**:
  - Sinkronisasi metrik real-time & otomatis via background polling / cron runner.
  - Perhitungan **SLA Uptime Ketersediaan** dan **Health Score** akurat (sensor status `Down` memotong uptime, `Paused` diperhitungkan netral sebagai maintenance window).
  - Acknowledge alarm langsung dari dashboard dengan pencatatan audit log operator.
- **Uptime & SLA Monitor**:
  - Pengecekan multi-protokol (HTTP, HTTPS, ICMP PING, TCP Port).
  - Ambang batas latensi dinamis (*warning latency threshold*) & auto-recovery tracking.
- **Network Diagnostic Tools**:
  - Ping & Traceroute (aman dari shell injection via `execFile`).
  - TCP Port Checker & DNS Lookup.
  - OUI MAC Address Resolution & ARP Cache lookup dengan riwayat audit.
- **Laporan Eksekutif & Ekspor Data**:
  - Filter rentang tanggal fleksibel (24 jam, 7 hari, 30 hari, kustom).
  - Format ekspor: CSV, Excel (.xlsx), dan Laporan Resmi PDF/Printable dengan kop surat PT. Bina Sarana Sukses.
- **Manajemen Akses Berbasis Peran (RBAC)**:
  - Role: `ADMIN`, `NOC_OPERATOR`, `STAFF`.
  - Pembatasan izin probe (*allowed probes*) dan modul (*allowed modules*).
- **Keamanan & Kriptografi**:
  - Enkripsi token PRTG dengan **AES-256-GCM** (random 16-byte IV & Auth Tag).
  - Proteksi HTTP Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options).
  - Audit trail komprehensif pada setiap tindakan administratif dan eksekusi tools.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16.3.5 (Turbopack), React 19, TailwindCSS, Lucide Icons, Recharts.
- **Backend**: Next.js App Router (Route Handlers, Proxy Middleware), Auth.js (NextAuth v5 beta).
- **Basis Data**: PostgreSQL 16 (TimescaleDB) dengan Prisma ORM 7.
- **Testing**: Vitest, React Testing Library, JSDOM (Unit, Feature, & Simulation Tests).

---

## 📋 Prasyarat

- Node.js >= 20.x atau 24.x
- Docker & Docker Compose (untuk database PostgreSQL/TimescaleDB)
- Akun PRTG Network Monitor dengan hak akses API (opsional untuk sinkronisasi live)

---

## ⚡ Panduan Instalasi & Menjalankan Lokal

### 1. Kloning Repositori & Install Dependensi
```bash
git clone https://github.com/riskyramadhani/dashboard-server.git
cd dashboard-server
npm install
```

### 2. Konfigurasi Lingkungan (.env)
Salin berkas `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Sesuaikan variabel di `.env`:
```env
DATABASE_URL="postgresql://bss:bss_secret_2026@localhost:5432/dashboard_server"
AUTH_SECRET="your-generated-auth-secret-here"
AUTH_TRUST_HOST=true
ENCRYPTION_KEY="your-64-hex-character-key-here"
INTERNAL_CRON_SECRET="your-cron-secret-here"
```
> *Catatan: Untuk menghasilkan `ENCRYPTION_KEY` 32-byte (64 karakter hex):*  
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 3. Jalankan Database Docker
```bash
docker compose up -d
```

### 4. Migrasi & Seeding Database
```bash
npx prisma db push
npx tsx prisma/seed.ts
```

### 5. Jalankan Server Pengembangan
```bash
npm run dev
```
Akses dashboard melalui peramban di: `http://localhost:3000`

---

## 🧪 Menjalankan Automated Test Suite

Proyek ini dilengkapi dengan 22 pengujian otomatis (Unit Test, Feature Test, Simulation Test):
```bash
# Jalankan test suite sekali jalan
npm test

# Jalankan test suite dalam watch mode
npm run test:watch
```

---

## 📄 Lisensi

Hak Cipta © 2026 PT. Bina Sarana Sukses. Seluruh hak cipta dilindungi undang-undang.
