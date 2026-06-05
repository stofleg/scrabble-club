"use strict";
/* ══════════════════════════════════════════
   APP.JS — Orchestrateur
══════════════════════════════════════════ */

/* ── Sync au retour au premier plan ── */
let _lastSync = 0;

/* ── Settings ── */
const LS_SETTINGS = "METHODS_SETTINGS_V1";
let settings = {showAbc:true,showDef:true,showLen:true,chronoEnabled:true,chronoDur:10,finaleMaxLen:15};

function loadSettings(){
  try{ Object.assign(settings, JSON.parse(localStorage.getItem(LS_SETTINGS)||"{}")); }catch{}
}
function saveSettings(){
  try{ localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }catch{}
}

/* ── Détection clavier iOS ── */
function initKeyboardDetection(){
  if(!window.visualViewport) return;
  let lastH = window.visualViewport.height;
  window.visualViewport.addEventListener("resize", ()=>{
    const h = window.visualViewport.height;
    if(lastH - h > 100) document.body.classList.add("kb-open");
    else if(h - lastH > 50) document.body.classList.remove("kb-open");
    lastH = h;
  });
  document.addEventListener("focusin", e=>{
    if(e.target.tagName==="INPUT") setTimeout(()=>{
      if(window.visualViewport.height < window.screen.height*0.75)
        document.body.classList.add("kb-open");
    },300);
  });
  document.addEventListener("focusout", e=>{
    if(e.target.tagName==="INPUT") setTimeout(()=>document.body.classList.remove("kb-open"),100);
  });
}

/* ── Navigation entre vues ── */
function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active", v.id===id));
}

/* ── Auth ── */
function initAuth(){
  // Onglets
  document.querySelectorAll(".auth-tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      document.querySelectorAll(".auth-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      ["login","register","recover"].forEach(n=>{
        const f=document.getElementById("f-"+n);
        if(f) f.style.display=(n===tab.dataset.tab)?"flex":"none";
      });
      document.getElementById("auth-err").textContent="";
    });
  });

  const setErr=(t,ok=false)=>{
    const e=document.getElementById("auth-err");
    if(e){e.textContent=t;e.className="msg"+(ok?" ok":" err");}
  };
  const setLoad=on=>{
    ["btn-login","btn-register","btn-recover"].forEach(id=>{
      const b=document.getElementById(id); if(b) b.disabled=on;
    });
  };

  document.getElementById("btn-login")?.addEventListener("click", async()=>{
    const p=document.getElementById("login-pseudo")?.value||"";
    const pw=document.getElementById("login-pass")?.value||"";
    setLoad(true); setErr("");
    const r=await authLogin(p,pw);
    setLoad(false);
    if(!r.ok){setErr(r.err);return;}
    currentUser={pseudo:r.pseudo,token:r.token};
    saveSession(currentUser);
    await afterLogin();
  });

  document.getElementById("btn-register")?.addEventListener("click", async()=>{
    const p=document.getElementById("reg-pseudo")?.value||"";
    const pw=document.getElementById("reg-pass")?.value||"";
    const pw2=document.getElementById("reg-pass2")?.value||"";
    const secretQ=document.getElementById("reg-question")?.value||"";
    const secretA=document.getElementById("reg-answer")?.value||"";
    setLoad(true); setErr("");
    const r=await authRegister(p,pw,pw2,secretQ,secretA);
    setLoad(false);
    if(!r.ok){setErr(r.err);return;}
    currentUser={pseudo:r.pseudo,token:r.token};
    saveSession(currentUser);
    await afterLogin();
  });

  document.getElementById("btn-find-question")?.addEventListener("click", async()=>{
    const p=document.getElementById("rec-pseudo")?.value||"";
    setLoad(true); setErr("");
    const r=await authGetQuestion(p);
    setLoad(false);
    if(!r.ok){setErr(r.err);return;}
    const qDiv=document.getElementById("rec-question-display");
    if(qDiv){qDiv.textContent=r.question;qDiv.style.display="";}
    ["rec-answer","rec-new","btn-recover"].forEach(id=>{
      const el=document.getElementById(id); if(el) el.style.display="";
    });
  });

  document.getElementById("btn-recover")?.addEventListener("click", async()=>{
    const p=document.getElementById("rec-pseudo")?.value||"";
    const ans=document.getElementById("rec-answer")?.value||"";
    const np=document.getElementById("rec-new")?.value||"";
    setLoad(true); setErr("");
    const r=await authRecover(p,ans,np);
    setLoad(false);
    if(!r.ok){setErr(r.err);return;}
    setErr("Mot de passe changé. Reconnecte-toi.",true);
  });

  // Enter pour valider
  [["login-pass","btn-login"],["reg-answer","btn-register"],["rec-new","btn-recover"]].forEach(([inp,btn])=>{
    document.getElementById(inp)?.addEventListener("keydown",e=>{
      if(e.key==="Enter") document.getElementById(btn)?.click();
    });
  });
}

/* ── Après login ── */
async function afterLogin(){
  // Charger l'état local (sync) puis afficher immédiatement — pas d'attente réseau
  _lastSync = Date.now();
  loadThemodsState().catch(()=>{});
  loadEntreModsState().catch(()=>{});
  if(navigator.storage?.persist) navigator.storage.persist().catch(()=>{});
  ["tm-user-chip","em-user-chip"].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent=currentUser.pseudo;
  });
  showView("v-select");
  setDictBtnVisible(true);
  prewarmDictMaps();
  // interval auto-persist
  setInterval(()=>{ persistThemods().catch(()=>{}); persistEntreModsState().catch(()=>{}); }, 60000);
}

/* ── Select ── */
function initSelect(){
  document.getElementById("btn-go-entremods")?.addEventListener("click", ()=>{
    showView("v-entremods");
    ensureEntreModsInit();
  });
  document.getElementById("btn-go-themods")?.addEventListener("click", ()=>{
    showView("v-themods");
    initThemods();
  });
  document.getElementById("btn-go-explods")?.addEventListener("click", ()=>{
    openDictModal();
  });
}

/* ── Navigation globale ── */
function initNav(){
  // Déconnexion
  const doLogout=()=>{ emChronoStop(); clearSession(); currentUser=null; setDictBtnVisible(false); showView("v-auth"); };
  document.getElementById("btn-tm-logout")?.addEventListener("click", doLogout);
  document.getElementById("em-btn-logout")?.addEventListener("click", doLogout);
  // Settings — shared panel
  document.getElementById("btn-tm-settings")?.addEventListener("click", ()=>openSettingsPanel());
  document.getElementById("em-btn-settings")?.addEventListener("click", ()=>openSettingsPanel());
  // Swipe droite → menu principal ; swipe gauche sur v-select → retour au jeu (mobile uniquement)
  let _swSX=0, _swSY=0, _prevGameView=null, _swBlocked=false;
  const _swStart=e=>{_swBlocked=!!e.target.closest("textarea");_swSX=e.touches[0].clientX;_swSY=e.touches[0].clientY;};
  const _absorbNext=()=>{
    const absorb=ev=>{ev.stopPropagation();ev.preventDefault();};
    document.addEventListener("click",absorb,{capture:true,once:true});
    setTimeout(()=>document.removeEventListener("click",absorb,true),400);
  };
  const _swToMenu=e=>{
    const dx=e.changedTouches[0].clientX-_swSX, dy=e.changedTouches[0].clientY-_swSY;
    if(_swBlocked||dx<60||Math.abs(dx)<Math.abs(dy)) return;
    _prevGameView=document.querySelector(".view.active")?.id||null;
    emChronoStop(); showView("v-select"); _absorbNext();
  };
  const _swToGame=e=>{
    const dx=e.changedTouches[0].clientX-_swSX, dy=e.changedTouches[0].clientY-_swSY;
    if(_swBlocked||dx>-60||Math.abs(dx)<Math.abs(dy)||!_prevGameView) return;
    showView(_prevGameView); _absorbNext();
  };
  const _swToBack=e=>{
    const dx=e.changedTouches[0].clientX-_swSX, dy=e.changedTouches[0].clientY-_swSY;
    if(_swBlocked||dx<60||Math.abs(dx)<Math.abs(dy)) return;
    closeDictModal(); _absorbNext();
  };
  document.getElementById("v-entremods")?.addEventListener("touchstart",_swStart,{passive:true});
  document.getElementById("v-entremods")?.addEventListener("touchend",_swToMenu,{passive:true});
  document.getElementById("v-themods")?.addEventListener("touchstart",_swStart,{passive:true});
  document.getElementById("v-themods")?.addEventListener("touchend",_swToMenu,{passive:true});
  document.getElementById("v-select")?.addEventListener("touchstart",_swStart,{passive:true});
  document.getElementById("v-select")?.addEventListener("touchend",_swToGame,{passive:true});
  document.getElementById("v-recherche")?.addEventListener("touchstart",_swStart,{passive:true});
  document.getElementById("v-recherche")?.addEventListener("touchend",_swToBack,{passive:true});
  // Bouton menu PC
  const doMenu=()=>{ emChronoStop(); showView("v-select"); };
  document.getElementById("em-btn-menu")?.addEventListener("click", doMenu);
  document.getElementById("tm-btn-menu")?.addEventListener("click", doMenu);
  // F1
  document.addEventListener("keydown", e=>{
    if(e.key==="F1"){
      e.preventDefault();
      const v=document.querySelector(".view.active")?.id;
      if(v==="v-themods") tmReplay();
      if(v==="v-entremods"){ emReplay(); if(emPhase==="WAITING") emLaunchGame(); emRefocus(); }
    }
    if(e.key==="Escape") closeDef();
    if((e.metaKey||e.ctrlKey) && e.key==="r"){ e.preventDefault(); location.reload(); }
  });
}

/* ── Settings UI ── */
function openSettingsPanel(){
  document.getElementById("set-abc").checked=settings.showAbc;
  document.getElementById("set-def").checked=settings.showDef;
  document.getElementById("set-len").checked=settings.showLen;
  document.getElementById("set-chrono").checked=settings.chronoEnabled;
  document.getElementById("set-dur").value=settings.chronoDur;
  document.getElementById("chrono-lbl").textContent=settings.chronoDur+" min";
  document.getElementById("row-dur").style.display=settings.chronoEnabled?"":"none";
  const fml=document.getElementById("set-finale-len");
  if(fml){ fml.value=settings.finaleMaxLen||15; document.getElementById("finale-len-lbl").textContent=(settings.finaleMaxLen||15)+" lettres"; }
  document.getElementById("settings")?.classList.add("open");
}
function initSettingsUI(){
  const close=()=>{
    document.getElementById("settings")?.classList.remove("open");
    if(document.querySelector("#v-entremods.active") && typeof emRefocus==="function") emRefocus();
  };
  document.getElementById("btn-close-settings")?.addEventListener("click",close);
  document.getElementById("settings-bd")?.addEventListener("click",close);

  document.getElementById("set-abc")?.addEventListener("change",e=>{settings.showAbc=e.target.checked;saveSettings();renderSlots();});
  document.getElementById("set-def")?.addEventListener("change",e=>{settings.showDef=e.target.checked;saveSettings();renderSlots();});
  document.getElementById("set-len")?.addEventListener("change",e=>{settings.showLen=e.target.checked;saveSettings();renderSlots();});
  document.getElementById("set-chrono")?.addEventListener("change",e=>{
    settings.chronoEnabled=e.target.checked;
    document.getElementById("row-dur").style.display=e.target.checked?"":"none";
    saveSettings();
    if(typeof emChronoReset==="function") emChronoReset();
    if(typeof tmChronoReset==="function") tmChronoReset();
  });
  document.getElementById("set-dur")?.addEventListener("input",e=>{
    settings.chronoDur=parseInt(e.target.value);
    document.getElementById("chrono-lbl").textContent=settings.chronoDur+" min";
    saveSettings();
  });
  document.getElementById("set-finale-len")?.addEventListener("input",e=>{
    const v=Math.min(15,Math.max(4,parseInt(e.target.value)||15));
    settings.finaleMaxLen=v;
    document.getElementById("finale-len-lbl").textContent=v+" lettres";
    saveSettings();
  });
}

/* ── START ── */
async function start(){
  loadSettings();
  initKeyboardDetection();
  wireDefModal();
  wireDictModal();
  if(typeof wireImgZoom==="function") wireImgZoom();
  initAuth();
  initSelect();
  initNav();
  initSettingsUI();

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState !== 'visible') return;
    if(!currentUser) return;
    if(Date.now() - _lastSync < 30000) return;
    _lastSync = Date.now();
    loadThemodsState().catch(()=>{});
    loadEntreModsState().catch(()=>{});
  });

  const saved=loadSession();
  if(saved?.pseudo){
    currentUser=saved;
    await afterLogin();
    return;
  }
  showView("v-auth");
}

document.addEventListener("DOMContentLoaded", start);
