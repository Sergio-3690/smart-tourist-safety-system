# Smart Tourist Safety Monitoring and Incident Response System

An integrated tourist safety monitoring and rapid incident response platform featuring AI safety assessment, precision geofencing, emergency SOS beacons, verifiable Digital ID, emergency medical records, and live Supabase PostgreSQL cloud sync with offline fallback.

---

## 🚀 Key Features

1. **AI Safety Risk Assessment:**
   - Multi-factor anomaly evaluation (Zone risk, hazard proximity, incident history, GPS accuracy).
   - Generates actionable safety recommendations and dynamic threat levels (SAFE, CAUTION, DANGER).

2. **Precision Geofencing & Danger Zones:**
   - Interactive map-click boundary placement down to 10m radius.
   - Live GPS coordinate picker with auto-fill support.
   - Real-time perimeter breach detection (Safe, Caution, Restricted zones).

3. **Emergency SOS & Rapid Response:**
   - 1-Tap SOS beacon transmitting live GPS coordinates, audit reference token, and tourist profile to Authority command.
   - Structured response workflow: *Acknowledge → Assign Response Unit → Resolve*.
   - Voice SOS emergency command trigger.

4. **Digital Identity & Medical Records:**
   - Tamper-evident Digital ID with cryptographic SHA-like hash validation.
   - Quick-response QR Code generator for field verification by law enforcement.
   - Encrypted emergency medical data (Blood group, allergies, next-of-kin contacts).

5. **Supabase Cloud Backend & Realtime Synchronization:**
   - Direct integration with Supabase PostgreSQL cloud database (`tourists`, `incidents`, `safety_zones`).
   - PostgreSQL Realtime WebSocket replication for multi-device live sync.
   - Resilient offline fallback to browser LocalStorage with automatic session persistence.

6. **Secure Authentication & Password Management:**
   - Role-based portal routing (Tourist vs Authority Command Center).
   - Real-time Password Strength Meter with complexity rules.
   - Eye toggle password visibility controls (`👁️` / `🔒`).
   - Session persistence (`sts_session`) across page reloads.

---

## 📁 Project Structure

```
Safe-Tourist-VSCode-Project/
├── index.html            # Main application entry point
├── css/
│   └── style.css         # Modern, responsive UI stylesheet
├── js/
│   ├── app.js            # Core application state, map engine, AI rules, workflows
│   └── supabase.js       # Supabase Cloud Client, health checks & realtime sync
├── supabase/
│   └── schema.sql        # Production PostgreSQL schema, RLS policies & triggers
└── assets/               # Project icons & assets
```

---

## 🛠️ How to Run

1. Open `Safe-Tourist-VSCode-Project` in **VS Code**.
2. Start via **Live Server** (Right click `index.html` → *Open with Live Server*) or any local HTTP server (`http://localhost:5500`).
3. Open in any modern web browser with Geolocation enabled.

---

## ☁️ Supabase Cloud Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and run the queries from `supabase/schema.sql`.
3. The project comes pre-configured with active cloud credentials, or you can configure your own project URL and anon key in `js/supabase.js`.
