'use strict';
// ============================================================================
// SMART TOURIST SAFETY MONITORING & RAPID INCIDENT RESPONSE
// Supabase Cloud Backend Client & Realtime Sync Engine
// ============================================================================

const SUPABASE_CONFIG = {
  URL: localStorage.getItem('sts_sb_url') || 'https://jwaozlhbmlzefntqkrzx.supabase.co',
  KEY: localStorage.getItem('sts_sb_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3YW96bGhibWx6ZWZudHFrcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNTM4NDEsImV4cCI6MjEwNjkyOTg0MX0.oDfkp8TJA1CJQTD8u70crSlXnFTbCUdhMCn0g3x6_wE'
};

let sbClient = null;
let isCloudConnected = false;

function initSupabase() {
  if (window.supabase && SUPABASE_CONFIG.URL && SUPABASE_CONFIG.KEY) {
    try {
      sbClient = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);
      isCloudConnected = true;
      console.log('✅ Supabase Client initialized');
      checkSupabaseHealth();
    } catch (err) {
      console.warn('⚠️ Supabase initialization failed, falling back to local storage:', err);
      sbClient = null;
      isCloudConnected = false;
      updateCloudStatusUI();
    }
  } else {
    sbClient = null;
    isCloudConnected = false;
    updateCloudStatusUI();
  }
  return isCloudConnected;
}

async function checkSupabaseHealth() {
  if (!sbClient) {
    isCloudConnected = false;
    updateCloudStatusUI();
    return false;
  }
  try {
    const { data, error } = await sbClient.from('safety_zones').select('id').limit(1);
    if (error) {
      console.warn('Supabase ping notice:', error.message);
      isCloudConnected = !error.message?.includes('FetchError') && !error.message?.includes('Failed to fetch');
    } else {
      isCloudConnected = true;
    }
  } catch (err) {
    console.warn('Supabase health check network error:', err);
    isCloudConnected = false;
  }
  updateCloudStatusUI();
  return isCloudConnected;
}

function updateCloudStatusUI() {
  // Cloud DB pills hidden from UI per design
}


// ----------------------------------------------------------------------------
// CLOUD AUTHENTICATION
// ----------------------------------------------------------------------------
async function sbSignUp(email, password, metadata) {
  if (!sbClient) return null;
  const { data, error } = await sbClient.auth.signUp({
    email,
    password,
    options: { data: metadata }
  });
  if (error) throw error;
  return data;
}

async function sbSignIn(email, password) {
  if (!sbClient) return null;
  const { data, error } = await sbClient.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  if (!sbClient) return;
  try {
    await sbClient.auth.signOut();
  } catch (err) {
    console.error('Supabase signout error:', err);
  }
}

async function sbResetPassword(email) {
  if (!sbClient) return null;
  const { data, error } = await sbClient.auth.resetPasswordForEmail(email);
  if (error) throw error;
  return data;
}

async function sbGetSession() {
  if (!sbClient) return null;
  try {
    const { data } = await sbClient.auth.getSession();
    return data?.session || null;
  } catch (err) {
    return null;
  }
}

// ----------------------------------------------------------------------------
// CLOUD DATA PERSISTENCE & QUERIES
// ----------------------------------------------------------------------------
async function sbFetchTourists() {
  if (!sbClient) return null;
  const { data, error } = await sbClient
    .from('tourists')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Supabase fetch tourists error:', error);
    return null;
  }
  return data.map(r => ({
    id: r.tourist_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    familyContactName: r.emergency_contact_name,
    familyContactPhone: r.emergency_contact,
    blood: r.blood_group,
    allergy: r.allergies,
    identityHash: r.identity_hash,
    zone: r.zone,
    status: r.status,
    lat: r.latitude != null ? Number(r.latitude) : null,
    lng: r.longitude != null ? Number(r.longitude) : null,
    locationSource: r.location_source,
    updatedAt: r.location_updated_at || r.updated_at,
    authUserId: r.auth_user_id
  }));
}

async function sbUpsertTourist(t) {
  if (!sbClient) return null;
  const row = {
    tourist_id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone || '',
    emergency_contact_name: t.familyContactName || '',
    emergency_contact: t.familyContactPhone || '',
    blood_group: t.blood || '',
    allergies: t.allergy || '',
    identity_hash: t.identityHash || '',
    zone: t.zone || 'Outside monitored zones',
    status: t.status || 'Safe',
    latitude: t.lat != null ? Number(t.lat) : null,
    longitude: t.lng != null ? Number(t.lng) : null,
    location_source: t.locationSource || 'gps',
    location_updated_at: t.updatedAt || new Date().toISOString()
  };
  if (t.authUserId) row.auth_user_id = t.authUserId;

  const { data, error } = await sbClient
    .from('tourists')
    .upsert(row, { onConflict: 'tourist_id' })
    .select();
  if (error) {
    console.warn('Supabase upsert tourist error:', error.message || error);
    return null;
  }
  return data;
}

async function sbFetchSafetyZones() {
  if (!sbClient) return null;
  const { data, error } = await sbClient.from('safety_zones').select('*');
  if (error) {
    console.warn('Supabase fetch zones error:', error);
    return null;
  }
  return data.map(z => ({
    name: z.name,
    type: z.zone_type,
    risk: z.risk_level,
    lat: Number(z.latitude),
    lng: Number(z.longitude),
    radius: Number(z.radius)
  }));
}

async function sbUpsertSafetyZone(z) {
  if (!sbClient) return null;
  const row = {
    name: z.name,
    zone_type: z.type,
    risk_level: z.risk,
    latitude: Number(z.lat),
    longitude: Number(z.lng),
    radius: Math.round(Number(z.radius))
  };
  const { data, error } = await sbClient.from('safety_zones').upsert(row, { onConflict: 'name' }).select();
  if (error) {
    console.warn('Supabase upsert zone error:', error.message || error);
    return null;
  }
  return data;
}

async function sbDeleteSafetyZone(name) {
  if (!sbClient) return null;
  const { data, error } = await sbClient.from('safety_zones').delete().eq('name', name);
  if (error) {
    console.warn('Supabase delete zone error:', error.message || error);
    return null;
  }
  return data;
}

async function sbFetchIncidents() {
  if (!sbClient) return null;
  const { data, error } = await sbClient
    .from('incidents')
    .select('*')
    .order('occurred_at', { ascending: false });
  if (error) {
    console.warn('Supabase fetch incidents error:', error);
    return null;
  }
  return data.map(i => ({
    id: i.id,
    tourist: i.tourist_name,
    touristId: i.tourist_id,
    type: i.type,
    severity: i.severity,
    status: i.status,
    zone: i.zone,
    lat: i.latitude != null ? Number(i.latitude) : null,
    lng: i.longitude != null ? Number(i.longitude) : null,
    accuracy: i.accuracy != null ? Number(i.accuracy) : null,
    auditRef: i.audit_ref,
    source: i.source,
    assignedTo: i.assigned_to,
    time: i.occurred_at ? new Date(i.occurred_at).toLocaleString('en-IN') : 'Just now'
  }));
}

async function sbUpsertIncident(i) {
  if (!sbClient) return null;
  const row = {
    id: i.id,
    tourist_id: i.touristId || '',
    tourist_name: i.tourist || '',
    type: i.type,
    severity: i.severity || 'HIGH',
    status: i.status || 'New',
    zone: i.zone || '',
    latitude: i.lat != null ? Number(i.lat) : null,
    longitude: i.lng != null ? Number(i.lng) : null,
    accuracy: i.accuracy != null ? Number(i.accuracy) : null,
    audit_ref: i.auditRef || '',
    source: i.source || 'manual',
    assigned_to: i.assignedTo || null
  };
  const { data, error } = await sbClient
    .from('incidents')
    .upsert(row, { onConflict: 'id' })
    .select();
  if (error) {
    console.warn('Supabase upsert incident error:', error.message || error);
    return null;
  }
  return data;
}

// ----------------------------------------------------------------------------
// REALTIME SUBSCRIPTIONS (LIVE DISPATCH & MULTI-DEVICE SYNC)
// ----------------------------------------------------------------------------
let realtimeChannel = null;

function setupSupabaseRealtime(onIncidentChange, onTouristChange, onZoneChange) {
  if (!sbClient) return;
  if (realtimeChannel) {
    try { sbClient.removeChannel(realtimeChannel); } catch(e) {}
  }

  realtimeChannel = sbClient
    .channel('public-safety-stream')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, payload => {
      console.log('📡 Realtime incident update:', payload);
      if (typeof onIncidentChange === 'function') onIncidentChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tourists' }, payload => {
      console.log('📡 Realtime tourist location/status update:', payload);
      if (typeof onTouristChange === 'function') onTouristChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_zones' }, payload => {
      console.log('📡 Realtime zone update:', payload);
      if (typeof onZoneChange === 'function') onZoneChange(payload);
    })
    .subscribe(status => {
      console.log('📡 Supabase Realtime Stream Status:', status);
    });
}
