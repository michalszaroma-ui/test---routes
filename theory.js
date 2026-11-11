"use strict";
// =====================================================================
// Theory for the pre-drive part of the test: road signs, hand signals, lights, road markings and a quiz.
// Signs are drawn here (works offline). Where the official sign code is known, the official diagram from
// Wikimedia Commons replaces the drawing once it loads.
// =====================================================================
(function(){
const K="#111", Y="#ffd100", O="#f39200", R="#d2232a", B="#0055a4", G="#00754a", W="#fff", BR="#6b3e1e";

// ---------- drawing helpers (100 x 100 box) ----------
const ln = (d, w=7, c=K, extra="") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`;
const fl = (d, c=K) => `<path d="${d}" fill="${c}"/>`;
const tx = (s, y, size=13, c=K, x=50, wt=700) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="${wt}" font-size="${size}" fill="${c}">${s}</text>`;
const mir = s => `<g transform="translate(100 0) scale(-1 1)">${s}</g>`;
const dia = (inner, fill=Y) => `<rect x="18.5" y="18.5" width="63" height="63" rx="6" transform="rotate(45 50 50)" fill="${fill}" stroke="${K}" stroke-width="3.5"/>${inner}`;
const rect = (inner, fill=Y, stroke=K) => `<rect x="8" y="22" width="84" height="56" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/>${inner}`;
const tall = (inner, fill=W, stroke=K) => `<rect x="20" y="6" width="60" height="88" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/>${inner}`;
const sq = (inner, fill=B, stroke=W) => `<rect x="10" y="10" width="80" height="80" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="3"/>${inner}`;
const ring = inner => `<circle cx="50" cy="50" r="43" fill="${W}" stroke="${R}" stroke-width="10"/>${inner}`;
const blue = inner => `<circle cx="50" cy="50" r="46" fill="${B}" stroke="${W}" stroke-width="2"/>${inner}`;
const slash = `<path d="M22 22 78 78" stroke="${R}" stroke-width="9"/>`;
const no = inner => ring(inner + slash);
const arrowUp = (c=K, w=10) => ln("M50 82V38", w, c) + fl("M30 44 50 18 70 44z", c);
const arrowR = (c=K, w=10) => ln("M38 82V54q0-12 12-12h12", w, c) + fl("M58 26 80 42 58 58z", c);
const arrowRB = (c=W) => ln("M36 76V52q0-12 12-12h12", 9, c) + fl("M56 26 76 40 56 54z", c);
const uturn = ln("M60 82V44q0-16-14-16t-14 16v8", 9) + fl("M20 50 32 70 44 50z");
const carSide = (x=50, y=60, c=K) => fl(`M${x-20} ${y}h40v-8l-7-9H${x-11}l-7 9h-2z`, c) + `<circle cx="${x-11}" cy="${y+1}" r="5" fill="${c}"/><circle cx="${x+11}" cy="${y+1}" r="5" fill="${c}"/>`;
const carBack = (x, y, c=K) => fl(`M${x-12} ${y+9}v-10l4-9h16l4 9v10z`, c) + `<rect x="${x-12}" y="${y+9}" width="6" height="5" fill="${c}"/><rect x="${x+6}" y="${y+9}" width="6" height="5" fill="${c}"/>`;
const carTop = (x, y, c=K) => fl(`M${x-6} ${y-11}h12q2 0 2 3v17q0 3-2 3h-12q-2 0-2-3v-17q0-3 2-3z`, c);
const person = (x=50, y=30, s=1, c=K) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="2" cy="0" r="5.5" fill="${c}"/>${fl("M-3 8h9l5 16-4 1-4-11 1 13 7 19h-6l-6-16-6 16h-6l7-19v-12l-5 9-4-2z", c)}</g>`;
const child = (x, y, s, c=K) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="5" fill="${c}"/>${fl("M-5 7h10l3 14-4 1-1-8v10l4 16h-5l-2-12-2 12h-5l4-16v-10l-1 8-4-1z", c)}</g>`;
const bike = (x=50, y=62, s=1, c=K) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="3.2"><circle cx="-15" cy="0" r="9"/><circle cx="15" cy="0" r="9"/><path d="M-15 0l9-15h16l5 15M-6-15l10 15M6-20h6M-8-19h5"/></g>`;
const cyclist = (x=50, y=64, c=K) => bike(x, y, 1, c) + `<circle cx="${x+3}" cy="${y-33}" r="4.5" fill="${c}"/>` + ln(`M${x+1} ${y-27}l-5 10 7 4 4 13M${x+1} ${y-25}l8 6`, 4, c);
const cow = `<g fill="${K}">${fl("M24 44h40q6 0 8 5l6-3 4 3-3 6q-2 3-6 2l-3 6v12h-5v-11h-25v11h-5v-11q-6-2-6-9z")}<path d="M74 42l3-5 3 4" fill="none" stroke="${K}" stroke-width="2.5"/><path d="M22 47q-5 4-4 12" fill="none" stroke="${K}" stroke-width="2.5"/></g>`;
const sheep = `<g fill="${K}"><ellipse cx="46" cy="52" rx="20" ry="11"/><circle cx="34" cy="46" r="7"/><circle cx="58" cy="45" r="7"/><circle cx="46" cy="43" r="7"/><ellipse cx="70" cy="47" rx="6" ry="5"/><rect x="34" y="58" width="4" height="13"/><rect x="54" y="58" width="4" height="13"/></g>`;
const deer = `<g fill="${K}">${fl("M28 50q0-8 10-8h22l6-8h6l2 6-6 6v4l-4 4v18h-5v-14h-22l-3 14h-5l1-14q-4-2-4-8z")}<path d="M66 34l-3-9 4 4 1-7 3 7 3-5-1 8" fill="none" stroke="${K}" stroke-width="2.6"/></g>`;
const horse = `<g fill="${K}">${fl("M24 56q0-8 10-8h24l6-9 8 2 4 7-4 3-4-2-4 6v19h-5v-14h-20l-2 14h-5l1-14q-9-1-9-4z")}<circle cx="50" cy="26" r="4.5"/>${fl("M47 31h6l2 12h-4l-2 6h-4l2-8z")}</g>`;
const tractor = `<g fill="${K}"><circle cx="34" cy="60" r="12"/><circle cx="34" cy="60" r="4" fill="${Y}"/><circle cx="66" cy="66" r="6.5"/><path d="M26 46V30h16l3 16h24v12h-14q-3-9-12-9h-1z"/><rect x="58" y="36" width="3" height="10"/></g>`;
const plane = fl("M50 22q4 0 4 8v12l20 10v6l-20-5v12l7 5v5l-11-3-11 3v-5l7-5v-12l-20 5v-6l20-10v-12q0-8 4-8z");
const tram = `<g fill="${K}"><rect x="32" y="34" width="36" height="34" rx="5"/><rect x="37" y="39" width="26" height="12" rx="2" fill="${Y}"/><circle cx="40" cy="61" r="3" fill="${Y}"/><circle cx="60" cy="61" r="3" fill="${Y}"/><path d="M42 34l8-10 8 10M36 22h28" fill="none" stroke="${K}" stroke-width="2.5"/><rect x="34" y="68" width="6" height="5"/><rect x="60" y="68" width="6" height="5"/></g>`;
const train = `<g fill="${K}"><rect x="28" y="44" width="30" height="18"/><rect x="56" y="34" width="14" height="28"/><rect x="34" y="34" width="7" height="10"/><circle cx="35" cy="66" r="5"/><circle cx="50" cy="66" r="5"/><circle cx="64" cy="66" r="5"/></g>`;
const gate = `<g fill="${K}"><rect x="26" y="40" width="5" height="32"/><rect x="69" y="40" width="5" height="32"/><path d="M31 44h38v5H31zM31 58h38v5H31zM31 44l38 19v5L31 49z"/></g>`;
const lights = (x=50) => `<rect x="${x-9}" y="24" width="18" height="52" rx="5" fill="${K}"/><circle cx="${x}" cy="34" r="5.5" fill="${R}"/><circle cx="${x}" cy="50" r="5.5" fill="#f5a400"/><circle cx="${x}" cy="66" r="5.5" fill="#1aa64a"/>`;
const octa = (x=50, y=50, r=40, label="STOP", size=19) => { const p=[]; for(let i=0;i<8;i++){ const a=(22.5+45*i)*Math.PI/180; p.push((x+r*Math.cos(a)).toFixed(1)+" "+(y+r*Math.sin(a)).toFixed(1)); } return `<path d="M${p.join("L")}z" fill="${R}" stroke="${W}" stroke-width="${r/12}"/>` + tx(label, y+size*0.36, size, W); };
const yieldT = (x=50, y=50, s=1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-44-38H44L0 42z" fill="${W}" stroke="${R}" stroke-width="9" stroke-linejoin="round"/>${tx("GÉILL SLÍ", -16, 10, K, 0)}${tx("YIELD", -2, 12, K, 0)}</g>`;
const limit = (n, sub="km/h") => ring(tx(n, n.length>2 ? 57 : 59, n.length>2 ? 30 : 36) + tx(sub, 74, 10));
const humps = ln("M26 62q6-14 12 0q6-14 12 0q6-14 12 0q6-14 12 0", 6);
const lanesSign = (fill, cfg) => {   // cfg: array of "o" open / "x" closed lanes, drawn as arrows; closed lanes taper into the next
  const n=cfg.length, w=60/n; let s="";
  cfg.forEach((c,i) => { const x=20+w*i+w/2; s += c==="o" ? ln(`M${x} 80V38`, 5) + fl(`M${x-7} 42 ${x} 28 ${x+7} 42z`) : ln(`M${x} 80V62L${x + (i<n/2 ? w : -w)} 48V38`, 5) + fl(`M${x+(i<n/2?w:-w)-6} 42 ${x+(i<n/2?w:-w)} 30 ${x+(i<n/2?w:-w)+6} 42z`); });
  return tall(s, fill);
};

// ---------- every sign: [id, group, official code or "", drawing, English name, English meaning, Polish name, Polish meaning] ----------
const S = [
// ===== Regulatory =====
["stop","reg","RUS-027", octa(), "Stop", "Stop fully at the stop line, even if the road looks clear, then go only when it is safe.", "Stop", "Zatrzymaj się całkowicie przy linii stopu, nawet jeśli droga wydaje się pusta, i jedź dopiero, gdy jest bezpiecznie."],
["yield","reg","RUS-026", yieldT(50,48,0.98), "Yield", "Give way to traffic on the major road. Stop if you need to.", "Ustąp pierwszeństwa", "Ustąp pojazdom na drodze głównej. Zatrzymaj się, jeśli trzeba."],
["noentry","reg","RUS-011", no(arrowUp()), "No entry / No straight ahead", "You must not drive straight ahead past this sign, e.g. the wrong way into a one-way street.", "Zakaz wjazdu / zakaz jazdy prosto", "Nie wolno jechać prosto za ten znak, np. pod prąd w ulicę jednokierunkową."],
["noright","reg","RUS-012", no(arrowR()), "No right turn", "You must not turn right at this junction.", "Zakaz skrętu w prawo", "Na tym skrzyżowaniu nie wolno skręcić w prawo."],
["noleft","reg","RUS-013", no(mir(arrowR())), "No left turn", "You must not turn left at this junction.", "Zakaz skrętu w lewo", "Na tym skrzyżowaniu nie wolno skręcić w lewo."],
["nouturn","reg","RUS-017", no(uturn), "No U-turn", "You must not make a U-turn.", "Zakaz zawracania", "Nie wolno zawracać."],
["noovertake","reg","RUS-014", ring(carBack(36,46,R)+carBack(64,46)), "No overtaking", "You must not overtake other vehicles until the restriction ends.", "Zakaz wyprzedzania", "Nie wolno wyprzedzać innych pojazdów do końca zakazu."],
["nopark","reg","RUS-019", ring(tx("P", 66, 50) + slash), "No parking", "Parking is not allowed. A plate underneath may show the times.", "Zakaz parkowania", "Parkowanie zabronione. Tabliczka pod spodem może podawać godziny."],
["clearway","reg","RUS-010", ring(`<path d="M24 24 76 76M76 24 24 76" stroke="${R}" stroke-width="8"/>`), "Clearway", "No stopping or parking during the times shown (except buses and taxis picking up or dropping off).", "Droga ekspresowa miejska (Clearway)", "Zakaz zatrzymywania i parkowania w podanych godzinach (poza autobusami i taksówkami przy wsiadaniu i wysiadaniu)."],
["parkok","reg","RUS-018", sq(tx("P", 70, 56, W)), "Parking permitted", "Parking is allowed here, within any times or conditions shown on the plate.", "Parking dozwolony", "Wolno tu parkować, z ograniczeniami podanymi na tabliczce."],
["discpark","reg","", tall(tx("P", 46, 40, B) + tx("DISC", 66, 13) + tx("08.00-18.30", 82, 9), W, B), "Disc parking", "You may park here during the times shown only if you display a valid parking disc or ticket.", "Parking z kartą postojową", "W podanych godzinach wolno parkować tylko z ważną kartą lub biletem parkingowym."],
["taxi","reg","RUS-020", rect(tx("TAXI", 58, 24, W), B, W), "Taxi rank", "Only taxis may stop here.", "Postój taksówek", "Mogą się tu zatrzymywać tylko taksówki."],
["pedstreet","reg","RUS-021", tall(person(48,28,1.05) + tx("11.00-19.00", 86, 9), W, R), "Pedestrianised street", "Pedestrians only during the times shown. No vehicles, except where a plate allows.", "Strefa piesza", "W podanych godzinach tylko dla pieszych. Pojazdom wjazd zabroniony, chyba że tabliczka pozwala."],
["sl30","reg","RUS-044", limit("30"), "Speed limit 30 km/h", "Maximum 30 km/h, often near schools and in town centres.", "Ograniczenie 30 km/h", "Maksymalnie 30 km/h, często przy szkołach i w centrach miast."],
["sl50","reg","RUS-043", limit("50"), "Speed limit 50 km/h", "Maximum 50 km/h. The usual limit in towns and cities.", "Ograniczenie 50 km/h", "Maksymalnie 50 km/h. Zwykły limit w miastach."],
["sl60","reg","RUS-042", limit("60"), "Speed limit 60 km/h", "Maximum 60 km/h. Since February 2025 this is also the default on rural local roads.", "Ograniczenie 60 km/h", "Maksymalnie 60 km/h. Od lutego 2025 to także domyślny limit na wiejskich drogach lokalnych."],
["sl80","reg","RUS-041", limit("80"), "Speed limit 80 km/h", "Maximum 80 km/h. Usual on regional roads, and now on many national secondary roads.", "Ograniczenie 80 km/h", "Maksymalnie 80 km/h. Zwykle na drogach regionalnych, a teraz także na wielu drugorzędnych drogach krajowych."],
["sl100","reg","RUS-040", limit("100"), "Speed limit 100 km/h", "Maximum 100 km/h. Usual on national primary roads and dual carriageways.", "Ograniczenie 100 km/h", "Maksymalnie 100 km/h. Zwykle na głównych drogach krajowych i dwujezdniowych."],
["sl120","reg","RUS-039", limit("120"), "Speed limit 120 km/h", "Maximum 120 km/h. Motorways only.", "Ograniczenie 120 km/h", "Maksymalnie 120 km/h. Tylko na autostradach."],
["rural","reg","", `<circle cx="50" cy="50" r="44" fill="${W}" stroke="${K}" stroke-width="3"/>` + ln("M22 66 66 22M28 74 74 28M36 80 80 36", 5), "Rural speed limit", "The default limit for that road applies. On rural local roads that is now 60 km/h.", "Ograniczenie ogólne na drodze wiejskiej", "Obowiązuje domyślny limit dla tej drogi. Na wiejskich drogach lokalnych to teraz 60 km/h."],
["warden","reg","RUS-032", `<circle cx="50" cy="44" r="40" fill="${W}" stroke="${R}" stroke-width="8"/>` + tx("STOP", 42, 20, R) + tx("Children", 58, 11) + `<rect x="47" y="84" width="6" height="14" fill="${K}"/>`, "School warden stop sign", "When a school warden holds this up you must stop and let the children cross.", "Znak „stop” przy przejściu szkolnym", "Gdy opiekun przejścia podniesie ten znak, musisz się zatrzymać i przepuścić dzieci."],
["keepleft","reg","RUS-001", blue(`<g transform="rotate(-135 50 50)">${arrowUp(W, 9)}</g>`), "Keep left", "Pass on the left side of the island or obstruction.", "Nakaz jazdy z lewej strony", "Omiń wysepkę lub przeszkodę z lewej strony."],
["keepright","reg","RUS-002", blue(`<g transform="rotate(135 50 50)">${arrowUp(W, 9)}</g>`), "Keep right", "Pass on the right side of the island or obstruction.", "Nakaz jazdy z prawej strony", "Omiń wysepkę lub przeszkodę z prawej strony."],
["eitherside","reg","RUS-003", blue(ln("M50 20V40M50 40 34 60M50 40 66 60", 7, W) + fl("M22 74 25 52 43 66z", W) + fl("M78 74 75 52 57 66z", W)), "Pass either side", "You may pass on either side of the island.", "Omiń z dowolnej strony", "Możesz ominąć wysepkę z lewej lub prawej strony."],
["ahead","reg","RUS-004", blue(arrowUp(W, 9)), "Straight ahead only", "You must go straight ahead.", "Nakaz jazdy prosto", "Musisz jechać prosto."],
["turnleft","reg","RUS-006", blue(mir(arrowRB())), "Turn left", "You must turn left.", "Nakaz skrętu w lewo", "Musisz skręcić w lewo."],
["turnright","reg","RUS-005", blue(arrowRB()), "Turn right", "You must turn right.", "Nakaz skrętu w prawo", "Musisz skręcić w prawo."],
["leftahead","reg","RUS-007", blue(mir(ln("M50 78V44q0-10 10-10h4", 9, W) + fl("M60 22 78 34 60 46z", W))), "Turn left ahead", "You must turn left at the junction ahead.", "Nakaz skrętu w lewo przed znakiem", "Na najbliższym skrzyżowaniu musisz skręcić w lewo."],
["rightahead","reg","RUS-008", blue(ln("M50 78V44q0-10 10-10h4", 9, W) + fl("M60 22 78 34 60 46z", W)), "Turn right ahead", "You must turn right at the junction ahead.", "Nakaz skrętu w prawo przed znakiem", "Na najbliższym skrzyżowaniu musisz skręcić w prawo."],
["minirb","reg","RUS-049", blue(`<circle cx="50" cy="50" r="22" fill="none" stroke="${W}" stroke-width="7"/>` + fl("M63 20 76 32 60 36z", W) + fl("M78 66 60 74 68 58z", W) + fl("M24 66 26 48 38 60z", W)), "Mini roundabout", "Give way to traffic from your right and go clockwise around the white circle. Don't drive over it unless your vehicle is too big.", "Mini rondo", "Ustąp pojazdom z prawej i objedź biały okrąg zgodnie z ruchem wskazówek zegara. Nie najeżdżaj na niego, chyba że pojazd jest za duży."],
["cyclesonly","reg","RUS-009", blue(bike(50,58,1,W)), "Pedal cycles only (cycle track)", "Cycle track: only bicycles may use it.", "Droga dla rowerów", "Tylko dla rowerów."],
["shared","reg","RUS-058", blue(bike(50,36,.72,W) + `<path d="M18 54H82" stroke="${W}" stroke-width="3"/>` + person(48,60,.6,W)), "Shared route for cyclists and pedestrians", "A path shared by bicycles and pedestrians. Watch out for each other.", "Wspólna droga dla rowerów i pieszych", "Ścieżka wspólna dla rowerzystów i pieszych. Uważajcie na siebie."],
["nocycles","reg","RUS-055", no(bike(50,58,.9)), "No bicycles", "Bicycles are not allowed.", "Zakaz wjazdu rowerów", "Rowerom wjazd zabroniony."],
["nohorses","reg","RUS-056", no(horse), "No ridden or accompanied horses", "Horses may not be ridden or led here.", "Zakaz wjazdu i prowadzenia koni", "Zakaz jazdy konnej i prowadzenia koni."],
["nocarts","reg","RUS-057", no(`<g transform="translate(-6 4) scale(.85)">${horse}</g><circle cx="74" cy="66" r="8" fill="none" stroke="${K}" stroke-width="3"/>${ln("M60 58H82", 3)}`), "No horse-drawn vehicles", "Horse-drawn carts and carriages are not allowed.", "Zakaz wjazdu pojazdów zaprzęgowych", "Wozy i bryczki konne nie mogą tu wjeżdżać."],
["nopeds","reg","RUS-038", no(person(48,28,1.05)), "No pedestrians", "Pedestrians are not allowed (for example on a motorway or into a tramway).", "Zakaz ruchu pieszych", "Piesi nie mogą tu wchodzić (np. na autostradę lub torowisko)."],
["novehicles","reg","", ring(""), "No entry to vehicles", "No vehicles may enter, in either direction.", "Zakaz ruchu pojazdów", "Żaden pojazd nie może tu wjechać."],
["height","reg","RUS-016", ring(fl("M42 20h16l-8 10zM42 80h16l-8-10z") + tx("4.5 m", 58, 19)), "Height restriction", "Vehicles taller than the height shown may not pass.", "Ograniczenie wysokości", "Pojazdy wyższe niż podana wysokość nie mogą przejechać."],
["width","reg","RUS-052", ring(fl("M20 42v16l10-8zM80 42v16l-10-8z") + tx("2 m", 57, 19)), "Maximum width", "Vehicles wider than shown may not pass.", "Ograniczenie szerokości", "Pojazdy szersze niż podano nie mogą przejechać."],
["length","reg","RUS-051", ring(ln("M24 66H76", 3) + fl("M22 66l8-5v10zM78 66l-8-5v10z") + tx("10 m", 54, 19)), "Maximum vehicle length", "Vehicles longer than shown may not enter.", "Ograniczenie długości", "Pojazdy dłuższe niż podano nie mogą wjechać."],
["weight","reg","RUS-053", ring(tx("5 t", 60, 28)), "Maximum gross weight", "Vehicles heavier (fully laden) than the weight shown may not enter.", "Ograniczenie masy całkowitej", "Pojazdy cięższe (z ładunkiem) niż podano nie mogą wjechać."],
["axle","reg","RUS-054", ring(tx("3 t", 50, 24) + `<circle cx="38" cy="66" r="6"/><circle cx="62" cy="66" r="6"/>` + ln("M38 66H62", 3)), "Maximum axle weight", "Vehicles with more weight on one axle than shown may not enter.", "Ograniczenie nacisku na oś", "Pojazdy o większym nacisku na oś niż podano nie mogą wjechać."],
["axles","reg","RUS-046", ring(fl("M26 44h40v14H26zM66 48h10v10H66z") + `<circle cx="32" cy="62" r="4"/><circle cx="42" cy="62" r="4"/><circle cx="68" cy="62" r="4"/>` + tx("3", 38, 12)), "No goods vehicles over the number of axles shown", "Goods vehicles with that many axles or more may not enter.", "Zakaz wjazdu ciężarówek o podanej liczbie osi", "Ciężarówki z podaną lub większą liczbą osi nie mogą wjechać."],
["buslaneL","reg","", tall(fl("M30 22h26q4 0 4 4v26H26V26q0-4 4-4z", W) + `<rect x="30" y="27" width="26" height="9" fill="${B}"/>` + tx("LÁNA", 64, 9, W) + tx("BUS", 74, 9, W) + ln("M70 90V18", 3, W) + fl("M64 26 70 14 76 26z", W), B, W), "With-flow bus lane on the left", "The lane on the left is for buses (and taxis and bicycles if shown) during the times on the plate.", "Buspas z lewej strony (zgodnie z kierunkiem ruchu)", "Lewy pas jest dla autobusów (oraz taksówek i rowerów, jeśli podano) w godzinach z tabliczki."],
["contrabus","reg","", tall(fl("M30 22h26q4 0 4 4v26H26V26q0-4 4-4z", W) + `<rect x="30" y="27" width="26" height="9" fill="${B}"/>` + tx("LÁNA", 64, 9, W) + tx("BUS", 74, 9, W) + ln("M70 18V86", 3, W) + fl("M64 80 70 92 76 80z", W), B, W), "Contra-flow bus lane", "Buses come towards you in this lane. Don't drive in it.", "Buspas pod prąd", "Autobusy jadą tym pasem w przeciwnym kierunku. Nie wjeżdżaj na niego."],
["busonly","reg","", tall(fl("M32 26h36q4 0 4 4v30H28V30q0-4 4-4z", W) + `<rect x="32" y="32" width="36" height="12" fill="${B}"/>` + tx("BUS ONLY", 80, 11, W), B, W), "Bus only street", "Only buses may use this street.", "Ulica tylko dla autobusów", "Z tej ulicy mogą korzystać tylko autobusy."],
["tramlane","reg","", tall(tram.replace(/fill="#111"/g, `fill="${W}"`).replace(/stroke="#111"/g, `stroke="${W}"`).replace(new RegExp(Y,"g"), B), B, W), "Tram lane", "A lane reserved for trams. Don't drive or stop in it.", "Pas tramwajowy", "Pas tylko dla tramwajów. Nie jedź po nim i nie zatrzymuj się na nim."],
["cycletrack","reg","", tall(bike(50,40,.8,W) + tx("START", 76, 12, W), B, W), "Start of cycle track", "A cycle track starts here. Cars must not drive or park on it.", "Początek drogi dla rowerów", "Tu zaczyna się droga dla rowerów. Samochody nie mogą po niej jeździć ani parkować."],
["go","reg","", `<circle cx="50" cy="44" r="40" fill="#1aa64a" stroke="${W}" stroke-width="3"/>` + tx("TÉIGH", 40, 15, W) + tx("GO", 60, 19, W) + `<rect x="47" y="84" width="6" height="14" fill="${K}"/>`, "Go / Téigh (roadworks)", "Shown by a flagman at roadworks: you may proceed with care.", "Jedź / Téigh (roboty drogowe)", "Pokazywany przez pracownika przy robotach: możesz ostrożnie jechać."],
["stoppaddle","reg","", octa(50,44,40,"STOP",18) + `<rect x="47" y="84" width="6" height="14" fill="${K}"/>`, "Stop (manual control at roadworks)", "Shown by a flagman at roadworks: stop and wait until you see GO.", "Stop (ręczne kierowanie przy robotach)", "Pokazywany przez pracownika przy robotach: zatrzymaj się i czekaj na GO."],
["turnback","reg","", sq(tx("TURN", 46, 15, W) + tx("BACK", 66, 15, W), R, W), "Turn back", "Wrong way (e.g. at a motorway exit or a tunnel): stop and turn back safely.", "Zawróć", "Jedziesz w złą stronę (np. na zjeździe z autostrady lub w tunelu): zatrzymaj się i bezpiecznie zawróć."],

// ===== Warning: junctions =====
["xroads","warn","W-001", dia(ln("M50 74V26", 9) + ln("M34 50H66", 5)), "Crossroads ahead", "Crossroads ahead with a road of less importance (the thinner arms).", "Skrzyżowanie z drogą podporządkowaną", "Przed tobą skrzyżowanie z drogą o mniejszym znaczeniu (cieńsze ramiona)."],
["sideL","warn","W-002L", dia(ln("M50 74V26", 9) + ln("M50 50H32", 5)), "Side road on the left", "A side road joins from the left. Watch for traffic coming out.", "Droga podporządkowana z lewej", "Z lewej dochodzi boczna droga. Uważaj na wyjeżdżające pojazdy."],
["sideR","warn","W-002R", dia(ln("M50 74V26", 9) + ln("M50 50H68", 5)), "Side road on the right", "A side road joins from the right.", "Droga podporządkowana z prawej", "Z prawej dochodzi boczna droga."],
["tjunc","warn","", dia(ln("M30 38H70", 9) + ln("M50 38V74", 9)), "T-junction ahead", "The road ends at a T-junction ahead. You will have to turn left or right.", "Skrzyżowanie w kształcie litery T", "Droga kończy się skrzyżowaniem w kształcie T. Trzeba będzie skręcić w lewo lub w prawo."],
["yjunc","warn","W-005L", dia(ln("M50 74V54", 8) + ln("M50 56L36 32", 6) + ln("M50 56L64 32", 6)), "Y-junction ahead", "The road splits into two ahead.", "Rozwidlenie dróg (Y)", "Droga przed tobą rozwidla się na dwie."],
["stagger","warn","W-007LR", dia(ln("M50 74V26", 9) + ln("M50 40H32", 5) + ln("M50 60H68", 5)), "Staggered crossroads", "Two side roads, one on each side, a short distance apart.", "Skrzyżowanie przesunięte", "Dwie boczne drogi po obu stronach, niedaleko od siebie."],
["twojunc","warn","W-008L", dia(ln("M52 74V26", 9) + ln("M52 40H34", 5) + ln("M52 60H34", 5)), "Two side roads on the left", "Two side roads join from the left close together.", "Dwie drogi boczne z lewej", "Z lewej dochodzą dwie boczne drogi blisko siebie."],
["xroadsEq","warn","W-015", dia(ln("M50 74V26", 8) + ln("M28 50H72", 8)), "Crossroads with a road of equal importance", "Crossroads ahead where neither road has priority. Slow down and be ready to give way.", "Skrzyżowanie dróg równorzędnych", "Skrzyżowanie, na którym żadna droga nie ma pierwszeństwa. Zwolnij i bądź gotów ustąpić."],
["majorahead","warn","W-016", dia(ln("M28 34H72", 10) + ln("M50 34V74", 6)), "T-junction with a major road ahead", "Your road meets a major road ahead. You will have to give way.", "Skrzyżowanie z drogą główną (T)", "Twoja droga dochodzi do drogi głównej. Będziesz musiał ustąpić pierwszeństwa."],
["dualT","warn","W-020", dia(ln("M28 30H72M28 42H72", 5) + ln("M50 42V74", 7)), "T-junction with a dual carriageway", "Your road meets a dual carriageway ahead.", "Skrzyżowanie z drogą dwujezdniową (T)", "Twoja droga dochodzi do drogi dwujezdniowej."],
["dualX","warn","W-014", dia(ln("M42 74V26M58 74V26", 5) + ln("M30 50H70", 6)), "Crossroads with a dual carriageway", "A crossroads with a dual carriageway ahead. You may have to cross in two stages at the gap in the middle.", "Skrzyżowanie z drogą dwujezdniową", "Skrzyżowanie z drogą dwujezdniową. Przejazd może odbywać się w dwóch etapach przez przerwę w pasie dzielącym."],
["stopahead","warn","W-040", dia(octa(50,46,17,"STOP",8) + tx("100 m", 76, 10)), "Stop sign ahead", "There is a Stop sign ahead. Be ready to stop.", "Uprzedzenie o znaku Stop", "Przed tobą znak Stop. Przygotuj się do zatrzymania."],
["yieldahead","warn","W-041", dia(yieldT(50,47,.4) + tx("100 m", 76, 10)), "Yield sign ahead", "There is a Yield sign ahead. Be ready to give way.", "Uprzedzenie o znaku Ustąp pierwszeństwa", "Przed tobą znak Ustąp pierwszeństwa. Przygotuj się."],
["rbahead","warn","W-043", dia(`<circle cx="50" cy="52" r="15" fill="none" stroke="${K}" stroke-width="6"/>` + fl("M58 30 70 40 54 44z") + fl("M68 66 50 70 60 56z") + fl("M30 58 34 40 42 52z")), "Roundabout ahead", "Slow down. At the roundabout give way to traffic from your right.", "Rondo", "Zwolnij. Na rondzie ustąp pojazdom nadjeżdżającym z prawej."],
["minirbahead","warn","W-044", dia(`<circle cx="50" cy="52" r="9" fill="${K}"/><circle cx="50" cy="52" r="18" fill="none" stroke="${K}" stroke-width="4" stroke-dasharray="20 9"/>`), "Mini-roundabout ahead", "A small roundabout ahead. Give way to traffic from the right.", "Mini rondo przed tobą", "Przed tobą małe rondo. Ustąp pojazdom z prawej."],
["merge","warn","W-030", dia(ln("M56 74V26", 9) + ln("M34 74q0-16 20-30", 6)), "Merging traffic", "Traffic will join your road from the left. Let it merge safely.", "Włączanie się ruchu", "Z lewej dołączają pojazdy. Pozwól im bezpiecznie się włączyć."],
["mergediv","warn","W-032", dia(ln("M50 74V26", 8) + ln("M30 74q0-12 18-20M48 46q-18-8-18-20", 5)), "Merging and diverging traffic", "Traffic joins and leaves on the same side ahead. Keep an eye on both.", "Włączanie i zjeżdżanie ruchu", "Pojazdy dołączają i zjeżdżają z tej samej strony. Uważaj na jedne i drugie."],

// ===== Warning: bends, road layout =====
["corner","warn","W-050R", dia(ln("M42 74V42H66", 9)), "Dangerous corner ahead", "A sharp corner ahead. Slow down before it.", "Niebezpieczny zakręt (ostry)", "Przed tobą ostry zakręt. Zwolnij przed nim."],
["bend","warn","", dia(ln("M42 74V58q0-20 24-28", 9)), "Dangerous bend ahead", "A bend ahead. Slow down and keep left.", "Niebezpieczny łuk drogi", "Przed tobą łuk. Zwolnij i trzymaj się lewej."],
["bends","warn","", dia(ln("M44 76C44 62 58 62 58 50S44 38 44 26", 7)), "Series of dangerous bends", "Several bends ahead. The first is in the direction shown.", "Niebezpieczne zakręty", "Kilka zakrętów; pierwszy w pokazanym kierunku."],
["corners","warn","", dia(ln("M42 76V60H58V42H42V26", 6)), "Series of dangerous corners", "Several sharp corners ahead.", "Seria ostrych zakrętów", "Przed tobą kilka ostrych zakrętów."],
["chevron","warn","W-061L", rect(fl("M60 30 38 50 60 70h10L48 50 70 30z"), Y), "Chevron board", "Marks a sharp change of direction (the way the chevrons point). Slow right down.", "Tablica kierunkowa (szewrony)", "Oznacza ostrą zmianę kierunku (tam, gdzie wskazują szewrony). Mocno zwolnij."],
["narrowboth","warn","W-071", dia(ln("M38 76V60L44 48V24M62 76V60L56 48V24", 6)), "Road narrows on both sides", "The road gets narrower ahead.", "Zwężenie jezdni (obustronne)", "Jezdnia przed tobą się zwęża."],
["narrowL","warn","W-070L", dia(ln("M38 76V58L46 46V24M62 76V24", 6)), "Road narrows from the left", "The road gets narrower on the left side.", "Zwężenie jezdni z lewej", "Jezdnia zwęża się z lewej strony."],
["narrowR","warn","W-070R", dia(ln("M38 76V24M62 76V58L54 46V24", 6)), "Road narrows from the right", "The road gets narrower on the right side.", "Zwężenie jezdni z prawej", "Jezdnia zwęża się z prawej strony."],
["twoway","warn","W-080", dia(ln("M40 76V36", 6) + fl("M32 40 40 26 48 40z") + ln("M60 24V64", 6) + fl("M52 60 60 74 68 60z")), "Two-way traffic", "Traffic in both directions ahead (often after a one-way section).", "Ruch dwukierunkowy", "Przed tobą ruch w obu kierunkach (często po odcinku jednokierunkowym)."],
["dualends","warn","", dia(ln("M38 76V54L46 42V24M62 76V54L54 42V24", 6) + ln("M50 76V60", 3)), "Dual carriageway ends", "The dual carriageway ends. Traffic now comes towards you on the same road.", "Koniec drogi dwujezdniowej", "Koniec drogi dwujezdniowej. Pojazdy z naprzeciwka jadą teraz tą samą jezdnią."],
["crossover","warn","", dia(ln("M38 76V60L62 40V24M62 76V60L56 55M44 45 38 40V24", 5)), "Traffic cross-over ahead", "Traffic is moved over to the other carriageway ahead.", "Przejazd na drugą jezdnię", "Ruch zostaje przeniesiony na drugą jezdnię."],
["lights","warn","W-042", dia(lights()), "Traffic signals ahead", "Traffic lights ahead. Be ready to stop.", "Sygnalizacja świetlna", "Przed tobą światła. Bądź gotów się zatrzymać."],
["tunnel","warn","W-162", dia(`<path d="M28 72V52a22 22 0 0 1 44 0v20H62V54a12 12 0 0 0-24 0v18z" fill="${K}"/>`), "Tunnel ahead", "A tunnel ahead. Turn on dipped headlights.", "Tunel", "Przed tobą tunel. Włącz światła mijania."],
["headroom","warn","W-110", dia(fl("M42 24h16l-8 9zM42 76h16l-8-9z") + tx("4.5 m", 56, 14)), "Restricted headroom", "Limited height ahead (e.g. under a bridge). Taller vehicles can't pass.", "Ograniczona wysokość", "Ograniczona wysokość (np. pod mostem). Wyższe pojazdy nie przejadą."],
["lowbridge","warn","", dia(`<path d="M24 34H76V64H66A16 16 0 0 0 34 64H24z" fill="${K}"/>` + tx("4.2 m", 76, 10)), "Low bridge ahead", "A low bridge ahead. The height is shown.", "Niski most", "Przed tobą niski most. Podano wysokość."],
["cables","warn","", dia(ln("M24 42q13 6 26 0t26 0M24 52q13 6 26 0t26 0", 3) + fl("M52 56 44 66h6l-4 10 10-13h-6l4-7z")), "Overhead electric cables", "Low overhead cables ahead. Danger for tall vehicles and loads.", "Linie elektryczne nad drogą", "Nisko zawieszone przewody nad drogą. Niebezpieczne dla wysokich pojazdów i ładunków."],
["passlane","warn","", tall(ln("M38 86V30", 5) + fl("M31 34 38 20 45 34z") + ln("M62 86V64L62 30", 5) + fl("M55 34 62 20 69 34z"), W, K), "Start of a passing lane", "An extra lane starts so you can overtake safely.", "Początek pasa do wyprzedzania", "Zaczyna się dodatkowy pas, by bezpiecznie wyprzedzać."],
["lanelost","warn","", tall(ln("M38 86V30", 5) + fl("M31 34 38 20 45 34z") + ln("M62 86V60L46 44", 5), W, K), "Lane loss", "A lane ends ahead. Move over in good time.", "Koniec pasa", "Pas się kończy. Zmień pas z wyprzedzeniem."],

// ===== Warning: level crossings, trams =====
["lcgates","warn","W-120", dia(gate), "Level crossing with gates or barriers", "A railway level crossing ahead with gates or barriers. Stop when the lights flash or barriers come down.", "Przejazd kolejowy z zaporami", "Przejazd kolejowy z zaporami lub szlabanami. Zatrzymaj się, gdy migają światła lub opadają zapory."],
["lcnogates","warn","W-121", dia(train), "Level crossing without gates or barriers", "An unguarded level crossing ahead. Slow down, look and listen for trains.", "Przejazd kolejowy bez zapór", "Niestrzeżony przejazd kolejowy. Zwolnij, rozejrzyj się i nasłuchuj pociągu."],
["tramx","warn","W-124", dia(tram), "Tram crossing ahead", "Trams cross the road ahead. Trams can't steer or stop quickly.", "Przejazd tramwajowy", "Tramwaje przecinają drogę. Tramwaj nie skręci i nie zatrzyma się szybko."],

// ===== Warning: people and animals =====
["peds","warn","W-140", dia(person(48,32,1)), "Pedestrian crossing ahead", "A pedestrian crossing ahead. Be ready to stop for people crossing.", "Przejście dla pieszych", "Przed tobą przejście dla pieszych. Bądź gotów zatrzymać się dla przechodzących."],
["school","warn","W-141", dia(child(42,34,1) + person(58,30,.95)), "School ahead", "A school ahead. Watch for children, especially at start and end of the school day.", "Szkoła", "Przed tobą szkoła. Uważaj na dzieci, zwłaszcza rano i po lekcjach."],
["children","warn","", dia(child(42,36,1) + child(58,38,.9) ) , "Children crossing (residential area)", "Children may run out or cross ahead. Slow down.", "Dzieci (osiedle)", "Dzieci mogą wybiec lub przechodzić. Zwolnij."],
["schoolx","warn","", rect(child(36,32,.8) + person(56,30,.8) + tx("SCHOOL", 74, 11), Y), "School children crossing ahead", "Children cross here on their way to and from school. A warden may stop you.", "Przejście dla dzieci szkolnych", "Tu dzieci przechodzą w drodze do i ze szkoły. Opiekun może cię zatrzymać."],
["cyclists","warn","W-143", dia(cyclist(50,64)), "Cyclists", "Cyclists may be on or joining the road. Give them at least 1.5 m when passing.", "Rowerzyści", "Na drodze mogą być rowerzyści. Przy wyprzedzaniu zachowaj co najmniej 1,5 m odstępu."],
["slipcycle","warn","W-144", dia(bike(46,60,.85) + ln("M28 72q4-4 8 0t8 0M56 72q4-4 8 0t8 0", 2.5)), "Slippery for cyclists", "The surface is slippery for bicycles (e.g. tram rails, ironwork).", "Śliska nawierzchnia dla rowerzystów", "Nawierzchnia śliska dla rowerów (np. szyny, metalowe elementy)."],
["horses","warn","W-150", dia(`<g transform="translate(3 4) scale(.9)">${horse}</g>`), "Accompanied horses and ponies", "Horses may be on the road. Slow down, give them room and don't rev or sound the horn.", "Konie", "Na drodze mogą być konie. Zwolnij, zostaw miejsce, nie używaj klaksonu i nie dodawaj gwałtownie gazu."],
["cattle","warn","W-151", dia(`<g transform="translate(3 4) scale(.9)">${cow}</g>`), "Cattle and farm animals", "Cattle or other farm animals may be on the road.", "Bydło i zwierzęta gospodarskie", "Na drodze mogą być krowy lub inne zwierzęta gospodarskie."],
["sheep","warn","W-152", dia(`<g transform="translate(4 6) scale(.9)">${sheep}</g>`), "Sheep", "Sheep may be on the road (common in hill areas).", "Owce", "Na drodze mogą być owce (często w górach)."],
["deer","warn","W-153", dia(`<g transform="translate(4 6) scale(.9)">${deer}</g>`), "Deer or wild animals", "Wild animals such as deer may cross, especially at dawn and dusk.", "Jelenie lub dzikie zwierzęta", "Dzikie zwierzęta, np. jelenie, mogą przebiegać drogę, zwłaszcza o świcie i zmierzchu."],
["tractors","warn","W-168", dia(`<g transform="translate(4 4) scale(.9)">${tractor}</g>`), "Tractors / farm vehicles", "Slow farm vehicles may enter or be on the road.", "Ciągniki", "Na drodze mogą być wolne pojazdy rolnicze."],

// ===== Warning: surface, hills, other =====
["slippery","warn","", dia(carSide(50,50) + ln("M32 66q6 6 12 0t12 0M48 76q6 6 12 0t12 0", 3)), "Slippery road ahead", "The road can be slippery. Slow down and avoid harsh braking or steering.", "Śliska jezdnia", "Jezdnia może być śliska. Zwolnij i unikaj gwałtownego hamowania i skręcania."],
["descent","warn","", dia(fl("M26 46 74 66H26z") + tx("10%", 40, 12)), "Steep descent ahead", "A steep hill down ahead. Use a lower gear.", "Stromy zjazd", "Przed tobą stromy zjazd. Użyj niższego biegu."],
["ascent","warn","", dia(fl("M26 66 74 46V66z") + tx("10%", 40, 12)), "Steep ascent ahead", "A steep hill up ahead. Be in the right gear.", "Strome podjazdy", "Przed tobą strome wzniesienie. Wybierz odpowiedni bieg."],
["dip","warn","", dia(ln("M24 46q14 0 26 20 12-20 26-20", 7)), "Sharp dip ahead", "The road dips sharply. It may hide oncoming traffic or water.", "Nagłe obniżenie drogi", "Droga gwałtownie się obniża. Może zasłaniać pojazdy z naprzeciwka lub wodę."],
["bumps","warn","", dia(humps), "Series of bumps or hollows", "An uneven road ahead. Slow down.", "Nierówna droga", "Przed tobą nierówności. Zwolnij."],
["humpback","warn","", dia(ln("M22 64q28-36 56 0", 7)), "Sharp rise ahead (e.g. hump-back bridge)", "A sharp rise in the road. You can't see over it, so slow down and keep left.", "Garb (np. most garbaty)", "Nagłe wzniesienie drogi. Nie widać, co za nim, więc zwolnij i trzymaj się lewej."],
["rocks","warn","W-164", dia(fl("M28 74V30l12 10 6-6 12 40z") + `<circle cx="58" cy="44" r="4"/><circle cx="64" cy="56" r="5"/><circle cx="60" cy="68" r="3.5"/>`), "Danger of falling rocks", "Rocks may fall or be on the road.", "Spadające kamienie", "Kamienie mogą spadać lub leżeć na drodze."],
["quay","warn","W-160", dia(`<g transform="rotate(25 44 46)">${carSide(44,46)}</g>` + fl("M24 62H52v4H24z") + ln("M36 72q5-4 10 0t10 0 10 0", 3)), "Unprotected quay, canal or river", "The road runs beside unprotected water. Take great care.", "Niezabezpieczone nabrzeże", "Droga biegnie przy niezabezpieczonej wodzie. Zachowaj szczególną ostrożność."],
["crosswind","warn","W-166", dia(ln("M34 74V30", 3) + fl("M35 32 70 38 70 48 35 50z")), "Crosswinds", "Strong side winds possible (e.g. on bridges). Hold the wheel firmly.", "Boczny wiatr", "Możliwy silny boczny wiatr (np. na mostach). Trzymaj mocno kierownicę."],
["aircraft","warn","W-165", dia(plane), "Low-flying aircraft", "Planes fly low here and may be sudden and loud.", "Nisko lecące samoloty", "Samoloty latają tu nisko i mogą być nagłe i głośne."],
["queues","warn","W-163", rect(carTop(34,48) + carTop(50,48) + carTop(66,48) + tx("QUEUES LIKELY", 74, 9), Y), "Queues likely", "Expect queuing traffic ahead.", "Możliwe korki", "Spodziewaj się zatoru przed tobą."],
["driveleft","warn","W-169", rect(tx("DRIVE", 44, 14) + tx("ON LEFT", 62, 14), Y), "Drive on left", "A reminder (usually for visitors) to drive on the left.", "Jedź lewą stroną", "Przypomnienie (głównie dla turystów), że jeździ się lewą stroną."],

// ===== Roadworks =====
["rwahead","rw","WK-001", dia(person(44,34,.95) + fl("M56 72h16l-10-10z"), O), "Roadworks ahead", "Roadworks ahead. Slow down, watch for workers, and obey any temporary signs.", "Roboty drogowe", "Przed tobą roboty drogowe. Zwolnij, uważaj na pracowników i stosuj się do tymczasowych znaków."],
["rwnarrowL","rw","", dia(ln("M38 76V58L46 46V24M62 76V24", 6), O), "Road narrows from left (roadworks)", "The road narrows on the left because of works.", "Zwężenie z lewej (roboty)", "Jezdnia zwęża się z lewej z powodu robót."],
["rwnarrowR","rw","", dia(ln("M38 76V24M62 76V58L54 46V24", 6), O), "Road narrows from right (roadworks)", "The road narrows on the right because of works.", "Zwężenie z prawej (roboty)", "Jezdnia zwęża się z prawej z powodu robót."],
["rwnarrowB","rw","", dia(ln("M38 76V60L44 48V24M62 76V60L56 48V24", 6), O), "Road narrows on both sides (roadworks)", "The road narrows on both sides because of works.", "Zwężenie obustronne (roboty)", "Jezdnia zwęża się z obu stron z powodu robót."],
["rwtwoway","rw","", dia(ln("M40 76V36", 6) + fl("M32 40 40 26 48 40z") + ln("M60 24V64", 6) + fl("M52 60 60 74 68 60z"), O), "Two-way traffic (roadworks)", "Traffic in both directions on one carriageway because of works.", "Ruch dwukierunkowy (roboty)", "Z powodu robót ruch w obu kierunkach na jednej jezdni."],
["rwsingle","rw","", tall(ln("M50 86V30", 7) + fl("M42 34 50 18 58 34z"), O), "Single lane (shuttle working)", "Only one lane is open. Traffic takes turns, usually controlled by lights or a flagman.", "Ruch wahadłowy", "Otwarty tylko jeden pas. Pojazdy jadą na zmianę, zwykle według świateł lub pracownika z tarczą."],
["rwsignals","rw","", dia(lights(), O), "Temporary traffic signals ahead", "Temporary lights at the works. Obey them like normal traffic lights.", "Tymczasowa sygnalizacja", "Tymczasowe światła przy robotach. Stosuj się do nich jak do zwykłych świateł."],
["flagman","rw","", dia(person(46,32,.95) + fl("M58 28h14v10H58z") + ln("M58 28V54", 2.5), O), "Flagman ahead", "A worker controls traffic with a Stop/Go sign. Obey it.", "Pracownik kierujący ruchem", "Pracownik kieruje ruchem tarczą Stop/Go. Stosuj się do niej."],
["chippings","rw","", dia(carSide(42,50) + `<circle cx="60" cy="58" r="3"/><circle cx="66" cy="50" r="2.5"/><circle cx="68" cy="62" r="2.5"/><circle cx="58" cy="68" r="2.5"/>`, O), "Loose chippings", "Loose stones on the surface. Slow down so they don't fly up and to keep grip.", "Luźne kamienie (grys)", "Luźne kamyki na nawierzchni. Zwolnij, by nie wylatywały spod kół i by nie stracić przyczepności."],
["rwslippery","rw","", dia(carSide(50,50) + ln("M32 66q6 6 12 0t12 0M48 76q6 6 12 0t12 0", 3), O), "Slippery road (roadworks)", "Slippery surface because of the works.", "Śliska jezdnia (roboty)", "Śliska nawierzchnia z powodu robót."],
["rwhump","rw","", dia(ln("M24 62H38q12-18 24 0H76", 7), O), "Hump or ramp", "A temporary hump or ramp. Slow down.", "Garb lub próg", "Tymczasowy garb lub próg. Zwolnij."],
["rwuneven","rw","", dia(humps, O), "Uneven surface", "The road surface is uneven. Slow down.", "Nierówna nawierzchnia", "Nierówna nawierzchnia. Zwolnij."],
["rwpedsL","rw","", dia(person(48,30,.9) + fl("M24 76 36 68v5h10v6H36v5z"), O), "Pedestrians cross to the left", "Pedestrians are diverted across to the left. Watch for them.", "Piesi przechodzą na lewo", "Piesi są kierowani na lewą stronę. Uważaj na nich."],
["rwsiteL","rw","", dia(ln("M50 74V26", 9) + ln("M50 50H32", 5) + tx("SITE", 72, 9), O), "Site access on the left", "Works vehicles enter and leave on the left.", "Wjazd na budowę z lewej", "Z lewej wjeżdżają i wyjeżdżają pojazdy budowy."],
["rwcables","rw","", dia(ln("M24 42q13 6 26 0t26 0M24 52q13 6 26 0t26 0", 3) + fl("M52 56 44 66h6l-4 10 10-13h-6l4-7z"), O), "Overhead cables (roadworks)", "Temporary overhead cables at the works.", "Przewody nad drogą (roboty)", "Tymczasowe przewody nad drogą przy robotach."],
["rwqueues","rw","", rect(carTop(34,48) + carTop(50,48) + carTop(66,48) + tx("QUEUES LIKELY", 74, 9), O), "Queues likely (roadworks)", "Expect queues at the works.", "Możliwe korki (roboty)", "Spodziewaj się korków przy robotach."],
["closeNS2","rw","", lanesSign(O, ["x","o"]), "Nearside (left) lane of two closed", "The left lane is closed ahead. Move to the right lane in good time.", "Zamknięty lewy pas z dwóch", "Lewy pas jest zamknięty. Zmień pas na prawy z wyprzedzeniem."],
["closeOS2","rw","", lanesSign(O, ["o","x"]), "Offside (right) lane of two closed", "The right lane is closed ahead. Move to the left lane in good time.", "Zamknięty prawy pas z dwóch", "Prawy pas jest zamknięty. Zmień pas na lewy z wyprzedzeniem."],
["closeOS3","rw","", lanesSign(O, ["o","o","x"]), "Offside lane of three closed", "The right-hand lane of three is closed ahead.", "Zamknięty prawy pas z trzech", "Prawy z trzech pasów jest zamknięty."],
["rwclosed","rw","", rect(tx("ROAD", 46, 17) + tx("CLOSED", 66, 17), O), "Road closed", "The road is closed. Follow the detour signs.", "Droga zamknięta", "Droga zamknięta. Jedź zgodnie ze znakami objazdu."],
["detour","rw","", rect(tx("DETOUR", 50, 17) + fl("M30 60h30v-7l14 12-14 12v-7H30z"), O), "Detour", "Follow these signs to get around the closure.", "Objazd", "Jedź za tymi znakami, by ominąć zamknięcie."],
["enddetour","rw","", rect(tx("END OF", 46, 15) + tx("DETOUR", 66, 15), O), "End of detour", "The detour is over. Continue on your normal route.", "Koniec objazdu", "Koniec objazdu. Jedź dalej zwykłą trasą."],
["hardshoulder","rw","", rect(tx("HARD SHOULDER", 46, 9) + tx("CLOSED", 64, 15), O), "Hard shoulder closed", "The hard shoulder can't be used because of works.", "Pobocze utwardzone zamknięte", "Z utwardzonego pobocza nie można korzystać z powodu robót."],
["slow","rw","", rect(tx("SLOW", 59, 26), O), "Slow", "Slow down: hazards at the works.", "Zwolnij", "Zwolnij: zagrożenia przy robotach."],
["barrier","rw","", `<rect x="6" y="38" width="88" height="24" fill="${W}" stroke="${K}" stroke-width="2"/>` + [0,1,2,3,4].map(i => `<path d="M${10+i*18} 38h9l-12 24h-9z" fill="${R}"/>`).join(""), "Barrier board", "Marks the edge of works or a closed lane. Don't go past it.", "Bariera", "Oznacza krawędź robót lub zamknięty pas. Nie przejeżdżaj za nią."],
["keep15","rw","", rect(`<g transform="translate(-14 4) scale(.75)">${cyclist(50,64)}</g>` + tx("1.5 m", 58, 17, K, 68), O), "Keep 1.5 m from cyclists", "Leave at least 1.5 m when passing cyclists (more at higher speeds).", "Zachowaj 1,5 m od rowerzystów", "Wyprzedzając rowerzystów zostaw co najmniej 1,5 m (więcej przy większej prędkości)."],

// ===== Information =====
["motorwaydir","info","", rect(tx("M50", 40, 14, W) + tx("Dublin Port", 56, 11, W) + tx("Airport ✈", 70, 11, W), B, W), "Motorway direction sign (blue)", "Blue signs give directions on and to motorways.", "Drogowskaz autostradowy (niebieski)", "Niebieskie znaki wskazują kierunki na autostradach i do nich."],
["nationaldir","info","", rect(tx("N81", 40, 14, "#ffd100") + tx("Blessington", 56, 11, W) + tx("Tallaght 3", 70, 11, W), G, W), "National road sign (green)", "Green signs give directions on national roads (N roads).", "Drogowskaz na drodze krajowej (zielony)", "Zielone znaki wskazują kierunki na drogach krajowych (N)."],
["regionaldir","info","", rect(tx("R113", 40, 14) + tx("Clondalkin", 56, 11) + tx("Templeogue 4", 70, 11), W, K), "Regional / local road sign (white)", "White signs give directions on regional and local roads.", "Drogowskaz na drodze regionalnej / lokalnej (biały)", "Białe znaki wskazują kierunki na drogach regionalnych i lokalnych."],
["town","info","", rect(tx("Tamhlacht", 44, 12, K, 50, 400) + tx("Tallaght", 62, 15), W, K), "Town or village sign", "You are entering a town. A lower speed limit usually applies.", "Tablica miejscowości", "Wjeżdżasz do miejscowości. Zwykle obowiązuje niższy limit prędkości."],
["hospital","info","", sq(tx("H", 70, 56, W)), "Hospital", "A hospital ahead. Drive quietly and watch for ambulances.", "Szpital", "Przed tobą szpital. Jedź spokojnie i uważaj na karetki."],
["culdesac","info","", sq(`<rect x="44" y="34" width="12" height="44" fill="${W}"/><rect x="30" y="24" width="40" height="12" fill="${R}"/>`), "Cul-de-sac (no through road)", "The road is a dead end.", "Ślepa ulica", "Droga bez przejazdu."],
["layby","info","", sq(tx("P", 58, 40, W) + tx("Lay-by", 80, 12, W), B, W), "Lay-by", "A place to pull in off the road.", "Zatoka postojowa", "Miejsce, by zjechać z drogi i się zatrzymać."],
["disabled","info","", sq(`<circle cx="44" cy="26" r="5" fill="${W}"/>` + ln("M44 34v18h16l6 14", 5, W) + `<circle cx="44" cy="62" r="13" fill="none" stroke="${W}" stroke-width="4"/>`), "Disabled persons parking", "Parking reserved for holders of a disabled parking permit.", "Parking dla osób niepełnosprawnych", "Miejsca tylko dla posiadaczy karty parkingowej osoby niepełnosprawnej."],
["camera","info","", rect(fl("M26 40h30v20H26zM56 46l12-6v20l-12-6z") + tx("SPEED", 74, 10), W, K), "Speed camera", "Speed is checked by camera on this road.", "Fotoradar", "Na tej drodze prędkość mierzy fotoradar."],
["slchange","info","", rect(`<circle cx="30" cy="50" r="17" fill="${W}" stroke="${R}" stroke-width="5"/>` + tx("60", 56, 15, K, 30) + tx("AHEAD", 55, 13, K, 68), W, K), "Speed limit change ahead", "The speed limit changes ahead. Be ready to adjust.", "Zmiana ograniczenia prędkości", "Dalej zmienia się ograniczenie prędkości."],
["calming","info","", tall(`<circle cx="50" cy="34" r="16" fill="${W}" stroke="${R}" stroke-width="5"/>` + tx("30", 40, 15) + tx("TRAFFIC", 66, 10) + tx("CALMING", 78, 10), W, K), "Traffic calming", "Traffic calming measures (ramps, chicanes) ahead.", "Strefa uspokojonego ruchu", "Przed tobą elementy uspokajające ruch (progi, szykany)."],
["ramps","info","", rect(humps.replace('stroke-width="6"','stroke-width="5"') + tx("RAMPS", 40, 12), W, K), "Ramps on road", "Speed ramps ahead. Slow down.", "Progi zwalniające", "Przed tobą progi zwalniające. Zwolnij."],
["sos","info","", sq(tx("SOS", 62, 28, W), B, W), "SOS lay-by", "An emergency lay-by with a phone.", "Zatoka SOS", "Awaryjna zatoka z telefonem."],
["tourist","info","", rect(tx("Glendalough", 46, 12, W) + tx("Gleann Dá Loch", 62, 10, W, 50, 400), BR, W), "Tourist attraction (brown)", "Brown signs show tourist attractions.", "Atrakcja turystyczna (brązowy)", "Brązowe znaki wskazują atrakcje turystyczne."],

// ===== Motorway =====
["mwstart","mw","", sq(`<rect x="20" y="24" width="60" height="9" fill="${W}"/>` + fl("M22 80 38 40h7l-9 40zM78 80 62 40h-7l9 40z", W) + `<rect x="47.5" y="44" width="5" height="9" fill="${W}"/><rect x="47.5" y="60" width="5" height="10" fill="${W}"/>`), "Motorway (entry / motorway ahead)", "The start of a motorway. Motorway rules apply: no learner drivers, no pedestrians, cyclists or slow vehicles.", "Autostrada", "Początek autostrady. Obowiązują zasady autostrady: zakaz dla kierowców z learner permit, pieszych, rowerzystów i wolnych pojazdów."],
["mwend","mw","", sq(`<rect x="20" y="24" width="60" height="9" fill="${W}"/>` + fl("M22 80 38 40h7l-9 40zM78 80 62 40h-7l9 40z", W) + `<rect x="47.5" y="44" width="5" height="9" fill="${W}"/><rect x="47.5" y="60" width="5" height="10" fill="${W}"/><path d="M18 82 82 18" stroke="${R}" stroke-width="8"/>`), "End of motorway", "The motorway ends. Watch for the new speed limit.", "Koniec autostrady", "Koniec autostrady. Zwróć uwagę na nowe ograniczenie prędkości."],
["count3","mw","", tall([0,1,2].map(i => `<path d="M30 ${30+i*16}l40-10v8l-40 10z" fill="${W}"/>`).join(""), B, W), "300 m to next exit", "Countdown marker: 300 m to the exit (then 200 m and 100 m).", "300 m do zjazdu", "Tablica odliczająca: 300 m do zjazdu (potem 200 i 100 m)."],
["toll","mw","", rect(tx("TOLL", 46, 18, W) + tx("Dola", 64, 12, W, 50, 400), B, W), "Toll plaza ahead", "A toll plaza ahead. Have payment ready and pick the right lane.", "Punkt poboru opłat", "Przed tobą bramki z opłatą. Przygotuj płatność i wybierz właściwy pas."],
["garda","mw","", rect(tx("GARDA", 46, 16, W) + tx("ONLY", 64, 14, W), B, W), "Garda only", "This crossing or lane is for Garda vehicles only.", "Tylko dla Gardy", "Ten przejazd lub pas jest tylko dla pojazdów Gardy."],
];

// ---------- hand signals and Garda signals (pictures) ----------
const carRear = arm => `<rect x="18" y="40" width="64" height="40" rx="8" fill="#2a3a55"/><rect x="24" y="28" width="52" height="20" rx="6" fill="#3a4e72"/><rect x="28" y="31" width="44" height="13" rx="3" fill="#9fc3e8"/><rect x="22" y="66" width="12" height="6" rx="2" fill="${R}"/><rect x="66" y="66" width="12" height="6" rx="2" fill="${R}"/><rect x="18" y="80" width="12" height="10" rx="2" fill="${K}"/><rect x="70" y="80" width="12" height="10" rx="2" fill="${K}"/>${arm}`;
const armC = "#e8b48a";
const SIG = [
["sigRight","driver", carRear(`<path d="M74 40h22" stroke="${armC}" stroke-width="6" stroke-linecap="round"/><rect x="92" y="33" width="6" height="14" rx="3" fill="${armC}"/>`), "Turning right or moving out", "Extend your right arm fully out of the window, palm facing forward, and hold it level and still.", "Skręt w prawo lub zjazd na prawo", "Wysuń prawą rękę przez okno, wyprostowaną, dłonią do przodu, i trzymaj ją poziomo, nieruchomo."],
["sigLeft","driver", carRear(`<path d="M74 40h18" stroke="${armC}" stroke-width="6" stroke-linecap="round"/><circle cx="92" cy="40" r="4" fill="${armC}"/><path d="M84 26a10 10 0 1 0 14 4" fill="none" stroke="${B}" stroke-width="2.5"/><path d="M96 22l3 8-8-1z" fill="${B}"/>`), "Turning left or moving in", "Extend your right arm out of the window and rotate it in an anti-clockwise circle.", "Skręt w lewo lub zjazd na lewo", "Wysuń prawą rękę przez okno i zataczaj nią koła przeciwnie do ruchu wskazówek zegara."],
["sigSlow","driver", carRear(`<path d="M74 40h18" stroke="${armC}" stroke-width="6" stroke-linecap="round"/><rect x="88" y="37" width="12" height="6" rx="3" fill="${armC}"/><path d="M94 30V18M94 50v12" stroke="${B}" stroke-width="2.5"/><path d="M90 22l4-6 4 6zM90 58l4 6 4-6z" fill="${B}"/>`), "Slowing down or stopping", "Extend your right arm, palm facing down, and move it slowly up and down.", "Zwalnianie lub zatrzymywanie się", "Wysuń prawą rękę dłonią w dół i powoli poruszaj nią w górę i w dół."],
["sigPtAhead","pointsman", carRear(`<path d="M74 44h10V24" stroke="${armC}" stroke-width="6" stroke-linecap="round" fill="none"/><rect x="80" y="14" width="8" height="12" rx="3" fill="${armC}"/>`), "To a Garda on point duty: going straight ahead", "Raise your right forearm and hand upwards, palm to the front.", "Do policjanta kierującego ruchem: jazda prosto", "Unieś prawe przedramię i dłoń do góry, dłonią do przodu."],
["sigPtLeft","pointsman", carRear(`<path d="M74 42h8l-14-2" stroke="${armC}" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M68 40H54" stroke="${armC}" stroke-width="4" stroke-linecap="round"/>`), "To a Garda on point duty: turning left", "Point your right forearm and hand (fingers extended) to the left, across the front of you.", "Do policjanta kierującego ruchem: skręt w lewo", "Wskaż prawym przedramieniem i dłonią (palce wyprostowane) w lewo, przed sobą."],
["sigPtRight","pointsman", carRear(`<path d="M74 40h22" stroke="${armC}" stroke-width="6" stroke-linecap="round"/><rect x="92" y="33" width="6" height="14" rx="3" fill="${armC}"/>`), "To a Garda on point duty: turning right", "Same as the normal right-turn signal: right arm straight out, palm to the front.", "Do policjanta kierującego ruchem: skręt w prawo", "Tak samo jak zwykły sygnał skrętu w prawo: prawa ręka wyprostowana, dłonią do przodu."],
];
const garda = arms => `<circle cx="50" cy="20" r="8" fill="${armC}"/><path d="M42 14h16l-2-6H44z" fill="#14213d"/><rect x="38" y="28" width="24" height="34" rx="5" fill="#14213d"/><rect x="38" y="40" width="24" height="7" fill="#c8f04a"/><rect x="40" y="62" width="8" height="30" fill="#14213d"/><rect x="52" y="62" width="8" height="30" fill="#14213d"/>${arms}`;
const GSIG = [
["gFront","garda", garda(`<path d="M40 32 30 8" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><circle cx="29" cy="5" r="4" fill="${armC}"/><path d="M60 32 66 58" stroke="#14213d" stroke-width="7" stroke-linecap="round"/>`), "Garda: traffic from the FRONT must stop", "The Garda (facing you) raises the right arm straight up above the shoulder. If you're approaching from the front, stop.", "Policjant: STOP dla jadących z PRZODU", "Policjant (zwrócony do ciebie) podnosi prawą rękę wysoko nad ramię. Jeśli nadjeżdżasz z przodu, zatrzymaj się."],
["gBehind","garda", garda(`<path d="M60 32H88" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><circle cx="91" cy="32" r="4" fill="${armC}"/><path d="M40 32 34 58" stroke="#14213d" stroke-width="7" stroke-linecap="round"/>`), "Garda: traffic from BEHIND must stop", "The Garda holds the left arm out horizontally from the shoulder. If you're approaching from behind, stop.", "Policjant: STOP dla jadących z TYŁU", "Policjant wyciąga lewą rękę poziomo w bok. Jeśli nadjeżdżasz od tyłu, zatrzymaj się."],
["gBoth","garda", garda(`<path d="M40 32 30 8" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><circle cx="29" cy="5" r="4" fill="${armC}"/><path d="M60 32H88" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><circle cx="91" cy="32" r="4" fill="${armC}"/>`), "Garda: traffic from FRONT and BEHIND must stop", "Right arm straight up and left arm out horizontally: traffic from both front and behind must stop.", "Policjant: STOP z przodu i z tyłu", "Prawa ręka w górze, lewa poziomo w bok: zatrzymują się jadący z przodu i z tyłu."],
["gBeckon","garda", garda(`<path d="M60 32 74 40 70 24" stroke="#14213d" stroke-width="7" stroke-linecap="round" fill="none"/><circle cx="70" cy="20" r="4" fill="${armC}"/><path d="M80 18q8 8 0 18" stroke="${B}" stroke-width="2.5" fill="none"/><path d="M40 32 34 58" stroke="#14213d" stroke-width="7" stroke-linecap="round"/>`), "Garda: beckoning traffic on", "The Garda waves the hand and forearm towards themselves: the traffic being beckoned (from the front, left or right) may go.", "Policjant: przywołanie do jazdy", "Policjant macha dłonią i przedramieniem do siebie: przywoływani kierowcy (z przodu, z lewej lub z prawej) mogą jechać."],
["gLane","garda", garda(`<path d="M60 32 84 46" stroke="#14213d" stroke-width="7" stroke-linecap="round"/><path d="M84 46l8 4" stroke="${armC}" stroke-width="4" stroke-linecap="round"/><path d="M40 32 34 58" stroke="#14213d" stroke-width="7" stroke-linecap="round"/>`), "Garda: move into a lane", "The Garda points at a particular lane: move into that lane.", "Policjant: zmień pas", "Policjant wskazuje konkretny pas: wjedź na ten pas."],
["gWarden","garda", `<circle cx="40" cy="22" r="8" fill="${armC}"/><rect x="28" y="30" width="24" height="34" rx="5" fill="#ffd100"/><rect x="31" y="64" width="8" height="28" fill="#14213d"/><rect x="41" y="64" width="8" height="28" fill="#14213d"/><path d="M52 36 64 30" stroke="#ffd100" stroke-width="7" stroke-linecap="round"/><rect x="65" y="22" width="3" height="60" fill="${K}"/><circle cx="66.5" cy="22" r="17" fill="${W}" stroke="${R}" stroke-width="4"/><text x="66.5" y="26" text-anchor="middle" font-family="Arial" font-weight="700" font-size="10" fill="${R}">STOP</text>`, "School warden", "When the warden steps out holding up the STOP sign, stop and wait until the children have crossed and the warden is back on the path.", "Opiekun przejścia szkolnego", "Gdy opiekun wychodzi z podniesioną tarczą STOP, zatrzymaj się i czekaj, aż dzieci przejdą, a opiekun wróci na chodnik."],
];

// ---------- traffic lights and road markings ----------
const tl = (on, arrow) => `<rect x="34" y="6" width="32" height="88" rx="9" fill="${K}"/>` + [[R,24],["#f5a400",50],["#1aa64a",76]].map(([c,y]) => `<circle cx="50" cy="${y}" r="10" fill="${on.includes(c) ? c : "#333"}"/>`).join("") + (arrow ? `<path d="M44 76h10v-5l7 5-7 5v-5H44z" fill="#1aa64a"/>` : "");
const road = inner => `<rect x="0" y="0" width="100" height="100" fill="#3b3f46"/>${inner}`;
const LM = [
["lRed","light", tl([R]), "Red light", "Stop. Don't go past the stop line (or the light, if there is no line).", "Czerwone światło", "Stój. Nie przekraczaj linii zatrzymania (albo sygnalizatora, jeśli linii nie ma)."],
["lAmber","light", tl(["#f5a400"]), "Amber light", "Stop at the stop line, unless you're so close that stopping suddenly would be dangerous. In Ireland amber comes after green, and red goes straight back to green.", "Żółte światło", "Zatrzymaj się przed linią, chyba że jesteś tak blisko, że nagłe hamowanie byłoby niebezpieczne. W Irlandii po zielonym jest żółte, a po czerwonym od razu zielone."],
["lGreen","light", tl(["#1aa64a"]), "Green light", "You may go if the way is clear. Green doesn't give you right of way: give way to pedestrians still crossing and take care when turning.", "Zielone światło", "Możesz jechać, jeśli droga jest wolna. Zielone nie daje pierwszeństwa: przepuść pieszych, którzy jeszcze przechodzą, i uważaj przy skręcie."],
["lFilter","light", tl([R], true), "Green filter arrow", "You may go in the direction of the arrow if it is safe, even while the main light is red.", "Zielona strzałka (filtr)", "Możesz jechać w kierunku strzałki, jeśli jest bezpiecznie, nawet gdy główne światło jest czerwone."],
["lFlash","light", tl(["#f5a400"]) + `<circle cx="50" cy="50" r="15" fill="none" stroke="#f5a400" stroke-width="2" stroke-dasharray="4 4"/>`, "Flashing amber (pelican crossing)", "Give way to pedestrians on the crossing. If it's clear, you may go.", "Migające żółte (przejście pelican)", "Ustąp pieszym na przejściu. Jeśli przejście jest wolne, możesz jechać."],
["lOut","light", `<rect x="34" y="6" width="32" height="88" rx="9" fill="${K}"/><circle cx="50" cy="24" r="10" fill="#333"/><circle cx="50" cy="50" r="10" fill="#333"/><circle cx="50" cy="76" r="10" fill="#333"/>`, "Lights out of order", "Treat it with great care: stop at the line and go only when safe, giving way to traffic with right of way.", "Sygnalizacja nie działa", "Zachowaj dużą ostrożność: zatrzymaj się przy linii i jedź tylko, gdy jest bezpiecznie, ustępując pojazdom z pierwszeństwem."],
["mSolid","mark", road(`<rect x="47" y="0" width="6" height="100" fill="${W}"/>`), "Continuous white centre line", "Don't cross or straddle it. Keep to the left of the line (except in an emergency or for access).", "Ciągła biała linia środkowa", "Nie przekraczaj jej i nie najeżdżaj. Trzymaj się z lewej strony linii (poza sytuacją awaryjną lub dojazdem)."],
["mBroken","mark", road([0,1,2,3].map(i => `<rect x="47" y="${i*28}" width="6" height="12" fill="${W}"/>`).join("")), "Short broken white centre line", "Divides traffic in opposite directions. You may cross it only when it's safe.", "Przerywana biała linia środkowa", "Oddziela kierunki ruchu. Możesz ją przekroczyć tylko, gdy jest bezpiecznie."],
["mWarn","mark", road([0,1,2].map(i => `<rect x="47" y="${i*36}" width="6" height="28" fill="${W}"/>`).join("")), "Warning line (long dashes, short gaps)", "Warns of a hazard ahead such as a bend, hill, junction or poor visibility. Don't cross unless it's safe.", "Linia ostrzegawcza (długie kreski)", "Ostrzega przed zagrożeniem: zakrętem, wzniesieniem, skrzyżowaniem lub słabą widocznością. Nie przekraczaj, chyba że jest bezpiecznie."],
["mDoubleBroken","mark", road([0,1,2,3].map(i => `<rect x="42" y="${i*28}" width="5" height="12" fill="${W}"/><rect x="53" y="${i*28}" width="5" height="12" fill="${W}"/>`).join("")), "Double broken white lines", "Warn that continuous white lines are coming up.", "Podwójna linia przerywana", "Ostrzega, że zaraz zacznie się linia ciągła."],
["mMixed","mark", road(`<rect x="42" y="0" width="5" height="100" fill="${W}"/>` + [0,1,2,3].map(i => `<rect x="53" y="${i*28}" width="5" height="12" fill="${W}"/>`).join("") + `<text x="76" y="94" font-size="9" fill="${W}" font-family="Arial">you</text>`), "Broken line beside a continuous line", "Obey the line nearest to you. If the broken line is on your side you may cross with care; if the continuous one is, you must not.", "Linia przerywana obok ciągłej", "Stosuj się do linii bliższej tobie. Jeśli po twojej stronie jest przerywana, możesz ostrożnie przekroczyć; jeśli ciągła, nie wolno."],
["mYellowEdge","mark", road([0,1,2,3].map(i => `<rect x="14" y="${i*28}" width="5" height="16" fill="#ffd100"/>`).join("") + `<rect x="47" y="0" width="6" height="100" fill="${W}" opacity=".0"/>`), "Broken yellow edge line (hard shoulder)", "Marks the hard shoulder, mainly for pedestrians and cyclists. You may briefly pull in to let faster traffic pass if it is safe.", "Przerywana żółta linia krawędziowa (pobocze)", "Oznacza utwardzone pobocze, głównie dla pieszych i rowerzystów. Możesz na chwilę zjechać, by przepuścić szybsze pojazdy, jeśli to bezpieczne."],
["mStop","mark", road(`<rect x="10" y="40" width="80" height="8" fill="${W}"/><text x="50" y="80" text-anchor="middle" font-size="20" font-weight="700" fill="${W}" font-family="Arial">STOP</text>`), "Stop line", "A continuous white line across the road with STOP: you must stop completely before it.", "Linia zatrzymania (STOP)", "Ciągła biała linia w poprzek jezdni z napisem STOP: musisz się przed nią całkowicie zatrzymać."],
["mYield","mark", road([0,1,2,3,4].map(i => `<rect x="${8+i*18}" y="36" width="10" height="7" fill="${W}"/>`).join("") + `<path d="M34 56h32L50 86z" fill="none" stroke="${W}" stroke-width="4"/>`), "Yield line", "A broken white line across the road (often with a triangle): give way to traffic on the major road.", "Linia ustąp pierwszeństwa", "Przerywana biała linia w poprzek jezdni (często z trójkątem): ustąp pojazdom na drodze głównej."],
["mBox","mark", road(`<rect x="12" y="12" width="76" height="76" fill="none" stroke="#ffd100" stroke-width="4"/>` + [-60,-30,0,30,60].map(o => `<path d="M${12+o} 12 ${88+o} 88M${88-o} 12 ${12-o} 88" stroke="#ffd100" stroke-width="3" clip-path="url(#bxc)"/>`).join("") + `<clipPath id="bxc"><rect x="12" y="12" width="76" height="76"/></clipPath>`), "Yellow box junction", "Don't enter the box unless you can clear it without stopping. You may wait in it to turn right if only oncoming traffic stops you.", "Żółta kratka (box junction)", "Nie wjeżdżaj na kratkę, jeśli nie możesz z niej zjechać bez zatrzymania. Możesz na niej czekać na skręt w prawo, jeśli blokuje cię tylko ruch z naprzeciwka."],
["mSingleYellow","mark", road(`<rect x="12" y="0" width="5" height="100" fill="#ffd100"/>`), "Single yellow line", "No parking during the times shown on the nearby plate.", "Pojedyncza żółta linia", "Zakaz parkowania w godzinach podanych na pobliskiej tabliczce."],
["mDoubleYellow","mark", road(`<rect x="10" y="0" width="4" height="100" fill="#ffd100"/><rect x="18" y="0" width="4" height="100" fill="#ffd100"/>`), "Double yellow lines", "No parking at any time.", "Podwójna żółta linia", "Całkowity zakaz parkowania."],
["mZigzag","mark", road(`<path d="M14 0l8 10-8 10 8 10-8 10 8 10-8 10 8 10-8 10 8 10-8 10" fill="none" stroke="${W}" stroke-width="3"/>` + [0,1,2,3,4].map(i => `<rect x="34" y="${i*20+4}" width="56" height="10" fill="${W}"/>`).join("")), "Zig-zag lines at a crossing", "No parking or overtaking on the approach to a pedestrian crossing. Yellow zig-zags with SCHOOL KEEP CLEAR: no parking at the school entrance.", "Linie zygzakowe przy przejściu", "Zakaz parkowania i wyprzedzania przed przejściem dla pieszych. Żółte zygzaki z napisem SCHOOL KEEP CLEAR: zakaz parkowania przed wejściem do szkoły."],
["mHatch","mark", road(`<path d="M50 6 26 94M50 6 74 94" stroke="${W}" stroke-width="3" fill="none"/>` + [0,1,2,3,4].map(i => `<path d="M${46-i*4} ${22+i*16} ${54+i*4} ${30+i*16}" stroke="${W}" stroke-width="3"/>`).join("")), "Hatched markings", "Separate traffic or protect turning traffic. Don't drive on them.", "Powierzchnia wyłączona z ruchu (kreskowanie)", "Rozdzielają ruch lub chronią skręcające pojazdy. Nie wjeżdżaj na nie."],
["mBus","mark", road(`<rect x="62" y="0" width="5" height="100" fill="${W}"/><text x="82" y="44" text-anchor="middle" font-size="11" font-weight="700" fill="${W}" font-family="Arial" transform="rotate(-90 82 50)">LÁNA BUS</text>`), "Bus lane (continuous line)", "Don't drive in it during its hours (shown on the sign). A broken line lets you cross into it to turn.", "Buspas (linia ciągła)", "Nie wjeżdżaj na niego w godzinach jego obowiązywania (podanych na znaku). Linia przerywana pozwala go przeciąć, by skręcić."],
["mCycleBox","mark", road(`<rect x="8" y="30" width="84" height="6" fill="${W}"/><rect x="8" y="62" width="84" height="6" fill="${W}"/><rect x="8" y="36" width="84" height="26" fill="#2e8b57" opacity=".7"/>` + bike(50,50,.6,W)), "Advanced stop line for cyclists", "Wait behind the first white line when the light is red and leave the box for cyclists.", "Śluza rowerowa", "Przy czerwonym czekaj za pierwszą białą linią i zostaw pole dla rowerzystów."],
["mTurnBox","mark", road(`<rect x="30" y="20" width="40" height="40" fill="none" stroke="${W}" stroke-width="3"/>` + ln("M50 54V38q0-6 6-6h4", 4, W) + `<path d="M58 26 66 32 58 38z" fill="${W}"/>`), "Right-turn box", "Shows where to wait to turn right. Enter on green and finish the turn when oncoming traffic allows.", "Pole oczekiwania na skręt w prawo", "Pokazuje, gdzie czekać na skręt w prawo. Wjedź na zielonym i dokończ skręt, gdy pozwoli ruch z naprzeciwka."],
];

// ---------- UI strings ----------
const TX2 = {
  en:{title:"Theory test prep", kicker:"Signs, signals and lights", open:"Signs & signals", openSub:"All road signs, hand signals, Garda signals, lights and road markings, with a quiz", tabs:["Signs","Hand signals","Lights & lines","Quiz"],
    g:{all:"All", reg:"Regulatory", warn:"Warning", rw:"Roadworks", info:"Information", mw:"Motorway"}, search:"Search signs", driver:"Your hand signals (driver)", pointsman:"Signals to a Garda on point duty", garda:"Signals given by a Garda or warden", light:"Traffic lights", mark:"Road markings",
    note:"Before the drive the tester asks you some Rules of the Road questions, shows you road signs to name, and asks you to demonstrate hand signals. Know each sign's shape and colour: circles give orders, yellow diamonds warn, orange is roadworks, rectangles inform.",
    limits:"Default speed limits: motorways 120 km/h · national roads 100 (many national secondary roads now 80 where signed) · regional roads 80 · rural local roads 60 (since Feb 2025) · towns 50 · many urban streets 30. Signs always win.",
    q:"What does this sign mean?", qs:"What does this signal mean?", score:"{a} of {b} right", next:"Next", again:"New quiz", missed:"Practise the ones you missed", none:"All correct, nice!", known:"{n} of {t} answered right at least once", src:"Sign pictures: Wikimedia Commons where available; meanings follow the RSA Rules of the Road. Signals from the Road Traffic (Traffic and Parking) Regulations.", modeSigns:"Signs", modeSignals:"Signals & lines", modeMixed:"Everything", close:"Close"},
  pl:{title:"Przygotowanie do pytań", kicker:"Znaki, sygnały i światła", open:"Znaki i sygnały", openSub:"Wszystkie znaki drogowe, sygnały ręczne, sygnały Gardy, światła i oznakowanie poziome, z quizem", tabs:["Znaki","Sygnały ręczne","Światła i linie","Quiz"],
    g:{all:"Wszystkie", reg:"Nakazy i zakazy", warn:"Ostrzegawcze", rw:"Roboty drogowe", info:"Informacyjne", mw:"Autostrada"}, search:"Szukaj znaku", driver:"Twoje sygnały ręczne (kierowca)", pointsman:"Sygnały do policjanta kierującego ruchem", garda:"Sygnały policjanta (Garda) lub opiekuna", light:"Sygnalizacja świetlna", mark:"Oznakowanie poziome",
    note:"Przed jazdą egzaminator zadaje kilka pytań z przepisów (Rules of the Road), pokazuje znaki do nazwania i prosi o pokazanie sygnałów ręcznych. Egzamin jest po angielsku, więc pod każdym znakiem jest też jego angielska nazwa. Kształt i kolor: koła nakazują lub zakazują, żółte romby ostrzegają, pomarańczowe to roboty, prostokąty informują.",
    limits:"Domyślne limity: autostrady 120 km/h · drogi krajowe 100 (wiele drugorzędnych krajowych teraz 80, jeśli oznakowano) · regionalne 80 · wiejskie drogi lokalne 60 (od lutego 2025) · miasta 50 · wiele ulic 30. Znaki zawsze mają pierwszeństwo.",
    q:"Co oznacza ten znak?", qs:"Co oznacza ten sygnał?", score:"{a} z {b} dobrze", next:"Dalej", again:"Nowy quiz", missed:"Powtórz błędne", none:"Wszystko dobrze, brawo!", known:"{n} z {t} odpowiedzianych dobrze przynajmniej raz", src:"Obrazki znaków: Wikimedia Commons, gdy dostępne; znaczenia według RSA Rules of the Road. Sygnały według Road Traffic (Traffic and Parking) Regulations.", modeSigns:"Znaki", modeSignals:"Sygnały i linie", modeMixed:"Wszystko", close:"Zamknij"},
};
const tt = k => (TX2[lang]||TX2.en)[k] ?? TX2.en[k];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m,k) => v[k]);

// ---------- one list for everything ----------
const ITEMS = [
  ...S.map(r => ({id:r[0], g:r[1], code:r[2], svg:r[3], en:r[4], ex:r[5], pl:r[6], px:r[7], kind:"sign"})),
  ...[...SIG, ...GSIG].map(r => ({id:r[0], g:r[1], svg:r[2], en:r[3], ex:r[4], pl:r[5], px:r[6], kind:"signal"})),
  ...LM.map(r => ({id:r[0], g:r[1], svg:r[2], en:r[3], ex:r[4], pl:r[5], px:r[6], kind:"line"})),
];
const BYID = Object.fromEntries(ITEMS.map(x => [x.id, x]));
const nm = x => lang==="pl" ? x.pl : x.en, expl = x => lang==="pl" ? x.px : x.ex;
const svgOf = (x, cls="") => `<svg class="${cls}" viewBox="${x.kind==="signal" && x.g!=="garda" ? "0 0 104 100" : "0 0 100 100"}" aria-hidden="true">${x.svg}</svg>`;
const official = code => `https://commons.wikimedia.org/wiki/Special:FilePath/IE_road_sign_${code}.svg?width=180`;
// Swap in the official diagram once (and only if) it loads; the drawing stays otherwise.
function upgrade(root){
  root.querySelectorAll("[data-code]").forEach(el => {
    const code = el.dataset.code; el.removeAttribute("data-code");
    const im = new Image(); im.alt = ""; im.decoding = "async"; im.referrerPolicy = "no-referrer";
    im.onload = () => { if(im.naturalWidth > 10){ el.innerHTML=""; el.appendChild(im); el.classList.add("off"); } };
    im.src = official(code);
  });
}
const pic = x => `<span class="tpic" ${x.code ? `data-code="${x.code}"` : ""}>${svgOf(x)}</span>`;

// ---------- progress (which ones you've got right) ----------
let known = store.get("ttr-th-known", {}), miss = store.get("ttr-th-miss", {});
const saveProg = () => { store.set("ttr-th-known", known); store.set("ttr-th-miss", miss); };

// ---------- overlay ----------
let ttab = 0, tgroup = "all", tq = "", quiz = null;
function card(x){
  return `<div class="tcard${known[x.id] ? " ok" : ""}">${pic(x)}<div class="tmeta"><b>${esc(nm(x))}</b>${lang==="pl" ? `<i>${esc(x.en)}</i>` : ""}<small>${esc(expl(x))}</small></div></div>`;
}
function renderTheory(){
  const box = $("thBody"); if(!box) return;
  $("thTitle").textContent = tt("title"); $("thKicker").textContent = tt("kicker");
  $("thTabs").innerHTML = tt("tabs").map((l,i) => `<button type="button" data-tt="${i}" aria-pressed="${i===ttab}">${esc(l)}</button>`).join("");
  let h = "";
  if(ttab===0){
    const groups = ["all","reg","warn","rw","info","mw"];
    h += `<p class="note">${esc(tt("note"))}</p><p class="tlim">${esc(tt("limits"))}</p>`;
    h += `<input class="tsearch" id="thSearch" type="search" placeholder="${esc(tt("search"))}" value="${esc(tq)}">`;
    h += `<div class="tchips">${groups.map(g => `<button type="button" data-tg="${g}" aria-pressed="${g===tgroup}">${esc(tt("g")[g])}</button>`).join("")}</div>`;
    const q = tq.trim().toLowerCase();
    const list = ITEMS.filter(x => x.kind==="sign" && (tgroup==="all" || x.g===tgroup) && (!q || (x.en+" "+x.pl+" "+x.ex+" "+x.px).toLowerCase().includes(q)));
    for(const g of groups.slice(1)){
      const part = list.filter(x => x.g===g); if(!part.length) continue;
      h += `<div class="tsub">${esc(tt("g")[g])} · ${part.length}</div><div class="tgrid">${part.map(card).join("")}</div>`;
    }
    const tot = ITEMS.length, kn = ITEMS.filter(x => known[x.id]).length;
    h += `<p class="note">${esc(fill(tt("known"), {n:kn, t:tot}))}</p><p class="note">${esc(tt("src"))}</p>`;
  } else if(ttab===1){
    for(const g of ["driver","pointsman","garda"]) h += `<div class="tsub">${esc(tt(g))}</div><div class="tgrid wide">${ITEMS.filter(x => x.g===g).map(card).join("")}</div>`;
  } else if(ttab===2){
    for(const g of ["light","mark"]) h += `<div class="tsub">${esc(tt(g))}</div><div class="tgrid">${ITEMS.filter(x => x.g===g).map(card).join("")}</div>`;
  } else h += quizHtml();
  box.innerHTML = h;
  upgrade(box);
  const s = $("thSearch"); if(s){ s.oninput = () => { tq = s.value; const pos=s.selectionStart; renderTheory(); const n=$("thSearch"); n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} }; }
}
// ---------- quiz ----------
const shuffle = a => { a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
function newQuiz(mode, onlyMissed){
  let pool = ITEMS.filter(x => mode==="signs" ? x.kind==="sign" : mode==="signals" ? x.kind!=="sign" : true);
  if(onlyMissed){ const m = pool.filter(x => miss[x.id]); if(m.length) pool = m; }
  // prefer ones you haven't got right yet
  const fresh = shuffle(pool.filter(x => !known[x.id])), rest = shuffle(pool.filter(x => known[x.id]));
  quiz = {mode, list:[...fresh, ...rest].slice(0, 15), i:0, right:0, wrong:[], picked:null};
  quiz.opts = makeOpts(quiz.list[0]);
}
function makeOpts(x){
  const same = ITEMS.filter(y => y.id!==x.id && y.kind===x.kind && (y.g===x.g || x.kind!=="sign")), other = ITEMS.filter(y => y.id!==x.id && y.kind===x.kind);
  const pick = shuffle(same.length >= 3 ? same : other).filter((y,i,a) => a.findIndex(z => nm(z)===nm(y))===i && nm(y)!==nm(x)).slice(0,3);
  return shuffle([x, ...pick]);
}
function quizHtml(){
  const modes = [["signs",tt("modeSigns")],["signals",tt("modeSignals")],["mixed",tt("modeMixed")]];
  let h = `<div class="tchips">${modes.map(([k,l]) => `<button type="button" data-qm="${k}" aria-pressed="${!!quiz && quiz.mode===k}">${esc(l)}</button>`).join("")}</div>`;
  if(!quiz) newQuiz("signs");
  const q = quiz;
  if(q.i >= q.list.length){
    h += `<div class="qdone"><b>${esc(fill(tt("score"), {a:q.right, b:q.list.length}))}</b>${q.wrong.length ? q.wrong.map(id => card(BYID[id])).join("") : `<p>${esc(tt("none"))}</p>`}</div>`;
    h += `<div class="qbtns"><button class="btn primary" type="button" data-qa="again">${esc(tt("again"))}</button>${q.wrong.length ? `<button class="btn ghost" type="button" data-qa="missed">${esc(tt("missed"))}</button>` : ""}</div>`;
    return h;
  }
  const x = q.list[q.i];
  h += `<div class="qhead"><span>${q.i+1} / ${q.list.length}</span><span>${esc(fill(tt("score"), {a:q.right, b:q.i}))}</span></div>`;
  h += `<div class="qpic">${pic(x)}</div><p class="qq">${esc(x.kind==="sign" ? tt("q") : tt("qs"))}</p><div class="qopts">`;
  h += q.opts.map((o,i) => { const st = q.picked==null ? "" : o.id===x.id ? "right" : i===q.picked ? "wrong" : "";
    return `<button type="button" class="qo ${st}" data-qo="${i}" ${q.picked!=null ? "disabled" : ""}>${esc(nm(o))}${lang==="pl" ? `<i>${esc(o.en)}</i>` : ""}</button>`; }).join("");
  h += `</div>`;
  if(q.picked!=null) h += `<p class="qex">${esc(expl(x))}</p><div class="qbtns"><button class="btn primary" type="button" data-qa="next">${esc(tt("next"))}</button></div>`;
  return h;
}
function answer(i){
  const q=quiz, x=q.list[q.i]; if(q.picked!=null) return;
  q.picked = i;
  if(q.opts[i].id===x.id){ q.right++; known[x.id]=1; delete miss[x.id]; }
  else { q.wrong.push(x.id); miss[x.id]=1; }
  saveProg(); renderTheory();
}

// ---------- wiring ----------
function openTheory(t){ if(t!=null) ttab=t; $("theory").hidden=false; renderTheory(); $("thBody").scrollTop=0; }
window.openTheory = openTheory; window.renderTheory = renderTheory;
document.addEventListener("click", e => {
  const el = e.target.closest("[data-tt],[data-tg],[data-qo],[data-qa],[data-qm],[data-topen]"); if(!el) return;
  if(el.dataset.topen!=null) return openTheory(+el.dataset.topen);
  if(el.dataset.tt!=null){ ttab=+el.dataset.tt; renderTheory(); $("thBody").scrollTop=0; }
  else if(el.dataset.tg){ tgroup=el.dataset.tg; renderTheory(); }
  else if(el.dataset.qo!=null) answer(+el.dataset.qo);
  else if(el.dataset.qm){ newQuiz(el.dataset.qm); renderTheory(); }
  else if(el.dataset.qa==="next"){ quiz.i++; quiz.picked=null; if(quiz.i < quiz.list.length) quiz.opts = makeOpts(quiz.list[quiz.i]); renderTheory(); $("thBody").scrollTop=0; }
  else if(el.dataset.qa==="again"){ newQuiz(quiz.mode); renderTheory(); }
  else if(el.dataset.qa==="missed"){ newQuiz(quiz.mode, true); renderTheory(); }
});
$("thClose").onclick = () => { $("theory").hidden = true; };
function renderEntry(){
  const kn = ITEMS.filter(x => known[x.id]).length;
  $("thEntry").innerHTML = `<button class="thopen" type="button" data-topen="0"><span class="orb">${ico("give_way")}</span><span class="meta"><b>${esc(tt("open"))}</b><small>${esc(tt("openSub"))}</small></span><em>${kn}/${ITEMS.length}</em></button>
    <div class="thquick"><button type="button" class="chip" data-topen="1">${esc(tt("tabs")[1])}</button><button type="button" class="chip" data-topen="2">${esc(tt("tabs")[2])}</button><button type="button" class="chip" data-topen="3">${esc(tt("tabs")[3])}</button></div>`;
}
window.renderTheoryEntry = () => { renderEntry(); if(!$("theory").hidden) renderTheory(); };
renderEntry();
window.__theory = {ITEMS, S, SIG, GSIG, LM};
})();
