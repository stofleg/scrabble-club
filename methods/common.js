"use strict";
/* ══════════════════════════════════════════
   COMMON.JS — Code partagé entre METHODS et THEMODS
══════════════════════════════════════════ */


/* ── Index anagrammes ── */
let _anaIdx = null;
function getAnagramCount(canon){
  if(!canon) return 0;
  if(!_anaIdx){
    _anaIdx = new Map();
    for(const w of getDictArr()){
      const key = w.split("").sort().join("");
      _anaIdx.set(key, (_anaIdx.get(key)||0)+1);
    }
  }
  const key = canon.split("").sort().join("");
  return (_anaIdx.get(key)||1)-1;
}

/* ── Rallonges — données précalculées dans DATA.r ── */
function hasHook(canon){
  return (window.SEQODS_DATA?.r?.[canon]?.length || 0) > 0;
}


/* ── Affichage mot + puce + exposant ── */
function _mkHook(ch){ const d=document.createElement("span"); d.className="hook"; d.textContent=ch; return d; }
function _mkSup(n){ const s=document.createElement("sup"); s.className="ana"; s.textContent=n; return s; }
function _mkWt(t){ const s=document.createElement("span"); s.className="wt"; s.textContent=t; return s; }

function setElWord(el, display, canon, suffix="", cousinCanon=null){
  el.textContent = "";
  if(!display || !canon) return;
  const w = document.createElement("span");
  w.style.letterSpacing = "0";
  const commaIdx = display.indexOf(',');
  if(commaIdx === -1){
    if(hasHook(canon)) w.appendChild(_mkHook("•"));
    w.appendChild(_mkWt(display));
    const n = getAnagramCount(canon);
    if(n>0) w.appendChild(_mkSup(n));
  } else {
    const mainDisp = display.substring(0, commaIdx).trim();
    const inflDisp = display.substring(commaIdx+1).trim();
    const inflCanon = resolveInflectedCanon(canon, inflDisp);
    const mainHook = hasHook(canon);
    const inflHook = inflCanon ? hasHook(inflCanon) : false;
    if(mainHook && inflHook)       w.appendChild(_mkHook("•"));
    else if(mainHook)              w.appendChild(_mkHook("◦"));
    w.appendChild(_mkWt(mainDisp));
    const n = getAnagramCount(canon);
    if(n>0) w.appendChild(_mkSup(n));
    w.appendChild(document.createTextNode(", "));
    if(!mainHook && inflHook)      w.appendChild(_mkHook("◦"));
    w.appendChild(_mkWt(inflDisp));
    if(inflCanon){ const ni=getAnagramCount(inflCanon); if(ni>0) w.appendChild(_mkSup(ni)); }
  }
  el.appendChild(w);
  if(cousinCanon){
    const cousinDisp=getNormToE()[cousinCanon]||cousinCanon;
    el.appendChild(document.createTextNode(" "));
    const lnk=document.createElement("span");
    lnk.className="cousin-link";
    lnk.textContent="(→ "+cousinDisp+")";
    lnk.addEventListener("click",e=>{e.stopPropagation();openDef(cousinCanon);});
    el.appendChild(lnk);
  } else if(suffix){
    el.appendChild(document.createTextNode(suffix));
  }
}

/* ── Sélecteur ── */
const $ = s => document.querySelector(s);

/* ── Firebase ── */
const FB_BASE    = "https://firestore.googleapis.com/v1/projects/methods-8e4b1/databases/(default)/documents";
const FB_STORAGE = "https://firebasestorage.googleapis.com/v0/b/methods-8e4b1.appspot.com/o";

async function fbStorageUpload(path, blob){
  const r = await fetch(`${FB_STORAGE}?uploadType=media&name=${encodeURIComponent(path)}`,
    {method:"POST", headers:{"Content-Type":"image/jpeg"}, body:blob});
  if(!r.ok) throw new Error("Storage " + r.status);
  const {downloadTokens} = await r.json();
  return `${FB_STORAGE}/${encodeURIComponent(path)}?alt=media&token=${downloadTokens}`;
}
async function fbStorageDelete(path){
  await fetch(`${FB_STORAGE}/${encodeURIComponent(path)}`, {method:"DELETE"}).catch(()=>{});
}

function _cv_to(val){
  if(val===null||val===undefined) return {nullValue:null};
  if(typeof val==="boolean") return {booleanValue:val};
  if(typeof val==="number") return Number.isInteger(val)?{integerValue:String(val)}:{doubleValue:val};
  if(typeof val==="string") return {stringValue:val};
  if(Array.isArray(val)) return {arrayValue:{values:val.map(_cv_to)}};
  if(typeof val==="object") return {mapValue:{fields:Object.fromEntries(Object.entries(val).map(([k,v])=>[k,_cv_to(v)]))}};
  return {stringValue:String(val)};
}
function _cv_from(val){
  if(val.nullValue!==undefined) return null;
  if(val.booleanValue!==undefined) return val.booleanValue;
  if(val.integerValue!==undefined) return parseInt(val.integerValue);
  if(val.doubleValue!==undefined) return val.doubleValue;
  if(val.stringValue!==undefined) return val.stringValue;
  if(val.arrayValue) return (val.arrayValue.values||[]).map(_cv_from);
  if(val.mapValue) return Object.fromEntries(Object.entries(val.mapValue.fields||{}).map(([k,v])=>[k,_cv_from(v)]));
  return null;
}
function toFs(obj){ return {fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,_cv_to(v)]))}; }
function fromFs(doc){ if(!doc?.fields) return null; return Object.fromEntries(Object.entries(doc.fields).map(([k,v])=>[k,_cv_from(v)])); }

async function fbGet(col, id){
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(), 8000);
    const r = await fetch(`${FB_BASE}/${col}/${id}`, {signal:ctrl.signal});
    clearTimeout(tid);
    if(r.status===404) return {ok:false, err:"not_found"};
    if(!r.ok) return {ok:false, err:"error"};
    return {ok:true, data:fromFs(await r.json())};
  }catch{ return {ok:false, err:"network"}; }
}
async function fbSet(col, id, obj){
  try{
    const r = await fetch(`${FB_BASE}/${col}/${id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(toFs(obj))
    });
    if(r.ok) return {ok:true};
    const body = await r.json().catch(()=>null);
    console.error(`[fbSet] ${col}/${id} → ${r.status}`, body?.error?.message||body||'');
    return {ok:false, err:"error"};
  }catch{ return {ok:false, err:"network"}; }
}

async function fbDelete(col, id){
  try{
    const r = await fetch(`${FB_BASE}/${col}/${id}`, {method:"DELETE"});
    return {ok:r.ok};
  }catch{ return {ok:false, err:"network"}; }
}
async function fbDeleteField(col, id, field){
  try{
    const url = `${FB_BASE}/${col}/${id}?updateMask.fieldPaths=${encodeURIComponent(field)}`;
    const r = await fetch(url, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({fields:{}})});
    return {ok:r.ok};
  }catch{ return {ok:false, err:"network"}; }
}

/* ── Session utilisateur ── */
const LS_SESSION = "METHODS_SESSION_V1";
let currentUser = null;

function loadSession(){ try{ return JSON.parse(localStorage.getItem(LS_SESSION)||"null"); }catch{ return null; } }
function saveSession(u){ try{ localStorage.setItem(LS_SESSION, JSON.stringify(u)); }catch{} }
function clearSession(){ try{ localStorage.removeItem(LS_SESSION); }catch{} currentUser=null; }

/* ── Auth ── */
async function sha256(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randomToken(){
  return Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authLogin(pseudo, pass){
  const p = pseudo.trim().toLowerCase();
  if(!p || !pass) return {ok:false, err:"Remplis tous les champs."};
  const r = await fbGet("users", p);
  if(!r.ok) return {ok:false, err:"Pseudo introuvable."};
  const hash = await sha256(pass + (r.data.salt||""));
  if(hash !== r.data.hash) return {ok:false, err:"Mot de passe incorrect."};
  const token = randomToken();
  await fbSet("users", p, {...r.data, token, lastLogin:new Date().toISOString()});
  return {ok:true, pseudo:p, token};
}
async function authRegister(pseudo, pass, pass2, secretQ, secretA){
  const p = pseudo.trim().toLowerCase();
  if(!p||!pass) return {ok:false, err:"Remplis tous les champs."};
  if(pass !== pass2) return {ok:false, err:"Les mots de passe ne correspondent pas."};
  if(!secretQ||!secretA?.trim()) return {ok:false, err:"Choisis une question secrète et saisis ta réponse."};
  if(p.length < 3) return {ok:false, err:"Pseudo trop court (3 caractères min)."};
  const exists = await fbGet("users", p);
  if(exists.ok) return {ok:false, err:"Pseudo déjà utilisé."};
  const salt = randomToken();
  const hash = await sha256(pass + salt);
  const secretASalt = randomToken();
  const secretAHash = await sha256(secretA.trim().toLowerCase() + secretASalt);
  const token = randomToken();
  await fbSet("users", p, {hash, salt, token, secretQ, secretAHash, secretASalt, createdAt:new Date().toISOString()});
  return {ok:true, pseudo:p, token};
}
async function authGetQuestion(pseudo){
  const p = pseudo.trim().toLowerCase();
  if(!p) return {ok:false, err:"Saisis ton pseudo."};
  const r = await fbGet("users", p);
  if(!r.ok) return {ok:false, err:"Pseudo introuvable."};
  if(!r.data.secretQ) return {ok:false, err:"Pas de question secrète enregistrée pour ce compte."};
  return {ok:true, question:r.data.secretQ};
}
async function authRecover(pseudo, answer, newPass){
  const p = pseudo.trim().toLowerCase();
  if(!p||!answer||!newPass) return {ok:false, err:"Remplis tous les champs."};
  const r = await fbGet("users", p);
  if(!r.ok) return {ok:false, err:"Pseudo introuvable."};
  if(!r.data.secretQ) return {ok:false, err:"Pas de question secrète. Contacte l'admin."};
  const ansHash = await sha256(answer.trim().toLowerCase() + (r.data.secretASalt||""));
  if(ansHash !== r.data.secretAHash) return {ok:false, err:"Réponse incorrecte."};
  const newHash = await sha256(newPass + (r.data.salt||""));
  const token = randomToken();
  await fbSet("users", p, {...r.data, hash:newHash, token});
  return {ok:true, pseudo:p, token};
}

/* ── Utilitaires ── */
function todayStr(){
  return new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function addDays(ymd, n){
  const [y,m,d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + n);
  return new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).format(dt);
}

function chronoFmt(s){ return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }


/* ── SRS ── */
const SRS_INTERVALS = [1,3,7,14,30,60,120];
function nextInterval(cur){
  const i = SRS_INTERVALS.indexOf(cur);
  return SRS_INTERVALS[Math.min(SRS_INTERVALS.length-1, i<0?0:i+1)];
}

/* ── Vue système ── */
// Une seule fonction pour afficher une vue — garantit qu'il n'y en a qu'une active
function showView(id){
  document.querySelectorAll(".view").forEach(v=>{
    v.classList.toggle("active", v.id===id);
  });
}

/* ── Modale définition ── */
let _openDefCanon = null; // canon affiché dans la modale (pour mise à jour async)

function openDefSimple(defText){
  // Nettoyer la prononciation [xxx] en début
  let d = (defText||"").replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,"").trim();
  const tEl=$("#def-title"), bEl=$("#def-body"), mEl=$("#def-modal");
  if(!tEl||!bEl||!mEl) return;
  tEl.textContent="Définition";
  bEl.textContent=d||"(définition absente)";
  // Masquer les liens et sections extra
  const linksDiv=$("#def-links"); if(linksDiv) linksDiv.style.display="none";
  const anaEl=$("#def-ana"); if(anaEl) anaEl.innerHTML="";
  const rallEl=$("#def-rall"); if(rallEl) rallEl.innerHTML="";
  mEl.classList.add("open");
}


function openDef(canon, displayWord, defText, flechie){
  const DATA = window.SEQODS_DATA;
  if(!DATA) return;
  const C=DATA.c, E=DATA.e, F=DATA.f, A=DATA.a, R=DATA.r;

  let allIdxs = _findAllIdxs(canon);
  if(allIdxs.length === 0 && defText === undefined){
    const lemma = findLemma(canon);
    if(lemma && lemma !== canon){ openDef(lemma, null, undefined, canon); return; }
  }
  // Redirect pure conjugation-form entries to their infinitive
  {
    const conjM=_getConjMap();
    if(conjM.has(canon) && defText===undefined){
      const _POS=/^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
      const _CONJ=/-->\s+\S+\s+\d{2,}\./;
      const real=allIdxs.filter(i=>{const f=getNormToF()[C?.[i]]||'';return _POS.test(f)||!_CONJ.test(f);});
      if(real.length>0) allIdxs=real;
      else{ openDef(conjM.get(canon)); return; }
    }
  }
  const _CP = /^-->\s+([A-Z]+)\s+\d+\./;
  // Prefer non-redirect entry for title (dual-nature words like FEUTRANT: adj FEUTRANT,E over participle redirect)
  const titleIdx = allIdxs.find(i => !_CP.test(getNormToF()[C?.[i]]||'')) ?? (allIdxs[0] ?? -1);
  const rawDisplay = (displayWord || (titleIdx>=0 ? (getNormToE()[C?.[titleIdx]]||C?.[titleIdx]) : canon)).replace(/\*/g,"").trim();
  const title = rawDisplay.split(",")[0].trim(); // base form, pour les liens externes

  // Build list of {label, entryLabel, text} for each definition to display.
  const _cf = t => t.replace(/ - Féminin accepté\. \(\d+\)/g,'');
  const defs = defText !== undefined
    ? [{label:null, entryLabel:null, text:_cf(defText)}]
    : allIdxs.map(i=>{ const f=_cf(_getIdxDef()[i]||getNormToF()[C?.[i]]||''); const m=f.match(_CP); if(m){ return {label:m[1], entryLabel:null, text:_cf(getNormToF()[m[1]]||'')}; } const _mr=/-->\s+([a-zàâäéèêëîïôùûüœæç][a-zàâäéèêëîïôùûüœæç\s-]*)\./.exec(f); if(_mr&&!/[A-ZÀ-ÖØ-ÞŒŸ]/.test(f.slice(0,_mr.index).replace(/\[[^\]]*\]/g,''))){const td=_cf(getNormToF()[norm(_mr[1].trim())]||'');if(td&&!/-->/.test(td)) return{label:null,entryLabel:null,text:td};} const el=getNormToE()[C?.[i]]; return {label:null, entryLabel:(el?.includes(',') ? el.replace(/\*/g,'') : null), text:f}; });
  // Utiliser la définition personnalisée admin si disponible en cache
  if(defs.length>0 && defText===undefined){
    const cd = window._rechCache?.[canon]?.loaded ? window._rechCache[canon].custom?.def : undefined;
    if(cd !== undefined) defs[0] = {label:null, entryLabel:null, text:cd};
  }
  if(allIdxs.length>0 && defText===undefined){
    const cl=_findConjLemma(canon);
    if(cl){ const ci=_getCMap().get(cl); if(ci!==undefined) defs.push({label:cl, entryLabel:null, text:F?.[ci]||""}); }
  }

  const wSlash=_wantsSlash(canon)&&!rawDisplay.includes('/');
  $("#def-title").textContent = wSlash ? rawDisplay+' /' : rawDisplay;
  const bodyEl=$("#def-body");
  if(defs.length<=1){
    bodyEl.textContent = defs[0]?.text||"(définition absente)";
  } else {
    bodyEl.innerHTML="";
    defs.forEach((d,i)=>{
      if(i>0){
        const hr=document.createElement("hr");
        hr.style.cssText="border:none;border-top:1px solid var(--stroke);margin:8px 0 4px";
        bodyEl.appendChild(hr);
      }
      if(d.label){
        const lnk=document.createElement("a"); lnk.href="#"; lnk.className="def-link";
        lnk.textContent=d.label;
        lnk.addEventListener("click",ev=>{ev.preventDefault();openDef(d.label,d.label);});
        bodyEl.appendChild(lnk);
        bodyEl.appendChild(document.createTextNode(" "));
      } else if(d.entryLabel){
        const lbl=document.createElement("span");
        lbl.style.cssText="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:1px";
        lbl.textContent=d.entryLabel;
        bodyEl.appendChild(lbl);
      }
      const p=document.createElement("p"); p.style.margin="0";
      p.textContent=d.text||(d.label?"":"(définition absente)");
      bodyEl.appendChild(p);
    });
  }

  const raw = title.toLowerCase();
  $("#def-wikt").href = "https://fr.wiktionary.org/wiki/" + encodeURIComponent(raw);
  $("#def-img").href = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(raw);
  $("#def-links").style.display = "flex";

  // Anagrammes du lemme
  const anaEl = $("#def-ana"); if(anaEl) anaEl.innerHTML="";
  if(A && anaEl){
    const tir = canon.split("").sort((a,b)=>a.localeCompare(b,"fr")).join("");
    const lst = (A[tir]||[]).filter(x=>norm(x)!==canon).slice(0,60);
    if(lst.length){ _renderWordLinks(anaEl, lst, "Anagrammes"); }
  }

  // Rallonges du lemme
  const rallEl = $("#def-rall"); if(rallEl) rallEl.innerHTML="";
  if(R && rallEl){
    const lst = R[canon]||[];
    if(lst.length){ _renderWordLinks(rallEl, lst, "Rallonges"); }
  }

  // Section forme fléchie : soit redirect depuis conjugaison, soit entrée avec virgule (ex: PERLANT, E)
  let flechieToShow = flechie || null;
  if(!flechieToShow && titleIdx >= 0 && getNormToE()[C?.[titleIdx]]?.includes(',')){
    const resolved = resolveInflectedCanon(canon, getNormToE()[C?.[titleIdx]].split(',')[1]);
    if(resolved && resolved !== canon) flechieToShow = resolved;
  }
  const flechieEl = $("#def-flechie"); if(flechieEl) flechieEl.innerHTML="";
  if(flechieToShow && flechieToShow !== canon && flechieEl){
    // Cherche dans toutes les formes (d[]), pas seulement les lemmes (A),
    // car l'anagramme d'une forme fléchie peut être une autre forme fléchie.
    const ftir = flechieToShow.split("").sort().join("");
    const normToE = getNormToE();
    const fAna = getDictArr()
      .filter(w => w !== flechieToShow && w.split("").sort().join("") === ftir)
      .slice(0, 60)
      .map(w => normToE[w] || w);
    const fRal = R ? (R[flechieToShow]||[]) : [];
    if(fAna.length || fRal.length){
      const sep = document.createElement("hr");
      sep.style.cssText = "border:none;border-top:1px solid var(--stroke);margin:12px 0 4px";
      flechieEl.appendChild(sep);
      const sub = document.createElement("p");
      sub.style.cssText = "font-size:11px;color:var(--muted);margin:0 0 2px";
      sub.appendChild(document.createTextNode("Forme : "));
      const fLink = document.createElement("a"); fLink.href="#"; fLink.className="def-link";
      fLink.style.cssText = "font-size:11px;";
      fLink.textContent = flechieToShow;
      fLink.addEventListener("click", e=>{ e.preventDefault(); openDef(flechieToShow, flechieToShow); });
      sub.appendChild(fLink);
      flechieEl.appendChild(sub);
      if(fAna.length){
        const sec = document.createElement("div"); sec.className="modal-sec";
        _renderWordLinks(sec, fAna, "Anagrammes"); flechieEl.appendChild(sec);
      }
      if(fRal.length){
        const sec = document.createElement("div"); sec.className="modal-sec";
        _renderWordLinks(sec, fRal, "Rallonges"); flechieEl.appendChild(sec);
      }
    }
  }

  _openDefCanon = canon;
  $("#def-modal").classList.add("open");

  // Chargement lazy de la déf custom si pas encore en cache
  if(defText===undefined && allIdxs.length>0 && !window._rechCache?.[canon]?.loaded){
    const targetCanon = canon;
    fbGet("rech_custom", canon).then(r=>{
      if(_openDefCanon !== targetCanon) return;
      if(!window._rechCache) window._rechCache={};
      if(!window._rechCache[canon]) window._rechCache[canon]={custom:{},excl:[],loaded:false};
      window._rechCache[canon].custom = r.ok && r.data ? r.data : {};
      window._rechCache[canon].loaded = true;
      const cd = window._rechCache[canon].custom?.def;
      if(cd===undefined) return;
      const bodyEl=$("#def-body"); if(!bodyEl) return;
      if(!$("#def-modal")?.classList.contains("open")) return;
      if(defs.length<=1) bodyEl.textContent = cd || "(définition absente)";
      else { const p=bodyEl.querySelector("p"); if(p) p.textContent=cd||"(définition absente)"; }
    }).catch(()=>{});
  }
}

function closeDef(){
  $("#def-modal")?.classList.remove("open");
  if(!window.matchMedia("(pointer:fine)").matches) return;
  setTimeout(()=>{
    const active=document.querySelector(".view.active")?.id;
    if(active==="v-entremods") document.getElementById("em-saisie")?.focus();
    else if(active==="v-themods") document.getElementById("tm-saisie")?.focus();
  }, 50);
}

function wireDefModal(){
  $("#def-close")?.addEventListener("click", closeDef);
  $("#def-bd")?.addEventListener("click", closeDef);
  document.addEventListener("keydown", e=>{ if(e.key==="Escape"){ closeDef(); closeImgZoom(); } });
}
function closeImgZoom(){ document.getElementById("img-zoom-ol")?.classList.remove("open"); }
function wireImgZoom(){
  document.getElementById("img-zoom-ol")?.addEventListener("click", closeImgZoom);
}

/* ── Images inline sous les tuiles ──
   Recherche Wikimedia Commons contextualisée par la définition :
   on enrichit la requête avec les mots-clés du sens (ex. PLACAGE+rugby,
   FLOUSE+argent) et on ne garde que les images dont le titre a un lien
   réel avec le mot ou sa définition — sinon on n'illustre pas. */
const _imgStripCache={};
function _imgDeburr(s){ return String(s).normalize("NFD").replace(/[̀-ͯ]/g,""); }
// Abréviations ODS → sens plein. Servent à PRÉCISER la requête (non-excluantes).
// Clés déburrées/minuscules (Méd.→med, Québ.→queb, Hér.→her, Électr.→electr…).
const _IMG_ABBR={
  // domaines
  med:"medecine",antiq:"antiquite",hist:"histoire",bot:"botanique",biol:"biologie",dr:"droit",
  chim:"chimie",mar:"marine",zool:"zoologie",geol:"geologie",inf:"informatique",inform:"informatique",
  phys:"physique",anat:"anatomie",mus:"musique",math:"mathematiques",ling:"linguistique",
  psych:"psychologie",rel:"religion",relig:"religion",techn:"technique",philos:"philosophie",
  arch:"architecture",archit:"architecture",mediev:"medieval",biochim:"biochimie",sp:"sport",
  physiol:"physiologie",her:"heraldique",electr:"electricite",chir:"chirurgie",pharm:"pharmacie",
  agr:"agriculture",geogr:"geographie",pol:"politique",impr:"imprimerie",phon:"phonetique",
  text:"textile",mil:"militaire",milit:"militaire",min:"mineralogie",phot:"photographie",
  fin:"finance",archeol:"archeologie",cin:"cinema",econ:"economie",rhet:"rhetorique",
  vet:"veterinaire",log:"logique",ven:"venerie",opt:"optique",poet:"poesie",aeron:"aeronautique",
  aviat:"aviation",feod:"feodalite",mec:"mecanique",astr:"astronomie",electron:"electronique",
  pathol:"pathologie",
  // registres / emplois
  fam:"familier",vx:"vieux",vieilli:"vieux",litt:"litteraire",arg:"argot",pej:"pejoratif",anc:"ancien",
  // régions
  queb:"quebec",helv:"suisse",belg:"belgique",afr:"afrique",inde:"inde",amerique:"amerique",
  asie:"asie",orient:"orient",japon:"japon",antilles:"antilles",bourgogne:"bourgogne",
};
// Mots de domaine/registre/région écrits en entier → non-excluants eux aussi
const _IMG_LABEL_WORDS=new Set([...Object.values(_IMG_ABBR),"sud","nord","france","terre"]);
// Mots à ignorer totalement : grammaire et remplissage de définition
const _IMG_STOP=new Set([
  "prep","conj","pron","adverbe","adjectif","interj","masc","fem","plur","sing","invar","verbe","nom","loc",
  "action","fait","sorte","genre","celui","celle","ceux","chose","personne","maniere","facon","partie","ensemble",
  "forme","type","objet","espece","famille","groupe","terme","etat","unite","mesure","sens","nombre",
  "relatif","relative","propre","certain","certaine","plusieurs","petit","petite","grand","grande","autre","quelque",
  "quelqu","dont","avec","sans","pour","dans","sous","leur","leurs","etre","avoir","selon","entre","aussi","ainsi",
  "plus","moins","tres","etc","mais","donc","comme","tout","tous","toute","toutes","elle","elles","cette","cet",
  "ces","son","ses","sur","par","est","sont","une","des","les","aux","qui","que","quoi","quelle","quel",
]);
function _defTokens(def){
  let s=_imgDeburr(String(def||"").toLowerCase());
  s=s.replace(/\[[^\]]*\]/g," ").replace(/\([^)]*\)/g," "); // prononciation & parenthèses (synonymes)
  return s.replace(/[^a-z\s]/g," ").split(/\s+/).filter(Boolean);
}
// Mots de contenu : utilisés dans la requête ET dans le filtre (excluants)
function _defKeywords(def){
  const out=[],seen=new Set();
  for(const w of _defTokens(def)){
    if(w.length>=4 && !_IMG_STOP.has(w) && !_IMG_ABBR[w] && !_IMG_LABEL_WORDS.has(w) && !seen.has(w)){
      seen.add(w); out.push(w);
    }
  }
  return out.slice(0,3);
}
// Labels (domaine/registre/région) développés : requête seulement (non-excluants)
function _defLabels(def){
  const out=[],seen=new Set();
  for(const w of _defTokens(def)){
    const exp=_IMG_ABBR[w] || (_IMG_LABEL_WORDS.has(w)?w:null);
    if(exp && !seen.has(exp)){ seen.add(exp); out.push(exp); }
  }
  return out.slice(0,2);
}
function _defIsNoun(def){
  // n., n.m., n.f. (and plural variants) at start or after " et "
  return /(?:^|\bet\s+)n\.(?:[mf]\.)?/.test(String(def||""));
}
// Tokenise un texte (titre + description) en mots déburrés
function _imgWords(text){
  return " "+_imgDeburr(text.toLowerCase()).replace(/[^a-z]+/g," ").trim()+" ";
}
// Vrai si le texte contient l'un des tokens.
// ≥4 lettres : début de mot suffit (lump → lumpus/lumpfish, pentacle → pentacles).
// 3 lettres : mot entier exigé (évite le bruit).
function _imgHasToken(t, tok){
  if(tok.length<3) return false;
  return tok.length>=4 ? t.includes(" "+tok) : t.includes(" "+tok+" ");
}
function _imgRelevant(t, tokens){ return tokens.some(tok=>_imgHasToken(t, tok)); }
// Score = nombre de mots-clés du sens présents (sert au classement, pas au filtre)
function _imgScore(t, tokens){ let n=0; for(const tok of tokens) if(_imgHasToken(t, tok)) n++; return n; }
// Termes signalant un contexte musical/chanson → pénalité si la déf ne parle pas de musique
const _IMG_ANTI_MUSIC=["chanson","partition","melodie","refrain","opera","chant","hymne","oratorio","cantique","song","music","sheet","lyrics"];
const _IMG_RE_MIME=/^image\/(jpeg|png|gif|webp)$/;
async function loadImgStrip(container, words, def){
  const candidates=(Array.isArray(words)?words:[words]).filter(Boolean);
  const keywords=_defKeywords(def);   // mots de contenu (argent, rugby…)
  const labels=_defLabels(def);       // domaine/registre/région développés
  const headTokens=candidates.map(w=>_imgDeburr(w).toLowerCase()); // mots → filtre de lien
  const rankTokens=[...keywords, ...labels];                       // sens → classement
  const key=candidates.join("|")+"::"+keywords.join("+")+"::"+labels.join("+");
  const render=srcs=>srcs.forEach(src=>{
    const img=document.createElement("img"); img.src=src; img.loading="lazy"; img.className="img-strip-thumb";
    img.style.cursor="pointer";
    img.addEventListener("click",()=>{
      const ol=document.getElementById("img-zoom-ol"); if(!ol) return;
      const zi=document.getElementById("img-zoom-img"); if(zi) zi.src=src;
      ol.classList.add("open");
    });
    container.appendChild(img);
  });
  if(_imgStripCache[key]){ render(_imgStripCache[key]); return; }
  const fetchThumbs=async titles=>{
    const iUrl=`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join("|"))}&prop=imageinfo&iiprop=url|mime&iiurlwidth=400&format=json&origin=*`;
    const ij=await (await fetch(iUrl)).json();
    const byTitle={};
    Object.values(ij?.query?.pages||{}).forEach(p=>{
      const i=p.imageinfo?.[0];
      if(i && _IMG_RE_MIME.test(i.mime) && i.thumburl) byTitle[p.title]=i.thumburl;
    });
    return titles.map(t=>byTitle[t]).filter(Boolean);
  };
  try{
    // On cherche CHAQUE graphie seule (CirrusSearch exige tous les termes d'une
    // requête : ajouter les mots-clés exclurait les sujets décrits en anglais).
    // On accumule les fichiers vraiment liés au mot, puis on classe par sens.
    // Pénalité musicale : si la déf ne parle pas de musique, les fichiers dont
    // la description contient des mots musicaux sont pénalisés (ex. MIRONTON :
    // partitions avec étymologie "ragoût de viande" ≠ vraie photo du plat).
    const _rkTxt=" "+rankTokens.join(" ")+" ";
    const _defHasMusic=_IMG_ANTI_MUSIC.some(tok=>_imgHasToken(_rkTxt,tok));
    const pool=[], seen=new Set();
    for(const word of candidates){
      const sUrl=`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word)}&srnamespace=6&srlimit=30&srprop=snippet&format=json&origin=*`;
      const sj=await (await fetch(sUrl)).json();
      for(const r of (sj?.query?.search||[])){
        if(seen.has(r.title)) continue;
        const t=_imgWords((r.title||"")+" "+String(r.snippet||"").replace(/<[^>]+>/g," "));
        if(!_imgRelevant(t, headTokens)) continue;  // doit vraiment parler du mot
        seen.add(r.title);
        const musicPen=_defHasMusic?0:_IMG_ANTI_MUSIC.filter(tok=>_imgHasToken(t,tok)).length;
        pool.push({title:r.title, score:_imgScore(t, rankTokens)-musicPen});
      }
      if(pool.length>=20) break;
    }
    if(pool.length){
      pool.sort((a,b)=>b.score-a.score);
      const _headInTitle=p=>headTokens.some(tok=>_imgHasToken(_imgWords(p.title),tok));
      // Tier 1 : score > 0 ET terme dans le titre du fichier (nommé d'après le mot → sans ambiguïté)
      const tier1=pool.filter(p=>p.score>0 && _headInTitle(p));
      // Tier 2 : score > 0 seulement (peut inclure des faux positifs étymologiques)
      const tier2=pool.filter(p=>p.score>0);
      // Tier 3 : terme dans le titre uniquement (noms scientifiques, def française ≠ labels anglais)
      const tier3=pool.filter(p=>_headInTitle(p));
      const toFetch=(tier1.length ? tier1 : tier2.length ? tier2 : tier3)
        .slice(0,10).map(p=>p.title);
      const imgs=toFetch.length ? (await fetchThumbs(toFetch)).slice(0,4) : [];
      if(imgs.length){ _imgStripCache[key]=imgs; render(imgs); return; }
    }
    _imgStripCache[key]=[];
  }catch{ _imgStripCache[key]=[]; }
}

/* ── Clavier mobile générique ── */
function wireKeyboard(kbId, dispId, msgId, onKey){
  const kb = document.getElementById(kbId);
  if(!kb) return;
  let buf = "";
  const upd = () => { const d=document.getElementById(dispId); if(d) d.textContent=buf; };
  const setKbMsg = (t,c) => { const m=document.getElementById(msgId); if(m){m.textContent=t;m.className="kb-msg"+(c?" "+c:"");} };

  const press = k => {
    if(k==="CLR"){ buf=""; upd(); }
    else if(k==="DEL"){ buf=buf.slice(0,-1); upd(); }
    else if(k==="OK"){
      if(buf.trim()){ onKey(buf.trim()); buf=""; upd(); }
    } else { buf+=k; upd(); }
  };

  kb.addEventListener("mousedown", e=>{
    const key=e.target.closest(".kk"); if(!key) return;
    e.preventDefault(); press(key.dataset.k);
  });
  kb.addEventListener("touchstart", e=>{
    const key=e.target.closest(".kk"); if(!key) return;
    e.preventDefault(); press(key.dataset.k);
  }, {passive:false});
  kb.addEventListener("click", e=>{ if(e.target.closest(".kk")) e.preventDefault(); });

  return { setMsg: setKbMsg, clear: ()=>{ buf=""; upd(); } };
}

/* ── Dictionnaire modal ── */

function setDictBtnVisible(v){
  document.getElementById("btn-dict")?.classList.toggle("hidden", !v);
}

// Extrait la nature grammaticale depuis le début d'une définition ("v.", "n.m.", "adj.", etc.)
function _posLabel(def){
  const d=(def||"").replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,"").trim();
  const parts=[];
  for(const t of d.split(/\s+/)){
    if(parts.length>=2||!t.endsWith(".")||t.length>6) break;
    parts.push(t);
  }
  return parts.join(" ");
}

// Binary search: premier index i dans le tableau trié A tel que A[i] >= prefix
function _dictBisect(A, prefix){
  let lo=0, hi=A.length;
  while(lo<hi){ const mid=(lo+hi)>>1; if(A[mid]<prefix) lo=mid+1; else hi=mid; }
  return lo;
}

// Mapping c[i] → définition individuelle pour les homographes.
// c[] et e[]/f[] sont construits depuis la même source ODS dans le même ordre :
// la k-ème occurrence de "VANILLER" dans c[] correspond à la k-ème dans e[]/f[].
let _idxDef = null;
function _getIdxDef(){
  if(_idxDef) return _idxDef;
  const {c:C, e:E, f:F} = window.SEQODS_DATA || {};
  if(!C || !E || !F) return (_idxDef = []);
  const normDefs = new Map();
  for(let i=0; i<E.length; i++){
    if(!E[i]) continue;
    const n = norm(E[i].split(",")[0].split("/")[0].trim());
    if(!n) continue;
    if(!normDefs.has(n)) normDefs.set(n, []);
    normDefs.get(n).push(F[i] || "");
  }
  _idxDef = new Array(C.length);
  const occ = new Map();
  for(let i=0; i<C.length; i++){
    const cn = C[i]; const k = occ.get(cn) || 0; occ.set(cn, k+1);
    const defs = normDefs.get(cn) || [];
    _idxDef[i] = k < defs.length ? defs[k] : (defs[0] || "");
  }
  return _idxDef;
}

// Forme d'affichage individuelle par entrée c[i] (ex. "HERBAGER, ÈRE" vs "HERBAGER").
let _idxE = null;
function _getIdxE(){
  if(_idxE) return _idxE;
  const {c:C, e:E} = window.SEQODS_DATA || {};
  if(!C || !E) return (_idxE = []);
  const normForms = new Map();
  for(let i=0; i<E.length; i++){
    if(!E[i]) continue;
    const n = norm(E[i].split(",")[0].split("/")[0].trim());
    if(!n) continue;
    if(!normForms.has(n)) normForms.set(n, []);
    normForms.get(n).push(E[i]);
  }
  _idxE = new Array(C.length);
  const occ = new Map();
  for(let i=0; i<C.length; i++){
    const cn = C[i]; const k = occ.get(cn) || 0; occ.set(cn, k+1);
    const forms = normForms.get(cn) || [];
    _idxE[i] = k < forms.length ? forms[k] : (forms[0] || cn);
  }
  return _idxE;
}


function dictUpdateLinks(displayWord){
  const raw=(displayWord||"").split(",")[0].trim().toLowerCase().replace(/\s+.*/,"");
  const w=document.getElementById("dict-wikt");
  const img=document.getElementById("dict-img");
  if(w) w.href = raw ? "https://fr.wiktionary.org/wiki/"+encodeURIComponent(raw) : "#";
  if(img) img.href = raw ? "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(raw) : "#";
}

// Afficher le résultat pour un mot canonique normalisé (présent dans d[])
function dictSelectWord(w, idx){
  const DATA=window.SEQODS_DATA; if(!DATA) return;
  const inp=document.getElementById("dict-input");
  if(inp){ inp.value=w; }
  const _disp=document.getElementById("rech-kb-disp");
  if(_disp) _disp.textContent=w;
  document.getElementById("dict-sugg").innerHTML="";

  let allIdxs=_findAllIdxs(w);
  // Clic sur une suggestion précise : n'afficher que cette entrée (homographes séparés)
  if(idx!==undefined && allIdxs.length>1) allIdxs=[idx];
  // Filter/redirect pure conjugation-form entries
  {
    const conjM=_getConjMap();
    if(conjM.has(w)){
      const _POS=/^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
      const _CONJ=/-->\s+\S+\s+\d{2,}\./;
      const real=allIdxs.filter(i=>{const f=DATA.f[i]||'';return _POS.test(f)||!_CONJ.test(f);});
      if(real.length>0) allIdxs=real;
      else{ dictSelectWord(conjM.get(w)); return; }
    }
  }

  if(allIdxs.length>0){
    const cIdx0=allIdxs[0];
    const display=(_getIdxE()[cIdx0]||getNormToE()[w]||w).replace(/\*/g,"").trim();
    const slash=_wantsSlash(w)&&!display.includes('/');
    document.getElementById("dict-word").textContent=display+(slash?' /':'');

    const defEl=document.getElementById("dict-def");
    const _customDef = window._rechCache?.[w]?.loaded ? window._rechCache[w].custom?.def : undefined;
    defEl.innerHTML="";
    allIdxs.forEach((i,n)=>{
      if(n>0){
        const hr=document.createElement("hr");
        hr.style.cssText="border:none;border-top:1px solid var(--stroke);margin:6px 0 3px";
        defEl.appendChild(hr);
      }
      let raw=(_getIdxDef()[i]||getNormToF()[DATA.c?.[i]]||'').replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,'').trim();
      if(n===0 && _customDef!==undefined) raw=_customDef;
      const p=document.createElement("p"); p.style.margin="0";
      p.textContent=raw||"(définition absente)"; defEl.appendChild(p);
    });
    // Anagrammes
    const anaEl=document.getElementById("dict-ana");
    if(anaEl && DATA.a){
      anaEl.innerHTML="";
      const tir=w.split("").sort((a,b)=>a.localeCompare(b,"fr")).join("");
      const anaLst=(DATA.a[tir]||[]).filter(x=>norm(x)!==w).slice(0,60);
      if(anaLst.length){
        const lbl=document.createElement("strong"); lbl.textContent="Anagrammes"; anaEl.appendChild(lbl);
        const sp=document.createElement("span");
        anaLst.forEach((aw,ai)=>{
          if(ai) sp.appendChild(document.createTextNode(" • "));
          const a=document.createElement("a"); a.href="#"; a.className="def-link";
          a.textContent=aw;
          a.addEventListener("click",e=>{ e.preventDefault(); dictSelectWord(norm(aw)); });
          sp.appendChild(a);
        });
        anaEl.appendChild(sp);
      }
    } else if(anaEl) anaEl.innerHTML="";
    // Rallonges
    const lst=DATA.r?.[w]||[];
    const rallEl=document.getElementById("dict-rall");
    if(rallEl){
      rallEl.innerHTML="";
      if(lst.length){
        const lbl=document.createElement("strong"); lbl.textContent="Rallonges"; rallEl.appendChild(lbl);
        const sp=document.createElement("span");
        lst.forEach((rw,ri)=>{
          if(ri) sp.appendChild(document.createTextNode(" • "));
          const a=document.createElement("a"); a.href="#"; a.className="def-link";
          a.textContent=rw;
          a.addEventListener("click",e=>{ e.preventDefault(); dictSelectWord(norm(rw)); });
          sp.appendChild(a);
        });
        rallEl.appendChild(sp);
      }
    }
    // Conjugaison : si ce mot est aussi une forme irrégulière, afficher lien vers l'infinitif
    const conjEl=document.getElementById("dict-conj");
    if(conjEl){
      conjEl.innerHTML="";
      const irr=_getIrregMap();
      if(irr.has(w)){
        const inf=irr.get(w);
        if(inf && inf!==w && _getCMap().has(inf)){
          const infIdx=_getCMap().get(inf);
          const infDisp=(infIdx!==undefined ? DATA.e[infIdx] : null)||inf;
          const lbl=document.createElement("strong"); lbl.textContent="Conjugaison";
          conjEl.appendChild(lbl);
          const sp=document.createElement("span");
          sp.appendChild(document.createTextNode(" → "));
          const a=document.createElement("a"); a.href="#"; a.className="def-link";
          a.textContent=infDisp;
          a.addEventListener("click",e=>{e.preventDefault();dictSelectWord(inf);});
          sp.appendChild(a); conjEl.appendChild(sp);
        }
      }
    }
    dictUpdateLinks(display);
  } else {
    // Not a canonical entry
    const lemma=findLemma(w);
    document.getElementById("dict-word").textContent=w;
    document.getElementById("dict-ana").innerHTML="";
    document.getElementById("dict-rall").innerHTML="";
    document.getElementById("dict-conj").innerHTML="";
    const defEl=document.getElementById("dict-def");
    if(lemma && lemma!==w){
      defEl.innerHTML="";
      defEl.appendChild(document.createTextNode("→ "));
      const lnk=document.createElement("a"); lnk.href="#"; lnk.className="def-link";
      lnk.textContent=lemma;
      lnk.addEventListener("click",e=>{e.preventDefault();dictSelectWord(lemma);});
      defEl.appendChild(lnk);
    } else {
      defEl.textContent=_getDSet().has(w)?"Forme variable · Mot valide ODS9":"Mot inconnu.";
    }
    dictUpdateLinks(w);
  }
  document.getElementById("dict-result").style.display="";
  window._onDictSelect?.(w);
}

function _dictRenderSugg(prefix){
  const sugg=document.getElementById("dict-sugg"); if(!sugg) return;
  if(!prefix){ sugg.innerHTML=""; return; }
  const DATA=window.SEQODS_DATA;
  if(!DATA?.c){ sugg.innerHTML="<li class='dict-no-result'>Données non chargées — rechargez l'application.</li>"; return; }
  const C=DATA.c, E=DATA.e||[], F=DATA.f||[];
  const start=_dictBisect(C, prefix);
  const _conjM=_getConjMap();
  const _POS=/^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
  const _CONJ=/-->\s+\S+\s+\d{2,}\./;
  const candidates=[];
  for(let i=start; i<C.length; i++){
    if(!C[i].startsWith(prefix)) break;
    if(_conjM.has(C[i])){const f=getNormToF()[C[i]]||''; if(!_POS.test(f)&&_CONJ.test(f)) continue;}
    candidates.push(i);
  }
  let html="";
  const _prefixIsConj=_conjM.has(prefix)&&!candidates.some(i=>C[i]===prefix);
  if((!_getCMap().has(prefix)||_prefixIsConj)&&(_getDSet().has(prefix)||_prefixIsConj)){
    const lemma=_prefixIsConj?_conjM.get(prefix):findLemma(prefix);
    if(lemma&&lemma!==prefix) html+=`<li data-lemma="${lemma}">→ <a class="def-link">${lemma}</a></li>`;
  }
  for(const i of candidates){
    let label=(_getIdxE()[i]||getNormToE()[C[i]]||C[i]).replace(/&/g,"&amp;").replace(/</g,"&lt;");
    if(_wantsSlash(C[i])&&!label.includes("/")) label+=" /";
    const pos=_posLabel(_getIdxDef()[i]||getNormToF()[C[i]]); if(pos) label+="  "+pos;
    html+=`<li data-idx="${i}">${label}</li>`;
  }
  sugg.innerHTML=html||"<li class='dict-no-result'>Mot inconnu.</li>";
}

let _rechFromView = null;
let _rechActiveTab = 'dict';

function _rechSwitchTab(tab){
  _rechActiveTab = tab;
  document.getElementById("v-recherche")?.setAttribute("data-rech-tab", tab);
  document.getElementById("rech-tab-btn-dict")?.classList.toggle("active", tab==="dict");
  document.getElementById("rech-tab-btn-search")?.classList.toggle("active", tab==="search");
  const dictEl=document.getElementById("rech-tab-dict");
  const srchEl=document.getElementById("rech-tab-search");
  if(dictEl) dictEl.style.display = tab==="dict" ? "" : "none";
  if(srchEl) srchEl.style.display = tab==="search" ? "" : "none";
  const spec=document.getElementById("rech-kb-specials");
  if(spec) spec.style.display = tab==="search" ? "" : "none";
  const pcSpec=document.getElementById("rech-pc-specials");
  if(pcSpec) pcSpec.style.display = tab==="search" ? "" : "none";
  const inp=document.getElementById("dict-input");
  if(inp){
    inp.value="";
    inp.placeholder = tab==="search" ? "Motif de recherche…" : "Saisir un mot…";
  }
  inp?.focus();
  if(tab==="dict"){
    document.getElementById("dict-result")?.style.setProperty("display","none");
    const s=document.getElementById("dict-sugg"); if(s) s.innerHTML="";
  } else {
    const r=document.getElementById("rech-search-res"); if(r) r.innerHTML="";
  }
}

/* ── Moteur de recherche (onglet Recherche) ── */
let _rechWordSet=null;
function _getWordSet(){
  if(_rechWordSet) return _rechWordSet;
  _rechWordSet=new Set(getDictArr());
  return _rechWordSet;
}

let _rechAnagramMap=null;
function _getAnagramMap(){
  if(_rechAnagramMap) return _rechAnagramMap;
  const arr=getDictArr(); if(!arr.length) return new Map();
  _rechAnagramMap=new Map();
  for(const w of arr){
    const k=w.split("").sort().join("");
    if(!_rechAnagramMap.has(k)) _rechAnagramMap.set(k,[]);
    _rechAnagramMap.get(k).push(w);
  }
  return _rechAnagramMap;
}

function _isSubanagram(letters,word){
  const freq={};
  for(const c of word) freq[c]=(freq[c]||0)+1;
  for(const c of letters){ if(!freq[c]) return false; freq[c]--; }
  return true;
}

function _rechParseQuery(q){
  const parts=q.split("/");
  const base=parts[0];
  const alts=parts.slice(1).map(p=>({exclude:p[0]==="-",suffix:p[0]==="-"?p.slice(1):p}));
  if(!base) return null;

  if(base.includes("•")||base.includes("*")){
    const stars=(base.match(/\*/g)||[]).length;
    const hasDots=base.includes("•");
    // Chemins rapides : patterns purs sans mélange
    if(!hasDots){
      const fi=base.indexOf("*"),la=base.lastIndexOf("*");
      if(stars===1&&fi===0) return {type:"suffix",suffix:base.slice(1),alts};
      if(stars===1&&la===base.length-1) return {type:"prefix",prefix:base.slice(0,-1),alts};
      if(stars===2&&fi===0&&la===base.length-1) return {type:"contains",inner:base.slice(1,-1),alts};
    }
    if(!stars){
      const leadDots=(base.match(/^•+/)||[""])[0].length;
      const trailDots=(base.match(/•+$/)||[""])[0].length;
      const core=base.replace(/^•+/,"").replace(/•+$/,"");
      if(!core) return null;
      if(leadDots>0&&trailDots===0&&!core.includes("•")) return {type:"exact-suffix",core,totalLen:leadDots+core.length,alts};
      if(trailDots>0&&leadDots===0&&!core.includes("•")) return {type:"exact-prefix",core,totalLen:core.length+trailDots,alts};
    }
    // Cas général et mixte : B*D•E, B•R, B*D*E, etc.
    const regexStr="^"+[...base].map(c=>c==="*"?".*":c==="•"?".":c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("")+"$";
    return {type:"wildcard",regex:new RegExp(regexStr),alts};
  }

  if(base.includes("?")){
    const qCount=(base.match(/\?/g)||[]).length;
    const letters=base.replace(/\?/g,"");
    return {type:"subanagram",letters,extraCount:qCount,alts};
  }

  if(/^[A-Z]+$/.test(base)) return {type:"anagram",letters:base,alts};
  return null;
}

let _rechSearchTimer=null;
function _rechTriggerSearch(raw){
  clearTimeout(_rechSearchTimer);
  const q=raw.toUpperCase().trim();
  const el=document.getElementById("rech-search-res");
  if(!q){ if(el) el.innerHTML=""; return; }
  _rechSearchTimer=setTimeout(()=>{
    const parsed=_rechParseQuery(q);
    _rechRenderResults(_rechExec(q),parsed);
  },250);
}

function _rechExec(q){
  const parsed=_rechParseQuery(q);
  if(!parsed) return [];
  const words=getDictArr(); if(!words.length) return [];
  let res=[];
  switch(parsed.type){
    case "anagram":{ const k=parsed.letters.split("").sort().join(""); res=(_getAnagramMap().get(k)||[]).slice(); break; }
    case "subanagram":{
      const {letters,extraCount}=parsed;
      const tl=letters.length+extraCount;
      for(const w of words) if(w.length===tl&&_isSubanagram(letters,w)) res.push(w);
      break;
    }
    case "suffix":{ const s=parsed.suffix; if(s) for(const w of words) if(w.endsWith(s)&&w.length>s.length) res.push(w); break; }
    case "prefix":{ const p=parsed.prefix; if(p) for(const w of words) if(w.startsWith(p)&&w.length>p.length) res.push(w); break; }
    case "contains":{
      const inner=parsed.inner; if(!inner) break;
      for(const w of words){ const i=w.indexOf(inner); if(i>0&&i+inner.length<w.length) res.push(w); }
      break;
    }
    case "exact-suffix":{ const {core,totalLen}=parsed; for(const w of words) if(w.length===totalLen&&w.endsWith(core)) res.push(w); break; }
    case "exact-prefix":{ const {core,totalLen}=parsed; for(const w of words) if(w.length===totalLen&&w.startsWith(core)) res.push(w); break; }
    case "wildcard":{ for(const w of words) if(parsed.regex.test(w)) res.push(w); break; }
  }
  const baseSuffix=parsed.type==="suffix"?parsed.suffix:parsed.type==="exact-suffix"?parsed.core:null;
  if(parsed.alts.length>0&&baseSuffix){
    const ws=_getWordSet();
    const incl=parsed.alts.filter(a=>!a.exclude);
    const excl=parsed.alts.filter(a=>a.exclude);
    res=res.filter(w=>{
      const stem=w.slice(0,w.length-baseSuffix.length);
      return (incl.length===0||incl.some(a=>ws.has(stem+a.suffix)))&&excl.every(a=>!ws.has(stem+a.suffix));
    });
  }
  return res;
}

function _rechRenderResults(words, parsed){
  const el=document.getElementById("rech-search-res"); if(!el) return;
  if(!words.length){ el.innerHTML="<div class='rech-no-res'>Aucun résultat</div>"; return; }
  const isSubana = parsed?.type==="subanagram";
  const baseLetters = isSubana ? parsed.letters.split("") : null;
  function _markExtra(w){
    if(!isSubana) return w;
    const rem=[...baseLetters];
    return [...w].map(l=>{
      const i=rem.indexOf(l);
      if(i>=0){ rem[i]=null; return l; }
      return `<span style="color:#ef4444;font-weight:900">${l}</span>`;
    }).join("");
  }
  const total=words.length;
  const groups={};
  for(const w of words)(groups[w.length]=groups[w.length]||[]).push(w);
  const lens=Object.keys(groups).map(Number).sort((a,b)=>a-b);
  let html=`<div class="rech-count">${total} mot${total>1?"s":""}</div>`;
  for(const len of lens){
    const g=groups[len];
    html+=`<div class="rech-group-hdr">${len} lettres · ${g.length}</div><div class="rech-group">`;
    for(const w of g){
      html+=`<span class="rech-res-word" data-canon="${w}">${_markExtra(w)}</span>`;
    }
    html+="</div>";
  }
  el.innerHTML=html;
}

function prewarmDictMaps(){
  setTimeout(()=>{ _getCMap(); _getDSet(); _getConjMap(); _getWantsSlashSet(); }, 0);
  setTimeout(()=>{ _getAnagramMap(); }, 1000);
}

function openDictModal(){
  _rechFromView = document.querySelector(".view.active")?.id || "v-select";
  _rechSwitchTab("dict");
  showView("v-recherche");
  const inp=document.getElementById("dict-input");
  if(inp){ inp.value=""; }
  const disp=document.getElementById("rech-kb-disp");
  if(disp) disp.textContent="";
  const _suggEl=document.getElementById("dict-sugg"); if(_suggEl) _suggEl.innerHTML="";
  const _resEl=document.getElementById("dict-result"); if(_resEl) _resEl.style.display="none";
  dictUpdateLinks("");
  window._onDictOpen?.();
  inp?.focus();
}

function closeDictModal(){
  showView(_rechFromView || "v-select");
  _rechFromView = null;
}

function _wireDictBtn(el){
  if(!el) return;
  el.addEventListener("touchend", e=>{ e.preventDefault(); openDictModal(); });
  el.addEventListener("click", openDictModal);
}
function wireDictModal(){
  _wireDictBtn(document.getElementById("btn-dict"));
  document.querySelectorAll(".btn-dict-kb").forEach(b=>_wireDictBtn(b));
  document.getElementById("rech-btn-back")?.addEventListener("click", closeDictModal);
  document.getElementById("em-btn-recherche")?.addEventListener("click", openDictModal);
  document.getElementById("btn-tm-recherche")?.addEventListener("click", openDictModal);

  // Onglets
  document.getElementById("rech-tab-btn-dict")?.addEventListener("click", ()=>_rechSwitchTab("dict"));
  document.getElementById("rech-tab-btn-search")?.addEventListener("click", ()=>_rechSwitchTab("search"));

  // Délégation suggestions dictionnaire
  document.getElementById("dict-sugg")?.addEventListener("click", e=>{
    const li=e.target.closest("li"); if(!li) return;
    e.preventDefault();
    if(li.dataset.lemma){ dictSelectWord(li.dataset.lemma); return; }
    if(li.dataset.idx!==undefined){
      const C=window.SEQODS_DATA?.c;
      if(C) dictSelectWord(C[+li.dataset.idx], +li.dataset.idx);
    }
  });
  // Boutons caractères spéciaux PC
  document.querySelectorAll("#rech-pc-specials .rss-btn").forEach(btn=>{
    btn.addEventListener("mousedown", e=>{
      e.preventDefault();
      const ch=btn.dataset.ins;
      const inp=document.getElementById("dict-input"); if(!inp) return;
      const s=inp.selectionStart, en=inp.selectionEnd;
      inp.value=inp.value.slice(0,s)+ch+inp.value.slice(en);
      inp.setSelectionRange(s+1,s+1);
      inp.dispatchEvent(new Event("input",{bubbles:true}));
      inp.focus();
    });
  });

  // Clic sur un mot résultat
  document.getElementById("rech-search-res")?.addEventListener("click", e=>{
    const sp=e.target.closest(".rech-res-word"); if(!sp) return;
    openDef(sp.dataset.canon);
  });

  const inp=document.getElementById("dict-input");
  if(inp){
    inp.addEventListener("input", e=>{
      const disp=document.getElementById("rech-kb-disp");
      if(disp) disp.textContent=e.target.value;
      if(_rechActiveTab==="search"){
        _rechTriggerSearch(e.target.value);
      } else {
        document.getElementById("dict-result")?.style.setProperty("display","none");
        dictUpdateLinks(e.target.value);
        _dictRenderSugg(norm(e.target.value));
      }
    });
    inp.addEventListener("keydown", e=>{
      if(e.key==="Escape"){ closeDictModal(); return; }
      if(e.key==="Enter"){
        if(_rechActiveTab==="search"){
          clearTimeout(_rechSearchTimer);
          const q=inp.value.toUpperCase().trim();
          if(q){ const p=_rechParseQuery(q); _rechRenderResults(_rechExec(q),p); }
          return;
        }
        const v=norm(inp.value); if(!v) return;
        const C=window.SEQODS_DATA?.c; if(!C) return;
        const start=_dictBisect(C,v);
        if(start<C.length && C[start]===v){ dictSelectWord(v); return; }
        if(_getDSet().has(v)){ dictSelectWord(v); return; }
        const first=document.querySelector("#dict-sugg li[data-idx]");
        if(first) first.click();
      }
    });
  }
  document.addEventListener("keydown", e=>{
    if(e.key==="Escape" && document.querySelector("#v-recherche.active")) closeDictModal();
  });
  // Clavier Recherche (mobile)
  const rechKb=document.getElementById("rech-kb");
  if(rechKb){
    const _rechKbPress=k=>{
      const i=document.getElementById("dict-input");
      const d=document.getElementById("rech-kb-disp");
      if(!i) return;
      if(_rechActiveTab==="search"){
        const pos=i.selectionStart??i.value.length;
        const sel=i.selectionEnd??pos;
        if(k==="CLR"){ i.value=""; }
        else if(k==="DEL"){
          if(sel>pos){ i.value=i.value.slice(0,pos)+i.value.slice(sel); i.selectionStart=i.selectionEnd=pos; }
          else if(pos>0){ i.value=i.value.slice(0,pos-1)+i.value.slice(pos); i.selectionStart=i.selectionEnd=pos-1; }
        } else if(k==="OK"){
          clearTimeout(_rechSearchTimer);
          const q=i.value.toUpperCase().trim();
          if(q){ const p=_rechParseQuery(q); _rechRenderResults(_rechExec(q),p); }
          return;
        } else {
          i.value=i.value.slice(0,pos)+k+i.value.slice(sel>pos?sel:pos);
          i.selectionStart=i.selectionEnd=pos+1;
        }
        _rechTriggerSearch(i.value);
        return;
      }
      if(k==="CLR"){ i.value=""; }
      else if(k==="DEL"){ i.value=i.value.slice(0,-1); }
      else if(k==="OK"){
        const v=norm(i.value); if(!v) return;
        const C=window.SEQODS_DATA?.c; if(!C) return;
        const s=_dictBisect(C,v);
        if(s<C.length&&C[s]===v){ dictSelectWord(v); return; }
        if(_getDSet().has(v)){ dictSelectWord(v); return; }
        document.querySelector("#dict-sugg li[data-idx]")?.click();
        return;
      } else { i.value+=k; }
      if(d) d.textContent=i.value;
      document.getElementById("dict-result")?.style.setProperty("display","none");
      dictUpdateLinks(i.value);
      _dictRenderSugg(norm(i.value));
    };
    rechKb.addEventListener("mousedown",e=>{
      const k=e.target.closest(".kk"); if(!k) return;
      e.preventDefault(); _rechKbPress(k.dataset.k);
    });
    rechKb.addEventListener("touchstart",e=>{
      const k=e.target.closest(".kk"); if(!k) return;
      e.preventDefault(); _rechKbPress(k.dataset.k);
    },{passive:false});
    rechKb.addEventListener("click",e=>{ if(e.target.closest(".kk")) e.preventDefault(); });
  }

  if(typeof wireRechercheAdmin==="function") wireRechercheAdmin();
}

/* ── Auth UI ── */
function wireAuthUI(onSuccess){
  // Onglets
  document.querySelectorAll(".auth-tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      document.querySelectorAll(".auth-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      ["login","register","recover"].forEach(name=>{
        const f=document.getElementById("f-"+name);
        if(f) f.style.display = (name===tab.dataset.tab) ? "flex" : "none";
      });
      $("#auth-err").textContent="";
    });
  });

  const setErr = (msg, ok=false) => {
    const el=$("#auth-err"); if(el){el.textContent=msg; el.className="msg"+(ok?" ok":" err");}
  };
  const setLoading = on => {
    ["btn-login","btn-register","btn-recover"].forEach(id=>{
      const b=document.getElementById(id); if(b) b.disabled=on;
    });
  };

  $("#btn-login")?.addEventListener("click", async()=>{
    const p=$("#login-pseudo")?.value||"", pw=$("#login-pass")?.value||"";
    setLoading(true); setErr("");
    const r = await authLogin(p, pw);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    onSuccess(r.pseudo, r.token);
  });

  $("#btn-register")?.addEventListener("click", async()=>{
    const p=$("#reg-pseudo")?.value||"";
    const pw=$("#reg-pass")?.value||"", pw2=$("#reg-pass2")?.value||"";
    const secretQ=$("#reg-question")?.value||"", secretA=$("#reg-answer")?.value||"";
    setLoading(true); setErr("");
    const r = await authRegister(p, pw, pw2, secretQ, secretA);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    onSuccess(r.pseudo, r.token);
  });

  $("#btn-find-question")?.addEventListener("click", async()=>{
    const p=$("#rec-pseudo")?.value||"";
    setLoading(true); setErr("");
    const r = await authGetQuestion(p);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    const qDiv=$("#rec-question-display");
    if(qDiv){qDiv.textContent=r.question;qDiv.style.display="";}
    ["rec-answer","rec-new","btn-recover"].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display=""; });
  });

  $("#btn-recover")?.addEventListener("click", async()=>{
    const p=$("#rec-pseudo")?.value||"";
    const ans=$("#rec-answer")?.value||"", np=$("#rec-new")?.value||"";
    setLoading(true); setErr("");
    const r = await authRecover(p, ans, np);
    setLoading(false);
    if(!r.ok){ setErr(r.err); return; }
    setErr("Mot de passe changé. Reconnecte-toi.", true);
  });

  // Enter pour valider
  [["login-pass","btn-login"],["reg-answer","btn-register"],["rec-new","btn-recover"]].forEach(([inp,btn])=>{
    document.getElementById(inp)?.addEventListener("keydown", e=>{
      if(e.key==="Enter") document.getElementById(btn)?.click();
    });
  });
}
