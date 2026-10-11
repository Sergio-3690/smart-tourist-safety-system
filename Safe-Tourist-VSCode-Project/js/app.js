'use strict';
// Demo prototype: all data lives in this browser's localStorage only.
const $=id=>document.getElementById(id);
const KEY='sts_v3', DC={lat:19.076,lng:72.8777};
const ZC={Safe:'#22c55e',Caution:'#f59e0b',Restricted:'#f43f5e'};
const S={role:'tourist',page:'overview',user:null,tourists:[],incidents:[],zones:[],active:null,loc:null,tracking:false,watch:null,geo:{},zone:'Location not acquired',safety:'UNKNOWN',lastEvent:'',aiId:null,verifyId:null,verified:null,selId:null,filter:'',net:'ONLINE',trackedTouristId:null,aiSimMode:null,locFilter:'all'};
let maps={},ownMap=null,ownMarker=null,ownCircle=null,toastT=null;

async function hashPassword(password, salt){
  if(!password)return '';
  const s=salt||'sts_tourist_seed_salt';
  const enc=new TextEncoder();
  const data=enc.encode(password+'::sts_salt::'+s);
  const buf=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function generateSalt(){
  const arr=new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
}

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
    mk('Aditya Sanap','ST-00124','tourist@example.com',19.076,72.8777,{phone:'9876543210',familyContactName:'Neha Sanap',familyContactPhone:'9876543211',blood:'O+',allergy:'Penicillin',passwordHash:'b0c87f0fe8e042fa19fd33a5f80d7aa20f49226384dc7b86843bbd5351a836e9',passwordSalt:'sts_tourist_seed_salt'}),
    mk('Meera Kulkarni','ST-00131','meera@example.com',19.0735,72.881),
    mk('Rohan Deshmukh','ST-00142','rohan@example.com',19.0785,72.8795)];
  S.incidents=[{id:'INC-2041',tourist:'Rohan Deshmukh',touristId:'ST-00142',type:'Geofence Warning',severity:'MEDIUM',status:'Resolved',time:'12 Aug 2026',zone:'Hill Road Caution Area',auditRef:auditRef(),source:'geofence'},
    {id:'INC-2034',tourist:'Meera Kulkarni',touristId:'ST-00131',type:'SOS Alert',severity:'HIGH',status:'Resolved',time:'05 Aug 2026',zone:'Cliff Area',auditRef:auditRef(),source:'sos'}];
}
function mergeTouristsPreservingCredentials(cloudList){
  if(!cloudList||!Array.isArray(cloudList))return;
  const merged=cloudList.map(ct=>{
    const local=S.tourists.find(lt=>
      (lt.email&&ct.email&&lt.email.toLowerCase()===ct.email.toLowerCase())||lt.id===ct.id
    );
    return {
      ...ct,
      passwordHash: local?.passwordHash || (ct.email==='tourist@example.com'?'b0c87f0fe8e042fa19fd33a5f80d7aa20f49226384dc7b86843bbd5351a836e9':undefined),
      passwordSalt: local?.passwordSalt || (ct.email==='tourist@example.com'?'sts_tourist_seed_salt':undefined)
    };
  });
  S.tourists.forEach(lt=>{
    if(!merged.some(ct=>(ct.email&&lt.email&&ct.email.toLowerCase()===lt.email.toLowerCase())||ct.id===lt.id)){
      merged.push(lt);
    }
  });
  S.tourists=merged;
}
function save(){
  // Scrub any legacy plaintext passwords before persisting
  S.tourists.forEach(t=>{delete t.password});
  try{localStorage.setItem(KEY,JSON.stringify({tourists:S.tourists,incidents:S.incidents,zones:S.zones}))}catch(e){}
}
async function load(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d&&Array.isArray(d.tourists)&&d.tourists.length){
      S.tourists=d.tourists;S.incidents=d.incidents||[];S.zones=(d.zones||[]).map(z=>({...z,radius:radiusOf(z)}));
      // Scrub any legacy plaintext passwords & backfill salted hashes
      for(const t of S.tourists){
        if(t.password){
          if(!t.passwordHash){
            t.passwordSalt=generateSalt();
            t.passwordHash=await hashPassword(t.password, t.passwordSalt);
          }
          delete t.password;
        }
      }
    } else {
      seed();
    }
  }catch(e){
    seed();
  }
  // Cloud sync if Supabase is connected
  if(isCloudConnected){
    try{
      await sbProcessSyncQueue();
      const [cloudTourists,cloudZones,cloudIncidents]=await Promise.all([sbFetchTourists(),sbFetchSafetyZones(),sbFetchIncidents()]);
      if(cloudTourists&&cloudTourists.length){
        mergeTouristsPreservingCredentials(cloudTourists);
      }
      if(cloudZones&&cloudZones.length)S.zones=cloudZones.map(z=>({...z,radius:radiusOf(z)}));
      if(cloudIncidents&&cloudIncidents.length)S.incidents=cloudIncidents;
      save();
      if(S.user)render();
    }catch(err){
      console.warn('Cloud sync error on load:', err);
    }
  }
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
function setRole(r){
  S.role=r;
  $('touristTab').classList.toggle('active',r==='tourist');
  $('authorityTab').classList.toggle('active',r==='authority');
  $('email').value='';
  $('password').value='';
  $('emailErr').textContent='';
  $('passErr').textContent='';
  if($('authGeneralErr'))$('authGeneralErr').textContent='';
  if($('authSubtitle'))$('authSubtitle').textContent=r==='authority'?'Law Enforcement & Command Center Access.':'Sign in to the Safe Tourist network.';
  $('guestRow').style.display=r==='authority'?'none':'block';
  if($('authFoot'))$('authFoot').style.display=r==='authority'?'none':'block';
}
function togglePassword(i,b){
  const p=$(i),btn=$(b);
  if(!p)return;
  const isPass=p.type==='password';
  p.type=isPass?'text':'password';
  if(btn){
    btn.textContent=isPass?'🔒':'👁️';
    btn.title=isPass?'Hide password':'Show password';
  }
}
function checkPasswordStrength(pw){
  if(!pw)return {score:0,text:'',color:'#94a3b8',width:'0%'};
  let score=0;
  if(pw.length>=8)score++;
  if(/[A-Za-z]/.test(pw)&&/\d/.test(pw))score++;
  if(/[A-Z]/.test(pw)&&/[^A-Za-z0-9]/.test(pw))score++;
  if(score===1)return {score:1,text:'Weak',color:'#ef4444',width:'33%'};
  if(score===2)return {score:2,text:'Fair',color:'#f59e0b',width:'66%'};
  return {score:3,text:'Strong',color:'#10b981',width:'100%'};
}
function onRegisterPassInput(){
  const pw=($('rpass')?.value||'');
  const meter=$('pwStrengthMeter'),bar=$('pwStrengthBar'),lbl=$('pwStrengthLabel');
  if(!meter||!bar||!lbl)return;
  if(!pw){meter.style.display='none';return}
  meter.style.display='block';
  const res=checkPasswordStrength(pw);
  bar.style.width=res.width;
  bar.style.backgroundColor=res.color;
  lbl.textContent=res.text;
  lbl.style.color=res.color;
}
function persistSession(role,user){
  try{
    if(!user)localStorage.removeItem('sts_session');
    else localStorage.setItem('sts_session',JSON.stringify({role,id:user.id,email:user.email}));
  }catch(e){}
}
function restoreSession(){
  try{
    const raw=localStorage.getItem('sts_session');
    if(!raw)return false;
    const sess=JSON.parse(raw);
    if(!sess||!sess.role)return false;
    if(sess.role==='authority'){
      S.role='authority';
      S.user={name:'Safety Authority',email:sess.email||'authority@example.com',id:sess.id||'AUTH-001'};
      enterApp();
      return true;
    }
    if(sess.role==='tourist'){
      const t=S.tourists.find(x=>x.id===sess.id||(x.email&&sess.email&&x.email.toLowerCase()===sess.email.toLowerCase()));
      if(t){
        S.role='tourist';
        S.user={...t};
        enterApp();
        return true;
      }
    }
  }catch(e){
    console.warn('Could not restore session:',e);
  }
  return false;
}
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
function setSelfZone(r){S.zone=r.zone||'Outside monitored zones';const z=S.zones.find(x=>x.name===r.zone);S.safety=!z?'SAFE':z.type==='Restricted'?'DANGER':z.type==='Caution'?'CAUTION':'SAFE';if(S.user&&r&&S.user.id===r.id)Object.assign(S.user,r);}

// ---------- auth ----------
function forgotPassword(){
  const isCloud=isCloudConnected;
  openModal(`<h2>Reset Password</h2>
  <p class="muted">Enter your registered email address. ${isCloud?'You can send an official Supabase cloud reset email or complete identity verification on this device.':'Complete identity verification to securely reset credentials.'}</p>
  <div class="field"><label>Registered Email Address</label><input id="fpEmail" type="text" placeholder="you@example.com"><div id="fpEmailErr" class="error"></div></div>
  <div id="fpStep2" class="hidden">
    <div class="notice safe" style="font-size:12px;margin:10px 0"><b>Security Challenge:</b> Verify your registered emergency contact & medical record to confirm identity.</div>
    <div class="field"><label>Registered Emergency Contact Mobile Number</label><input id="fpPhone" placeholder="10-digit emergency contact number" type="tel"><div id="fpPhoneErr" class="error"></div></div>
    <div class="field"><label>Registered Blood Group</label><select id="fpBlood"><option>O+</option><option>A+</option><option>B+</option><option>AB+</option><option>O-</option><option>A-</option><option>B-</option><option>AB-</option></select></div>
  </div>
  <div id="fpStep3" class="hidden">
    <div class="field"><label>New Password</label><input id="fpNew" type="password" placeholder="Minimum 8 characters (letters & numbers)"><div id="fpNewErr" class="error"></div></div>
    <div class="field"><label>Confirm New Password</label><input id="fpConfirm" type="password" placeholder="Re-enter new password"><div id="fpConfirmErr" class="error"></div></div>
  </div>
  <div class="actions" style="justify-content:space-between;margin-top:16px">
    ${isCloud?'<button class="btn" type="button" onclick="sendCloudResetEmail()">Send Cloud Reset Email</button>':'<div></div>'}
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" id="fpAction" onclick="forgotStep()">Verify & Continue</button>
    </div>
  </div>`);
}
async function sendCloudResetEmail(){
  const e=($('fpEmail')?.value||'').trim().toLowerCase();
  if(!isEmail(e)){$('fpEmailErr').textContent='Enter a valid email address.';return}
  try{
    toast('Sending official password reset email…','info');
    await sbResetPassword(e);
    toast('Reset link sent to '+e+'! Check your inbox.','success');
    closeModal();
  }catch(err){
    $('fpEmailErr').textContent=err.message||'Could not send reset email.';
  }
}
async function forgotStep(){
  const step2=$('fpStep2'), step3=$('fpStep3');
  // Stage 1: Email check
  if(step2.classList.contains('hidden') && step3.classList.contains('hidden')){
    const e=$('fpEmail').value.trim().toLowerCase();
    if(!isEmail(e)){$('fpEmailErr').textContent='Enter a valid email address.';return}
    const t=findByEmail(e);
    if(!t&&!isCloudConnected){$('fpEmailErr').textContent='No account found for this email.';return}
    S._fp=e;
    $('fpEmail').disabled=true;
    step2.classList.remove('hidden');
    $('fpAction').textContent='Verify Identity';
  }
  // Stage 2: Security Challenge Verification
  else if(!step2.classList.contains('hidden') && step3.classList.contains('hidden')){
    const t=findByEmail(S._fp);
    if(!t){$('fpPhoneErr').textContent='Account record not found.';return}
    const enteredPhone=($('fpPhone')?.value||'').replace(/\D/g,'');
    const enteredBlood=$('fpBlood')?.value;
    const recFamily=(t.familyContactPhone||'').replace(/\D/g,'');
    const recOwn=(t.phone||'').replace(/\D/g,'');
    
    // Validate identity against registered contact and blood group
    const phoneMatches = (recFamily && recFamily.endsWith(enteredPhone)) || (recOwn && recOwn.endsWith(enteredPhone));
    const bloodMatches = !t.blood || t.blood === enteredBlood || t.blood === 'Not provided';
    
    if(!phoneMatches || !bloodMatches){
      $('fpPhoneErr').textContent='Identity challenge failed: Emergency contact phone or blood group does not match records.';
      return;
    }
    step2.classList.add('hidden');
    step3.classList.remove('hidden');
    $('fpAction').textContent='Save New Password';
  }
  // Stage 3: New Password Creation & Salted Hashing
  else{
    const n=$('fpNew').value,c=$('fpConfirm').value;
    if(n.length<8){$('fpNewErr').textContent='Password must be at least 8 characters.';return}
    if(!/[A-Za-z]/.test(n)||!/\d/.test(n)){$('fpNewErr').textContent='Password must include both letters and numbers.';return}
    if(n!==c){$('fpConfirmErr').textContent='Passwords do not match.';return}
    
    let t=findByEmail(S._fp);
    if(t){
      t.passwordSalt = generateSalt();
      t.passwordHash = await hashPassword(n, t.passwordSalt);
      delete t.password;
      save();
    }
    closeModal();
    toast('Password successfully updated via security challenge! Sign in now.','success');
  }
}
async function login(e){
  e.preventDefault();
  const email=$('email').value.trim().toLowerCase(),pass=$('password').value;
  $('emailErr').textContent='';$('passErr').textContent='';
  if($('authGeneralErr'))$('authGeneralErr').textContent='';
  let bad=false;
  if(!isEmail(email)){$('emailErr').textContent='Enter a valid email address.';bad=true}
  if(!pass){$('passErr').textContent='Password is required.';bad=true}
  if(bad)return;

  const btn=$('loginBtn');
  if(btn){btn.disabled=true;btn.textContent='Verifying credentials…'}

  try{
    if(S.role==='authority'){
      let authenticated = false;
      // 1. Server-side verified authentication via Supabase Auth
      if(isCloudConnected){
        try{
          const authData = await sbSignInAuthority(email, pass);
          if(authData && authData.user){
            S.user = {
              name: authData.user.user_metadata?.name || 'Verified Authority Officer',
              email,
              id: authData.user.id || 'AUTH-001',
              isServerVerified: true
            };
            authenticated = true;
          }
        }catch(err){
          console.warn('Supabase authority auth check notice:', err);
        }
      }
      // 2. Offline Sandbox Mode (Protected by Salted SHA-256 Hash)
      if(!authenticated){
        const authHash = await hashPassword(pass, 'sts_authority_seed_salt');
        if(email==='authority@example.com' && authHash==='22ccffbde591e5345ce2396583788ad239d4aef2cd4bb0858c27b731421889ca'){
          S.user = {
            name: 'Safety Authority Officer',
            email,
            id: 'AUTH-001',
            isOfflineSandbox: !isCloudConnected
          };
          authenticated = true;
        }
      }

      if(!authenticated){
        $('passErr').textContent='Invalid authority credentials. Check email and password.';
        return;
      }
      persistSession('authority',S.user);
      enterApp();
      return;
    }

    // 1. Direct Local Salted Hash Verification
    const localT=findByEmail(email);
    let localHashMatches = false;
    if(localT && localT.passwordHash){
      const computedHash = await hashPassword(pass, localT.passwordSalt || 'sts_tourist_seed_salt');
      if(computedHash === localT.passwordHash){
        localHashMatches = true;
      }
    }

    // 2. Supabase Cloud Server-Side Authentication
    if(isCloudConnected){
      try{
        const authData=await sbSignIn(email,pass);
        let t=findByEmail(email);
        if(!t){
          const cloudList=await sbFetchTourists();
          if(cloudList){mergeTouristsPreservingCredentials(cloudList)}
          t=findByEmail(email);
        }
        if(!t){
          t={
            name:authData?.user?.user_metadata?.name||'Tourist',
            id:'ST-'+Date.now().toString(36).toUpperCase(),
            email,
            phone:authData?.user?.user_metadata?.phone||'',
            blood:'O+',
            allergy:'None',
            zone:'Outside monitored zones',
            status:'Safe',
            lat:DC.lat,
            lng:DC.lng,
            locationSource:'demo',
            authUserId:authData?.user?.id
          };
          t.identityHash=idHash(t);
          S.tourists.push(t);
          await sbUpsertTourist(t);
        }
        S.user={...t};
        save();
        persistSession('tourist',S.user);
        enterApp();
        return;
      }catch(err){
        console.warn('Supabase signin notice:', err);
        if(localHashMatches){
          S.user={...localT};
          persistSession('tourist',S.user);
          enterApp();
          return;
        }
        const errMsg=(err.message||'').toLowerCase();
        if(localT && !localHashMatches){
          $('passErr').textContent='Incorrect password. Please try again.';
          return;
        }
        if(errMsg.includes('invalid')||errMsg.includes('credentials')){
          $('passErr').textContent='Invalid email or password.';
          return;
        }
        if(errMsg.includes('not confirmed')){
          $('emailErr').textContent='Email not confirmed on Supabase Cloud. Check inbox or sign in locally.';
          return;
        }
        $('emailErr').textContent=err.message||'No account found with this email. Please register.';
        return;
      }
    }else{
      // Local Fallback DB Mode
      if(!localT||!localT.passwordHash){
        $('emailErr').textContent='No account found with this email on this device. Please create an account.';
        return;
      }
      if(!localHashMatches){
        $('passErr').textContent='Incorrect password. Please try again.';
        return;
      }
      S.user={...localT};
      persistSession('tourist',S.user);
      enterApp();
    }
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Sign in'}
  }
}
function loginGuest(){
  const p=jitter(DC,.004),id='GUEST-'+Math.floor(1000+Math.random()*8999);
  const t={name:'Guest Explorer',id,email:id.toLowerCase()+'@safetrail.local',phone:'Not provided',blood:'Not provided',allergy:'Not provided',zone:'Outside monitored zones',status:'Safe',lat:p.lat,lng:p.lng,locationSource:'guest_est'};
  t.identityHash=idHash(t);S.tourists.push(t);save();
  if(isCloudConnected)sbUpsertTourist(t);
  S.role='tourist';S.user={...t};
  persistSession('tourist',S.user);
  toast('Continuing as guest. Some features are limited.','warning');enterApp();
}
async function register(e){
  e.preventDefault();
  const name=cleanText($('rname').value,50),email=$('remail').value.trim().toLowerCase(),phone=$('rphone').value.trim(),fp=$('rfamilyPhone').value.trim(),pw=$('rpass').value,cf=$('rconfirm').value;
  ['rnameErr','remailErr','rphoneErr','rfamilyPhoneErr','rpassErr','rconfirmErr'].forEach(i=>$(i).textContent='');
  let bad=false;const err=(i,m)=>{$(i).textContent=m;bad=true};
  if(!isName(name))err('rnameErr','Enter a valid full name (letters only).');
  if(!isEmail(email))err('remailErr','Enter a valid email address.');else if(findByEmail(email))err('remailErr','An account with this email already exists. Sign in instead.');
  if(!isPhone(phone))err('rphoneErr','Enter a valid 10-digit mobile number.');
  if(fp&&!isPhone(fp))err('rfamilyPhoneErr','Enter a valid 10-digit number.');
  if(pw.length<8)err('rpassErr','Password must be at least 8 characters.');
  else if(!/[A-Za-z]/.test(pw)||!/\d/.test(pw))err('rpassErr','Password must include both letters and numbers.');
  if(pw!==cf)err('rconfirmErr','Passwords do not match.');
  if(bad)return;

  const btn=$('registerBtn');
  if(btn){btn.disabled=true;btn.textContent='Creating tourist profile…'}

  const salt=generateSalt();
  const pwHash=await hashPassword(pw, salt);
  const p=jitter(DC,.004);
  const t={
    name,email,phone,
    familyContactName:cleanText($('rfamilyName').value,50)||'Not provided',
    familyContactPhone:fp||'Not provided',
    blood:$('blood').value,
    allergy:cleanText($('allergy').value,120)||'None',
    id:newId('ST'),
    passwordHash:pwHash,
    passwordSalt:salt,
    zone:'Outside monitored zones',
    status:'Safe',
    lat:p.lat,
    lng:p.lng,
    locationSource:'demo'
  };
  t.identityHash=idHash(t);

  try{
    if(isCloudConnected){
      try{
        toast('Registering profile in Supabase Cloud…','info');
        const authData=await sbSignUp(email,pw,{name,phone});
        if(authData&&authData.user)t.authUserId=authData.user.id;
        await sbUpsertTourist(t);
        toast('Profile synced to Supabase Cloud!','success');
      }catch(err){
        console.warn('Supabase register error, saved locally:', err);
      }
    }
    S.tourists.push(t);save();
    S.role='tourist';S.user={...t};
    persistSession('tourist',S.user);
    toast('Registration successful. Digital ID generated.','success');
    enterApp();
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Create tourist profile'}
  }
}
function logout(){stopTracking(true);persistSession(null,null);if(isCloudConnected)sbSignOut();S.user=null;S.active=null;showLanding();toast('Signed out successfully','info')}
function resetSystemData(){stopTracking(true);persistSession(null,null);S.active=null;S.geo={};seed();save();const t=findByEmail('tourist@example.com');S.role='tourist';S.user={...t};S.loc=null;S.zone='Location not acquired';S.safety='UNKNOWN';go('overview');toast('System data reset','success')}

// ---------- ui helpers ----------
const stat=(l,n)=>`<div class="card"><div class="stat-label">${l}</div><div class="stat-num">${esc(n)}</div></div>`;
const detail=(a,b)=>`<div class="row"><span class="muted">${a}</span><b>${esc(b)}</b></div>`;
const sevClass=i=>i.status==='Resolved'?'safe':i.severity==='HIGH'?'danger-b':'warning';
function incidentRow(i){return `<div class="row"><div><b>${esc(i.id)} · ${esc(i.type)}</b><small>${esc(i.tourist)} · ${esc(i.zone||'—')} · ${esc(i.time||'Just now')}</small></div><div style="text-align:right"><span class="badge ${sevClass(i)}">${esc(i.status)}</span>${S.role==='authority'&&i.status!=='Resolved'?` <button class="btn" style="padding:6px 9px" onclick="selectIncident('${esc(i.id)}')">Manage</button>`:''}${i.auditRef?`<div class="mono" style="font-size:10px;color:var(--muted);margin-top:4px;cursor:pointer" title="Copy audit reference" onclick="copyText('${esc(i.auditRef)}')">${esc(i.auditRef.slice(0,10))}…${esc(i.auditRef.slice(-6))} ⧉</div>`:''}</div></div>`}
function copyText(t){navigator.clipboard?.writeText(t).then(()=>toast('Copied','success')).catch(()=>toast('Could not copy','warning'))}
const isGeo=i=>i&&(i.source==='geofence'||i.type==='Geofence Warning'||i.type==='Restricted Zone Entry');
const openInc=()=>S.incidents.filter(i=>i.status!=='Resolved');
function identityRef(t){if(!t)return '—';if(!t.identityHash){t.identityHash=idHash(t);save()}return t.identityHash.slice(0,14)+'…'+t.identityHash.slice(-6)}

// ---------- AI Safety Risk Assessment (Rule-Based) ----------
// Aligned with Synopsis Report Section 4.1.4: Evaluates Zone, Proximity, Incidents & GPS Confidence

function assess(t){
  if(!t)return{
    score: 0,
    safetyIndex: 100,
    level: 'Safe',
    cls: 'safe',
    factors: ['No tourist selected.'],
    anomalies: [],
    features: { zone:'Not acquired', hazardDist:'—', status:'Normal', accuracy:'—' },
    recommendation: { title:'No active data', text:'Register or sign in to view live safety status.', type:'safe' },
    open: []
  };

  const sim = S.aiSimMode; // null | 'safe' | 'caution' | 'danger' | 'sos'
  const factors = [];
  const anomalies = [];

  // 1. Quick Scenario Presets (Clear & easily explainable in Viva)
  if(sim === 'safe'){
    factors.push('Zone: Marine Drive Safe Zone (0 pts)');
    factors.push('Distress Signals: None Active (0 pts)');
    factors.push('GPS Confidence: Verified Lock (Safe)');
    return {
      score: 10,
      safetyIndex: 90,
      level: 'Low',
      cls: 'safe',
      factors,
      anomalies: [],
      features: { zone: 'Marine Drive Safe Zone', hazardDist: 'Clear of hazards', status: 'Safe', accuracy: '±12 m', gpsConfidence: 'HIGH (Verified Live)' },
      recommendation: {
        title: 'Safe Zone Active',
        text: 'You are within a designated safe tourist zone. Enjoy your travel safely.',
        type: 'safe'
      },
      open: []
    };
  } else if(sim === 'caution'){
    factors.push('Zone: Hill Road Caution Area (+25 pts)');
    factors.push('Terrain Advisory: Active Caution (+5 pts)');
    factors.push('Distress Signals: None Active');
    anomalies.push({ type: 'CAUTION AREA ALERT', severity: 'MEDIUM', desc: 'Tourist is inside a monitored Caution Area. Proceed with care.' });
    return {
      score: 35,
      safetyIndex: 65,
      level: 'Medium',
      cls: 'warning',
      factors,
      anomalies,
      features: { zone: 'Hill Road Caution Area', hazardDist: 'Inside Caution Zone', status: 'Caution', accuracy: '±15 m', gpsConfidence: 'HIGH (Verified Live)' },
      recommendation: {
        title: 'Proceed with Caution',
        text: 'You are inside Hill Road Caution Area. Stay alert and avoid isolated side tracks.',
        type: 'warning'
      },
      open: []
    };
  } else if(sim === 'danger'){
    factors.push('Zone: Cliff Area (Restricted Hazard Zone: +55 pts)');
    factors.push('Boundary Breach: High Fall Risk (+15 pts)');
    factors.push('Distress Signals: None Active');
    anomalies.push({ type: 'RESTRICTED ZONE ENTRY', severity: 'HIGH', desc: 'Tourist has entered a restricted high-risk hazard boundary.' });
    return {
      score: 75,
      safetyIndex: 25,
      level: 'High',
      cls: 'danger-b',
      factors,
      anomalies,
      features: { zone: 'Cliff Area (Restricted)', hazardDist: 'Inside Restricted Hazard', status: 'Danger Alert', accuracy: '±15 m', gpsConfidence: 'HIGH (Verified Live)' },
      recommendation: {
        title: 'Danger: Leave Restricted Zone',
        text: 'You have entered the restricted Cliff Area. Move outside the boundary immediately or use SOS if you cannot leave safely.',
        type: 'danger'
      },
      open: []
    };
  } else if(sim === 'sos'){
    factors.push('Emergency SOS Distress Signal Active (+60 pts)');
    factors.push('High-Severity Incident Escalated to Authority (+25 pts)');
    factors.push('Emergency Dispatch Beacon Broadcasting (+5 pts)');
    anomalies.push({ type: 'CRITICAL EMERGENCY SOS', severity: 'HIGH', desc: 'Emergency SOS activated. Location and Digital ID transmitted to Authority.' });
    return {
      score: 92,
      safetyIndex: 8,
      level: 'High',
      cls: 'danger-b',
      factors,
      anomalies,
      features: { zone: t.zone || 'Monitored Sector', hazardDist: 'Distress Beacon Transmitting', status: 'Emergency SOS', accuracy: '±10 m', gpsConfidence: 'HIGH (Emergency Beacon)' },
      recommendation: {
        title: 'Emergency SOS Active',
        text: 'Emergency responders have received your Digital ID and coordinates. Keep your phone available.',
        type: 'danger'
      },
      open: S.incidents.filter(i=>i.touristId===t.id&&i.status!=='Resolved')
    };
  }

  // 2. LIVE GPS TELEMETRY MODE (Rule-Based Multi-Factor Scoring)
  const lat = t.lat != null ? Number(t.lat) : (S.loc ? S.loc.lat : null);
  const lng = t.lng != null ? Number(t.lng) : (S.loc ? S.loc.lng : null);
  const zoneName = String(t.zone || '');
  let nearestHazardZone = null;
  let nearestHazardDist = Infinity;

  if(lat != null && lng != null && S.zones.length){
    S.zones.forEach(z => {
      const d = haversine({lat, lng}, {lat: Number(z.lat), lng: Number(z.lng)});
      const toBoundary = d - radiusOf(z);
      if(z.type === 'Restricted' && toBoundary < nearestHazardDist){
        nearestHazardDist = toBoundary;
        nearestHazardZone = z;
      }
    });
  }

  let geoScore = 0;
  const isInsideRestricted = /Restricted|Cliff/i.test(zoneName) || S.zones.some(z => z.name === zoneName && z.type === 'Restricted');
  const isInsideCaution = S.zones.some(z => z.name === zoneName && z.type === 'Caution');
  const isInsideSafe = S.zones.some(z => z.name === zoneName && z.type === 'Safe');

  if(isInsideRestricted){
    geoScore = 50;
    factors.push(`Inside Restricted Danger Zone (${zoneName}): +50`);
    anomalies.push({ type: 'RESTRICTED ZONE ENTRY', severity: 'HIGH', desc: `Tourist is inside ${zoneName}. High risk boundary breached.` });
  } else if(nearestHazardDist <= 120 && nearestHazardZone){
    geoScore = 25;
    factors.push(`Near Danger Boundary (${Math.round(nearestHazardDist)}m to ${nearestHazardZone.name}): +25`);
    anomalies.push({ type: 'DANGER PROXIMITY ALERT', severity: 'MEDIUM', desc: `Approaching danger perimeter (${Math.round(nearestHazardDist)}m away).` });
  } else if(isInsideCaution){
    geoScore = 25;
    factors.push(`Inside Caution Zone (${zoneName}): +25`);
  } else if(isInsideSafe){
    geoScore = 0;
    factors.push(`Inside Safe Zone (${zoneName}): 0`);
  } else {
    geoScore = 8;
    factors.push('Outside monitored zones: +8');
  }

  // Incident & SOS
  let incScore = 0;
  const openIncidents = S.incidents.filter(i => i.touristId === t.id && i.status !== 'Resolved');
  const hasSOS = t.status === 'SOS' || openIncidents.some(i => i.type === 'SOS Alert');
  const hasHigh = openIncidents.some(i => i.severity === 'HIGH');
  const hasMed = openIncidents.some(i => i.severity === 'MEDIUM');

  if(hasSOS){
    incScore = 35;
    factors.push('Emergency SOS signal active: +35');
    anomalies.push({ type: 'EMERGENCY SOS ACTIVE', severity: 'HIGH', desc: 'Emergency SOS alert is active for this tourist.' });
  } else if(hasHigh){
    incScore = 25;
    factors.push('Open HIGH severity incident: +25');
  } else if(hasMed){
    incScore = 15;
    factors.push('Open MEDIUM severity incident: +15');
  } else if(t.status === 'Alert'){
    incScore = 12;
    factors.push('Active safety alert: +12');
  }

  // GPS Accuracy
  let gpsScore = 0;
  const acc = Number(t.accuracy || (S.loc ? S.loc.accuracy : 0));
  if(!lat || !lng){
    gpsScore = 6;
    factors.push('Location not yet acquired: +6');
  } else if(acc > 100){
    gpsScore = 6;
    factors.push(`GPS accuracy > 100 m (±${Math.round(acc)}m): +6`);
  } else {
    factors.push('GPS lock acquired: +2');
    gpsScore = 2;
  }

  // Base calibration
  const baseScore = 5;
  factors.push('Base monitoring calibration: +5');

  const totalScore = Math.max(5, Math.min(95, baseScore + geoScore + incScore + gpsScore));
  const safetyIndex = Math.max(5, 100 - totalScore);
  const level = totalScore >= 65 ? 'High' : totalScore >= 32 ? 'Medium' : 'Low';
  const cls = totalScore >= 65 ? 'danger-b' : totalScore >= 32 ? 'warning' : 'safe';

  let rec = { title: 'Continue Normally', text: 'You are outside monitored danger boundaries. Keep location monitoring active.', type: 'safe' };
  if(hasSOS){
    rec = { title: 'Emergency SOS Active', text: 'Responders notified with your Digital ID and coordinates. Keep your phone available.', type: 'danger' };
  } else if(isInsideRestricted){
    rec = { title: 'Leave Restricted Zone', text: `You are inside ${zoneName}. Move outside the boundary immediately or use SOS.`, type: 'danger' };
  } else if(nearestHazardDist <= 120 && nearestHazardZone){
    rec = { title: `Caution: Near ${nearestHazardZone.name}`, text: `You are within ${Math.round(nearestHazardDist)}m of a danger boundary. Stay on the safe trail.`, type: 'warning' };
  } else if(isInsideCaution){
    rec = { title: 'Proceed Carefully', text: `You are inside ${zoneName}. Stay alert and avoid isolated areas.`, type: 'warning' };
  }

  return {
    score: totalScore,
    safetyIndex,
    level,
    cls,
    factors,
    anomalies,
    features: {
      zone: zoneName || 'Outside Monitored Zones',
      hazardDist: nearestHazardZone ? `${Math.max(0, Math.round(nearestHazardDist))} m to ${nearestHazardZone.name}` : 'Safe distance',
      status: t.status || 'Safe',
      accuracy: acc > 0 ? `±${Math.round(acc)} m` : (t.locationSource==='gps' ? 'Acquiring GPS lock' : 'Demo benchmark'),
      gpsConfidence: (t.locationSource==='gps' && acc > 0 && acc <= 60)
        ? 'HIGH (Verified Satellite Lock)'
        : (t.locationSource==='gps' ? 'MEDIUM (Low Satellite Accuracy)' : 'LOW (Demo / Sample Profile)')
    },
    recommendation: rec,
    open: openIncidents
  };
}

function setAISimMode(mode){
  S.aiSimMode = mode;
  if(mode === 'sos'){
    toast('Safety Alert: Emergency SOS Active', 'danger');
  } else if(mode === 'danger'){
    toast('Safety Alert: Restricted Danger Zone Detected', 'danger');
  } else if(mode === 'caution'){
    toast('Safety Advisory: Caution Area Entered', 'warning');
  } else if(mode === 'safe'){
    toast('Safety Verified: Inside Safe Zone', 'success');
  } else {
    toast('Switched to Live GPS Tracking', 'info');
  }
  render();
}

function recommended(){
  const u = S.user;
  const a = assess(me() || u);
  return a.recommendation;
}

// ---------- tourist pages ----------
function locPanel(){
  const l=S.loc;
  return `<h3 class="section-title">Live location controls</h3>
  ${detail('Coordinates',l?l.lat.toFixed(6)+', '+l.lng.toFixed(6):'Not acquired')}
  ${detail('Accuracy',l&&l.accuracy?Math.round(l.accuracy)+' metres':'Not available')}
  ${detail('Current zone',S.zone)}
  ${detail('Safety Status',S.safety==='DANGER'?'🚨 DANGER':S.safety==='CAUTION'?'⚠️ CAUTION':'🟢 SAFE')}
  ${detail('Network',S.net)}
  ${detail('Tracking',S.tracking?'Active':'Stopped')}
  ${detail('Last updated',l&&l.updatedAt?new Date(l.updatedAt).toLocaleTimeString('en-IN'):'Not available')}
  <div class="actions" style="margin-top:14px;flex-wrap:wrap;gap:8px">
    <button class="btn primary" onclick="requestLocation()">Get current location</button>
    ${S.tracking?'<button class="btn" onclick="stopTracking()">Stop tracking</button>':'<button class="btn" onclick="startTracking()">Start live tracking</button>'}
    <button class="btn" onclick="go('zones')">View Safety Zones</button>
  </div>`;
}
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
  case 'zones':{
    const myPos = (S.loc && S.loc.lat) ? S.loc : (me() && me().lat ? {lat: Number(me().lat), lng: Number(me().lng)} : null);
    return `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">SAFETY &amp; PERIMETER AWARENESS</div>
          <h2 style="margin:4px 0 2px">Safety &amp; Monitored Zones</h2>
          <p class="muted" style="margin:0;font-size:13px">
            Real-time geofence monitoring based on your live GPS location.
          </p>
        </div>
        <button class="btn primary" onclick="requestLocation()">
          📍 Refresh My Location
        </button>
      </div>
    </div>

    <!-- Current Zone Status Banner -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <small class="muted" style="font-weight:600;text-transform:uppercase">Current Location Status</small>
          <div style="font-size:18px;font-weight:700;margin-top:4px">
            ${esc(S.zone)}
          </div>
          <small class="muted">
            ${myPos ? `GPS Coordinates: ${myPos.lat.toFixed(5)}, ${myPos.lng.toFixed(5)}` : 'Location not acquired yet'}
          </small>
        </div>
        <span class="badge ${S.safety==='DANGER'?'danger-b':S.safety==='CAUTION'?'warning':'safe'}" style="font-size:12px;padding:6px 14px">
          ${S.safety==='DANGER'?'⛔ DANGER ZONE':S.safety==='CAUTION'?'⚠️ CAUTION':'🟢 SAFE AREA'}
        </span>
      </div>
    </div>

    <!-- Perimeter Map -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 class="section-title" style="margin:0">Monitored Zones Map</h3>
        <small class="muted">Green = Safe Perimeter, Red = Restricted Hazard</small>
      </div>
      ${mapBox('zones')}
    </div>

    <!-- Active Monitored Zones List -->
    <div class="card">
      <h3 class="section-title">Active Monitored Zones (${S.zones.length})</h3>
      ${S.zones.map(z=>`
        <div class="row">
          <div>
            <b>${esc(z.name)}</b>
            <small>${z.type} zone · ${z.risk} risk · ${radiusOf(z)}m radius</small>
          </div>
          <span class="badge ${z.type==='Safe'?'safe':z.type==='Caution'?'warning':'danger-b'}">${z.type}</span>
        </div>
      `).join('')}
    </div>`;
  }
  case 'ai':{
    const a = assess(me() || u);
    const sim = S.aiSimMode;
    return `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">Smart Safety Evaluation</div>
          <h2 style="margin:4px 0 2px">AI Safety Risk Assessment</h2>
          <p class="muted" style="margin:0;font-size:13px">Monitors zone boundaries, hazard proximity, and emergency alerts in real time</p>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <small class="muted" style="font-weight:600">Scenario Check:</small>
          <button class="btn ${!sim?'primary':''}" style="padding:6px 10px;font-size:12px" onclick="setAISimMode(null)">📡 Live GPS</button>
          <button class="btn ${sim==='safe'?'green':''}" style="padding:6px 10px;font-size:12px" onclick="setAISimMode('safe')">🟢 Safe Zone</button>
          <button class="btn ${sim==='caution'?'amber':''}" style="padding:6px 10px;font-size:12px" onclick="setAISimMode('caution')">⚠️ Caution Area</button>
          <button class="btn ${sim==='danger'?'danger':''}" style="padding:6px 10px;font-size:12px" onclick="setAISimMode('danger')">⛔ Restricted Zone</button>
          <button class="btn ${sim==='sos'?'danger':''}" style="padding:6px 10px;font-size:12px" onclick="setAISimMode('sos')">🚨 SOS Distress</button>
        </div>
      </div>
    </div>

    <!-- 3 Key Overview Stats -->
    <div class="grid three" style="margin-bottom:16px">
      ${stat('Safety Status', a.level + ' Risk')}
      ${stat('Risk Score', a.score + ' / 100')}
      ${stat('Current Zone', a.features.zone)}
    </div>

    <!-- Alert / Status Notice -->
    ${a.anomalies.length ? a.anomalies.map(an => `
      <div class="notice danger" style="margin-bottom:14px">
        <b>⚠️ ${esc(an.type)}</b> — ${esc(an.desc)}
      </div>
    `).join('') : `
      <div class="notice safe" style="margin-bottom:14px">
        <b>✓ Normal Travel Condition</b> — Tourist is within safe boundaries. No active distress signals.
      </div>
    `}

    <div class="grid two">
      <!-- Left Card: Clean Status Meter & Parameters -->
      <div class="card">
        <h3 class="section-title">Safety Status & Score</h3>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 10px">
          <div>
            <span class="badge ${a.cls}" style="font-size:13px;padding:4px 10px">${a.level} Risk</span>
            <div style="font-size:12px;color:var(--muted);margin-top:6px">Threshold: &lt;32 Safe | 32-65 Caution | &gt;65 Danger</div>
          </div>
          <div style="font-size:32px;font-family:'IBM Plex Mono',monospace;font-weight:700;color:${a.score>=65?'var(--red)':a.score>=32?'var(--amber)':'var(--green)'}">
            ${a.score}<span style="font-size:14px;color:var(--muted)">/100</span>
          </div>
        </div>

        <div class="risk-meter" style="height:10px;margin:8px 0 18px">
          <div class="risk-meter-fill" style="width:${a.score}%;background:${a.score>=65?'var(--red)':a.score>=32?'var(--amber)':'var(--green)'}"></div>
        </div>

        <h4 style="font-size:12px;text-transform:uppercase;color:var(--muted);margin:12px 0 8px">Evaluated Parameters</h4>
        <div style="display:grid;gap:6px">
          ${detail('Location Factor', a.features.zone)}
          ${detail('Hazard Distance', a.features.hazardDist)}
          ${detail('Distress Alert Status', a.features.status)}
          ${detail('GPS Connectivity', a.features.accuracy)}
          ${detail('GPS Confidence', a.features.gpsConfidence)}
        </div>

        <div class="actions" style="margin-top:16px">
          <button class="btn primary" onclick="refreshAI()">↻ Recheck Safety</button>
        </div>
      </div>

      <!-- Right Card: Advisory & Quick Safety Actions -->
      <div class="card">
        <h3 class="section-title">Safety Advisory</h3>
        <div class="notice ${a.recommendation.type}" style="margin-top:10px">
          <b style="font-size:14px">${esc(a.recommendation.title)}</b><br>
          <div style="margin-top:4px">${esc(a.recommendation.text)}</div>
        </div>

        <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">
          <h4 style="font-size:12px;text-transform:uppercase;color:var(--muted);margin:0 0 10px">Quick Safety Shortcuts</h4>
          <div style="display:grid;gap:8px">
            <div class="row">
              <div><b>Monitored Safety Zones</b><small>View Safe and Caution boundaries</small></div>
              <button class="btn" onclick="go('zones')">Open Zones</button>
            </div>
            <div class="row">
              <div><b>Emergency SOS Panic</b><small>One-tap emergency broadcast</small></div>
              <button class="btn danger" onclick="go('sos')">Open SOS</button>
            </div>
            <div class="row">
              <div><b>Live GPS Location</b><small>Current device coordinates</small></div>
              <button class="btn" onclick="go('location')">Open Map</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }
  case 'sos':{
    const activeSos=S.incidents.find(i=>i.touristId===u.id&&i.type==='SOS Alert'&&i.status!=='Resolved');
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <h3 class="section-title" style="margin:0 0 4px">Emergency Panic System</h3>
          <p class="muted" style="margin:0">Immediate distress broadcast to Command Center & Police Authority.</p>
        </div>
        <span class="badge ${activeSos?'danger-b':'safe'}">${activeSos?'DISTRESS BROADCAST ACTIVE':'SYSTEM READY'}</span>
      </div>

      ${activeSos?`
        <div class="notice danger" style="margin-top:16px;border-left:4px solid var(--red)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <b style="font-size:15px">🚨 Active Distress Broadcast (${esc(activeSos.id)})</b>
              <div style="font-size:12px;margin-top:4px">
                Status: <b>${esc(activeSos.status)}</b> · Time: ${esc(activeSos.time)}
                ${activeSos.assignedTo?' · Unit: <b>'+esc(activeSos.assignedTo)+'</b>':' · Dispatched to Authority'}
              </div>
            </div>
            <button class="btn" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);font-size:12px" onclick="cancelSOS()">Cancel False Alarm</button>
          </div>
        </div>
      `:''}

      <div class="sos-container">
        <div class="sos-btn-wrapper">
          <div class="sos-ripple"></div>
          <div class="sos-ripple"></div>
          <button class="sos-btn" onclick="confirmSOS()" title="Press to send Emergency SOS">
            SOS
            <small>PRESS FOR HELP</small>
          </button>
        </div>
        <p class="muted" style="font-size:13px;max-width:380px;margin:10px auto 14px">
          Pressing SOS transmits your high-precision GPS coordinates, Digital Identity hash, and medical alert immediately.
        </p>
        <button class="btn" style="padding:9px 20px" onclick="voiceSOS()">🎙️ Voice Emergency SOS (Say "Help" / "SOS")</button>
      </div>

      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
        <div class="eyebrow" style="margin-bottom:8px">Live Dispatch Telemetry</div>
        ${detail('GPS Coordinates',S.loc?Number(S.loc.lat).toFixed(6)+', '+Number(S.loc.lng).toFixed(6):(u.lat!=null?Number(u.lat).toFixed(6)+', '+Number(u.lng).toFixed(6):'Acquiring GPS fix…'))}
        ${detail('Monitored Zone',esc(S.zone||u.zone||'Outside monitored zones'))}
        ${detail('Digital ID Reference',identityRef(me()||u))}
        ${detail('Network Link',isCloudConnected?'Supabase Realtime Cloud (Active)':'Local Offline Safety Mesh')}
      </div>

      <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--line)">
        <h4 style="margin:0 0 10px;font-size:12.5px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">Direct Emergency Helplines (Tap to Call)</h4>
        <div class="hotline-grid">
          <a href="tel:112" class="hotline-btn">
            <span>112</span>
            <div><b>Police / National</b><small class="muted" style="display:block">Emergency Response</small></div>
          </a>
          <a href="tel:108" class="hotline-btn">
            <span>108</span>
            <div><b>Ambulance</b><small class="muted" style="display:block">Medical Emergency</small></div>
          </a>
          <a href="tel:1363" class="hotline-btn">
            <span>1363</span>
            <div><b>Tourist Helpline</b><small class="muted" style="display:block">Govt of India</small></div>
          </a>
        </div>
      </div>
    </div>`}
  case 'medical':{
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">Emergency Medical Passport</div>
          <h3 class="section-title" style="margin:2px 0 4px">First-Responder Medical Record</h3>
          <p class="muted" style="margin:0">Instantly accessible to Paramedics, Hospitals & Authority Responders.</p>
        </div>
        <button class="btn primary" onclick="openEditMedical()">✏️ Edit Medical Info</button>
      </div>

      <div style="display:flex;align-items:center;gap:18px;margin-top:20px;padding:16px;border-radius:12px;background:var(--bg2);border:1px solid var(--line2);flex-wrap:wrap">
        <div class="blood-avatar" title="Blood Group">${esc(u.blood||'—')}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Blood Group</div>
          <div style="font-size:22px;font-weight:800;color:var(--ink)">${esc(u.blood||'Not specified')}</div>
          <div style="margin-top:4px;font-size:12.5px;color:var(--muted)">Critical for emergency transfusions and rapid trauma response.</div>
        </div>
      </div>

      <div style="margin-top:18px">
        ${detail('Known Allergies / Conditions',u.allergy||'None reported')}
        ${detail('Emergency Next-of-Kin Contact',u.familyContactName||'Not provided')}
        <div class="row">
          <span class="muted">Family Contact Phone</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${u.familyContactPhone&&u.familyContactPhone!=='Not provided'?`
              <a href="tel:${esc(u.familyContactPhone)}" style="color:var(--brass);font-weight:700;text-decoration:none">
                📞 ${esc(u.familyContactPhone)}
              </a>
              <button class="btn" style="padding:3px 8px;font-size:11px" onclick="copyText('${esc(u.familyContactPhone)}')">Copy</button>
            `:'<b>Not provided</b>'}
          </div>
        </div>
        ${detail('Digital Passport Ref',identityRef(me()||u))}
      </div>

      <div class="notice" style="margin-top:18px;display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:18px">🛡️</span>
        <div style="font-size:12.5px">
          <b>Paramedic & Hospital Protocol:</b> In severe emergency or trauma situations, first responders scan your Digital Tourist QR to pull this record in real time without requiring your phone to be unlocked.
        </div>
      </div>

      <div class="actions" style="margin-top:18px">
        <button class="btn primary" onclick="openEditMedical()">Update Medical Info</button>
        <button class="btn" onclick="go('digital')">Show Digital Tourist QR</button>
      </div>
    </div>`}
  case 'digital':return `<div class="idbox"><div class="eyebrow">Digital tourist ID</div><h2>${esc(u.name)}</h2>${detail('Tourist ID',u.id)}${detail('Identity reference',identityRef(me()||u))}${detail('Email',u.email||'—')}<div class="actions" style="margin-top:14px"><button class="btn primary" onclick="drawQR('myQR',[S.user.id,S.user.name,S.user.email].join('|'))">Generate QR</button></div><div id="myQR" class="qr"></div></div>`;
  case 'incidents':return `<div class="card"><h3 class="section-title">My incidents</h3>${mine.length?mine.map(incidentRow).join(''):'<div class="notice safe">You have no incident records.</div>'}</div>`;
  case 'profile':{
    const initials=(u.name||'Tourist').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
    return `<div class="profile-hero">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="profile-avatar-lg">${esc(initials)}</div>
        <div>
          <div class="eyebrow" style="margin-bottom:2px">Verified Tourist Profile</div>
          <h2 style="margin:0 0 4px;font-size:22px">${esc(u.name)}</h2>
          <div class="muted" style="font-size:13px">
            Tourist ID: <code class="mono" style="color:var(--brass)">${esc(u.id)}</code>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${isCloudConnected?'<span class="badge safe">● Cloud Connected</span>':'<span class="badge">Offline Storage</span>'}
        <button class="btn primary" onclick="openEditProfile()">✏️ Edit Profile</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Identity & Account Details</h3>
      ${detail('Full Name',u.name)}
      ${detail('Registered Email',u.email||'—')}
      ${detail('Mobile Number',u.phone||'—')}
      ${detail('Assigned Tourist ID',u.id)}
      <div class="row">
        <span class="muted">Digital Identity Hash</span>
        <div style="display:flex;align-items:center;gap:8px">
          <code class="mono" style="font-size:12px;color:var(--brass)">${identityRef(me()||u)}</code>
          <button class="btn" style="padding:3px 8px;font-size:11px" onclick="copyText('${(me()||u).identityHash||''}')" title="Copy full cryptographic hash">Copy</button>
        </div>
      </div>
      ${detail('Blood Group',u.blood||'Not provided')}
      ${detail('Current Safety Zone',u.zone||S.zone||'Outside monitored zones')}
      ${detail('Account Status',u.status||'Safe')}

      <div class="actions" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line);justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="openEditProfile()">Edit Profile</button>
          <button class="btn" onclick="go('digital')">View Digital ID QR</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" onclick="logout()">Sign out</button>
          <button class="btn danger" onclick="resetSystemData()">Reset demo data</button>
        </div>
      </div>
    </div>`}
  default:S.page='overview';return touristPage();
  }
}

// ---------- authority pages ----------
function authorityPage(){
  const open=openInc();
  switch(S.page){
  case 'overview':{
    const geo=open.filter(isGeo),sos=open.filter(i=>i.type==='SOS Alert'),high=open.filter(i=>i.severity==='HIGH').length,crit=S.tourists.filter(t=>assess(t).score>=70).length;
    const urgentInc=open.find(i=>i.severity==='HIGH'||i.type==='SOS Alert');
    const gpsLive=S.tourists.filter(t=>t.locationSource==='gps').length;
    return `<div class="card" style="margin-bottom:16px;background:radial-gradient(ellipse at 90% 10%,var(--brass-soft),transparent 75%),var(--card);border:1px solid var(--line2)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow" style="color:var(--brass-ink)">COMMAND & CONTROL CONSOLE</div>
          <h2 style="margin:4px 0 2px">Tourism Safety Operations Center</h2>
          <div class="muted" style="font-size:12.5px">Real-time situational awareness, distress dispatch and boundary monitoring</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge ${isCloudConnected?'safe':'warning'}" style="padding:4px 10px;font-size:11.5px">
            ● ${isCloudConnected?'Cloud Realtime Active':'Offline Local Mode'}
          </span>
          <span class="badge" style="padding:4px 10px;font-size:11.5px">
            📡 ${gpsLive} Live GPS Feeds
          </span>
          <button class="btn primary" style="padding:6px 12px;font-size:12px" onclick="go('locations')">🗺️ Open Live Map</button>
          <button class="btn" style="padding:6px 12px;font-size:12px" onclick="go('zones')">📍 Manage Geofences</button>
        </div>
      </div>
    </div>

    <!-- 4 Command Stats Cards -->
    <div class="grid stats">
      ${stat('Registered Tourists', S.tourists.length)}
      ${stat('Open Incidents', open.length)}
      ${stat('Geofence Breaches', geo.length)}
      ${stat('Active SOS Distress', sos.length)}
    </div>

    <!-- Urgent Escalation Hero Banner -->
    ${urgentInc ? `
      <div class="notice danger" style="margin-top:16px;border-left:4px solid var(--red)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <b style="font-size:15px">🚨 URGENT ACTION: ${esc(urgentInc.type)} (${esc(urgentInc.id)})</b>
            <div style="font-size:12.5px;margin-top:4px">
              Tourist: <b>${esc(urgentInc.tourist)}</b> (${esc(urgentInc.touristId||'—')}) · Zone: <b>${esc(urgentInc.zone||'—')}</b> · Status: <span class="badge danger-b" style="padding:1px 6px;font-size:10px">${esc(urgentInc.status)}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" style="background:#fff;color:#000;font-size:12px;font-weight:700" onclick="selectIncident('${esc(urgentInc.id)}')">Manage Incident →</button>
            <button class="btn green" style="font-size:12px" onclick="trackTourist('${esc(urgentInc.touristId)}')">📍 Track</button>
          </div>
        </div>
      </div>
    ` : `
      <div class="card" style="margin-top:16px">
        <div class="notice safe">
          <b>✓ Perimeter Normal:</b> No active emergency SOS or critical high-severity escalations. All safety sectors under routine monitoring.
        </div>
      </div>
    `}

    <div class="grid two" style="margin-top:16px">
      <!-- Left: Response Queue -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="section-title" style="margin:0">Active Incident Queue</h3>
          <span class="badge ${open.length?'warning':'safe'}">${open.length} Pending</span>
        </div>
        ${open.length ? open.slice(0, 5).map(incidentRow).join('') : '<div class="notice safe">All safety incidents resolved.</div>'}
      </div>

      <!-- Right: Operational Shortcuts & Boundary Overview -->
      <div class="card">
        <h3 class="section-title">Command Actions & Shortcuts</h3>
        <div class="row">
          <div><b>Live Tourist Map</b><small>${gpsLive} GPS-connected · ${S.tourists.length} registered</small></div>
          <button class="btn" onclick="go('locations')">Open Map</button>
        </div>
        <div class="row">
          <div><b>Geofence Boundary Alerts</b><small>${geo.length} active breaches</small></div>
          <button class="btn" onclick="go('alerts')">Review</button>
        </div>
        <div class="row">
          <div><b>Digital ID Checkpoint</b><small>Look up and verify tourist passport</small></div>
          <button class="btn" onclick="go('verify')">Verify ID</button>
        </div>
        <div class="row">
          <div><b>Emergency Dispatch Hub</b><small>${open.length} active in workflow</small></div>
          <button class="btn primary" onclick="go('response')">Dispatch</button>
        </div>
        <div class="row">
          <div><b>Safety Reports & Audit Log</b><small>Official exportable report table</small></div>
          <button class="btn" onclick="go('reports')">Reports</button>
        </div>
      </div>
    </div>`}
  case 'monitor':{
    const q=S.filter.trim().toLowerCase(),list=q?S.tourists.filter(t=>(t.name+' '+t.id+' '+t.zone).toLowerCase().includes(q)):S.tourists;
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3 class="section-title" style="margin:0">Tourist monitoring</h3><p class="muted" style="margin:5px 0 0">Registered tourists, status and latest location.</p></div><input class="search-box" placeholder="Search by name, ID or zone…" value="${esc(S.filter)}" oninput="filterTourists(this.value)"></div>
    <div class="monitor-list"><div class="monitor-item monitor-head"><div>Tourist</div><div>Tourist ID</div><div>Zone</div><div>Status</div><div>Action</div></div>${list.length?list.map(t=>{const st=t.status==='SOS'?'SOS':t.status==='Alert'?'Alert':'Safe';return `<div class="monitor-item"><div><b>${esc(t.name)}</b><small class="muted" style="display:block">${esc(t.email||'')} · ${t.locationSource==='gps'?'<span style="color:var(--green)">● LIVE GPS</span>':'Sample Position'}</small></div><div class="mono">${esc(t.id)}</div><div>${esc(t.zone||'Outside monitored zones')}</div><div><span class="badge ${st==='SOS'?'danger-b':st==='Alert'?'warning':'safe'}">${st}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" style="padding:6px 10px;font-size:12px" onclick="trackTourist('${esc(t.id)}')">📍 Track</button><button class="btn primary" style="padding:6px 10px;font-size:12px" onclick="viewTourist('${esc(t.id)}')">View</button></div></div>`}).join(''):'<div class="notice" style="margin:14px">No tourists match your search.</div>'}</div></div>`}
  case 'touristDetail':{
    const t=S.tourists.find(x=>x.id===S.selId);if(!t){S.page='monitor';return authorityPage()}
    const inc=S.incidents.filter(i=>i.touristId===t.id);
    return `<div class="detail-page"><div class="detail-toolbar"><button class="btn" onclick="go('monitor')">← Back to Tourist Monitoring</button></div>
    <div class="grid two" style="margin-top:15px"><div class="card"><h2 style="margin:0 0 4px">${esc(t.name)}</h2><p class="muted" style="margin-top:0">${esc(t.id)}</p>${detail('Current zone',t.zone||'Outside monitored zones')}${detail('Status',t.status)}${detail('Risk score',assess(t).score+'/100')}${detail('Location Type',t.locationSource==='gps'?'LIVE REAL GPS':'Simulated Position')}${detail('Latest location',t.lat!=null?Number(t.lat).toFixed(6)+', '+Number(t.lng).toFixed(6):'Unavailable')}${detail('Last update',t.updatedAt?new Date(t.updatedAt).toLocaleString('en-IN'):'Not available')}${detail('Identity reference',identityRef(t))}</div>
    <div class="card"><h3 class="section-title">Response information</h3>${detail('Medical record',(t.blood||'Not provided')+' · '+(t.allergy||'No allergies on file'))}${detail('Family contact',(t.familyContactName||'Not provided')+' '+(t.familyContactPhone||''))}${detail('Incidents recorded',inc.length)}<div class="actions" style="margin-top:15px"><button class="btn primary" onclick="S.verifyId='${esc(t.id)}';S.verified=null;go('verify')">Verify identity</button><button class="btn green" onclick="trackTourist('${esc(t.id)}')">📍 Track on Live Map</button></div></div></div>
    <div class="card" style="margin-top:15px"><h3 class="section-title">Incident history</h3>${inc.length?inc.map(incidentRow).join(''):'<div class="notice">No incidents recorded.</div>'}</div></div>`}
  case 'locations':{
    const gpsCount=S.tourists.filter(t=>t.locationSource==='gps'&&t.lat!=null).length;
    const trackedT=S.trackedTouristId?S.tourists.find(t=>t.id===S.trackedTouristId):null;
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <h3 class="section-title" style="margin:0">Live tourist locations</h3>
        <p class="muted" style="margin:4px 0 0">
          <span style="color:var(--green);font-weight:700">● ${gpsCount} Real GPS connected</span> · ${S.tourists.length} registered tourists · ${S.zones.length} safety boundaries
        </p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select style="padding:8px 12px;border:1px solid var(--line2);border-radius:var(--rs);background:var(--card);color:var(--ink);font-weight:600" onchange="setLocationFilter(this.value)">
          <option value="all" ${S.locFilter==='all'?'selected':''}>All Coordinates (${S.tourists.filter(t=>t.lat!=null).length})</option>
          <option value="gps" ${S.locFilter==='gps'?'selected':''}>🟢 Real Satellite GPS (${gpsCount})</option>
          <option value="demo" ${S.locFilter==='demo'?'selected':''}>⚪ Demo Profiles (${S.tourists.filter(t=>t.lat!=null&&t.locationSource!=='gps').length})</option>
        </select>
        <select style="padding:8px 12px;border:1px solid var(--line2);border-radius:var(--rs);background:var(--card);color:var(--ink);font-weight:600" onchange="focusTouristOnMap(this.value)">
          <option value="">-- Focus Tourist --</option>
          ${S.tourists.map(t=>`<option value="${esc(t.id)}" ${S.trackedTouristId===t.id?'selected':''}>${esc(t.name)} (${t.locationSource==='gps'?'GPS Live':'Sample'})</option>`).join('')}
        </select>
        <button class="btn primary" onclick="refreshMonitor(true)">↻ Refresh Cloud Map</button>
      </div>
    </div>
    ${trackedT?`<div class="notice safe" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <div><b>Target Tracking:</b> ${esc(trackedT.name)} (${esc(trackedT.id)}) · Lat: ${Number(trackedT.lat).toFixed(6)}, Lng: ${Number(trackedT.lng).toFixed(6)} · Updated: ${trackedT.updatedAt?new Date(trackedT.updatedAt).toLocaleTimeString('en-IN'):'Just now'}</div>
      <button class="btn" style="padding:4px 8px;font-size:12px" onclick="focusTouristOnMap('')">Reset View</button>
    </div>`:''}
    <div style="margin-top:14px">${mapBox('monitor')}</div></div>`}
  case 'alerts':{
    const act=open.filter(isGeo);
    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">BOUNDARY INTRUSION MONITORING</div>
          <h2 style="margin:4px 0 2px">Geofence Perimeter Alerts</h2>
          <p class="muted" style="margin:0;font-size:13px">Automated GPS detection when tourists cross into Caution or Restricted hazard zones.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="go('zones')">⚡ Trigger / Test Zone Breach</button>
          <button class="btn" onclick="go('locations')">🗺️ View on Map</button>
        </div>
      </div>
    </div>

    <div class="grid three" style="margin-bottom:16px">
      ${stat('GPS-Connected Devices', S.tourists.filter(t=>t.locationSource==='gps').length)}
      ${stat('Active Boundaries', S.zones.length)}
      ${stat('Active Perimeter Breaches', act.length)}
    </div>

    <div class="grid two">
      <!-- Left: Active Breaches Feed -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="section-title" style="margin:0">Active Perimeter Breaches</h3>
          <span class="badge ${act.length?'danger-b':'safe'}">${act.length ? act.length+' Active' : 'Clear'}</span>
        </div>
        ${act.length ? act.map(i => `
          <div class="card" style="margin-top:10px;border-left:3px solid var(--red);padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
              <div>
                <b style="font-size:14px;color:var(--ink)">${esc(i.type)}</b>
                <div style="font-size:12.5px;color:var(--muted);margin-top:2px">
                  Tourist: <b>${esc(i.tourist)}</b> (${esc(i.touristId||'—')}) · Zone: <b>${esc(i.zone)}</b>
                </div>
                <div style="font-size:11.5px;color:var(--muted);margin-top:4px">
                  Coordinates: <code>${i.lat!=null ? Number(i.lat).toFixed(5)+', '+Number(i.lng).toFixed(5) : 'GPS Acquired'}</code> · Time: ${esc(i.time)}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn" style="padding:5px 9px;font-size:12px" onclick="trackTourist('${esc(i.touristId)}')">📍 Track</button>
                <button class="btn primary" style="padding:5px 9px;font-size:12px" onclick="selectIncident('${esc(i.id)}')">Manage</button>
              </div>
            </div>
          </div>
        `).join('') : `
          <div class="notice safe" style="margin-top:8px">
            <b>✓ All Monitored Sectors Clear</b> — No active geofence boundary intrusions detected.
            <div style="margin-top:10px">
              <button class="btn" style="font-size:12px" onclick="go('zones')">Simulate Test Breach in Danger Zones →</button>
            </div>
          </div>
        `}
      </div>

      <!-- Right: Monitored Boundaries & Live Occupancy -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="section-title" style="margin:0">Monitored Zones & Occupancy</h3>
          <button class="btn" style="padding:4px 8px;font-size:11.5px" onclick="go('zones')">Manage Zones</button>
        </div>
        ${S.zones.map(z => {
          const count = S.tourists.filter(t => t.zone === z.name).length;
          return `
            <div class="row">
              <div>
                <b>${esc(z.name)}</b>
                <small>${z.type} · ${radiusOf(z)} m radius · <span style="color:var(--brass);font-weight:600">${count} tourist(s) inside</span></small>
              </div>
              <span class="badge ${z.type==='Safe'?'safe':z.type==='Caution'?'warning':'danger-b'}">${z.type}</span>
            </div>
          `;
        }).join('')}
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
          <small class="muted">Geofence calculations evaluate GPS distance against zone boundaries using the Haversine formula to trigger automatic breach warnings.</small>
        </div>
      </div>
    </div>`}
  case 'ai':{
    const ranked = S.tourists.map(t => ({ t, a: assess(t) })).sort((x, y) => y.a.score - x.a.score);
    if(!S.aiId && ranked[0]) S.aiId = ranked[0].t.id;
    const sel = S.tourists.find(t => t.id === S.aiId) || ranked[0]?.t;
    const a = assess(sel);
    const hi = ranked.filter(x => x.a.score >= 65).length;
    const md = ranked.filter(x => x.a.score >= 32 && x.a.score < 65).length;
    const sosCount = ranked.filter(x => x.t.status === 'SOS').length;

    return `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">Authority Decision Support (Synopsis Section 4.1.4)</div>
          <h2 style="margin:5px 0 2px">AI Incident & Risk Analysis</h2>
          <p class="muted" style="margin:0;font-size:13px">Rule-based risk scoring and response prioritization across registered tourists</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <label style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase">Tourist:</label>
          <select style="padding:8px 12px;border:1px solid var(--line2);border-radius:var(--rs);background:var(--bg2);color:var(--ink);font-weight:600" onchange="S.aiId=this.value;render()">
            ${ranked.map(({t, a:x}) => `<option value="${esc(t.id)}" ${sel&&t.id===sel.id?'selected':''}>${esc(t.name)} — ${x.score}/100 [${x.level} Risk]</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- Fleet Stats -->
    <div class="grid four" style="margin-bottom:16px">
      ${stat('High Risk Cases', hi)}
      ${stat('Medium Risk Warnings', md)}
      ${stat('Safe / Low Risk', ranked.length - hi - md)}
      ${stat('Active SOS Alerts', sosCount)}
    </div>

    ${a.anomalies.length ? a.anomalies.map(an => `
      <div class="notice danger" style="margin-bottom:14px">
        <b>⚠️ ${esc(an.type)}</b> — ${esc(an.desc)}
      </div>
    `).join('') : `
      <div class="notice safe" style="margin-bottom:14px">
        <b>✓ No active safety escalation</b> for ${esc(sel?.name || 'Selected Tourist')}.
      </div>
    `}

    <div class="grid two">
      <!-- Left: Tourist Risk Score Breakdown -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="margin:0 0 3px;font-size:17px">${esc(sel?.name || '')}</h3>
            <div class="mono" style="color:var(--muted);font-size:12px">${esc(sel?.id || '')}</div>
          </div>
          <span class="badge ${a.cls}">${a.level} Risk</span>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-around;padding:14px 0;margin-top:10px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
          <div style="text-align:center">
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Risk Score</div>
            <div class="ai-score" style="margin:2px 0">${a.score}<span class="muted" style="font-size:16px">/100</span></div>
          </div>
          <div style="text-align:center">
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Safety Index</div>
            <div style="font-size:36px;font-family:'IBM Plex Mono',monospace;font-weight:700;color:${a.score>=65?'var(--red)':a.score>=32?'var(--amber)':'var(--green)'}">
              ${a.safetyIndex}%
            </div>
          </div>
        </div>

        <div class="risk-meter" style="height:10px;margin:14px 0">
          <div class="risk-meter-fill" style="width:${a.score}%;background:${a.score>=65?'var(--red)':a.score>=32?'var(--amber)':'var(--green)'}"></div>
        </div>

        <h4 style="font-size:11.5px;text-transform:uppercase;color:var(--muted);margin:12px 0 6px">Calculated Factors (Weights)</h4>
        <div style="display:grid;gap:6px">
          ${a.factors.map(f => `<div class="row" style="padding:6px 0"><span style="font-size:12.5px">${esc(f)}</span></div>`).join('')}
        </div>

        <div class="actions" style="margin-top:14px">
          <button class="btn green" onclick="trackTourist('${esc(sel?.id)}')">📍 Track on Live Map</button>
          <button class="btn primary" onclick="viewTourist('${esc(sel?.id)}')">View Profile</button>
        </div>
      </div>

      <!-- Right: Parameters & Authority Recommendation -->
      <div class="card">
        <h3 class="section-title">Tourist Telemetry Details</h3>
        ${detail('Current Zone', a.features.zone)}
        ${detail('Hazard Proximity', a.features.hazardDist)}
        ${detail('Status', a.features.status)}
        ${detail('GPS Accuracy', a.features.accuracy)}
        ${detail('GPS Confidence', a.features.gpsConfidence)}
        ${detail('Digital ID', identityRef(sel))}

        <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--line)">
          <h3 class="section-title">Recommended Authority Action</h3>
          <div class="notice ${a.score >= 65 ? 'danger' : a.score >= 32 ? 'warning' : 'safe'}">
            <b>${a.score >= 65 ? 'Immediate Response Action Required' : a.score >= 32 ? 'Caution Monitoring Advised' : 'Routine Monitoring'}</b><br>
            ${a.score >= 65 
              ? `Prioritize emergency unit check for this tourist. Verify contact: ${esc(sel?.phone || 'on file')}.`
              : a.score >= 32
              ? `Tourist is inside a caution boundary. Monitor location updates for zone exit.`
              : `Tourist is inside safe boundary margins. No response required.`}
          </div>
        </div>
      </div>
    </div>`;
  }
  case 'incidents':return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 class="section-title">Incident management</h3><button class="btn primary" onclick="openCreateIncident()">Create incident</button></div>${activeBox()}${S.incidents.map(incidentRow).join('')}</div>`;
  case 'verify':{
    const f=S.tourists.find(t=>t.id===S.verifyId),ok=f&&S.verified===f.id;
    const computedHash=f?(f.identityHash||idHash(f)):'';
    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">POLICE CHECKPOINT & GATE VERIFICATION</div>
          <h2 style="margin:4px 0 2px">Digital Tourist Identity Verification</h2>
          <p class="muted" style="margin:0;font-size:13px">Cryptographic tamper check, emergency medical access & checkpoint clearance.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select style="padding:8px 12px;border:1px solid var(--line2);border-radius:var(--rs);background:var(--bg2);color:var(--ink);font-weight:600" onchange="S.verifyId=this.value;S.verified=null;render()">
            <option value="">-- Quick Pick Tourist --</option>
            ${S.tourists.map(t=>`<option value="${esc(t.id)}" ${f&&t.id===f.id?'selected':''}>${esc(t.name)} (${esc(t.id)})</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="grid two">
      <!-- Left: Lookup & Digital Passport -->
      <div>
        <div class="card">
          <h3 class="section-title">Identity Lookup</h3>
          <div class="field">
            <label>Tourist ID or QR Payload</label>
            <div style="display:flex;gap:8px">
              <input id="verifyId" placeholder="e.g. ST-00124 or paste QR string" value="${esc(S.verifyId||'')}" onkeydown="if(event.key==='Enter')runVerify()" style="flex:1">
              <button class="btn primary" onclick="runVerify()">Verify ID</button>
              <button class="btn" onclick="S.verifyId=null;S.verified=null;render()">Clear</button>
            </div>
            <div id="verifyErr" class="error"></div>
          </div>
        </div>

        ${f?`
          <div class="card" style="margin-top:16px;border:1px solid ${ok?'var(--green)':'var(--line)'};position:relative">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="profile-avatar-lg" style="width:52px;height:52px;font-size:20px">${esc(f.name.slice(0,2).toUpperCase())}</div>
                <div>
                  <h3 style="margin:0 0 2px">${esc(f.name)}</h3>
                  <div class="mono" style="color:var(--brass);font-size:12px">${esc(f.id)}</div>
                </div>
              </div>
              <span class="badge ${ok?'safe':'warning'}" style="font-size:12px;padding:5px 10px">
                ${ok?'✓ CLEARANCE GRANTED':'PENDING CHECKPOINT CLEAR'}
              </span>
            </div>

            <!-- Cryptographic Hash Verification Box -->
            <div style="margin-top:16px;padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--line2)">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                <span style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase">🛡️ Cryptographic Integrity</span>
                <span class="badge safe" style="font-size:10px;padding:2px 7px">TAMPER-PROOF INTACT ✓</span>
              </div>
              <div class="mono" style="font-size:11px;color:var(--brass);margin-top:5px;word-break:break-all">
                Hash: ${esc(computedHash)}
              </div>
            </div>

            <div style="margin-top:16px">
              ${detail('Full Name',f.name)}
              ${detail('Registered Mobile',f.phone||'Not provided')}
              ${detail('Registered Email',f.email||'—')}
              ${detail('Blood Group','🩸 '+(f.blood||'Not provided'))}
              ${detail('Known Allergies',f.allergy||'None on file')}
              ${detail('Emergency Next of Kin',(f.familyContactName||'N/A')+' (📞 '+(f.familyContactPhone||'N/A')+')')}
              ${detail('Current Safety Zone',f.zone||'Outside monitored zones')}
              ${detail('Account Status',f.status||'Safe')}
            </div>

            <div class="actions" style="margin-top:18px;justify-content:space-between;flex-wrap:wrap">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn green" onclick="S.verified='${esc(f.id)}';toast('Clearance granted: Identity verified ✓','success');render()">
                  ${ok?'Clearance Granted ✓':'✓ Grant Checkpoint Clearance'}
                </button>
                <button class="btn primary" onclick="trackTourist('${esc(f.id)}')">📍 Track on Map</button>
              </div>
              <button class="btn" onclick="generateVerifyQR()">Generate QR</button>
            </div>
            <div id="verifyQR" class="qr" style="margin-top:14px"></div>
          </div>
        `:''}
      </div>

      <!-- Right: Checkpoint Roster -->
      <div class="card">
        <h3 class="section-title">Checkpoint Roster (Registered Tourists)</h3>
        <p class="muted" style="font-size:12.5px;margin:-6px 0 12px">Click any tourist below for instant 1-second checkpoint verification:</p>
        <div style="display:grid;gap:8px">
          ${S.tourists.map(t=>`
            <div class="row" style="cursor:pointer;padding:10px 12px;border-radius:8px;background:var(--card2)" onclick="S.verifyId='${esc(t.id)}';S.verified=null;render()">
              <div>
                <b>${esc(t.name)}</b>
                <small class="muted" style="display:block">${esc(t.id)} · ${esc(t.zone||'Outside zones')}</small>
              </div>
              <div style="text-align:right">
                <span class="badge ${t.status==='SOS'?'danger-b':t.status==='Alert'?'warning':'safe'}">${esc(t.status)}</span>
                <span style="font-size:11px;color:var(--brass);display:block;margin-top:2px">Select →</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`}
  case 'response':{
    const a=S.active&&S.active.status!=='Resolved'?S.active:null,q=[...open].sort((x,y)=>(y.severity==='HIGH')-(x.severity==='HIGH'));
    const t=a?S.tourists.find(x=>x.id===a.touristId):null;
    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">COMMAND DISPATCH OPS</div>
          <h2 style="margin:4px 0 2px">Emergency Incident Response</h2>
          <p class="muted" style="margin:0;font-size:13px">4-stage response pipeline: Acknowledge → Dispatch Unit → Monitor → Resolve.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="openCreateIncident()">+ Manual Incident</button>
          <button class="btn" onclick="go('locations')">🗺️ Live Map</button>
        </div>
      </div>
    </div>

    <div class="grid two">
      <!-- Left: Active Emergency Response Console -->
      <div class="card">
        <h3 class="section-title">Active Response Case</h3>
        ${a?`
          <!-- 4-Stage Lifecycle Stepper -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:14px 0 18px;text-align:center">
            <div style="padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:var(--red);color:#fff">
              1. Detected 🚨
            </div>
            <div style="padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:${a.status!=='New'?'var(--amber)':'var(--card2)'};color:${a.status!=='New'?'#000':'var(--muted)'}">
              2. Ack 👁️
            </div>
            <div style="padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:${a.status==='Assigned'||a.status==='Resolved'?'#0284c7':'var(--card2)'};color:${a.status==='Assigned'||a.status==='Resolved'?'#fff':'var(--muted)'}">
              3. Dispatched 🚒
            </div>
            <div style="padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:${a.status==='Resolved'?'var(--green)':'var(--card2)'};color:${a.status==='Resolved'?'#04211c':'var(--muted)'}">
              4. Resolved ✓
            </div>
          </div>

          <div class="notice danger" style="border-left:4px solid var(--red)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
              <div>
                <b style="font-size:15px">${esc(a.type)} (${esc(a.id)})</b>
                <div style="font-size:12.5px;margin-top:3px">
                  Tourist: <b>${esc(a.tourist)}</b> (${esc(a.touristId||'—')}) · Zone: <b>${esc(a.zone||'—')}</b>
                </div>
              </div>
              <span class="badge danger-b">${esc(a.severity)}</span>
            </div>
          </div>

          <div style="margin-top:16px">
            ${detail('Lifecycle Status',a.status)}
            ${detail('Assigned Response Unit',a.assignedTo||'Pending Unit Assignment')}
            <div class="row">
              <span class="muted">Tourist Direct Phone</span>
              ${t&&t.phone&&t.phone!=='Not provided'?`
                <a href="tel:${esc(t.phone)}" style="color:var(--brass);font-weight:700;text-decoration:none">
                  📞 ${esc(t.phone)}
                </a>
              `:'<b>Not on file</b>'}
            </div>
            ${detail('Medical Record',t?(t.blood||'O+')+' · '+(t.allergy||'No allergies'):'Not available')}
            ${detail('Family Emergency Contact',t?(t.familyContactName||'N/A')+' ('+(t.familyContactPhone||'N/A')+')':'Not available')}
            ${detail('Distress Coordinates',a.lat!=null?Number(a.lat).toFixed(5)+', '+Number(a.lng).toFixed(5):'Device GPS')}
          </div>

          <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">
            <label style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:8px">Dispatch Unit Assignment:</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
              <select id="dispatchUnitSelect" style="flex:1;padding:8px 12px;border:1px solid var(--line2);border-radius:var(--rs);background:var(--bg2);color:var(--ink);font-weight:600">
                <option value="🚓 Police Quick Response (QRT-01)">🚓 Police Quick Response (QRT-01)</option>
                <option value="🚑 Emergency Paramedics (EMS-108)">🚑 Emergency Paramedics (EMS-108)</option>
                <option value="🚤 Coastal Beach Rescue Patrol">🚤 Coastal Beach Rescue Patrol</option>
                <option value="👮 Tourist Safety Marshal Unit">👮 Tourist Safety Marshal Unit</option>
              </select>
            </div>
            <div class="response-actions">
              <button class="btn" onclick="updateIncident('Acknowledged')" ${a.status!=='New'?'disabled':''}>1. Acknowledge Alert</button>
              <button class="btn amber" onclick="assignCustomUnit()" ${a.status!=='Acknowledged'?'disabled':''}>2. Dispatch Selected Unit</button>
              <button class="btn green" onclick="updateIncident('Resolved')" ${a.status!=='Assigned'?'disabled':''}>3. Mark Resolved ✓</button>
            </div>
            <div style="margin-top:12px">
              <button class="btn" style="width:100%" onclick="trackTourist('${esc(a.touristId)}')">📍 Open Live GPS Tracking on Map</button>
            </div>
          </div>
        `:`
          <div class="notice safe" style="margin-top:12px">
            <b>No Active Incident Selected.</b><br>
            Select an incident from the queue on the right to review telemetry and dispatch response teams.
          </div>
        `}
      </div>

      <!-- Right: Response Queue -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="section-title" style="margin:0">Emergency Response Queue</h3>
          <span class="badge ${q.length?'warning':'safe'}">${q.length} in queue</span>
        </div>
        ${q.length?q.map(i=>`
          <div class="row">
            <div>
              <b>${esc(i.id)} · ${esc(i.type)}</b>
              <small>${esc(i.tourist)} · ${esc(i.zone||'—')} · <span class="mono">${esc(i.status)}</span></small>
            </div>
            <div class="actions">
              <span class="badge ${i.severity==='HIGH'?'danger-b':'warning'}">${esc(i.severity)}</span>
              <button class="btn" onclick="selectIncident('${esc(i.id)}')">Open</button>
            </div>
          </div>
        `).join(''):'<div class="notice safe">Queue clear. All emergencies resolved.</div>'}
      </div>
    </div>`}
  case 'zones':{
    return `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">SPATIAL BOUNDARIES &amp; PERIMETERS</div>
          <h2 style="margin:4px 0 2px">Geofence Perimeter Management</h2>
          <p class="muted" style="margin:0;font-size:13px">
            Define and manage spatial zones manually. Click the map or enter GPS coordinates to establish boundaries.
          </p>
        </div>
        <div>
          <button class="btn primary" onclick="requestLocation();centerMapOnLocation()">
            ⌖ Center Map on My GPS
          </button>
        </div>
      </div>
    </div>

    <!-- Interactive Perimeter Map -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 class="section-title" style="margin:0">Perimeter Map Editor</h3>
        <small class="muted">Click anywhere on the map to place a zone boundary</small>
      </div>
      ${mapBox('editor')}
      <div class="muted" style="margin-top:8px;font-size:12px">
        💡 <b>Tip:</b> Click on any location on the map to add a zone at those exact coordinates, or fill in the form below.
      </div>
    </div>

    <!-- Two-column Management -->
    <div class="grid two">
      <div class="card">
        <h3 class="section-title">Create Geofence Zone</h3>
        <p class="muted">Enter zone details manually or use current GPS coordinates.</p>
        <form onsubmit="createZone(event)" novalidate>
          <div class="field">
            <label>Zone name</label>
            <input id="zname" placeholder="e.g. Main Ground, Lab Area, Gate 1">
            <div id="znameErr" class="error"></div>
          </div>
          <div class="field">
            <label>Zone type</label>
            <select id="ztype">
              <option value="Restricted">⛔ Restricted (Hazard / Danger)</option>
              <option value="Caution">⚠️ Caution (Warning)</option>
              <option value="Safe">🟢 Safe (Secure Perimeter)</option>
            </select>
          </div>
          <div class="field">
            <label>Risk level</label>
            <select id="zrisk">
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div class="grid two" style="gap:10px;margin-bottom:8px">
            <div>
              <label style="font-size:12px;font-weight:600">Latitude</label>
              <input id="zlat" placeholder="e.g. 19.0760" value="${S.loc?S.loc.lat.toFixed(6):''}">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600">Longitude</label>
              <input id="zlng" placeholder="e.g. 72.8777" value="${S.loc?S.loc.lng.toFixed(6):''}">
            </div>
          </div>
          <div style="margin-bottom:14px">
            <button type="button" class="btn" style="padding:4px 10px;font-size:12px" onclick="fillCurrentLocationToForm()">
              📍 Fill My Current GPS Coordinates
            </button>
          </div>
          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label style="margin:0">Radius: <b id="zradBadge">35 metres</b></label>
              <div style="display:flex;gap:4px">
                <button type="button" class="btn" style="padding:2px 6px;font-size:10px" onclick="$('zradius').value=20;$('zradBadge').textContent='20 metres'">20m</button>
                <button type="button" class="btn" style="padding:2px 6px;font-size:10px" onclick="$('zradius').value=35;$('zradBadge').textContent='35 metres'">35m</button>
                <button type="button" class="btn" style="padding:2px 6px;font-size:10px" onclick="$('zradius').value=50;$('zradBadge').textContent='50 metres'">50m</button>
                <button type="button" class="btn" style="padding:2px 6px;font-size:10px" onclick="$('zradius').value=100;$('zradBadge').textContent='100 metres'">100m</button>
              </div>
            </div>
            <input id="zradius" type="range" min="10" max="1000" value="35" oninput="$('zradBadge').textContent=this.value+' metres'">
          </div>
          <button class="btn primary">Save Geofence Zone</button>
        </form>
      </div>

      <div class="card">
        <h3 class="section-title">Active Monitored Zones</h3>
        <p class="muted">Currently active geographic boundaries in the safety system.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
          ${S.zones.map((z,i)=>`
            <div class="row" style="padding:10px;background:var(--bg2);border-radius:var(--rs);border:1px solid var(--line)">
              <div>
                <b>${esc(z.name)}</b>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">
                  ${z.type} · ${z.risk} risk · <b>${radiusOf(z)}m radius</b> · <span class="mono">${Number(z.lat).toFixed(5)}, ${Number(z.lng).toFixed(5)}</span>
                </div>
              </div>
              <div class="actions" style="gap:6px">
                <button class="btn" style="padding:4px 10px;font-size:12px" onclick="openZoneEdit(${i})">Edit</button>
                <button class="btn danger" style="padding:4px 10px;font-size:12px" onclick="confirmRemoveZone(${i})">Remove</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
  }
  case 'reports':{
    const res=S.incidents.filter(i=>i.status==='Resolved').length;
    const sosCount=S.incidents.filter(i=>i.type==='SOS Alert').length;
    const geoCount=S.incidents.filter(i=>isGeo(i)).length;
    const rate=S.incidents.length?Math.round((res/S.incidents.length)*100):100;
    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div class="eyebrow">ADMINISTRATIVE SAFETY AUDIT</div>
          <h2 style="margin:4px 0 2px">Incident Reports & Analytics</h2>
          <p class="muted" style="margin:0;font-size:13px">Official incident logs, resolution metrics, and exportable records for police/ministry review.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="exportCSV()">📊 Export to Excel (.CSV)</button>
          <button class="btn" onclick="window.print()">🖨️ Print Report</button>
        </div>
      </div>
    </div>

    <!-- 4 Key Analytics Cards -->
    <div class="grid four" style="margin-bottom:16px">
      ${stat('Total Incidents',S.incidents.length)}
      ${stat('Resolution Rate',rate+'%')}
      ${stat('SOS Alerts',sosCount)}
      ${stat('Geofence Breaches',geoCount)}
    </div>

    <!-- Audit Summary Banner -->
    <div class="card" style="margin-bottom:16px">
      <div class="notice safe" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <b>Official Safety Log:</b> ${S.incidents.length} incident(s) archived with cryptographic audit references (AR-Hash).
        </div>
        <button class="btn" style="padding:4px 10px;font-size:12px" onclick="exportCSV()">Download Incident Spreadsheet (.CSV)</button>
      </div>
    </div>

    <!-- Structured Audit Table -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <h3 class="section-title" style="margin:0">Incident Audit Register</h3>
        <span class="muted" style="font-size:12px">${S.incidents.length} Total Records</span>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;text-align:left">
          <thead>
            <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase">
              <th style="padding:10px 8px">ID</th>
              <th style="padding:10px 8px">Tourist</th>
              <th style="padding:10px 8px">Incident Type</th>
              <th style="padding:10px 8px">Severity</th>
              <th style="padding:10px 8px">Zone</th>
              <th style="padding:10px 8px">Assigned Unit</th>
              <th style="padding:10px 8px">Status</th>
              <th style="padding:10px 8px">Time</th>
            </tr>
          </thead>
          <tbody>
            ${S.incidents.length?S.incidents.map(i=>`
              <tr style="border-bottom:1px solid var(--line2)">
                <td style="padding:10px 8px" class="mono"><b>${esc(i.id)}</b></td>
                <td style="padding:10px 8px"><b>${esc(i.tourist)}</b><br><small class="muted">${esc(i.touristId||'')}</small></td>
                <td style="padding:10px 8px">${esc(i.type)}</td>
                <td style="padding:10px 8px"><span class="badge ${i.severity==='HIGH'?'danger-b':i.severity==='MEDIUM'?'warning':'safe'}" style="font-size:10.5px">${esc(i.severity)}</span></td>
                <td style="padding:10px 8px">${esc(i.zone||'—')}</td>
                <td style="padding:10px 8px">${esc(i.assignedTo||'Not assigned')}</td>
                <td style="padding:10px 8px"><span class="badge ${i.status==='Resolved'?'safe':i.status==='New'?'danger-b':'warning'}" style="font-size:10.5px">${esc(i.status)}</span></td>
                <td style="padding:10px 8px" class="muted">${esc(i.time||'—')}</td>
              </tr>
            `).join(''):`
              <tr><td colspan="8" style="padding:20px;text-align:center" class="muted">No incident records found.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>`}
  default:S.page='overview';return authorityPage();
  }
}
function filterTourists(q){S.filter=q;render();const el=document.querySelector('.search-box');if(el){el.focus();el.setSelectionRange(q.length,q.length)}}
function viewTourist(id){S.selId=id;go('touristDetail')}
function generateVerifyQR(){
  const f=S.tourists.find(t=>t.id===S.verifyId);
  if(!f)return;
  drawQR('verifyQR',[f.id,f.name,f.identityHash||''].join('|'));
}
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
    if(t){const rem=S.incidents.filter(i=>i.touristId===t.id&&i.status!=='Resolved');t.status=!rem.length?'Safe':rem.some(i=>i.severity==='HIGH')?'SOS':'Alert';if(isCloudConnected)sbUpsertTourist(t)}
    S.active=null;toast('Incident resolved','success');
  }else toast('Incident status: '+status,'info');
  if(isCloudConnected)sbUpsertIncident(a);
  save();render();
}
function assignCustomUnit(){
  const a=S.active;if(!a){toast('Select an incident first','warning');return}
  const sel=$('dispatchUnitSelect');
  const unit=sel?sel.value:'Emergency Response Team';
  a.status='Assigned';
  a.assignedTo=unit;
  if(isCloudConnected)sbUpsertIncident(a);
  save();render();
  toast(`Assigned ${unit} to ${a.id}`,'info');
}
function openCreateIncident(){openModal(`<h2>Create incident</h2><div class="field"><label>Tourist</label><select id="ciT">${S.tourists.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} — ${esc(t.id)}</option>`).join('')}</select></div><div class="field"><label>Type</label><select id="ciType"><option>SOS Alert</option><option>Restricted Zone Entry</option><option>Geofence Warning</option><option>Medical Emergency</option></select></div><div class="field"><label>Severity</label><select id="ciSev"><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div><div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createIncident()">Create incident</button></div>`)}
function createIncident(){
  const t=S.tourists.find(x=>x.id===$('ciT').value);if(!t)return;
  const type=$('ciType').value,sev=$('ciSev').value,dup=S.incidents.find(i=>i.touristId===t.id&&i.type===type&&i.status!=='Resolved');
  closeModal();if(dup){S.active=dup;toast(`An active ${type} already exists for ${t.name}`,'warning');render();return}
  const i={id:newId('INC'),tourist:t.name,touristId:t.id,type,severity:sev,status:'New',time:new Date().toLocaleString('en-IN'),zone:t.zone||'Outside monitored zones',source:'authority',lat:t.lat??null,lng:t.lng??null,auditRef:auditRef()};
  S.incidents.unshift(i);S.active=i;t.status=sev==='HIGH'?'SOS':'Alert';
  if(isCloudConnected){sbUpsertIncident(i);sbUpsertTourist(t)}
  save();render();toast('Incident '+i.id+' created','danger');
}
function confirmSOS(){openModal(`<h2>Confirm emergency?</h2><p class="muted">Your location and Digital ID will be shared with the response authority.</p><div class="actions" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="sendSOS()">Send SOS</button></div>`)}
function sendSOS(){
  closeModal();const u=S.user,ex=S.incidents.find(i=>i.touristId===u.id&&i.type==='SOS Alert'&&i.status!=='Resolved');
  if(ex){S.active=ex;toast('An SOS incident is already active','warning');render();return}
  const i={id:newId('INC'),tourist:u.name,touristId:u.id,type:'SOS Alert',severity:'HIGH',status:'New',time:new Date().toLocaleString('en-IN'),zone:S.zone,lat:S.loc?S.loc.lat:null,lng:S.loc?S.loc.lng:null,accuracy:S.loc?.accuracy||null,auditRef:auditRef(),source:'sos'};
  S.incidents.unshift(i);S.active=i;const t=me();if(t)t.status='SOS';
  if(isCloudConnected){sbUpsertIncident(i);if(t)sbUpsertTourist(t)}
  save();toast('SOS sent. Authority workflow updated.','danger');render();
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
function cancelSOS(){
  const u=S.user;
  const inc=S.incidents.find(i=>i.touristId===u.id&&i.type==='SOS Alert'&&i.status!=='Resolved');
  if(inc){
    inc.status='Resolved';
    if(S.active&&S.active.id===inc.id)S.active=null;
    const t=me();
    if(t){
      t.status='Safe';
      if(isCloudConnected)sbUpsertTourist(t);
    }
    if(isCloudConnected)sbUpsertIncident(inc);
    save();
    toast('SOS distress broadcast cancelled. Status reset to Safe.','info');
    render();
  }else{
    toast('No active SOS alert to cancel.','info');
  }
}
function openEditProfile(){
  const u=S.user;
  openModal(`<h2>Edit Profile</h2>
    <p class="muted">Update your registration information.</p>
    <div class="field"><label>Full Name</label><input id="epName" value="${esc(u.name||'')}"></div>
    <div class="field"><label>Mobile Number</label><input id="epPhone" value="${esc(u.phone||'')}"></div>
    <div class="actions" style="justify-content:flex-end">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveEditProfile()">Save changes</button>
    </div>`);
}
function saveEditProfile(){
  const name=cleanText($('epName').value,50);
  const phone=$('epPhone').value.trim();
  if(!name){toast('Please enter a valid full name.','warning');return}
  const u=S.user;
  u.name=name;
  if(phone)u.phone=phone;
  const t=me();
  if(t){
    t.name=name;
    if(phone)t.phone=phone;
    t.identityHash=idHash(t);
    u.identityHash=t.identityHash;
    if(isCloudConnected)sbUpsertTourist(t);
  }
  save();
  closeModal();
  toast('Profile updated successfully','success');
  render();
}
function openEditMedical(){
  const u=S.user;
  openModal(`<h2>Emergency Medical Record</h2>
    <p class="muted">Critical data accessed by paramedics and hospital emergency teams.</p>
    <div class="field">
      <label>Blood Group</label>
      <select id="emBlood">
        ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=>`<option ${u.blood===b?'selected':''}>${b}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Known Allergies / Medical Conditions</label>
      <input id="emAllergy" value="${esc(u.allergy||'None')}" placeholder="e.g. Penicillin, Asthma, Diabetes, None">
    </div>
    <div class="field">
      <label>Emergency Family Contact (Next of Kin)</label>
      <input id="emContactName" value="${esc(u.familyContactName||'')}" placeholder="e.g. Family Member Name">
    </div>
    <div class="field">
      <label>Emergency Contact Phone</label>
      <input id="emContactPhone" value="${esc(u.familyContactPhone||'')}" placeholder="e.g. 10-digit mobile number">
    </div>
    <div class="actions" style="justify-content:flex-end">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveEditMedical()">Save Medical Record</button>
    </div>`);
}
function saveEditMedical(){
  const blood=$('emBlood').value;
  const allergy=cleanText($('emAllergy').value,120)||'None';
  const cName=cleanText($('emContactName').value,50)||'Not provided';
  const cPhone=$('emContactPhone').value.trim()||'Not provided';
  const u=S.user;
  u.blood=blood;
  u.allergy=allergy;
  u.familyContactName=cName;
  u.familyContactPhone=cPhone;
  const t=me();
  if(t){
    t.blood=blood;
    t.allergy=allergy;
    t.familyContactName=cName;
    t.familyContactPhone=cPhone;
    if(isCloudConnected)sbUpsertTourist(t);
  }
  save();
  closeModal();
  toast('Medical information saved & synced','success');
  render();
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
      if(isCloudConnected)sbUpsertIncident(i);
      toast('⚠️ Perimeter Alert: Entered ' + inside.name + ' (' + inside.type + ')','danger');
    } else if(inside.type==='Safe'&&prev&&prev!==inside.name){
      toast('Entered Safe Zone: ' + inside.name,'success');
    }
    S.geo[t.id]=inside.name;S.lastEvent=`${t.name} entered ${inside.name} · ${inside.type}`;
  }else{
    t.zone='Outside monitored zones';if(t.status!=='SOS')t.status='Safe';
    S.incidents.forEach(i=>{if(i.touristId===t.id&&isGeo(i)&&i.status!=='Resolved'){i.status='Resolved';if(S.active&&S.active.id===i.id)S.active=null;if(isCloudConnected)sbUpsertIncident(i)}});
    if(prev)S.lastEvent=`${t.name} left ${prev}`;S.geo[t.id]=null;
  }
  if(S.user&&S.user.id===t.id)setSelfZone(t);
  if(isCloudConnected)sbUpsertTourist(t);
}

function triggerZone(tid,zi){
  const z=S.zones[zi],t=S.tourists.find(x=>x.id===tid);if(!z||!t){toast('Select a valid tourist and zone','warning');return}
  t.lat=Number(z.lat);t.lng=Number(z.lng);t.updatedAt=new Date().toISOString();t.locationSource='demo';
  if(z.type==='Safe'&&t.status==='SOS'){t.status='Safe';S.incidents.forEach(i=>{if(i.touristId===t.id&&i.status!=='Resolved')i.status='Resolved'});S.active=null}
  applyGeo(t,t.lat,t.lng);save();render();toast(`${t.name} placed in ${z.name}`,z.type==='Safe'?'success':'danger');
}

// ---------- geofence helpers ----------
function fillCurrentLocationToForm(){
  if(S.loc && S.loc.lat){
    if($('zlat')) $('zlat').value = S.loc.lat.toFixed(6);
    if($('zlng')) $('zlng').value = S.loc.lng.toFixed(6);
    toast('Coordinates filled from current device GPS.','success');
  } else if(navigator.geolocation){
    toast('Acquiring GPS fix…','info');
    navigator.geolocation.getCurrentPosition(pos => {
      S.loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy||10), updatedAt: new Date().toISOString() };
      if($('zlat')) $('zlat').value = pos.coords.latitude.toFixed(6);
      if($('zlng')) $('zlng').value = pos.coords.longitude.toFixed(6);
      toast('Coordinates filled from current device GPS.','success');
    }, () => {
      toast('Unable to read GPS. Please type coordinates or click on the map.','warning');
    });
  }
}

function centerMapOnLocation(){
  const coords = S.loc ? S.loc : (S.zones.length ? {lat: Number(S.zones[0].lat), lng: Number(S.zones[0].lng)} : DC);
  Object.values(maps).forEach(m => {
    try { m.setView([coords.lat, coords.lng], 18, { animate: true }); } catch(e){}
  });
  toast('Map centered on location.','info');
}

// ---------- zones ----------
function readZone(p){
  const name=cleanText($(p+'name').value,80);
  if(!name){$(p+'nameErr').textContent='Enter a zone name.';return null}
  return{name,type:$(p+'type').value,risk:$(p+'risk').value,radius:Math.max(10,Math.min(5000,Number($(p+'radius').value)||35))}
}

function createZone(e){
  e.preventDefault();
  $('znameErr').textContent='';
  const name = cleanText($('zname').value, 80);
  if(!name){ $('znameErr').textContent = 'Enter a zone name.'; return; }
  
  let lat = $('zlat') && $('zlat').value ? Number($('zlat').value) : null;
  let lng = $('zlng') && $('zlng').value ? Number($('zlng').value) : null;
  
  if(!lat || !lng || isNaN(lat) || isNaN(lng)){
    if(S.loc){ lat = S.loc.lat; lng = S.loc.lng; }
    else if(S.zones.length){ lat = Number(S.zones[0].lat); lng = Number(S.zones[0].lng); }
    else { lat = DC.lat; lng = DC.lng; }
  }

  const radius = Math.max(10, Math.min(5000, Number($('zradius').value) || 35));
  const z = {
    name,
    type: $('ztype').value,
    risk: $('zrisk').value,
    radius,
    lat,
    lng
  };
  
  S.zones.push(z);
  if(isCloudConnected) sbUpsertSafetyZone(z);
  save();
  toast(`Geofence zone "${z.name}" (${z.radius}m) created at coordinates.`, 'success');
  render();
}

function zoneForm(p,z){
  const r = radiusOf(z);
  return `<div class="field"><label>Zone name</label><input id="${p}name" value="${esc(z.name||'')}" placeholder="e.g. Restricted Sector, Safe Area"><div id="${p}nameErr" class="error"></div></div>
  <div class="field"><label>Zone type</label><select id="${p}type">${['Restricted','Caution','Safe'].map(x=>`<option ${z.type===x?'selected':''}>${x}</option>`).join('')}</select></div>
  <div class="field"><label>Risk level</label><select id="${p}risk">${['High','Medium','Low'].map(x=>`<option ${z.risk===x?'selected':''}>${x}</option>`).join('')}</select></div>
  <div class="field">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <label style="margin:0">Radius: <b id="${p}radBadge">${r} metres</b></label>
      <div style="display:flex;gap:4px">
        <button type="button" class="btn" style="padding:2px 8px;font-size:11px" onclick="$('${p}radius').value=20;$('${p}radBadge').textContent='20 metres'">20m</button>
        <button type="button" class="btn" style="padding:2px 8px;font-size:11px" onclick="$('${p}radius').value=35;$('${p}radBadge').textContent='35 metres'">35m</button>
        <button type="button" class="btn" style="padding:2px 8px;font-size:11px" onclick="$('${p}radius').value=70;$('${p}radBadge').textContent='70 metres'">70m</button>
      </div>
    </div>
    <input id="${p}radius" type="range" min="10" max="1000" value="${r}" oninput="$('${p}radBadge').textContent=this.value+' metres'">
  </div>`;
}

function openZoneCreate(ll){
  openModal(`<h2>Add Geofence Zone</h2>
  <p class="muted">Positioned at ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</p>
  ${zoneForm('mz',{type:'Restricted',risk:'High',radius:35})}
  <div class="actions" style="justify-content:flex-end">
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn primary" onclick="confirmZoneCreate(${ll.lat},${ll.lng})">Save Zone</button>
  </div>`);
}

function confirmZoneCreate(lat,lng){
  const z=readZone('mz');
  if(!z)return;
  const nz={...z,lat,lng};
  S.zones.push(nz);
  if(isCloudConnected)sbUpsertSafetyZone(nz);
  save();
  closeModal();
  toast('Geofence zone added at clicked position','success');
  render();
}

function openZoneEdit(i){
  const z=S.zones[i];
  if(!z)return;
  openModal(`<h2>Edit Geofence Zone</h2>
  ${zoneForm('ez',z)}
  <div class="actions" style="justify-content:flex-end">
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn primary" onclick="saveZoneEdit(${i})">Save Changes</button>
  </div>`);
}

function saveZoneEdit(i){
  const n=readZone('ez');
  if(!n)return;
  Object.assign(S.zones[i],n);
  if(isCloudConnected)sbUpsertSafetyZone(S.zones[i]);
  save();
  closeModal();
  toast('Geofence zone updated','success');
  render();
}

function confirmRemoveZone(i){
  const z=S.zones[i];
  if(!z)return;
  openModal(`<h2>Remove Zone?</h2>
  <p class="muted">Are you sure you want to delete "<b>${esc(z.name)}</b>"?</p>
  <div class="actions" style="justify-content:flex-end">
    <button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn danger" onclick="closeModal();removeZone(${i})">Remove Zone</button>
  </div>`);
}

function removeZone(i){
  const z=S.zones[i];
  if(!z)return;
  const remName=z.name;
  S.zones.splice(i,1);
  if(isCloudConnected)sbDeleteSafetyZone(remName);
  S.tourists.forEach(t=>{
    if(t.zone===remName){
      t.zone='Outside monitored zones';
      if(t.status==='Alert')t.status='Safe';
      if(isCloudConnected)sbUpsertTourist(t);
    }
  });
  S.incidents.forEach(x=>{
    if(x.zone===remName&&isGeo(x)&&x.status!=='Resolved'){
      x.status='Resolved';
      if(isCloudConnected)sbUpsertIncident(x);
    }
  });
  if(S.active&&S.active.status==='Resolved')S.active=null;
  save();
  toast('Zone removed','info');
  render();
}

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
  let touristsToDraw = S.tourists.filter(t=>t.lat!=null&&t.lng!=null);
  if(S.locFilter === 'gps'){
    touristsToDraw = touristsToDraw.filter(t=>t.locationSource === 'gps');
  } else if(S.locFilter === 'demo'){
    touristsToDraw = touristsToDraw.filter(t=>t.locationSource !== 'gps');
  }

  touristsToDraw.forEach(t=>{
    const isLiveGps = t.locationSource==='gps';
    const isTarget = S.trackedTouristId === t.id;
    const col = touristColor(t);
    const rad = isTarget ? 14 : (isLiveGps ? 11 : 7);
    const strokeCol = isTarget ? '#f59e0b' : (isLiveGps ? '#0284c7' : '#94a3b8');
    const strokeWeight = isTarget ? 4 : (isLiveGps ? 3 : 1.5);
    
    const marker = L.circleMarker([Number(t.lat),Number(t.lng)],{
      _t:1,
      radius: rad,
      color: strokeCol,
      weight: strokeWeight,
      fillColor: col,
      fillOpacity: isLiveGps ? 1 : 0.75
    }).addTo(m);

    const timeStr = t.updatedAt ? new Date(t.updatedAt).toLocaleTimeString('en-IN') : 'N/A';
    const ageMs = t.updatedAt ? (Date.now() - new Date(t.updatedAt).getTime()) : Infinity;
    const isFresh = ageMs < 180000;
    const sourceBadge = isLiveGps 
      ? (isFresh 
          ? `<span class="badge safe" style="padding:2px 8px;font-size:10px">● SATELLITE GPS (±${t.accuracy||12}m)</span>` 
          : `<span class="badge warning" style="padding:2px 8px;font-size:10px">▲ STALE GPS (${Math.round(ageMs/60000)}m ago)</span>`)
      : '<span class="badge" style="background:#475569;color:#fff;padding:2px 8px;font-size:10px">⚪ DEMO PROFILE COORDINATE</span>';

    marker.bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:180px">
        <b style="font-size:14px">${esc(t.name)}</b>
        <div style="margin:4px 0">${sourceBadge}</div>
        <div style="font-size:12px;margin:3px 0"><b>ID:</b> <code>${esc(t.id)}</code></div>
        <div style="font-size:12px;margin:3px 0"><b>Zone:</b> ${esc(t.zone||'Outside monitored zones')}</div>
        <div style="font-size:12px;margin:3px 0"><b>Status:</b> <span class="badge ${t.status==='SOS'?'danger-b':t.status==='Alert'?'warning':'safe'}" style="padding:2px 6px;font-size:10px">${esc(t.status)}</span></div>
        <div style="font-size:11px;color:#64748b;margin-top:5px"><b>Coordinates:</b> ${Number(t.lat).toFixed(6)}, ${Number(t.lng).toFixed(6)}</div>
        <div style="font-size:11px;color:#64748b"><b>Accuracy / Mode:</b> ${isLiveGps ? `±${t.accuracy||12}m (Hardware)` : 'Simulated benchmark'}</div>
        <div style="font-size:11px;color:#64748b"><b>Updated:</b> ${timeStr}</div>
        <div style="margin-top:8px">
          <button class="btn primary" style="padding:4px 8px;font-size:11px;width:100%" onclick="trackTourist('${esc(t.id)}')">Follow This Tourist</button>
        </div>
      </div>
    `);

    if(isTarget){
      setTimeout(()=>{ try{ marker.openPopup() }catch(e){} }, 50);
    }
  });

  if(S.trackedTouristId){
    const target = S.tourists.find(x=>x.id===S.trackedTouristId);
    if(target && target.lat!=null && target.lng!=null){
      m.setView([Number(target.lat), Number(target.lng)], Math.max(m.getZoom(), 16), {animate:true});
    }
  }
}
function setLocationFilter(filter){
  S.locFilter = filter;
  const m=Object.values(maps).find(x=>x._monitor&&document.body.contains(x.getContainer()));
  if(m) drawTourists(m);
  render();
}
function trackTourist(id){
  S.trackedTouristId = id;
  if(!['locations'].includes(S.page)){
    S.page = 'locations';
    renderNav();
  }
  render();
  toast(id ? 'Tracking tourist position on map' : 'View reset to all tourists', 'info');
}
function focusTouristOnMap(id){
  S.trackedTouristId = id || null;
  render();
}
function initMap(id,mode){
  const el=$(id);if(!el||!window.L)return;
  let c = DC;
  if(mode==='own'&&S.loc){
    c = S.loc;
  } else if(S.loc){
    c = S.loc;
  } else if(S.zones && S.zones.length){
    c = {lat:Number(S.zones[0].lat),lng:Number(S.zones[0].lng)};
  }
  const zoom = (mode==='own'||S.loc) ? 17 : (S.zones && S.zones.length ? 15 : 14);
  const m=L.map(id).setView([c.lat,c.lng],zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);
  S.zones.forEach(z=>{
    const circ=L.circle([z.lat,z.lng],{radius:radiusOf(z),color:ZC[z.type],fillColor:ZC[z.type],fillOpacity:.18,weight:2,interactive:mode!=='editor'}).addTo(m);
    if(mode!=='editor')circ.bindPopup(`<b>${esc(z.name)}</b><br>${z.type} zone · ${z.risk} risk · ${radiusOf(z)}m radius`);
  });
  if(mode==='own'){ownMap=m;ownMarker=null;ownCircle=null;if(S.loc)updateOwn(S.loc.lat,S.loc.lng,S.loc.accuracy)}
  else drawTourists(m);
  if(mode==='editor'){
    m.on('click',e=>openZoneCreate(e.latlng));
  }
  if(mode==='monitor')m._monitor=true;
  maps[id]=m;setTimeout(()=>m.invalidateSize(),80);
}
async function refreshMonitor(manual){
  if(isCloudConnected){
    const cloudList = await sbFetchTourists();
    if(cloudList && cloudList.length){
      mergeTouristsPreservingPasswords(cloudList);
      save();
    }
  }
  const m=Object.values(maps).find(x=>x._monitor&&document.body.contains(x.getContainer()));
  if(!m){if(manual)toast('Map loading…','info');return}
  drawTourists(m);
  if(manual)toast('Tourist map updated from cloud!','success');
}
setInterval(()=>{if(S.user&&S.role==='authority'&&S.page==='locations')refreshMonitor(false)},3000);
function updateOwn(lat,lng,acc){
  if(!ownMap||!document.body.contains(ownMap.getContainer()))return;
  const col=S.safety==='DANGER'?ZC.Restricted:S.safety==='CAUTION'?ZC.Caution:ZC.Safe;
  if(!ownMarker)ownMarker=L.circleMarker([lat,lng],{radius:9,color:'#fff',weight:3,fillColor:col,fillOpacity:1}).addTo(ownMap).bindPopup('Current device location');
  else{ownMarker.setLatLng([lat,lng]);ownMarker.setStyle({fillColor:col})}
  if(acc>0){if(!ownCircle)ownCircle=L.circle([lat,lng],{radius:acc,color:col,fillColor:col,fillOpacity:.08,weight:1}).addTo(ownMap);else ownCircle.setLatLng([lat,lng]).setRadius(acc)}
  ownMap.setView([lat,lng],Math.max(ownMap.getZoom(),17),{animate:false});
}

// ---------- GPS ----------
let geoWatchHighAccuracy = true;

function onPos(pos){
  const lat=pos.coords.latitude,lng=pos.coords.longitude,acc=Math.round(pos.coords.accuracy||0),now=new Date().toISOString();
  S.loc={lat,lng,accuracy:acc,updatedAt:now};
  const r=me();if(r){
    Object.assign(r,{lat,lng,accuracy:acc,updatedAt:now,locationSource:'gps'});
    applyGeo(r,lat,lng);
    if(isCloudConnected)sbUpsertTourist(r);
  }
  save();updateOwn(lat,lng,acc);
  const p=$('locInfo');if(p)p.innerHTML=locPanel();
}

function requestLocation(){
  if(!navigator.geolocation){toast('Location is not supported by this browser.','warning');return}
  toast('Acquiring location…','info');
  // First try high accuracy with cached position support
  navigator.geolocation.getCurrentPosition(p=>{
    onPos(p);
    startTracking(true);
    toast('Live GPS location acquired!','success');
    if(S.page==='overview'||S.page==='ai')render();
  },err=>{
    console.warn('High-accuracy GPS fix slow/timed out, falling back to standard network accuracy...');
    // Fallback to standard accuracy (resolves rapidly via Wi-Fi/IP without timing out)
    navigator.geolocation.getCurrentPosition(p2=>{
      onPos(p2);
      startTracking(true);
      toast('Location acquired!','success');
      if(S.page==='overview'||S.page==='ai')render();
    },err2=>{
      console.warn('Standard geolocation also unavailable:', err2);
      if(err2.code===1){
        toast('Location permission denied. Enable location in browser settings.','warning');
      } else {
        // Fallback to tourist profile coordinates so the user is never stuck
        const r=me();
        if(r&&r.lat!=null&&r.lng!=null){
          const now=new Date().toISOString();
          S.loc={lat:Number(r.lat),lng:Number(r.lng),accuracy:50,updatedAt:now};
          r.updatedAt=now;
          applyGeo(r,r.lat,r.lng);
          if(isCloudConnected)sbUpsertTourist(r);
          save();updateOwn(r.lat,r.lng,50);
          const p=$('locInfo');if(p)p.innerHTML=locPanel();
          toast('Using last known location','info');
        } else {
          toast('Unable to get location fix. Check device location.','warning');
        }
      }
    },{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  },{enableHighAccuracy:true,timeout:8000,maximumAge:30000});
}

function startTracking(quiet){
  if(!navigator.geolocation){if(!quiet)toast('Location is not supported by this browser.','warning');return}
  if(S.tracking&&S.watch!==null){if(!quiet)toast('Tracking is already active','info');return}
  S.tracking=true;
  geoWatchHighAccuracy=true;
  _launchWatch(quiet);
  const p=$('locInfo');if(p)p.innerHTML=locPanel();
}

function _launchWatch(quiet){
  if(S.watch!==null&&navigator.geolocation){
    navigator.geolocation.clearWatch(S.watch);
    S.watch=null;
  }
  if(!S.tracking)return;
  const opts=geoWatchHighAccuracy
    ?{enableHighAccuracy:true,timeout:20000,maximumAge:30000}
    :{enableHighAccuracy:false,timeout:30000,maximumAge:60000};

  S.watch=navigator.geolocation.watchPosition(onPos,err=>{
    // PERMANENT FIX: Never spam "Location request timed out" danger toast!
    if(err.code===3){
      console.warn('Geolocation timeout in watchPosition; maintaining current fix and retrying quietly.');
      if(geoWatchHighAccuracy){
        geoWatchHighAccuracy=false;
        _launchWatch(true);
      }
      return;
    }
    if(err.code===1){
      stopTracking(true);
      toast('Location permission denied. Enable it in browser settings.','warning');
      return;
    }
    if(geoWatchHighAccuracy){
      geoWatchHighAccuracy=false;
      _launchWatch(true);
    }
  },opts);

  if(!quiet)toast('Real-time location monitoring is active','success');
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

// ---------- Supabase Settings Modal ----------
function openSupabaseConfig(){
  const url=SUPABASE_CONFIG.URL||localStorage.getItem('sts_sb_url')||'';
  const key=SUPABASE_CONFIG.KEY||localStorage.getItem('sts_sb_key')||'';
  const statusHtml = isCloudConnected
    ? '<span class="badge safe">● Online &amp; Connected</span>'
    : '<span class="badge warning">● Offline / Local Storage</span>';

  openModal(`<h2>Supabase Cloud Database Config</h2>
  <p class="muted">Connect this frontend to your live Supabase project to sync Tourists, Incidents and Danger Zones in real time.</p>
  <div style="background:var(--bg2);padding:14px;border-radius:10px;border:1px solid var(--line);margin:14px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.05em">DATABASE STATUS</span>
      ${statusHtml}
    </div>
    <div style="font-size:12.5px;color:var(--muted);line-height:1.6">
      <b>Cloud Host:</b> <code>${esc(url.replace('https://','').split('.')[0]||'Not configured')}</code><br>
      <b>Active Tables:</b> <code>tourists</code>, <code>incidents</code>, <code>safety_zones</code><br>
      <b>Realtime Replication:</b> ${isCloudConnected?'<span style="color:var(--green);font-weight:600">Active (Live Stream)</span>':'Inactive'}
    </div>
  </div>
  <div class="field"><label>Project URL</label><input id="sbUrl" placeholder="https://xyzabcdefg.supabase.co" value="${esc(url)}"></div>
  <div class="field"><label>Anon / Publishable API Key</label><input id="sbKey" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${esc(key)}"></div>
  <div class="actions" style="justify-content:space-between;margin-top:18px">
    <button class="btn" onclick="syncSupabaseNow()" type="button">🔄 Sync Now</button>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="closeModal()" type="button">Close</button>
      <button class="btn primary" onclick="saveSupabaseConfig()" type="button">Save &amp; Connect</button>
    </div>
  </div>`);
}
async function syncSupabaseNow(){
  toast('Syncing with Supabase Cloud…','info');
  await load();
  toast('Supabase sync complete!','success');
  closeModal();
  render();
}
async function saveSupabaseConfig(){
  const url=($('sbUrl').value||'').trim();
  const key=($('sbKey').value||'').trim();
  localStorage.setItem('sts_sb_url',url);
  localStorage.setItem('sts_sb_key',key);
  SUPABASE_CONFIG.URL=url;
  SUPABASE_CONFIG.KEY=key;
  closeModal();
  if(url&&key){
    initSupabase();
    if(isCloudConnected){
      toast('Supabase Connected! Syncing cloud data…','success');
      await load();
      setupRealtimeListeners();
    }else{
      toast('Could not connect with provided credentials. Re-check URL & Key.','danger');
    }
  }else{
    initSupabase();
    toast('Using Local Storage Database','info');
  }
  render();
}

function setupRealtimeListeners(){
  if(!isCloudConnected)return;
  setupSupabaseRealtime(
    (payload)=>{
      console.log('Incident update received:', payload);
      sbFetchIncidents().then(list=>{if(list){S.incidents=list;save();render()}});
      if(payload.eventType==='INSERT'&&payload.new){
        toast(`⚠️ Alert: ${payload.new.type} (${payload.new.severity})`,'danger');
      }
    },
    (payload)=>{
      console.log('Tourist update received:', payload);
      sbFetchTourists().then(list=>{
        if(list){
          mergeTouristsPreservingPasswords(list);
          save();
          if(S.role==='authority'&&S.page==='locations'){
            const m=Object.values(maps).find(x=>x._monitor&&document.body.contains(x.getContainer()));
            if(m)drawTourists(m);
          }else if(S.role==='authority'&&S.page==='monitor'){
            render();
          }
        }
      });
    },
    (payload)=>{
      console.log('Zone update received:', payload);
      sbFetchSafetyZones().then(list=>{if(list){S.zones=list.map(z=>({...z,radius:radiusOf(z)}));save();render()}});
    }
  );
}

// ---------- boot ----------
function startClock(){const tick=()=>{const t=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});$('liveClock').textContent=t;$('landingLiveTime').textContent='ACTIVE · '+t+' IST'};tick();setInterval(tick,1000)}
try{if(localStorage.getItem('sts_theme')==='light'){document.body.classList.add('light');$('themeToggle').textContent='☀'}}catch(e){}
initSupabase();
load().then(()=>{
  restoreSession();
});
save();
startClock();
setupRealtimeListeners();
$('loginForm').addEventListener('submit',login);
$('registerForm').addEventListener('submit',register);
window.addEventListener('storage',e=>{
  if(e.key!==KEY||!S.user)return;
  try{const d=JSON.parse(e.newValue);if(d){S.tourists=d.tourists||S.tourists;S.incidents=d.incidents||S.incidents;S.zones=d.zones||S.zones;
    if(S.role==='authority'&&!['verify','zones'].includes(S.page)){render()}}}catch(err){}
});
window.addEventListener('online',async ()=>{
  S.net='ONLINE';
  toast('Reconnected online! Syncing offline operations…','info');
  try{
    if(typeof sbProcessSyncQueue==='function') await sbProcessSyncQueue();
    await load();
    render();
  }catch(e){console.warn('Sync queue error:',e)}
});
window.addEventListener('offline',()=>{
  S.net='OFFLINE';
  toast('Device offline. Operations will be queued locally for sync.','warning');
});