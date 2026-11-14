# CivicSense AI

> **Smarter Cities. Faster Responses. Better Infrastructure.**

CivicSense AI is a full-stack public infrastructure monitoring, complaint analysis, and intelligent prioritization platform designed for citizens and municipal authorities across Karnataka.

---

## Core Features

### 1. Role-Based Authentication & Security
- **Split-Screen Gateway**: Explicit portal selection between **Citizen Login** and **Government Administrator Login** with zero unauthenticated console access.
- **Citizen Registration & Login**: Validates email format, 10-digit mobile number, strong password rules, duplicate email prevention, and security question setup. Passwords and normalized security answers are hashed with `bcryptjs`.
- **Government Administrator Policy**: Enforces organizational email domain verification (`ALLOWED_ADMIN_DOMAINS`, defaulting to `civicsense.gov.in,karnataka.gov.in`), blocks personal domains (Gmail, Yahoo, Outlook), and checks provisioned `ADMIN` + `active` status in SQLite.
- **Security-Question Password Recovery**: 3-step recovery flow (`Email -> Security Question Verification -> New Password`) with attempt rate-limiting/lockouts and immediate invalidation of all active sessions upon password reset.
- **SQLite-Backed Sessions & RBAC**: Protects `/api/complaints`, `/api/analytics`, `/api/insights`, and `/api/export/csv` via `HttpOnly` session cookies and `Authorization: Bearer <token>` headers. Citizens see and track only their own submitted complaints; approved administrators see all records.

### 2. Citizen Portal
- **Dashboard**: Live summary of total, pending, under-review, and resolved complaints, plus offline draft sync queue visibility.
- **Complaint Reporting**: Structured intake covering 7 infrastructure categories, photo upload with live preview, and an interactive OpenStreetMap/Leaflet coordinate picker with Karnataka district presets.
- **AI Complaint Analysis Panel**: Immediate post-submission breakdown showing predicted category, detected keywords, severity estimate, 0–100 priority score across 6 transparent factors, duplicate alerts, and suggested municipal actions.
- **Complaint Tracking**: Searchable tracking table with a full status lifecycle timeline (`Submitted → Under Review → Assigned → In Progress → Resolved / Rejected`) and official remarks.

### 3. Government Administration Dashboard
- **Overview Dashboard**: 6 real-time KPI cards, Recharts trend & category/priority distributions, resolution performance metrics, and recent complaints table.
- **Complaint Management**: Search, filter (category, priority, district, status), sort (date, severity, priority score), and a slide-over Inspector for reviewing uploaded evidence, updating status, assigning municipal departments/officers, and logging remarks.
- **Geographical Hotspot Analysis**: Interactive Leaflet + OpenStreetMap visualization of Karnataka complaints with severity markers, cluster rings, and category/priority filters.
- **Analytics & Reports**: Date-range filtered Recharts analytics (monthly trends, district breakdown, category volume, resolution rate, frequent problems) and authenticated RFC-4180 CSV export.
- **AI Intelligence Module**: Live database analysis generating recurring problem alerts, duplicate clusters, and actionable maintenance recommendations backed by complaint IDs.

### 4. Hybrid AI Engine & Offline PWA Resilience
- **6-Factor Rule-Based Priority Engine (0–100)**: Scores Problem Severity (30), Public Safety Risk (25), Nearby Duplicates (15), Affected Citizens (10), Local Area Frequency (10), and Pending Duration (10).
- **Geo-Text Duplicate Detection**: Identifies related reports via token similarity, category alignment, Haversine spatial proximity, and submission date proximity without deleting records.
- **Optional Server-Side Gemini Enrichment**: Automatically activates via `@google/genai` when `GEMINI_API_KEY` is configured on the backend.
- **Offline-First PWA**: Installable via `vite-plugin-pwa`, caches authenticated dashboards locally (cleared automatically on logout), and stores offline complaint drafts in IndexedDB for automatic sync once reconnected.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React, Recharts, Leaflet + OpenStreetMap, Vite PWA
- **Backend**: Node.js, Express.js, bcryptjs, Multer (multipart image upload), CORS
- **Database**: SQLite (`better-sqlite3`) with automatic schema migrations (`Users`, `Sessions`, `Password_Recovery_Attempts`, `Recovery_Challenges`, `Complaints`, `Complaint_Duplicates`, `Department_Assignments`, `Complaint_Updates`) and 32 seeded Karnataka demo records

---

## Local Development in VS Code

### 1. Prerequisites
- Node.js **v20+** and `npm`

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Key `.env` variables:
- `GEMINI_API_KEY` *(optional)*: Add a Gemini API key to enable hybrid LLM enrichment; leave blank to run deterministically with the built-in NLP rules engine.
- `DATABASE_PATH`: Defaults to `./data/civicsense.db`.
- `ALLOWED_ADMIN_DOMAINS`: Comma-separated approved work domains for administrators (`civicsense.gov.in,karnataka.gov.in`).
- `SESSION_TTL_HOURS`: Session expiration window in hours (default `24`).
- `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`: Seeded municipal administrator account (email defaults to `meera.admin@civicsense.gov.in`; password must be provided via environment variable).
- `CITIZEN_DEMO_EMAIL` / `CITIZEN_DEMO_PASSWORD`: Seeded demo citizen owning the 32 Karnataka demo records (email defaults to `aarav.citizen@civicsense.demo`; password must be provided via environment variable).

### 4. Initialize & Seed SQLite Database (Standalone)
```bash
npm run db:seed
```
This runs schema migrations, seeds the demo Citizen and provisioned Admin accounts in `./data/civicsense.db`, and populates 32 demonstration records across Bengaluru, Mysuru, Mangaluru, Hubballi, Belagavi, Kalaburagi, Ballari, Chikkaballapur, and Tumakuru.

### 5. Run Frontend & Backend Independently (Recommended for VS Code)

**Terminal 1 — Backend REST API & SQLite (Port 3001):**
```bash
npm run dev:server
```

**Terminal 2 — Frontend React + Vite Client (Port 3000, proxying `/api`, `/uploads`, and `/demo-images` to 3001):**
```bash
npm run dev:client
```

Open `http://localhost:3000` in your browser.

### 6. Unified Single-Server Mode (Dev & Production)
Run both Express API + Vite dev middleware on port `3000`:
```bash
npm run dev
```

Or build and run in production mode:
```bash
npm run build
npm start
```
