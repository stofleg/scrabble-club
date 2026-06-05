"use strict";
/* ══════════════════════════════════════════
   THEMODS.JS
══════════════════════════════════════════ */

/* ── Définitions personnalisées : chargement lazy pour les jeux THEMODS ── */
const _customDefPending = new Set();

function _loadCustomDefIfNeeded(canon, onLoaded){
  if(window._rechCache?.[canon]?.loaded) return;
  if(_customDefPending.has(canon)) return;
  _customDefPending.add(canon);
  fbGet("rech_custom", canon).then(r=>{
    _customDefPending.delete(canon);
    if(!window._rechCache) window._rechCache={};
    if(!window._rechCache[canon]) window._rechCache[canon]={custom:{},excl:[],loaded:false};
    window._rechCache[canon].custom = r.ok && r.data ? r.data : {};
    window._rechCache[canon].loaded = true;
    const _c=window._rechCache[canon].custom; if(_c.def!==undefined||_c.defQuiz!==undefined) onLoaded();
  }).catch(()=>{ _customDefPending.delete(canon); });
}

/* ── Exclusions par module (chargées depuis rech_modexcl/{theme}) ── */
const _modExcl = {}; // theme → Set<canon>

async function _loadModExcl(theme){
  if(_modExcl.hasOwnProperty(theme)) return _modExcl[theme];
  const r = await fbGet("rech_modexcl", theme);
  _modExcl[theme] = new Set(r.ok && r.data?.words ? r.data.words : []);
  return _modExcl[theme];
}

/* ── État ── */
const LS_THEMODS = () => "THEMODS_STATE_" + (currentUser?.pseudo||"guest");
let tmState = null;
let tmKb = null;
let tmInited = false;
let tmSolTimeout = null;

function tmDefault(){ return {updatedAt:0, themes:{}}; }
function tmLoadLocal(){ try{ return JSON.parse(localStorage.getItem(LS_THEMODS())||"null")||tmDefault(); }catch{ return tmDefault(); } }
function tmSaveLocal(){ try{ localStorage.setItem(LS_THEMODS(), JSON.stringify(tmState)); }catch{} }

function _mergeTmStates(a, b){
  // Fusionne deux états THEMODS : prend le meilleur de chaque label,
  // plutôt que de trancher en bloc sur updatedAt.
  const out = { updatedAt: Math.max(a.updatedAt||0, b.updatedAt||0), themes:{} };
  const themes = new Set([...Object.keys(a.themes||{}), ...Object.keys(b.themes||{})]);
  for(const th of themes){
    const at = a.themes?.[th]||{}, bt = b.themes?.[th]||{};
    out.themes[th] = {};
    const labels = new Set([...Object.keys(at), ...Object.keys(bt)]);
    for(const lb of labels){
      if(lb==='_completions'){
        out.themes[th][lb] = Math.max(at[lb]||0, bt[lb]||0);
      } else if(lb==='_p'){
        // Progression ODS/GM : garder le plus avancé (done max)
        const ap=at[lb]||{done:0}, bp=bt[lb]||{done:0};
        out.themes[th][lb] = (bp.done||0)>=(ap.done||0) ? bp : ap;
      } else {
        // Session SRS standard : validated l'emporte, puis seen, puis meilleur due
        const as=at[lb]||{}, bs=bt[lb]||{};
        const validated = as.validated || bs.validated;
        const seen      = as.seen || bs.seen;
        const src       = validated ? (as.validated ? as : bs) : ((as.lastSeen||'')>=(bs.lastSeen||'') ? as : bs);
        out.themes[th][lb] = {
          seen, validated,
          done:       !!(as.done || bs.done),
          lastResult: src.lastResult||'',
          lastSeen:   src.lastSeen||'',
          interval:   Math.max(as.interval||1, bs.interval||1),
          due:        validated ? src.due||todayStr()
                                : ((as.due||'') > (bs.due||'') ? as.due : bs.due)||todayStr()
        };
      }
    }
  }
  return out;
}

async function loadThemodsState(){
  tmState = tmLoadLocal();
  const localVi = Object.values(tmState?.themes?.vi||{}).filter(v=>v?.validated).length;
  console.log('[sync] local vi validated:', localVi);
  if(!currentUser) return;
  const r = await fbGet("themods", currentUser.pseudo.toLowerCase());
  const fbRaw = r.data?.state ? JSON.parse(r.data.state) : null;
  const fbVi = Object.values(fbRaw?.themes?.vi||{}).filter(v=>v?.validated).length;
  console.log('[sync] fbGet ok:', r.ok, 'err:', r.err||'—', '| firebase vi validated:', fbVi);
  if(r.ok && fbRaw){
    tmState = _mergeTmStates(tmState, fbRaw);
    const mergedVi = Object.values(tmState?.themes?.vi||{}).filter(v=>v?.validated).length;
    console.log('[sync] merged vi validated:', mergedVi);
    tmSaveLocal();
    persistThemods().catch(e=>console.error('[sync] persistThemods error:', e));
    updateTmStats();
    updateVerbesStats();
  } else if(r.err === "not_found"){
    tmSaveLocal();
    persistThemods().catch(e=>console.error('[sync] initial create error:', e));
  } else {
    tmSaveLocal();
  }
}
async function persistThemods(){
  if(!currentUser) return;
  tmState.updatedAt = Date.now();
  tmSaveLocal();
  // Stocker comme un seul champ JSON pour éviter la limite Firestore d'index (40k entrées)
  const wr = await fbSet("themods", currentUser.pseudo.toLowerCase(), {state: JSON.stringify(tmState)});
  console.log('[sync] fbSet ok:', wr.ok, wr.err||'');
}

function getSt(theme, label){
  if(!tmState.themes[theme]) tmState.themes[theme]={};
  if(!tmState.themes[theme][label]) tmState.themes[theme][label]={seen:false,validated:false,lastResult:"",lastSeen:"",interval:1,due:todayStr()};
  const s=tmState.themes[theme][label];
  if(!s.due) s.due=todayStr();
  if(!s.interval) s.interval=1;
  return s;
}

/* ── Dict ODS ── */
let TM_DICT = null;
function getTmDict(){
  if(!TM_DICT){ const d=window.SEQODS_DATA?.d; TM_DICT=d?new Set(d):new Set(); }
  return TM_DICT;
}

/* ── Formes fléchies (normalisé → e[] de data.js) ── */
let _normToE = null;
function getNormToE(){
  if(!_normToE){
    _normToE = {};
    const d = window.SEQODS_DATA;
    // Reverse lookup: derive key from e[i] itself (immune to c/e index misalignment)
    (d?.e || []).forEach(raw => {
      if(!raw) return;
      const n = norm(raw.split(',')[0].split('/')[0].trim());
      if(n && !_normToE[n]) _normToE[n] = raw;
    });
  }
  return _normToE;
}
function getInflected(normWord){
  const e = getNormToE()[normWord];
  return (e && e !== normWord) ? e : null;
}

/* ── Définitions (normalisé → f[] de data.js) ── */
let _normToF = null;
function getNormToF(){
  if(!_normToF){
    _normToF = {};
    const d = window.SEQODS_DATA;
    (d?.e || []).forEach((raw, i) => {
      if(!raw) return;
      const n = norm(raw.split(',')[0].split('/')[0].trim());
      if(!n) return;
      const def = d.f?.[i] || "";
      if(!_normToF[n]) _normToF[n] = def;
      else if(def && _normToF[n] !== def) _normToF[n] += " / " + def;
    });
  }
  return _normToF;
}

let _normToAllDefs = null;
function getNormToAllDefs(){
  if(!_normToAllDefs){
    _normToAllDefs = {};
    const d = window.SEQODS_DATA;
    (d?.e || []).forEach((raw, i) => {
      if(!raw) return;
      const n = norm(raw.split(',')[0].split('/')[0].trim());
      if(!n) return;
      const def = d.f?.[i] || "";
      if(!_normToAllDefs[n]) _normToAllDefs[n] = [];
      if(def && !_normToAllDefs[n].includes(def)) _normToAllDefs[n].push(def);
    });
  }
  return _normToAllDefs;
}

const _getPOS = d => (d.match(/^(n\.[mf]\.|adj\.|v\.|loc\.|adv\.|interj\.)/) || [])[1] || null;

const _TYPE_PFX_GM = /^(?:(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.(?:\s+et\s+(?:n|v|adj|adv|prép|prep|conj|interj|art|pron|dét|det|loc|part|préf|suff|aff|sym|m|f|pl)\.)*\s*)+/i;
function _gmIsRealDef(d){
  const c = cleanDef(d); if(!c) return false;
  const s = c.replace(_TYPE_PFX_GM,"").trim();
  // Une vraie définition : commence par majuscule ou (, pas un simple parenthétique,
  // et contient au moins 4 lettres consécutives (distingue "Vx. ." de "Crevette grise.")
  return s.length>3
    && /^[A-ZÀ-ÖØ-ÞŒŸ(]/.test(s)
    && !/^\([^)]+\)\.?\s*$/.test(s)
    && /[A-Za-zÀ-ÿœæŒÆ]{4}/.test(s);
}

function _gmPickDef(primaryCanon, allForms){
  const allDefsMap = getNormToAllDefs();
  const isReal = d => _gmIsRealDef(d);
  const seen = new Set();
  for(const raw of [primaryCanon, ...allForms.map(f=>norm(f.split(',')[0].trim()))]){
    if(!raw||seen.has(raw)) continue; seen.add(raw);
    const real=(allDefsMap[raw]||[]).filter(isReal);
    if(!real.length) continue;
    // Priorité à la définition nominale (ex. TOASTER n.m. avant v.)
    const noun=typeof _defIsNoun==="function" ? real.find(_defIsNoun) : null;
    return noun||real[0];
  }
  return (allDefsMap[primaryCanon]||[])[0]||"";
}
function tmRefocus(){
  if(window.matchMedia("(pointer:fine)").matches)
    setTimeout(()=>document.getElementById("tm-saisie")?.focus(), 50);
}

let tmChronoInterval=null, tmChronoRem=0;
function tmChronoStop(){
  if(tmChronoInterval){ clearInterval(tmChronoInterval); tmChronoInterval=null; }
}
function tmChronoStart(){
  tmChronoStop();
  const el=document.getElementById("tm-chrono"); if(!el) return;
  if(!settings.chronoEnabled){ el.textContent=""; el.className="chrono"; return; }
  tmChronoRem=settings.chronoDur*60;
  el.textContent=chronoFmt(tmChronoRem);
  el.className="chrono running";
  tmChronoInterval=setInterval(()=>{
    tmChronoRem=Math.max(0,tmChronoRem-1);
    el.textContent=chronoFmt(tmChronoRem);
    if(tmChronoRem===0){
      el.className="chrono expired";
      tmChronoStop();
      if(!tmSolutions) showTmSolutions();
    }
  },1000);
}
function tmChronoReset(){
  tmChronoStop();
  const el=document.getElementById("tm-chrono"); if(!el) return;
  if(settings.chronoEnabled){ el.textContent=chronoFmt(settings.chronoDur*60); el.className="chrono"; }
  else { el.textContent=""; el.className="chrono"; }
}

// Vrai si le mot fait ≥10 lettres ET sa définition contient "(p.p.inv.)"
function isLongPpInv(n){
  return n.length > 9 && (getNormToF()[n] || "").includes("(p.p.inv.)");
}

/* ── État jeu ── */
let tmTheme=null, tmSession=null;
let tmFound=new Set(), tmSolutions=false, tmNoHelp=true;
let gmCurrentIdx=0, gmFound=new Set();
let odsEntryIdx=0, odsFnd=new Set();

/* ── Navigation sous-vues ── */
function showTmView(id){
  document.querySelectorAll("#v-themods .tmv").forEach(v=>{
    v.classList.toggle("active", v.id===id);
  });
  // Clavier mobile : visible seulement en jeu
  const kb = document.getElementById("tm-kb");
  if(kb) kb.style.display = (id==="tv-game") ? "" : "none";
}

/* ── Accueil ── */
function renderTmHome(){
  showTmView("tv-home");
  updateTmStats();
  setDictBtnVisible(true);
}

function renderTmVerbes(){
  showTmView("tv-verbes");
  updateVerbesStats();
  setDictBtnVisible(true);
}

function updateVerbesStats(){
  const viData=window.THEMODS_DATA?.vi||[];
  let viVal=0; viData.forEach(({label})=>{ if(getSt("vi",label).validated) viVal++; });
  const viEl=document.getElementById("vi-desc2");
  if(viEl) viEl.textContent="575 verbes · 193 sessions"+fmtPct(viVal,viData.length);

  const vtData=window.THEMODS_DATA?.vt||[];
  let vtVal=0; vtData.forEach(({label})=>{ if(getSt("vt",label).validated) vtVal++; });
  const vtEl=document.getElementById("vt-desc");
  if(vtEl) vtEl.textContent="4 968 verbes · 1 580 sessions"+fmtPct(vtVal,vtData.length);

  const vdData=window.THEMODS_DATA?.vd||[];
  let vdVal=0; vdData.forEach(({label})=>{ if(getSt("vd",label).validated) vdVal++; });
  const vdEl=document.getElementById("vd-desc");
  if(vdEl) vdEl.textContent="66 verbes · 42 sessions"+fmtPct(vdVal,vdData.length);
}

function renderTmFinales(){
  showTmView("tv-finales");
  updateFinalesStats();
  setDictBtnVisible(true);
}

function fmtPct(val, total){
  if(!total || !val) return "";
  return " · "+Math.round(val/total*100)+"%";
}

function updateTmStats(){
  if(!tmState) return;
  // GM
  const {seen:gmSeen,validated:gmVal,toReview:gmRev,total:gmTotal}=getGMStats();
  const gmEl=document.getElementById("gm-desc");
  if(gmEl){
    const parts=[gmTotal+" groupes"];
    if(gmVal) parts.push(gmVal+" validés");
    if(gmRev) parts.push(gmRev+" à revoir");
    else if(gmSeen&&!gmVal) parts.push(gmSeen+" vus");
    gmEl.textContent=parts.join(" · ");
  }



  // Finales
  const finales=["able","age","ique","oir","ure","ard","ant","if","in","ail","ais","ois","erie","et","ette","ide","ite","eau","ot","um","eux","al","ase","ose","eur","ier","ien","isme","iste"];
  let totalSess=0, totalVal=0;
  finales.forEach(th=>{
    const d=window.THEMODS_DATA?.[th]; if(!d) return;
    totalSess+=d.length;
    d.forEach(({label})=>{ if(getSt(th,label).validated) totalVal++; });
  });
  const fEl=document.getElementById("finales-desc");
  if(fEl) fEl.textContent="29 finales"+fmtPct(totalVal,totalSess);

  // Verbes
  const verbesThemes=["vi","vt","vd"];
  let vTotal=0, vVal=0;
  verbesThemes.forEach(th=>{ const d=window.THEMODS_DATA?.[th]; if(!d) return; vTotal+=d.length; d.forEach(({label})=>{ if(getSt(th,label).validated) vVal++; }); });
  const viEl=document.getElementById("verbes-desc");
  if(viEl) viEl.textContent="3 thèmes · 5 230 verbes"+fmtPct(vVal,vTotal);

  // ODS 1-9 (home summary)
  const odsEl=document.getElementById("ods-desc");
  if(odsEl){
    let totalDone=0, totalEntries=0;
    for(let v=1;v<=9;v++){
      const th="ods"+v;
      const all=getAllOdsEntries(th);
      totalEntries+=all.length;
      totalDone+=(getOdsProgress(th).done||0);
    }
    odsEl.textContent="9 éditions"+fmtPct(totalDone,totalEntries);
  }
}

function renderTmOds(){
  showTmView("tv-ods");
  updateOdsStats();
}

function updateOdsStats(){
  for(let v=1;v<=9;v++){
    const th="ods"+v;
    const all=getAllOdsEntries(th);
    const done=getOdsProgress(th).done||0;
    const el=document.getElementById(th+"-desc");
    if(el) el.textContent=all.length+" entrées"+fmtPct(done,all.length);
  }
}

function updateFinalesStats(){
  const bases={
    able:"293 mots · 136 sessions",age:"1 311 mots · 360 sessions",ique:"629 mots · 177 sessions",oir:"253 mots · 99 sessions",
    ure:"455 mots · 152 sessions",ard:"233 mots · 79 sessions",ant:"767 mots · 226 sessions",
    if:"293 mots · 130 sessions",in:"657 mots · 218 sessions",ais:"147 mots · 87 sessions",
    ois:"180 mots · 89 sessions",erie:"278 mots · 100 sessions",et:"544 mots · 169 sessions",
    ette:"436 mots · 148 sessions",ide:"446 mots · 142 sessions",ite:"803 mots · 246 sessions",
    eau:"242 mots · 92 sessions",ot:"261 mots · 101 sessions",um:"267 mots · 117 sessions",
    eux:"414 mots · 136 sessions",ail:"44 mots · 34 sessions",al:"665 mots · 199 sessions",
    ase:"81 mots · 47 sessions",ose:"134 mots · 83 sessions",eur:"601 mots · 189 sessions",
    ier:"495 mots · 142 sessions",ien:"601 mots · 223 sessions",isme:"356 mots · 142 sessions",iste:"218 mots · 115 sessions"
  };
  Object.keys(bases).forEach(th=>{
    const d=window.THEMODS_DATA?.[th]; if(!d) return;
    let val=0; d.forEach(({label})=>{ if(getSt(th,label).validated) val++; });
    const el=document.getElementById(th+"-desc");
    if(el) el.textContent=bases[th]+fmtPct(val,d.length);
  });
}

/* ── Lancement session ── */
function showSrsPrompt(theme, srsPool){
  const prompt=document.getElementById("tm-srs-prompt"); if(!prompt) return;
  const n=srsPool.length;
  const countEl=document.getElementById("tm-srs-count");
  if(countEl) countEl.textContent=n+" liste"+(n>1?"s":"");
  // Clone buttons to clear stale listeners
  ["tm-srs-ok","tm-srs-skip"].forEach(id=>{
    const old=document.getElementById(id); if(!old) return;
    const fresh=old.cloneNode(true); old.parentNode.replaceChild(fresh,old);
  });
  document.getElementById("tm-srs-ok")?.addEventListener("click",()=>{
    prompt.style.display="none";
    startSession(theme, srsPool[Math.floor(Math.random()*srsPool.length)]);
  });
  document.getElementById("tm-srs-skip")?.addEventListener("click",()=>{
    prompt.style.display="none";
  });
  prompt.style.display="";
}

async function playTheme(theme){
  tmTheme=theme;
  if(theme==="gm"){ startGM(); return; }

  if(isOds(theme)){ startOds(theme); return; }
  const data=window.THEMODS_DATA?.[theme]; if(!data) return;
  const today=todayStr();
  const msg=document.getElementById("tm-home-msg"); if(msg){msg.textContent="";msg.className="tm-msg";}

  const excl = await _loadModExcl(theme);
  const maxLen = (typeof settings!=="undefined" && settings.finaleMaxLen) || 15;
  const filterWords = sess => {
    const words = (sess.words||[]).filter(w=>!excl.has(norm(w)) && w.length<=maxLen);
    return words.length ? {...sess, words} : null;
  };

  const unseenPool=data.filter(({label})=>!getSt(theme,label).seen).map(filterWords).filter(Boolean);
  const srsPool=data.filter(({label})=>{ const s=getSt(theme,label); return s.seen&&!s.validated&&s.due<=today; }).map(filterWords).filter(Boolean);
  const lockedPool=data.filter(({label})=>{ const s=getSt(theme,label); return s.seen&&!s.validated&&s.due>today; }).map(filterWords).filter(Boolean);

  const playPool = unseenPool.length ? unseenPool : srsPool.length ? srsPool : lockedPool;
  if(playPool.length){ startSession(theme, playPool[Math.floor(Math.random()*playPool.length)]); return; }

  const total=data.length, val=data.filter(({label})=>getSt(theme,label).validated).length;
  if(val===total){
    if(!tmState.themes[theme]) tmState.themes[theme]={};
    tmState.themes[theme]._completions=(tmState.themes[theme]._completions||0)+1;
    persistThemods().catch(()=>{});
    _showTmDone(theme);
  } else {
    if(window.THEMODS_DATA?.[theme]&&!["gm","vi","vt","vd"].includes(theme)) renderTmFinales();
    else if(["vi","vt","vd"].includes(theme)) renderTmVerbes();
    else renderTmHome();
  }
}

function startSession(theme, session){
  if(tmSolTimeout){ clearTimeout(tmSolTimeout); tmSolTimeout=null; }
  // Verbes associés : injecter les cousins pour les thèmes qui le supportent
  {
    const _verbOf={
      ot:w=>w+"ER",ais:w=>w+"ER",al:w=>w+"ER",ant:w=>w+"ER",ard:w=>w+"ER",
      et:w=>w+"ER",ier:w=>w+"ER",if:w=>w.slice(0,-1)+"VER",in:w=>w+"ER",ois:w=>w+"ER"
    };
    const verbOf=_verbOf[theme];
    if(verbOf){
      const cm=_getCMap();
      const extra={};
      (session.words||[]).forEach(w=>{
        const wc=norm(w);
        const vb=verbOf(wc);
        if(!session.cousins?.[wc] && cm.has(vb)) extra[wc]=vb;
      });
      if(Object.keys(extra).length)
        session={...session,cousins:{...(session.cousins||{}),...extra}};
    }
  }
  tmSession=session; tmFound=new Set(); tmSolutions=false; tmNoHelp=true;
  getSt(theme, session.label).seen=true;
  getSt(theme, session.label).lastSeen=todayStr();
  persistThemods().catch(()=>{});
  setDictBtnVisible(false);
  showTmView("tv-game");
  renderTmGame();
  updateTmBtn();
  setTmMsg("");
  _setQuizMode(false);
  _showVerdictBar(false, false);
  tmChronoStart();
  if(tmKb) tmKb.clear();
  setTimeout(()=>{ if(window.matchMedia("(pointer:fine)").matches) document.getElementById("tm-saisie")?.focus(); },80);
}

/* ── Rendu jeu ── */
const THEME_NAMES={age:"Finale -AGE",vi:"Intransitifs",oir:"Finale -OIR",able:"Finale -ABLE",ique:"Finale -IQUE",gm:"Graphies multiples",
  ods1:"Nouveautés ODS1",ods2:"Nouveautés ODS2",ods3:"Nouveautés ODS3",ods4:"Nouveautés ODS4",ods5:"Nouveautés ODS5",
  ods6:"Nouveautés ODS6",ods7:"Nouveautés ODS7",ods8:"Nouveautés ODS8",ods9:"Nouveautés ODS9",
  ure:"Finale -URE",ard:"Finale -ARD",ant:"Finale -ANT",if:"Finale -IF",in:"Finale -IN",
  ais:"Finale -AIS",ois:"Finale -OIS",erie:"Finale -ERIE",et:"Finale -ET",ette:"Finale -ETTE",
  ide:"Finale -IDE",ite:"Finale -ITE",eau:"Finale -EAU",ot:"Finale -OT",um:"Finale -UM",
  eux:"Finale -EUX",ail:"Finale -AIL",al:"Finale -AL",ase:"Finale -ASE",ose:"Finale -OSE",
  eur:"Finale -EUR",ier:"Finale -IER",ien:"Finale -IEN",isme:"Finale -ISME",iste:"Finale -ISTE",
  vt:"Transitifs",vd:"Défectifs"};
const THEME_SFX={age:"AGE",vi:"",oir:"OIR",able:"ABLE",ique:"IQUE",gm:"",
  ods1:"",ods2:"",ods3:"",ods4:"",ods5:"",ods6:"",ods7:"",ods8:"",ods9:"",
  ure:"URE",ard:"ARD",ant:"ANT",if:"IF",in:"IN",ais:"AIS",ois:"OIS",erie:"ERIE",
  et:"ET",ette:"ETTE",ide:"IDE",ite:"ITE",eau:"EAU",ot:"OT",um:"UM",eux:"EUX",
  ail:"AIL",al:"AL",ase:"ASE",ose:"OSE",eur:"EUR",ier:"IER",ien:"IEN",isme:"ISME",iste:"ISTE",
  vt:"",vd:""};
function isOds(th){ return /^ods\d$/.test(th); }

/* ── ODS helper functions ── */
function getAllOdsEntries(theme){
  const all=[];
  (window.THEMODS_DATA?.[theme]||[]).forEach(s=>{
    (s.entries||[]).forEach(e=>{
      if(!(e.def||"").includes("Nouveau participe")) all.push(e);
    });
  });
  return all;
}
function getOdsProgress(theme){
  if(!tmState.themes) tmState.themes={};
  if(!tmState.themes[theme]) tmState.themes[theme]={};
  if(!tmState.themes[theme]._p) tmState.themes[theme]._p={idx:0,done:0,order:null};
  return tmState.themes[theme]._p;
}
function currentOdsEntry(theme){
  const all=getAllOdsEntries(theme), prog=getOdsProgress(theme);
  const realIdx=prog.order?.[odsEntryIdx];
  return realIdx!==undefined ? all[realIdx] : null;
}
function startOds(theme){
  const all=getAllOdsEntries(theme), prog=getOdsProgress(theme);
  if(!prog.order||prog.order.length!==all.length){
    prog.order=shuffleArray(all.map((_,i)=>i));
    prog.idx=0; prog.done=0;
  }
  if(prog.idx>=all.length){ prog.order=shuffleArray(all.map((_,i)=>i)); prog.idx=0; }
  if(tmSolTimeout){ clearTimeout(tmSolTimeout); tmSolTimeout=null; }
  odsEntryIdx=prog.idx; odsFnd=new Set(); tmSolutions=false; tmNoHelp=true;
  showTmView("tv-game");
  document.getElementById("tm-gtitle").textContent=THEME_NAMES[theme]||theme;
  const lbl=document.getElementById("tm-session-label"); if(lbl) lbl.textContent="";
  setTmMsg(""); renderOdsGame();
  _setQuizMode(true);
  _showVerdictBar(true, false);
}
function isOdsResolved(){
  const entry=currentOdsEntry(tmTheme); if(!entry) return false;
  return tmSolutions||entry.forms.every(f=>odsFnd.has(norm(f)));
}
function validateOdsWord(n){
  const entry=currentOdsEntry(tmTheme); if(!entry) return;
  if(!entry.forms.find(f=>norm(f)===n)){
    setTmMsg(getTmDict().has(n)?"Hors-jeu — mot valide mais pas dans cette liste.":"Mot non valide.",
             getTmDict().has(n)?"warn":"err");
    return;
  }
  odsFnd.add(n); setTmMsg("");
  const allFound=entry.forms.every(f=>odsFnd.has(norm(f)));
  if(allFound){
    const prog=getOdsProgress(tmTheme);
    prog.done=(prog.done||0)+1; prog.idx=odsEntryIdx+1;
    const msg=entry.forms.length>1?"✓ Toutes les graphies trouvées !":"✓";
    setTmMsg(msg,"ok");
    persistThemods().catch(()=>{});
  }
  renderOdsGame();
  updateTmBtn();
}

function renderOdsGame(){
  const entry=currentOdsEntry(tmTheme);
  const list=document.getElementById("tm-wlist"); if(!list) return;
  list.innerHTML="";
  const lbl=document.getElementById("tm-session-label"); if(lbl) lbl.textContent="";
  if(!entry){ setTmMsg("Toutes les entrées terminées !","ok"); return; }

  const sortedForms=[...entry.forms].sort((a,b)=>norm(a)<norm(b)?-1:norm(a)>norm(b)?1:0);
  const allFormsFound=sortedForms.every(f=>odsFnd.has(norm(f)));
  const _odsCanon=norm(sortedForms[0]);
  const _odsC=window._rechCache?.[_odsCanon]; const _cdOds=_odsC?.loaded ? (_odsC.custom?.defQuiz||_odsC.custom?.def) : undefined;
  const defDiv=document.createElement("div");
  defDiv.className="gm-def";
  const defText=document.createElement("span");
  defText.textContent=cleanDef(_cdOds!==undefined ? _cdOds : entry.def)||"…";
  defDiv.appendChild(defText);
  list.appendChild(defDiv);
  if(_cdOds===undefined) _loadCustomDefIfNeeded(_odsCanon, ()=>renderOdsGame());

  const tilesDiv=document.createElement("div"); tilesDiv.className="gm-tiles";
  sortedForms.forEach(form=>{
    const isFound=odsFnd.has(norm(form))||allFormsFound;
    const revealed=isFound||tmSolutions;
    const letters=form.replace(/[Œœ]/g,"OE").replace(/[Ææ]/g,"AE").replace(/[^A-Za-zÀ-ÿ]/g,"").toUpperCase();
    const row=document.createElement("div"); row.className="gm-row";
    for(let i=0;i<letters.length;i++){
      const t=document.createElement("span");
      if(revealed){ t.className="gt "+(isFound?"ok":"miss"); t.textContent=letters[i]; }
      else if(i===0){ t.className="gt init"; t.textContent=letters[0]; }
      else { t.className="gt empty"; }
      row.appendChild(t);
    }
    if(revealed){
      row.style.cursor="pointer";
      row.addEventListener("click",()=>openDef(norm(form)));
    }
    tilesDiv.appendChild(row);
  });
  // Graphies existantes (also) — affichées après résolution
  if((allFormsFound||tmSolutions)&&entry.also?.length){
    const alsoLabel=document.createElement("div");
    alsoLabel.className="gm-also-label";
    alsoLabel.textContent=(entry.also.length>1?"Autres graphies existantes :":"Autre graphie existante :");
    tilesDiv.appendChild(alsoLabel);
    entry.also.forEach(form=>{
      const letters=form.replace(/[Œœ]/g,"OE").replace(/[Ææ]/g,"AE").replace(/[^A-Za-zÀ-ÿ]/g,"").toUpperCase();
      const row=document.createElement("div"); row.className="gm-row";
      for(let i=0;i<letters.length;i++){
        const t=document.createElement("span"); t.className="gt also"; t.textContent=letters[i];
        row.appendChild(t);
      }
      row.style.cursor="pointer";
      row.addEventListener("click",()=>openDef(norm(form)));
      tilesDiv.appendChild(row);
    });
  }
  list.appendChild(tilesDiv);
}

function renderTmGame(){
  if(tmTheme==="gm"){ renderGMGame(); return; }
  if(isOds(tmTheme)){ renderOdsGame(); return; }
  const sess=tmSession; if(!sess) return;

  const el=id=>document.getElementById(id);
  const sfx=THEME_SFX[tmTheme];
  if(el("tm-gtitle")) el("tm-gtitle").textContent=THEME_NAMES[tmTheme]||tmTheme;
  if(el("tm-session-label")) el("tm-session-label").textContent=sess.label+(sfx?"…"+sfx:"…");

  const list=el("tm-wlist"); if(!list) return;
  list.innerHTML="";
  sess.words.forEach((word,i)=>{
    const li=document.createElement("li");
    li.dataset.idx=i; li.className="slot";
    const canon=norm(word);
    const display=getNormToE()[canon]||word;
    const cousin=sess.cousins?.[canon]||null;
    if(tmFound.has(i)){
      li.classList.add("found","clickable");
      setElWord(li,display,canon,"",cousin);
      li.addEventListener("click",()=>openDef(canon,display));
    } else if(tmSolutions){
      li.classList.add("revealed","clickable");
      setElWord(li,display,canon,"",cousin);
      li.addEventListener("click",()=>openDef(canon,display));
    }
    list.appendChild(li);
  });
}

function validateTmWord(raw){
  const n=norm(raw); if(!n) return;
  if(tmSolutions){
    setTmMsg(getTmDict().has(n)?n+" : mot valide ✓":"Mot inconnu.","ok");
    return;
  }
  if(tmTheme==="gm"){ validateGMWord(n); return; }

  if(isOds(tmTheme)){ validateOdsWord(n); return; }
  const sess=tmSession; if(!sess) return;
  const matched=[];
  sess.words.forEach((w,i)=>{ if(!tmFound.has(i)&&norm(w)===n) matched.push(i); });
  if(!matched.length){
    const inDict=getTmDict().has(n);
    if(!inDict){
      setTmMsg("Mot inconnu — la partie s'arrête.","err");
      tmSolTimeout = setTimeout(()=>showTmSolutions(),800);
    } else if(tmTheme==="vi" && !isLongPpInv(n)){
      setTmMsg("Mot valide — fin de session.","warn");
      tmSolTimeout = setTimeout(()=>showTmSolutions(),800);
    } else {
      setTmMsg("Hors-jeu — mot valide mais pas dans cette liste.","warn");
    }
    return;
  }
  matched.forEach(i=>{
    tmFound.add(i);
    const li=document.querySelector("#tm-wlist li[data-idx='"+i+"']");
    if(li){
      const w=sess.words[i];
      const wc=norm(w);
      const display=getNormToE()[wc]||w;
      const cousin=sess.cousins?.[wc]||null;
      li.className="slot found clickable";
      setElWord(li,display,wc,"",cousin);
      li.addEventListener("click",()=>openDef(wc,display));
      li.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  });
  setTmMsg("");
  const ctr=document.getElementById("tm-counter");
  if(ctr) ctr.textContent=tmFound.size+" / "+sess.words.length;
  if(tmFound.size===sess.words.length) finalizeTm(tmNoHelp);
  else persistThemods().catch(()=>{});
}

/* ── Helpers mode quiz (GM/ODS) ── */
function _setQuizMode(on){
  const inp = document.getElementById("tm-inp-bar");
  const kb  = document.getElementById("tm-kb");
  const sol = document.getElementById("tm-btn-sol");
  if(inp) inp.style.display = on ? "none" : "";
  if(kb)  kb.style.display  = on ? "none" : "";
  if(sol) sol.style.display = on ? "none" : "";
}
function _showVerdictBar(visible, withVerdict){
  const bar  = document.getElementById("tm-verdict-bar");
  const btns = document.getElementById("tm-verdict-btns");
  const solQ = document.getElementById("tm-btn-sol-quiz");
  if(bar)  bar.style.display  = visible ? "flex" : "none";
  if(solQ) solQ.style.display = (visible && !withVerdict) ? "" : "none";
  if(btns) btns.style.display = (visible && withVerdict)  ? "flex" : "none";
}
function _advanceOds(ok){
  const prog=getOdsProgress(tmTheme);
  prog.done=(prog.done||0)+1; prog.idx=odsEntryIdx+1;
  odsEntryIdx++; odsFnd=new Set(); tmSolutions=false;
  const all=getAllOdsEntries(tmTheme);
  if(odsEntryIdx>=all.length){
    prog.order=shuffleArray(all.map((_,i)=>i)); prog.idx=0; odsEntryIdx=0;
  }
  setTmMsg(ok?"✓ Trouvé !":"À revoir.", ok?"ok":"warn");
  _showVerdictBar(true, false);
  renderOdsGame();
  persistThemods().catch(()=>{});
}

function showTmSolutions(){
  tmNoHelp=false;
  if(tmTheme==="gm"){ tmSolutions=true; renderGMGame(); _showVerdictBar(true, true); return; }
  if(isOds(tmTheme)){ tmSolutions=true; renderOdsGame(); _showVerdictBar(true, true); return; }
  const sess=tmSession; if(!sess) return;
  tmSolutions=true;
  renderTmGame();
  const ctr=document.getElementById("tm-counter");
  if(ctr) ctr.textContent=sess.words.length+" / "+sess.words.length;
  finalizeTm(false);
}

function finalizeTm(ok){
  tmChronoStop();
  tmSolutions=true;
  setDictBtnVisible(true);
  updateTmBtn();
  const s=getSt(tmTheme, tmSession?.label||"");
  s.seen=true; s.lastSeen=todayStr();
  if(ok){
    s.validated=true; s.lastResult="ok";
    s.interval=nextInterval(s.interval||1); s.due=addDays(todayStr(),s.interval);
    setTmMsg("Validée sans aide ✓","ok");
  } else {
    s.validated=false; s.lastResult="help";
    s.interval=3; s.due=addDays(todayStr(),3);
    setTmMsg("Session terminée.","warn");
  }
  persistThemods().catch(()=>{});
}

function isGMResolved(){
  const entry=currentGMEntry(); if(!entry) return false;
  return tmSolutions||entry.forms.every(f=>gmFound.has(norm(f)));
}

function updateTmBtn(){
  if(tmTheme==="gm"||isOds(tmTheme)) return; // géré par _showVerdictBar
  const sol=document.getElementById("tm-btn-sol");
  const solKb=document.getElementById("tm-btn-sol-kb");
  [sol,solKb].forEach(b=>{
    if(!b) return;
    if(tmSolutions){ b.textContent="Jouer"; b.classList.remove("btn-danger"); b.classList.add("btn-primary"); }
    else { b.textContent="Solutions"; b.classList.add("btn-danger"); b.classList.remove("btn-primary"); }
  });
}

function setTmMsg(t,c){
  const m=document.getElementById("tm-msg");
  if(m){m.textContent=t;m.className="msg"+(c?" "+c:"");}
  if(tmKb) tmKb.setMsg(t,c);
}

function tmReplay(){
  if(tmTheme) playTheme(tmTheme);
  else renderTmHome();
}

function _showTmDone(theme){
  tmTheme=theme;
  const completions=(tmState.themes[theme]?._completions)||0;
  const titleEl=document.getElementById("tv-done-title");
  if(titleEl) titleEl.textContent=THEME_NAMES[theme]||theme;
  const cEl=document.getElementById("tv-done-completions");
  if(cEl){
    if(completions===1) cEl.textContent="1ère validation complète";
    else if(completions===2) cEl.textContent="2ème validation complète";
    else if(completions>2) cEl.textContent=completions+"ème validation complète";
    else cEl.textContent="";
  }
  setDictBtnVisible(true);
  showTmView("tv-done");
}

/* ── Graphies multiples ── */
function getAllGMEntries(){
  const all=[];
  (window.THEMODS_DATA?.gm||[]).forEach(s=>{ (s.entries||[]).forEach(e=>all.push(e)); });
  return all;
}
function shuffleArray(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function getGMSt(idx){
  if(!tmState.themes) tmState.themes={};
  if(!tmState.themes.gm) tmState.themes.gm={};
  const k=String(idx);
  if(!tmState.themes.gm[k]) tmState.themes.gm[k]={seen:false,validated:false,lastResult:"",lastSeen:"",interval:1,due:todayStr()};
  const s=tmState.themes.gm[k]; if(!s.due) s.due=todayStr(); if(!s.interval) s.interval=1;
  return s;
}
function getGMStats(){
  const total=getAllGMEntries().length;
  const gmSt=tmState.themes?.gm||{};
  let seen=0, validated=0, toReview=0;
  for(let i=0;i<total;i++){
    const s=gmSt[String(i)]; if(!s||!s.seen) continue;
    seen++;
    if(s.done) validated++; else toReview++;
  }
  return {seen,validated,toReview,total};
}
function gmPickNext(){
  const total=getAllGMEntries().length, today=todayStr();
  const gmSt=tmState.themes?.gm||{};
  const due=[], unseen=[], locked=[];
  for(let i=0;i<total;i++){
    const s=gmSt[String(i)];
    if(s?.done) continue;                        // validé définitivement, ne revient plus
    if(!s||!s.seen){ unseen.push(i); continue; }
    if(s.due<=today) due.push(i);
    else locked.push(i);
  }
  const pool=due.length?due:unseen.length?unseen:locked;
  return pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
}
function currentGMEntry(){
  const all=getAllGMEntries();
  return all[gmCurrentIdx]||null;
}
function updateGMCounter(){
  const el=document.getElementById("tm-session-label");
  if(!el||tmTheme!=="gm") return;
  const {seen,validated,toReview,total}=getGMStats();
  const parts=[];
  if(validated) parts.push("✓ "+validated);
  if(toReview) parts.push("↺ "+toReview);
  parts.push(seen+"/"+total+" vus");
  el.textContent=parts.join(" · ");
  el.style.fontSize="12px"; el.style.fontWeight="700"; el.style.padding="4px 12px";
}
function finalizeGM(ok){
  tmChronoStop(); tmSolutions=true;
  setDictBtnVisible(true); updateTmBtn();
  const s=getGMSt(gmCurrentIdx);
  s.seen=true; s.lastSeen=todayStr();
  if(ok){
    s.done=true; s.validated=true; s.lastResult="ok";
    setTmMsg("✓ Toutes les graphies trouvées !","ok");
  } else {
    s.done=false; s.validated=false; s.lastResult="help";
    s.interval=3; s.due=addDays(todayStr(),3);
    setTmMsg("Solutions affichées.","warn");
  }
  updateGMCounter(); persistThemods().catch(()=>{});
}
function cleanDef(d){
  if(!d) return "";
  d=d.replace(/^(?:ou\s+)?\[[^\]]*\]\s*/i,"").replace(/^\([^)]*\)\s*/,"");
  d=d.replace(/\s*\(=[^)]*\)/g,"");
  d=d.replace(/\s*-->[^.]*\./g,"");
  d=d.replace(/\s*=\s*[a-zàâäéèêëîïôùûüœæç]+\./g,"");
  d=d.replace(/\s*\([^)]+\)(?=\s*[A-ZÀ-ÖØ-ÞŒŸ]|\s*$)/g,"");
  return d.startsWith("->") ? "" : d.trim();
}
function letterCount(w){ return w.replace(/[Œœ]/g,"OE").replace(/[Ææ]/g,"AE").replace(/[^A-Za-zÀ-ÿ]/g,"").length; }

function startGM(){
  if(tmSolTimeout){ clearTimeout(tmSolTimeout); tmSolTimeout=null; }
  gmFound=new Set(); tmSolutions=false; tmNoHelp=true;
  const idx=gmPickNext();
  if(idx===null){
    const {validated,total}=getGMStats();
    if(validated>=total){
      if(!tmState.themes.gm) tmState.themes.gm={};
      const gmSt=tmState.themes.gm;
      // Réinitialiser pour le prochain cycle
      Object.keys(gmSt).forEach(k=>{
        const s=gmSt[k]; if(s&&typeof s==="object"&&s.done){
          s.done=false; s.validated=false; s.interval=1; s.due=todayStr();
        }
      });
      gmSt._completions=(gmSt._completions||0)+1;
      persistThemods().catch(()=>{}); _showTmDone("gm");
    } else { renderTmHome(); }
    return;
  }
  gmCurrentIdx=idx;
  getGMSt(idx).seen=true; getGMSt(idx).lastSeen=todayStr();
  setDictBtnVisible(false);
  showTmView("tv-game");
  document.getElementById("tm-gtitle").textContent="Graphies multiples";
  setTmMsg(""); renderGMGame(); updateGMCounter();
  _setQuizMode(true);
  _showVerdictBar(true, false);
  tmChronoStart();
}

function renderGMGame(){
  const all=getAllGMEntries();
  const entry=currentGMEntry();
  const list=document.getElementById("tm-wlist"); if(!list) return;
  list.innerHTML="";
  if(!entry){ setTmMsg("Toutes les entrées terminées !","ok"); return; }

  const sortedForms=[...entry.forms].sort((a,b)=>norm(a)<norm(b)?-1:norm(a)>norm(b)?1:0);
  const allFormsFound=sortedForms.every(f=>gmFound.has(norm(f)));

  const primaryCanon=norm(sortedForms[0]);
  const defDiv=document.createElement("div");
  defDiv.className="gm-def";
  const defText=document.createElement("span");
  const _gmFallback=_gmPickDef(primaryCanon, sortedForms);
  const _rawDef=_gmIsRealDef(_gmFallback) ? _gmFallback : (entry.def||_gmFallback);
  defText.textContent=cleanDef(_rawDef)||"…";
  defDiv.appendChild(defText);
  list.appendChild(defDiv);

  const tilesDiv=document.createElement("div");
  tilesDiv.className="gm-tiles";
  sortedForms.forEach(form=>{
    const isFound=gmFound.has(norm(form))||allFormsFound;
    const revealed=isFound||tmSolutions;
    const letters=form.replace(/[Œœ]/g,"OE").replace(/[Ææ]/g,"AE").replace(/[^A-Za-zÀ-ÿ]/g,"").toUpperCase();
    const wrap=document.createElement("div"); wrap.className="gm-row-wrap";
    const row=document.createElement("div"); row.className="gm-row";
    for(let i=0;i<letters.length;i++){
      const t=document.createElement("span");
      if(revealed){ t.className="gt "+(isFound?"ok":"miss"); t.textContent=letters[i].toUpperCase(); }
      else if(i===0){ t.className="gt init"; t.textContent=letters[0].toUpperCase(); }
      else { t.className="gt empty"; }
      row.appendChild(t);
    }
    if(revealed){
      row.style.cursor="pointer";
      row.addEventListener("click",()=>openDef(norm(form)));
    }
    wrap.appendChild(row);
    tilesDiv.appendChild(wrap);
  });
  list.appendChild(tilesDiv);
}

/* ── Pull-to-refresh : swipe bas sur tv-game pour recharger la def Firestore ── */
function _refreshCurrentDef(){
  if(tmTheme!=="gm" && !isOds(tmTheme)) return;
  let primaryCanon=null;
  if(tmTheme==="gm"){
    const entry=currentGMEntry(); if(!entry) return;
    const sorted=[...entry.forms].sort((a,b)=>norm(a)<norm(b)?-1:norm(a)>norm(b)?1:0);
    primaryCanon=norm(sorted[0]);
  } else {
    const entry=currentOdsEntry(tmTheme); if(!entry) return;
    const sorted=[...entry.forms].sort((a,b)=>norm(a)<norm(b)?-1:norm(a)>norm(b)?1:0);
    primaryCanon=norm(sorted[0]);
  }
  if(!primaryCanon) return;
  if(!window._rechCache) window._rechCache={};
  window._rechCache[primaryCanon]={custom:{},excl:[],loaded:false};
  setTmMsg("↻ Actualisation…","");
  renderTmGame();
}

function validateGMWord(n){
  const entry=currentGMEntry(); if(!entry) return;
  if(!entry.forms.find(f=>norm(f)===n)){
    setTmMsg(getTmDict().has(n)?"Hors-jeu — mot valide mais pas dans cette liste.":"Mot non valide.",
             getTmDict().has(n)?"warn":"err");
    return;
  }
  gmFound.add(n); setTmMsg("");
  const allFound=entry.forms.every(f=>gmFound.has(norm(f)));
  renderGMGame();
  if(allFound) finalizeGM(tmNoHelp); else updateTmBtn();
}

/* ── Init (une seule fois) ── */
function initThemods(){
  if(!tmInited){
    tmInited=true;

    tmKb = wireKeyboard("tm-kb","tm-kb-disp","tm-kb-msg", w=>validateTmWord(w));

    document.getElementById("tm-saisie")?.addEventListener("keydown",e=>{
      if(e.key==="Enter"&&!e.isComposing){
        e.preventDefault(); validateTmWord(e.target.value); e.target.value=""; tmRefocus();
      }
    });

    // Pull-to-refresh : swipe vertical bas, détecté au niveau window
    let _prSX=0, _prSY=0;
    window.addEventListener("touchstart", e=>{
      _prSX=e.touches[0].clientX; _prSY=e.touches[0].clientY;
    }, {passive:true});
    window.addEventListener("touchend", e=>{
      if(!document.querySelector("#v-themods.active")) return;
      if(!document.querySelector("#tv-game.active")) return;
      const dx=e.changedTouches[0].clientX-_prSX, dy=e.changedTouches[0].clientY-_prSY;
      if(dy>60 && Math.abs(dy)>Math.abs(dx)*1.5) _refreshCurrentDef();
    }, {passive:true});

    // Maintient le focus sur la saisie pour tout clic non-interactif en jeu
    document.getElementById("tv-game")?.addEventListener("mousedown", e=>{
      if(!window.matchMedia("(pointer:fine)").matches) return;

      if(e.target.closest("input,button,a,textarea")) return;
      e.preventDefault();
      tmRefocus();
    });

    const onSolBtn=()=>{
      if(tmTheme==="gm"||isOds(tmTheme)) return; // géré par tm-btn-sol-quiz
      tmSolutions ? playTheme(tmTheme) : showTmSolutions();
      tmRefocus();
    };
    document.getElementById("tm-btn-sol")?.addEventListener("click", onSolBtn);
    document.getElementById("tm-btn-sol-kb")?.addEventListener("click", onSolBtn);

    document.getElementById("tm-btn-sol-quiz")?.addEventListener("click", ()=>{
      if(!tmSolutions) showTmSolutions();
    });
    document.getElementById("tm-btn-found")?.addEventListener("click", ()=>{
      _showVerdictBar(false, false);
      if(tmTheme==="gm"){ finalizeGM(true); setTimeout(()=>startGM(), 900); }
      else if(isOds(tmTheme)){ _advanceOds(true); }
    });
    document.getElementById("tm-btn-review")?.addEventListener("click", ()=>{
      _showVerdictBar(false, false);
      if(tmTheme==="gm"){ finalizeGM(false); setTimeout(()=>startGM(), 900); }
      else if(isOds(tmTheme)){ _advanceOds(false); }
    });

    document.getElementById("btn-back-game")?.addEventListener("click",()=>{
      if(isOds(tmTheme)) renderTmOds();
      else if(window.THEMODS_DATA?.[tmTheme]&&!["gm","vi","vt","vd"].includes(tmTheme)) renderTmFinales();
      else if(["vi","vt","vd"].includes(tmTheme)) renderTmVerbes();
      else renderTmHome();
    });

    document.getElementById("btn-back-done")?.addEventListener("click",()=>{
      if(window.THEMODS_DATA?.[tmTheme]&&!["gm","vi","vt","vd"].includes(tmTheme)) renderTmFinales();
      else if(["vi","vt","vd"].includes(tmTheme)) renderTmVerbes();
      else renderTmHome();
    });

    document.getElementById("btn-done-reset")?.addEventListener("click",()=>{
      if(!tmTheme||!tmState.themes[tmTheme]) return;
      const th=tmState.themes[tmTheme];
      Object.keys(th).forEach(k=>{ if(k!=='_completions'&&k!=='_p') delete th[k]; });
      persistThemods().catch(()=>{});
      if(window.THEMODS_DATA?.[tmTheme]&&!["gm","vi","vt","vd"].includes(tmTheme)) renderTmFinales();
      else if(["vi","vt","vd"].includes(tmTheme)) renderTmVerbes();
      else renderTmHome();
    });

    document.getElementById("btn-finales")?.addEventListener("click",()=>renderTmFinales());
    document.getElementById("btn-back-finales")?.addEventListener("click",()=>renderTmHome());
    document.getElementById("btn-ods")?.addEventListener("click",()=>renderTmOds());
    document.getElementById("btn-back-ods")?.addEventListener("click",()=>renderTmHome());
    document.getElementById("btn-verbes")?.addEventListener("click",()=>renderTmVerbes());
    document.getElementById("btn-back-verbes")?.addEventListener("click",()=>renderTmHome());

    document.querySelectorAll("#v-themods .tc[data-theme]").forEach(card=>{
      card.addEventListener("click",()=>playTheme(card.dataset.theme));
    });
  }

  // Toujours afficher l'accueil quand on entre dans THEMODS
  renderTmHome();
}

/* ── Synchronisation exclusion depuis l'éditeur admin (recherche.js) ── */
window.tmNotifyExclusion = function(moduleId, canon, isExcluded){
  // Mettre à jour le cache _modExcl si déjà chargé
  if(_modExcl.hasOwnProperty(moduleId)){
    if(isExcluded) _modExcl[moduleId].add(canon);
    else _modExcl[moduleId].delete(canon);
  }
  // Mettre à jour la session live si le module actif correspond
  if(!tmSession || tmTheme !== moduleId) return;
  if(isExcluded){
    // Reconstruire la liste de mots en retirant le mot exclu, en remappant tmFound
    const newWords = [], newFound = new Set();
    tmSession.words.forEach((w, oldIdx) => {
      if(norm(w) === canon) return;
      const newIdx = newWords.length;
      newWords.push(w);
      if(tmFound.has(oldIdx)) newFound.add(newIdx);
    });
    tmSession = {...tmSession, words: newWords};
    tmFound = newFound;
    renderTmGame();
    const ctr = document.getElementById("tm-counter");
    if(ctr) ctr.textContent = tmFound.size + " / " + tmSession.words.length;
  }
};
