'use strict';

/* ── dict.js — Modale définition BlackScrab ───────────────
   Dépendances : shared/dict-core.js + window.SEQODS_DATA.
   ───────────────────────────────────────────────────────── */


function $d(sel){ return document.querySelector(sel); }

/* ── Modale définition ── */
let _openDefCanon = null;

function openDef(canon, displayWord, defText, flechie){
  const DATA = window.SEQODS_DATA;
  if(!DATA) return;
  const C=DATA.c, E=DATA.e, F=DATA.f, A=DATA.a, R=DATA.r;

  let allIdxs = _findAllIdxs(canon);
  if(allIdxs.length === 0 && defText === undefined){
    const lemma = findLemma(canon);
    if(lemma && lemma !== canon){ openDef(lemma, null, undefined, canon); return; }
  }
  {
    const conjM = _getConjMap();
    if(conjM.has(canon) && defText===undefined){
      const _POS  = /^(n\.|adj\.|v\.|loc\.|adv\.|interj\.|pron\.|num\.|art\.)/;
      const _CONJ = /-->\s+\S+\s+\d{2,}\./;
      const real = allIdxs.filter(i=>{ const f=F[i]||''; return _POS.test(f)||!_CONJ.test(f); });
      if(real.length>0) allIdxs=real;
      else{ openDef(conjM.get(canon)); return; }
    }
  }
  const _CP = /^-->\s+([A-Z]+)\s+\d+\./;
  // Prefer non-redirect entry for title (dual-nature words like FEUTRANT: adj FEUTRANT,E over participle redirect)
  const titleIdx = allIdxs.find(i => !_CP.test(F?.[i]||'')) ?? (allIdxs[0] ?? -1);
  const rawDisplay = (displayWord || (titleIdx>=0 ? E[titleIdx] : canon)).replace(/\*/g,"").trim();
  const title = rawDisplay.split(",")[0].trim(); // base form for external links

  const _cf = t => t.replace(/ - Féminin accepté\. \(\d+\)/g,'');
  const defs = defText !== undefined
    ? [{label:null, entryLabel:null, text:_cf(defText)}]
    : allIdxs.map(i=>{ const f=_cf(F?.[i]||''); const m=f.match(_CP); if(m){ const ci=_getCMap().get(m[1]); return {label:m[1], entryLabel:null, text:ci!==undefined?_cf(F?.[ci]||''):''}; } const el=E?.[i]; return {label:null, entryLabel:(el?.includes(',') ? el.replace(/\*/g,'') : null), text:f}; });

  if(allIdxs.length>0 && defText===undefined){
    const cl = _getConjMap().get(canon) || _findConjLemma(canon);
    if(cl){ const ci=_getCMap().get(cl); if(ci!==undefined) defs.push({label:cl, entryLabel:null, text:F?.[ci]||""}); }
  }

  const wSlash = _wantsSlash(canon) && !rawDisplay.includes('/');
  $d("#def-title").textContent = wSlash ? rawDisplay+' /' : rawDisplay;
  const bodyEl = $d("#def-body");
  if(defs.length <= 1){
    bodyEl.textContent = defs[0]?.text || "(définition absente)";
  } else {
    bodyEl.innerHTML = "";
    defs.forEach((d,i)=>{
      if(i>0){
        const hr=document.createElement("hr");
        hr.style.cssText="border:none;border-top:1px solid var(--border);margin:8px 0 4px";
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
        lbl.style.cssText="font-size:11px;font-weight:700;color:var(--text-dim);display:block;margin-bottom:1px";
        lbl.textContent=d.entryLabel;
        bodyEl.appendChild(lbl);
      }
      const p=document.createElement("p"); p.style.margin="0";
      p.textContent=d.text||(d.label?"":"(définition absente)");
      bodyEl.appendChild(p);
    });
  }

  const raw = title.toLowerCase();
  $d("#def-wikt").href  = "https://fr.wiktionary.org/wiki/" + encodeURIComponent(raw);
  $d("#def-img").href   = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(raw);
  $d("#def-links").style.display = "flex";

  const rallEl = $d("#def-rall"); if(rallEl) rallEl.innerHTML="";
  if(R && rallEl){
    const lst = R[canon]||[];
    if(lst.length){ _renderWordLinks(rallEl, lst, "Rallonges"); }
  }

  let flechieToShow = flechie || null;
  if(!flechieToShow && titleIdx >= 0 && E?.[titleIdx]?.includes(',')){
    const resolved = resolveInflectedCanon(canon, E[titleIdx].split(',')[1]);
    if(resolved && resolved !== canon) flechieToShow = resolved;
  }
  const flechieEl = $d("#def-flechie"); if(flechieEl) flechieEl.innerHTML="";
  if(flechieToShow && flechieToShow !== canon && flechieEl){
    const fRal = R ? (R[flechieToShow]||[]) : [];
    if(fRal.length){
      const sep = document.createElement("hr");
      sep.style.cssText = "border:none;border-top:1px solid var(--border);margin:12px 0 4px";
      flechieEl.appendChild(sep);
      const sub = document.createElement("p");
      sub.style.cssText = "font-size:11px;color:var(--text-dim);margin:0 0 2px";
      sub.appendChild(document.createTextNode("Forme : "));
      const fLink = document.createElement("a"); fLink.href="#"; fLink.className="def-link";
      fLink.style.cssText = "font-size:11px;";
      fLink.textContent = flechieToShow;
      fLink.addEventListener("click", e=>{ e.preventDefault(); openDef(flechieToShow, flechieToShow); });
      sub.appendChild(fLink);
      flechieEl.appendChild(sub);
      const sec = document.createElement("div"); sec.className="modal-sec";
      _renderWordLinks(sec, fRal, "Rallonges"); flechieEl.appendChild(sec);
    }
  }

  _openDefCanon = canon;
  $d("#def-modal").classList.add("open");
}

function closeDef(){
  $d("#def-modal")?.classList.remove("open");
}

function wireDefModal(){
  $d("#def-close")?.addEventListener("click", closeDef);
  $d("#def-bd")?.addEventListener("click", closeDef);
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeDef(); });
}
