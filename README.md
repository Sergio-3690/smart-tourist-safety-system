# Smart Tourist Safety Monitoring and Incident Response System

An enterprise-grade, integrated tourist safety monitoring and rapid incident response platform featuring AI safety assessment, precision geofencing, emergency SOS beacons, verifiable Digital ID, emergency medical records, and live Supabase PostgreSQL cloud sync with offline replay queue.

---

## 🚀 Key Features & Production Security

1. **Role-Based Row Level Security (RLS):**
   - Hardened PostgreSQL Row Level Security in `supabase/schema.sql`.
   - Function `public.is_authority()` verifies server-side JWT claims (`role = 'authority'`).
   - Tourists can only read/update their own profile data (`auth.uid() = auth_user_id`).
   - Incident records are private to tourists; only verified authorities can update, assign response units, or resolve incidents.
   - Danger and caution zones are public read-only for tourists and restricted to authorities for write operations.

2. **Web Crypto API (SHA-256) Credential Protection:**
   - Zero plaintext passwords in LocalStorage.
   - All credentials hashed client-side with unique salts using modern `crypto.subtle.digest('SHA-256')`.
   - Automatic legacy scrubbing cleanses any legacy plaintext keys upon initialization.

3. **Multi-Factor Security Challenge for Password Reset:**
   - Prevents unverified password resets.
   - Requires verification of **Email + Registered Next-of-Kin Phone Number + Registered Blood Group** before permitting credentials update.

4. **Telemetry & GPS Confidence Architecture:**
   - Real-time segregation of **Live Satellite GPS** (`● SATELLITE GPS (±Xm)`) versus **Demo Benchmark Coordinates** (`⚪ DEMO PROFILE COORDINATE`).
   - Authority command dashboard includes dedicated telemetry filters (`All Records`, `🟢 Live GPS Only`, `⚪ Demo Profiles`).
   - Stale GPS detection flags locations older than 3 minutes (`▲ STALE GPS`).
   - AI risk assessment factors in GPS confidence (`HIGH`, `MEDIUM`, `LOW`).

5. **AI Safety Risk Assessment:**
   - Multi-factor anomaly evaluation (Zone risk, hazard proximity, incident history, GPS confidence).
   - Generates actionable safety recommendations and dynamic threat levels (SAFE, CAUTION, DANGER).

6. **Precision Geofencing & Danger Zones:**
   - Interactive map-click boundary placement down to 10m radius.
   - Real-time perimeter breach detection (Safe, Caution, Restricted zones).

7. **Emergency SOS & Rapid Response:**
   - 1-Tap SOS beacon transmitting live GPS coordinates, audit reference token, and tourist profile to Authority command.
   - Structured response workflow: *Acknowledge → Assign Response Unit → Resolve*.
   - Voice SOS emergency command trigger.

8. **Digital Identity & Medical Records:**
   - Tamper-evident Digital ID with cryptographic SHA-256 hash validation.
   - Quick-response QR Code generator for field verification by law enforcement.
   - Emergency medical data (Blood group, allergies, next-of-kin contacts).

9. **Supabase Cloud Backend & Resilient Offline Replay Queue:**
   - Direct integration with Supabase PostgreSQL cloud database (`tourists`, `incidents`, `safety_zones`).
   - PostgreSQL Realtime WebSocket replication for multi-device live sync.
   - Resilient offline queue (`sts_pending_sync_queue`) captures writes during disconnections and automatically flushes to Supabase upon reconnection (`online` event listener).

---

## 📁 Project Structure

```
Safe-Tourist-VSCode-Project/
├── index.html            # Main application entry point
├── css/
│   └── style.css         # Modern, responsive UI stylesheet
├── js/
│   ├── app.js            # Core application state, Web Crypto auth, map engine, AI rules, workflows
│   └── supabase.js       # Supabase Cloud Client, authority auth, offline replay queue & realtime sync
├── supabase/
│   └── schema.sql        # Hardened PostgreSQL schema, RLS policies, functions & triggers
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
