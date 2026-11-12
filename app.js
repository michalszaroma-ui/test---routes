"use strict";
// =====================================================================
// Drive Ireland: app logic (needs data.js and Leaflet loaded first)
// =====================================================================
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const settings = Object.assign({mapStyle:"dark", limits:true, limitVoice:true, speedWarn:true, camAlerts:true, hzAlerts:true, camLayer:true, traffic:true, ttKey:"", placesLayer:true, examiner:false, bikeSpeed:22, cycleLayer:false, turnChime:true,
  lang: /^pl/i.test(navigator.language||"") ? "pl" : "en"}, store.get("ttr-settings", {}));
const saveSettings = () => store.set("ttr-settings", settings);
let lang = settings.lang;
function t(k, v){
  const s = TX[lang][k] ?? TX.en[k] ?? k;
  if(typeof s === "function") return s(v||{});
  return v ? s.replace(/\{(\w+)\}/g, (m,x) => v[x] ?? m) : s;
}
function trTrail(s){
  if(lang!=="pl" || !s) return s;
  const fixed = {"Many loops":"Wiele pętli","Short walk":"Krótki spacer","Roadside stop":"Postój przy drodze","Forest loops":"Leśne pętle","Many trails":"Wiele szlaków",
    "Any length":"Dowolnie długo","Half day":"Pół dnia","Easy":"Łatwa","Moderate":"Umiarkowana","Moderate–hard":"Średnio trudna","Hard":"Trudna","Scenic drive":"Trasa widokowa"};
  if(fixed[s]) return fixed[s];
  return s.replace(/^About /,"Ok. ").replace(/ km Spinc loop$/," km, pętla Spinc").replace(/ km loops$/," km, pętle").replace(/ km loop$/," km, pętla")
    .replace(/ km one way$/," km w jedną stronę").replace(/ km return$/," km tam i z powrotem").replace(/ km drive$/," km jazdy")
    .replace(/ h$/," godz.").replace(/(\d)\.(\d)/g,"$1,$2");
}

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const ico = (k, cls="i") => `<svg class="${cls}" viewBox="0 0 24 24">${IC[k]||IC.pin}</svg>`;
const num = (x, d) => { const s = x.toFixed(d); return lang==="pl" ? s.replace(".", ",") : s; };
function toast(msg, ms=2600){ const el=$("toast"); el.textContent=msg; el.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>el.hidden=true, ms); }
function fmtDist(m){ if(m>=9950) return Math.round(m/1000)+" km"; if(m>=995) return num(m/1000,1)+" km"; if(m>=100) return Math.round(m/10)*10+" m"; return Math.max(0,Math.round(m/5)*5)+" m"; }
function fmtDur(s){ const m=Math.max(1,Math.round(s/60)); if(m<60) return m+" min"; const h=Math.floor(m/60), r=m%60; return h+(lang==="pl"?" godz.":" h")+(r?" "+r+" min":""); }
function spokenDist(m){
  if(m>=1000){
    const km=Math.round(m/100)/10, whole=Number.isInteger(km);
    if(lang==="pl") return whole ? `${km} ${plN(km,"kilometr","kilometry","kilometrów")}` : `${num(km,1)} kilometra`;
    return (whole?km:km.toFixed(1))+" kilometres";
  }
  return (Math.round(m/50)*50) + (lang==="pl" ? " metrów" : " metres");
}
function spokenDur(s){
  const m=Math.max(1,Math.round(s/60)), h=Math.floor(m/60), r=m%60;
  if(lang==="pl"){ const mins = n => n===1 ? "1 minuty" : `${n} minut`; return m<60 ? mins(m) : (h===1?"1 godziny":`${h} godzin`) + (r?" i "+mins(r):""); }
  return m<60 ? m+(m===1?" minute":" minutes") : h+(h===1?" hour":" hours")+(r?" "+r+" minutes":"");
}
const locale = () => lang==="pl" ? "pl-PL" : "en-IE";
const hhmm = d => new Date(d).toLocaleTimeString(locale(), {hour:"2-digit", minute:"2-digit"});
const dayFmt = d => new Date(d).toLocaleDateString(locale(), {day:"numeric", month:"short"});
function safeUrl(u){ u=String(u||"").trim(); if(!/^https?:\/\//i.test(u)) u="https://"+u; try{ const x=new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; }catch(e){ return null; } }
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch(e){ return u; } }
const routeName = r => lang==="pl" && r.pl ? r.pl : r.name;

// ---------- Geometry ----------
const RE = 6371000, RAD = Math.PI/180;
function hav(a1,o1,a2,o2){ const dA=(a2-a1)*RAD, dO=(o2-o1)*RAD; const h=Math.sin(dA/2)**2+Math.cos(a1*RAD)*Math.cos(a2*RAD)*Math.sin(dO/2)**2; return 2*RE*Math.asin(Math.min(1,Math.sqrt(h))); }
const mkO = (lat,lon) => ({lat0:lat, lon0:lon, kx:RAD*RE*Math.cos(lat*RAD), ky:RAD*RE});
const pxy = (o,lat,lon) => ({x:(lon-o.lon0)*o.kx, y:(lat-o.lat0)*o.ky});
function segDist(p, a, b){ const dx=b.x-a.x, dy=b.y-a.y, L2=dx*dx+dy*dy; const tt = L2 ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy)/L2)) : 0; return {d:Math.hypot(p.x-(a.x+tt*dx), p.y-(a.y+tt*dy)), tt}; }
function buildGeom(route, coords){            // coords: [[lon,lat],...]
  route.o = mkO(coords[0][1], coords[0][0]);
  route.pts = coords.map(([lon,lat]) => ({lat, lon, ...pxy(route.o,lat,lon)}));
  route.cum = [0];
  for(let i=1;i<route.pts.length;i++){ const a=route.pts[i-1], b=route.pts[i]; route.cum.push(route.cum[i-1] + Math.hypot(b.x-a.x, b.y-a.y)); }
  route.total = route.cum[route.cum.length-1];
}
function projectSeg(route, p, i){
  const a=route.pts[i], b=route.pts[i+1], r=segDist(p,a,b);
  return {d:r.d, along:route.cum[i] + r.tt*(route.cum[i+1]-route.cum[i]), seg:i};
}
// Nearest point on the route between two segment indexes. Earlier segments win near-ties,
// so roads a route drives twice resolve to the next pass, not a later one.
function nearest(route, p, from, to, stopBelow){
  let best=null; const n=route.pts.length-2;
  for(let i=Math.max(0,from); i<=Math.min(n,to); i++){
    const r=projectSeg(route,p,i);
    if(!best || r.d < best.d - 0.5) best=r;
    if(stopBelow && r.d < stopBelow) return r;
  }
  return best || {d:Infinity, along:0, seg:0};
}
// Same, but a road the route drives out and back on (a turnabout) matches the pass going our way.
function nearestDir(route, p, from, to, hdg){
  if(hdg==null) return nearest(route, p, from, to);
  let best=null, bs=Infinity; const n=route.pts.length-2;
  for(let i=Math.max(0,from); i<=Math.min(n,to); i++){
    const r=projectSeg(route,p,i), a=route.pts[i], b=route.pts[i+1];
    const br=(Math.atan2(b.x-a.x, b.y-a.y)/RAD+360)%360, diff=Math.abs(((br-hdg)%360+540)%360-180);
    const sc = r.d + (diff > 100 ? 30 : 0);
    if(sc < bs - 0.5){ bs=sc; best=r; }
  }
  return best || {d:Infinity, along:0, seg:0};
}
// Every pass of the route within `thr` metres of a point (a loop can pass the same spot twice).
function nearestAll(route, p, thr){
  const out=[]; const n=route.pts.length-2;
  for(let i=0;i<=n;i++){
    const r=projectSeg(route,p,i); if(r.d>thr) continue;
    const last=out[out.length-1];
    if(last && r.along-last.along < 150){ if(r.d<last.d) out[out.length-1]=r; }
    else out.push(r);
  }
  return out;
}
function pointAt(route, along){
  const c=route.cum; let lo=0, hi=c.length-1;
  along=Math.max(0, Math.min(route.total, along));
  while(hi-lo>1){ const m=(lo+hi)>>1; if(c[m]<=along) lo=m; else hi=m; }
  const a=route.pts[lo], b=route.pts[Math.min(lo+1,route.pts.length-1)], seg=(c[hi]-c[lo])||1, f=(along-c[lo])/seg;
  return {lat:a.lat+(b.lat-a.lat)*f, lon:a.lon+(b.lon-a.lon)*f, heading:(Math.atan2(b.x-a.x, b.y-a.y)/RAD+360)%360};
}

// ---------- Turn instructions (English and Polish) ----------
const MOD_DEG = {"straight":0,"slight right":40,"right":90,"sharp right":135,"uturn":180,"sharp left":-135,"left":-90,"slight left":-40};
const TURN_EN = {"left":"Turn left","right":"Turn right","slight left":"Bear left","slight right":"Bear right","sharp left":"Turn sharp left","sharp right":"Turn sharp right","straight":"Go straight on","uturn":"Make a U-turn"};
const TURN_PL = {"left":"Skręć w lewo","right":"Skręć w prawo","slight left":"Odbij lekko w lewo","slight right":"Odbij lekko w prawo","sharp left":"Skręć ostro w lewo","sharp right":"Skręć ostro w prawo","straight":"Jedź prosto","uturn":"Zawróć"};
const ORD_PL = ["","pierwszym","drugim","trzecim","czwartym","piątym","szóstym","siódmym","ósmym","dziewiątym"];
const ordEn = n => n + (["th","st","nd","rd"][(n%100>10&&n%100<14)?0:(n%10)]||"th");
function describe(step, isFinal){
  const m=step.maneuver, mod=m.modifier||"straight", nm=step.name||step.ref||"", deg=MOD_DEG[mod]||0;
  const arrow = text => ({text, icon:"arrow", deg});
  if(lang==="pl"){
    const onto = nm ? ` w ${nm}` : "", side = /left/.test(mod) ? "lewej" : /right/.test(mod) ? "prawej" : "środka";
    switch(m.type){
      case "depart": return {text: nm ? `Jedź ulicą ${nm}` : "Ruszaj", icon:"arrow", deg:0};
      case "arrive": return isFinal ? {text:"Meta: koniec trasy", icon:"flag"} : null;
      case "roundabout": case "rotary":
        return m.exit ? {text:`Na rondzie zjedź ${ORD_PL[m.exit]||m.exit+"."} zjazdem${onto}`, icon:"rb", exit:m.exit} : {text:`Przejedź przez rondo${onto}`, icon:"rb", exit:""};
      case "roundabout turn": return {text:`Na rondzie ${lc(TURN_PL[mod]||"jedź dalej")}${onto}`, icon:"rb", exit:""};
      case "exit roundabout": case "exit rotary": return null;
      case "fork": return arrow(`Trzymaj się ${side}${onto}`);
      case "merge": return arrow(`Włącz się do ruchu${onto}`);
      case "on ramp": case "off ramp": return arrow(`Zjedź ${/left/.test(mod)?"w lewo":"w prawo"}${onto}`);
      case "turn": case "end of road": return arrow(`${TURN_PL[mod]||"Jedź dalej"}${onto}`);
      default: return mod==="straight" ? null : arrow(`${TURN_PL[mod]||"Jedź dalej"}${onto}`);
    }
  }
  const onto = nm ? ` onto ${nm}` : "";
  switch(m.type){
    case "depart": return {text:`Head off${nm?" along "+nm:""}`, icon:"arrow", deg:0};
    case "arrive": return isFinal ? {text:"Finish: you're back at the end of the route", icon:"flag"} : null;
    case "roundabout": case "rotary":
      return m.exit ? {text:`At the roundabout, take the ${ordEn(m.exit)} exit${onto}`, icon:"rb", exit:m.exit} : {text:`Go through the roundabout${onto}`, icon:"rb", exit:""};
    case "roundabout turn": return {text:`At the roundabout, ${(TURN_EN[mod]||"continue").toLowerCase()}${onto}`, icon:"rb", exit:""};
    case "exit roundabout": case "exit rotary": return null;
    case "fork": return arrow(`Keep ${mod.replace("slight ","")}${onto}`);
    case "merge": return arrow(`Merge ${mod.replace("slight ","")}${onto}`);
    case "on ramp": case "off ramp": return arrow(`Take the slip road ${mod.replace("slight ","")}${onto}`);
    case "turn": case "end of road": return arrow(`${TURN_EN[mod]||"Continue"}${onto}`);
    default: return mod==="straight" ? null : arrow(`${TURN_EN[mod]||"Continue"}${onto}`);
  }
}
function iconSvg(ins){
  if(!ins) return "";
  if(ins.icon==="rb") return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="12.5" fill="none" stroke="currentColor" stroke-width="4.5"/><text x="24" y="30" text-anchor="middle" font-size="17" font-weight="700" font-family="Chakra Petch,sans-serif" fill="currentColor">${ins.exit||""}</text></svg>`;
  if(ins.icon==="mv") return ico(MV_IC[ins.mvType] || "uturn");
  if(ins.icon==="flag") return `<svg viewBox="0 0 48 48"><path d="M13 6v36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M15 8h21l-5 7 5 7H15z" fill="currentColor"/></svg>`;
  if(ins.icon==="warn") return `<svg viewBox="0 0 48 48"><path d="M24 6 44 40H4z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 18v10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="34" r="2.5" fill="currentColor"/></svg>`;
  return `<svg viewBox="0 0 48 48" style="transform:rotate(${ins.deg||0}deg)"><path d="M24 4 39 21H29v23H19V21H9z" fill="currentColor"/></svg>`;
}
function prepareSteps(route, osrm){
  route.steps=[]; let seg=0;
  const legs=osrm.legs||[];
  legs.forEach((leg, li) => leg.steps.forEach(step => {
    if(step.maneuver.type==="depart" && li>0) return;
    const ins=describe(step, li===legs.length-1);
    if(!ins) return;
    const [lon,lat]=step.maneuver.location;
    const r=nearest(route, pxy(route.o,lat,lon), seg, route.pts.length, 2);
    seg=r.seg; route.steps.push({...ins, along:r.along, mtype:step.maneuver.type, mod:step.maneuver.modifier||"straight"});
  }));
  seg=0;
  route.stopAlong=(osrm.waypoints||[]).map(w => { const r=nearest(route, pxy(route.o,w.location[1],w.location[0]), seg, route.pts.length, 3); seg=r.seg; return r.along; });
}

// =====================================================================
// Network services
// =====================================================================
const ROUTERS = {car:"https://router.project-osrm.org/route/v1/driving", bike:"https://routing.openstreetmap.de/routed-bike/route/v1/driving"};
const bikeMs = () => (settings.bikeSpeed||22)/3.6;
async function osrmFetch(coords, signal, profile, extra){
  const res = await fetchT(`${ROUTERS[profile]||ROUTERS.car}/${coords}?overview=full&geometries=geojson&steps=true${extra||""}`, {signal}, 15000);
  if(!res.ok) throw new Error("routing "+res.status);
  const j = await res.json();
  if(j.code!=="Ok" || !j.routes || !j.routes.length) throw new Error(j.code||"no route");
  return {route:j.routes[0], waypoints:j.waypoints};
}
function applyOsrm(route, data){
  route.raw = data;
  buildGeom(route, data.route.geometry.coordinates);
  prepareSteps(route, {legs:data.route.legs, waypoints:data.waypoints});
  route.duration = route.profile==="bike" ? route.total / bikeMs() : data.route.duration;
  route.ok = true;
  if(route.isDest) finalizeDest(route);
  else if(route.stops && route.stops.length && !route.isDetour) applyManoeuvres(route);
}
// fetch with a time limit, so a slow server never leaves the app stuck on "searching"
function fetchT(url, opts={}, ms=10000){
  const ctl=new AbortController(); let timedOut=false;
  const tm=setTimeout(() => { timedOut=true; ctl.abort(); }, ms);
  const outer=opts.signal;
  if(outer){ if(outer.aborted) ctl.abort(); else outer.addEventListener("abort", () => ctl.abort(), {once:true}); }
  return fetch(url, {...opts, signal:ctl.signal}).catch(e => { if(timedOut) throw new Error("timeout"); throw e; }).finally(() => clearTimeout(tm));
}
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let opBest = store.get("ttr-opbest", 0) % OVERPASS.length;
// The free OpenStreetMap servers allow only a couple of requests at once per phone, so requests queue up here,
// one at a time, and a busy server (429/504) gets a short pause before the next mirror is tried.
let opChain = Promise.resolve(), opLastErr = "";
const sleep = ms => new Promise(r => setTimeout(r, ms));
function overpass(q, signal, ms=25000){
  const run = () => overpassNow(q, signal, ms);
  const p = opChain.then(run, run);
  opChain = p.catch(() => {});
  return p;
}
async function overpassNow(q, signal, ms){
  let lastErr, busy=0;
  for(let n=0;n<OVERPASS.length + Math.min(busy, OVERPASS.length);n++){
    const i=(opBest+n)%OVERPASS.length;
    try{
      const res = await fetchT(OVERPASS[i], {method:"POST", body:"data="+encodeURIComponent(q), headers:{"Content-Type":"application/x-www-form-urlencoded"}, signal}, ms);
      if(res.ok){ const j=await res.json(); if(i!==opBest){ opBest=i; store.set("ttr-opbest", i); } opLastErr=""; return j; }
      lastErr = new Error("overpass "+res.status);
      if(res.status===429 || res.status===504){ busy++; await sleep(1500 + 1500*n); }
    }catch(e){ if(e.name==="AbortError") throw e; lastErr=e; }
  }
  opLastErr = String(lastErr && lastErr.message || "overpass");
  throw lastErr || new Error("overpass");
}
// ---------- Opening hours ----------
function openState(oh, now=new Date()){
  if(!oh) return null; const str=String(oh).trim();
  if(str==="24/7") return true;
  const D=["Mo","Tu","We","Th","Fr","Sa","Su"], di=(now.getDay()+6)%7, mins=now.getHours()*60+now.getMinutes();
  let res=null;
  for(const rule of str.split(";").map(x => x.trim()).filter(Boolean)){
    if(/^(PH|SH)\b/.test(rule)) continue;
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*)?(?:\s*,\s*PH)?\s*(.*)$/);
    if(!m) return null;
    let applies = !m[1];
    if(m[1]) for(const seg of m[1].replace(/\s/g,"").split(",")){ const [a,b]=seg.split("-"), ia=D.indexOf(a), ib=b?D.indexOf(b):ia; if(ia<0||ib<0) return null; if(ia<=ib ? di>=ia&&di<=ib : di>=ia||di<=ib) applies=true; }
    if(!applies) continue;
    const tp=m[2].trim();
    if(/^(off|closed)$/i.test(tp)){ res=false; continue; }
    if(tp==="24/7" || tp==="00:00-24:00"){ res=true; continue; }
    let open=false;
    for(const r of tp.split(",")){ const mm=r.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/); if(!mm) return null; const a=+mm[1]*60+ +mm[2], b=+mm[3]*60+ +mm[4]; if(b>a ? mins>=a&&mins<b : mins>=a||mins<b) open=true; }
    res=open;
  }
  return res;
}
const ocBadge = o => o===true ? `<span class="oc on">${t("open")}</span>` : o===false ? `<span class="oc off">${t("closed")}</span>` : "";
// ---------- TomTom place search (fast, used for Nearby when a key is saved) ----------
const TT_Q = {groc:"supermarket", fuel:"petrol station", ev:"electric vehicle charging station", cafe:"cafe", food:"restaurant", pharm:"pharmacy", cash:"atm", park:"parking", diy:"hardware store", pub:"pub", bshop:"bicycle shop"};
function ttTime(x){ const [y,mo,d]=x.date.split("-").map(Number); return new Date(y, mo-1, d, x.hour, x.minute); }
function ttHours(oh){
  if(!oh || !oh.timeRanges) return {text:null, open:null};
  const now=new Date(), today=now.toDateString(), f=d => d.toLocaleTimeString(locale(), {hour:"2-digit", minute:"2-digit"});
  const rs=oh.timeRanges.map(r => ({a:ttTime(r.startTime), b:ttTime(r.endTime)}));
  const open = rs.some(r => now>=r.a && now<r.b);
  const tod = rs.filter(r => r.a.toDateString()===today || (now>=r.a && now<r.b));
  return {text: tod.length ? tod.map(r => (r.b-r.a >= 86340000 ? "24h" : `${f(r.a)}–${f(r.b)}`)).join(", ") : t("closedToday"), open};
}
async function ttNearby(cat, c, radius, signal){
  const q=TT_Q[cat.k]; if(!q || !ttKey()) return null;
  const res = await fetchT(`https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(q)}.json?key=${encodeURIComponent(ttKey())}&lat=${c.lat}&lon=${c.lon}&radius=${radius}&limit=30&openingHours=nextSevenDays&countrySet=IE,GB&language=en-GB`, {signal}, 9000);
  if(!res.ok) throw new Error("tomtom "+res.status);
  return ((await res.json()).results||[]).map(r => {
    const poi=r.poi||{}, hrs=ttHours(poi.openingHours);
    return {lat:r.position.lat, lon:r.position.lon, label:poi.name||t("one_"+cat.k), sub:(r.address||{}).freeformAddress||"", kind:t("one_"+cat.k),
      phone:poi.phone, web:poi.url, hours:hrs.text, open:hrs.open, openAt:Date.now(), ic:cat.ic, cat:cat.k};
  });
}
// ---------- Weather (Open-Meteo, no key) ----------
const wxMem = new Map();
function wxInfo(c){
  if(c===0||c===1) return ["wx_"+c,"sun"]; if(c===2) return ["wx_2","cloudsun"]; if(c===3) return ["wx_3","cloud"];
  if(c===45||c===48) return ["wx_fog","fog"]; if(c>=51&&c<=55) return ["wx_drizzle","rain"]; if([56,57,66,67].includes(c)) return ["wx_frz","rain"];
  if(c>=61&&c<=65) return ["wx_rain","rain"]; if((c>=71&&c<=77)||c===85||c===86) return ["wx_snow","snow"]; if(c>=80&&c<=82) return ["wx_showers","rain"];
  if(c>=95) return ["wx_storm","storm"]; return ["wx_3","cloud"];
}
async function weatherAt(p){
  const key=`${(+p.lat).toFixed(2)},${(+p.lon).toFixed(2)}`, hit=wxMem.get(key);
  if(hit && Date.now()-hit.at < 15*60000) return hit.w;
  const res = await fetchT(`https://api.open-meteo.com/v1/forecast?latitude=${(+p.lat).toFixed(3)}&longitude=${(+p.lon).toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&hourly=precipitation_probability&daily=sunrise,sunset&timezone=auto&forecast_days=2`, {}, 8000);
  if(!res.ok) throw new Error("weather "+res.status);
  const j = await res.json(), cur=j.current||{}, [k, icon]=wxInfo(cur.weather_code);
  const hrs=(j.hourly&&j.hourly.time)||[], idx=Math.max(0, hrs.findIndex(x => x.slice(0,13)===String(cur.time||"").slice(0,13)));
  const rain3 = Math.max(0, ...((j.hourly&&j.hourly.precipitation_probability)||[]).slice(idx, idx+3));
  const w = {temp:Math.round(cur.temperature_2m), key:k, icon: cur.is_day===0 && icon==="sun" ? "moon" : icon, wind:Math.round(cur.wind_speed_10m||0), rain3,
    sunset:((j.daily&&j.daily.sunset)||[])[0], sunrise:((j.daily&&j.daily.sunrise)||[])[0]};
  w.windDir = cur.wind_direction_10m;
  w.warn = ["wx_fog","wx_frz","wx_snow","wx_storm"].includes(k) || w.wind >= 60;
  wxMem.set(key, {at:Date.now(), w});
  return w;
}

const IE_BBOX = "-10.8,51.3,-5.3,55.5";
function photonPlace(f){
  const p=f.properties||{}, [lon,lat]=f.geometry.coordinates;
  const street=[p.housenumber, p.street].filter(Boolean).join(" ");
  const label = p.name || street || p.city || "?";
  const area = [p.name ? street : "", p.district || p.locality, p.city || p.town || p.village, p.county].filter(Boolean);
  const kind = p.osm_value && p.osm_value!=="yes" ? p.osm_value.replace(/_/g," ") : "";
  return {lat, lon, label, sub:[...new Set(area)].slice(0,3).join(", ") || kind, kind};
}
async function photonSearch(q, signal){
  const c = biasPoint();
  try{
    const res = await fetchT(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${c.lat}&lon=${c.lon}&bbox=${IE_BBOX}`, {signal}, 8000);
    if(!res.ok) throw new Error("photon "+res.status);
    return ((await res.json()).features||[]).map(photonPlace);
  }catch(e){
    if(e.name==="AbortError") throw e;
    const res = await fetchT(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=ie,gb&viewbox=-10.8,55.5,-5.3,51.3&q=${encodeURIComponent(q)}`, {signal, headers:{"Accept-Language":"en"}}, 8000);
    return (await res.json()).map(x => { const parts=x.display_name.split(", "); return {lat:+x.lat, lon:+x.lon, label:parts[0], sub:parts.slice(1,4).join(", ")}; });
  }
}
// TomTom knows businesses and Irish Eircodes well; OpenStreetMap (Photon) knows streets and landmarks.
async function ttSearch(q, signal){
  if(!ttKey()) return [];
  const c = biasPoint();
  const res = await fetchT(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(ttKey())}&lat=${c.lat.toFixed(4)}&lon=${c.lon.toFixed(4)}&limit=7&countrySet=IE,GB&typeahead=true&openingHours=nextSevenDays&language=en-GB`, {signal}, 7000);
  if(!res.ok) throw new Error("tomtom "+res.status);
  return ((await res.json()).results||[]).map(r => {
    const a=r.address||{};
    if(r.type==="POI" && r.poi) return {...ttPoiPlace(r), tt:1};
    const street=[a.streetNumber, a.streetName].filter(Boolean).join(" ");
    const label = r.type==="Geography" ? (a.municipalitySubdivision || a.municipality || a.countrySecondarySubdivision || a.freeformAddress)
      : /^[A-Z]\d{2}\s?[A-Z0-9]{4}$/i.test(q.trim()) && a.extendedPostalCode ? a.extendedPostalCode : (street || a.freeformAddress);
    return {lat:r.position.lat, lon:r.position.lon, label, sub:a.freeformAddress && a.freeformAddress!==label ? a.freeformAddress : (a.municipality||""), kind:"", tt:1};
  }).filter(p => p.label);
}
async function searchPlaces(q, signal){
  const [a, b] = await Promise.allSettled([ttSearch(q, signal), photonSearch(q, signal)]);
  if(signal && signal.aborted) throw new DOMException("aborted", "AbortError");
  const tt = a.status==="fulfilled" ? a.value : [], ph = b.status==="fulfilled" ? b.value : [];
  if(!tt.length && !ph.length && b.status==="rejected") throw b.reason;
  const out=[], key = p => p.label.toLowerCase().replace(/[^a-z0-9]/g,"");
  const add = p => { if(out.some(o => (key(o)===key(p) && hav(o.lat,o.lon,p.lat,p.lon) < 400) || hav(o.lat,o.lon,p.lat,p.lon) < 15)) return; out.push(p); };
  tt.filter(p => p.cat).forEach(add);                   // businesses first
  for(let i=0; i<Math.max(tt.length, ph.length); i++){ if(ph[i]) add(ph[i]); if(tt[i] && !tt[i].cat) add(tt[i]); }
  return out.slice(0, 10);
}
async function reverseLabel(lat, lon){
  try{ const j = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en&limit=1`)).json(); const f=(j.features||[])[0]; return f ? photonPlace(f) : null; }
  catch(e){ return null; }
}

// ---------- Live traffic (TomTom; needs the user's own free key) ----------
// Built-in TomTom key so everyone who opens the app gets live traffic. Restrict it to your GitHub Pages domain on my.tomtom.com.
const BUILTIN_TT = "yqBvVxVgZtwoG3OpNqyR7akIYngVyxIj";
const ownTtKey = () => (settings.ttKey||"").trim();
const ttKey = () => ownTtKey() || BUILTIN_TT;
async function ttRoute(from, to, key){
  const k = encodeURIComponent(key || ttKey());
  const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${from.lat.toFixed(6)},${from.lon.toFixed(6)}:${to.lat.toFixed(6)},${to.lon.toFixed(6)}/json?key=${k}&traffic=true&travelMode=car&routeRepresentation=summaryOnly&computeTravelTimeFor=all`);
  if(!res.ok) throw new Error("tomtom "+res.status);
  const s = (await res.json()).routes[0].summary;
  return {secs:s.travelTimeInSeconds, delay:s.trafficDelayInSeconds||0, free:s.noTrafficTravelTimeInSeconds||s.travelTimeInSeconds};
}
function incKind(c){ return {1:"accident",6:"jam",7:"lane",8:"closed",9:"works",14:"broken"}[c] || ([2,3,4,5,10,11].includes(c) ? "weather" : "other"); }
// Incidents that sit on the route, in our direction of travel.
async function ttIncidents(route){
  if(!ttKey() || !route.pts) return [];
  const lats=route.pts.map(p=>p.lat), lons=route.pts.map(p=>p.lon), pad=.003;
  const s=Math.min(...lats)-pad, n=Math.max(...lats)+pad, w=Math.min(...lons)-pad, e=Math.max(...lons)+pad;
  if((n-s)*111*(e-w)*67 > 9500) return [];                          // TomTom's bbox limit is 10,000 km²
  const fields = encodeURIComponent("{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,to,delay,roadNumbers}}}");
  const res = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(ttKey())}&bbox=${w},${s},${e},${n}&fields=${fields}&language=${lang==="pl"?"pl-PL":"en-GB"}&timeValidityFilter=present`);
  if(!res.ok) throw new Error("tomtom "+res.status);
  const out=[];
  for(const inc of (await res.json()).incidents||[]){
    const g=inc.geometry||{}, coords = g.type==="Point" ? [g.coordinates] : (g.coordinates||[]);
    if(!coords.length) continue;
    const step=Math.max(1, Math.floor(coords.length/25)), hits=[];
    for(let i=0;i<coords.length;i+=step){ const m=nearest(route, pxy(route.o, coords[i][1], coords[i][0]), 0, route.pts.length); if(m.d<25) hits.push(m.along); }
    const last=coords[coords.length-1], ml=nearest(route, pxy(route.o,last[1],last[0]), 0, route.pts.length);
    if(ml.d<25) hits.push(ml.along);
    if(!hits.length) continue;
    if(hits.length>=2 && hits[hits.length-1] < hits[0]-20) continue;   // the other carriageway
    const p=inc.properties||{}, kind=incKind(p.iconCategory);
    out.push({type:"inc", kind, along:Math.round(Math.min(...hits)), lat:coords[0][1], lon:coords[0][0], delay:p.delay||0, mag:p.magnitudeOfDelay||0,
      desc:((p.events||[])[0]||{}).description || "", road:(p.roadNumbers||[]).join(", "), from:p.from||"", to:p.to||""});
  }
  return out.sort((a,b) => a.along-b.along);
}

// ---------- Photos (Wikipedia + Wikimedia Commons) ----------
const STOPW = new Set(["the","and","park","road","street","hill","head","bay","dublin","county","forest","walk","drive","centre","center","visitor"]);
const words = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").split(/[^a-z0-9]+/).filter(w => w.length>2 && !STOPW.has(w));
const stripHtml = s => String(s||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
async function wikiHero(p, radius){
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${p.lat}|${p.lon}&ggsradius=${radius}&ggslimit=10&prop=pageimages&piprop=thumbnail&pithumbsize=900`;
  const j = await (await fetch(url)).json();
  const pages = Object.values((j.query && j.query.pages) || {}).filter(pg => pg.thumbnail);
  const want = words(p.label); let best=null, bestScore=0;
  for(const pg of pages){ const w=words(pg.title), sc=want.filter(x => w.includes(x)).length; if(sc>bestScore){ best=pg; bestScore=sc; } }
  if(!best) return null;
  return {src:best.thumbnail.source, thumb:best.thumbnail.source, page:`https://en.wikipedia.org/wiki/${encodeURIComponent(best.title.replace(/ /g,"_"))}`, credit:"Wikipedia", wiki:true, title:best.title};
}
async function commonsNear(lat, lon, radius, limit){
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lon}&ggsradius=${radius}&ggslimit=${limit}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=900&iiextmetadatafilter=Artist|LicenseShortName`;
  const j = await (await fetch(url)).json();
  return Object.values((j.query && j.query.pages) || {}).sort((a,b) => (a.index||0)-(b.index||0)).map(pg => {
    const ii = pg.imageinfo && pg.imageinfo[0]; if(!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime||"")) return null;
    const md = ii.extmetadata || {};
    const artist = stripHtml(md.Artist && md.Artist.value).slice(0,60), lic = stripHtml(md.LicenseShortName && md.LicenseShortName.value);
    return {src:ii.thumburl || ii.url, thumb:ii.thumburl || ii.url, page:ii.descriptionurl, credit:[artist, lic].filter(Boolean).join(" · ")};
  }).filter(Boolean);
}
const photoMem = new Map();
function photosFor(p){
  const key = `ttr-ph1-${(+p.lat).toFixed(4)},${(+p.lon).toFixed(4)}`;
  if(photoMem.has(key)) return photoMem.get(key);
  const cached = store.get(key, null);
  if(cached){ const pr = Promise.resolve(cached); photoMem.set(key, pr); return pr; }
  const isEx = p.ex!=null, isShop = !!p.cat;
  const pr = Promise.all([
    isShop ? Promise.resolve(null) : wikiHero(p, isEx ? 3000 : 600).catch(() => null),
    commonsNear(p.lat, p.lon, isEx ? 1500 : isShop ? 80 : 300, 8).catch(() => null),
  ]).then(([hero, gal]) => {
    const res = {hero: hero || (gal && gal[0]) || null, gal: gal || []};
    if(gal) store.set(key, res);            // only cache when the lookup actually worked
    return res;
  });
  photoMem.set(key, pr);
  return pr;
}
function openViewer(ph){
  if(!ph) return;
  $("vImg").src = ph.src; $("vImg").alt = ph.title || "";
  $("vCap").textContent = ph.wiki ? (ph.title||"Wikipedia") : (ph.credit ? t("photoBy",{a:ph.credit}) : "");
  $("vLink").href = ph.page; $("vLink").textContent = ph.wiki ? t("openWiki") : t("openPhoto");
  $("viewer").hidden = false;
}
$("vClose").onclick = () => { $("viewer").hidden = true; $("vImg").src = ""; };
$("viewer").addEventListener("click", e => { if(e.target.id==="viewer") $("vClose").onclick(); });

// =====================================================================
// Map
// =====================================================================
// leaflet-rotate adds map rotation (heading-up driving). Without it the app still works, north-up only.
const CAN_ROTATE = typeof L.Map.prototype.setBearing === "function";
const map = L.map("map", {zoomControl:false, attributionControl:true, zoomSnap:0, rotate:CAN_ROTATE, rotateControl:false, touchRotate:CAN_ROTATE, bearing:0}).setView(TC, 14);
const getBear = () => CAN_ROTATE ? map.getBearing() : 0;
map.attributionControl.setPrefix(false);
let baseLayer=null;
function applyMapStyle(){
  if(baseLayer) baseLayer.remove();
  baseLayer = baseTiles().addTo(map);
  document.body.dataset.map = settings.mapStyle;
  document.querySelectorAll("#mapStyle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.style===settings.mapStyle)));
  if(rc.map){ if(rc.base) rc.base.remove(); rc.base = baseTiles().addTo(rc.map); }
}
function baseTiles(){
  const st = settings.mapStyle, k = ttKey();
  // With a TomTom key: TomTom's own day/night map. Without one: OpenStreetMap (darkened for the dark style).
  const tomtom = s => L.tileLayer(`https://{s}.api.tomtom.com/map/1/tile/basic/${s==="night"?"night":"main"}/{z}/{x}/{y}.png?key=${encodeURIComponent(k)}&tileSize=256&view=Unified`,
    {maxZoom:20, subdomains:"abcd", className: s==="night" ? "base-night" : "", attribution:'© <a href="https://www.tomtom.com/" target="_blank" rel="noopener">TomTom</a>'});
  const osm = dark => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {maxZoom:20, maxNativeZoom:19, className: dark ? "base-osm-dark" : "", attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
  return st==="sat"
    ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom:19, maxNativeZoom:18, attribution:"Imagery © Esri"})
    : k ? tomtom(st==="light" ? "main" : "night") : osm(st!=="light");
}
let routeLayer=null, doneLayer=null, stopMarkers=[], meMarker=null, hereMarker=null;
const markLayer = L.layerGroup().addTo(map), poiLayer = L.layerGroup().addTo(map), camLayer = L.layerGroup();
const sheetH = () => $("sheet").offsetHeight;
function fitTo(bounds, maxZoom=16){ if(bounds && bounds.isValid()) map.fitBounds(bounds, {paddingTopLeft:[30,50], paddingBottomRight:[30, sheetH()+20], maxZoom}); }
function placeFabs(){ const b=`calc(${sheetH()}px + 14px)`; $("fabs").style.bottom=b; $("dial").style.bottom=b; $("dfabs").style.bottom=b; }
new ResizeObserver(placeFabs).observe($("sheet"));

function clearRoute(){
  if(routeLayer) routeLayer.remove(); if(doneLayer) doneLayer.remove(); routeLayer=doneLayer=null;
  markLayer.clearLayers(); stopMarkers=[];
}
function pinIcon(){
  return L.divIcon({className:"pin", iconSize:[34,44], iconAnchor:[17,42],
    html:`<svg viewBox="0 0 34 44"><path d="M17 43s14-14 14-25A14 14 0 0 0 3 18c0 11 14 25 14 25z" fill="#38e1ff" stroke="#03131a" stroke-width="2"/><circle cx="17" cy="18" r="5.5" fill="#03131a"/></svg>`});
}
function destMarker(p){ L.marker([p.lat,p.lon], {icon:pinIcon(), keyboard:false, zIndexOffset:500}).addTo(markLayer); }
const stopLabel = s => s.replace(/^Stop (\d+)$/, (m,n) => t("stopN",{n}));
function hzMarker(h){
  return L.marker([h.lat,h.lon], {keyboard:false, zIndexOffset:200, icon:L.divIcon({className:"", iconSize:[22,22], iconAnchor:[11,11],
    html:`<div class="hzm" style="--c:${HZ_COL[h.type]}">${ico(h.type)}</div>`})}).bindTooltip(esc(t("hz_"+h.type)), {direction:"top", offset:[0,-10]});
}
function drawRoute(route, fit=true){
  clearRoute();
  const latlngs = route.pts.map(p => [p.lat, p.lon]);
  routeLayer = L.layerGroup([
    L.polyline(latlngs, {color:route.color, weight:16, opacity:.16, lineJoin:"round", className:"glow"}),
    L.polyline(latlngs, {color:"#03070d", weight:9, opacity:.85, lineJoin:"round"}),
    L.polyline(latlngs, {color:route.color, weight:5, opacity:1, lineJoin:"round"})
  ]).addTo(map);
  doneLayer = L.polyline([], {color:"#3a4a63", weight:5, opacity:1, lineJoin:"round"}).addTo(map);
  if(route.isDest) destMarker(route.dest);
  else route.stops.forEach((s,i) => {
    const first=i===0, last=i===route.stops.length-1;
    if(last && Math.hypot(s[0]-route.stops[0][0], s[1]-route.stops[0][1]) < 0.0004){ stopMarkers.push(null); return; }
    if(route.recipe && !first && !last){ stopMarkers.push(null); return; }
    const label = first ? "START" : last ? "END" : String(i);
    const icon = L.divIcon({className:"", iconSize:[30,30], iconAnchor:[15,15], html:`<div class="stopmk ${first||last?"home":""}" style="--c:${route.color}">${label}</div>`});
    stopMarkers.push(L.marker([s[0],s[1]], {icon, keyboard:false}).bindPopup(esc(stopLabel(s[2]))).addTo(markLayer));
  });
  (route.hz||[]).forEach(h => { if(h.type!=="school") hzMarker(h).addTo(markLayer); });
  (route.mv||[]).forEach(m => mvMarker(route, m).addTo(markLayer));
  if(fit) fitTo(routeLayer.getLayers()[2].getBounds());
}
// The arrow is drawn in screen space, so it turns with the heading plus the map's own rotation.
function meIcon(heading){
  return L.divIcon({className:"me", iconSize:[30,30], iconAnchor:[15,15], html: heading==null
    ? `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#38e1ff" opacity=".18"/><circle cx="15" cy="15" r="7" fill="#38e1ff" stroke="#fff" stroke-width="2.5"/></svg>`
    : `<svg viewBox="0 0 30 30" style="transform:rotate(${heading + getBear()}deg)"><circle cx="15" cy="15" r="14" fill="#38e1ff" opacity=".16"/><path d="M15 3 24 25 15 20 6 25z" fill="#38e1ff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`});
}
function turnArrow(){
  const el = meMarker && meMarker.getElement && meMarker.getElement(), svg = el && el.querySelector("svg");
  if(svg && S && S.hdg!=null) svg.style.transform = `rotate(${S.hdg + getBear()}deg)`;
}

// ---------- Live traffic layers ----------
let flowLayer=null, incTiles=null;
function applyTraffic(){
  if(flowLayer){ flowLayer.remove(); flowLayer=null; } if(incTiles){ incTiles.remove(); incTiles=null; }
  const on = !!(settings.traffic && ttKey()), dark = settings.mapStyle!=="light";
  $("trafBtn").classList.toggle("on", on); $("trafBtn").setAttribute("aria-pressed", String(on));
  if(!on) return;
  const k = encodeURIComponent(ttKey());
  flowLayer = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/${dark?"relative0-dark":"relative0"}/{z}/{x}/{y}.png?key=${k}&tileSize=256`,
    {maxZoom:20, maxNativeZoom:20, minZoom:6, zIndex:5, opacity:.95, attribution:"Traffic © TomTom"}).addTo(map);
  incTiles = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/incidents/${dark?"s0-dark":"s0"}/{z}/{x}/{y}.png?key=${k}`,
    {maxZoom:20, maxNativeZoom:20, minZoom:10, zIndex:6}).addTo(map);
}
$("trafBtn").onclick = () => {
  if(!ttKey()){ toast(t("trafNeedKey"), 3500); showTab("more"); setTimeout(() => $("ttKey").scrollIntoView({block:"center", behavior:"smooth"}), 50); return; }
  settings.traffic = !settings.traffic; saveSettings(); applyTraffic(); renderSwitches();
};

// ---------- Speed cameras layer (browse mode) ----------
let camBoxes=[], camTimer=null; const camSeen=new Set();
function camRefresh(){
  clearTimeout(camTimer);
  camTimer = setTimeout(async () => {
    if(!settings.camLayer || S || map.getZoom()<11) return;
    const b=map.getBounds(); if(camBoxes.some(x => x.contains(b))) return;
    const pb=b.pad(.6);
    try{
      const j = await overpass(`[out:json][timeout:15];node["highway"="speed_camera"](${pb.getSouth()},${pb.getWest()},${pb.getNorth()},${pb.getEast()});out;`);
      camBoxes.push(pb);
      (j.elements||[]).forEach(e => {
        if(camSeen.has(e.id)) return; camSeen.add(e.id);
        const lim = parseInt((e.tags||{}).maxspeed)||null;
        hzMarker({type:"camera", lat:e.lat, lon:e.lon}).bindPopup(esc(t("hz_camera") + (lim ? " · " + t("limitTo",{n:lim}) : ""))).addTo(camLayer);
      });
    }catch(e){}
  }, 700);
}
map.on("moveend", camRefresh);
function applyCamLayer(){
  if(settings.camLayer){ if(!map.hasLayer(camLayer)) camLayer.addTo(map); camRefresh(); } else camLayer.remove();
  $("camBtn").classList.toggle("on", !!settings.camLayer); $("camBtn").setAttribute("aria-pressed", String(!!settings.camLayer));
}
$("camBtn").onclick = () => { settings.camLayer=!settings.camLayer; saveSettings(); applyCamLayer(); renderSwitches(); };

// ---------- Businesses on the map (appear when zoomed in) ----------
// Two sources: TomTom (fast, one call per area) and OpenStreetMap (rich, loaded in small tiles).
const placesLayer = L.layerGroup(), plCells = new Map(), plSeen = new Set(), plPts = []; let plTimer=null, plBusy=false, plRetry=null, plTT=[];
const PL_CELL = 0.004, PL_ZOOM = 15;
function poiStyle(tg){
  const a=tg.amenity, sh=tg.shop, tr=tg.tourism;
  if(sh==="supermarket"||sh==="convenience") return ["groc","cart","#33e3a1"];
  if(a==="fuel") return ["fuel","fuel","#ffb547"];
  if(a==="charging_station") return ["ev","plug","#33e3a1"];
  if(a==="cafe"||a==="ice_cream") return ["cafe","cup","#d8a46f"];
  if(a==="restaurant"||a==="fast_food") return ["food","fork","#ff7ab8"];
  if(a==="pub"||a==="bar") return ["pub","pint","#ffb547"];
  if(a==="pharmacy"||a==="hospital"||a==="doctors"||a==="dentist"||a==="veterinary") return ["pharm","cross","#ff4f6d"];
  if(a==="bank"||a==="atm"||a==="post_office") return ["cash","euro","#38e1ff"];
  if(a==="parking") return ["park","park","#7aa8ff"];
  if(tr==="hotel"||tr==="guest_house") return [null,"bed","#a48cff"];
  if(tr) return [null,"star","#ffb547"];
  if(sh==="doityourself"||sh==="hardware") return ["diy","tool","#8fa7c9"];
  if(sh==="bicycle") return ["bshop","bike","#33e3a1"];
  if(sh) return [null,"bag","#38e1ff"];
  return [null,"pin","#8a9bb6"];
}
const prettyTag = v => String(v||"").replace(/_/g," ").replace(/^./, c => c.toUpperCase());
function poiPlace(e){
  const tg=e.tags||{}, [catk, ic] = poiStyle(tg), lat=e.lat ?? (e.center&&e.center.lat), lon=e.lon ?? (e.center&&e.center.lon);
  const street=[tg["addr:housenumber"], tg["addr:street"]].filter(Boolean).join(" ");
  const kind = catk ? t("one_"+catk) : prettyTag(tg.shop || tg.amenity || tg.tourism);
  return {lat, lon, label:tg.name, sub:[street, tg["addr:suburb"]||tg["addr:city"]||tg["addr:town"]].filter(Boolean).join(", ") || kind, kind,
    hours:tg.opening_hours, open:openState(tg.opening_hours), phone:tg.phone||tg["contact:phone"], web:tg.website||tg["contact:website"], ic, cat:catk||"shop"};
}
// TomTom POI classes mapped onto the same look as the OpenStreetMap ones
const TT_KEEP = /^(PETROL_STATION|RESTAURANT|CAFE_PUB|SHOP|SHOPPING_CENTER|MARKET|PHARMACY|HOTEL_MOTEL|ATM|BANK|ELECTRIC_VEHICLE_STATION|HOSPITAL_POLYCLINIC|DOCTOR|DENTIST|VETERINARIAN|POST_OFFICE|CINEMA|LIBRARY|MUSEUM|TOURIST_ATTRACTION|IMPORTANT_TOURIST_ATTRACTION|NIGHTLIFE|CAR_WASH|REPAIR_FACILITY|PARKING_GARAGE|OPEN_PARKING_AREA|RESTAURANT_AREA|THEATER|LEISURE_CENTER|SPORTS_CENTER|FITNESS_CLUB_CENTER)$/;
function ttTags(poi){
  const code = ((poi.classifications||[])[0]||{}).code || "";
  const cats = [...(poi.categories||[]), ...(poi.classifications||[]).flatMap(c => (c.names||[]).map(n => n.name))].join(" ").toLowerCase();
  if(code==="PETROL_STATION") return {amenity:"fuel"};
  if(code==="ELECTRIC_VEHICLE_STATION") return {amenity:"charging_station"};
  if(code==="RESTAURANT"||code==="RESTAURANT_AREA") return {amenity: /caf|coffee/.test(cats) ? "cafe" : "restaurant"};
  if(code==="CAFE_PUB") return {amenity: /caf|coffee|tea/.test(cats) ? "cafe" : "pub"};
  if(code==="NIGHTLIFE") return {amenity:"bar"};
  if(code==="PHARMACY") return {amenity:"pharmacy"};
  if(/HOSPITAL|DOCTOR|DENTIST|VETERINARIAN/.test(code)) return {amenity:"doctors"};
  if(code==="ATM") return {amenity:"atm"};
  if(code==="BANK") return {amenity:"bank"};
  if(code==="POST_OFFICE") return {amenity:"post_office"};
  if(code==="HOTEL_MOTEL") return {tourism:"hotel"};
  if(/TOURIST_ATTRACTION|MUSEUM/.test(code)) return {tourism:"attraction"};
  if(/PARKING/.test(code)) return {amenity:"parking"};
  if(/SHOP|MARKET/.test(code)){
    if(/supermarket|grocer|convenience|food shop|hypermarket/.test(cats)) return {shop:"supermarket"};
    if(/hardware|diy|do-it-yourself/.test(cats)) return {shop:"hardware"};
    if(/bicycle|cycle/.test(cats)) return {shop:"bicycle"};
    return {shop:"yes"};
  }
  return {amenity:"other"};
}
function ttPoiPlace(r){
  const poi=r.poi||{}, tg=ttTags(poi), [catk, ic, col]=poiStyle(tg), hrs=ttHours(poi.openingHours), cat0=(poi.categories||[])[0] || ((((poi.classifications||[])[0]||{}).names||[])[0]||{}).name;
  return {lat:r.position.lat, lon:r.position.lon, label:poi.name, sub:(r.address||{}).freeformAddress||"", kind: catk && tg.amenity!=="doctors" ? t("one_"+catk) : prettyTag(cat0||""),
    hours:hrs.text, open:hrs.open, openAt:Date.now(), phone:poi.phone, web:poi.url, ic, cat:catk||"shop", col};
}
function addPlaceMarker(p, col){
  if(p.lat==null || !p.label) return;
  const nm = p.label.toLowerCase().replace(/[^a-z0-9]/g,"");
  if(plPts.some(q => q.n===nm && Math.abs(q.lat-p.lat) < 0.0008 && Math.abs(q.lon-p.lon) < 0.0012)) return;   // same place from the other source
  plPts.push({n:nm, lat:p.lat, lon:p.lon});
  L.marker([p.lat,p.lon], {keyboard:false, icon:L.divIcon({className:"", iconSize:[24,24], iconAnchor:[12,12],
    html:`<div class="plm" style="--c:${col}">${ico(p.ic)}${p.open===true?'<i class="dot on"></i>':p.open===false?'<i class="dot off"></i>':""}</div>`})})
    .bindTooltip(esc(p.label), {direction:"top", offset:[0,-10]}).on("click", () => openPlace(p)).addTo(placesLayer);
}
async function ttPlaces(c, radius){
  if(!ttKey() || plTT.some(a => hav(a.lat,a.lon,c.lat,c.lon) < a.r*0.55)) return;
  plTT.push({lat:c.lat, lon:c.lon, r:radius});
  try{
    const res = await fetchT(`https://api.tomtom.com/search/2/nearbySearch/.json?key=${encodeURIComponent(ttKey())}&lat=${c.lat.toFixed(5)}&lon=${c.lon.toFixed(5)}&radius=${Math.round(radius)}&limit=100&openingHours=nextSevenDays&language=en-GB`, {}, 9000);
    if(!res.ok) throw new Error("tomtom "+res.status);
    for(const r of (await res.json()).results||[]){
      const poi=r.poi||{}, code=((poi.classifications||[])[0]||{}).code||"";
      if(!poi.name || !TT_KEEP.test(code)) continue;
      const id="tt"+r.id; if(plSeen.has(id)) continue; plSeen.add(id);
      const p=ttPoiPlace(r); addPlaceMarker(p, p.col);
    }
  }catch(e){ plTT = plTT.filter(a => !(a.lat===c.lat && a.lon===c.lon)); throw e; }
}
async function osmPlaces(cells){
  const xs=cells.map(c=>c[0]), ys=cells.map(c=>c[1]);
  const bb=`${Math.min(...ys)*PL_CELL},${Math.min(...xs)*PL_CELL},${(Math.max(...ys)+1)*PL_CELL},${(Math.max(...xs)+1)*PL_CELL}`;
  cells.forEach(([x,y]) => plCells.set(x+","+y, "busy"));
  try{
    const j = await overpass(`[out:json][timeout:15];(nwr["shop"]["name"](${bb});nwr["amenity"~"^(cafe|restaurant|fast_food|pub|bar|pharmacy|fuel|bank|atm|post_office|charging_station|hospital|doctors|dentist|veterinary|ice_cream|cinema|library|car_wash)$"]["name"](${bb});nwr["tourism"~"^(hotel|guest_house|museum|attraction)$"]["name"](${bb}););out center tags 1500;`, null, 15000);
    cells.forEach(([x,y]) => plCells.set(x+","+y, "ok"));
    for(const e of j.elements||[]){
      const id=e.type+e.id; if(plSeen.has(id)) continue; plSeen.add(id);
      addPlaceMarker(poiPlace(e), poiStyle(e.tags||{})[2]);
    }
  }catch(e){ cells.forEach(([x,y]) => plCells.delete(x+","+y)); throw e; }
}
async function placesRefresh(){
  clearTimeout(plRetry);
  const show = settings.placesLayer && !S && map.getZoom() >= PL_ZOOM;
  if(!show){ if(map.hasLayer(placesLayer)) placesLayer.remove(); return; }
  if(!map.hasLayer(placesLayer)) placesLayer.addTo(map);
  if(plBusy) return;
  const b=map.getBounds(), c=b.getCenter(), cx=c.lng/PL_CELL, cy=c.lat/PL_CELL, need=[];
  for(let y=Math.floor(b.getSouth()/PL_CELL); y<=Math.floor(b.getNorth()/PL_CELL); y++)
    for(let x=Math.floor(b.getWest()/PL_CELL); x<=Math.floor(b.getEast()/PL_CELL); x++){ if(!plCells.has(x+","+y)) need.push([x,y]); }
  need.sort((p,q) => Math.hypot(p[0]+.5-cx,p[1]+.5-cy) - Math.hypot(q[0]+.5-cx,q[1]+.5-cy));    // middle of the screen first
  const radius = Math.min(1500, Math.max(300, b.getNorthEast().distanceTo(b.getSouthWest())/2));
  plBusy=true; let failed=false;
  try{
    await ttPlaces({lat:c.lat, lon:c.lng}, radius).catch(() => { failed=true; });
    for(let i=0; i<need.length && i<24; i+=6){
      if(S || map.getZoom() < PL_ZOOM) break;
      try{ await osmPlaces(need.slice(i, i+6)); }catch(e){ failed=true; break; }
    }
  } finally { plBusy=false; }
  if(failed) plRetry = setTimeout(placesRefresh, 8000);       // a busy server: try again shortly
  else if(need.length > 24) plRetry = setTimeout(placesRefresh, 300);
}
map.on("moveend", () => { clearTimeout(plTimer); plTimer=setTimeout(placesRefresh, 450); });

// ---------- Your location (browse mode) ----------
let here = null;
function biasPoint(){ if(here) return here; const c=map.getCenter(); return {lat:c.lat, lon:c.lng}; }
function locate(cb, quiet){
  if(!("geolocation" in navigator)){ if(!quiet) toast(t("noGeo")); cb && cb(null); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    here = {lat:pos.coords.latitude, lon:pos.coords.longitude, at:Date.now()};
    if(!S){ if(!hereMarker) hereMarker = L.marker([here.lat,here.lon], {icon:meIcon(null), keyboard:false, zIndexOffset:900}).addTo(map); else hereMarker.setLatLng([here.lat,here.lon]); }
    cb && cb(here);
  }, err => { if(!quiet) toast(err.code===1 ? t("geoBlocked") : t("geoWait"), 4000); cb && cb(null); },
  {enableHighAccuracy:true, timeout:9000, maximumAge:60000});
}
const freshHere = () => here && Date.now()-here.at < 120000;
const withHere = cb => freshHere() ? cb(here) : locate(cb, true);
$("locateBtn").onclick = () => locate(h => { if(h) map.setView([h.lat,h.lon], Math.max(map.getZoom(), 15)); });
const distFromHere = p => here ? hav(here.lat, here.lon, p.lat, p.lon) : null;

// =====================================================================
// Tabs and sheet
// =====================================================================
let tab = "go";
function showTab(tb){
  tab = tb; store.set("ttr-tab", tb);
  document.querySelectorAll("[data-pane]").forEach(s => s.hidden = s.dataset.pane!==tb);
  document.querySelectorAll("#tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab===tb)));
  $("sheet").classList.remove("collapsed"); $("panes").scrollTop = 0;
  refreshMap();
  if(tb==="go") renderRain();
}
$("tabs").addEventListener("click", e => { const b=e.target.closest("[data-tab]"); if(b) showTab(b.dataset.tab); });
// Bottom sheet: tap the handle to toggle; swipe it (or the panel when scrolled to the top) down to close and up to open.
(function sheetGestures(){
  const sh=$("sheet"), panes=$("panes"), grab=$("grab"), tabs=$("tabs");
  let y0=null, dy=0, dragging=false, fromPanes=false, moved=false, skipClick=false;
  const collapsed = () => sh.classList.contains("collapsed");
  function start(y, src){ if(document.body.classList.contains("driving")) return; y0=y; dy=0; moved=false; fromPanes = src==="panes"; dragging = !fromPanes; }
  function move(y, e){
    if(y0==null) return;
    let d = y - y0;
    if(fromPanes && !dragging){
      if(panes.scrollTop<=0 && d>10){ dragging=true; y0=y; d=0; }       // pulling down from the top of the list
      else if(Math.abs(d)>10){ y0=null; return; }                        // normal scrolling
      else return;
    }
    if(!dragging) return;
    if(e && e.cancelable) e.preventDefault();
    dy = collapsed() ? Math.min(0, d) : Math.max(0, d);
    if(Math.abs(d) > 6) moved = true;
    sh.style.transition = "none";
    sh.style.transform = `translateY(${collapsed() ? Math.max(dy, -80)*0.4 : dy}px)`;
  }
  function end(){
    if(y0==null && !dragging) return;
    const wasMoved = dragging && moved;
    if(wasMoved){
      if(!collapsed() && dy > 70){ sh.style.transition="transform .2s ease"; sh.style.transform=`translateY(${sh.offsetHeight}px)`; setTimeout(() => { sh.classList.add("collapsed"); sh.style.transition="none"; sh.style.transform=""; requestAnimationFrame(() => sh.style.transition=""); }, 190); }
      else if(collapsed() && dy < -25){ sh.style.transition=""; sh.style.transform=""; sh.classList.remove("collapsed"); }
      else { sh.style.transition="transform .2s ease"; sh.style.transform=""; setTimeout(() => sh.style.transition="", 220); }
      skipClick = true; setTimeout(() => skipClick=false, 350);
    } else { sh.style.transition=""; sh.style.transform=""; }
    y0=null; dragging=false; dy=0;
  }
  [grab, tabs].forEach(el => {
    el.addEventListener("pointerdown", e => { if(e.pointerType==="mouse" && e.button!==0) return; start(e.clientY, "grab"); });
  });
  window.addEventListener("pointermove", e => { if(y0!=null && !fromPanes) move(e.clientY, e); });
  window.addEventListener("pointerup", () => { if(!fromPanes) end(); });
  window.addEventListener("pointercancel", () => { if(!fromPanes) end(); });
  panes.addEventListener("touchstart", e => start(e.touches[0].clientY, "panes"), {passive:true});
  panes.addEventListener("touchmove", e => move(e.touches[0].clientY, e), {passive:false});
  panes.addEventListener("touchend", end); panes.addEventListener("touchcancel", end);
  grab.addEventListener("click", () => { if(!skipClick) sh.classList.toggle("collapsed"); });
  tabs.addEventListener("click", e => { if(skipClick){ e.stopPropagation(); e.preventDefault(); } }, true);
})();
map.on("click", () => { if(!S && $("sheet").offsetHeight > window.innerHeight*0.45) $("sheet").classList.add("collapsed"); });
function refreshMap(){
  if(S) return;
  clearRoute(); poiLayer.clearLayers();
  if(tab==="test"){ if(practice && practice.pts) drawRoute(practice); return; }
  if(tab==="explore"){ drawExploreMarkers(); return; }
  if(tab==="go"){
    drawNearMarkers();
    if(dest){
      if(travelMode==="pt" && ptData && ptData[ptSel]) drawPt(ptData[ptSel], false);
      else if(travelMode==="car" && dest.pts) drawRoute(dest, false);
      else destMarker(dest.dest);
    }
  }
}

// =====================================================================
// Go tab
// =====================================================================
let dest = null, previewCtl = null;
const places = store.get("ttr-places", {});
let favs = store.get("ttr-favs", []), recent = store.get("ttr-recent", []);
const samePlace = (a,b) => a && b && Math.abs(a.lat-b.lat)<0.0003 && Math.abs(a.lon-b.lon)<0.0003;
const slim = p => ({lat:p.lat, lon:p.lon, label:p.label, sub:p.sub||"", kind:p.kind||"", hours:p.hours, phone:p.phone, web:p.web, ex:p.ex, cat:p.cat, open:p.open, openAt:p.openAt});
function view(p){
  if(p.ex!=null && EXPLORE[p.ex]){
    const x=EXPLORE[p.ex];
    return {...p, sub:`${x.c} · ${t("tn_"+x.t)}`, blurb: lang==="pl" ? x.p : x.d, trail: x.km ? [trTrail(x.km), trTrail(x.h), trTrail(x.g)] : null};
  }
  return p;
}
function renderPlaces(){
  const chips = [];
  if(places.home) chips.push(`<button class="chip place" type="button" data-q="home">${ico("home")}${t("home")}</button>`);
  if(places.work) chips.push(`<button class="chip place" type="button" data-q="work">${ico("work")}${t("work")}</button>`);
  if(car) chips.unshift(`<button class="chip place" type="button" data-car>${ico("car")}${t("myCar")}</button>`);
  favs.forEach((f,i) => chips.push(`<button class="chip" type="button" data-fav="${i}">${ico("star")}${esc(f.label)}</button>`));
  chips.push(`<button class="chip" type="button" data-parkhere>${ico("park")}${t("parkHere")}</button>`);
  $("places").innerHTML = chips.join(""); $("places").hidden = !chips.length;
  if(typeof rc!=="undefined" && tab==="go" && !S) renderRain(true);
  renderSaved();
}
$("places").addEventListener("click", e => {
  const q=e.target.closest("[data-q]"), f=e.target.closest("[data-fav]");
  if(q) openPlace(places[q.dataset.q], q.dataset.q); else if(f) openPlace(favs[+f.dataset.fav]);
  else if(e.target.closest("[data-car]")) openCar();
  else if(e.target.closest("[data-parkhere]")) locate(h => { if(h){ saveCar(h); toast(t("parkSaved")); } });
});
function itemHtml(p, attrs, icon, n){
  const d = distFromHere(p), v = view(p);
  return `<button class="item" type="button" ${attrs}><span class="ico">${ico(icon||"pin")}${n?`<i class="rn">${n}</i>`:""}</span>
    <span class="meta"><b>${esc(v.label)}</b><small>${esc(v.sub||v.kind||"")}</small></span>${d!=null?`<span class="far">${fmtDist(d)}</span>`:""}</button>`;
}

// Search with suggestions
let acCtl=null, acTimer=null, lastResults=[];
const resLayer = L.layerGroup().addTo(map);
function drawResults(fit){
  resLayer.clearLayers();
  if(S || $("results").hidden) return;
  lastResults.forEach((p,i) => L.marker([p.lat,p.lon], {keyboard:false, zIndexOffset:600, icon:L.divIcon({className:"", iconSize:[26,26], iconAnchor:[13,13],
    html:`<div class="resm">${i+1}</div>`})}).bindTooltip(esc(p.label), {direction:"top", offset:[0,-12]})
    .on("click", () => pickResult(i)).addTo(resLayer));
  if(fit && lastResults.length){
    const b = L.latLngBounds(lastResults.map(p => [p.lat,p.lon]));
    if(!map.getBounds().contains(b)) fitTo(b, 15);
  }
}
function hideResults(){ $("results").hidden=true; lastResults=[]; resLayer.clearLayers(); }
function pickResult(i){ const p=lastResults[i]; if(!p) return; $("addr").value=""; $("clearAddr").hidden=true; hideResults(); openPlace(p); }
async function runSearch(q){
  if(acCtl) acCtl.abort(); acCtl = new AbortController();
  const box=$("results"); box.hidden=false;
  if(!lastResults.length) box.innerHTML = `<div class="empty">${t("searching")}</div>`;
  try{
    lastResults = await searchPlaces(q, acCtl.signal);
    box.innerHTML = lastResults.length ? lastResults.map((p,i) => itemHtml(p, `data-i="${i}"`, p.ic || "pin", i+1)).join("") : `<div class="empty">${t("noFound")}</div>`;
    drawResults(true);
  }catch(e){ if(e.name!=="AbortError") box.innerHTML = `<div class="empty">${t("searchFail")}</div>`; }
}
$("addr").addEventListener("input", () => {
  const q=$("addr").value.trim(); $("clearAddr").hidden=!q; clearTimeout(acTimer);
  if(q.length<3){ hideResults(); return; }
  acTimer=setTimeout(() => runSearch(q), 350);
});
$("addr").addEventListener("focus", () => $("sheet").classList.remove("collapsed"));
$("searchForm").addEventListener("submit", e => { e.preventDefault(); const q=$("addr").value.trim(); if(q){ clearTimeout(acTimer); $("addr").blur(); runSearch(q); } });
$("clearAddr").onclick = () => { $("addr").value=""; $("clearAddr").hidden=true; hideResults(); $("addr").focus(); };
$("results").addEventListener("click", e => { const b=e.target.closest("[data-i]"); if(b) pickResult(+b.dataset.i); });

// Place card
let travelMode = store.get("ttr-mode", "car");
const destName = d => d.nameKey ? t(d.nameKey) : d.isPin ? t("pin") : d.dest.label;
function openPlace(p, nameKey, isPin, isCar){
  if(!p) return;
  const place = slim(p);
  dest = {id:"dest", isDest:true, nameKey, isPin:!!isPin, isCar:!!isCar, color:"#38e1ff", dest:place, stops:[]};
  if(tab!=="go") showTab("go");
  $("sheet").classList.remove("collapsed");
  ptData=null; ptSel=0; dest.photos=null;
  renderDestCard();
  if(!isPin && !isCar) addRecent(place);
  clearRoute(); destMarker(place);
  map.setView([place.lat, place.lon], Math.max(map.getZoom(), 14));
  $("panes").scrollTop = 0;
  const r = dest;
  if(isCar) withHere(h => { if(dest===r){ r.walk = h ? hav(h.lat,h.lon,place.lat,place.lon) : null; renderMode(); } });
  else if(travelMode==="pt") ptSearch(); else previewRoute();
  $("destHero").className = isCar ? "hero none" : "hero loading";
  if(!isCar) photosFor(place).then(ph => { if(dest===r){ r.photos=ph; renderPhotos(); } });
  $("destWx").hidden = true;
  weatherAt(place).then(w => { if(dest===r){ r.wx=w; renderWx(); } }).catch(() => {});
}
function renderWx(){
  const w = dest && dest.wx, el=$("destWx");
  if(!w || dest.isCar){ el.hidden=true; return; }
  const tm = s => String(s||"").slice(11,16);
  el.hidden=false;
  el.innerHTML = `<span class="wxm">${ico(w.icon)}<b>${w.temp}°</b>${esc(t(w.key))}</span><span>${ico("wind")}${esc(t("wind",{v:w.wind}))}</span>`
    + (w.sunset ? `<span>${ico("moon")}${esc(t("sunset",{t:tm(w.sunset)}))}</span>` : "")
    + (w.rain3 >= 40 ? `<span class="wet">${ico("rain")}${esc(t("rain3",{p:w.rain3}))}</span>` : "");
  renderBikeInfo();
}
// ---------- Find my car ----------
let car = store.get("ttr-car", null);
const carLayer = L.layerGroup().addTo(map);
function drawCar(){
  carLayer.clearLayers();
  if(!car || S) return;
  L.marker([car.lat, car.lon], {keyboard:false, zIndexOffset:400, icon:L.divIcon({className:"", iconSize:[34,34], iconAnchor:[17,17], html:`<div class="carmk">${ico("car")}</div>`})})
    .on("click", openCar).addTo(carLayer);
}
function saveCar(p){ car = {lat:p.lat, lon:p.lon, at:Date.now()}; store.set("ttr-car", car); renderPlaces(); drawCar(); }
function openCar(){ if(car) openPlace({lat:car.lat, lon:car.lon, label:t("myCar"), sub:t("parkedAt",{t:hhmm(car.at)})}, "myCar", false, true); }
function renderPhotos(){
  const ph = dest && dest.photos, hero=$("destHero"), gal=$("destGal");
  if(!ph || !ph.hero){ hero.className="hero none"; hero.innerHTML=""; gal.innerHTML=""; gal.hidden=true; return; }
  hero.className = "hero";
  hero.innerHTML = `<img alt="" src="${esc(ph.hero.src)}" loading="lazy"><span class="cred">${ico("photo")}${esc(ph.hero.wiki ? "Wikipedia" : (ph.hero.credit || "Wikimedia Commons"))}</span>`;
  hero.querySelector("img").onerror = () => { hero.className="hero none"; hero.innerHTML=""; };
  const rest = ph.gal.filter(g => g.src!==ph.hero.src).slice(0,8);
  gal.hidden = !rest.length;
  gal.innerHTML = rest.map((g,i) => `<button type="button" data-g="${i}" style="background-image:url('${esc(g.thumb)}')" aria-label="Photo"></button>`).join("");
  gal._list = rest;
}
$("destHero").onclick = () => { if(dest && dest.photos && dest.photos.hero) openViewer(dest.photos.hero); };
$("destGal").addEventListener("click", e => { const b=e.target.closest("[data-g]"); if(b) openViewer($("destGal")._list[+b.dataset.g]); });
function renderDestCard(){
  if(!dest) return;
  const p = view(dest.dest), name = destName(dest);
  $("destName").textContent = name;
  $("destSub").textContent = name!==p.label ? [p.label, p.sub].filter(Boolean).join(", ") : (p.sub || p.kind || "");
  const parts = [];
  if(p.trail) parts.push(`<div class="trail">${p.trail.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`);
  if(p.blurb) parts.push(`<p>${esc(p.blurb)}</p>`);
  const info = [];
  if(p.hours){ const op=openState(p.hours), o = op!==null ? op : (p.openAt && Date.now()-p.openAt < 30*60000 ? p.open : null);
    info.push(`<div><span>${t("hours")}</span><em>${esc(p.hours)} ${ocBadge(o)}</em></div>`); }
  if(p.phone) info.push(`<div><span>${t("phone")}</span><a href="tel:${esc(p.phone.replace(/[^\d+]/g,""))}">${esc(p.phone)}</a></div>`);
  const w = p.web && safeUrl(p.web);
  if(w) info.push(`<div><span>${t("web")}</span><a href="${esc(w)}" target="_blank" rel="noopener">${esc(hostOf(w))}</a></div>`);
  if(info.length) parts.push(`<div class="info">${info.join("")}</div>`);
  $("destBody").innerHTML = parts.join("");
  const isFav = favs.some(f => samePlace(f,p));
  $("favBtn").innerHTML = `${ico("star")}${isFav?t("savedBtn"):t("save")}`; $("favBtn").classList.toggle("on", isFav);
  $("destCard").classList.toggle("car", !!dest.isCar);
  renderMode(); renderEta(); renderPhotos(); renderWx();
  $("destCard").hidden = false;
}
function renderMode(){
  const isCar = !!(dest && dest.isCar);
  document.querySelectorAll("#modeSeg [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode===travelMode)));
  $("modeSeg").hidden = isCar; $("carBox").hidden = isCar || travelMode==="pt"; $("ptBox").hidden = isCar || travelMode!=="pt";
  applyCycle();
  $("carInfo").hidden = !isCar; $("forgetCar").hidden = !isCar;
  if(isCar) $("carInfo").innerHTML = `${ico("walk")}<b>${dest.walk!=null ? esc(t("walkAway",{d:fmtDist(dest.walk)})) : "…"}</b><span>${esc(t("parkedAt",{t:hhmm(car ? car.at : Date.now())}))}</span>`;
  const sharable = !isCar && travelMode!=="pt" && dest && dest.eta && dest.eta.key==="etaDrive";
  $("shareBtn").hidden = !sharable; $("shareBtn").innerHTML = `${ico("share")}${t("share")}`;
  if(dest) $("gmaps").href = `https://www.google.com/maps/dir/?api=1&destination=${dest.dest.lat},${dest.dest.lon}&travelmode=${isCar ? "walking" : travelMode==="pt" ? "transit" : travelMode==="bike" ? "bicycling" : "driving"}`;
}
$("forgetCar").onclick = () => { car=null; store.set("ttr-car", null); renderPlaces(); drawCar(); $("destClose").onclick(); };
$("shareBtn").onclick = async () => {
  if(!dest || !dest.eta || !dest.eta.v) return;
  const when = hhmm(Date.now() + dest.eta.v.s*1000), url=`https://www.google.com/maps/search/?api=1&query=${dest.dest.lat},${dest.dest.lon}`;
  const text = t("shareText", {n:destName(dest), t:when});
  try{ if(navigator.share){ await navigator.share({title:"Drive Ireland", text, url}); return; } }catch(e){ if(e.name==="AbortError") return; }
  try{ await navigator.clipboard.writeText(text+" "+url); toast(t("copied")); }catch(e){ toast(text); }
};
function setEta(key, v){ if(dest){ dest.eta = {key, v}; renderEta(); } }
function renderEta(){
  const e = dest && dest.eta, el=$("destEta");
  if(!e){ el.className="eta wait"; el.textContent=""; return; }
  el.className = e.key==="etaDrive" ? "eta" : "eta wait";
  const tr = e.v && e.v.delay!=null ? (e.v.delay >= 60 ? `<em class="tdelay bad">${esc(t("delayMin",{m:Math.round(e.v.delay/60)}))}</em>` : `<em class="tdelay">${esc(t("noDelay"))}</em>`) : "";
  const bk = e.v && e.v.bike;
  el.innerHTML = e.key==="etaDrive" ? `${ico(bk ? "bike" : "car")}<b>${esc(fmtDur(e.v.s))}</b><span>${esc(fmtDist(e.v.m))}</span>${bk ? "" : tr}` : esc(t(e.key));
  el.classList.toggle("bk", !!bk);
  renderBikeInfo(); renderInc(); renderMode();
}
// Bike extras: climb, head/tailwind and an elevation profile
function windRel(r, w){
  if(!w || w.windDir==null || !r.pts || w.wind < 8) return null;
  const a=r.pts[0], b=r.pts[r.pts.length-1], brg=(Math.atan2(b.x-a.x, b.y-a.y)/RAD+360)%360;
  const diff=Math.abs(((brg - w.windDir) % 360 + 540) % 360 - 180);           // 0 = riding straight into the wind
  return diff < 60 ? "headwind" : diff > 120 ? "tailwind" : "crosswind";
}
function renderBikeInfo(){
  const box=$("bikeInfo"), r=dest;
  if(!r || travelMode!=="bike" || !r.pts || r.isCar){ box.hidden=true; return; }
  const chips=[], el=r.elev, wr=windRel(r, r.wx);
  if(el) chips.push(`<span>${ico("climb")}${esc(t("climbUp",{m:el.climb}))}</span><span>${ico("descend")}${esc(t("climbDown",{m:el.drop}))}</span>`);
  if(wr) chips.push(`<span class="${wr}">${ico("wind")}${esc(t(wr,{v:r.wx.wind}))}</span>`);
  let spark="";
  if(el && el.elev.length > 2){
    const v=el.elev, lo=Math.min(...v), hi=Math.max(...v), span=Math.max(hi-lo, 15);
    const pts=v.map((y,i) => `${(i/(v.length-1)*100).toFixed(2)},${(28-(y-lo)/span*24).toFixed(2)}`).join(" ");
    spark = `<div class="elev"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><defs><linearGradient id="eg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#33e3a1" stop-opacity=".45"/><stop offset="1" stop-color="#33e3a1" stop-opacity="0"/></linearGradient></defs><polygon points="0,30 ${pts} 100,30" fill="url(#eg)"/><polyline points="${pts}" fill="none" stroke="#33e3a1" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg><span>${Math.round(hi)} m</span><span>${Math.round(lo)} m</span></div>`;
  }
  box.hidden = !chips.length && !spark;
  box.innerHTML = `<div class="bchips">${chips.join("")}</div>${spark}`;
}
async function elevationFor(route){
  const n=Math.min(100, Math.max(12, Math.round(route.total/80))), pts=[...Array(n)].map((_,i) => pointAt(route, route.total*i/(n-1)));
  const res = await fetchT(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p=>p.lat.toFixed(5)).join(",")}&longitude=${pts.map(p=>p.lon.toFixed(5)).join(",")}`, {}, 8000);
  if(!res.ok) throw new Error("elevation "+res.status);
  const el=((await res.json()).elevation||[]).filter(v => typeof v==='number'); if(el.length < 3) throw new Error('no elevation'); let climb=0, drop=0;
  for(let i=1;i<el.length;i++){ const d=el[i]-el[i-1]; if(d>0) climb+=d; else drop-=d; }
  return {elev:el, climb:Math.round(climb), drop:Math.round(drop)};
}
// Cycle lanes overlay (CyclOSM lite)
let cycleLayer=null;
function applyCycle(){
  const on = settings.cycleLayer || (!!dest && travelMode==="bike" && !dest.isCar) || !!(S && S.route.profile==="bike");
  if(on && !cycleLayer) cycleLayer = L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png",
    {subdomains:"abc", maxZoom:20, maxNativeZoom:19, zIndex:4, opacity:.95, attribution:'Cycle lanes © <a href="https://www.cyclosm.org" target="_blank" rel="noopener">CyclOSM</a>'}).addTo(map);
  else if(!on && cycleLayer){ cycleLayer.remove(); cycleLayer=null; }
}
function renderInc(){
  const list = (dest && travelMode==="car" && dest.incidents) || [], box=$("destInc");
  box.hidden = !list.length;
  box.innerHTML = list.length ? `<div class="ph">${t("incTitle")}</div>` + list.slice(0,5).map(i => `<div class="inc" style="--c:${INC_COL[i.kind]}">${ico(i.kind)}
    <div><b>${esc(t("inc_"+i.kind))}${i.road?` · ${esc(i.road)}`:""}</b><small>${esc([i.desc, i.from && i.to ? `${i.from} → ${i.to}` : ""].filter(Boolean).join(" · "))}</small></div>
    ${i.delay>=60?`<span>${esc(t("delayMin",{m:Math.round(i.delay/60)}).split(" ")[0])} min</span>`:""}</div>`).join("") : "";
}
async function previewRoute(){
  const r = dest; if(!r) return;
  if(previewCtl) previewCtl.abort(); previewCtl = new AbortController();
  setEta("findingRoute");
  withHere(async h => {
    if(dest!==r) return;
    if(!h){ setEta("tapGo"); return; }
    if(hav(h.lat,h.lon,r.dest.lat,r.dest.lon) < 60){ setEta("youreHere"); return; }
    try{
      const bike = travelMode==="bike";
      r.profile = bike ? "bike" : "car"; r.color = bike ? "#33e3a1" : "#38e1ff"; r.elev = null;
      const data = await osrmFetch(`${h.lon},${h.lat};${r.dest.lon},${r.dest.lat}`, previewCtl.signal, r.profile);
      if(dest!==r || r.profile!==(travelMode==="bike"?"bike":"car")) return;
      applyOsrm(r, data);
      setEta("etaDrive", {s:r.duration, m:r.total, bike});
      if(tab==="go" && !S && travelMode!=="pt"){ drawRoute(r, false); fitTo(routeLayer.getLayers()[2].getBounds(), 15); }
      if(bike){ elevationFor(r).then(el => { if(dest===r){ r.elev=el; renderEta(); } }).catch(() => {}); return; }
      if(ttKey()){
        ttRoute(h, r.dest).then(tr => { if(dest===r){ r.duration = tr.secs; setEta("etaDrive", {s:tr.secs, m:r.total, delay:tr.delay}); } }).catch(() => {});
        ttIncidents(r).then(list => { if(dest===r){ r.incidents = list; renderInc(); } }).catch(() => {});
      }
    }catch(e){ if(e.name!=="AbortError" && dest===r) setEta("routeErr"); }
  });
}
function finalizeDest(r){ const last = r.steps[r.steps.length-1]; if(last && last.icon==="flag") last.text = r.isPin ? t("arrPin") : t("arrAt", {n:destName(r)}); }
$("destClose").onclick = () => { dest=null; ptData=null; $("destCard").hidden=true; if(previewCtl) previewCtl.abort(); if(ptCtl) ptCtl.abort(); applyCycle(); refreshMap(); };
$("favBtn").onclick = () => {
  if(!dest) return; const p=dest.dest, i=favs.findIndex(f => samePlace(f,p));
  if(i>=0){ favs.splice(i,1); toast(t("removedT")); }
  else { favs.unshift({...slim(p), label: dest.isPin ? (p.sub || t("pin")) : destName(dest)}); favs=favs.slice(0,12); toast(t("savedT")); }
  store.set("ttr-favs", favs); renderPlaces(); renderDestCard();
};
document.querySelectorAll("[data-save]").forEach(b => b.onclick = () => {
  if(!dest) return; places[b.dataset.save] = slim(dest.dest); store.set("ttr-places", places); renderPlaces();
  toast(t("savedAs", {n:t(b.dataset.save)}));
});
$("goBtn").onclick = () => { if(dest) startSession(dest, "gps"); };
$("modeSeg").addEventListener("click", e => {
  const b=e.target.closest("[data-mode]"); if(!b || b.dataset.mode===travelMode) return;
  travelMode=b.dataset.mode; store.set("ttr-mode", travelMode); renderMode();
  if(!dest) return;
  clearRoute(); destMarker(dest.dest);
  if(travelMode==="pt") ptSearch(); else { dest.pts=null; dest.raw=null; dest.incidents=null; previewRoute(); }
});
map.on("contextmenu", async e => {
  if(S) return;
  if(tab==="test" && practice && practice.pts && mvAddPopup(practice, e.latlng)) return;
  const lat=e.latlng.lat, lon=e.latlng.lng;
  openPlace({lat, lon, label:`${lat.toFixed(5)}, ${lon.toFixed(5)}`, sub:""}, null, true);
  const r = await reverseLabel(lat, lon);
  if(r && dest && samePlace(dest.dest, {lat,lon})){ dest.dest.sub = [r.label, r.sub].filter(Boolean).join(", "); renderDestCard(); }
});

// Recent
function addRecent(p){ recent = [slim(p), ...recent.filter(r => !samePlace(r,p))].slice(0,6); store.set("ttr-recent", recent); renderRecent(); }
function renderRecent(){ $("recentWrap").hidden = !recent.length; $("recent").innerHTML = recent.map((p,i) => itemHtml(p, `data-r="${i}"`, "clock")).join(""); }
$("recent").addEventListener("click", e => { const b=e.target.closest("[data-r]"); if(b) openPlace(recent[+b.dataset.r]); });
$("recentClear").onclick = () => { recent=[]; store.set("ttr-recent", recent); renderRecent(); };

// Nearby
let nearCat=null, nearResults=[], nearCtl=null, nearMeta=null;
function renderCats(){ $("cats").innerHTML = CATS.map(c => `<button class="cat ${nearCat===c?"on":""}" type="button" data-cat="${c.k}"><span class="orb">${ico(c.ic)}</span>${t("cat_"+c.k)}</button>`).join(""); }
$("cats").addEventListener("click", e => { const b=e.target.closest("[data-cat]"); if(b) nearby(CATS.find(c => c.k===b.dataset.cat)); });
function osmPlace(e, cat){
  const tg=e.tags||{}, lat=e.lat ?? (e.center&&e.center.lat), lon=e.lon ?? (e.center&&e.center.lon);
  const street=[tg["addr:housenumber"], tg["addr:street"]].filter(Boolean).join(" ");
  const area=tg["addr:suburb"]||tg["addr:city"]||tg["addr:town"]||tg["addr:village"];
  const brand = tg.name && tg.brand && tg.brand!==tg.name ? tg.brand : "";
  return {lat, lon, label:tg.name||tg.brand||tg.operator||t("one_"+cat.k), sub:[street, area].filter(Boolean).join(", ") || brand || t("one_"+cat.k),
    kind:t("one_"+cat.k), hours:tg.opening_hours, open:openState(tg.opening_hours), phone:tg.phone||tg["contact:phone"], web:tg.website||tg["contact:website"], ic:cat.ic, cat:cat.k};
}
let nearOpenOnly = false;
function renderNear(){
  if(!nearCat) return;
  $("nearOpen").classList.toggle("on", nearOpenOnly);
  if(!nearMeta){ $("nearTitle").textContent = t("nearSearching", {c:t("cat_"+nearCat.k)}); $("nearList").innerHTML = `<div class="scan"><i></i><i></i><i></i></div>`; return; }
  if(nearMeta.err){ $("nearTitle").textContent = t("cat_"+nearCat.k); $("nearList").innerHTML = `<div class="empty">${t("nearFail")} <button class="link inl" type="button" data-retry>${t("retry")}</button></div>`; return; }
  $("nearTitle").textContent = t("nearWithin", {c:t("cat_"+nearCat.k), r:num(nearMeta.radius, nearMeta.radius%1?1:0)}) + (nearMeta.fromHere ? "" : t("nearMapCentre"));
  const list = nearResults.map((p,i) => ({p,i})).filter(x => !nearOpenOnly || x.p.open===true);
  $("nearList").innerHTML = list.length
    ? list.map(({p,i}) => `<button class="item" type="button" data-n="${i}"><span class="ico">${ico(p.ic)}</span>
        <span class="meta"><b>${esc(p.label)}</b><small>${esc(p.sub || p.hours || "")}</small></span><span class="rt">${ocBadge(p.open)}<span class="far">${fmtDist(p.d)}</span></span></button>`).join("")
    : `<div class="empty">${t("nearNone")}</div>`;
}
async function nearby(cat){
  nearCat = cat; nearMeta = null; renderCats();
  $("nearWrap").hidden=false; renderNear();
  if(nearCtl) nearCtl.abort(); nearCtl = new AbortController(); const ctl=nearCtl;
  const c = freshHere() ? here : await new Promise(res => locate(h => res(h || biasPoint()), true));
  if(ctl!==nearCtl) return;
  const fromHere = !!(here && c===here);
  try{
    let list=null, radius=3;
    if(ttKey() && TT_Q[cat.k]){
      try{ list = await ttNearby(cat, c, 3000, ctl.signal); if(list && list.length < 4){ list = await ttNearby(cat, c, 8000, ctl.signal); radius = 8; } }
      catch(e){ if(e.name==="AbortError") throw e; list = null; }
    }
    if(!list){
      const ask = R => overpass(`[out:json][timeout:15];(${cat.q.map(f => `nwr${f}(around:${R},${c.lat},${c.lon});`).join("")});out center tags 80;`, ctl.signal, 12000);
      let j = await ask(3000); radius = 3;
      if((j.elements||[]).length < 4){ j = await ask(8000); radius = 8; }
      list = (j.elements||[]).map(e => osmPlace(e, cat)).filter(p => p.lat!=null);
    }
    if(ctl!==nearCtl) return;
    nearResults = list.map(p => ({...p, d:hav(c.lat,c.lon,p.lat,p.lon)})).sort((a,b) => a.d-b.d).slice(0,25);
    nearMeta = {radius, fromHere}; renderNear(); drawNearMarkers(true);
  }catch(e){ if(e.name!=="AbortError" && ctl===nearCtl){ nearMeta = {err:true}; renderNear(); } }
}
function drawNearMarkers(fit){
  poiLayer.clearLayers(); if(tab!=="go" || !nearResults.length) return;
  const pts=[];
  nearResults.forEach(p => {
    L.marker([p.lat,p.lon], {keyboard:false, icon:L.divIcon({className:"", iconSize:[28,28], iconAnchor:[14,14], html:`<div class="poi ${p.open===false?"shut":""}">${ico(p.ic)}</div>`})}).on("click", () => openPlace(p)).addTo(poiLayer);
    pts.push([p.lat,p.lon]);
  });
  if(fit){ if(here) pts.push([here.lat,here.lon]); fitTo(L.latLngBounds(pts)); }
}
$("nearList").addEventListener("click", e => { if(e.target.closest("[data-retry]")){ nearby(nearCat); return; } const b=e.target.closest("[data-n]"); if(b) openPlace(nearResults[+b.dataset.n]); });
$("nearOpen").onclick = () => { nearOpenOnly = !nearOpenOnly; renderNear(); };
$("nearClose").onclick = () => { nearResults=[]; nearCat=null; nearMeta=null; $("nearWrap").hidden=true; poiLayer.clearLayers(); renderCats(); };

// =====================================================================
// Public transport (Transitous / MOTIS)
// =====================================================================
let ptData=null, ptSel=0, ptCtl=null, ptState=null, ptVer=store.get("ttr-ptver", null);
const PT_VERS = ["v5","v4","v6","v3","v2","v1"];
function legKind(m){
  m = m || "";
  if(m==="WALK") return "walk"; if(/TRAM|FUNICULAR|CABLE|AERIAL/.test(m)) return "tram"; if(/RAIL|SUBURBAN|SUBWAY|METRO|LONG_DISTANCE/.test(m)) return "rail";
  if(m==="FERRY") return "ferry"; if(/BIKE|RENTAL/.test(m)) return "bike"; if(m==="CAR") return "car"; return "bus";
}
const KIND_COL = {bus:["#ffb547","#1a1205"], tram:["#33e3a1","#03130c"], rail:["#38e1ff","#03131a"], ferry:["#7aa8ff","#05101f"], bike:["#a48cff","#0c0720"], car:["#8798b3","#0b111c"]};
function legColor(l){
  const k=legKind(l.mode);
  if(l.routeColor && /^[0-9a-f]{6}$/i.test(l.routeColor)) return ["#"+l.routeColor, l.routeTextColor && /^[0-9a-f]{6}$/i.test(l.routeTextColor) ? "#"+l.routeTextColor : "#fff"];
  return KIND_COL[k] || KIND_COL.bus;
}
function legName(l){
  const k=legKind(l.mode); let n = l.routeShortName || l.displayName || l.tripShortName || "";
  if(k==="tram" && /luas/i.test(l.agencyName||"") && !/luas/i.test(n)) n = "Luas " + n;
  if(!n && k==="rail" && l.agencyName) n = /irish rail|iarnr/i.test(l.agencyName) ? t("mode_rail") : l.agencyName;
  return (n || t("mode_"+k)).trim();
}
function decodePoly(str, prec){
  const f=Math.pow(10, prec||6); let i=0, lat=0, lon=0; const out=[];
  while(i<str.length){
    let b, s=0, r=0; do{ b=str.charCodeAt(i++)-63; r+=(b&31)*Math.pow(2,s); s+=5; }while(b>=32); lat += (r%2) ? -(r+1)/2 : r/2;
    s=0; r=0;      do{ b=str.charCodeAt(i++)-63; r+=(b&31)*Math.pow(2,s); s+=5; }while(b>=32); lon += (r%2) ? -(r+1)/2 : r/2;
    out.push([lat/f, lon/f]);
  }
  return out;
}
function legPoints(l){ const g=l.legGeometry; if(g && g.points) return decodePoly(g.points, g.precision || (ptVer==="v1" ? 7 : 6)); return [[l.from.lat,l.from.lon],[l.to.lat,l.to.lon]]; }
async function transitPlan(from, to, signal){
  const when=$("ptWhen").value, tv=$("ptTime").value; let time=new Date(), arriveBy=false;
  if(when!=="now" && tv){ const [h,m]=tv.split(":").map(Number); time.setHours(h,m,0,0); if(time.getTime() < Date.now()-5*60000) time.setDate(time.getDate()+1); arriveBy = when==="arr"; }
  const qs = `fromPlace=${from.lat.toFixed(6)},${from.lon.toFixed(6)}&toPlace=${to.lat.toFixed(6)},${to.lon.toFixed(6)}&time=${encodeURIComponent(time.toISOString())}&arriveBy=${arriveBy}&detailedTransfers=true`;
  const order = ptVer ? [ptVer, ...PT_VERS.filter(v => v!==ptVer)] : PT_VERS;
  let lastErr = new Error("unavailable");
  for(const v of order){
    let res;
    try{ res = await fetch(`https://api.transitous.org/api/${v}/plan?${qs}`, {signal}); }
    catch(e){ if(e.name==="AbortError") throw e; throw new Error("unreachable"); }
    if(res.status===404 || res.status===400){ lastErr = new Error("http "+res.status); continue; }
    if(!res.ok) throw new Error("http "+res.status);
    const j = await res.json(); if(ptVer!==v){ ptVer=v; store.set("ttr-ptver", v); } return j;
  }
  throw lastErr;
}
function ptSearch(){
  const r = dest; if(!r) return;
  if(ptCtl) ptCtl.abort(); ptCtl = new AbortController(); const ctl=ptCtl;
  ptData=null; ptSel=0; ptState="busy"; renderPt();
  withHere(async h => {
    if(dest!==r || ctl!==ptCtl) return;
    if(!h){ ptState="noloc"; renderPt(); return; }
    try{
      const j = await transitPlan(h, r.dest, ctl.signal);
      if(dest!==r || ctl!==ptCtl) return;
      const its = (j.itineraries||[]).filter(it => it.legs && it.legs.length);
      const direct = (j.direct||[]).filter(it => it.legs && it.legs.length && it.duration < 45*60).slice(0,1);
      ptData = [...its.sort((a,b) => new Date(a.startTime)-new Date(b.startTime)).slice(0,6), ...direct];
      ptState = ptData.length ? "ok" : "none"; ptSel = 0; renderPt();
      if(ptData.length && tab==="go" && !S) drawPt(ptData[0], true);
    }catch(e){ if(e.name!=="AbortError"){ ptState="fail"; renderPt(); } }
  });
}
function ptChips(it){
  return it.legs.filter(l => legKind(l.mode)!=="walk" || l.duration >= 60).map(l => {
    const k=legKind(l.mode);
    if(k==="walk") return `<span class="lg walk">${ico("walk")}${Math.round(l.duration/60)}</span>`;
    const [bg,fg]=legColor(l); return `<span class="lg" style="background:${bg};color:${fg}">${ico(k)}${esc(legName(l))}</span>`;
  }).join("<i>›</i>");
}
function ptSteps(it){
  const rows = [];
  it.legs.forEach((l, i) => {
    const k=legKind(l.mode), last = i===it.legs.length-1;
    if(k==="walk"){
      if(l.duration < 60 && !last) return;
      const to = last ? destName(dest) : (l.to && l.to.name) || t("destination");
      rows.push(`<div class="st"><span class="dot walk"></span><div><b>${t("walkMin",{m:Math.max(1,Math.round(l.duration/60))})}</b><small>${esc(t("walkTo",{d:fmtDist(l.distance||0), s:to}))}</small></div></div>`);
      return;
    }
    const [bg]=legColor(l), n=(l.intermediateStops||[]).length+1;
    const extra = [l.headsign ? t("towards",{h:l.headsign}) : "", l.from.track ? t("platform",{p:l.from.track}) : ""].filter(Boolean).join(" · ");
    rows.push(`<div class="st"><span class="dot" style="background:${bg}"></span><div>
      <b>${hhmm(l.startTime)} · ${esc(legName(l))}${l.realTime?`<span class="live">${t("live")}</span>`:""}</b>
      <small>${esc(t("fromStop",{s:l.from.name||""}))}${extra?" · "+esc(extra):""}</small>
      <small>${esc(t("ride",{n, s:(l.to&&l.to.name)||"", t:hhmm(l.endTime)}))}</small></div></div>`);
  });
  rows.push(`<div class="st"><span class="dot" style="background:var(--cyan)"></span><div><b>${t("arriveAt",{t:hhmm(it.endTime)})}</b><small>${esc(destName(dest))}</small></div></div>`);
  return `<div class="steps">${rows.join("")}</div>`;
}
function renderPt(){
  const box=$("ptList");
  if(!dest || travelMode!=="pt"){ box.innerHTML=""; return; }
  const msg = {busy:"ptSearching", noloc:"ptNoLoc", fail:"ptFail"}[ptState];
  if(msg){ box.innerHTML = `<div class="empty">${t(msg)}</div>`; return; }
  if(ptState==="none" || !ptData){ box.innerHTML = `<div class="empty">${t("ptNone")}</div>`; return; }
  box.innerHTML = ptData.map((it, i) => {
    const walkOnly = it.legs.every(l => legKind(l.mode)==="walk"), leave = Math.round((new Date(it.startTime) - Date.now())/60000);
    const sub = walkOnly ? t("walkOnly",{m:Math.round(it.duration/60)}) : `${t("changes",{n:it.transfers||0})} · ${t("leaveIn",{m:leave})}`;
    return `<button class="pt ${i===ptSel?"sel":""}" type="button" data-pt="${i}">
      <span class="ptt"><b>${hhmm(it.startTime)} → ${hhmm(it.endTime)}</b><span>${fmtDur(it.duration)}</span></span>
      <span class="ptc">${ptChips(it)}</span><small>${esc(sub)}</small></button>${i===ptSel ? ptSteps(it) : ""}`;
  }).join("");
}
function drawPt(it, fit){
  clearRoute(); const all=[];
  it.legs.forEach(l => {
    const pts = legPoints(l), walk = legKind(l.mode)==="walk";
    if(pts.length<2) return;
    if(!walk) L.polyline(pts, {color:legColor(l)[0], weight:16, opacity:.18, lineJoin:"round"}).addTo(markLayer);
    L.polyline(pts, {color:"#03070d", weight:walk?7:10, opacity:.7, lineJoin:"round"}).addTo(markLayer);
    L.polyline(pts, {color: walk ? "#c9d6ea" : legColor(l)[0], weight:walk?4:5, dashArray: walk ? "1 8" : null, lineCap:"round", lineJoin:"round"}).addTo(markLayer);
    if(!walk) [l.from, l.to].forEach(s => L.circleMarker([s.lat,s.lon], {radius:6, color:"#03070d", weight:2, fillColor:"#eaf2ff", fillOpacity:1}).bindTooltip(esc(s.name||""), {direction:"top"}).addTo(markLayer));
    all.push(...pts);
  });
  destMarker(dest.dest);
  if(fit && all.length) fitTo(L.latLngBounds(all), 16);
}
$("ptList").addEventListener("click", e => { const b=e.target.closest("[data-pt]"); if(!b) return; ptSel=+b.dataset.pt; renderPt(); drawPt(ptData[ptSel], true); });
$("ptWhen").onchange = () => {
  const now = $("ptWhen").value==="now"; $("ptTime").hidden = now;
  if(!now && !$("ptTime").value){ const d=new Date(Date.now()+30*60000); $("ptTime").value = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
  if(dest) ptSearch();
};
$("ptTime").onchange = () => { if(dest) ptSearch(); };

// =====================================================================
// Explore tab
// =====================================================================
const REGIONS = ["all","dublin","south","west","north"], TYPES = ["all","walk","coast","view","heritage"];
let exRegion = store.get("ttr-exRegion","all"), exType = "all";
const exPlace = i => ({lat:EXPLORE[i].lat, lon:EXPLORE[i].lon, label:EXPLORE[i].n, ex:i});
const exploreFiltered = () => EXPLORE.filter(x => (exRegion==="all"||x.r===exRegion) && (exType==="all"||x.t===exType));
const thumbObs = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(en => {
  if(!en.isIntersecting) return; thumbObs.unobserve(en.target); loadThumb(en.target);
}), {root:$("panes"), rootMargin:"200px"}) : null;
function loadThumb(el){
  const i=+el.dataset.ph;
  photosFor(exPlace(i)).then(ph => { if(ph && ph.hero){ const img=new Image(); img.onload=() => { el.style.backgroundImage=`url("${ph.hero.thumb}")`; el.classList.add("has"); }; img.src=ph.hero.thumb; } });
}
function renderExplore(){
  $("regionChips").innerHTML = REGIONS.map(k => `<button class="chip ${exRegion===k?"on":""}" type="button" data-reg="${k}">${t("reg_"+k)}</button>`).join("");
  $("typeChips").innerHTML = TYPES.map(k => `<button class="chip ${exType===k?"on":""}" type="button" data-typ="${k}">${t("typ_"+k)}</button>`).join("");
  let list = exploreFiltered().map(x => ({x, d:distFromHere(x)}));
  if(here) list.sort((a,b) => a.d-b.d);
  $("exploreList").innerHTML = list.length ? list.map(({x,d}) => { const i=EXPLORE.indexOf(x); return `<button class="ex" type="button" data-ex="${i}">
      <span class="thumb t-${x.t}" data-ph="${i}">${ico(x.t==="heritage"?"star":x.t==="coast"?"ferry":x.t==="view"?"photo":"tree")}</span>
      <span class="exm"><span class="r1"><b>${esc(x.n)}</b>${d!=null?`<span class="far">${fmtDist(d)}</span>`:""}</span>
      <small><span class="tag ${x.t}">${t("tn_"+x.t)}</span>${esc(x.c)}${x.km?` · ${esc(trTrail(x.km))}`:""}</small>
      <p>${esc(lang==="pl" ? x.p : x.d)}</p></span></button>`; }).join("") : `<div class="empty">${t("exNone")}</div>`;
  $("exploreList").querySelectorAll("[data-ph]").forEach(el => thumbObs ? thumbObs.observe(el) : loadThumb(el));
}
function drawExploreMarkers(){
  poiLayer.clearLayers(); const pts=[];
  exploreFiltered().forEach(x => {
    const i = EXPLORE.indexOf(x);
    L.marker([x.lat,x.lon], {keyboard:false, icon:L.divIcon({className:"", iconSize:[28,28], iconAnchor:[14,14], html:`<div class="poi ex t-${x.t}">${ico(x.t==="heritage"?"star":x.t==="coast"?"ferry":x.t==="view"?"photo":"tree")}</div>`})})
      .bindTooltip(esc(x.n), {direction:"top", offset:[0,-12]}).on("click", () => openPlace(exPlace(i))).addTo(poiLayer);
    pts.push([x.lat,x.lon]);
  });
  if(pts.length) fitTo(L.latLngBounds(pts), 11);
}
$("regionChips").addEventListener("click", e => { const b=e.target.closest("[data-reg]"); if(b){ exRegion=b.dataset.reg; store.set("ttr-exRegion",exRegion); renderExplore(); drawExploreMarkers(); } });
$("typeChips").addEventListener("click", e => { const b=e.target.closest("[data-typ]"); if(b){ exType=b.dataset.typ; renderExplore(); drawExploreMarkers(); } });
$("exploreList").addEventListener("click", e => { const b=e.target.closest("[data-ex]"); if(b) openPlace(exPlace(+b.dataset.ex)); });

// =====================================================================
// Route intelligence: hazards, cameras and speed limits along a route
// =====================================================================
function parseLimit(v){ if(!v) return null; const m=String(v).match(/(\d+)\s*(mph)?/i); if(!m) return null; return {v:+m[1], u:m[2]?"mph":"km/h", kmh: m[2] ? +m[1]*1.609 : +m[1]}; }
const HZ_THR = {stop:7, give_way:7, signals:14, crossing:9, bump:9, camera:35, school:120};
function hzType(tg, isNode){
  if(tg.amenity==="school") return "school";
  if(!isNode) return null;
  if(tg.highway==="stop") return "stop";
  if(tg.highway==="give_way") return "give_way";
  if(tg.highway==="traffic_signals") return "signals";
  if(tg.highway==="speed_camera") return "camera";
  if(tg.highway==="crossing"){ if(/^(no|unmarked|informal)$/.test(tg.crossing||"")) return null; return tg.crossing==="traffic_signals" ? "signals" : "crossing"; }
  if(tg.traffic_calming && tg.traffic_calming!=="no") return "bump";
  return null;
}
function extractIntel(route, els){
  let hz=[];
  for(const e of els){
    const tg=e.tags||{}, type=hzType(tg, e.type==="node"); if(!type) continue;
    const lat = e.lat ?? (e.center&&e.center.lat), lon = e.lon ?? (e.center&&e.center.lon); if(lat==null) continue;
    for(const m of nearestAll(route, pxy(route.o,lat,lon), HZ_THR[type]))
      hz.push({type, along:Math.round(m.along), lat, lon, lim: type==="camera" ? (parseInt(tg.maxspeed)||null) : null});
  }
  // Stop / yield signs only count when they face us: approaching a junction, not leaving one we just turned out of.
  const steps = route.steps||[];
  hz = hz.filter(h => {
    if(h.type!=="stop" && h.type!=="give_way") return true;
    const ahead = steps.some(s => s.along >= h.along-5 && s.along <= h.along+45);
    const behind = steps.some(s => s.along < h.along-1 && s.along >= h.along-35);
    return ahead || !behind;
  });
  hz.sort((a,b) => a.along-b.along);
  const out=[];
  for(const h of hz){
    const gap = h.type==="school" ? 400 : h.type==="signals" ? 45 : 25;
    if(out.some(o => o.type===h.type && Math.abs(o.along-h.along) < gap)) continue;
    out.push(h);
  }
  const final = out.filter(h => !(h.type==="crossing" && out.some(o => o.type==="signals" && Math.abs(o.along-h.along) < 30)));
  return {hz:final, lim:speedProfile(route, els)};
}
function speedProfile(route, els){
  const G=60, grid=new Map();
  for(const w of els){
    if(w.type!=="way" || !w.geometry || !w.tags) continue;
    const lim=parseLimit(w.tags.maxspeed); if(!lim) continue;
    const g=w.geometry.map(p => pxy(route.o,p.lat,p.lon));
    for(let i=0;i<g.length-1;i++){
      const a=g[i], b=g[i+1], seg={a,b,lim};
      for(let x=Math.floor(Math.min(a.x,b.x)/G); x<=Math.floor(Math.max(a.x,b.x)/G); x++)
        for(let y=Math.floor(Math.min(a.y,b.y)/G); y<=Math.floor(Math.max(a.y,b.y)/G); y++){ const k=x+","+y; if(!grid.has(k)) grid.set(k,[]); grid.get(k).push(seg); }
    }
  }
  if(!grid.size) return null;
  const segs=[]; let cur=null;
  for(let s=0; s<=route.total; s+=20){
    const p=pointAt(route,s), q=pxy(route.o,p.lat,p.lon), h=p.heading%180; let best=null;
    const kx=Math.floor(q.x/G), ky=Math.floor(q.y/G);
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(const sg of grid.get((kx+dx)+","+(ky+dy))||[]){
      const d=segDist(q, sg.a, sg.b).d; if(d>12) continue;
      const br=(Math.atan2(sg.b.x-sg.a.x, sg.b.y-sg.a.y)/RAD+360)%180, diff=Math.min(Math.abs(br-h), 180-Math.abs(br-h));
      if(diff>35) continue;
      if(!best || d<best.d) best={d, lim:sg.lim};
    }
    if(!best){ if(cur) cur.to=s; continue; }
    if(cur && cur.v===best.lim.v && cur.u===best.lim.u) cur.to=s;
    else { cur={from:s, to:s, v:best.lim.v, u:best.lim.u, kmh:best.lim.kmh}; segs.push(cur); }
  }
  const clean=[];
  segs.forEach((sg,i) => {
    if(i>0 && i<segs.length-1 && sg.to-sg.from < 40) return;           // ignore flicker at junctions
    const last=clean[clean.length-1];
    if(last && last.v===sg.v && last.u===sg.u) last.to=sg.to; else clean.push({...sg});
  });
  return clean.length ? clean : null;
}
function limitAt(route, along){ return segAt(route.limits || route.lim, along); }
const INTEL_V = "ttr-intel-v2-";
async function loadIntel(route, cacheKey){
  if(cacheKey){ const c=store.get(INTEL_V+cacheKey, null); if(c){ route.hz=c.hz; route.lim=c.lim; route.intel="ok"; buildLimits(route); return; } }
  route.intel="busy";
  const lats=route.pts.map(p=>p.lat), lons=route.pts.map(p=>p.lon), pad=.0015;
  const bb=`${Math.min(...lats)-pad},${Math.min(...lons)-pad},${Math.max(...lats)+pad},${Math.max(...lons)+pad}`;
  const full = route.total < 25000;
  const q = full
    ? `[out:json][timeout:25];node["highway"~"^(stop|give_way|crossing|traffic_signals|speed_camera)$"](${bb});out;node["traffic_calming"](${bb});out;way["highway"]["maxspeed"](${bb});out tags geom;nwr["amenity"="school"](${bb});out center tags;`
    : `[out:json][timeout:25];node["highway"="speed_camera"](${bb});out;`;
  try{
    const j = await overpass(q);
    const data = extractIntel(route, j.elements||[]);
    route.hz=data.hz; route.lim=data.lim; route.intel="ok"; buildLimits(route);
    if(cacheKey) store.set(INTEL_V+cacheKey, data);
  }catch(e){ route.intel="fail"; }
}
function intelCounts(r){
  const c = {rb:(r.steps||[]).filter(s => s.icon==="rb").length};
  (r.hz||[]).forEach(h => c[h.type]=(c[h.type]||0)+1);
  const lp=r.limits||r.lim; if(lp && lp.length>1) c.lim=lp.length-1;
  if(r.mv && r.mv.length) c.mv=r.mv.length;
  return c;
}
function intelChips(r){
  const c=intelCounts(r), order=["mv","rb","stop","give_way","signals","crossing","school","bump","camera","lim"];
  const icon = {rb:"rb", lim:"speed", mv:"uturn"};
  return order.filter(k => c[k]).map(k => `<span class="ichip" style="--c:${HZ_COL[k]||"#38e1ff"}">${ico(icon[k]||k)}${esc(t("cnt_"+k,{n:c[k]}))}</span>`).join("");
}

// =====================================================================
// Routes written as street lists (from driving schools): built on the phone from OpenStreetMap
// =====================================================================
// Each pair of streets in a row meets at a junction; the route is drawn through those junctions in order.
const RCP_V = "ttr-rcp-v1-";
const GENERIC = new Set(["road","rd","avenue","ave","park","drive","way","the","st","saint","lawn","lawns","rise","view","court","crescent","grove","close","green","square","east","west","north","south","upper","lower","estate","extension","old","new","lane","place","street"]);
function normName(x){
  return String(x||"").toLowerCase().replace(/[’'.]/g,"").replace(/\bsaint\b/g,"st").replace(/aengus/g,"aongus").replace(/clancey/g,"clancy").replace(/cederwood/g,"cedarwood")
    .replace(/\broad\b/g,"rd").replace(/\bavenue\b/g,"ave").replace(/\s+/g," ").trim();
}
const nameEq = (a, b) => { a=normName(a); b=normName(b); return a===b || a.replace(/s$/,"")===b.replace(/s$/,""); };
const keyWord = n => { const w=normName(n).split(" ").filter(x => x.length>2 && !GENERIC.has(x)); return (w.sort((a,b) => b.length-a.length)[0]) || normName(n).split(" ").filter(x => x!=="the")[0]; };
const itName = it => typeof it==="string" ? it : (it.in || it.via || "");
const rcpNames = r => r.recipe.flatMap(it => itName(it) ? itName(it).split("|") : []);
const centreMaps = {}, STREETS_V = "ttr-streets-v1-";
// Street shapes for one centre, from OpenStreetMap. Saved on the phone after the first success.
async function centreStreets(cid){
  if(centreMaps[cid]) return centreMaps[cid];
  const C = CENTRES[cid], o = mkO((C.bbox[0]+C.bbox[2])/2, (C.bbox[1]+C.bbox[3])/2);
  const names = new Set(); ROUTES.filter(r => r.centre===cid && r.recipe).forEach(r => rcpNames(r).forEach(n => names.add(n)));
  if(C.startStreet) names.add(C.startStreet);
  const revive = d => ({o, ways: d.ways.map(w => ({name:w.n, pts:w.p.map(([la,lo]) => ({lat:la, lon:lo, ...pxy(o,la,lo)}))})), startPt: d.sp ? {lat:d.sp[0], lon:d.sp[1], ...pxy(o,d.sp[0],d.sp[1])} : null});
  const cached = store.get(STREETS_V+cid, null);
  if(cached && cached.names===[...names].sort().join("|")) return centreMaps[cid] = revive(cached);
  const words = [...new Set([...names].map(keyWord).filter(Boolean))].map(w => w.replace(/[^a-z0-9 ]/g,""));
  const bb = C.bbox.join(","), place = C.startName ? `nwr["name"~"${C.startName}",i](${bb});` : "";
  try{
    const j = await overpass(`[out:json][timeout:40];(way["highway"]["name"~"(${words.join("|")})",i](${bb});${place});out geom;`, null, 45000);
    const keep=[]; let sp=null;
    for(const e of j.elements||[]){
      const g = e.geometry || []; if(!g.length || !e.tags) continue;
      if(e.tags.highway){ if([...names].some(n => nameEq(e.tags.name, n))) keep.push({n:e.tags.name, p:g.map(q => [+q.lat.toFixed(6), +q.lon.toFixed(6)])}); }
      else if(C.startName && new RegExp(C.startName,"i").test(e.tags.name||"")) sp = [g.reduce((a,q)=>a+q.lat,0)/g.length, g.reduce((a,q)=>a+q.lon,0)/g.length];
    }
    const d = {names:[...names].sort().join("|"), ways:keep, sp};
    try{ store.set(STREETS_V+cid, d); }catch(e){}
    return centreMaps[cid] = revive(d);
  }catch(e){
    return centreMaps[cid] = {o, ways:[], startPt:null, failed:true};   // the route can still be built from TomTom below
  }
}
// TomTom fallback: junctions ("A & B") and streets, found near where we are. Answers are kept on the phone.
const ttGeoCache = store.get("ttr-ttgeo-v1", {});
async function ttFind(q, idx, near, C){
  const key = idx+"|"+q;
  let res = ttGeoCache[key];
  if(!res){
    if(!ttKey()) return [];
    const c = near || {lat:(C.bbox[0]+C.bbox[2])/2, lon:(C.bbox[1]+C.bbox[3])/2};
    try{
      const r = await fetchT(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(ttKey())}&countrySet=IE&lat=${c.lat.toFixed(5)}&lon=${c.lon.toFixed(5)}&radius=6000&limit=8&idxSet=${idx}&language=en-GB`, {}, 9000);
      if(!r.ok) return [];
      res = ((await r.json()).results||[]).map(x => ({lat:x.position.lat, lon:x.position.lon, type:x.type, street:(x.address||{}).streetName||""}));
      ttGeoCache[key] = res; try{ store.set("ttr-ttgeo-v1", ttGeoCache); }catch(e){}
    }catch(e){ return []; }
  }
  const [s,w,n,e] = C.bbox;
  return res.filter(x => x.lat > s-.01 && x.lat < n+.01 && x.lon > w-.015 && x.lon < e+.015);
}
const closest = (list, near) => !list.length ? null : !near ? list[0] : list.reduce((a,b) => hav(a.lat,a.lon,near.lat,near.lon) <= hav(b.lat,b.lon,near.lat,near.lon) ? a : b);
async function ttCross(A, B, near, C){
  for(const a of A.split("|")) for(const b of B.split("|")){
    const l = (await ttFind(`${a} & ${b}`, "Xstr", near, C)).filter(x => /cross/i.test(x.type||"") || (normName(x.street).includes(keyWord(a)) && normName(x.street).includes(keyWord(b))));
    if(l.length) return closest(l, near);
  }
  return null;
}
async function ttStreet(name, near, C){
  for(const n of name.split("|")){
    const l = (await ttFind(n, "Str", near, C)).filter(x => nameEq(x.street, n));
    if(l.length) return closest(l, near);
  }
  return null;
}
function streetPolys(M, want){
  for(const alt of String(want).split("|")){ const ps = M.ways.filter(w => nameEq(w.name, alt)).map(w => w.pts); if(ps.length) return ps; }
  return null;
}
const pd = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
function nearestOnPolys(polys, p){ let best=null; for(const ps of polys) for(let i=0;i<ps.length-1;i++){ const r=segDist(p, ps[i], ps[i+1]), q={x:ps[i].x+(ps[i+1].x-ps[i].x)*r.tt, y:ps[i].y+(ps[i+1].y-ps[i].y)*r.tt}; if(!best || r.d<best.d) best={d:r.d, x:q.x, y:q.y}; } return best; }
// Where street A meets street B; if they meet more than once, the meeting closest to where we are.
function junctionOf(A, B, near){
  const cand=[];
  const test = (P, Q) => { for(const ps of P) for(const v of ps){ const n=nearestOnPolys(Q, v); if(n && n.d < 18) cand.push(v); } };
  test(A, B); test(B, A);
  if(cand.length) return cand.reduce((a,b) => !near || pd(a,near) <= pd(b,near) ? a : b);
  return null;
}
// A point about `want` metres into street B from point J (for turning into a road and coming back out)
function pointInto(B, J, want=45){
  let best=null, bs=Infinity;
  for(const ps of B) for(const v of ps){ const d=pd(v,J); if(d<20 || d>160) continue; const sc=Math.abs(d-want); if(sc<bs){ bs=sc; best=v; } }
  return best;
}
function pointAlong(P, last, prev, want=70){
  let best=null, bs=Infinity;
  for(const ps of P) for(const v of ps){ const d=pd(v,last); if(d<35 || d>160) continue; if(prev && pd(v,prev) < pd(last,prev)) continue; const sc=Math.abs(d-want); if(sc<bs){ bs=sc; best=v; } }
  return best;
}
const ll = (o, v) => ({lat: v.lat ?? (o.lat0 + v.y/o.ky), lon: v.lon ?? (o.lon0 + v.x/o.kx), x:v.x, y:v.y});
async function compileRecipe(route){
  const cached = store.get(RCP_V+route.id, null);
  if(cached){ route.stops=cached.stops; route.rcp=cached.rcp; return; }
  const C = CENTRES[route.centre], M = await centreStreets(route.centre), o = M.o;
  const xy = p => p && ({...p, ...pxy(o, p.lat, p.lon)});
  let start = C.start ? xy({lat:C.start[0], lon:C.start[1]}) : M.startPt;
  if(!start && C.startStreet){ const P=streetPolys(M, C.startStreet); if(P){ const ps=P[0]; start = ps[Math.floor(ps.length/2)]; } else start = xy(await ttStreet(C.startStreet, null, C)); }
  if(!start && C.startName) start = xy(closest(await ttFind(C.addr, "POI,PAD,Addr", null, C), null));
  const wps=[], mv=[], hills=[], missing=[]; let viaTT = 0;
  const push = (v, label) => { const p=ll(o,v); const last=wps[wps.length-1]; if(last && Math.hypot(last.x-p.x, last.y-p.y) < 12) return wps.length-1; wps.push({...p, label}); return wps.length-1; };
  if(start) push(start, C.name);
  let cur=null, curName="";
  for(const it of route.recipe){
    const last = wps[wps.length-1], prev = wps[wps.length-2];
    if(it.hill && !it.via){ hills.push(wps.length-1); continue; }
    if(it.mv && !it.in && !it.via){ if(cur && last){ const v=pointAlong(cur, last, prev); if(v) mv.push({i:push(v, curName), type:it.mv}); } else if(last) mv.push({i:wps.length-1, type:it.mv}); continue; }
    const name = itName(it), short = name.split("|")[0], P = streetPolys(M, name);
    // ----- found on OpenStreetMap -----
    if(P){
      if(it.via){                                       // pass along this street (needn't meet the last one)
        const v = last ? nearestOnPolys(P, last) : P[0][0], i = v && push(v, short);
        if(i!=null){ if(it.mv) mv.push({i, type:it.mv}); if(it.hill) hills.push({k:i, at:1}); }
        cur=P; curName=short; continue;
      }
      if(!last){ push(P[0][0], short); cur=P; curName=short; continue; }
      if(!cur && !curName){ cur=P; curName=short; continue; }
      const J = cur ? junctionOf(cur, P, last) : null;
      if(it.in){
        const base = J || nearestOnPolys(P, last), v = base && pointInto(P, base) || base;
        if(v) mv.push({i:push(v, short), type:it.mv});
        continue;                                       // back out onto the same street
      }
      if(J) push(J, name);
      else { const tj = curName && await ttCross(curName, name, last, C); if(tj){ push(xy(tj), name); viaTT++; } else { const n = nearestOnPolys(P, last); if(n) push(n, name); } }
      cur=P; curName=short; continue;
    }
    // ----- not on OpenStreetMap (or it's down): TomTom -----
    const near = last || null;
    let pt = null;
    if(!it.in && !it.via && curName) pt = await ttCross(curName, name, near, C);
    if(!pt) pt = await ttStreet(name, near, C);
    if(!pt){ missing.push(short); continue; }
    viaTT++;
    const i = push(xy(pt), short);
    if(it.mv) mv.push({i, type:it.mv});
    if(it.hill) hills.push({k:i, at:1});
    if(!it.in){ cur=null; curName=short; }
  }
  if(start) push(start, C.name);
  if(wps.length < 3) throw new Error("recipe: too few points ("+missing.length+" streets not found"+(M.failed ? ", map data unavailable" : "")+")");
  route.stops = wps.map(w => [+w.lat.toFixed(7), +w.lon.toFixed(7), w.label]);
  route.rcp = {mv, hills, missing, tt:viaTT, osm:!M.failed};
  // Only keep it if most of it came out right; otherwise try again next time.
  if(missing.length <= 2) store.set(RCP_V+route.id, {stops:route.stops, rcp:route.rcp});
}

// =====================================================================
// Manoeuvres (turnabout, reverse around a corner) on the practice routes
// =====================================================================
// Found where the route turns back on itself at a stop. Your changes are kept per route on this phone.
const MV_V = "ttr-mv-v1";
let mvEdits = store.get(MV_V, {});
const turnAngle = (a,b) => Math.abs(((a-b)%360+540)%360-180);
function detectManoeuvres(route){
  const legs = (route.raw && route.raw.route && route.raw.route.legs) || [], out=[];
  for(let i=0;i<legs.length-1;i++){
    const a=legs[i].steps||[], b=legs[i+1].steps||[], arr=a[a.length-1], dep=b[0];
    if(!arr || !dep || !arr.maneuver || !dep.maneuver) continue;
    const bb=arr.maneuver.bearing_before, ba=dep.maneuver.bearing_after;
    if(bb==null || ba==null || turnAngle(bb, ba) < 150 || route.stopAlong[i+1]==null) continue;
    out.push({key:"w"+(i+1), along:route.stopAlong[i+1]});
  }
  route.steps.forEach(st => { if(st.mod==="uturn" && !st.mv && !out.some(o => Math.abs(o.along-st.along) < 80)) out.push({key:"u"+(Math.round(st.along/100)), along:st.along}); });
  // Just round a corner -> reversing around it; mid-street -> turnabout.
  out.forEach(m => {
    const prev = route.steps.filter(st => !st.mv && st.along < m.along-2 && st.along > 5 && /left|right/.test(st.mod||"") && st.icon==="arrow").pop();
    m.guess = prev && m.along - prev.along < 70 ? "rev" : "turn";
  });
  return out;
}
function applyManoeuvres(route){
  const e = mvEdits[route.id] || {}, list=[];
  const found = route.rcp ? [
      ...route.rcp.mv.map((m,n) => ({key:"f"+n, along:route.stopAlong[m.i], guess:m.type})),
      ...route.rcp.hills.map((h,n) => { const k = typeof h==="object" ? h.k : h, at = typeof h==="object" && h.at;
        return {key:"h"+n, along: !at && k+1 < route.stopAlong.length ? (route.stopAlong[k]+route.stopAlong[k+1])/2 : route.stopAlong[k], guess:"hill"}; })
    ].filter(m => m.along!=null) : detectManoeuvres(route);
  for(const m of found){
    const type = (e.auto||{})[m.key] || m.guess;
    if(type!=="none") list.push({key:m.key, along:m.along, type, auto:true});
  }
  (e.add||[]).forEach((a,i) => {
    const r=nearest(route, pxy(route.o, a.lat, a.lon), 0, route.pts.length);
    if(r.d < 60) list.push({key:"a"+i, along:r.along, type:a.type, auto:false});
  });
  list.sort((x,y) => x.along-y.along);
  list.forEach(m => { const p=pointAt(route, m.along); m.lat=p.lat; m.lon=p.lon; });
  route.mv = list;
  route.steps = route.steps.filter(st => !st.mv && !(st.mod==="uturn" && list.some(m => Math.abs(m.along-st.along) < 80)));
  list.forEach(m => route.steps.push({text:t("mv_"+m.type), icon:"mv", mvType:m.type, mv:true, along:m.along, mtype:"mv", mod:"uturn"}));
  route.steps.sort((x,y) => x.along-y.along);
}
function mvMarker(route, m){
  const mk = L.marker([m.lat, m.lon], {keyboard:false, zIndexOffset:300, icon:L.divIcon({className:"", iconSize:[30,30], iconAnchor:[15,15],
    html:`<div class="mvm ${m.type}">${ico(MV_IC[m.type])}</div>`})}).bindTooltip(esc(t("mv_"+m.type)), {direction:"top", offset:[0,-14]});
  mk.on("click", () => { if(!S) L.popup(mvPopOpts([0,-8])).setLatLng([m.lat,m.lon]).setContent(mvMenu(route, m)).openOn(map); });
  return mk;
}
const MV_IC = {turn:"uturn", rev:"reverse", hill:"climb"};
const mvPopOpts = off => ({className:"mvpop", offset:off, autoPanPaddingTopLeft:[16,60], autoPanPaddingBottomRight:[80, sheetH()+16]});
function mvMenu(route, m){
  const btn = (type, label, ic) => `<button type="button" class="mvb ${m && m.type===type ? "on" : ""}" data-mvr="${route.id}" data-mvk="${m ? m.key : ""}" data-mvt="${type}">${ic ? ico(ic) : ""}${esc(label)}</button>`;
  return `<div class="mvmenu"><b>${esc(m ? t("mv_title") : t("mv_add"))}</b>${btn("turn", t("mv_turn"), "uturn")}${btn("rev", t("mv_rev"), "reverse")}${btn("hill", t("mv_hill"), "climb")}${m ? btn("none", m.auto ? t("mv_none") : t("mv_remove")) : ""}</div>`;
}
function mvAddPopup(route, ll){
  const r=nearest(route, pxy(route.o, ll.lat, ll.lng), 0, route.pts.length);
  if(r.d > 40) return false;
  const p=pointAt(route, r.along);
  mvAddPopup.at = {lat:p.lat, lon:p.lon};
  L.popup(mvPopOpts([0,-4])).setLatLng([p.lat,p.lon]).setContent(mvMenu(route, null)).openOn(map);
  return true;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-mvt]"); if(!b) return;
  const route = ROUTES.find(r => r.id===+b.dataset.mvr); if(!route || !route.raw) return;
  const key=b.dataset.mvk, type=b.dataset.mvt, ed = mvEdits[route.id] = mvEdits[route.id] || {};
  if(!key){ if(mvAddPopup.at) (ed.add = ed.add || []).push({...mvAddPopup.at, type}); }
  else if(key[0]==="a"){ const i=+key.slice(1); if(type==="none") ed.add.splice(i,1); else ed.add[i].type=type; }
  else (ed.auto = ed.auto || {})[key] = type;
  store.set(MV_V, mvEdits); map.closePopup();
  applyOsrm(route, route.raw);
  if(route===practice && tab==="test" && !S) drawRoute(route, false);
  renderIntel(); toast(t("mv_saved"));
});

// =====================================================================
// Test tab: routes, route sheet, drive scores, checklist
// =====================================================================
let practice = null, sheetOpen = false;
const log = store.get("ttr-log", {});
let reports = store.get("ttr-reports", []);
const CACHE_V = "ttr-osrm-v2-";
async function loadRoute(route){
  if(route.recipe && !(route.stops && route.stops.length)){ route.building=true; renderRoutes(); try{ await compileRecipe(route); } finally { route.building=false; } }
  let data = store.get(CACHE_V+route.id, null);
  if(!data){ data = await osrmFetch(route.stops.map(s => `${s[1]},${s[0]}`).join(";"), null, "car", "&continue_straight=false"); store.set(CACHE_V+route.id, data); }
  applyOsrm(route, data);
}
function fallbackRoute(route){
  buildGeom(route, route.stops.map(s => [s[1], s[0]]));
  route.steps = route.stops.slice(1).map((s,i,arr) => ({text: i===arr.length-1 ? t("finish") : t("headTo",{n:i+1, s:stopLabel(s[2])}), icon: i===arr.length-1?"flag":"arrow", deg:0, along: route.cum[i+1]}));
  route.stopAlong = route.stops.map((s,i) => route.cum[i]);
  route.ok = false;
}
const bestScore = id => { const s=reports.filter(r => r.rid===id).map(r => r.score); return s.length ? Math.max(...s) : null; };
let centre = store.get("ttr-centre", "tallaght"); if(!CENTRES[centre]) centre="tallaght";
function renderCentres(){
  $("centreSeg").innerHTML = Object.entries(CENTRES).map(([k,c]) => `<button type="button" data-centre="${k}" aria-pressed="${k===centre}">${esc(c.name)} · ${ROUTES.filter(r => r.centre===k).length}</button>`).join("");
  const C = CENTRES[centre];
  $("testKicker").textContent = t("centreKicker", {c:C.name, a:C.addr}); $("practiceTitle").textContent = t("routesAt", {c:C.name});
}
function routeMeta(r){
  if(r.building) return t("rcBuilding");
  if(r.recipe && r.buildFail && !r.pts) return t("rcFail") + (r.buildErr ? " ("+r.buildErr+")" : "");
  const km = r.total ? num(r.total/1000,1)+" km" : "…";
  const first = r.recipe ? `${r.mv ? t("cnt_mv",{n:r.mv.length}) : t("stepsN",{n:r.recipe.length})}` : t("stopsN",{n:r.stops.length-2});
  return `${first} · ${km}${r.ok===false?" · "+t("straight"):""} · ${t("drivenN",{n:(log[r.id]||[]).length})}`;
}
function renderRoutes(){
  renderCentres();
  $("routeList").innerHTML = ROUTES.filter(r => r.centre===centre).map(r => {
    const best = bestScore(r.id);
    return `<button class="item route ${practice===r?"sel":""}" type="button" data-id="${r.id}" style="--c:${r.color}">
      <span class="badge">${r.id}</span>
      <span class="meta"><b>${esc(routeName(r))}</b><small>${esc(routeMeta(r))}</small></span>
      ${best!=null?`<span class="score s-${grade(best)}">${best}</span>`:""}</button>`;
  }).join("");
  $("driveBtn").disabled = $("rehearseBtn").disabled = !(practice && practice.pts);
  renderIntel();
}
function renderIntel(){
  const r=practice, box=$("intel");
  if(!r || !r.pts){ box.innerHTML=""; $("routeSheet").innerHTML=""; return; }
  box.innerHTML = (r.intel==="busy" ? `<span class="empty">${t("intelLoading")}</span>` : r.intel==="fail" ? `<span class="empty">${t("intelNone")}</span>` : intelChips(r)) + dataStatus(r);
  $("sheetToggle").innerHTML = `${ico("route")}${sheetOpen ? t("hideSheet") : t("showSheet")}`;
  $("routeSheet").hidden = !sheetOpen;
  if(sheetOpen) renderSheet(r);
}
// Which data loaded for this route, so problems are visible instead of silent.
function dataStatus(r){
  const st = (ok, busy) => busy ? "…" : ok ? "✓" : "✗";
  const tt = st(r.ttlState==="ok", r.ttlState==="busy" || r.ttlState==null && !!ttKey());
  const osm = st(r.intel==="ok" && r.lim && r.lim.length, r.intel==="busy" || r.intel==null);
  const n = (r.limits||[]).length, bad = r.ttlState!=="ok" && !(r.lim && r.lim.length) && r.intel!=="busy" && r.ttlState!=="busy";
  return `<div class="dstat ${bad?"bad":""}"><span>${esc(t("dsLimits"))}: TomTom ${tt} · OpenStreetMap ${osm}${n ? " · "+esc(t("dsChanges",{n})) : ""}</span>`
    + (bad || r.intel==="fail" ? `<button type="button" class="link" id="dsRetry">${esc(t("retry"))}</button>` : "") + `</div>`;
}
document.addEventListener("click", async e => {
  if(!e.target.closest("#dsRetry") || !practice) return;
  const r = practice; store.set(INTEL_V+r.id+"-"+Math.round(r.total), null); store.set(TTL_V+r.id+"-"+Math.round(r.total), null);
  r.intel="busy"; r.ttlState="busy"; renderIntel();
  await loadIntel(r, r.id+"-"+Math.round(r.total)); renderIntel();
  await loadRouteLimits(r, r.id+"-"+Math.round(r.total)); renderIntel(); if(tab==="test" && !S) drawRoute(r, false);
});
function renderSheet(r){
  const rows = (r.steps||[]).map(s => ({along:s.along, html:`<span class="rsi ${s.icon}">${s.icon==="rb" ? `<b>${s.exit||""}</b>` : s.icon==="flag" ? ico("flag") : s.icon==="mv" ? ico(MV_IC[s.mvType] || "uturn") : `<span style="display:inline-flex;transform:rotate(${s.deg||0}deg)">${ico("arrow")}</span>`}</span><div><b>${esc(s.text)}</b><small>${t("atKm",{d:fmtDist(s.along)})}</small></div>`}));
  (r.hz||[]).forEach(h => rows.push({along:h.along, html:`<span class="rsi hz" style="--c:${HZ_COL[h.type]}">${ico(h.type)}</span><div><b class="dim">${esc(t("hz_"+h.type))}</b><small>${t("atKm",{d:fmtDist(h.along)})}</small></div>`}));
  (r.limits||r.lim||[]).forEach((sg,i) => { if(i>0) rows.push({along:sg.from, html:`<span class="rsi lim"><b>${sg.v}</b></span><div><b class="dim">${esc(t("limitTo",{n:sg.v}))}</b><small>${t("atKm",{d:fmtDist(sg.from)})}</small></div>`}); });
  rows.sort((a,b) => a.along-b.along);
  let desc = "";
  if(r.recipe){
    const items = r.recipe.map(it => typeof it==="string" ? t("rcOnto",{s:it.split("|")[0]})
      : it.in ? `<b>${esc(t("rcIn_"+(it.mv||"turn"),{s:it.in.split("|")[0]}))}</b>`
      : it.via ? (it.mv || it.hill ? `<b>${esc(t(it.hill ? "rcHillOn" : "rcAt_"+it.mv, {s:it.via.split("|")[0]}))}</b>` : t("rcVia",{s:it.via.split("|")[0]}))
      : it.hill ? `<b>${esc(t("rcHill"))}</b>` : `<b>${esc(t("rcTurnHere"))}</b>`);
    desc = `<ol class="rdesc">${items.map(x => `<li>${x.startsWith("<b>") ? x : esc(x)}</li>`).join("")}</ol>`
      + (r.rcp && r.rcp.missing.length ? `<p class="note warnnote">${esc(t("rcMissing",{s:r.rcp.missing.join(", ")}))}</p>` : "")
      + `<p class="note">${esc(t("rcSrc",{s:r.src}))} <a href="${esc(r.srcUrl)}" target="_blank" rel="noopener">${esc(hostOf(r.srcUrl))}</a></p>`;
  }
  $("routeSheet").innerHTML = desc + `<p class="note mvtip">${esc(t("mv_tip"))}</p>` + rows.map(x => `<div class="rs">${x.html}</div>`).join("");
}
$("sheetToggle").onclick = () => { sheetOpen=!sheetOpen; renderIntel(); };
$("routeList").addEventListener("click", e => {
  const b = e.target.closest("[data-id]"); if(!b) return;
  practice = ROUTES.find(r => r.id===+b.dataset.id); store.set("ttr-last", practice.id);
  renderRoutes(); if(practice.pts) drawRoute(practice);
  if(practice.buildFail){ if(centreMaps[practice.centre] && centreMaps[practice.centre].failed) delete centreMaps[practice.centre]; centreLoaded[practice.centre]=null; loadCentre(practice.centre); }
  else routeData(practice);
});
$("driveBtn").onclick = () => startSession(practice, "gps");
$("rehearseBtn").onclick = () => startSession(practice, "sim");
const grade = s => s>=90 ? "a" : s>=75 ? "b" : s>=60 ? "c" : "d";
function renderReports(){
  $("reportList").innerHTML = reports.length ? reports.slice(0,8).map((r,i) => `<button class="item" type="button" data-rep="${i}">
      <span class="score s-${grade(r.score)}">${r.score}</span>
      <span class="meta"><b>${esc(r.rid ? `${r.rid} · ${routeName(ROUTES.find(x => x.id===r.rid)||{name:r.name})}` : r.name)}</b><small>${dayFmt(r.date)} · ${r.mins} min · ${num(r.km,1)} km</small></span></button>`).join("")
    : `<div class="empty">${t("noReports")}</div>`;
}
$("reportList").addEventListener("click", e => { const b=e.target.closest("[data-rep]"); if(b) showReport(reports[+b.dataset.rep]); });
let prep = store.get("ttr-prep", {});
function renderPrep(){
  let total=0, done=0;
  $("prepList").innerHTML = PREP.map(g => `<div class="pgroup"><div class="ph">${t("prep_"+g.g)}</div>${g.items.map(it => {
    total++; let on = !!prep[it.k];
    if(it.k==="routes"){ const driven = ROUTES.filter(r => (log[r.id]||[]).length>=2).length; on = driven===ROUTES.length; it._extra = ` (${ROUTES.filter(r => (log[r.id]||[]).length).length}/${ROUTES.length})`; }
    if(on) done++;
    const [title, detail] = it[lang] || it.en;
    return `<button class="chk ${on?"on":""}" type="button" data-k="${it.k}"><span class="box">${ico("check")}</span><span class="meta"><b>${esc(title)}${it._extra||""}</b><small>${esc(detail)}</small></span></button>`;
  }).join("")}</div>`).join("");
  $("prepCount").textContent = `${done}/${total}`; $("prepBar").style.width = Math.round(100*done/total)+"%";
}
try{ $("prepBox").open = store.get("ttr-prepOpen", false); }catch(e){}
$("prepBox").addEventListener("toggle", () => store.set("ttr-prepOpen", $("prepBox").open));
$("prepList").addEventListener("click", e => { const b=e.target.closest("[data-k]"); if(!b || b.dataset.k==="routes") return; prep[b.dataset.k]=!prep[b.dataset.k]; store.set("ttr-prep", prep); renderPrep(); });

// =====================================================================
// More tab
// =====================================================================
$("mapStyle").addEventListener("click", e => { const b=e.target.closest("[data-style]"); if(b){ settings.mapStyle=b.dataset.style; saveSettings(); applyMapStyle(); applyTraffic(); } });
function renderKey(msg, cls){
  const own=ownTtKey();
  $("ttStatus").className = "kstat " + (cls || "ok");
  $("ttStatus").textContent = msg || (own ? t("tt_have",{k:own.slice(-4)}) : t("tt_builtin"));
  $("ttRemove").hidden = !own;
}
$("ttSave").onclick = async () => {
  const k=$("ttKey").value.trim(); if(!k) return;
  renderKey(t("tt_checking"), "");
  try{
    await ttRoute({lat:53.2963, lon:-6.3621}, {lat:53.3498, lon:-6.2603}, k);   // one test route: Tallaght to the city centre
    settings.ttKey=k; settings.traffic=true; saveSettings(); $("ttKey").value="";
    applyMapStyle(); applyTraffic(); renderSwitches(); renderKey(t("tt_ok"), "ok"); toast(t("tt_ok"));
    if(dest && travelMode==="car") previewRoute();
  }catch(e){ renderKey(t("tt_bad"), "bad"); }
};
$("ttRemove").onclick = () => { settings.ttKey=""; saveSettings(); applyMapStyle(); applyTraffic(); renderKey(); };
function renderSwitches(){ document.querySelectorAll("[data-set]").forEach(b => b.setAttribute("aria-checked", String(!!settings[b.dataset.set]))); }
document.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
  settings[b.dataset.set] = !settings[b.dataset.set]; saveSettings(); renderSwitches();
  if(b.dataset.set==="camLayer") applyCamLayer();
  if(b.dataset.set==="traffic") applyTraffic();
  if(b.dataset.set==="placesLayer") placesRefresh();
  if(b.dataset.set==="cycleLayer") applyCycle();
});
function renderSaved(){
  const rows = [];
  ["home","work"].forEach(k => { if(places[k]) rows.push(`<div class="item"><span class="ico">${ico(k)}</span><span class="meta"><b>${t(k)}</b><small>${esc(places[k].label)}</small></span><button class="rm" type="button" data-rmp="${k}">${t("remove")}</button></div>`); });
  favs.forEach((f,i) => rows.push(`<div class="item"><span class="ico">${ico("star")}</span><span class="meta"><b>${esc(f.label)}</b><small>${esc(view(f).sub||"")}</small></span><button class="rm" type="button" data-rmf="${i}">${t("remove")}</button></div>`));
  $("savedList").innerHTML = rows.join("") || `<div class="empty">${t("savedNone")}</div>`;
}
$("savedList").addEventListener("click", e => {
  const p=e.target.closest("[data-rmp]"), f=e.target.closest("[data-rmf]");
  if(p){ delete places[p.dataset.rmp]; store.set("ttr-places", places); } else if(f){ favs.splice(+f.dataset.rmf,1); store.set("ttr-favs", favs); } else return;
  renderPlaces();
});
$("bikeSpeed").addEventListener("click", e => { const b=e.target.closest("[data-speed]"); if(!b) return; settings.bikeSpeed=+b.dataset.speed; saveSettings(); renderBikeSpeed();
  if(dest && travelMode==="bike" && dest.pts){ dest.duration = dest.total/bikeMs(); setEta("etaDrive", {s:dest.duration, m:dest.total, bike:true}); } });
function renderBikeSpeed(){ document.querySelectorAll("#bikeSpeed [data-speed]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.speed===settings.bikeSpeed))); }
function setLang(l){ if(l===lang || !TX[l]) return; lang=settings.lang=l; saveSettings(); applyLang(); }
$("langSeg").addEventListener("click", e => { const b=e.target.closest("[data-lang]"); if(b) setLang(b.dataset.lang); });

// ---------- Voice and sound ----------
// Sound: "all" (directions + alerts), "alerts" (cameras, limits, hazards only) or "off".
let sound = store.get("ttr-sound", store.get("ttr-voice", true) ? "all" : "off");
let voice=null, voiceAll=[], voicePoll=null;
const vLang = v => String(v.lang||"").replace("_","-").toLowerCase();
function voiceScore(v){
  let s=0; const n=v.name, vl=vLang(v);
  if(/natural|neural|premium|enhanced|wavenet|online/i.test(n)) s+=10;
  if(/google/i.test(n)) s+=4;
  if(!v.localService) s+=2;
  if(/^en-ie/.test(vl)) s+=4; else if(/^en-gb/.test(vl)) s+=3; else if(/^en-(au|nz)/.test(vl)) s+=1;
  if(/^pl/.test(vl)) s+=3;
  if(/compact|espeak|robot|novelty|whisper|zarvox|bells|trinoids|bad news|good news|bubbles|cellos|jester|organ|superstar|bahh|boing|albert|fred|junior|ralph|kathy/i.test(n)) s-=20;
  return s;
}
const voiceName = v => `${v.name.replace(/^(Microsoft|Google|Apple)\s+/,"").replace(/\s*\(.*?\)\s*/g," ").trim()} · ${v.lang}`;
// Every voice on the phone is listed (grouped by language), not just the app's language.
function pickVoice(){
  if(!("speechSynthesis" in window)) return;
  voiceAll = speechSynthesis.getVoices() || [];
  const mine = voiceAll.filter(v => vLang(v).startsWith(lang)).sort((a,b) => voiceScore(b)-voiceScore(a));
  const other = lang==="pl" ? "en" : "pl", second = voiceAll.filter(v => vLang(v).startsWith(other)).sort((a,b) => voiceScore(b)-voiceScore(a));
  const rest = voiceAll.filter(v => !mine.includes(v) && !second.includes(v)).sort((a,b) => vLang(a).localeCompare(vLang(b)) || voiceScore(b)-voiceScore(a));
  const saved = store.get("ttr-voiceURI-"+lang, lang==="en" ? store.get("ttr-voiceURI", null) : null);
  voice = (saved && saved!=="auto" && voiceAll.find(v => v.voiceURI===saved && vLang(v).startsWith(lang))) || mine[0] || null;
  const opt = v => `<option value="${esc(v.voiceURI)}">${esc(voiceName(v))}</option>`;
  const grp = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(opt).join("")}</optgroup>` : "";
  $("voiceSel").innerHTML = `<option value="auto">${esc(t("voiceAuto"))}${mine[0] ? " · "+esc(voiceName(mine[0])) : ""}</option>`
    + grp(t("lang_"+lang), mine) + grp(t("lang_"+other), second) + grp(t("otherLangs"), rest);
  $("voiceSel").value = saved && saved!=="auto" && voice && voice.voiceURI===saved ? saved : "auto";
  $("voiceHint").hidden = !!mine.length || !voiceAll.length;
  $("voiceHint").textContent = t("voiceMissing");
  if(voiceAll.length && voicePoll){ clearInterval(voicePoll); voicePoll=null; }
}
if("speechSynthesis" in window){
  speechSynthesis.onvoiceschanged = pickVoice;
  // Android Chrome often reports no voices at first and never fires the event: keep asking for a while.
  let tries=0; voicePoll = setInterval(() => { tries++; pickVoice(); if(tries>20 && voicePoll){ clearInterval(voicePoll); voicePoll=null; } }, 500);
  document.addEventListener("visibilitychange", () => { if(document.visibilityState==="visible") pickVoice(); });
  $("voiceSel").addEventListener("pointerdown", () => { if(!voiceAll.length) pickVoice(); });
}
$("voiceSel").onchange = e => {
  const val=e.target.value;
  if(val==="auto"){ store.set("ttr-voiceURI-"+lang, "auto"); pickVoice(); return; }
  const v = voiceAll.find(x => x.voiceURI===val); if(!v) return;
  const vl = vLang(v);
  // Picking a Polish voice switches directions to Polish (and the other way round), so the voice reads its own language.
  if(vl.startsWith("pl") && lang!=="pl" || vl.startsWith("en") && lang!=="en"){
    const nl = vl.slice(0,2); store.set("ttr-voiceURI-"+nl, val); setLang(nl); toast(t("voiceLangSwitched")); return;
  }
  store.set("ttr-voiceURI-"+lang, val); voice = v;
};
$("testVoice").onclick = () => { const was=sound; sound="all"; unlockAudio(); chime(); say(t("v_test"), true); sound=was; };
const ORD_WORDS = ["","first","second","third","fourth","fifth","sixth","seventh","eighth"];
const ABBR = [[/\bInd Est\b/g,"Industrial Estate"],[/\bRd\b/g,"Road"],[/\bAve\b/g,"Avenue"],[/\bCres\b/g,"Crescent"],[/\bCt\b/g,"Court"],
  [/\bDr\b/g,"Drive"],[/\bPk\b/g,"Park"],[/\bGrv\b/g,"Grove"],[/\bSq\b/g,"Square"],[/\bLwr\b/g,"Lower"],[/\bUpr\b/g,"Upper"],
  [/\bSt\b(?=\s+[A-Z])/g,"Saint"],[/\bSt\b/g,"Street"],[/\bN\b/g,"North"],[/\bS\b/g,"South"],[/\bE\b/g,"East"],[/\bW\b/g,"West"]];
function spoken(text){
  let s = lang==="en" ? text.replace(/\b(\d)(st|nd|rd|th)\b/g, (m,d) => ORD_WORDS[+d] || m) : text;
  ABBR.forEach(([re,w]) => s = s.replace(re, w));
  return s.replace(/\b([RNM])(\d)(\d)(\d)\b/g, "$1 $2 $3 $4").replace(/\b([RNM])(\d{1,2})\b/g, "$1 $2");
}
function say(text, urgent, kind){
  if(!("speechSynthesis" in window) || sound==="off" || (sound==="alerts" && kind!=="alert")) return;
  if(urgent) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(spoken(text));
  u.lang = lang==="pl" ? "pl-PL" : "en-IE";
  if(voice){ try{ u.voice=voice; u.lang=voice.lang; }catch(e){} }
  u.rate = 0.96; u.volume = 1;
  if(speechSynthesis.paused) speechSynthesis.resume();
  speechSynthesis.speak(u);
}
let actx=null;
function unlockAudio(){ try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume(); }catch(e){} }
function tones(list, vol){
  if(sound==="off" || !actx) return;
  try{
    const t0=actx.currentTime;
    list.forEach(([f,dt,len]) => {
      const o=actx.createOscillator(), g=actx.createGain(); o.type="sine"; o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t0+dt); g.gain.exponentialRampToValueAtTime(vol,t0+dt+.02); g.gain.exponentialRampToValueAtTime(.0001,t0+dt+len);
      o.connect(g); g.connect(actx.destination); o.start(t0+dt); o.stop(t0+dt+len+.02);
    });
  }catch(e){}
}
const chime = () => tones([[988,0,.28],[1319,.13,.28]], .22);          // alerts: cameras, incidents
const turnTone = () => { if(settings.turnChime && sound==="all") tones([[660,0,.18],[880,.09,.22]], .16); };   // just before a turn
const SOUND_IC = {all:"vol", alerts:"bell", off:"mute"};
function setVoiceBtn(){ $("muteBtn").innerHTML = ico(SOUND_IC[sound]); $("muteBtn").classList.toggle("off", sound==="off"); $("muteBtn").classList.toggle("half", sound==="alerts"); }
$("muteBtn").onclick = () => {
  sound = sound==="all" ? "alerts" : sound==="alerts" ? "off" : "all"; store.set("ttr-sound", sound); setVoiceBtn();
  if(sound!=="all" && "speechSynthesis" in window) speechSynthesis.cancel();
  toast(t("sound_"+sound));
};

// =====================================================================
// Speed limits
// =====================================================================
const SL = {limit:null, lastAt:0, lastPos:null, busy:false, setAt:null, src:null};
function setLimit(lim, announce, pos, src){
  if(pos) SL.setAt = {lat:pos.lat, lon:pos.lon};
  if(src) SL.src = src;
  if(!lim) return;
  if(SL.limit && SL.limit.v===lim.v && SL.limit.u===lim.u){ showLimit(); return; }
  SL.limit = {v:lim.v, u:lim.u, kmh:lim.kmh}; showLimit();
  if(announce && settings.limitVoice && settings.limits) say(t("v_limit", {n:lim.v, mph:lim.u==="mph"}), false, "alert");
}
// The last known limit stays on screen (roads rarely change limit without a sign); it fades if not confirmed for 1.5 km.
function showLimit(){
  const el=$("limitSign"); el.hidden = !settings.limits || !!(S && S.route.profile==="bike");
  const here0 = S && S.lastFix, stale = !!(SL.limit && SL.setAt && here0 && hav(SL.setAt.lat,SL.setAt.lon,here0.lat,here0.lon) > 1500);
  el.classList.toggle("unknown", !SL.limit); el.classList.toggle("stale", stale);
  el.innerHTML = SL.limit ? `${SL.limit.v}${SL.limit.u==="mph"?"<small>mph</small>":""}` : "–";
  el.dataset.src = SL.limit && SL.src ? t("lsrc_"+SL.src) : "";
}
function parseTTLimit(v){ const m=String(v||"").match(/([\d.]+)\s*(KPH|MPH)/i); if(!m) return null; const n=Math.round(+m[1]), mph=/mph/i.test(m[2]); return n ? {v:n, u:mph?"mph":"km/h", kmh: mph ? n*1.609 : n} : null; }
// TomTom: the limit of the road at a point (direction-aware). One request, so it's only used where the route has no data.
async function ttLimitAt(f, hdg){
  if(!ttKey()) return null;
  const res = await fetchT(`https://api.tomtom.com/search/2/reverseGeocode/${f.lat.toFixed(6)},${f.lon.toFixed(6)}.json?key=${encodeURIComponent(ttKey())}&returnSpeedLimit=true&radius=40${hdg!=null?`&heading=${Math.round(hdg)}`:""}&language=en-GB`, {}, 6000);
  if(!res.ok) throw new Error("tomtom "+res.status);
  const ad = ((await res.json()).addresses||[])[0];
  return ad && ad.address ? parseTTLimit(ad.address.speedLimit) : null;
}
// OpenStreetMap: the nearest road with a maxspeed tag, preferring roads that run in our direction.
async function osmLimitAt(f, hdg){
  const j = await overpassNow(`[out:json][timeout:8];way(around:25,${f.lat},${f.lon})["highway"]["maxspeed"];out tags geom 8;`, null, 9000);
  const o = mkO(f.lat, f.lon), p0={x:0,y:0}; let best=null;
  for(const w of j.elements||[]){
    const g=(w.geometry||[]).map(q => pxy(o,q.lat,q.lon));
    for(let i=0;i<g.length-1;i++){
      let d=segDist(p0, g[i], g[i+1]).d;
      if(hdg!=null){ const br=(Math.atan2(g[i+1].x-g[i].x, g[i+1].y-g[i].y)/RAD+360)%180, h=hdg%180, diff=Math.min(Math.abs(br-h), 180-Math.abs(br-h)); if(diff>35) d+=20; }
      if(!best || d<best.d) best={d, tags:w.tags};
    }
  }
  return best && best.d < 40 ? parseLimit(best.tags.maxspeed) : null;
}
// Live lookup for places the route data doesn't cover: TomTom first, OpenStreetMap as a back-up.
async function checkLimit(f, hdg){
  if(!settings.limits || SL.busy) return;
  const since = Date.now()-SL.lastAt, moved = SL.lastPos ? hav(SL.lastPos.lat,SL.lastPos.lon,f.lat,f.lon) : 1e9;
  if(since < 4000 || (moved < 60 && since < 30000)) return;
  SL.busy=true; SL.lastAt=Date.now(); SL.lastPos={lat:f.lat, lon:f.lon};
  try{
    let lim = await ttLimitAt(f, hdg).catch(() => null), src = "tt";
    if(!lim){ lim = await osmLimitAt(f, hdg).catch(() => null); src = "osm"; }
    if(S && lim) setLimit(lim, true, f, src);
  } finally { SL.busy=false; }
}
// TomTom speed limits for a whole route, rebuilt along our own line so they line up exactly.
async function ttRouteLimits(route){
  if(!ttKey() || !route.pts) return null;
  const pts=route.pts, step=Math.max(1, Math.ceil(pts.length/1000)), sp=[];
  for(let i=0;i<pts.length;i+=step) sp.push({latitude:+pts[i].lat.toFixed(6), longitude:+pts[i].lon.toFixed(6)});
  const last=pts[pts.length-1]; if((pts.length-1) % step) sp.push({latitude:+last.lat.toFixed(6), longitude:+last.lon.toFixed(6)});
  const a=pts[0], k=encodeURIComponent(ttKey()), q=`json?key=${k}&travelMode=car&sectionType=speedLimit&routeRepresentation=polyline&traffic=false`;
  const hasLim = x => x && x.routes && x.routes[0] && (x.routes[0].sections||[]).some(z => /speed_?limit/i.test(z.sectionType||""));
  let j=null, why="";
  try{
    const res = await fetchT(`https://api.tomtom.com/routing/1/calculateRoute/${a.lat.toFixed(6)},${a.lon.toFixed(6)}:${last.lat.toFixed(6)},${last.lon.toFixed(6)}/${q}`,
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({supportingPoints:sp})}, 15000);
    if(res.ok) j = await res.json(); else why = "POST "+res.status;
  }catch(e){ why = "POST "+(e.message||e); }
  // plan B: route through points along our line (TomTom allows up to 150), so it follows the same roads
  if(!hasLim(j)){
    const pick=[], n=Math.min(60, Math.max(2, route.stops && route.stops.length || 0)), stepB=Math.max(1, Math.floor(pts.length/n));
    for(let i=0;i<pts.length;i+=stepB) pick.push(pts[i]); pick.push(last);
    try{
      const res = await fetchT(`https://api.tomtom.com/routing/1/calculateRoute/${pick.map(p => p.lat.toFixed(6)+","+p.lon.toFixed(6)).join(":")}/${q}`, {}, 20000);
      if(res.ok){ const j2 = await res.json(); if(hasLim(j2)) j = j2; } else why += " · GET "+res.status;
    }catch(e){ why += " · GET "+(e.message||e); }
  }
  route.ttlWhy = why;
  const rt = j && j.routes && j.routes[0]; if(!rt) return null;
  const tp = (rt.legs||[]).flatMap(l => l.points||[]);
  const secs = (rt.sections||[]).filter(x => /speed_?limit/i.test(x.sectionType||"") && x.maxSpeedLimitInKmh).sort((x,y) => x.startPointIndex-y.startPointIndex);
  if(!tp.length || !secs.length) return null;
  const samples=[]; let seg=0, si=0;
  for(let i=0;i<tp.length;i++){
    while(si<secs.length && secs[si].endPointIndex < i) si++;
    const sc = secs[si] && secs[si].startPointIndex <= i ? secs[si] : null;
    const q2 = pxy(route.o, tp[i].latitude, tp[i].longitude);
    let m = nearest(route, q2, seg-2, seg+80);
    if(m.d > 25){ const g=nearest(route, q2, seg, route.pts.length); if(g.d < m.d) m=g; }
    if(m.d > 25) continue;
    seg = m.seg;
    samples.push({along:m.along, v: sc ? Math.round(sc.maxSpeedLimitInKmh) : null});
  }
  const segs=[]; let cur=null;
  for(const smp of samples){
    if(smp.v==null){ cur=null; continue; }
    if(cur && cur.v===smp.v && smp.along - cur.to < 120) cur.to = smp.along;
    else { cur={from:smp.along, to:smp.along, v:smp.v, u:"km/h", kmh:smp.v}; segs.push(cur); }
  }
  return segs.length ? segs : null;
}
const TTL_V = "ttr-ttl-v1-";
async function loadRouteLimits(route, cacheKey){
  if(cacheKey){ const c=store.get(TTL_V+cacheKey, null); if(c && Date.now()-c.at < 14*864e5){ route.ttl=c.segs; route.ttlState="ok"; buildLimits(route); return; } }
  route.ttlState="busy";
  try{
    const segs = await ttRouteLimits(route);
    if(segs){ route.ttl=segs; route.ttlState="ok"; buildLimits(route); if(cacheKey) store.set(TTL_V+cacheKey, {at:Date.now(), segs}); }
    else route.ttlState="none";
  }catch(e){ route.ttlState="fail"; route.ttlWhy = String(e.message||e); }
}
// One limit profile per route: TomTom where it has data, OpenStreetMap to fill the gaps.
function segAt(list, along){ if(!list) return null; for(const sg of list){ if(sg.from-5 <= along && along <= sg.to+40) return sg; if(sg.from > along+5) break; } return null; }
let limFix = store.get("ttr-limfix", {});
const fixAt = (route, a) => (limFix[route.id]||[]).find(f => a >= f.from && a <= f.to) || null;
function buildLimits(route){
  const fx = limFix[route.id];
  if(!route.ttl && !route.lim && !(fx && fx.length)){ route.limits=null; return; }
  const out=[]; let cur=null;
  for(let s=0; s<=route.total; s+=20){
    const f = fixAt(route, s);
    const sg = (f && {v:f.v, u:"km/h", kmh:f.v}) || segAt(route.ttl, s) || segAt(route.lim, s);
    if(!sg){ cur=null; continue; }
    if(cur && cur.v===sg.v && cur.u===sg.u) cur.to=s;
    else { cur={from:s, to:s, v:sg.v, u:sg.u, kmh:sg.kmh}; out.push(cur); }
  }
  route.limits = out.length ? out : null;
}

// Tap the speed sign while driving to correct it. On a test route it's remembered for that stretch (between turns).
function limitPick(){
  if(!S || S.route.profile==="bike") return;
  const box=$("limPick"); box.hidden = !box.hidden; if(box.hidden) return;
  const d = $("dial").getBoundingClientRect(); box.style.bottom = (innerHeight - d.top + 10) + "px";
  box.innerHTML = [30,50,60,80,100,120].map(v => `<button type="button" data-lim="${v}">${v}</button>`).join("") + `<button type="button" data-lim="0" class="clr">${esc(t("limClear"))}</button>`;
}
$("limitSign").addEventListener("click", limitPick);
$("limPick").addEventListener("click", e => {
  const b=e.target.closest("[data-lim]"); if(!b || !S) return;
  const v=+b.dataset.lim, r=S.route; $("limPick").hidden=true;
  if(!r.isDest && r.steps && r.pts){
    const pr=S.progress, prev=[...r.steps].reverse().find(st => st.along <= pr+5), next=r.steps.find(st => st.along > pr+5);
    const from = prev ? prev.along : 0, to = next ? next.along : r.total;
    const list = (limFix[r.id] = (limFix[r.id]||[]).filter(f => f.to < from || f.from > to));
    if(v) list.push({from, to, v});
    store.set("ttr-limfix", limFix); buildLimits(r);
  }
  if(v){ SL.limit=null; setLimit({v, u:"km/h", kmh:v}, false, S.lastFix, "you"); toast(t("limSaved",{n:v})); }
  else { SL.limit=null; SL.lastAt=0; showLimit(); toast(t("limCleared")); }
});

// =====================================================================
// Driving session
// =====================================================================
let S=null, watchId=null, simTimer=null, wakeLock=null, follow=true, lastTrack=null;
async function keepAwake(){ try{ if("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); }catch(e){} }
document.addEventListener("visibilitychange", () => { if(S && document.visibilityState==="visible") keepAwake(); });

function startSession(r, mode){
  if(!r || (!r.pts && !r.isDest)) return;
  unlockAudio();
  if(r.isDest){ r.pts=null; r.hz=null; r.lim=null; r.ttl=null; r.limits=null; clearRoute(); destMarker(r.dest); } else drawRoute(r, false);
  poiLayer.clearLayers(); camLayer.remove(); placesLayer.remove(); carLayer.clearLayers();
  if(r.isDest){ r.profile = travelMode==="bike" ? "bike" : "car"; r.color = r.profile==="bike" ? "#33e3a1" : "#38e1ff"; }
  document.body.classList.toggle("riding", r.profile==="bike");
  if(hereMarker){ hereMarker.remove(); hereMarker=null; }
  S = {route:r, mode, seg:0, progress:0, off:0, offSaid:false, said:{}, hzSaid:{}, limSaid:{}, startedAt:Date.now(), finished:false, lastFix:null, routing:false, lastRoute:0, overN:0, lastWarn:0,
       hdg:null, detour:null, rec:{track:[], dist:0, maxV:0, speeding:[], brakes:[], stopMin:{}, last:null, overRun:0, lastBrake:0,
         acc:[], corners:[], lastAcc:0, lastCorner:0, turnV:{}, rbV:{}, bumpV:{}, slowT:0, slow:[], mvMin:{}, missedTurns:0, smoothN:0, roughN:0}};
  SL.limit=null; SL.lastPos=null; SL.lastAt=0; SL.setAt=null;
  hideResults(); clearDetour();
  document.body.classList.add("driving");
  $("sheet").classList.remove("collapsed");
  $("driveView").hidden=false; $("hud").hidden=false; $("dial").hidden=false; $("recenter").hidden=true; $("fabs").hidden=true; $("alert").hidden=true;
  setVoiceBtn(); showLimit(); setDial(null); follow=true; keepAwake();
  $("dfabs").hidden=false; $("recenter").hidden=true; cam.zoomAt=0; cam.tz=null; cam.car=null; cam.anim=null; cam.lastAt=0; renderCompass();
  try{ const de=document.documentElement; if(!document.fullscreenElement && de.requestFullscreen) de.requestFullscreen({navigationUI:"hide"}).catch(()=>{}); }catch(e){}
  map.setZoom(17);
  if(r.isDest){ showSign({icon:"arrow", deg:0}, "", false); $("signInstr").textContent = t("findingYou"); }
  else {
    say((settings.examiner ? t("ex_intro") : r.recipe ? t("v_introR",{id:r.id, n:routeName(r)}) : t("v_intro",{id:r.id, n:routeName(r), s:r.stops.length-2})) + (mode==="sim" ? t("v_introSim") : ""), true);
    if(settings.examiner && mode==="gps") S.ex = planPullIns(r);
    { const L0=limitAt(r,0); if(L0) setLimit(L0, true, pointAt(r,0)); }
    if(ttKey()) liveTraffic(r, null, true);
  }
  updateStats();
  if(mode==="sim"){
    let along=0; const speed=3*11;
    simTimer = setInterval(() => {
      along += speed*0.25;
      const p = pointAt(r, along);
      onFix({lat:p.lat, lon:p.lon, heading:p.heading, speed:11, acc:5});
      if(along >= r.total){ clearInterval(simTimer); simTimer=null; }
    }, 250);
  } else {
    if(!("geolocation" in navigator)){ toast(t("noGeo")); return; }
    watchId = navigator.geolocation.watchPosition(
      pos => onFix({lat:pos.coords.latitude, lon:pos.coords.longitude, heading:pos.coords.heading, speed:pos.coords.speed, acc:pos.coords.accuracy}),
      err => toast(err.code===1 ? t("geoBlocked") : t("gpsWait"), 4000),
      {enableHighAccuracy:true, maximumAge:1000, timeout:15000});
  }
}
function endSession(){
  if(!S) return;
  if(watchId!=null) navigator.geolocation.clearWatch(watchId); watchId=null;
  if(simTimer) clearInterval(simTimer); simTimer=null;
  if(wakeLock){ wakeLock.release().catch(()=>{}); wakeLock=null; }
  if("speechSynthesis" in window) speechSynthesis.cancel();
  if(meMarker){ meMarker.remove(); meMarker=null; }
  clearDetour(); $("dfabs").hidden=true; cancelAnimationFrame(cam.loop); cam.loop=0; cam.anim=null; cam.car=null; turnMap(0, true);
  try{ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); }catch(e){}
  const wasDest = S.route.isDest, rep = S.report || (S.mode==="gps" && S.progress/(S.route.total||1) > .6 ? buildReport() : null);
  const parkAt = S.mode==="gps" && S.lastFix && S.route.profile!=="bike" ? {...S.lastFix} : null;
  lastTrack = S.mode==="gps" ? S.rec.track : null;
  S=null;
  document.body.classList.remove("driving");
  $("hud").hidden=true; $("dial").hidden=true; $("sign").classList.remove("off"); $("recenter").hidden=true; $("fabs").hidden=false;
  $("driveView").hidden=true;
  if(settings.camLayer) camLayer.addTo(map);
  document.body.classList.remove("riding"); applyCycle();
  if(parkAt) saveCar(parkAt); else drawCar();
  placesRefresh();
  renderRoutes(); renderPrep();
  if(wasDest && dest){ dest.pts=null; dest.raw=null; dest.eta=null; renderEta(); }
  refreshMap();
  if(rep){
    if(rep.rid){ reports.unshift(rep); reports = reports.slice(0,30); store.set("ttr-reports", reports); renderReports(); renderRoutes(); }
    drawTrack(lastTrack, rep); showReport(rep);
  }
}
$("endBtn").onclick = endSession;
map.on("dragstart", () => { if(S){ follow=false; $("recenter").hidden=false; } });
$("recenter").onclick = () => { follow=true; $("recenter").hidden=true; cam.zoomAt=0; if(S && S.lastFix) camUpdate(S.lastFix, S.hdg, S.kmh, S.nextDist, true); };

function showSign(ins, distText, off, next){
  $("signIcon").innerHTML = iconSvg(ins); $("signDist").textContent = distText; $("signInstr").textContent = ins && ins.text ? ins.text : "";
  $("signThen").hidden = !next; if(next) $("signThen").textContent = t("then", {s:lc(next.text)});
  $("sign").classList.toggle("off", !!off); $("sign").classList.remove("detour");
}
function setDial(kmh, over, bike){
  const max=bike ? 50 : 140, C=235.6, v = kmh==null ? 0 : Math.min(kmh, max);
  $("dialArc").style.strokeDasharray = `${(v/max)*C} 400`;
  $("dial").classList.toggle("over", !!over);
  $("spd").textContent = kmh==null ? "–" : kmh;
}

async function routeFromHere(f, isReroute){
  const r = S.route;
  if(S.routing || Date.now()-S.lastRoute < (isReroute ? 8000 : 4000)) return;
  S.routing = true; S.lastRoute = Date.now();
  if(isReroute) say(t("v_rerouting"), true);
  try{
    const data = await osrmFetch(`${f.lon},${f.lat};${r.dest.lon},${r.dest.lat}`, null, r.profile, S.hdg!=null && isReroute ? `&bearings=${Math.round(S.hdg)},60;` : "");
    if(!S || S.route !== r) return;
    applyOsrm(r, data); r.hz=null; r.lim=null; r.ttl=null; r.limits=null;
    drawRoute(r, false);
    S.seg=0; S.progress=0; S.said={}; S.hzSaid={}; S.limSaid={}; S.off=0; S.offSaid=false;
    if(!isReroute){
      say(t("v_heading", {n:destName(r), t:spokenDur(r.duration)}), true);
      weatherAt(r.dest).then(w => { if(S && S.route===r && w && w.warn){ say(t("wxWarn", {w:lc(t(w.key))})); toast(t("wxWarn", {w:lc(t(w.key))}), 5000); } }).catch(() => {});
    }
    setTimeout(() => { if(S && S.route===r && S.lastFix) onFix({...S.lastFix, speed:null}); }, 0);
    if(r.profile!=="bike"){
      loadIntel(r).then(() => { if(S && S.route===r){ drawRoute(r, false); } });
      loadRouteLimits(r).then(() => { if(S && S.route===r && S.lastFix) onFix({...S.lastFix, speed:null}); });
      if(ttKey()){ S.inc=[]; liveTraffic(r, f, true); }
    }
  }catch(e){ toast(t("routeFail"), 4000); }
  finally{ if(S) S.routing = false; }
}

// Traffic-aware arrival and incidents; refreshed every few minutes while driving.
async function liveTraffic(r, f, first){
  if(!S || !ttKey() || S.ttBusy) return;
  S.ttBusy = true; S.ttAt = Date.now();
  try{
    const [tr, inc] = await Promise.all([
      r.isDest ? ttRoute(f, r.dest).catch(() => null) : Promise.resolve(null),
      ttIncidents(r).catch(() => null),
    ]);
    if(!S || S.route!==r) return;
    if(inc) S.inc = inc;
    if(tr){
      const arrive = Date.now() + tr.secs*1000;
      if(!first && S.tt && arrive - S.tt.arrive > 4*60000) say(t("v_delay", {t:hhmm(arrive)}), false, "alert");
      S.tt = {secs:tr.secs, prog:S.progress, at:Date.now(), arrive};
    }
  }finally{ if(S) S.ttBusy=false; }
}
// ---------- Examiner mode ----------
function exLine(st){
  if(st.icon==="flag") return t("ex_end");
  if(st.icon==="rb") return st.exit ? t("ex_rb", {n:st.exit}) : t("ex_rbThrough");
  const side = /left/.test(st.mod) ? "left" : /right/.test(st.mod) ? "right" : null;
  if(!side) return t("ex_ahead");
  if(st.mtype==="end of road") return t("ex_endroad_"+side);
  if(/slight/.test(st.mod) || st.mtype==="fork") return t("ex_bear_"+side);
  return t("ex_next_"+side);
}
// Two "pull in and stop" requests at random calm spots, like the real test.
function planPullIns(r){
  const c=[], st=r.steps||[];
  for(let i=0;i<st.length-1;i++){ const a=st[i].along+150, b=st[i+1].along-250; if(b-a>150 && a>400 && b<r.total-400) c.push(a+(b-a)*Math.random()*.6); }
  for(let i=c.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [c[i],c[j]]=[c[j],c[i]]; }
  return c.slice(0,2).sort((x,y) => x-y).map(along => ({along, state:"wait"}));
}
function examinerTasks(f, kmh, r){
  const tk = S.ex.find(x => x.state==="wait" || x.state==="pull"); if(!tk) return;
  if(tk.state==="wait" && S.progress >= tk.along){
    const busy = (r.hz||[]).some(h => h.along > S.progress && h.along-S.progress < 150);
    if(!busy && (kmh==null || kmh < 70)){ say(t("ex_pull")); tk.state="pull"; tk.at=S.progress; tk.stopT=null; } else tk.along += 100;
  } else if(tk.state==="pull"){
    if(f.speed!=null && f.speed < 1.5){ tk.stopT = tk.stopT || Date.now(); if(Date.now()-tk.stopT > 6000){ say(t("ex_check")+" "+t("ex_move")); tk.state="done"; tk.ok=true; } }
    else tk.stopT = null;
    if(tk.state==="pull" && S.progress - tk.at > 500) tk.state="skip";
  }
}
function updateAlerts(r){
  const pr=S.progress; let banner=null;
  [...(r.hz||[]), ...(S.inc||[])].forEach(h => {
    const inc = h.type==="inc";
    const on = h.type==="camera" ? settings.camAlerts : settings.hzAlerts; if(!on) return;
    const ahead=h.along-pr; if(ahead < -15) return;
    const voiceAt = inc ? 700 : h.type==="camera" ? 500 : h.type==="school" ? 160 : 90, showAt = inc ? 1200 : h.type==="camera" ? 700 : 220;
    if(ahead<=showAt){ const pri = h.type==="camera" ? 0 : inc ? 1 : 2; if(!banner || pri<banner.pri || (pri===banner.pri && ahead<banner.ahead)) banner={h, ahead, pri}; }
    const key = h.type + (h.kind||"") + h.along;
    if(ahead<=voiceAt && ahead>0 && !S.hzSaid[key]){
      S.hzSaid[key]=1;
      if(h.type==="camera" || inc) chime();
      const lim = h.lim || (limitAt(r,h.along)||{}).v;
      say(inc ? t("vi_"+h.kind) : t("vh_"+h.type, {lim}), false, "alert");
    }
  });
  const lp = r.limits || r.lim;
  if(lp && settings.limitVoice && settings.limits){
    const cur=limitAt(r,pr), nx=lp.find(sg => sg.from>pr+5 && sg.from-pr<150);
    if(nx && cur && nx.v!==cur.v && !S.limSaid[nx.from]){ S.limSaid[nx.from]=1; say(t("vh_limitAhead",{n:nx.v}), false, "alert"); }
  }
  const el=$("alert");
  if(!banner){ el.hidden=true; return; }
  const bh = banner.h, inc = bh.type==="inc";
  el.hidden=false; el.style.setProperty("--c", inc ? INC_COL[bh.kind] : HZ_COL[bh.type]);
  el.className = "alert" + (bh.type==="camera" || inc ? " cam" : "");
  $("alertIc").innerHTML = ico(inc ? bh.kind : bh.type);
  $("alertTx").textContent = inc ? t("inc_"+bh.kind) + (bh.delay>=60 ? " · " + t("delayMin",{m:Math.round(bh.delay/60)}) : "")
    : t("hz_"+bh.type) + (bh.type==="camera" && (bh.lim || (limitAt(r,bh.along)||{}).v) ? " · " + t("limitTo",{n:bh.lim || limitAt(r,bh.along).v}) : "");
  $("alertD").textContent = banner.ahead > 0 ? fmtDist(banner.ahead) : "";
}

function record(f, kmh, r, onRoute){
  const R=S.rec, now=Date.now(), v=f.speed;
  if(v==null || v<0) return;
  if(R.last){
    const dt=(now-R.last.t)/1000, acc = dt>0 ? (v-R.last.v)/dt : 0;
    if(dt>0 && dt<3 && R.last.v>4 && acc < -3.5 && now-R.lastBrake > 6000){ R.brakes.push({lat:f.lat, lon:f.lon, v:Math.round(R.last.v*3.6)}); R.lastBrake=now; }
    // pulling away or speeding up too hard
    if(dt>0 && dt<3 && acc > 2.8 && now-R.lastAcc > 8000){ R.acc.push({lat:f.lat, lon:f.lon, v:Math.round(v*3.6)}); R.lastAcc=now; }
    // turning too hard: sideways force from speed x rate of turn
    if(dt>0 && dt<3 && v>5 && S.hdg!=null && R.lastHdg!=null){
      const lat = v * angDiff(S.hdg, R.lastHdg)*RAD / dt;
      if(lat > 3.4 && now-R.lastCorner > 8000){ R.corners.push({lat:f.lat, lon:f.lon, v:Math.round(v*3.6)}); R.lastCorner=now; }
    }
    if(dt>0 && dt<3 && v>2){ if(Math.abs(acc) < 1.5) R.smoothN++; else R.roughN++; }
    R.dist += hav(R.last.lat,R.last.lon,f.lat,f.lon);
  }
  R.lastHdg = S.hdg;
  R.last={t:now, v, lat:f.lat, lon:f.lon}; R.maxV=Math.max(R.maxV, v);
  // very slow on a fast road for a long time (lack of progress)
  if(SL.limit && SL.limit.kmh >= 60 && kmh > 10 && kmh < SL.limit.kmh*0.5){ R.slowT += R.lastSlowAt ? (now-R.lastSlowAt)/1000 : 0; R.lastSlowAt = now;
    if(R.slowT > 40 && !R.slowLogged){ R.slow.push({lat:f.lat, lon:f.lon, v:kmh, l:SL.limit.v}); R.slowLogged = true; } }
  else { R.slowT = 0; R.lastSlowAt = 0; R.slowLogged = false; }
  if(onRoute && r.steps){
    const pr = S.progress;
    r.steps.forEach((st,i) => {
      // speed at the turn itself (left/right turns only)
      if(st.icon==="arrow" && /^(left|right|sharp left|sharp right)$/.test(st.mod||"") && st.along > 20 && Math.abs(pr-st.along) < 12) R.turnV[i] = Math.max(R.turnV[i]||0, v);
      // speed in the last 35 m before a roundabout
      if(st.icon==="rb" && pr > st.along-35 && pr < st.along-3) R.rbV[i] = Math.max(R.rbV[i]||0, v);
      // a manoeuvre spot: did we stop there?
      if(st.mv && Math.abs(pr-st.along) < 40) R.mvMin[i] = Math.min(R.mvMin[i] ?? 99, v);
    });
    (r.hz||[]).forEach((h,i) => { if(h.type==="bump" && Math.abs(h.along-pr) < 8) R.bumpV[i] = Math.max(R.bumpV[i]||0, v); });
  }
  const over = SL.limit && kmh > SL.limit.kmh + 3;
  if(over){ R.overRun++; if(R.overRun===3) R.speeding.push({lat:f.lat, lon:f.lon, v:kmh, l:SL.limit.v}); else if(R.overRun>3){ const e=R.speeding[R.speeding.length-1]; e.v=Math.max(e.v,kmh); } }
  else R.overRun=0;
  R.track.push([f.lat, f.lon, over?1:0]);
  if(onRoute) (r.hz||[]).forEach((h,i) => {
    if(h.type!=="stop" || Math.abs(h.along-S.progress) > 25) return;
    const m=R.stopMin[i]; R.stopMin[i] = {v: m ? Math.min(m.v, v) : v, lat:h.lat, lon:h.lon};
  });
}

function onFix(f){
  if(!S) return;
  const r=S.route;
  let hdg = (f.heading!=null && !isNaN(f.heading) && (f.speed||0)>1) ? f.heading : null;
  if(hdg==null && S.lastFix){ const d=hav(S.lastFix.lat,S.lastFix.lon,f.lat,f.lon); if(d>4){ const o=mkO(S.lastFix.lat,S.lastFix.lon), q=pxy(o,f.lat,f.lon); hdg=(Math.atan2(q.x,q.y)/RAD+360)%360; } }
  if(hdg==null && S.hdg!=null && S.lastFix && hav(S.lastFix.lat,S.lastFix.lon,f.lat,f.lon) <= 4) hdg = S.hdg;   // stopped at lights: keep pointing the same way
  S.lastFix = {lat:f.lat, lon:f.lon, heading:f.heading}; S.hdg = hdg;
  here = {lat:f.lat, lon:f.lon, at:Date.now()};
  if(!meMarker){ meMarker = L.marker([f.lat,f.lon], {icon:meIcon(hdg), zIndexOffset:1000, keyboard:false}).addTo(map); cam.car = {lat:f.lat, lon:f.lon}; }
  else { const el=meMarker.getElement(), hadArrow = el && el.querySelector("path"); if(!!hadArrow !== (hdg!=null)) meMarker.setIcon(meIcon(hdg)); }

  const kmh = f.speed!=null && f.speed>=0 ? Math.round(f.speed*3.6) : null;
  S.kmh = kmh; S.nextDist = null;
  if(r.isDest && !r.pts){ camUpdate(f, hdg, kmh, null); setDial(kmh, false, r.profile==="bike"); if(r.profile!=="bike") checkLimit(f, hdg); routeFromHere(f, false); return; }
  if(!r.pts){ camUpdate(f, hdg, kmh, null); return; }

  const p = pxy(r.o, f.lat, f.lon);
  // A practice route with a detour running (missed turn, or driving to the start)
  if(S.detour && detourFix(f, p, hdg, kmh)) return;

  let m = nearestDir(r, p, S.seg-3, S.seg+150, hdg);
  if(m.d > 40){ const g = nearestDir(r, p, S.seg, r.pts.length, hdg); if(g.d < m.d) m = g; }
  let onRoute = false;
  if(!r.isDest && S.progress < 30 && m.d > 60){
    if(S.mode==="gps") startDetour(f, "start");
    showSign({icon:"flag"}, fmtDist(hav(f.lat,f.lon,r.pts[0].lat,r.pts[0].lon)), false); $("signInstr").textContent = t("toStart");
    camUpdate(f, hdg, kmh, null); finishFix(f, kmh, hdg, r, false); return;
  }
  const leavingStart = r.isDest && S.progress < 20 && m.d <= 150;
  if(m.d > 45 && !leavingStart){
    S.off++;
    if(S.off>=3 && r.isDest){ showSign({icon:"warn"}, t("rerouting"), true); $("signInstr").textContent = t("newWay"); routeFromHere(f, true); camUpdate(f, hdg, kmh, null); finishFix(f, kmh, hdg, r, false); return; }
    if(S.off>=3){
      // Practice route: plan a way back to the route just past the turn we missed
      showSign({icon:"warn"}, t("offRoute"), true); $("signInstr").textContent = t("findingBack");
      if(!S.offSaid){ say(t("v_offBack"), true); S.offSaid=true; }
      if(S.mode==="gps"){ if(!S.detour && !S.detourBusy) S.rec.missedTurns++; startDetour(f, "back"); }
      camUpdate(f, hdg, kmh, null); finishFix(f, kmh, hdg, r, false); return;
    }
  } else {
    if(S.off>=3 && !r.isDest) say(t("v_back"), true);
    S.off=0; S.offSaid=false; S.seg=m.seg; S.progress=Math.max(S.progress, m.along); onRoute = true;
  }
  if(doneLayer) doneLayer.setLatLngs(r.pts.slice(0, S.seg+1).map(q=>[q.lat,q.lon]).concat([[f.lat,f.lon]]));

  const g = guide(r, S.progress, S.said, true);
  if(g==="finish"){ camUpdate(f, hdg, kmh, null); finishFix(f, kmh, hdg, r, onRoute); finish(); return; }
  camUpdate(f, hdg, kmh, S.nextDist);
  finishFix(f, kmh, hdg, r, onRoute);
}
// Turn-by-turn for a route (the main one or a detour): sign, then spoken prompts at ~1 km, ~200 m and at the turn.
function guide(rt, prog, said, main){
  const r = S.route;
  const idx = rt.steps.findIndex(s => s.along > prog + 4);
  if(main && (idx<0 || prog > rt.total-25)) return "finish";
  if(idx<0) return "none";
  const step = rt.steps[idx], dist = step.along - prog, next = rt.steps[idx+1];
  S.nextDist = dist;
  showSign(step, fmtDist(dist), false, next && next.icon!=="flag" && next.along-step.along < 300 ? next : null);
  const k = said[idx] || (said[idx] = {});
  const prevAlong = idx>0 ? rt.steps[idx-1].along : 0;
  if(step.mv){
    if(!k.far && dist <= 220 && dist > 60){ k.far=true; say(t("v_mvSoon", {d:spokenDist(dist), m:lc(t("mv_"+step.mvType))})); }
    if(!k.near && dist <= 30){ k.near=k.far=true; chime(); say(main && settings.examiner && !r.isDest ? t("ex_mv_"+step.mvType) : t("v_mv_"+step.mvType), true); }
    return idx;
  }
  if(main && settings.examiner && !r.isDest && !k.ex && dist <= 170){ k.ex=k.km=k.far=k.near=true; if(step.icon==="flag") S.arrSaid=true; turnTone(); say(exLine(step), true); }
  if(!k.km && dist <= 1100 && dist > 700 && (step.along - prevAlong) > 1500){ k.km=true; say(t("v_km", {s:lc(step.text)})); }
  if(!k.far && dist <= 220 && dist > 70 && (step.along - prevAlong) > 260){ k.far=true; say(t("v_in", {d:spokenDist(dist), s:lc(step.text)})); }
  if(!k.near && dist <= 45){
    k.near=k.far=true;
    if(main && step.icon==="flag") S.arrSaid = true;
    const soon = next && (next.along - step.along) < 120 && next.icon!=="flag";
    const now = step.icon==="flag" ? (r.isDest || !main ? `${step.text}.` : t("v_end")) : step.icon==="rb" ? `${step.text}.` : t("v_now", {s:lc(step.text)});
    if(step.icon!=="flag") turnTone();
    say(soon ? now + t("v_then", {s:lc(next.text)}) : now, true);
    if(soon) (said[idx+1] = said[idx+1] || {}).far = true;
  }
  return idx;
}

// =====================================================================
// Detours on practice routes: missed a turn, or still on the way to the start
// =====================================================================
let detourLayer=null;
function clearDetour(){ if(detourLayer){ detourLayer.remove(); detourLayer=null; } if(S) S.detour=null; }
function idxAt(route, along){ const c=route.cum; let lo=0, hi=c.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(c[m]<=along) lo=m; else hi=m; } return lo; }
const angDiff = (a,b) => Math.abs(((a-b)%360+540)%360-180);
async function startDetour(f, kind){
  const r=S.route, D0=S.detour;
  if(S.detourBusy || Date.now()-(S.detourAt||0) < (D0 && D0.pts ? 10000 : 6000)) return;
  S.detourBusy=true; S.detourAt=Date.now();
  // Rejoin a little past the turn we missed (so we drive it properly), then a second point to fix the direction of travel.
  const base = kind==="start" ? 0 : (D0 ? D0.base : S.progress);
  const nt = kind==="start" ? 0 : ((r.steps.find(st => st.along > base+4) || {}).along ?? base);
  let aAl = kind==="start" ? Math.min(40, r.total) : (nt-base < 150 ? nt+60 : base+150);
  aAl = Math.min(aAl, r.total-5);
  const bAl = Math.min(aAl+160, r.total), A=pointAt(r,aAl), B=pointAt(r,bAl);
  const coords = `${f.lon},${f.lat};${A.lon},${A.lat}` + (bAl-aAl > 30 ? `;${B.lon},${B.lat}` : "");
  const brg = S.hdg!=null ? `&bearings=${Math.round(S.hdg)},70;` + (bAl-aAl > 30 ? ";" : "") : "";
  if(!D0) S.detour = {pending:true, kind, base, aAlong:aAl};
  try{
    const data = await osrmFetch(coords, null, "car", brg + "&continue_straight=true");
    if(!S || S.route!==r || !S.detour) return;
    const D = {isDetour:true, kind, base, aAlong:aAl, profile:"car", said:{}, seg:0, progress:0, off:0, backN:0};
    applyOsrm(D, data);
    const joinAt = (D.stopAlong||[])[1] ?? D.total;
    D.steps = D.steps.filter(st => st.along < joinAt-15 && st.icon!=="flag");
    D.steps.push({text: kind==="start" ? t("startHere",{id:r.id}) : t("rejoinStep"), icon:"flag", along:joinAt, mtype:"arrive", mod:"straight"});
    D.joinAt = joinAt;
    S.detour = D; drawDetour(D);
    if(!D0) say(kind==="start" ? t("v_toStart",{t:spokenDur(D.duration)}) : t("v_wayBack"), false);
    if(S.lastFix) setTimeout(() => { if(S && S.detour===D) onFix({...S.lastFix, speed:null}); }, 0);
  }catch(e){
    if(S && S.detour && S.detour.pending) S.detour = null;
  }finally{ if(S) S.detourBusy=false; }
}
function drawDetour(D){
  if(detourLayer) detourLayer.remove();
  const ll = D.pts.map(q => [q.lat,q.lon]);
  detourLayer = L.layerGroup([
    L.polyline(ll, {color:"#a48cff", weight:14, opacity:.18, lineJoin:"round"}),
    L.polyline(ll, {color:"#03070d", weight:8, opacity:.85, lineJoin:"round"}),
    L.polyline(ll, {color:"#a48cff", weight:4.5, opacity:1, lineJoin:"round", dashArray:"10 7"})
  ]).addTo(map);
}
// Returns true while the detour is in charge of this fix.
function detourFix(f, p, hdg, kmh){
  const r=S.route, D=S.detour;
  // Back on the practice route, heading the right way? Then the main route takes over again.
  const lo = idxAt(r, Math.max(0, D.base-300)), hi = idxAt(r, Math.min(r.total, D.aAlong+400));
  const mm = nearest(r, p, lo, hi);
  const ok = mm.d < 22 && (hdg==null || angDiff(hdg, pointAt(r, mm.along).heading) < 55);
  D.backN = ok ? (D.backN||0)+1 : 0;
  if(D.backN >= 2){
    const resumeAt = mm.along;
    clearDetour(); S.seg = mm.seg; S.progress = resumeAt; S.off=0; S.offSaid=false;
    r.steps.forEach((st,i) => { if(st.along > resumeAt+4) delete S.said[i]; });
    if(r.stops && resumeAt > 30) say(t("v_back"), true);
    return false;
  }
  if(D.pending){
    if(D.kind==="start"){ showSign({icon:"flag"}, fmtDist(hav(f.lat,f.lon,r.pts[0].lat,r.pts[0].lon)), false); $("signInstr").textContent = t("toStart"); }
    else { showSign({icon:"warn"}, t("offRoute"), true); $("signInstr").textContent = t("findingBack"); }
    camUpdate(f, hdg, kmh, null); finishFix(f, kmh, hdg, r, false); return true;
  }
  const q = pxy(D.o, f.lat, f.lon);
  let dm = nearest(D, q, D.seg-3, D.seg+150);
  if(dm.d > 40){ const g=nearest(D, q, D.seg, D.pts.length); if(g.d < dm.d) dm=g; }
  if(dm.d > 45){ if(++D.off >= 3) startDetour(f, D.kind); }      // went another way: plan again
  else { D.off=0; D.seg=dm.seg; D.progress=Math.max(D.progress, dm.along); }
  const g = guide(D, D.progress, D.said, false);
  if(g==="none"){ showSign({icon:"flag"}, "", false); $("signInstr").textContent = D.kind==="start" ? t("startHere",{id:r.id}) : t("rejoinStep"); }
  $("sign").classList.add("detour");
  camUpdate(f, hdg, kmh, S.nextDist);
  finishFix(f, kmh, hdg, r, false);
  return true;
}

// =====================================================================
// Camera: heading-up or north-up, look-ahead, zoom by speed
// =====================================================================
const cam = {headUp: store.get("ttr-headup", true) && CAN_ROTATE, target:0, raf:0, zoomAt:0, loop:0, anim:null, car:null, tz:null};
// Rotate the map on its own (browsing, or the compass button with no GPS fix yet).
function turnMap(target, now){
  if(!CAN_ROTATE) return;
  cam.target = ((target%360)+360)%360;
  if(now){ cancelAnimationFrame(cam.raf); cam.raf=0; map.setBearing(cam.target); renderCompass(); turnArrow(); return; }
  if(cam.raf) return;
  const step = () => {
    const cur = map.getBearing(), d = ((cam.target-cur)%360+540)%360-180;
    if(Math.abs(d) < 0.4){ map.setBearing(cam.target); cam.raf=0; }
    else { map.setBearing(cur + d*0.16); cam.raf = requestAnimationFrame(step); }
    renderCompass(); turnArrow();
  };
  cam.raf = requestAnimationFrame(step);
}
// Where the map centre must be so the car sits at the look-ahead point on screen, for a given bearing and zoom.
function camCenter(car, b, z){
  const sz = map.getSize(), hb = $("hud").hidden ? 0 : $("hud").getBoundingClientRect().bottom, top = Math.max(hb, 0) + 8, bottom = sz.y - sheetH();
  const carY = cam.headUp ? top + (bottom-top)*0.74 : (top+bottom)/2, dy = carY - sz.y/2;
  const mpp = 40075016.686*Math.cos(car.lat*RAD)/(256*Math.pow(2, z)), az = (-b)*RAD, dist = dy*mpp;   // screen-down points along bearing -b
  return L.latLng(car.lat + Math.cos(az)*dist/111320, car.lon + Math.sin(az)*dist/(111320*Math.cos(car.lat*RAD)));
}
// Called on every GPS fix: glide the car, the map, its rotation and zoom to the new state over about a second.
function camUpdate(f, hdg, kmh, nextDist, force){
  const bike = S && S.route.profile==="bike";
  if(cam.headUp && hdg!=null && (kmh==null || kmh >= 3 || force)) cam.target = ((-hdg%360)+360)%360;
  else if(!cam.headUp) cam.target = 0;
  // zoom: closer in town and before turns, further out at speed
  let z = kmh==null ? 17 : bike ? (kmh < 18 ? 17.5 : 17) : kmh < 25 ? 17.5 : kmh < 55 ? 17 : kmh < 85 ? 16.25 : 15.5;
  if(nextDist!=null && nextDist < 250 && (kmh==null || kmh < 85)) z = Math.max(z, 17.25);
  if(cam.tz==null || force || (Math.abs(z-cam.tz) >= 0.5 && Date.now()-cam.zoomAt > 4000)){ cam.tz = z; cam.zoomAt = Date.now(); }
  const now = performance.now(), from = cam.car || {lat:f.lat, lon:f.lon};
  const gap = cam.lastAt ? now - cam.lastAt : 1000; cam.lastAt = now;
  cam.anim = {from:{lat:from.lat, lon:from.lon, b:getBear(), z:map.getZoom()}, to:{lat:f.lat, lon:f.lon, b:cam.target, z:cam.tz}, t0:now, dur: force ? 350 : Math.max(250, Math.min(1100, gap))};
  if(!cam.loop) cam.loop = requestAnimationFrame(camFrame);
}
function camFrame(){
  cam.loop = 0;
  const a = cam.anim; if(!a || !S){ return; }
  const k = Math.min(1, (performance.now()-a.t0)/a.dur), e = k*(2-k);
  const car = {lat: a.from.lat + (a.to.lat-a.from.lat)*k, lon: a.from.lon + (a.to.lon-a.from.lon)*k};
  cam.car = car;
  if(meMarker) meMarker.setLatLng([car.lat, car.lon]);
  if(follow){
    const b = a.from.b + (((a.to.b-a.from.b)%360+540)%360-180)*e, z = a.from.z + (a.to.z-a.from.z)*e;
    if(CAN_ROTATE) map.setBearing(b);
    const c = camCenter(car, CAN_ROTATE ? b : 0, z);
    if(Math.abs(z - map.getZoom()) > 0.001) map.setView(c, z, {animate:false}); else map.panTo(c, {animate:false, noMoveStart:true});
    renderCompass();
  }
  turnArrow();
  if(k < 1) cam.loop = requestAnimationFrame(camFrame);
}
function renderCompass(){
  const b = getBear();
  ["compassBtn","northBtn"].forEach(id => { const el=$(id); if(!el) return; const n=el.querySelector(".needle"); if(n) n.style.transform = `rotate(${b}deg)`; });
  $("compassBtn").classList.toggle("on", cam.headUp);
  $("compassBtn").setAttribute("aria-label", cam.headUp ? t("headUp") : t("northUp"));
  $("northBtn").hidden = !!S || Math.abs(((b+180)%360)-180) < 1;
}
map.on("rotate", () => { if(!cam.raf){ renderCompass(); turnArrow(); } });
$("compassBtn").onclick = () => {
  if(!CAN_ROTATE){ toast(t("northUp")); return; }
  cam.headUp = !cam.headUp; store.set("ttr-headup", cam.headUp); toast(cam.headUp ? t("headUp") : t("northUp"));
  follow = true; $("recenter").hidden = true;
  if(S && S.lastFix) camUpdate(S.lastFix, S.hdg, S.kmh, S.nextDist, true);
  else if(!cam.headUp) turnMap(0);
  renderCompass();
};
$("northBtn").onclick = () => turnMap(0);
// Overview: the rest of the route and where it ends; tap re-centre to carry on following.
$("overBtn").onclick = () => {
  if(!S) return;
  follow = false; $("recenter").hidden = false; turnMap(0, true);
  const r = S.route, D = S.detour && S.detour.pts ? S.detour : null, pts=[];
  if(S.lastFix) pts.push([S.lastFix.lat, S.lastFix.lon]);
  if(D) D.pts.slice(D.seg).forEach(q => pts.push([q.lat,q.lon]));
  if(r.pts) r.pts.slice(D ? idxAt(r, D.aAlong) : S.seg).forEach(q => pts.push([q.lat,q.lon]));
  else if(r.dest) pts.push([r.dest.lat, r.dest.lon]);
  if(pts.length > 1){ const b=L.latLngBounds(pts); map.fitBounds(b, {paddingTopLeft:[30, ($("hud").getBoundingClientRect().bottom||60)+10], paddingBottomRight:[30, sheetH()+20], maxZoom:17}); }
};
// Speed, limits, alerts, recording and stats: shared by every fix
function finishFix(f, kmh, hdg, r, onRoute){
  if(r.profile==="bike"){
    setDial(kmh, false, true);
    if(onRoute) updateAlerts(r); else $("alert").hidden=true;
    if(S.mode==="gps") record(f, kmh, r, false);
    updateStats(); return;
  }
  // Route data first (TomTom + OpenStreetMap); anywhere it has a gap, ask live. The last limit stays until a new one is known.
  const L0 = onRoute ? limitAt(r, S.progress) : null;
  if(L0) setLimit(L0, true, f, fixAt(r, S.progress) ? "you" : segAt(r.ttl, S.progress) ? "tt" : "osm"); else checkLimit(f, hdg);
  showLimit();
  const over = kmh!=null && SL.limit && kmh > SL.limit.kmh + 3;
  S.overN = over ? S.overN+1 : 0;
  setDial(kmh, S.overN>=2);
  if(S.overN>=3 && settings.speedWarn && settings.limits && Date.now()-S.lastWarn > 30000){ S.lastWarn=Date.now(); say(t("v_check"), false, "alert"); }
  if(onRoute) updateAlerts(r); else $("alert").hidden=true;
  if(ttKey() && r.pts && S.ttAt && Date.now()-S.ttAt > 5*60000) liveTraffic(r, f, false);
  if(S.mode==="gps") record(f, kmh, r, onRoute);
  if(S.ex && onRoute) examinerTasks(f, kmh, r);
  updateStats();
}
function updateStats(){
  const r=S.route, pts=!!r.pts, frac = pts ? Math.min(1, S.progress/(r.total||1)) : 0;
  $("prog").style.width = (frac*100).toFixed(1)+"%";
  const left = pts ? num(Math.max(0,(r.total-S.progress)/1000),1) : "–";
  if(r.isDest){
    let secs = pts ? r.duration*(1-frac) : null;
    if(pts && S.tt){ const left0 = r.total - S.tt.prog; secs = left0 > 0 ? S.tt.secs * Math.max(0, r.total-S.progress)/left0 : 0; }
    setStat("A", secs==null ? "–" : Math.max(0, Math.round(secs/60)), t("minLeft"));
    setStat("B", left, t("kmLeft"));
    setStat("C", secs==null ? "–" : hhmm(Date.now()+secs*1000), t("arrive"));
    return;
  }
  const inner = r.recipe ? (r.mv||[]).map(m => m.along) : (r.stopAlong||[]).slice(1,-1), el=Math.floor((Date.now()-S.startedAt)/1000);
  setStat("A", `${inner.filter(a => a <= S.progress + 15).length}/${inner.length}`, t(r.recipe ? "mvShort" : "stops"));
  setStat("B", left, t("kmLeft"));
  setStat("C", `${Math.floor(el/60)}:${String(el%60).padStart(2,"0")}`, t("elapsed"));
  stopMarkers.forEach((mk,i) => {
    const e = mk && mk.getElement && mk.getElement();
    if(e && e.firstChild){ const a=r.stopAlong[i]; e.firstChild.classList.toggle("done", i>0 && a!=null && a <= S.progress+15 && i<r.stops.length-1); }
  });
}
function setStat(k, v, l){ $("stat"+k).textContent = v; $("stat"+k+"L").textContent = l; }
function finish(){
  if(S.finished) return; S.finished=true;
  const mins = Math.round((Date.now()-S.startedAt)/60000);
  if(S.route.isDest){
    showSign({icon:"flag"}, t("arrived"), false); $("signInstr").textContent = `${destName(S.route)} · ${mins} min`;
    if(!S.arrSaid) say(t("v_arrived"), true);
  } else {
    showSign({icon:"flag"}, t("done"), false);
    $("signInstr").textContent = S.mode==="sim" ? t("rehDone") : t("routeDone", {id:S.route.id, m:mins});
    if(!(settings.examiner && S.arrSaid)) say(S.mode==="sim" ? t("v_reh") : t("v_done"), true);
    if(S.mode!=="sim"){ (log[S.route.id] = log[S.route.id]||[]).push({date:new Date().toISOString(), mins}); store.set("ttr-log", log); }
  }
  $("alert").hidden = true;
  if(S.mode==="gps") S.report = buildReport();
  if(watchId!=null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
}

// ---------- Drive report ----------
function buildReport(){
  const R=S.rec, secs=(Date.now()-S.startedAt)/1000, r=S.route;
  if(secs < 60 || R.dist < 300) return null;
  if(r.profile==="bike") return {ride:true, rid:null, name:destName(r), date:Date.now(), mins:Math.max(1, Math.round(secs/60)), km:R.dist/1000,
    avg:Math.round(R.dist/secs*3.6), max:Math.round(R.maxV*3.6), climb: r.elev ? r.elev.climb : null, score:100};
  const stops = Object.values(R.stopMin), rolled = stops.filter(s => s.v >= 1.0);
  // Faults graded like the RSA sheet: 1 = minor, 2 = serious, 3 = dangerous. Each has a type (for "4 of the same")
  // and a heading (for "6 under one heading").
  const F = [], add = (k, g, h, e) => F.push({k, g, h, ...e});
  R.speeding.forEach(e => { const over = e.v - e.l; add("speed", (e.l <= 60 ? over > 10 : over > 15) ? 3 : 2, "speed", e); });
  rolled.forEach(s => add("roll", s.v*3.6 >= 5 ? 3 : 2, "junction", {lat:s.lat, lon:s.lon, v:Math.round(s.v*3.6)}));
  R.brakes.forEach(e => add("brake", 2, "control", e));
  R.corners.forEach(e => add("corner", 2, "control", e));
  R.acc.forEach(e => add("accel", 1, "control", e));
  Object.entries(R.turnV).forEach(([i,v]) => { const st=r.steps[i]; if(v*3.6 > 30) add("turn", 2, "junction", {v:Math.round(v*3.6), lat:st && pointAt(r,st.along).lat, lon:st && pointAt(r,st.along).lon, dir: /left/.test(st.mod) ? "left" : "right"}); });
  Object.entries(R.rbV).forEach(([i,v]) => { if(v*3.6 > 35){ const p=pointAt(r, r.steps[i].along); add("rb", 2, "junction", {v:Math.round(v*3.6), lat:p.lat, lon:p.lon}); } });
  Object.entries(R.bumpV).forEach(([i,v]) => { const h=(r.hz||[])[i]; if(v*3.6 > 25) add("bump", 1, "speed", {v:Math.round(v*3.6), lat:h&&h.lat, lon:h&&h.lon}); });
  R.slow.forEach(e => add("progress", 1, "speed", e));
  if(!r.isDest && r.mv) r.steps.forEach((st,i) => { if(st.mv && st.along < S.progress - 30 && (R.mvMin[i] ?? 99) > 0.6) add("mv", 1, "manoeuvre", {m:t("mv_"+st.mvType)}); });
  for(let i=0;i<R.missedTurns;i++) add("route", 1, "route", {});
  if(S.ex) S.ex.filter(x => x.state==="skip").forEach(() => add("pull", 2, "route", {}));
  const g2 = F.filter(x => x.g===2), g3 = F.filter(x => x.g===3);
  const byType = {}, byHead = {}; g2.forEach(x => { byType[x.k]=(byType[x.k]||0)+1; byHead[x.h]=(byHead[x.h]||0)+1; });
  let fail = null;
  if(g3.length) fail = "g3";
  else if(Object.values(byType).some(n => n>=4)) fail = "same4";
  else if(Object.values(byHead).some(n => n>=6)) fail = "head6";
  else if(g2.length >= 9) fail = "total9";
  const n1 = F.filter(x => x.g===1).length;
  let score = 100 - 2*n1 - 7*g2.length - 30*g3.length;
  const smooth = R.smoothN+R.roughN > 20 ? Math.round(100*R.smoothN/(R.smoothN+R.roughN)) : null;
  if(smooth!=null && smooth < 85) score -= Math.round((85-smooth)/3);           // jerky overall
  score = Math.max(0, Math.min(100, score));
  if(fail) score = Math.min(score, 59);
  const prev = r.isDest ? null : reports.find(x => x.rid===r.id);
  const pulls = S.ex ? [S.ex.filter(x => x.ok).length, S.ex.length] : null;
  return {rid: r.isDest ? null : r.id, name: r.isDest ? destName(r) : routeName(r), date: Date.now(), mins: Math.max(1, Math.round(secs/60)),
    km: R.dist/1000, avg: Math.round(R.dist/secs*3.6), max: Math.round(R.maxV*3.6), sp: R.speeding.length, br: R.brakes.length,
    st: [stops.length-rolled.length, stops.length], pull: pulls, events: F, faults:[n1, g2.length, g3.length], fail, smooth, prev: prev ? prev.score : null, v:2, score};
}
function showReport(rep){
  if(rep.ride){
    const stat = (l, v) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
    $("report").dataset.g = "a"; $("rArc").style.strokeDasharray = `276.5 400`;
    $("rScore").textContent = num(rep.km, rep.km < 10 ? 1 : 0); $("rGrade").textContent = t("rideDone");
    $("rSub").textContent = `${rep.name} · ${dayFmt(rep.date)} ${hhmm(rep.date)}`;
    $("rStats").innerHTML = stat(t("rep_time"), `${rep.mins} min`) + stat(t("rep_dist"), `${num(rep.km,1)} km`) + stat(t("rep_avg"), `${rep.avg} km/h`) + stat(t("rep_max"), `${rep.max} km/h`) + (rep.climb!=null ? stat(t("rep_climb"), `${rep.climb} m`) : "");
    $("rEvents").innerHTML = ""; $("rVerdict").hidden = true; $("report").classList.add("ride"); document.querySelector("#report .kicker").textContent = t("rideTitle"); $("report").hidden = false; return;
  }
  $("report").classList.remove("ride"); document.querySelector("#report .kicker").textContent = t("rep_title");
  const g=grade(rep.score), C=276.5;
  $("rArc").style.strokeDasharray = `${C*rep.score/100} 400`;
  $("report").dataset.g = g;
  $("rScore").textContent = rep.score;
  $("rGrade").textContent = t("grade_"+g);
  $("rSub").textContent = `${rep.name} · ${dayFmt(rep.date)} ${hhmm(rep.date)}`;
  const stat = (l, v) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  if(rep.v===2){
    const trend = rep.prev!=null ? rep.score - rep.prev : null;
    $("rSub").innerHTML = `${esc(rep.name)} · ${dayFmt(rep.date)} ${hhmm(rep.date)}` + (trend!=null ? ` · <b class="${trend>=0?"up":"down"}">${trend>=0?"▲ +":"▼ "}${trend} ${esc(t("rep_vsLast"))}</b>` : "");
    $("rVerdict").hidden = false;
    $("rVerdict").className = "verdict " + (rep.fail ? "fail" : "pass");
    $("rVerdict").innerHTML = `${ico(rep.fail ? "stop" : "check")}<span><b>${esc(t(rep.fail ? "rep_fail" : "rep_pass"))}</b><small>${esc(rep.fail ? t("fail_"+rep.fail) : t("rep_passWhy"))}</small></span>`;
    $("rStats").innerHTML = stat(t("g1"), rep.faults[0]) + stat(t("g2"), rep.faults[1]) + stat(t("g3"), rep.faults[2]) + (rep.smooth!=null ? stat(t("rep_smooth"), rep.smooth+"%") : "")
      + stat(t("rep_time"), `${rep.mins} min`) + stat(t("rep_dist"), `${num(rep.km,1)} km`) + stat(t("rep_avg"), `${rep.avg} km/h`) + stat(t("rep_max"), `${rep.max} km/h`)
      + (rep.st[1] ? stat(t("rep_stops"), `${rep.st[0]}/${rep.st[1]}`) : "") + (rep.pull && rep.pull[1] ? stat(t("rep_pull"), `${rep.pull[0]}/${rep.pull[1]}`) : "");
    const IC2 = {speed:"speed", roll:"stop", brake:"give_way", corner:"route", accel:"descend", turn:"arrow", rb:"rb", bump:"bump", progress:"clock", mv:"uturn", route:"pin", pull:"stop"};
    // the same fault several times shows once, with how often and the worst speed
    const groups = [];
    rep.events.forEach(e => { const key = e.k+"|"+e.g+"|"+(e.l||"")+"|"+(e.dir||"")+"|"+(e.m||""); let gp = groups.find(x => x.key===key);
      if(!gp){ gp = {key, e:{...e}, n:0}; groups.push(gp); } gp.n++; if(e.v!=null && e.v > (gp.e.v||0)) gp.e.v = e.v; });
    groups.sort((a,b) => b.e.g-a.e.g || b.n-a.n);
    $("rEvents").innerHTML = groups.length ? groups.map(({e,n}) => `<div class="ev ev-g${e.g}">${ico(IC2[e.k]||"pin")}<span>${esc(t("ev2_"+e.k, {...e, dir: e.dir ? t("dir_"+e.dir) : ""}))}${n>1 ? ` <b class="evn">×${n}</b>` : ""}</span><em>${esc(t("gShort",{g:e.g}))}</em></div>`).join("")
      : `<div class="ev ev-ok">${ico("check")}<span>${t("ev_none2")}</span></div>`;
  } else {
  $("rVerdict").hidden = true;
  $("rStats").innerHTML = stat(t("rep_time"), `${rep.mins} min`) + stat(t("rep_dist"), `${num(rep.km,1)} km`) + stat(t("rep_avg"), `${rep.avg} km/h`) +
    stat(t("rep_max"), `${rep.max} km/h`) + stat(t("rep_speeding"), rep.sp) + stat(t("rep_brakes"), rep.br) + (rep.st[1] ? stat(t("rep_stops"), `${rep.st[0]}/${rep.st[1]}`) : "") + (rep.pull && rep.pull[1] ? stat(t("rep_pull"), `${rep.pull[0]}/${rep.pull[1]}`) : "");
  $("rEvents").innerHTML = rep.events.length ? rep.events.map(e => `<div class="ev ev-${e.k}">${ico(e.k==="roll"?"stop":e.k==="speed"?"speed":"bump")}<span>${esc(
      e.k==="speed" ? t("ev_speed",{v:e.v, l:e.l}) : e.k==="brake" ? t("ev_brake",{v:e.v}) : t("ev_roll",{v:e.v}))}</span></div>`).join("")
    : `<div class="ev ev-ok">${ico("check")}<span>${t("ev_none")}</span></div>`;
  }
  $("report").hidden = false;
}
$("rClose").onclick = () => { $("report").hidden = true; };
$("report").addEventListener("click", e => { if(e.target.id==="report") $("report").hidden = true; });   // tap outside to close
function drawTrack(track, rep){
  if(!track || track.length<2) return;
  let run=[track[0]], flag=track[0][2];
  const flush = () => { if(run.length>1) L.polyline(run.map(p => [p[0],p[1]]), {color: flag ? "#ff4f6d" : "#33e3a1", weight:4, opacity:.95}).addTo(markLayer); };
  for(let i=1;i<track.length;i++){ run.push(track[i]); if(track[i][2]!==flag){ flush(); run=[track[i]]; flag=track[i][2]; } }
  flush();
  (rep && rep.events || []).filter(e => e.lat!=null && e.lon!=null).forEach(e => L.circleMarker([e.lat,e.lon], {radius:7, color:"#05080f", weight:2,
    fillColor: e.g===3 || e.k==="speed" || e.k==="roll" ? "#ff4f6d" : e.g===1 ? "#33e3a1" : "#ffb547", fillOpacity:1}).addTo(markLayer));
}

// =====================================================================
// Commute rain check: radar of the last 2 hours + 15-minute rain forecast along Home <-> Work
// =====================================================================
var rc = {map:null, base:null, marks:null, layers:[], frames:[], idx:0, timer:null, at:0, key:"", data:null, ready:false, busy:false};
function commute(){
  if(!places.home || !places.work) return null;
  const H=places.home, W=places.work;
  const nearWork = here && freshHere() ? hav(here.lat,here.lon,W.lat,W.lon) < hav(here.lat,here.lon,H.lat,H.lon) : new Date().getHours() >= 12;
  const from = nearWork ? W : H, to = nearWork ? H : W;
  return {from, to, toHome:nearWork, secs: hav(from.lat,from.lon,to.lat,to.lon)*1.3/bikeMs()};
}
async function rainForecast(c){
  const mid={lat:(c.from.lat+c.to.lat)/2, lon:(c.from.lon+c.to.lon)/2}, pts=[c.from, mid, c.to];
  const res = await fetchT(`https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p => (+p.lat).toFixed(3)).join(",")}&longitude=${pts.map(p => (+p.lon).toFixed(3)).join(",")}&minutely_15=precipitation&hourly=precipitation_probability&forecast_minutely_15=16&forecast_hours=4&timezone=auto`, {}, 9000);
  if(!res.ok) throw new Error("forecast "+res.status);
  let j = await res.json(); if(!Array.isArray(j)) j=[j];
  const now=Date.now(), slots=new Map(); let prob=0;
  j.forEach(loc => {
    const off=(loc.utc_offset_seconds||0)*1000, m=loc.minutely_15||{}, h=loc.hourly||{};
    (m.time||[]).forEach((tm,i) => {
      const ts=Date.parse(tm+"Z")-off; if(ts < now-15*60000 || ts > now+3*3600000) return;
      const k=Math.round(ts/900000), s=slots.get(k) || {t:ts, mm:0}; s.mm=Math.max(s.mm, (m.precipitation||[])[i]||0); slots.set(k, s);
    });
    (h.time||[]).forEach((tm,i) => { const ts=Date.parse(tm+"Z")-off; if(ts >= now-3600000 && ts <= now+3*3600000) prob=Math.max(prob, (h.precipitation_probability||[])[i]||0); });
  });
  return {slots:[...slots.values()].sort((a,b) => a.t-b.t).slice(0,12), prob, at:now};
}
function rainVerdict(d, c){
  const wet = s => s.mm >= 0.1, sl=d.slots;
  if(!sl.length) return {cls:"", text:t("rc_fail")};
  if(wet(sl[0])){
    const dry = sl.findIndex((s,i) => i>0 && !wet(s) && (!sl[i+1] || !wet(sl[i+1])));
    return {cls:"wet", text: t("rc_now") + " " + (dry>0 ? t("rc_dryFrom",{t:hhmm(sl[dry].t)}) : t("rc_noDry"))};
  }
  const first = sl.find(wet), rideEnd = Date.now() + c.secs*1000 + 10*60000;
  if(first && first.t <= rideEnd) return {cls:"wet", text:t("rc_ride",{t:hhmm(first.t)})};
  if(first) return {cls:"soon", text:t("rc_later",{t:hhmm(first.t)})};
  if(d.prob >= 50) return {cls:"soon", text:t("rc_showers",{p:d.prob})};
  return {cls:"dry", text:t("rc_dry")};
}
async function radarFrames(){
  const j = await (await fetchT("https://api.rainviewer.com/public/weather-maps.json", {}, 8000)).json();
  return ((j.radar && j.radar.past) || []).map(f => ({time:f.time*1000, url:`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`}));
}
function rainMapSetup(c){
  if(!rc.map){
    rc.map = L.map("rainMap", {zoomControl:false, attributionControl:true, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, keyboard:false});
    rc.map.attributionControl.setPrefix(false);
    rc.base = baseTiles().addTo(rc.map); rc.marks = L.layerGroup().addTo(rc.map);
  }
  rc.map.invalidateSize();
  rc.marks.clearLayers();
  const a=[c.from.lat,c.from.lon], b=[c.to.lat,c.to.lon], dot = (p, cls, label) => L.marker(p, {keyboard:false, interactive:false, icon:L.divIcon({className:"", iconSize:[26,26], iconAnchor:[13,13], html:`<div class="rcdot ${cls}">${ico(label)}</div>`})}).addTo(rc.marks);
  L.polyline([a,b], {color:"#33e3a1", weight:3, dashArray:"2 7", lineCap:"round"}).addTo(rc.marks);
  dot(a, "from", c.toHome ? "work" : "home"); dot(b, "to", c.toHome ? "home" : "work");
  rc.map.fitBounds(L.latLngBounds([a,b]).pad(1.6), {maxZoom:11});
}
function radarTick(){
  clearTimeout(rc.timer);
  const n=rc.layers.length; if(!n) return;
  const visible = tab==="go" && !S && !$("rainBox").hidden && !$("sheet").classList.contains("collapsed") && document.visibilityState==="visible";
  if(visible){
    rc.layers[rc.idx].setOpacity(0); rc.idx=(rc.idx+1)%n; rc.layers[rc.idx].setOpacity(.8);
    const f=rc.frames[rc.idx], ago=Math.round((Date.now()-f.time)/60000);
    $("rcTime").textContent = `${hhmm(f.time)} · ${ago<=5 ? t("rc_live") : t("rc_ago",{m:ago})}`;
    $("rcTime").classList.toggle("live", rc.idx===n-1);
  }
  rc.timer = setTimeout(radarTick, !visible ? 3000 : rc.idx===n-1 ? 1800 : 380);
}
async function loadRadar(){
  try{
    const frames = await radarFrames(); if(!frames.length) return;
    rc.layers.forEach(l => l.remove());
    rc.frames = frames;
    rc.layers = frames.map((f,i) => L.tileLayer(f.url, {maxNativeZoom:7, maxZoom:14, opacity: i===frames.length-1 ? .8 : 0, zIndex:5,
      attribution: i===0 ? 'Radar © <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a>' : ""}).addTo(rc.map));
    rc.idx = frames.length-1; radarTick();
  }catch(e){ $("rcTime").textContent = t("rc_radarFail"); }
}
function renderBars(d, c){
  if(!d || !d.slots.length){ $("rcBars").innerHTML=""; return; }
  const rideEnd = Date.now() + c.secs*1000;
  $("rcBars").innerHTML = `<div class="bwrap">${d.slots.map(s => {
      const h = s.mm<0.05 ? 3 : Math.min(100, 18 + s.mm/1.2*82), ride = s.t <= rideEnd + 5*60000;
      return `<i class="${s.mm>=0.1?"w":""} ${ride?"ride":""}" style="height:${h.toFixed(0)}%" title="${hhmm(s.t)} · ${s.mm.toFixed(1)} mm"></i>`; }).join("")}</div>
    <div class="blabels">${d.slots.filter((_,i) => i%4===0).map(s => `<span>${hhmm(s.t)}</span>`).join("")}<span></span></div>`;
}
async function renderRain(force){
  const c = commute(), box=$("rainBox");
  if(!c){ box.hidden=false; box.classList.add("setup"); $("rcTitle").textContent=t("rc_title"); $("rcVerdict").textContent=t("rc_setup"); $("rcBars").innerHTML=""; $("rcRide").hidden=true; return; }
  box.hidden=false; box.classList.remove("setup"); $("rcRide").hidden=false;
  $("rcTitle").textContent = t(c.toHome ? "rc_title" : "rc_title_work");
  $("rcRide").innerHTML = `${ico("bike")}${t(c.toHome ? "rc_rideHome" : "rc_rideWork")}`;
  const key = `${c.from.lat},${c.from.lon}>${c.to.lat},${c.to.lon}`;
  requestAnimationFrame(() => { rainMapSetup(c); });
  if(!rc.ready){ rc.ready=true; setTimeout(loadRadar, 60); setInterval(() => { if(tab==="go" && !S){ loadRadar(); renderRain(true); } }, 10*60000); }
  if(!force && rc.key===key && rc.data && Date.now()-rc.data.at < 10*60000){ showRain(c); return; }
  if(rc.busy) return; rc.busy=true; rc.key=key;
  if(!rc.data){ $("rcVerdict").textContent=t("rc_loading"); }
  try{ rc.data = await rainForecast(c); showRain(c); }
  catch(e){ $("rcVerdict").textContent=t("rc_fail"); $("rainBox").className="rain"; }
  finally{ rc.busy=false; }
}
function showRain(c){
  const v = rainVerdict(rc.data, c);
  $("rainBox").className = "rain " + v.cls;
  $("rcVerdict").textContent = v.text;
  renderBars(rc.data, c);
  $("rcFoot").textContent = t("rc_updated", {t:hhmm(rc.data.at)});
}
$("rcRide").onclick = () => { const c=commute(); if(!c) return; travelMode="bike"; store.set("ttr-mode","bike"); openPlace(c.to, c.toHome ? "home" : "work"); };

// =====================================================================
// Language
// =====================================================================
function applyLang(){
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach(el => el.textContent = t(el.dataset.t));
  document.querySelectorAll("[data-th]").forEach(el => el.innerHTML = t(el.dataset.th));
  document.querySelectorAll("#langSeg [data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang===lang)));
  $("addr").placeholder = t("search_ph");
  ROUTES.forEach(r => { if(r.raw) applyOsrm(r, r.raw); else if(r.ok===false) fallbackRoute(r); });
  if(dest && dest.raw && !S) applyOsrm(dest, dest.raw);
  renderCats(); renderNear(); renderPlaces(); renderRecent(); renderExplore(); renderRoutes(); renderReports(); renderPrep(); renderSwitches(); setVoiceBtn(); pickVoice();
  renderDestCard(); renderPt(); renderKey(); renderWx(); renderBikeSpeed();
  if(rc.ready) renderRain();
  if(S) updateStats();
  if(window.renderTheoryEntry) renderTheoryEntry();
}

// =====================================================================
// Boot
// =====================================================================
const APP_V = 17;
// Shows which version is running, and reports script errors on screen so problems on the phone are visible.
$("appVer").textContent = "Drive Ireland · v" + APP_V;
window.addEventListener("error", e => { if(/\/(app|data|theory)\.js/.test(e.filename||"")) toast("Error: " + (e.message||"") + " (" + (e.filename||"").split("/").pop().split("?")[0] + ":" + e.lineno + ")", 8000); });
(async function boot(){
  practice = ROUTES.find(r => r.id===store.get("ttr-last", 1)) || ROUTES[0];
  applyMapStyle(); applyLang(); placeFabs(); applyCamLayer(); applyTraffic(); drawCar();
  let tb = store.get("ttr-tab", "go"); if(tb==="practice") tb="test"; if(!["go","explore","test","more"].includes(tb)) tb="go";
  showTab(tb);
  try{
    const st = navigator.permissions && await navigator.permissions.query({name:"geolocation"});
    if(st && st.state==="granted") locate(h => { if(h){ renderExplore(); if(tab==="go" && !dest) map.setView([h.lat,h.lon], 14); } }, true);
  }catch(e){}
  if(practice && practice.centre!==centre){ centre = practice.centre; store.set("ttr-centre", centre); }
  await loadCentre(centre);
})();
// Load the routes of one test centre (only when you look at it, to keep data use down).
var centreLoaded = {};
async function loadCentre(cid){
  if(centreLoaded[cid]) return centreLoaded[cid];
  return centreLoaded[cid] = (async () => {
    const list = ROUTES.filter(r => r.centre===cid);
    let failed=0;
    for(const r of list){
      if(r.pts) continue;
      try{ await loadRoute(r); r.buildFail=false; }
      catch(e){ failed++; if(r.recipe && !(r.stops && r.stops.length)){ r.buildFail=true; r.buildErr=String(e.message||e); } else fallbackRoute(r); }
      renderRoutes();
      if(r===practice && tab==="test" && !S && r.pts) drawRoute(r);
    }
    if(cid===centre) $("loadState").textContent = failed ? t("someOffline") : "";
    if(failed) centreLoaded[cid] = null;                       // try again next time
    if(practice && practice.centre===cid) await routeData(practice);
  })();
}
// Hazards and speed limits for one route: loaded when you pick it (not all at once).
async function routeData(r){
  if(!r || !r.pts || r.dataBusy) return;
  r.dataBusy = true;
  try{
    if(r.intel!=="ok"){ await loadIntel(r, r.id+"-"+Math.round(r.total)); if(r===practice){ renderIntel(); if(tab==="test" && !S) drawRoute(r, false); } }
    if(r.ttlState!=="ok"){ await loadRouteLimits(r, r.id+"-"+Math.round(r.total)); if(r===practice) renderIntel(); }
  } finally { r.dataBusy = false; }
}
$("centreSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-centre]"); if(!b || b.dataset.centre===centre) return;
  centre = b.dataset.centre; store.set("ttr-centre", centre);
  practice = ROUTES.find(r => r.centre===centre); store.set("ttr-last", practice.id);
  renderRoutes(); refreshMap();
  if(practice.pts) drawRoute(practice); else fitTo(L.latLngBounds([[CENTRES[centre].bbox[0],CENTRES[centre].bbox[1]],[CENTRES[centre].bbox[2],CENTRES[centre].bbox[3]]]), 14);
  loadCentre(centre);
});
