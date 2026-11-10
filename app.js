"use strict";
// =====================================================================
// Drive Ireland: app logic (needs data.js and Leaflet loaded first)
// =====================================================================
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const settings = Object.assign({mapStyle:"dark", limits:true, limitVoice:true, speedWarn:true, camAlerts:true, hzAlerts:true, camLayer:true, traffic:true, ttKey:"",
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
    seg=r.seg; route.steps.push({...ins, along:r.along});
  }));
  seg=0;
  route.stopAlong=(osrm.waypoints||[]).map(w => { const r=nearest(route, pxy(route.o,w.location[1],w.location[0]), seg, route.pts.length, 3); seg=r.seg; return r.along; });
}

// =====================================================================
// Network services
// =====================================================================
async function osrmFetch(coords, signal){
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`, {signal});
  if(!res.ok) throw new Error("routing "+res.status);
  const j = await res.json();
  if(j.code!=="Ok" || !j.routes || !j.routes.length) throw new Error(j.code||"no route");
  return {route:j.routes[0], waypoints:j.waypoints};
}
function applyOsrm(route, data){
  route.raw = data;
  buildGeom(route, data.route.geometry.coordinates);
  prepareSteps(route, {legs:data.route.legs, waypoints:data.waypoints});
  route.duration = data.route.duration;
  route.ok = true;
  if(route.isDest) finalizeDest(route);
}
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
async function overpass(q, signal){
  let lastErr;
  for(const ep of OVERPASS){
    try{
      const res = await fetch(ep, {method:"POST", body:"data="+encodeURIComponent(q), headers:{"Content-Type":"application/x-www-form-urlencoded"}, signal});
      if(res.ok) return await res.json();
      lastErr = new Error("overpass "+res.status);
    }catch(e){ if(e.name==="AbortError") throw e; lastErr=e; }
  }
  throw lastErr || new Error("overpass");
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
async function searchPlaces(q, signal){
  const c = biasPoint();
  try{
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${c.lat}&lon=${c.lon}&bbox=${IE_BBOX}`, {signal});
    if(!res.ok) throw new Error("photon "+res.status);
    return ((await res.json()).features||[]).map(photonPlace);
  }catch(e){
    if(e.name==="AbortError") throw e;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=ie,gb&viewbox=-10.8,55.5,-5.3,51.3&q=${encodeURIComponent(q)}`, {signal, headers:{"Accept-Language":"en"}});
    return (await res.json()).map(x => { const parts=x.display_name.split(", "); return {lat:+x.lat, lon:+x.lon, label:parts[0], sub:parts.slice(1,4).join(", ")}; });
  }
}
async function reverseLabel(lat, lon){
  try{ const j = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en&limit=1`)).json(); const f=(j.features||[])[0]; return f ? photonPlace(f) : null; }
  catch(e){ return null; }
}

// ---------- Live traffic (TomTom; needs the user's own free key) ----------
const ttKey = () => (settings.ttKey||"").trim();
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
const map = L.map("map", {zoomControl:false, attributionControl:true}).setView(TC, 14);
map.attributionControl.setPrefix(false);
let baseLayer=null;
function applyMapStyle(){
  if(baseLayer) baseLayer.remove();
  const st = settings.mapStyle;
  const carto = s => L.tileLayer(`https://{s}.basemaps.cartocdn.com/${s}/{z}/{x}/{y}{r}.png`, {maxZoom:20, subdomains:"abcd",
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>'});
  baseLayer = st==="sat"
    ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom:19, maxNativeZoom:18, attribution:"Imagery © Esri"})
    : carto(st==="light" ? "rastertiles/voyager" : "dark_all");
  baseLayer.addTo(map);
  document.body.dataset.map = st;
  document.querySelectorAll("#mapStyle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.style===st)));
}
let routeLayer=null, doneLayer=null, stopMarkers=[], meMarker=null, hereMarker=null;
const markLayer = L.layerGroup().addTo(map), poiLayer = L.layerGroup().addTo(map), camLayer = L.layerGroup();
const sheetH = () => $("sheet").offsetHeight;
function fitTo(bounds, maxZoom=16){ if(bounds && bounds.isValid()) map.fitBounds(bounds, {paddingTopLeft:[30,50], paddingBottomRight:[30, sheetH()+20], maxZoom}); }
function placeFabs(){ const b=`calc(${sheetH()}px + 14px)`; $("fabs").style.bottom=b; $("dial").style.bottom=b; $("recenter").style.bottom=b; }
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
    const label = first ? "START" : last ? "END" : String(i);
    const icon = L.divIcon({className:"", iconSize:[30,30], iconAnchor:[15,15], html:`<div class="stopmk ${first||last?"home":""}" style="--c:${route.color}">${label}</div>`});
    stopMarkers.push(L.marker([s[0],s[1]], {icon, keyboard:false}).bindPopup(esc(stopLabel(s[2]))).addTo(markLayer));
  });
  (route.hz||[]).forEach(h => { if(h.type!=="school") hzMarker(h).addTo(markLayer); });
  if(fit) fitTo(routeLayer.getLayers()[2].getBounds());
}
function meIcon(heading){
  return L.divIcon({className:"me", iconSize:[30,30], iconAnchor:[15,15], html: heading==null
    ? `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#38e1ff" opacity=".18"/><circle cx="15" cy="15" r="7" fill="#38e1ff" stroke="#fff" stroke-width="2.5"/></svg>`
    : `<svg viewBox="0 0 30 30" style="transform:rotate(${heading}deg)"><circle cx="15" cy="15" r="14" fill="#38e1ff" opacity=".16"/><path d="M15 3 24 25 15 20 6 25z" fill="#38e1ff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`});
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
}
$("tabs").addEventListener("click", e => { const b=e.target.closest("[data-tab]"); if(b) showTab(b.dataset.tab); });
$("grab").onclick = () => $("sheet").classList.toggle("collapsed");
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
const slim = p => ({lat:p.lat, lon:p.lon, label:p.label, sub:p.sub||"", kind:p.kind||"", hours:p.hours, phone:p.phone, web:p.web, ex:p.ex, cat:p.cat});
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
  favs.forEach((f,i) => chips.push(`<button class="chip" type="button" data-fav="${i}">${ico("star")}${esc(f.label)}</button>`));
  $("places").innerHTML = chips.join(""); $("places").hidden = !chips.length;
  renderSaved();
}
$("places").addEventListener("click", e => {
  const q=e.target.closest("[data-q]"), f=e.target.closest("[data-fav]");
  if(q) openPlace(places[q.dataset.q], q.dataset.q); else if(f) openPlace(favs[+f.dataset.fav]);
});
function itemHtml(p, attrs, icon){
  const d = distFromHere(p), v = view(p);
  return `<button class="item" type="button" ${attrs}><span class="ico">${ico(icon||"pin")}</span>
    <span class="meta"><b>${esc(v.label)}</b><small>${esc(v.sub||v.kind||"")}</small></span>${d!=null?`<span class="far">${fmtDist(d)}</span>`:""}</button>`;
}

// Search with suggestions
let acCtl=null, acTimer=null, lastResults=[];
async function runSearch(q){
  if(acCtl) acCtl.abort(); acCtl = new AbortController();
  const box=$("results"); box.hidden=false;
  if(!lastResults.length) box.innerHTML = `<div class="empty">${t("searching")}</div>`;
  try{
    lastResults = await searchPlaces(q, acCtl.signal);
    box.innerHTML = lastResults.length ? lastResults.map((p,i) => itemHtml(p, `data-i="${i}"`)).join("") : `<div class="empty">${t("noFound")}</div>`;
  }catch(e){ if(e.name!=="AbortError") box.innerHTML = `<div class="empty">${t("searchFail")}</div>`; }
}
$("addr").addEventListener("input", () => {
  const q=$("addr").value.trim(); $("clearAddr").hidden=!q; clearTimeout(acTimer);
  if(q.length<3){ $("results").hidden=true; lastResults=[]; return; }
  acTimer=setTimeout(() => runSearch(q), 350);
});
$("addr").addEventListener("focus", () => $("sheet").classList.remove("collapsed"));
$("searchForm").addEventListener("submit", e => { e.preventDefault(); const q=$("addr").value.trim(); if(q){ clearTimeout(acTimer); $("addr").blur(); runSearch(q); } });
$("clearAddr").onclick = () => { $("addr").value=""; $("clearAddr").hidden=true; $("results").hidden=true; lastResults=[]; $("addr").focus(); };
$("results").addEventListener("click", e => { const b=e.target.closest("[data-i]"); if(b){ openPlace(lastResults[+b.dataset.i]); $("addr").value=""; $("clearAddr").hidden=true; $("results").hidden=true; } });

// Place card
let travelMode = store.get("ttr-mode", "car");
const destName = d => d.nameKey ? t(d.nameKey) : d.isPin ? t("pin") : d.dest.label;
function openPlace(p, nameKey, isPin){
  if(!p) return;
  const place = slim(p);
  dest = {id:"dest", isDest:true, nameKey, isPin:!!isPin, color:"#38e1ff", dest:place, stops:[]};
  if(tab!=="go") showTab("go");
  $("sheet").classList.remove("collapsed");
  ptData=null; ptSel=0; dest.photos=null;
  renderDestCard();
  if(!isPin) addRecent(place);
  clearRoute(); destMarker(place);
  map.setView([place.lat, place.lon], Math.max(map.getZoom(), 14));
  $("panes").scrollTop = 0;
  if(travelMode==="pt") ptSearch(); else previewRoute();
  const r = dest; $("destHero").className = "hero loading";
  photosFor(place).then(ph => { if(dest===r){ r.photos=ph; renderPhotos(); } });
}
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
  if(p.hours) info.push(`<div><span>${t("hours")}</span><em>${esc(p.hours)}</em></div>`);
  if(p.phone) info.push(`<div><span>${t("phone")}</span><a href="tel:${esc(p.phone.replace(/[^\d+]/g,""))}">${esc(p.phone)}</a></div>`);
  const w = p.web && safeUrl(p.web);
  if(w) info.push(`<div><span>${t("web")}</span><a href="${esc(w)}" target="_blank" rel="noopener">${esc(hostOf(w))}</a></div>`);
  if(info.length) parts.push(`<div class="info">${info.join("")}</div>`);
  $("destBody").innerHTML = parts.join("");
  const isFav = favs.some(f => samePlace(f,p));
  $("favBtn").innerHTML = `${ico("star")}${isFav?t("savedBtn"):t("save")}`; $("favBtn").classList.toggle("on", isFav);
  renderMode(); renderEta(); renderPhotos();
  $("destCard").hidden = false;
}
function renderMode(){
  document.querySelectorAll("#modeSeg [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode===travelMode)));
  $("carBox").hidden = travelMode!=="car"; $("ptBox").hidden = travelMode!=="pt";
  if(dest) $("gmaps").href = `https://www.google.com/maps/dir/?api=1&destination=${dest.dest.lat},${dest.dest.lon}&travelmode=${travelMode==="pt"?"transit":"driving"}`;
}
function setEta(key, v){ if(dest){ dest.eta = {key, v}; renderEta(); } }
function renderEta(){
  const e = dest && dest.eta, el=$("destEta");
  if(!e){ el.className="eta wait"; el.textContent=""; return; }
  el.className = e.key==="etaDrive" ? "eta" : "eta wait";
  const tr = e.v && e.v.delay!=null ? (e.v.delay >= 60 ? `<em class="tdelay bad">${esc(t("delayMin",{m:Math.round(e.v.delay/60)}))}</em>` : `<em class="tdelay">${esc(t("noDelay"))}</em>`) : "";
  el.innerHTML = e.key==="etaDrive" ? `${ico("car")}<b>${esc(fmtDur(e.v.s))}</b><span>${esc(fmtDist(e.v.m))}</span>${tr}` : esc(t(e.key));
  renderInc();
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
      const data = await osrmFetch(`${h.lon},${h.lat};${r.dest.lon},${r.dest.lat}`, previewCtl.signal);
      if(dest!==r) return;
      applyOsrm(r, data);
      setEta("etaDrive", {s:r.duration, m:r.total});
      if(tab==="go" && !S && travelMode==="car"){ drawRoute(r, false); fitTo(routeLayer.getLayers()[2].getBounds(), 15); }
      if(ttKey()){
        ttRoute(h, r.dest).then(tr => { if(dest===r){ r.duration = tr.secs; setEta("etaDrive", {s:tr.secs, m:r.total, delay:tr.delay}); } }).catch(() => {});
        ttIncidents(r).then(list => { if(dest===r){ r.incidents = list; renderInc(); } }).catch(() => {});
      }
    }catch(e){ if(e.name!=="AbortError" && dest===r) setEta("routeErr"); }
  });
}
function finalizeDest(r){ const last = r.steps[r.steps.length-1]; if(last && last.icon==="flag") last.text = r.isPin ? t("arrPin") : t("arrAt", {n:destName(r)}); }
$("destClose").onclick = () => { dest=null; ptData=null; $("destCard").hidden=true; if(previewCtl) previewCtl.abort(); if(ptCtl) ptCtl.abort(); refreshMap(); };
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
  if(travelMode==="pt") ptSearch(); else if(dest.pts) refreshMap(); else previewRoute();
});
map.on("contextmenu", async e => {
  if(S) return;
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
    kind:t("one_"+cat.k), hours:tg.opening_hours, phone:tg.phone||tg["contact:phone"], web:tg.website||tg["contact:website"], ic:cat.ic, cat:cat.k};
}
function renderNear(){
  if(!nearCat) return;
  if(!nearMeta){ $("nearTitle").textContent = t("nearSearching", {c:t("cat_"+nearCat.k)}); return; }
  if(nearMeta.err){ $("nearTitle").textContent = t("cat_"+nearCat.k); $("nearList").innerHTML = `<div class="empty">${t("nearFail")}</div>`; return; }
  $("nearTitle").textContent = t("nearWithin", {c:t("cat_"+nearCat.k), r:num(nearMeta.radius, nearMeta.radius%1?1:0)}) + (nearMeta.fromHere ? "" : t("nearMapCentre"));
  $("nearList").innerHTML = nearResults.length
    ? nearResults.map((p,i) => `<button class="item" type="button" data-n="${i}"><span class="ico">${ico(p.ic)}</span>
        <span class="meta"><b>${esc(p.label)}</b><small>${esc(p.hours ? p.hours : p.sub)}</small></span><span class="far">${fmtDist(p.d)}</span></button>`).join("")
    : `<div class="empty">${t("nearNone")}</div>`;
}
async function nearby(cat){
  nearCat = cat; nearMeta = null; renderCats();
  $("nearWrap").hidden=false; $("nearList").innerHTML=""; renderNear();
  if(nearCtl) nearCtl.abort(); nearCtl = new AbortController(); const ctl=nearCtl;
  const c = freshHere() ? here : await new Promise(res => locate(h => res(h || biasPoint()), true));
  const fromHere = !!(here && c===here);
  const ask = R => overpass(`[out:json][timeout:20];(${cat.q.map(f => `nwr${f}(around:${R},${c.lat},${c.lon});`).join("")});out center tags 80;`, ctl.signal);
  try{
    let j = await ask(2500), radius = 2.5;
    if((j.elements||[]).length < 4){ j = await ask(8000); radius = 8; }
    if(ctl!==nearCtl) return;
    nearResults = (j.elements||[]).map(e => osmPlace(e, cat)).filter(p => p.lat!=null).map(p => ({...p, d:hav(c.lat,c.lon,p.lat,p.lon)})).sort((a,b) => a.d-b.d).slice(0,25);
    nearMeta = {radius, fromHere}; renderNear(); drawNearMarkers(true);
  }catch(e){ if(e.name!=="AbortError"){ nearMeta = {err:true}; renderNear(); } }
}
function drawNearMarkers(fit){
  poiLayer.clearLayers(); if(tab!=="go" || !nearResults.length) return;
  const pts=[];
  nearResults.forEach(p => {
    L.marker([p.lat,p.lon], {keyboard:false, icon:L.divIcon({className:"", iconSize:[28,28], iconAnchor:[14,14], html:`<div class="poi">${ico(p.ic)}</div>`})}).on("click", () => openPlace(p)).addTo(poiLayer);
    pts.push([p.lat,p.lon]);
  });
  if(fit){ if(here) pts.push([here.lat,here.lon]); fitTo(L.latLngBounds(pts)); }
}
$("nearList").addEventListener("click", e => { const b=e.target.closest("[data-n]"); if(b) openPlace(nearResults[+b.dataset.n]); });
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
function limitAt(route, along){
  if(!route.lim) return null; let found=null;
  for(const sg of route.lim){ if(sg.from <= along+5) found=sg; else break; }
  return found;
}
const INTEL_V = "ttr-intel-v1-";
async function loadIntel(route, cacheKey){
  if(cacheKey){ const c=store.get(INTEL_V+cacheKey, null); if(c){ route.hz=c.hz; route.lim=c.lim; route.intel="ok"; return; } }
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
    route.hz=data.hz; route.lim=data.lim; route.intel="ok";
    if(cacheKey) store.set(INTEL_V+cacheKey, data);
  }catch(e){ route.intel="fail"; }
}
function intelCounts(r){
  const c = {rb:(r.steps||[]).filter(s => s.icon==="rb").length};
  (r.hz||[]).forEach(h => c[h.type]=(c[h.type]||0)+1);
  if(r.lim && r.lim.length>1) c.lim=r.lim.length-1;
  return c;
}
function intelChips(r){
  const c=intelCounts(r), order=["rb","stop","give_way","signals","crossing","school","bump","camera","lim"];
  const icon = {rb:"rb", lim:"speed"};
  return order.filter(k => c[k]).map(k => `<span class="ichip" style="--c:${HZ_COL[k]||"#38e1ff"}">${ico(icon[k]||k)}${esc(t("cnt_"+k,{n:c[k]}))}</span>`).join("");
}

// =====================================================================
// Test tab: routes, route sheet, drive scores, checklist
// =====================================================================
let practice = null, sheetOpen = false;
const log = store.get("ttr-log", {});
let reports = store.get("ttr-reports", []);
const CACHE_V = "ttr-osrm-v1-";
async function loadRoute(route){
  let data = store.get(CACHE_V+route.id, null);
  if(!data){ data = await osrmFetch(route.stops.map(s => `${s[1]},${s[0]}`).join(";")); store.set(CACHE_V+route.id, data); }
  applyOsrm(route, data);
}
function fallbackRoute(route){
  buildGeom(route, route.stops.map(s => [s[1], s[0]]));
  route.steps = route.stops.slice(1).map((s,i,arr) => ({text: i===arr.length-1 ? t("finish") : t("headTo",{n:i+1, s:stopLabel(s[2])}), icon: i===arr.length-1?"flag":"arrow", deg:0, along: route.cum[i+1]}));
  route.stopAlong = route.stops.map((s,i) => route.cum[i]);
  route.ok = false;
}
const bestScore = id => { const s=reports.filter(r => r.rid===id).map(r => r.score); return s.length ? Math.max(...s) : null; };
function renderRoutes(){
  $("routeList").innerHTML = ROUTES.map(r => {
    const n = (log[r.id]||[]).length, km = r.total ? num(r.total/1000,1)+" km" : "…", best = bestScore(r.id);
    return `<button class="item route ${practice===r?"sel":""}" type="button" data-id="${r.id}" style="--c:${r.color}">
      <span class="badge">${r.id}</span>
      <span class="meta"><b>${esc(routeName(r))}</b><small>${t("stopsN",{n:r.stops.length-2})} · ${km}${r.ok===false?" · "+t("straight"):""} · ${t("drivenN",{n})}</small></span>
      ${best!=null?`<span class="score s-${grade(best)}">${best}</span>`:""}</button>`;
  }).join("");
  $("driveBtn").disabled = $("rehearseBtn").disabled = !(practice && practice.pts);
  renderIntel();
}
function renderIntel(){
  const r=practice, box=$("intel");
  if(!r || !r.pts){ box.innerHTML=""; $("routeSheet").innerHTML=""; return; }
  box.innerHTML = r.intel==="busy" ? `<span class="empty">${t("intelLoading")}</span>` : r.intel==="fail" ? `<span class="empty">${t("intelNone")}</span>` : intelChips(r);
  $("sheetToggle").innerHTML = `${ico("route")}${sheetOpen ? t("hideSheet") : t("showSheet")}`;
  $("routeSheet").hidden = !sheetOpen;
  if(sheetOpen) renderSheet(r);
}
function renderSheet(r){
  const rows = (r.steps||[]).map(s => ({along:s.along, html:`<span class="rsi ${s.icon}">${s.icon==="rb" ? `<b>${s.exit||""}</b>` : s.icon==="flag" ? ico("flag") : `<span style="display:inline-flex;transform:rotate(${s.deg||0}deg)">${ico("arrow")}</span>`}</span><div><b>${esc(s.text)}</b><small>${t("atKm",{d:fmtDist(s.along)})}</small></div>`}));
  (r.hz||[]).forEach(h => rows.push({along:h.along, html:`<span class="rsi hz" style="--c:${HZ_COL[h.type]}">${ico(h.type)}</span><div><b class="dim">${esc(t("hz_"+h.type))}</b><small>${t("atKm",{d:fmtDist(h.along)})}</small></div>`}));
  (r.lim||[]).forEach((sg,i) => { if(i>0) rows.push({along:sg.from, html:`<span class="rsi lim"><b>${sg.v}</b></span><div><b class="dim">${esc(t("limitTo",{n:sg.v}))}</b><small>${t("atKm",{d:fmtDist(sg.from)})}</small></div>`}); });
  rows.sort((a,b) => a.along-b.along);
  $("routeSheet").innerHTML = rows.map(x => `<div class="rs">${x.html}</div>`).join("");
}
$("sheetToggle").onclick = () => { sheetOpen=!sheetOpen; renderIntel(); };
$("routeList").addEventListener("click", e => {
  const b = e.target.closest("[data-id]"); if(!b) return;
  practice = ROUTES.find(r => r.id===+b.dataset.id); store.set("ttr-last", practice.id);
  renderRoutes(); if(practice.pts) drawRoute(practice);
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
  $("prepCount").textContent = `${done}/${total}`;
}
$("prepList").addEventListener("click", e => { const b=e.target.closest("[data-k]"); if(!b || b.dataset.k==="routes") return; prep[b.dataset.k]=!prep[b.dataset.k]; store.set("ttr-prep", prep); renderPrep(); });

// =====================================================================
// More tab
// =====================================================================
$("mapStyle").addEventListener("click", e => { const b=e.target.closest("[data-style]"); if(b){ settings.mapStyle=b.dataset.style; saveSettings(); applyMapStyle(); applyTraffic(); } });
function renderKey(msg, cls){
  const k=ttKey();
  $("ttStatus").className = "kstat " + (cls || (k ? "ok" : ""));
  $("ttStatus").textContent = msg || (k ? t("tt_have",{k:k.slice(-4)}) : t("tt_none"));
  $("ttRemove").hidden = !k;
}
$("ttSave").onclick = async () => {
  const k=$("ttKey").value.trim(); if(!k) return;
  renderKey(t("tt_checking"), "");
  try{
    await ttRoute({lat:53.2963, lon:-6.3621}, {lat:53.3498, lon:-6.2603}, k);   // one test route: Tallaght to the city centre
    settings.ttKey=k; settings.traffic=true; saveSettings(); $("ttKey").value="";
    applyTraffic(); renderSwitches(); renderKey(t("tt_ok"), "ok"); toast(t("tt_ok"));
    if(dest && travelMode==="car") previewRoute();
  }catch(e){ renderKey(t("tt_bad"), "bad"); }
};
$("ttRemove").onclick = () => { settings.ttKey=""; saveSettings(); applyTraffic(); renderKey(); };
function renderSwitches(){ document.querySelectorAll("[data-set]").forEach(b => b.setAttribute("aria-checked", String(!!settings[b.dataset.set]))); }
document.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
  settings[b.dataset.set] = !settings[b.dataset.set]; saveSettings(); renderSwitches();
  if(b.dataset.set==="camLayer") applyCamLayer();
  if(b.dataset.set==="traffic") applyTraffic();
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
$("langSeg").addEventListener("click", e => { const b=e.target.closest("[data-lang]"); if(b && b.dataset.lang!==lang){ lang=settings.lang=b.dataset.lang; saveSettings(); applyLang(); } });

// ---------- Voice and sound ----------
let voiceOn = store.get("ttr-voice", true), voice=null, voiceList=[];
function voiceScore(v){
  let s=0; const n=v.name;
  if(/natural|neural|premium|enhanced|wavenet|online/i.test(n)) s+=10;
  if(/google/i.test(n)) s+=4;
  if(!v.localService) s+=2;
  if(lang==="en"){ if(/en[-_]IE/i.test(v.lang)) s+=4; else if(/en[-_]GB/i.test(v.lang)) s+=3; else if(/en[-_](AU|NZ)/i.test(v.lang)) s+=1; }
  if(/compact|espeak|robot|novelty|whisper|zarvox|bells|trinoids|bad news|good news|bubbles|cellos|jester|organ|superstar|bahh|boing|albert|fred|junior|ralph|kathy/i.test(n)) s-=20;
  return s;
}
function pickVoice(){
  if(!("speechSynthesis" in window)) return;
  const want = new RegExp("^"+lang, "i");
  voiceList = speechSynthesis.getVoices().filter(v => want.test(v.lang)).sort((a,b) => voiceScore(b)-voiceScore(a));
  const saved = store.get("ttr-voiceURI-"+lang, lang==="en" ? store.get("ttr-voiceURI", null) : null);
  voice = voiceList.find(v => v.voiceURI===saved) || voiceList[0] || null;
  $("voiceSel").innerHTML = voiceList.length ? voiceList.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name.replace(/^(Microsoft|Google|Apple)\s+/,""))} · ${esc(v.lang)}</option>`).join("") : `<option>${t("phoneDefault")}</option>`;
  if(voice) $("voiceSel").value = voice.voiceURI;
}
if("speechSynthesis" in window) speechSynthesis.onvoiceschanged = pickVoice;
$("voiceSel").onchange = e => { voice = voiceList.find(v => v.voiceURI===e.target.value) || voice; store.set("ttr-voiceURI-"+lang, voice && voice.voiceURI); };
$("testVoice").onclick = () => { const was=voiceOn; voiceOn=true; unlockAudio(); chime(); say(t("v_test"), true); voiceOn=was; };
const ORD_WORDS = ["","first","second","third","fourth","fifth","sixth","seventh","eighth"];
const ABBR = [[/\bInd Est\b/g,"Industrial Estate"],[/\bRd\b/g,"Road"],[/\bAve\b/g,"Avenue"],[/\bCres\b/g,"Crescent"],[/\bCt\b/g,"Court"],
  [/\bDr\b/g,"Drive"],[/\bPk\b/g,"Park"],[/\bGrv\b/g,"Grove"],[/\bSq\b/g,"Square"],[/\bLwr\b/g,"Lower"],[/\bUpr\b/g,"Upper"],
  [/\bSt\b(?=\s+[A-Z])/g,"Saint"],[/\bSt\b/g,"Street"],[/\bN\b/g,"North"],[/\bS\b/g,"South"],[/\bE\b/g,"East"],[/\bW\b/g,"West"]];
function spoken(text){
  let s = lang==="en" ? text.replace(/\b(\d)(st|nd|rd|th)\b/g, (m,d) => ORD_WORDS[+d] || m) : text;
  ABBR.forEach(([re,w]) => s = s.replace(re, w));
  return s.replace(/\b([RNM])(\d)(\d)(\d)\b/g, "$1 $2 $3 $4").replace(/\b([RNM])(\d{1,2})\b/g, "$1 $2");
}
function say(text, urgent){
  if(!voiceOn || !("speechSynthesis" in window)) return;
  if(urgent) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(spoken(text));
  if(voice){ u.voice=voice; u.lang=voice.lang; } else u.lang = lang==="pl" ? "pl-PL" : "en-IE";
  u.rate = 0.96; speechSynthesis.speak(u);
}
let actx=null;
function unlockAudio(){ try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume(); }catch(e){} }
function chime(){
  if(!voiceOn || !actx) return;
  try{
    const t0=actx.currentTime;
    [[988,0],[1319,.13]].forEach(([f,dt]) => {
      const o=actx.createOscillator(), g=actx.createGain(); o.type="sine"; o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t0+dt); g.gain.exponentialRampToValueAtTime(.22,t0+dt+.02); g.gain.exponentialRampToValueAtTime(.0001,t0+dt+.28);
      o.connect(g); g.connect(actx.destination); o.start(t0+dt); o.stop(t0+dt+.3);
    });
  }catch(e){}
}
function setVoiceBtn(){ $("muteBtn").innerHTML = ico(voiceOn ? "vol" : "mute"); $("muteBtn").classList.toggle("off", !voiceOn); }
$("muteBtn").onclick = () => { voiceOn=!voiceOn; store.set("ttr-voice", voiceOn); setVoiceBtn(); if(!voiceOn) speechSynthesis.cancel(); };

// =====================================================================
// Speed limits
// =====================================================================
const SL = {limit:null, lastAt:0, lastPos:null, busy:false};
function setLimit(lim, announce){
  if(!lim || (SL.limit && SL.limit.v===lim.v && SL.limit.u===lim.u)) return;
  SL.limit = {v:lim.v, u:lim.u, kmh:lim.kmh}; showLimit();
  if(announce && settings.limitVoice && settings.limits) say(t("v_limit", {n:lim.v, mph:lim.u==="mph"}));
}
function showLimit(){
  const el=$("limitSign"); el.hidden = !settings.limits;
  el.classList.toggle("unknown", !SL.limit);
  el.innerHTML = SL.limit ? `${SL.limit.v}${SL.limit.u==="mph"?"<small>mph</small>":""}` : "–";
}
async function checkLimit(f, hdg){
  if(!settings.limits || SL.busy || Date.now()-SL.lastAt < 10000) return;
  if(SL.lastPos && hav(SL.lastPos.lat,SL.lastPos.lon,f.lat,f.lon) < 120) return;
  SL.busy=true; SL.lastAt=Date.now(); SL.lastPos={lat:f.lat, lon:f.lon};
  try{
    const j = await overpass(`[out:json][timeout:8];way(around:25,${f.lat},${f.lon})["highway"]["maxspeed"];out tags geom 8;`);
    const o = mkO(f.lat, f.lon), p0={x:0,y:0}; let best=null;
    for(const w of j.elements||[]){
      const g=(w.geometry||[]).map(q => pxy(o,q.lat,q.lon));
      for(let i=0;i<g.length-1;i++){
        let d=segDist(p0, g[i], g[i+1]).d;
        if(hdg!=null){ const br=(Math.atan2(g[i+1].x-g[i].x, g[i+1].y-g[i].y)/RAD+360)%180, h=hdg%180, diff=Math.min(Math.abs(br-h), 180-Math.abs(br-h)); if(diff>35) d+=20; }
        if(!best || d<best.d) best={d, tags:w.tags};
      }
    }
    if(S && best && best.d < 40) setLimit(parseLimit(best.tags.maxspeed), true);
  }catch(e){} finally{ SL.busy=false; }
}

// =====================================================================
// Driving session
// =====================================================================
let S=null, watchId=null, simTimer=null, wakeLock=null, follow=true, lastTrack=null;
async function keepAwake(){ try{ if("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); }catch(e){} }
document.addEventListener("visibilitychange", () => { if(S && document.visibilityState==="visible") keepAwake(); });

function startSession(r, mode){
  if(!r || (!r.pts && !r.isDest)) return;
  unlockAudio();
  if(r.isDest){ r.pts=null; r.hz=null; r.lim=null; clearRoute(); destMarker(r.dest); } else drawRoute(r, false);
  poiLayer.clearLayers(); camLayer.remove();
  if(hereMarker){ hereMarker.remove(); hereMarker=null; }
  S = {route:r, mode, seg:0, progress:0, off:0, offSaid:false, said:{}, hzSaid:{}, limSaid:{}, startedAt:Date.now(), finished:false, lastFix:null, routing:false, lastRoute:0, overN:0, lastWarn:0,
       rec:{track:[], dist:0, maxV:0, speeding:[], brakes:[], stopMin:{}, last:null, overRun:0, lastBrake:0}};
  SL.limit=null; SL.lastPos=null; SL.lastAt=0;
  document.body.classList.add("driving");
  $("sheet").classList.remove("collapsed");
  $("driveView").hidden=false; $("hud").hidden=false; $("dial").hidden=false; $("recenter").hidden=true; $("fabs").hidden=true; $("alert").hidden=true;
  setVoiceBtn(); showLimit(); setDial(null); follow=true; keepAwake();
  try{ const de=document.documentElement; if(!document.fullscreenElement && de.requestFullscreen) de.requestFullscreen({navigationUI:"hide"}).catch(()=>{}); }catch(e){}
  map.setZoom(17);
  if(r.isDest){ showSign({icon:"arrow", deg:0}, "", false); $("signInstr").textContent = t("findingYou"); }
  else {
    say(t("v_intro",{id:r.id, n:routeName(r), s:r.stops.length-2}) + (mode==="sim" ? t("v_introSim") : ""), true);
    if(r.lim){ const L0=limitAt(r,0); if(L0) setLimit(L0, true); }
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
  try{ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); }catch(e){}
  const wasDest = S.route.isDest, rep = S.report || (S.mode==="gps" && S.progress/(S.route.total||1) > .6 ? buildReport() : null);
  lastTrack = S.mode==="gps" ? S.rec.track : null;
  S=null;
  document.body.classList.remove("driving");
  $("hud").hidden=true; $("dial").hidden=true; $("sign").classList.remove("off"); $("recenter").hidden=true; $("fabs").hidden=false;
  $("driveView").hidden=true;
  if(settings.camLayer) camLayer.addTo(map);
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
$("recenter").onclick = () => { follow=true; $("recenter").hidden=true; if(S && S.lastFix) map.setView([S.lastFix.lat,S.lastFix.lon], Math.max(map.getZoom(),16)); };

function showSign(ins, distText, off, next){
  $("signIcon").innerHTML = iconSvg(ins); $("signDist").textContent = distText; $("signInstr").textContent = ins && ins.text ? ins.text : "";
  $("signThen").hidden = !next; if(next) $("signThen").textContent = t("then", {s:lc(next.text)});
  $("sign").classList.toggle("off", !!off);
}
function setDial(kmh, over){
  const max=140, C=235.6, v = kmh==null ? 0 : Math.min(kmh, max);
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
    const data = await osrmFetch(`${f.lon},${f.lat};${r.dest.lon},${r.dest.lat}`);
    if(!S || S.route !== r) return;
    applyOsrm(r, data); r.hz=null; r.lim=null;
    drawRoute(r, false);
    S.seg=0; S.progress=0; S.said={}; S.hzSaid={}; S.limSaid={}; S.off=0; S.offSaid=false;
    if(!isReroute){ map.setView([f.lat, f.lon], 17); say(t("v_heading", {n:destName(r), t:spokenDur(r.duration)}), true); }
    setTimeout(() => { if(S && S.route===r && S.lastFix) onFix({...S.lastFix, speed:null}); }, 0);
    loadIntel(r).then(() => { if(S && S.route===r){ drawRoute(r, false); } });
    if(ttKey()){ S.inc=[]; liveTraffic(r, f, true); }
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
      if(!first && S.tt && arrive - S.tt.arrive > 4*60000) say(t("v_delay", {t:hhmm(arrive)}));
      S.tt = {secs:tr.secs, prog:S.progress, at:Date.now(), arrive};
    }
  }finally{ if(S) S.ttBusy=false; }
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
      say(inc ? t("vi_"+h.kind) : t("vh_"+h.type, {lim}));
    }
  });
  if(r.lim && settings.limitVoice && settings.limits){
    const cur=limitAt(r,pr), nx=r.lim.find(sg => sg.from>pr+5 && sg.from-pr<150);
    if(nx && cur && nx.v!==cur.v && !S.limSaid[nx.from]){ S.limSaid[nx.from]=1; say(t("vh_limitAhead",{n:nx.v})); }
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
    const dt=(now-R.last.t)/1000;
    if(dt>0 && dt<3 && R.last.v>4 && (v-R.last.v)/dt < -3.5 && now-R.lastBrake > 6000){ R.brakes.push({lat:f.lat, lon:f.lon, v:Math.round(R.last.v*3.6)}); R.lastBrake=now; }
    R.dist += hav(R.last.lat,R.last.lon,f.lat,f.lon);
  }
  R.last={t:now, v, lat:f.lat, lon:f.lon}; R.maxV=Math.max(R.maxV, v);
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
  S.lastFix = {lat:f.lat, lon:f.lon, heading:f.heading};
  here = {lat:f.lat, lon:f.lon, at:Date.now()};
  if(!meMarker) meMarker = L.marker([f.lat,f.lon], {icon:meIcon(hdg), zIndexOffset:1000, keyboard:false}).addTo(map);
  else { meMarker.setLatLng([f.lat,f.lon]); meMarker.setIcon(meIcon(hdg)); }
  if(follow) map.panTo([f.lat,f.lon], {animate:true, duration:.4});

  const kmh = f.speed!=null && f.speed>=0 ? Math.round(f.speed*3.6) : null;
  if(r.isDest && !r.pts){ setDial(kmh); checkLimit(f, hdg); routeFromHere(f, false); return; }
  if(!r.pts) return;

  const p = pxy(r.o, f.lat, f.lon);
  let m = nearest(r, p, S.seg-3, S.seg+150);
  if(m.d > 40){ const g = nearest(r, p, S.seg, r.pts.length); if(g.d < m.d) m = g; }
  let onRoute = false;
  if(!r.isDest && S.progress < 30 && m.d > 60){
    showSign({icon:"flag"}, fmtDist(hav(f.lat,f.lon,r.pts[0].lat,r.pts[0].lon)), false); $("signInstr").textContent = t("toStart");
    finishFix(f, kmh, hdg, r, false); return;
  }
  const leavingStart = r.isDest && S.progress < 20 && m.d <= 150;
  if(m.d > 45 && !leavingStart){
    S.off++;
    if(S.off>=3 && r.isDest){ showSign({icon:"warn"}, t("rerouting"), true); $("signInstr").textContent = t("newWay"); routeFromHere(f, true); finishFix(f, kmh, hdg, r, false); return; }
    if(S.off>=3){
      showSign({icon:"warn"}, t("offRoute"), true); $("signInstr").textContent = t("offRouteTxt", {d:fmtDist(m.d)});
      if(!S.offSaid){ say(t("v_off"), true); S.offSaid=true; }
      finishFix(f, kmh, hdg, r, false); return;
    }
  } else {
    if(S.off>=3 && !r.isDest) say(t("v_back"), true);
    S.off=0; S.offSaid=false; S.seg=m.seg; S.progress=Math.max(S.progress, m.along); onRoute = true;
  }
  if(doneLayer) doneLayer.setLatLngs(r.pts.slice(0, S.seg+1).map(q=>[q.lat,q.lon]).concat([[f.lat,f.lon]]));

  const idx = r.steps.findIndex(s => s.along > S.progress + 4);
  if(idx<0 || S.progress > r.total-25){ finishFix(f, kmh, hdg, r, onRoute); finish(); return; }
  const step = r.steps[idx], dist = step.along - S.progress, next = r.steps[idx+1];
  showSign(step, fmtDist(dist), false, next && next.icon!=="flag" && next.along-step.along < 300 ? next : null);
  const k = S.said[idx] || (S.said[idx] = {});
  const prevAlong = idx>0 ? r.steps[idx-1].along : 0;
  if(!k.km && dist <= 1100 && dist > 700 && (step.along - prevAlong) > 1500){ k.km=true; say(t("v_km", {s:lc(step.text)})); }
  if(!k.far && dist <= 220 && dist > 70 && (step.along - prevAlong) > 260){ k.far=true; say(t("v_in", {d:spokenDist(dist), s:lc(step.text)})); }
  if(!k.near && dist <= 45){
    k.near=k.far=true;
    if(step.icon==="flag") S.arrSaid = true;
    const soon = next && (next.along - step.along) < 120 && next.icon!=="flag";
    const now = step.icon==="flag" ? (r.isDest ? `${step.text}.` : t("v_end")) : step.icon==="rb" ? `${step.text}.` : t("v_now", {s:lc(step.text)});
    say(soon ? now + t("v_then", {s:lc(next.text)}) : now, true);
    if(soon) (S.said[idx+1] = S.said[idx+1] || {}).far = true;
  }
  finishFix(f, kmh, hdg, r, onRoute);
}
// Speed, limits, alerts, recording and stats: shared by every fix
function finishFix(f, kmh, hdg, r, onRoute){
  if(onRoute && r.lim){ const L0=limitAt(r, S.progress); if(L0) setLimit(L0, true); } else checkLimit(f, hdg);
  const over = kmh!=null && SL.limit && kmh > SL.limit.kmh + 3;
  S.overN = over ? S.overN+1 : 0;
  setDial(kmh, S.overN>=2);
  if(S.overN>=3 && settings.speedWarn && settings.limits && Date.now()-S.lastWarn > 30000){ S.lastWarn=Date.now(); say(t("v_check")); }
  if(onRoute) updateAlerts(r); else $("alert").hidden=true;
  if(ttKey() && r.pts && S.ttAt && Date.now()-S.ttAt > 5*60000) liveTraffic(r, f, false);
  if(S.mode==="gps") record(f, kmh, r, onRoute);
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
  const inner=(r.stopAlong||[]).slice(1,-1), el=Math.floor((Date.now()-S.startedAt)/1000);
  setStat("A", `${inner.filter(a => a <= S.progress + 15).length}/${inner.length}`, t("stops"));
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
    say(S.mode==="sim" ? t("v_reh") : t("v_done"), true);
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
  const stops = Object.values(R.stopMin), rolled = stops.filter(s => s.v >= 1.0);
  const events = [
    ...R.speeding.map(e => ({k:"speed", ...e})),
    ...R.brakes.map(e => ({k:"brake", ...e})),
    ...rolled.map(s => ({k:"roll", lat:s.lat, lon:s.lon, v:Math.round(s.v*3.6)})),
  ];
  const score = Math.max(0, Math.min(100, 100 - 6*R.speeding.length - 5*R.brakes.length - 8*rolled.length));
  return {rid: r.isDest ? null : r.id, name: r.isDest ? destName(r) : routeName(r), date: Date.now(), mins: Math.max(1, Math.round(secs/60)),
    km: R.dist/1000, avg: Math.round(R.dist/secs*3.6), max: Math.round(R.maxV*3.6), sp: R.speeding.length, br: R.brakes.length,
    st: [stops.length-rolled.length, stops.length], events, score};
}
function showReport(rep){
  const g=grade(rep.score), C=276.5;
  $("rArc").style.strokeDasharray = `${C*rep.score/100} 400`;
  $("report").dataset.g = g;
  $("rScore").textContent = rep.score;
  $("rGrade").textContent = t("grade_"+g);
  $("rSub").textContent = `${rep.name} · ${dayFmt(rep.date)} ${hhmm(rep.date)}`;
  const stat = (l, v) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  $("rStats").innerHTML = stat(t("rep_time"), `${rep.mins} min`) + stat(t("rep_dist"), `${num(rep.km,1)} km`) + stat(t("rep_avg"), `${rep.avg} km/h`) +
    stat(t("rep_max"), `${rep.max} km/h`) + stat(t("rep_speeding"), rep.sp) + stat(t("rep_brakes"), rep.br) + (rep.st[1] ? stat(t("rep_stops"), `${rep.st[0]}/${rep.st[1]}`) : "");
  const icon = {speed:"speed", brake:"warn", roll:"stop"};
  $("rEvents").innerHTML = rep.events.length ? rep.events.map(e => `<div class="ev ev-${e.k}">${ico(e.k==="roll"?"stop":e.k==="speed"?"speed":"bump")}<span>${esc(
      e.k==="speed" ? t("ev_speed",{v:e.v, l:e.l}) : e.k==="brake" ? t("ev_brake",{v:e.v}) : t("ev_roll",{v:e.v}))}</span></div>`).join("")
    : `<div class="ev ev-ok">${ico("check")}<span>${t("ev_none")}</span></div>`;
  $("report").hidden = false;
}
$("rClose").onclick = () => { $("report").hidden = true; };
function drawTrack(track, rep){
  if(!track || track.length<2) return;
  let run=[track[0]], flag=track[0][2];
  const flush = () => { if(run.length>1) L.polyline(run.map(p => [p[0],p[1]]), {color: flag ? "#ff4f6d" : "#33e3a1", weight:4, opacity:.95}).addTo(markLayer); };
  for(let i=1;i<track.length;i++){ run.push(track[i]); if(track[i][2]!==flag){ flush(); run=[track[i]]; flag=track[i][2]; } }
  flush();
  (rep && rep.events || []).forEach(e => L.circleMarker([e.lat,e.lon], {radius:7, color:"#05080f", weight:2, fillColor: e.k==="speed"?"#ff4f6d":e.k==="roll"?"#ff4f6d":"#ffb547", fillOpacity:1}).addTo(markLayer));
}

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
  renderDestCard(); renderPt(); renderKey();
  if(S) updateStats();
}

// =====================================================================
// Boot
// =====================================================================
(async function boot(){
  practice = ROUTES.find(r => r.id===store.get("ttr-last", 1)) || ROUTES[0];
  applyMapStyle(); applyLang(); placeFabs(); applyCamLayer(); applyTraffic();
  let tb = store.get("ttr-tab", "go"); if(tb==="practice") tb="test"; if(!["go","explore","test","more"].includes(tb)) tb="go";
  showTab(tb);
  try{
    const st = navigator.permissions && await navigator.permissions.query({name:"geolocation"});
    if(st && st.state==="granted") locate(h => { if(h){ renderExplore(); if(tab==="go" && !dest) map.setView([h.lat,h.lon], 14); } }, true);
  }catch(e){}
  let failed=0;
  for(const r of ROUTES){
    try{ await loadRoute(r); }catch(e){ failed++; fallbackRoute(r); }
    renderRoutes();
    if(r===practice && tab==="test" && !S) drawRoute(r);
  }
  $("loadState").textContent = failed ? t("someOffline") : "";
  for(const r of ROUTES){
    if(!r.ok) continue;
    await loadIntel(r, r.id);
    if(r===practice){ renderIntel(); if(tab==="test" && !S) drawRoute(r, false); }
  }
})();
