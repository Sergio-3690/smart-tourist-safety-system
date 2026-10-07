'use strict';
// Demo prototype: all data lives in this browser's localStorage only.
const $=id=>document.getElementById(id);
const KEY='sts_v3', DC={lat:19.076,lng:72.8777};
const ZC={Safe:'#22c55e',Caution:'#f59e0b',Restricted:'#f43f5e'};
const S={role:'tourist',page:'overview',user:null,tourists:[],incidents:[],zones:[],active:null,loc:null,tracking:false,watch:null,geo:{},zone:'Location not acquired',safety:'UNKNOWN',lastEvent:'',aiId:null,verifyId:null,verified:null,selId:null,filter:'',net:'ONLINE'};
let maps={},ownMap=null,ownMarker=null,ownCircle=null,toastT=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanText=(v,m=80)=>String(v??'').replace(/[<>]/g,'').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,m);
const isEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v||'').trim());
const isPhone=v=>{const d=(v.match(/\d/g)||[]).join('');return /^[0-9+\-\s()]+$/.test(v)&&(d.length===10||(d.length===12&&d.startsWith('91')))};
const isName=v=>/^[A-Za-z][A-Za-z\s'.-]{1,49}$/.test((v||'').trim());
const jitter=(c,s)=>({lat:c.lat+(Math.random()-.5)*2*s,lng:c.lng+(Math.random()-.5)*2*s});
const radiusOf=z=>Number(z.radius)||(z.type==='Restricted'?400:z.type==='Caution'?350:280);
const newId=p=>{let id;do{id=p+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}while([...S.tourists,...S.incidents].some(x=>x.id===id));return id};
const auditRef=()=>'AR-'+Array.from({length:32},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
function idHash(r){const b=[r.id,r.name,r.email,r.phone||''].join('|');let h1=2166136261,h2=0x9e3779b9;for(let i=0;i<b.length;i++){const c=b.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^(c+i),2246822519)}return 'IDR-'+(h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0')}
function haversine(a,b){const R=6371000,r=Math.PI/180,dp=(b.lat-a.lat)*r,dl=(b.lng-a.lng)*r,x=Math.sin(dp/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}

// ---------- data ----------
function seed(){
  S.zones=[{name:'Marine Drive Safe Zone',type:'Safe',risk:'Low',radius:280,lat:19.073,lng:72.872},{name:'Hill Road Caution Area',type:'Caution',risk:'Medium',radius:350,lat:19.081,lng:72.883},{name:'Cliff Area',type:'Restricted',risk:'High',radius:400,lat:19.07,lng:72.8865}];
  const mk=(name,id,email,lat,lng,x={})=>{const t={name,id,email,zone:'Outside monitored zones',status:'Safe',lat,lng,locationSource:'demo',...x};t.identityHash=idHash(t);return t};
  S.tourists=[mk('Aarav Mehta','ST-00118','aarav@example.com',19.0745,72.8735),
    mk('Aditya Sanap','ST-00124','tourist@example.com',19.076,72.8777,{phone:'9876543210',familyContactName:'Neha Sanap',familyContactPhone:'9876543211',blood:'O+',allergy:'Penicillin',password:'Tourist@123'}),
    mk('Meera Kulkarni','ST-00131','meera@example.com',19.0735,72.881),
    mk('Rohan Deshmukh','ST-00142','rohan@example.com',19.0785,72.8795)];
  S.incidents=[{id:'INC-2041',tourist:'Rohan Deshmukh',touristId:'ST-00142',type:'Geofence Warning',severity:'MEDIUM',status:'Resolved',time:'12 Aug 2026',zone:'Hill Road Caution Area',auditRef:auditRef(),source:'geofence'},
    {id:'INC-2034',tourist:'Meera Kulkarni',touristId:'ST-00131',type:'SOS Alert',severity:'HIGH',status:'Resolved',time:'05 Aug 2026',zone:'Cliff Area',auditRef:auditRef(),source:'sos'}];
}
function save(){try{localStorage.setItem(KEY,JSON.stringify({tourists:S.tourists,incidents:S.incidents,zones:S.zones}))}catch(e){}}
function load(){
  try{const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d&&Array.isArray(d.tourists)&&d.tourists.length){S.tourists=d.tourists;S.incidents=d.incidents||[];S.zones=(d.zones||[]).map(z=>({...z,radius:radiusOf(z)}));return}
  }catch(e){}
  seed();
}
const me=()=>S.user?S.tourists.find(t=>t.id===S.user.id)||null:null;
const findByEmail=e=>S.tourists.find(t=>(t.email||'').toLowerCase()===(e||'').trim().toLowerCase());

// ---------- shell ----------
const touristNav=[['overview','Overview'],['location','Live Location'],['zones','Safety Zones'],['ai','AI Safety'],['sos','Emergency / SOS'],['medical','Medical Emergency Contact'],['digital','Digital ID'],['incidents','My Incidents'],['profile','Profile']];
const authorityNav=[['overview','Overview'],['monitor','Tourist Monitoring'],['locations','Live Locations'],['alerts','Geofence Alerts'],['ai','AI Incident Analysis'],['incidents','Incident Management'],['verify','Digital ID Verification'],['response','Emergency Response'],['zones','Danger Zones'],['reports','Reports']];
const titles={overview:'Overview',location:'Live Location',zones:'Safety Zones',ai:'AI Safety',sos:'Emergency / SOS',medical:'Medical Emergency Contact',digital:'Digital ID',incidents:'Incidents',profile:'Profile',monitor:'Tourist Monitoring',locations:'Live Locations',alerts:'Geofence Alerts',verify:'Digital ID Verification',response:'Emergency Response',reports:'Reports',touristDetail:'Tourist Details'};
const icons={overview:'⌂',location:'⌖',locations:'⌖',zones:'◌',ai:'✦',sos:'!',medical:'♡',digital:'◇',incidents:'≡',profile:'○',monitor:'◎',alerts:'△',verify:'✓',response:'↗',reports:'▤'};
function show(id){['landing','auth','register','app'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden')}
function showLanding(){show('landing')}
function showAuth(r='tourist'){show('auth');setRole(r)}
function showRegister(){show('register')}
function setRole(r){S.role=r;$('touristTab').classList.toggle('active',r==='tourist');$('authorityTab').classList.toggle('active',r==='authority');$('email').value='';$('password').value='';$('emailErr').textContent='';$('passErr').textContent='';$('guestRow').style.display=r==='authority'?'none':'block'}
function togglePassword(i,b){const p=$(i);p.type=p.type==='password'?'text':'password';$(b).textContent=p.type==='password'?'Show':'Hide'}
function openModal(h){$('modal').innerHTML=h;$('modalBack').classList.remove('hidden');const f=document.querySelector('#modal input');if(f)setTimeout(()=>f.focus(),30)}
function closeModal(){$('modalBack').classList.add('hidden')}
function toast(msg,type='info'){const c={success:'#2f6b4f',warning:'#8a6a1f',danger:'#8f2f2f',info:'#172936'};const t=$('toast');t.textContent=msg;t.style.background=c[type]||c.info;t.classList.remove('hidden');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.add('hidden'),3200)}
function toggleTheme(){const l=document.body.classList.toggle('light');try{localStorage.setItem('sts_theme',l?'light':'dark')}catch(e){}$('themeToggle').textContent=l?'☀':'☾'}
function renderNav(){$('nav').innerHTML=(S.role==='tourist'?touristNav:authorityNav).map(([id,l])=>`<button class="${S.page===id?'active':''}" onclick="go('${id}')">${icons[id]} ${l}</button>`).join('')}
function go(p){S.page=p;renderNav();render()}
function render(){
  $('roleLabel').textContent=S.role==='tourist'?'Tourist portal':'Authority command';
  $('userName').textContent=S.user.name;$('userRole').textContent=S.role==='tourist'?'Tourist':'Authority';
  $('avatar').textContent=S.user.name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  $('pageTitle').textContent=titles[S.page]||'Overview';
  try{$('content').innerHTML=S.role==='tourist'?touristPage():authorityPage()}catch(e){console.error(e);$('content').innerHTML='<div class="notice danger">Something went wrong loading this page.</div>'}
  cleanupMaps();
}
function enterApp(){
  S.page='overview';
  if(S.role==='tourist'){const r=me();S.loc=null;S.zone='Location not acquired';S.safety='UNKNOWN';if(r&&r.locationSource==='gps'&&r.lat!=null){S.loc={lat:Number(r.lat),lng:Number(r.lng),accuracy:r.accuracy||0,updatedAt:r.updatedAt};setSelfZone(r)}}
  show('app');renderNav();render();
}
function setSelfZone(r){S.zone=r.zone||'Outside monitored zones';const z=S.zones.find(x=>x.name===r.zone);S.safety=!z?'SAFE':z.type==='Restricted'?'DANGER':z.type==='Caution'?'CAUTION':'SAFE'}

// ---------- auth ----------
function forgotPassword(){
  openModal(`<h2>Reset password</h2><p class="muted">Enter your account email. This is a local account, so the reset happens on this device.</p>
  <div class="field"><label>Email</label><input id="fpEmail" type="text" placeholder="you@example.com"><div id="fpEmailErr" class="error"></div></div>
  <div id="fpStep2" class="hidden"><div class="field"><label>New password</label><input id="fpNew" type="password" placeholder="Minimum 8 characters"><div id="fpNewErr" class="error"></div></div></div>
  <div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="fpAction" onclick="forgotStep()">Continue</button></div>`);
}
function forgotStep(){
  if($('fpStep2').classList.contains('hidden')){
    const e=$('fpEmail').value.trim().toLowerCase();
    if(!isEmail(e)){$('fpEmailErr').textContent='Enter a valid email address.';return}
    const t=findByEmail(e);if(!t||!t.password){$('fpEmailErr').textContent='No account found for this email.';return}
    S._fp=e;$('fpStep2').classList.remove('hidden');$('fpAction').textContent='Set new password';
  }else{
    const n=$('fpNew').value;if(n.length<8){$('fpNewErr').textContent='Password must be at least 8 characters.';return}
    findByEmail(S._fp).password=n;save();closeModal();toast('Password updated. Sign in with your new password.','success');
  }
}
function login(e){
  e.preventDefault();
  const email=$('email').value.trim().toLowerCase(),pass=$('password').value;
  $('emailErr').textContent='';$('passErr').textContent='';let bad=false;
  if(!isEmail(email)){$('emailErr').textContent='Enter a valid email address.';bad=true}
  if(!pass){$('passErr').textContent='Password is required.';bad=true}
  if(bad)return;
  if(S.role==='authority'){
    if(email!=='authority@example.com'||pass!=='Authority@123'){$('passErr').textContent='Invalid authority credentials.';return}
    S.user={name:'Safety Authority',email,id:'AUTH-001'};
  }else{
    const t=findByEmail(email);
    if(!t||!t.password){$('emailErr').textContent='No account found on this device. Create an account first.';return}
    if(t.password!==pass){$('passErr').textContent='Incorrect password.';return}
    S.user={...t};
  }
  enterApp();
}
function loginGuest(){
  const p=jitter(DC,.004),id='GUEST-'+Math.floor(1000+Math.random()*8999);
  const t={name:'Guest Explorer',id,email:id.toLowerCase()+'@safetrail.local',phone:'Not provided',blood:'Not provided',allergy:'Not provided',zone:'Outside monitored zones',status:'Safe',lat:p.lat,lng:p.lng,locationSource:'demo'};
  t.identityHash=idHash(t);S.tourists.push(t);save();
  S.role='tourist';S.user={...t};toast('Continuing as guest. Some features are limited.','warning');enterApp();
}
function register(e){
  e.preventDefault();
  const name=cleanText($('rname').value,50),email=$('remail').value.trim().toLowerCase(),phone=$('rphone').value.trim(),fp=$('rfamilyPhone').value.trim(),pw=$('rpass').value,cf=$('rconfirm').value;
  ['rnameErr','remailErr','rphoneErr','rfamilyPhoneErr','rpassErr','rconfirmErr'].forEach(i=>$(i).textContent='');
  let bad=false;const err=(i,m)=>{$(i).textContent=m;bad=true};
  if(!isName(name))err('rnameErr','Enter a valid full name (letters only).');
  if(!isEmail(email))err('remailErr','Enter a valid email address.');else if(findByEmail(email))err('remailErr','An account with this email already exists. Sign in instead.');
  if(!isPhone(phone))err('rphoneErr','Enter a valid 10-digit mobile number.');
  if(fp&&!isPhone(fp))err('rfamilyPhoneErr','Enter a valid 10-digit number.');
  if(pw.length<8)err('rpassErr','Password must be at least 8 characters.');
  if(pw!==cf)err('rconfirmErr','Passwords do not match.');
  if(bad)return;
  const p=jitter(DC,.004);
  const t={name,email,phone,familyContactName:cleanText($('rfamilyName').value,50)||'Not provided',familyContactPhone:fp||'Not provided',blood:$('blood').value,allergy:cleanText($('allergy').value,120)||'None',id:newId('ST'),password:pw,zone:'Outside monitored zones',status:'Safe',lat:p.lat,lng:p.lng,locationSource:'demo'};
  t.identityHash=idHash(t);S.tourists.push(t);save();
  S.role='tourist';S.user={...t};toast('Registration successful. Digital ID generated.','success');enterApp();
}
function logout(){stopTracking(true);S.user=null;S.active=null;showLanding();toast('Signed out','info')}
function resetSystemData(){stopTracking(true);S.active=null;S.geo={};seed();save();const t=findByEmail('tourist@example.com');S.role='tourist';S.user={...t};S.loc=null;S.zone='Location not acquired';S.safety='UNKNOWN';go('overview');toast('Demo data reset','success')}

// ---------- ui helpers ----------
const stat=(l,n)=>`<div class="card"><div class="stat-label">${l}</div><div class="stat-num">${esc(n)}</div></div>`;
const detail=(a,b)=>`<div class="row"><span class="muted">${a}</span><b>${esc(b)}</b></div>`;
const sevClass=i=>i.status==='Resolved'?'safe':i.severity==='HIGH'?'danger-b':'warning';
function incidentRow(i){return `<div class="row"><div><b>${esc(i.id)} · ${esc(i.type)}</b><small>${esc(i.tourist)} · ${esc(i.zone||'—')} · ${esc(i.time||'Just now')}</small></div><div style="text-align:right"><span class="badge ${sevClass(i)}">${esc(i.status)}</span>${S.role==='authority'&&i.status!=='Resolved'?` <button class="btn" style="padding:6px 9px" onclick="selectIncident('${esc(i.id)}')">Manage</button>`:''}${i.auditRef?`<div class="mono" style="font-size:10px;color:var(--muted);margin-top:4px;cursor:pointer" title="Copy audit reference" onclick="copyText('${esc(i.auditRef)}')">${esc(i.auditRef.slice(0,10))}…${esc(i.auditRef.slice(-6))} ⧉</div>`:''}</div></div>`}
function copyText(t){navigator.clipboard?.writeText(t).then(()=>toast('Copied','success')).catch(()=>toast('Could not copy','warning'))}
const isGeo=i=>i&&(i.source==='geofence'||i.type==='Geofence Warning'||i.type==='Restricted Zone Entry');
const openInc=()=>S.incidents.filter(i=>i.status!=='Resolved');
function identityRef(t){if(!t)return '—';if(!t.identityHash){t.identityHash=idHash(t);save()}return t.identityHash.slice(0,14)+'…'+t.identityHash.slice(-6)}

// ---------- risk ----------
function assess(t){
  if(!t)return{score:0,level:'No data',cls:'safe',factors:['No tourist selected.'],open:[]};
  let s=5;const f=['Base monitoring score: +5'];const zone=String(t.zone||'');
  if(/Restricted|Cliff/i.test(zone)||S.zones.find(z=>z.name===zone&&z.type==='Restricted')){s+=55;f.push('Restricted zone: +55')}
  else if(S.zones.find(z=>z.name===zone&&z.type==='Caution')){s+=30;f.push('Caution zone: +30')}
  else f.push('Safe or outside monitored zones: +0');
  if(t.status==='SOS'){s+=25;f.push('SOS status: +25')}else if(t.status==='Alert'){s+=12;f.push('Active safety alert: +12')}
  const open=S.incidents.filter(i=>i.touristId===t.id&&i.status!=='Resolved');
  if(open.some(i=>i.severity==='HIGH')){s+=25;f.push('Open HIGH incident: +25')}else if(open.some(i=>i.severity==='MEDIUM')){s+=15;f.push('Open MEDIUM incident: +15')}else if(open.length){s+=5;f.push('Open LOW incident: +5')}
  if(Number(t.accuracy)>100){s+=5;f.push('GPS accuracy above 100 m: +5')}
  s=Math.min(95,s);
  return{score:s,level:s>=70?'High':s>=35?'Medium':'Low',cls:s>=70?'danger-b':s>=35?'warning':'safe',factors:f,open};
}
function recommended(){
  if(!S.loc)return{type:'warning',title:'Get your current location',text:'Acquire a GPS position so the safety check can compare you with the monitored zones.'};
  if(S.active&&S.active.touristId===S.user.id&&S.active.severity==='HIGH')return{type:'danger',title:'Use SOS support and move to a safer point',text:`A ${S.active.type} is active. Keep your phone available.`};
  if(S.safety==='DANGER')return{type:'danger',title:'Leave the restricted zone',text:`You are inside ${S.zone}. Move outside the boundary, or use SOS if you cannot leave safely.`};
  if(S.safety==='CAUTION')return{type:'warning',title:'Proceed carefully',text:`You are inside ${S.zone}. Stay alert and avoid isolated areas.`};
  if(S.loc.accuracy>100)return{type:'warning',title:'Improve location confidence',text:`GPS accuracy is about ${Math.round(S.loc.accuracy)} m. Move to an open area.`};
  return{type:'safe',title:'Continue normally',text:'You are outside the monitored danger boundaries. Keep location monitoring active.'};
}

// ---------- tourist pages ----------
function locPanel(){const l=S.loc;return `<h3 class="section-title">Live location controls</h3>${detail('Coordinates',l?l.lat.toFixed(6)+', '+l.lng.toFixed(6):'Not acquired')}${detail('Accuracy',l&&l.accuracy?Math.round(l.accuracy)+' metres':'Not available')}${detail('Current zone',S.zone)}${detail('Network',S.net)}${detail('Tracking',S.tracking?'Active':'Stopped')}${detail('Last updated',l&&l.updatedAt?new Date(l.updatedAt).toLocaleTimeString('en-IN'):'Not available')}<div class="actions" style="margin-top:14px"><button class="btn primary" onclick="requestLocation()">Get current location</button>${S.tracking?'<button class="btn" onclick="stopTracking()">Stop tracking</button>':'<button class="btn" onclick="startTracking()">Start live tracking</button>'}</div>`}
function touristPage(){
  const u=S.user,mine=S.incidents.filter(i=>i.touristId===u.id),open=mine.filter(i=>i.status!=='Resolved'),act=recommended();
  switch(S.page){
  case 'overview':return `<div class="grid stats">${stat('Safety status',S.safety)}${stat('Current zone',S.zone)}${stat('Open incidents',open.length)}${stat('Tracking',S.tracking?'ON':'OFF')}</div>
    <div class="card" style="margin-top:16px"><div class="notice ${act.type}"><b>${esc(act.title)}</b><br>${esc(act.text)}</div></div>
    <div class="grid two" style="margin-top:16px"><div class="card"><h3 class="section-title">Quick actions</h3>
    <div class="row"><div><b>Live location</b><small>${S.loc?'GPS connected':'Not acquired yet'}</small></div><button class="btn" onclick="go('location')">Open</button></div>
    <div class="row"><div><b>Emergency SOS</b><small>Alert the response authority</small></div><button class="btn danger" onclick="go('sos')">Open</button></div>
    <div class="row"><div><b>Digital ID</b><small>${esc(u.id)}</small></div><button class="btn" onclick="go('digital')">View</button></div></div>
    <div class="card"><h3 class="section-title">Recent incidents</h3>${mine.length?mine.slice(0,4).map(incidentRow).join(''):'<div class="notice safe">No incidents recorded.</div>'}</div></div>`;
  case 'location':return `<div class="grid two"><div class="card">${mapBox('own')}</div><div class="card" id="locInfo">${locPanel()}</div></div>`;
  case 'zones':return `<div class="card" style="margin-bottom:16px">${mapBox('zones')}</div><div class="card"><h3 class="section-title">Monitored zones</h3>${S.zones.map(z=>`<div class="row"><div><b>${esc(z.name)}</b><small>${z.type} · ${z.risk} risk · ${radiusOf(z)} m</small></div><span class="badge ${z.type==='Safe'?'safe':z.type==='Caution'?'warning':'danger-b'}">${z.type}</span></div>`).join('')}</div>`;
  case 'ai':{const a=assess(me()||u);return `<div class="grid two"><div class="card"><div class="eyebrow">Rule-based safety assessment</div><div class="ai-score">${a.score}<span class="muted" style="font-size:16px">/100</span></div><div class="risk-meter"><div class="risk-meter-fill" style="width:${a.score}%"></div></div><div style="margin-top:12px"><span class="badge ${a.cls}">${a.level} risk</span></div><button class="btn primary" style="margin-top:12px" onclick="refreshAI()">Refresh assessment</button></div>
    <div class="card"><h3 class="section-title">Recommended action</h3><div class="notice ${act.type}"><b>${esc(act.title)}</b><br>${esc(act.text)}</div><h3 class="section-title" style="margin-top:16px">Why this score?</h3>${a.factors.map(f=>`<div class="row"><span>${esc(f)}</span></div>`).join('')}</div></div>`}
  case 'sos':{const m=S.active&&S.active.touristId===u.id?S.active:null;return `<div class="card"><h3 class="section-title">Emergency / SOS</h3><p class="muted">Your location and Digital ID are shared with the response authority.</p>${m?`<div class="notice danger"><b>${esc(m.type)} active</b><br>Status: ${esc(m.status)}${m.assignedTo?' · '+esc(m.assignedTo):''}</div>`:''}<div class="actions" style="margin-top:14px"><button class="btn danger" onclick="confirmSOS()">Send SOS</button><button class="btn" onclick="voiceSOS()">Voice SOS</button></div></div>`}
  case 'medical':return `<div class="card"><h3 class="section-title">Medical emergency contact</h3>${detail('Blood group',u.blood||'Not provided')}${detail('Allergies',u.allergy||'None')}${detail('Family contact',u.familyContactName||'Not provided')}${detail('Family contact number',u.familyContactPhone||'Not provided')}<div class="notice" style="margin-top:12px">Responders can view this record through the authority portal.</div></div>`;
  case 'digital':return `<div class="idbox"><div class="eyebrow">Digital tourist ID</div><h2>${esc(u.name)}</h2>${detail('Tourist ID',u.id)}${detail('Identity reference',identityRef(me()||u))}${detail('Email',u.email||'—')}<div class="actions" style="margin-top:14px"><button class="btn primary" onclick="drawQR('myQR',[S.user.id,S.user.name,S.user.email].join('|'))">Generate QR</button></div><div id="myQR" class="qr"></div></div>`;
  case 'incidents':return `<div class="card"><h3 class="section-title">My incidents</h3>${mine.length?mine.map(incidentRow).join(''):'<div class="notice safe">You have no incident records.</div>'}</div>`;
  case 'profile':return `<div class="card"><h3 class="section-title">Profile</h3>${detail('Name',u.name)}${detail('Email',u.email||'—')}${detail('Phone',u.phone||'—')}${detail('Tourist ID',u.id)}<div class="actions" style="margin-top:14px"><button class="btn" onclick="logout()">Sign out</button><button class="btn danger" onclick="resetSystemData()">Reset demo data</button></div></div>`;
  default:S.page='overview';return touristPage();
  }
}

// ---------- authority pages ----------
function authorityPage(){
  const open=openInc();
  switch(S.page){
  case 'overview':{
    const geo=open.filter(isGeo),sos=open.filter(i=>i.type==='SOS Alert'),high=open.filter(i=>i.severity==='HIGH').length,crit=S.tourists.filter(t=>assess(t).score>=70).length;
    const msg=high?`${high} high-severity case(s) need immediate review`:geo.length?`${geo.length} active geofence alert(s)`:crit?`${crit} tourist(s) score high-risk`:'No active safety escalation';
    return `<div class="grid stats">${stat('Registered tourists',S.tourists.length)}${stat('Open incidents',open.length)}${stat('Active geofence alerts',geo.length)}${stat('SOS requiring response',sos.length)}</div>
    <div class="card" style="margin-top:16px"><div class="notice ${high||geo.length||crit?'warning':'safe'}"><b>Attention</b><br>${esc(msg)}</div></div>
    <div class="grid two" style="margin-top:16px"><div class="card"><h3 class="section-title">Response queue</h3>${open.length?open.slice(0,5).map(incidentRow).join(''):'<div class="notice safe">All incidents are resolved.</div>'}</div>
    <div class="card"><h3 class="section-title">Shortcuts</h3><div class="row"><div><b>Live tourist map</b><small>${S.tourists.filter(t=>t.locationSource==='gps').length} GPS-connected</small></div><button class="btn" onclick="go('locations')">Open map</button></div><div class="row"><div><b>Geofence alerts</b><small>${geo.length} active</small></div><button class="btn" onclick="go('alerts')">Review</button></div><div class="row"><div><b>Emergency response</b><small>${open.length} in workflow</small></div><button class="btn" onclick="go('response')">Open</button></div></div></div>`}
  case 'monitor':{
    const q=S.filter.trim().toLowerCase(),list=q?S.tourists.filter(t=>(t.name+' '+t.id+' '+t.zone).toLowerCase().includes(q)):S.tourists;
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3 class="section-title" style="margin:0">Tourist monitoring</h3><p class="muted" style="margin:5px 0 0">Registered tourists, status and latest location.</p></div><input class="search-box" placeholder="Search by name, ID or zone…" value="${esc(S.filter)}" oninput="filterTourists(this.value)"></div>
    <div class="monitor-list"><div class="monitor-item monitor-head"><div>Tourist</div><div>Tourist ID</div><div>Zone</div><div>Status</div><div>Action</div></div>${list.length?list.map(t=>{const st=t.status==='SOS'?'SOS':t.status==='Alert'?'Alert':'Safe';return `<div class="monitor-item"><div><b>${esc(t.name)}</b><small class="muted" style="display:block">${esc(t.email||'')} · ${t.locationSource==='gps'?'GPS connected':'Location not connected'}</small></div><div class="mono">${esc(t.id)}</div><div>${esc(t.zone||'Outside monitored zones')}</div><div><span class="badge ${st==='SOS'?'danger-b':st==='Alert'?'warning':'safe'}">${st}</span></div><div><button class="btn primary" onclick="viewTourist('${esc(t.id)}')">View details</button></div></div>`}).join(''):'<div class="notice" style="margin:14px">No tourists match your search.</div>'}</div></div>`}
  case 'touristDetail':{
    const t=S.tourists.find(x=>x.id===S.selId);if(!t){S.page='monitor';return authorityPage()}
    const inc=S.incidents.filter(i=>i.touristId===t.id);
    return `<div class="detail-page"><div class="detail-toolbar"><button class="btn" onclick="go('monitor')">← Back to Tourist Monitoring</button></div>
    <div class="grid two" style="margin-top:15px"><div class="card"><h2 style="margin:0 0 4px">${esc(t.name)}</h2><p class="muted" style="margin-top:0">${esc(t.id)}</p>${detail('Current zone',t.zone||'Outside monitored zones')}${detail('Status',t.status)}${detail('Risk score',assess(t).score+'/100')}${detail('Latest location',t.lat!=null?Number(t.lat).toFixed(6)+', '+Number(t.lng).toFixed(6)+(t.locationSource==='demo'?' (demo)':''):'Unavailable')}${detail('Last update',t.updatedAt?new Date(t.updatedAt).toLocaleString('en-IN'):'Not available')}${detail('Identity reference',identityRef(t))}</div>
    <div class="card"><h3 class="section-title">Response information</h3>${detail('Medical record',(t.blood||'Not provided')+' · '+(t.allergy||'No allergies on file'))}${detail('Family contact',(t.familyContactName||'Not provided')+' '+(t.familyContactPhone||''))}${detail('Incidents recorded',inc.length)}<div class="actions" style="margin-top:15px"><button class="btn primary" onclick="S.verifyId='${esc(t.id)}';S.verified=null;go('verify')">Verify identity</button><button class="btn" onclick="go('locations')">Live location</button></div></div></div>
    <div class="card" style="margin-top:15px"><h3 class="section-title">Incident history</h3>${inc.length?inc.map(incidentRow).join(''):'<div class="notice">No incidents recorded.</div>'}</div></div>`}
  case 'locations':return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3 class="section-title" style="margin:0">Live tourist locations</h3><p class="muted" style="margin:4px 0 0">Live GPS and last-known positions.</p></div><button class="btn" onclick="refreshMonitor(true)">↻ Refresh map</button></div><div style="margin-top:14px">${mapBox('monitor')}</div></div>`;
  case 'alerts':{
    const act=open.filter(isGeo);
    return `<div class="grid two"><div class="card"><h2 style="margin:0 0 3px">Geofence alerts</h2><p class="muted">Boundary events generated by GPS zone checks.</p><div class="grid three">${stat('GPS connected',S.tourists.filter(t=>t.locationSource==='gps').length)}${stat('Monitored zones',S.zones.length)}${stat('Active breaches',act.length)}</div>
    ${act.length?act.map(i=>`<div class="card" style="margin-top:10px"><div class="row"><div><b>${esc(i.type)}</b><small>${esc(i.tourist)} · ${esc(i.zone)} · ${esc(i.severity)}</small></div><div class="actions"><span class="badge danger-b">${esc(i.status)}</span><button class="btn" onclick="selectIncident('${esc(i.id)}')">Manage</button></div></div></div>`).join(''):'<div class="notice safe" style="margin-top:15px"><b>No active geofence alerts.</b></div>'}</div>
    <div class="card"><h3 class="section-title">Monitored boundaries</h3>${S.zones.map(z=>`<div class="row"><div><b>${esc(z.name)}</b><small>${z.type} · ${radiusOf(z)} m</small></div><span class="badge ${z.type==='Safe'?'safe':z.type==='Caution'?'warning':'danger-b'}">${z.type}</span></div>`).join('')}<button class="btn primary" style="margin-top:12px" onclick="go('zones')">Manage danger zones</button></div></div>`}
  case 'ai':{
    const ranked=S.tourists.map(t=>({t,a:assess(t)})).sort((x,y)=>y.a.score-x.a.score),sel=S.tourists.find(t=>t.id===S.aiId)||ranked[0]?.t,a=assess(sel);
    const hi=ranked.filter(x=>x.a.score>=70).length,md=ranked.filter(x=>x.a.score>=35&&x.a.score<70).length;
    return `<div class="card"><div class="eyebrow">Rule-based decision support</div><h2 style="margin:8px 0 4px">AI incident analysis</h2><div class="field" style="max-width:500px"><label>Tourist</label><select onchange="S.aiId=this.value;render()">${ranked.map(({t,a:x})=>`<option value="${esc(t.id)}" ${sel&&t.id===sel.id?'selected':''}>${esc(t.name)} — ${esc(t.id)} · ${x.score}/100</option>`).join('')}</select></div></div>
    <div class="grid four" style="margin-top:15px">${stat('High risk',hi)}${stat('Medium risk',md)}${stat('Low risk',ranked.length-hi-md)}${stat('Open incidents',open.length)}</div>
    <div class="grid two" style="margin-top:15px"><div class="card"><h3 class="section-title">${esc(sel?.name||'')}</h3><div class="ai-score">${a.score}<span class="muted" style="font-size:16px">/100</span></div><div class="risk-meter"><div class="risk-meter-fill" style="width:${a.score}%"></div></div><div style="margin-top:12px"><span class="badge ${a.cls}">${a.level} risk</span></div></div>
    <div class="card"><h3 class="section-title">Why this score?</h3>${a.factors.map(f=>`<div class="row"><span>${esc(f)}</span></div>`).join('')}</div></div>`}
  case 'incidents':return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 class="section-title">Incident management</h3><button class="btn primary" onclick="openCreateIncident()">Create incident</button></div>${activeBox()}${S.incidents.map(incidentRow).join('')}</div>`;
  case 'verify':{
    const f=S.tourists.find(t=>t.id===S.verifyId),ok=f&&S.verified===f.id;
    return `<div class="grid two"><div class="idbox"><div class="eyebrow">Authority verification</div><h2>Digital ID lookup</h2><p class="muted">Enter a registered Tourist ID.</p><div class="field"><label>Tourist ID</label><input id="verifyId" placeholder="e.g. ST-00124" value="${esc(S.verifyId||'')}" onkeydown="if(event.key==='Enter')runVerify()"><div id="verifyErr" class="error"></div></div><div class="actions"><button class="btn primary" onclick="runVerify()">Look up record</button><button class="btn" onclick="S.verifyId=null;S.verified=null;render()">Clear</button></div>
    ${f?`<div class="verify-result">${detail('Tourist',f.name)}${detail('Tourist ID',f.id)}${detail('Zone',f.zone||'Outside monitored zones')}${detail('Identity reference',identityRef(f))}<div class="actions" style="margin-top:14px"><button class="btn green" onclick="S.verified=S.verifyId;toast('Identity verified','success');render()">${ok?'Verified ✓':'Verify identity'}</button><button class="btn" onclick="drawQR('verifyQR',[S.verifyId,'${esc(f.name)}','${esc(f.identityHash||'')}'].join('|'))">Generate QR</button></div><div id="verifyQR" class="qr"></div></div>`:''}</div>
    <div class="card"><h3 class="section-title">Verification activity</h3>${f?`<div class="notice ${ok?'safe':'warning'}"><b>${ok?'Identity verified':'Record located'}</b><br>${esc(f.name)} · ${esc(f.id)}</div>`:'<div class="notice">No record selected.</div>'}<div class="row"><b>Registered identity records</b><b>${S.tourists.length}</b></div></div></div>`}
  case 'response':{
    const a=S.active&&S.active.status!=='Resolved'?S.active:null,q=[...open].sort((x,y)=>(y.severity==='HIGH')-(x.severity==='HIGH'));
    return `<div class="grid two"><div class="card"><h2 style="margin:0 0 4px">Emergency response</h2><p class="muted">Acknowledge → Assign → Resolve.</p>${a?`<div class="notice danger"><b>${esc(a.type)}</b><br>${esc(a.tourist)} · ${esc(a.touristId||'—')}<br>${esc(a.zone||'—')} · ${esc(a.severity)}</div><div style="margin-top:12px">${detail('Status',a.status)}${detail('Assigned team',a.assignedTo||'Not assigned')}${detail('Location',a.lat!=null?Number(a.lat).toFixed(5)+', '+Number(a.lng).toFixed(5):'Unavailable')}</div>${stepButtons(a)}`:'<div class="notice safe"><b>No active emergency selected.</b><br>Open an incident from the queue.</div>'}</div>
    <div class="card"><h3 class="section-title">Response queue</h3>${q.length?q.map(i=>`<div class="row"><div><b>${esc(i.id)} · ${esc(i.type)}</b><small>${esc(i.tourist)} · ${esc(i.zone||'—')}</small></div><div class="actions"><span class="badge ${i.severity==='HIGH'?'danger-b':'warning'}">${esc(i.severity)}</span><button class="btn" onclick="selectIncident('${esc(i.id)}')">Open</button></div></div>`).join(''):'<div class="notice safe">Queue clear.</div>'}</div></div>`}
  case 'zones':return `<div class="card" style="margin-bottom:16px">${mapBox('editor')}</div><div class="grid two"><div class="card"><h3 class="section-title">Create danger zone</h3><p class="muted">Click the map to place a zone, or add one near the default centre here.</p><form onsubmit="createZone(event)" novalidate><div class="field"><label>Zone name</label><input id="zname" placeholder="Cliff Area"><div id="znameErr" class="error"></div></div><div class="field"><label>Zone type</label><select id="ztype"><option>Restricted</option><option>Caution</option><option>Safe</option></select></div><div class="field"><label>Risk level</label><select id="zrisk"><option>High</option><option>Medium</option><option>Low</option></select></div><div class="field"><label>Radius (metres)</label><input id="zradius" type="number" min="50" max="5000" value="400"></div><button class="btn primary">Create zone</button></form>
    <h3 class="section-title" style="margin-top:22px">Active zones</h3>${S.zones.map((z,i)=>`<div class="row"><div><b>${esc(z.name)}</b><small>${z.type} · ${z.risk} · ${radiusOf(z)} m</small></div><div class="zone-row-actions"><button class="btn" onclick="openZoneEdit(${i})">Edit</button><button class="btn" onclick="confirmRemoveZone(${i})">Remove</button></div></div>`).join('')}</div>
    <div class="card"><h3 class="section-title">Geofence test controls</h3><p class="muted">Place a tourist at a zone centre to trigger the alert pipeline.</p><div class="field"><label>Tourist</label><select id="eventTourist">${S.tourists.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} — ${esc(t.id)}</option>`).join('')}</select></div><div class="zone-control-list">${S.zones.map((z,i)=>`<div class="zone-control zone-${z.type.toLowerCase()}"><span><b>${esc(z.name)}</b><small>${z.type} · ${radiusOf(z)} m</small></span><button class="btn ${z.type==='Restricted'?'danger':z.type==='Caution'?'amber':'green'}" onclick="triggerZone($('eventTourist').value,${i})">${z.type==='Safe'?'Set safe':'Trigger '+z.type.toLowerCase()}</button></div>`).join('')}</div>${S.lastEvent?`<div class="notice" style="margin-top:14px"><b>Last event:</b> ${esc(S.lastEvent)}</div>`:''}</div></div>`;
  case 'reports':{
    const res=S.incidents.filter(i=>i.status==='Resolved').length;
    return `<div class="grid four">${stat('Registered tourists',S.tourists.length)}${stat('Open incidents',open.length)}${stat('SOS alerts',open.filter(i=>i.type==='SOS Alert').length)}${stat('Resolved',res)}</div><div class="card" style="margin-top:15px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h3 class="section-title" style="margin:0">Incident report</h3><button class="btn primary" onclick="exportCSV()">Export CSV</button></div>${S.incidents.length?S.incidents.map(incidentRow).join(''):'<div class="notice" style="margin-top:14px">No incidents recorded.</div>'}</div>`}
  default:S.page='overview';return authorityPage();
  }
}
function filterTourists(q){S.filter=q;render();const el=document.querySelector('.search-box');if(el){el.focus();el.setSelectionRange(q.length,q.length)}}
function viewTourist(id){S.selId=id;go('touristDetail')}
function runVerify(){const id=($('verifyId').value||'').trim().toUpperCase();$('verifyErr').textContent='';S.verified=null;if(!id){$('verifyErr').textContent='Enter a Tourist ID.';return}const f=S.tourists.find(t=>String(t.id).toUpperCase()===id);if(!f){S.verifyId=null;$('verifyErr').textContent='No registered tourist found for this ID.';return}S.verifyId=f.id;render()}
function stepButtons(a){return `<div class="response-actions"><button class="btn" onclick="updateIncident('Acknowledged')" ${a.status!=='New'?'disabled':''}>Acknowledge</button><button class="btn amber" onclick="updateIncident('Assigned')" ${a.status!=='Acknowledged'?'disabled':''}>Assign response</button><button class="btn green" onclick="updateIncident('Resolved')" ${a.status!=='Assigned'?'disabled':''}>Resolve</button></div>`}
function activeBox(){const a=S.active;if(!a||a.status==='Resolved')return '<div class="notice" style="margin:12px 0">No active incident selected. Use Manage on an incident, or create one.</div>';return `<div class="card" style="margin:15px 0"><span class="badge danger-b">${esc(a.severity)}</span><h3>${esc(a.id)}</h3><p><b>${esc(a.tourist)}</b> · ${esc(a.type)}</p><p class="muted">${esc(a.zone||'—')} · ${esc(a.status)}${a.assignedTo?' · '+esc(a.assignedTo):''}</p>${stepButtons(a)}</div>`}
function exportCSV(){const esc2=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const csv=[['Incident ID','Tourist','Tourist ID','Type','Severity','Status','Zone','Assigned','Lat','Lng','Time'],...S.incidents.map(i=>[i.id,i.tourist,i.touristId||'',i.type,i.severity,i.status,i.zone,i.assignedTo||'',i.lat??'',i.lng??'',i.time||''])].map(r=>r.map(esc2).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='incident-report.csv';document.body.appendChild(a);a.click();a.remove();toast(S.incidents.length+' records exported','success')}

// ---------- incidents & SOS ----------
function selectIncident(id){const i=S.incidents.find(x=>x.id===id);if(!i){toast('Incident not found','warning');return}S.active=i;if(!['incidents','response'].includes(S.page)){S.page='response';renderNav()}render()}
function updateIncident(status){
  const a=S.active;if(!a){toast('Select an incident first','warning');return}
  const next={New:'Acknowledged',Acknowledged:'Assigned',Assigned:'Resolved'};
  if(next[a.status]!==status){toast('Follow the sequence: Acknowledge → Assign → Resolve','warning');return}
  a.status=status;if(status==='Assigned')a.assignedTo='Emergency Response Team';
  if(status==='Resolved'){
    const t=S.tourists.find(x=>x.id===a.touristId);
    if(t){const rem=S.incidents.filter(i=>i.touristId===t.id&&i.status!=='Resolved');t.status=!rem.length?'Safe':rem.some(i=>i.severity==='HIGH')?'SOS':'Alert'}
    S.active=null;toast('Incident resolved','success');
  }else toast('Incident status: '+status,'info');
  save();render();
}
function openCreateIncident(){openModal(`<h2>Create incident</h2><div class="field"><label>Tourist</label><select id="ciT">${S.tourists.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} — ${esc(t.id)}</option>`).join('')}</select></div><div class="field"><label>Type</label><select id="ciType"><option>SOS Alert</option><option>Restricted Zone Entry</option><option>Geofence Warning</option><option>Medical Emergency</option></select></div><div class="field"><label>Severity</label><select id="ciSev"><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div><div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createIncident()">Create incident</button></div>`)}
function createIncident(){
  const t=S.tourists.find(x=>x.id===$('ciT').value);if(!t)return;
  const type=$('ciType').value,sev=$('ciSev').value,dup=S.incidents.find(i=>i.touristId===t.id&&i.type===type&&i.status!=='Resolved');
  closeModal();if(dup){S.active=dup;toast(`An active ${type} already exists for ${t.name}`,'warning');render();return}
  const i={id:newId('INC'),tourist:t.name,touristId:t.id,type,severity:sev,status:'New',time:new Date().toLocaleString('en-IN'),zone:t.zone||'Outside monitored zones',source:'authority',lat:t.lat??null,lng:t.lng??null,auditRef:auditRef()};
  S.incidents.unshift(i);S.active=i;t.status=sev==='HIGH'?'SOS':'Alert';save();render();toast('Incident '+i.id+' created','danger');
}
function confirmSOS(){openModal(`<h2>Confirm emergency?</h2><p class="muted">Your location and Digital ID will be shared with the response authority.</p><div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="sendSOS()">Send SOS</button></div>`)}
function sendSOS(){
  closeModal();const u=S.user,ex=S.incidents.find(i=>i.touristId===u.id&&i.type==='SOS Alert'&&i.status!=='Resolved');
  if(ex){S.active=ex;toast('An SOS incident is already active','warning');render();return}
  const i={id:newId('INC'),tourist:u.name,touristId:u.id,type:'SOS Alert',severity:'HIGH',status:'New',time:new Date().toLocaleString('en-IN'),zone:S.zone,lat:S.loc?S.loc.lat:null,lng:S.loc?S.loc.lng:null,accuracy:S.loc?.accuracy||null,auditRef:auditRef(),source:'sos'};
  S.incidents.unshift(i);S.active=i;const t=me();if(t)t.status='SOS';save();toast('SOS sent. Authority workflow updated.','danger');render();
}
function voiceSOS(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){openModal(`<h2>Voice SOS unavailable</h2><p class="muted">This browser has no speech recognition. Use the main SOS button.</p><button class="btn danger" style="width:100%" onclick="closeModal();confirmSOS()">Use SOS</button>`);return}
  openModal(`<h2>Voice SOS</h2><p id="voiceStatus" style="text-align:center"><b>Listening…</b><br><span class="muted">Say "help", "SOS" or "emergency".</span></p><button class="btn" style="width:100%" onclick="closeModal()">Cancel</button>`);
  const r=new SR();r.lang='en-IN';
  r.onresult=e=>{if(/\b(help|sos|emergency)\b/.test((e.results[0][0].transcript||'').toLowerCase())){closeModal();sendSOS()}else $('voiceStatus').innerHTML='<b>Command not recognized.</b>'};
  r.onerror=()=>{const el=$('voiceStatus');if(el)el.innerHTML='<b>Could not hear the command.</b>'};
  try{r.start()}catch(e){}
}
function refreshAI(){const r=me();if(r&&S.loc)applyGeo(r,S.loc.lat,S.loc.lng);render();toast('Assessment refreshed','success')}

// ---------- geofence ----------
function applyGeo(t,lat,lng){
  let inside=null,best=Infinity;
  S.zones.forEach(z=>{const d=haversine({lat,lng},{lat:Number(z.lat),lng:Number(z.lng)});if(d<=radiusOf(z)&&d<best){inside=z;best=d}});
  const prev=S.geo[t.id]||null;
  if(inside){
    t.zone=inside.name;
    if(inside.type==='Safe'&&t.status!=='SOS')t.status='Safe';
    if(inside.type!=='Safe'&&prev!==inside.name){
      const hi=inside.type==='Restricted',i={id:newId('INC'),tourist:t.name,touristId:t.id,type:hi?'Restricted Zone Entry':'Geofence Warning',severity:hi?'HIGH':'MEDIUM',status:'New',time:new Date().toLocaleString('en-IN'),zone:inside.name,lat,lng,auditRef:auditRef(),source:'geofence'};
      S.incidents.unshift(i);if(hi||!S.active)S.active=i;if(t.status!=='SOS')t.status=hi?'SOS':'Alert';
      if(S.role==='tourist'&&S.user&&S.user.id===t.id)toast('Geofence alert: '+inside.name,'danger');
    }
    S.geo[t.id]=inside.name;S.lastEvent=`${t.name} entered ${inside.name} · ${inside.type}`;
  }else{
    t.zone='Outside monitored zones';if(t.status!=='SOS')t.status='Safe';
    S.incidents.forEach(i=>{if(i.touristId===t.id&&isGeo(i)&&i.status!=='Resolved'){i.status='Resolved';if(S.active&&S.active.id===i.id)S.active=null}});
    if(prev)S.lastEvent=`${t.name} left ${prev}`;S.geo[t.id]=null;
  }
  if(S.user&&S.user.id===t.id)setSelfZone(t);
}
function triggerZone(tid,zi){
  const z=S.zones[zi],t=S.tourists.find(x=>x.id===tid);if(!z||!t){toast('Select a valid tourist and zone','warning');return}
  t.lat=Number(z.lat);t.lng=Number(z.lng);t.updatedAt=new Date().toISOString();t.locationSource='demo';
  if(z.type==='Safe'&&t.status==='SOS'){t.status='Safe';S.incidents.forEach(i=>{if(i.touristId===t.id&&i.status!=='Resolved')i.status='Resolved'});S.active=null}
  applyGeo(t,t.lat,t.lng);save();render();toast(`${t.name} placed in ${z.name}`,z.type==='Safe'?'success':'danger');
}

// ---------- zones ----------
function readZone(p){const name=cleanText($(p+'name').value,80);if(!name){$(p+'nameErr').textContent='Enter a zone name.';return null}return{name,type:$(p+'type').value,risk:$(p+'risk').value,radius:Math.max(50,Math.min(5000,Number($(p+'radius').value)||400))}}
function createZone(e){e.preventDefault();$('znameErr').textContent='';const z=readZone('z');if(!z)return;Object.assign(z,jitter(DC,.006));S.zones.push(z);save();toast('Zone created near the default centre. Click the map for exact placement.','success');render()}
function zoneForm(p,z){return `<div class="field"><label>Zone name</label><input id="${p}name" value="${esc(z.name||'')}" placeholder="e.g. Cliff Area"><div id="${p}nameErr" class="error"></div></div><div class="field"><label>Zone type</label><select id="${p}type">${['Restricted','Caution','Safe'].map(x=>`<option ${z.type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Risk level</label><select id="${p}risk">${['High','Medium','Low'].map(x=>`<option ${z.risk===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Radius (metres)</label><input id="${p}radius" type="number" min="50" max="5000" value="${radiusOf(z)}"></div>`}
function openZoneCreate(ll){openModal(`<h2>Add a new zone</h2><p class="muted">Placed at ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</p>${zoneForm('mz',{type:'Restricted',risk:'High'})}<div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmZoneCreate(${ll.lat},${ll.lng})">Add zone</button></div>`)}
function confirmZoneCreate(lat,lng){const z=readZone('mz');if(!z)return;S.zones.push({...z,lat,lng});save();closeModal();toast('Zone added','success');render()}
function openZoneEdit(i){const z=S.zones[i];if(!z)return;openModal(`<h2>Edit zone</h2>${zoneForm('ez',z)}<div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveZoneEdit(${i})">Save changes</button></div>`)}
function saveZoneEdit(i){const n=readZone('ez');if(!n)return;Object.assign(S.zones[i],n);save();closeModal();toast('Zone updated','success');render()}
function confirmRemoveZone(i){const z=S.zones[i];if(!z)return;openModal(`<h2>Remove zone?</h2><p class="muted">This removes "<b>${esc(z.name)}</b>" from the map.</p><div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="closeModal();removeZone(${i})">Remove zone</button></div>`)}
function removeZone(i){const z=S.zones[i];if(!z)return;S.zones.splice(i,1);S.tourists.forEach(t=>{if(t.zone===z.name){t.zone='Outside monitored zones';if(t.status==='Alert')t.status='Safe'}});S.incidents.forEach(x=>{if(x.zone===z.name&&isGeo(x)&&x.status!=='Resolved')x.status='Resolved'});if(S.active&&S.active.status==='Resolved')S.active=null;save();toast('Zone removed','info');render()}

// ---------- maps ----------
function mapBox(mode){
  const id='map_'+Math.random().toString(36).slice(2,9);setTimeout(()=>initMap(id,mode),0);
  if(mode==='own')return `<div class="mapbox" id="${id}"><div class="map-btns"><button type="button" title="Get exact live location" onclick="event.stopPropagation();requestLocation()">⌖</button></div></div>`;
  return `<div class="mapbox mini-map" id="${id}"></div>`;
}
function cleanupMaps(){Object.keys(maps).forEach(id=>{const m=maps[id],c=m.getContainer();if(!c||!document.body.contains(c)){try{m.remove()}catch(e){}delete maps[id];if(m===ownMap){ownMap=null;ownMarker=null;ownCircle=null}}})}
function touristColor(t){const z=S.zones.find(x=>x.name===t.zone);return t.status==='SOS'||(z&&z.type==='Restricted')?ZC.Restricted:z&&z.type==='Caution'?ZC.Caution:ZC.Safe}
function drawTourists(m){
  m.eachLayer(l=>{if(l.options&&l.options._t)m.removeLayer(l)});
  S.tourists.forEach(t=>{if(t.lat==null||t.lng==null)return;L.circleMarker([Number(t.lat),Number(t.lng)],{_t:1,radius:t.locationSource==='gps'?10:8,color:'#fff',weight:2,fillColor:touristColor(t),fillOpacity:1}).addTo(m).bindPopup(`<b>${esc(t.name)}</b><br>${esc(t.id)}<br>${esc(t.zone||'Outside monitored zones')}<br>${t.locationSource==='gps'?'LIVE GPS':'Last known position'}`)});
}
function initMap(id,mode){
  const el=$(id);if(!el||!window.L)return;
  const c=mode==='own'&&S.loc?S.loc:DC,m=L.map(id).setView([c.lat,c.lng],mode==='own'&&S.loc?17:14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);
  S.zones.forEach(z=>L.circle([z.lat,z.lng],{radius:radiusOf(z),color:ZC[z.type],fillColor:ZC[z.type],fillOpacity:.16,weight:2}).addTo(m).bindPopup(`<b>${esc(z.name)}</b><br>${z.type} zone · ${z.risk} risk`));
  if(mode==='own'){ownMap=m;ownMarker=null;ownCircle=null;if(S.loc)updateOwn(S.loc.lat,S.loc.lng,S.loc.accuracy)}
  else if(mode!=='zones')drawTourists(m);
  if(mode==='editor')m.on('click',e=>openZoneCreate(e.latlng));
  if(mode==='monitor')m._monitor=true;
  maps[id]=m;setTimeout(()=>m.invalidateSize(),80);
}
function refreshMonitor(manual){const m=Object.values(maps).find(x=>x._monitor&&document.body.contains(x.getContainer()));if(!m){if(manual)toast('Map not ready','warning');return}drawTourists(m);if(manual)toast('Map refreshed','success')}
setInterval(()=>{if(S.user&&S.role==='authority'&&S.page==='locations')refreshMonitor(false)},2000);
function updateOwn(lat,lng,acc){
  if(!ownMap||!document.body.contains(ownMap.getContainer()))return;
  const col=S.safety==='DANGER'?ZC.Restricted:S.safety==='CAUTION'?ZC.Caution:ZC.Safe;
  if(!ownMarker)ownMarker=L.circleMarker([lat,lng],{radius:9,color:'#fff',weight:3,fillColor:col,fillOpacity:1}).addTo(ownMap).bindPopup('Current device location');
  else{ownMarker.setLatLng([lat,lng]);ownMarker.setStyle({fillColor:col})}
  if(acc>0){if(!ownCircle)ownCircle=L.circle([lat,lng],{radius:acc,color:col,fillColor:col,fillOpacity:.08,weight:1}).addTo(ownMap);else ownCircle.setLatLng([lat,lng]).setRadius(acc)}
  ownMap.setView([lat,lng],Math.max(ownMap.getZoom(),17),{animate:false});
}

// ---------- GPS ----------
function onPos(pos){
  const lat=pos.coords.latitude,lng=pos.coords.longitude,acc=Math.round(pos.coords.accuracy||0),now=new Date().toISOString();
  S.loc={lat,lng,accuracy:acc,updatedAt:now};
  const r=me();if(r){Object.assign(r,{lat,lng,accuracy:acc,updatedAt:now,locationSource:'gps'});applyGeo(r,lat,lng)}
  save();updateOwn(lat,lng,acc);
  const p=$('locInfo');if(p)p.innerHTML=locPanel();
}
function onGeoErr(err){
  const m={1:'Location permission was denied. Enable it in your browser settings.',2:'Location could not be determined. Try outdoors.',3:'Location request timed out. Try again.'};
  stopTracking(true);toast(m[err.code]||'Unable to get location.','danger');
}
function requestLocation(){
  if(!navigator.geolocation){toast('Location is not supported by this browser.','danger');return}
  toast('Getting a fresh GPS fix…','info');
  navigator.geolocation.getCurrentPosition(p=>{onPos(p);startTracking(true);toast('GPS updated','success');if(S.page==='overview'||S.page==='ai')render()},onGeoErr,{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function startTracking(quiet){
  if(!navigator.geolocation){toast('Location is not supported by this browser.','danger');return}
  if(S.tracking){if(!quiet)toast('Tracking is already active','info');return}
  S.tracking=true;S.watch=navigator.geolocation.watchPosition(onPos,onGeoErr,{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  if(!quiet)toast('Real-time geofence monitoring is active','success');
  const p=$('locInfo');if(p)p.innerHTML=locPanel();
}
function stopTracking(quiet){
  if(S.watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(S.watch);
  S.watch=null;S.tracking=false;
  if(!quiet){toast('Location monitoring stopped','info')}
  const p=$('locInfo');if(p)p.innerHTML=locPanel();
}

// ---------- QR ----------
function drawQR(id,text){
  const el=$(id);if(!el)return;el.innerHTML='';
  if(window.QRCode){new QRCode(el,{text,width:150,height:150,colorDark:'#252723',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});toast('QR generated','success')}
  else toast('QR library failed to load. Check your internet connection.','warning');
}

// ---------- boot ----------
function startClock(){const tick=()=>{const t=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});$('liveClock').textContent=t;$('landingLiveTime').textContent='ACTIVE · '+t+' IST'};tick();setInterval(tick,1000)}
try{if(localStorage.getItem('sts_theme')==='light'){document.body.classList.add('light');$('themeToggle').textContent='☀'}}catch(e){}
load();save();startClock();
$('loginForm').addEventListener('submit',login);
$('registerForm').addEventListener('submit',register);
window.addEventListener('storage',e=>{
  if(e.key!==KEY||!S.user)return;
  try{const d=JSON.parse(e.newValue);if(d){S.tourists=d.tourists||S.tourists;S.incidents=d.incidents||S.incidents;S.zones=d.zones||S.zones;
    if(S.role==='authority'&&!['verify','zones'].includes(S.page)){render()}}}catch(err){}
});
window.addEventListener('beforeunload',()=>stopTracking(true));
window.addEventListener('online',()=>{S.net='ONLINE'});window.addEventListener('offline',()=>{S.net='OFFLINE'});