'use strict';

/* ═══ shared/dict-core.js — Dictionnaire ODS partagé METHODS + BlackScrab ═══
   Fonctions communes de recherche, lemmatisation et affichage.
   Dépendance : window.SEQODS_DATA (data.js).
═══════════════════════════════════════════════════════════════════════════ */

/* ── Correctif ordre ODS : formes fléchies après formes de base ── */
(function fixOdsOrder(){
  const D = window.SEQODS_DATA; if(!D) return;
  const C=D.c, E=D.e||[], F=D.f||[];
  for(let i=0; i<C.length-1; i++){
    if(C[i]!==C[i+1]) continue;
    const ei=(E[i]||C[i]), ej=(E[i+1]||C[i+1]);
    if(ei.includes(',') && !ej.includes(',')){
      // swap i et i+1
      if(E.length){ const t=E[i]; E[i]=E[i+1]; E[i+1]=t; }
    }
  }
})();

/* ── Dictionnaire complet (toutes formes fléchies) ── */
function getDictArr(){ return window.SEQODS_DATA?.d || window.SEQODS_DATA?.c || []; }


function norm(w){
  if(!w) return "";
  return w.toUpperCase()
    .replace(/Œ/g,"OE").replace(/Æ/g,"AE")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Z]/g,"");
}

/* ── Résolution forme fléchie : canon + suffixe affiché → canonique fléchi ── */
let _dSet = null;
function _getDSet(){ if(!_dSet) _dSet = new Set(getDictArr()); return _dSet; }

const _dSufCache = new Map();
function resolveInflectedCanon(canon, rawSuffix){
  const suf = norm(rawSuffix.trim());
  if(!suf) return null;
  const simple = canon + suf;
  if(_getDSet().has(simple)) return simple;
  if(!_dSufCache.has(suf)){
    _dSufCache.set(suf, getDictArr().filter(w => w.endsWith(suf)));
  }
  const candidates = _dSufCache.get(suf);
  let best=null, bestLen=0;
  for(const w of candidates){
    let j=0; while(j<canon.length && j<w.length && canon[j]===w[j]) j++;
    if(j>bestLen && j>=Math.ceil(canon.length*0.5)){ bestLen=j; best=w; }
  }
  return best;
}

/* ── Carte inverse formes fléchies → lemme (entrées à virgule de c[]) ── */
let _inflMap = null;
function _getInflMap(){
  if(!_inflMap){
    _inflMap = new Map();
    const {c,e}=window.SEQODS_DATA||{};
    if(c&&e) for(let i=0;i<c.length;i++){
      if(!e[i]?.includes(',')) continue;
      const ic = resolveInflectedCanon(c[i], e[i].split(',')[1]);
      if(ic && !_inflMap.has(ic)) _inflMap.set(ic, c[i]);
    }
  }
  return _inflMap;
}

/* ── Table des formes irrégulières → infinitif ── */
let _irregMap = null;
function _getIrregMap(){
  if(_irregMap) return _irregMap;
  _irregMap = new Map();
  const add = (inf, forms) => { for(const f of forms) _irregMap.set(f, inf); };

  add('ETRE',['SUIS','SOMMES','ETES','SONT',
    'ETAIS','ETAIT','ETIONS','ETIEZ','ETAIENT',
    'FUS','FUT','FUMES','FUTES','FURENT',
    'SERAI','SERAS','SERA','SERONS','SEREZ','SERONT',
    'SERAIS','SERAIT','SERIONS','SERIEZ','SERAIENT',
    'SOIS','SOIT','SOYONS','SOYEZ','SOIENT',
    'FUSSE','FUSSES','FUSSIONS','FUSSIEZ','FUSSENT','ETANT']);

  add('AVOIR',['AVONS','AVEZ','ONT',
    'AVAIS','AVAIT','AVIONS','AVIEZ','AVAIENT',
    'EUS','EUT','EUMES','EUTES','EURENT',
    'AURAI','AURAS','AURA','AURONS','AUREZ','AURONT',
    'AURAIS','AURAIT','AURIONS','AURIEZ','AURAIENT',
    'AIE','AIES','AIT','AYONS','AYEZ','AIENT',
    'EUSSE','EUSSES','EUSSIONS','EUSSIEZ','EUSSENT','AYANT']);

  add('ALLER',['VAIS','VAS','ALLONS','ALLEZ','VONT',
    'ALLAIS','ALLAIT','ALLIONS','ALLIEZ','ALLAIENT',
    'ALLAI','ALLAS','ALLA','ALLAMES','ALLATES','ALLERENT',
    'IRAI','IRAS','IRA','IRONS','IREZ','IRONT',
    'IRAIS','IRAIT','IRIONS','IRIEZ','IRAIENT',
    'AILLE','AILLES','AILLENT',
    'ALLASSE','ALLASSES','ALLAT','ALLASSIONS','ALLASSIEZ','ALLASSENT',
    'ALLANT','ALLE']);

  add('FAIRE',['FAIS','FAIT','FAISONS','FAITES','FONT',
    'FAISAIS','FAISAIT','FAISIONS','FAISIEZ','FAISAIENT',
    'FIS','FIT','FIMES','FITES','FIRENT',
    'FERAI','FERAS','FERA','FERONS','FEREZ','FERONT',
    'FERAIS','FERAIT','FERIONS','FERIEZ','FERAIENT',
    'FASSE','FASSES','FASSIONS','FASSIEZ','FASSENT',
    'FISSE','FISSES','FISSIONS','FISSIEZ','FISSENT','FAISANT']);

  add('VOULOIR',['VEUX','VEUT','VEULENT',
    'VOULAIS','VOULAIT','VOULIONS','VOULIEZ','VOULAIENT',
    'VOULUS','VOULUT','VOULUMES','VOULUTES','VOULURENT',
    'VOUDRAI','VOUDRAS','VOUDRA','VOUDRONS','VOUDREZ','VOUDRONT',
    'VOUDRAIS','VOUDRAIT','VOUDRIONS','VOUDRIEZ','VOUDRAIENT',
    'VEUILLE','VEUILLES','VEUILLONS','VEUILLEZ','VEUILLENT',
    'VOULUSSE','VOULU','VOULANT']);

  add('POUVOIR',['PEUX','PEUT','PEUVENT',
    'POUVAIS','POUVAIT','POUVIONS','POUVIEZ','POUVAIENT',
    'PUS','PUT','PUMES','PUTES','PURENT',
    'POURRAI','POURRAS','POURRA','POURRONS','POURREZ','POURRONT',
    'POURRAIS','POURRAIT','POURRIONS','POURRIEZ','POURRAIENT',
    'PUISSE','PUISSES','PUISSIONS','PUISSIEZ','PUISSENT',
    'PUSSE','PU','POUVANT']);

  add('SAVOIR',['SAIS','SAIT','SAVONS','SAVEZ','SAVENT',
    'SAVAIS','SAVAIT','SAVIONS','SAVIEZ','SAVAIENT',
    'SUS','SUT','SUMES','SUTES','SURENT',
    'SAURAI','SAURAS','SAURA','SAURONS','SAUREZ','SAURONT',
    'SAURAIS','SAURAIT','SAURIONS','SAURIEZ','SAURAIENT',
    'SACHE','SACHES','SACHONS','SACHEZ','SACHENT',
    'SUSSE','SU','SACHANT']);

  add('VOIR',['VOIS','VOIT','VOYONS','VOYEZ','VOIENT',
    'VOYAIS','VOYAIT','VOYIONS','VOYIEZ','VOYAIENT',
    'VIMES','VITES','VIRENT',
    'VERRAI','VERRAS','VERRA','VERRONS','VERREZ','VERRONT',
    'VERRAIS','VERRAIT','VERRIONS','VERRIEZ','VERRAIENT',
    'VOIE','VOIES','VOIENT',
    'VISSE','VU','VOYANT']);

  add('DEVOIR',['DOIS','DOIT','DEVONS','DEVEZ','DOIVENT',
    'DEVAIS','DEVAIT','DEVIONS','DEVIEZ','DEVAIENT',
    'DUS','DUT','DUMES','DUTES','DURENT',
    'DEVRAI','DEVRAS','DEVRA','DEVRONS','DEVREZ','DEVRONT',
    'DEVRAIS','DEVRAIT','DEVRIONS','DEVRIEZ','DEVRAIENT',
    'DOIVE','DOIVES','DOIVENT',
    'DUSSE','DU','DEVANT']);

  add('VENIR',['VIENS','VIENT','VENONS','VENEZ','VIENNENT',
    'VENAIS','VENAIT','VENIONS','VENIEZ','VENAIENT',
    'VINS','VINT','VINMES','VINTES','VINRENT',
    'VIENDRAI','VIENDRAS','VIENDRA','VIENDRONS','VIENDREZ','VIENDRONT',
    'VIENDRAIS','VIENDRAIT','VIENDRIONS','VIENDRIEZ','VIENDRAIENT',
    'VIENNE','VIENNES','VIENNENT',
    'VINSSE','VINSSES','VINSSIONS','VINSSIEZ','VINSSENT','VENU','VENANT']);

  add('TENIR',['TIENS','TIENT','TENONS','TENEZ','TIENNENT',
    'TENAIS','TENAIT','TENIONS','TENIEZ','TENAIENT',
    'TINS','TINT','TINMES','TINTES','TINRENT',
    'TIENDRAI','TIENDRAS','TIENDRA','TIENDRONS','TIENDREZ','TIENDRONT',
    'TIENDRAIS','TIENDRAIT','TIENDRIONS','TIENDRIEZ','TIENDRAIENT',
    'TIENNE','TIENNES','TIENNENT',
    'TINSSE','TINSSES','TINSSIONS','TINSSIEZ','TINSSENT','TENU','TENANT']);

  add('PRENDRE',['PRENDS','PREND','PRENONS','PRENEZ','PRENNENT',
    'PRENAIS','PRENAIT','PRENIONS','PRENIEZ','PRENAIENT',
    'PRIT','PRIMES','PRITES','PRIRENT',
    'PRENDRAI','PRENDRAS','PRENDRA','PRENDRONS','PRENDREZ','PRENDRONT',
    'PRENDRAIS','PRENDRAIT','PRENDRIONS','PRENDRIEZ','PRENDRAIENT',
    'PRENNE','PRENNES','PRENNENT',
    'PRISSE','PRENANT']);

  add('METTRE',['METS','MET','METTONS','METTEZ','METTENT',
    'METTAIS','METTAIT','METTIONS','METTIEZ','METTAIENT',
    'MIS','MIT','MIMES','MITES','MIRENT',
    'METTRAI','METTRAS','METTRA','METTRONS','METTREZ','METTRONT',
    'METTRAIS','METTRAIT','METTRIONS','METTRIEZ','METTRAIENT',
    'METTE','METTES','METTENT',
    'MISSE','MISSES','MISSIONS','MISSIEZ','MISSENT','METTANT']);

  add('DIRE',['DISONS','DITES','DISENT',
    'DISAIS','DISAIT','DISIONS','DISIEZ','DISAIENT',
    'DIRAI','DIRAS','DIRA','DIRONS','DIREZ','DIRONT',
    'DIRAIS','DIRAIT','DIRIONS','DIRIEZ','DIRAIENT',
    'DISE','DISES','DISENT',
    'DISSE','DISSES','DISSIONS','DISSIEZ','DISSENT','DISANT']);

  add('LIRE',['LISONS','LISEZ','LISENT',
    'LISAIS','LISAIT','LISIONS','LISIEZ','LISAIENT',
    'LUS','LUT','LUMES','LUTES','LURENT',
    'LIRAI','LIRAS','LIRA','LIRONS','LIREZ','LIRONT',
    'LIRAIS','LIRAIT','LIRIONS','LIRIEZ','LIRAIENT',
    'LISE','LISES','LISENT',
    'LUSSE','LU','LISANT']);

  add('ECRIRE',['ECRIS','ECRIT','ECRIVONS','ECRIVEZ','ECRIVENT',
    'ECRIVAIS','ECRIVAIT','ECRIVIONS','ECRIVIEZ','ECRIVAIENT',
    'ECRIVIS','ECRIVIT','ECRIVIMES','ECRIVITES','ECRIVIRENT',
    'ECRIRAI','ECRIRAS','ECRIRA','ECRIRONS','ECRIREZ','ECRIRONT',
    'ECRIRAIS','ECRIRAIT','ECRIRIONS','ECRIRIEZ','ECRIRAIENT',
    'ECRIVE','ECRIVES','ECRIVENT',
    'ECRIVISSE','ECRIVANT']);

  add('BOIRE',['BOIS','BOIT','BUVONS','BUVEZ','BOIVENT',
    'BUVAIS','BUVAIT','BUVIONS','BUVIEZ','BUVAIENT',
    'BUS','BUT','BUMES','BUTES','BURENT',
    'BOIRAI','BOIRAS','BOIRA','BOIRONS','BOIREZ','BOIRONT',
    'BOIRAIS','BOIRAIT','BOIRIONS','BOIRIEZ','BOIRAIENT',
    'BOIVE','BOIVES','BOIVENT',
    'BUSSE','BU','BUVANT']);

  add('CROIRE',['CROIS','CROIT','CROYONS','CROYEZ','CROIENT',
    'CROYAIS','CROYAIT','CROYIONS','CROYIEZ','CROYAIENT',
    'CRUS','CRUT','CRUMES','CRUTES','CRURENT',
    'CROIRAI','CROIRAS','CROIRA','CROIRONS','CROIREZ','CROIRONT',
    'CROIRAIS','CROIRAIT','CROIRIONS','CROIRIEZ','CROIRAIENT',
    'CROIE','CROIES','CROIENT',
    'CRUSSE','CRU','CROYANT']);

  add('MOURIR',['MEURS','MEURT','MOURONS','MOUREZ','MEURENT',
    'MOURAIS','MOURAIT','MOURIONS','MOURIEZ','MOURAIENT',
    'MOURUS','MOURUT','MOURUMES','MOURUTES','MOURURENT',
    'MOURRAI','MOURRAS','MOURRA','MOURRONS','MOURREZ','MOURRONT',
    'MOURRAIS','MOURRAIT','MOURRIONS','MOURRIEZ','MOURRAIENT',
    'MEURE','MEURES','MEURENT',
    'MOURUSSE','MOURANT']);

  add('COURIR',['COURS','COURT','COURONS','COUREZ','COURENT',
    'COURAIS','COURAIT','COURIONS','COURIEZ','COURAIENT',
    'COURUS','COURUT','COURUMES','COURUTES','COURURENT',
    'COURRAI','COURRAS','COURRA','COURRONS','COURREZ','COURRONT',
    'COURRAIS','COURRAIT','COURRIONS','COURRIEZ','COURRAIENT',
    'COURE','COURES','COURENT',
    'COURUSSE','COURU','COURANT']);

  add('RECEVOIR',['RECOIS','RECOIT','RECEVONS','RECEVEZ','RECOIVENT',
    'RECEVAIS','RECEVAIT','RECEVIONS','RECEVIEZ','RECEVAIENT',
    'RECUS','RECUT','RECUMES','RECUTES','RECURENT',
    'RECEVRAI','RECEVRAS','RECEVRA','RECEVRONS','RECEVREZ','RECEVRONT',
    'RECEVRAIS','RECEVRAIT','RECEVRIONS','RECEVRIEZ','RECEVRAIENT',
    'RECOIVE','RECOIVES','RECOIVENT',
    'RECUSSE','RECU','RECEVANT']);

  add('VALOIR',['VAUX','VAUT','VALONS','VALEZ','VALENT',
    'VALAIS','VALAIT','VALIONS','VALIEZ','VALAIENT',
    'VALUS','VALUT','VALUMES','VALUTES','VALURENT',
    'VAUDRAI','VAUDRAS','VAUDRA','VAUDRONS','VAUDREZ','VAUDRONT',
    'VAUDRAIS','VAUDRAIT','VAUDRIONS','VAUDRIEZ','VAUDRAIENT',
    'VAILLE','VAILLES','VAILLENT',
    'VALUSSE','VALU','VALANT']);

  add('FALLOIR',['FAUT','FALLAIT','FALLUT','FAUDRA','FAUDRAIT','FAILLE','FALLU']);

  add('PLEUVOIR',['PLEUT','PLEUVAIT','PLEUVAIENT','PLUT','PLUSSENT','PLEUVRA','PLEUVRAIT','PLEUVRAIENT','PLEUVRONT','PLEUVE','PLEUVENT','PLEUVANT','PLU']);

  add('GESIR',['GIT','GISAIT','GISAIENT','GISONS','GISEZ','GISIEZ','GISIONS']);

  add('SEOIR',['SIEE','SIEENT','SIERAIT','SIERAIENT','SIERONT','SEYAIT']);

  add('MESSEOIR',['MESSIEENT','MESSIERAIT','MESSIERAIENT','MESSIERONT','MESSEYAIT']);

  add('SOURDRE',['SOURDAIT','SOURDAIENT','SOURDENT']);

  add('SAILLIR',['SAILLE','SAILLI','SAILLIRONT']);

  add('TRAIRE',['TRAYAIT','TRAYAIENT','TRAYANT','TRAYONS','TRAYIEZ','TRAYIONS','TRAIENT']);

  add('PAITRE',['PAISSAIT','PAISSAIENT','PAISSAIS','PAISSONS','PAISSEZ','PAISSENT','PAISSIONS','PAISSIEZ']);

  add('ABSOUDRE',['ABSOLVAIT','ABSOLVAIENT','ABSOLVAIS','ABSOLVANT','ABSOLVE','ABSOLVENT',
    'ABSOLVES','ABSOLVEZ','ABSOLVIEZ','ABSOLVIONS','ABSOLVONS','ABSOUTES','ABSOUTS']);

  add('RESOUDRE',['RESOLVAIT','RESOLVAIENT','RESOLVAIS','RESOLVANT','RESOLVE','RESOLVENT',
    'RESOLVES','RESOLVEZ','RESOLVIEZ','RESOLVIONS','RESOLVONS','RESOUTE','RESOUTES']);

  add('ECHOIR',['ECHOIE','ECHOIENT','ECHOYAIT','ECHOYAIENT','ECHOYANT','ECHERRAIENT','ECHERRONT']);
  add('DECHOIR',['DECHOYAIT','DECHOYAIENT','DECHOYAIS','DECHOYANT','DECHOYONS','DECHOYEZ','DECHOYIEZ','DECHOYIONS',
    'DECHERRAIENT','DECHERRONT','DECHERRAI','DECHERRAIS','DECHERRIONS','DECHERRIEZ','DECHERRONS','DECHUT','DECHUTES']);

  add('BRAIRE',['BRAIENT']);

  add('FOUTRE',['FOUT']);

  add('VIVRE',['VIVONS','VIVEZ','VIVENT',
    'VIVAIS','VIVAIT','VIVIONS','VIVIEZ','VIVAIENT',
    'VECUS','VECUT','VECUMES','VECUTES','VECURENT',
    'VIVRAI','VIVRAS','VIVRA','VIVRONS','VIVREZ','VIVRONT',
    'VIVRAIS','VIVRAIT','VIVRIONS','VIVRIEZ','VIVRAIENT',
    'VIVE','VIVES','VIVENT',
    'VECUSSE','VECUSSES','VECUSSIONS','VECUSSIEZ','VECUSSENT','VECU','VIVANT']);

  add('SUIVRE',['SUIT','SUIVONS','SUIVEZ','SUIVENT',
    'SUIVAIS','SUIVAIT','SUIVIONS','SUIVIEZ','SUIVAIENT',
    'SUIVIS','SUIVIT','SUIVIMES','SUIVITES','SUIVIRENT',
    'SUIVRAI','SUIVRAS','SUIVRA','SUIVRONS','SUIVREZ','SUIVRONT',
    'SUIVRAIS','SUIVRAIT','SUIVRIONS','SUIVRIEZ','SUIVRAIENT',
    'SUIVE','SUIVES','SUIVENT',
    'SUIVISSE','SUIVI','SUIVANT']);

  add('ENVOYER',['ENVERRAI','ENVERRAS','ENVERRA','ENVERRONS','ENVERREZ','ENVERRONT',
    'ENVERRAIS','ENVERRAIT','ENVERRIONS','ENVERRIEZ','ENVERRAIENT']);

  add('RENVOYER',['RENVERRA','RENVERRAI','RENVERRAS','RENVERRONS','RENVERREZ','RENVERRONT',
    'RENVERRAIS','RENVERRAIT','RENVERRIONS','RENVERRIEZ','RENVERRAIENT']);

  add('AVOIR',['EU','EUE']);

  add('RIRE',['RI','RIS','RIT','RIONS','RIEZ','RIENT',
    'RIAIS','RIAIT','RIIONS','RIIEZ','RIAIENT',
    'RIMES','RITES','RIRENT','RISSE','RIANT']);

  add('VAINCRE',['VAINC','VAINQUONS','VAINQUEZ','VAINQUAIS','VAINQUAIT',
    'VAINQUIONS','VAINQUIEZ','VAINQUAIENT','VAINQUANT',
    'VAINQUE','VAINQUES','VAINQUENT',
    'VAINQUIS','VAINQUIT','VAINQUIMES','VAINQUITES','VAINQUIRENT',
    'VAINQUISSE','VAINQUISSES','VAINQUISSIONS','VAINQUISSIEZ','VAINQUISSENT']);

  add('ASSEOIR',['ASSIEDS','ASSIED','ASSEYONS','ASSEYEZ',
    'ASSEYAIS','ASSEYAIT','ASSEYIONS','ASSEYIEZ','ASSEYAIENT',
    'ASSOYAIS','ASSOYAIT','ASSOYIONS','ASSOYIEZ','ASSOYAIENT','ASSOYONS','ASSOYEZ','ASSOYANT',
    'ASSEYE','ASSEYES','ASSEYANT',
    'ASSIERAI','ASSIERAIS','ASSIERIEZ','ASSIERIONS','ASSIERAIENT']);

  add('RASSEOIR',['RASSIEDS','RASSIED','RASSEYONS','RASSEYEZ',
    'RASSEYAIS','RASSEYAIT','RASSEYIONS','RASSEYIEZ','RASSEYAIENT',
    'RASSOYAIS','RASSOYAIT','RASSOYIONS','RASSOYIEZ','RASSOYAIENT','RASSOYONS','RASSOYEZ','RASSOYANT',
    'RASSEYE','RASSEYES','RASSEYENT','RASSEYANT']);

  add('POURVOIR',['POURVOYAIS','POURVOYAIT','POURVOYIONS','POURVOYIEZ','POURVOYAIENT',
    'POURVOYONS','POURVOYEZ','POURVOYANT']);

  add('SURSOIR',['SURSOYAIS','SURSOYAIT','SURSOYIONS','SURSOYIEZ','SURSOYAIENT',
    'SURSOYONS','SURSOYEZ','SURSOYANT']);

  add('FUIR',['FUYAIS','FUYAIT','FUYIONS','FUYIEZ','FUYAIENT','FUYONS','FUYEZ','FUYANT']);

  add('ATTRAIRE',['ATTRAYAIS','ATTRAYAIT','ATTRAYIONS','ATTRAYIEZ','ATTRAYAIENT',
    'ATTRAYONS','ATTRAYEZ']);

  add('EXTRAIRE',['EXTRAYAIS','EXTRAYAIT','EXTRAYIONS','EXTRAYIEZ','EXTRAYAIENT',
    'EXTRAYONS','EXTRAYEZ','EXTRAYANT']);

  add('BRUIRE',['BRUYAIS','BRUYAIT','BRUYIONS','BRUYIEZ','BRUYAIENT']);

  add('VETIR',['VET','VETE','VETIS','VETIT','VETENT','VETANT']);

  add('GAGWOMAN',['GAGWOMEN','GAGWOMANS']);
  add('JAZZWOMAN',['JAZZWOMEN','JAZZWOMANS']);
  add('GIPSY',['GIPSIES']);
  add('PINZUTU',['PINZUTI']);
  add('VEVEYSAN',['VEVEYSANNE','VEVEYSANNES']);
  add('GOUROU',['GOUROUTE','GOUROUTES']);
  add('LOUPIOTE',['LOUPIOTTE','LOUPIOTTES']);
  add('BOSCOT',['BOSCOTTE','BOSCOTTES']);
  add('MAIGRIOT',['MAIGRIOTTE','MAIGRIOTTES']);

  add('CONNAITRE',['CONNAIS','CONNAIT',
    'CONNUS','CONNUT','CONNUMES','CONNUTES','CONNURENT',
    'CONNAITRAI','CONNAITRAS','CONNAITRA','CONNAITRONS','CONNAITREZ','CONNAITRONT',
    'CONNAITRAIS','CONNAITRAIT','CONNAITRIONS','CONNAITRIEZ','CONNAITRAIENT',
    'CONNU','CONNAISSANT']);

  add('NAITRE',['NAIS','NAIT',
    'NAQUIS','NAQUIT','NAQUIMES','NAQUITES','NAQUIRENT',
    'NAITRAI','NAITRAS','NAITRA','NAITRONS','NAITREZ','NAITRONT',
    'NAITRAIS','NAITRAIT','NAITRIONS','NAITRIEZ','NAITRAIENT',
    'NAISSE','NAISSES','NAISSENT',
    'NAQUISSE','NAQUISSES','NAQUISSIONS','NAQUISSIEZ','NAQUISSENT',
    'NE','NAISSANT']);

  add('SURSEOIR',['SURSISE']);

  add('EQUIVALOIR',['EQUIVAUX','EQUIVAUT','EQUIVALONS','EQUIVALEZ','EQUIVALENT',
    'EQUIVALAIS','EQUIVALAIT','EQUIVALIONS','EQUIVALIEZ','EQUIVALAIENT',
    'EQUIVAUDRAI','EQUIVAUDRAS','EQUIVAUDRA','EQUIVAUDRONS','EQUIVAUDREZ','EQUIVAUDRONT',
    'EQUIVAUDRAIS','EQUIVAUDRAIT','EQUIVAUDRIONS','EQUIVAUDRIEZ','EQUIVAUDRAIENT',
    'EQUIVAILLE','EQUIVAILLES','EQUIVAILLENT','EQUIVALANT','EQUIVALU']);

  add('PLAIRE',['PLUMES','PLUTES','PLUSSIEZ','PLUSSENT','PLUSSIONS']);

  add('ASSEOIR',['ASSIERA','ASSIERAS','ASSIERONS','ASSIEREZ','ASSIERONT','ASSIERAIT']);
  add('RASSEOIR',['RASSIERA','RASSIERAS','RASSIERONS','RASSIEREZ','RASSIERONT','RASSIERAIT']);

  add('DORMIR',['DORT']);

  add('ELIRE',['ELUT','ELUTES','ELURENT','ELUSSIEZ','ELUSSIONS','ELUSSENT']);

  add('EMOUVOIR',['EMUT','EMUTES','EMURENT','EMUSSE','EMUSSIEZ','EMUSSIONS','EMUSSENT']);

  add('REBOIRE',['REBU','REBUE','REBUES']);

  add('ABSOUDRE',['ABSOLUS','ABSOLUT','ABSOLUMES','ABSOLUTES','ABSOLURENT','ABSOLUSSE','ABSOLUSSIONS','ABSOLUSSIEZ','ABSOLUSSENT']);

  add('ACCROITRE',['ACCRUS','ACCRUT','ACCRUMES','ACCRUTES','ACCRURENT','ACCRUSSENT','ACCRUSSIEZ','ACCRUSSIONS']);

  add('DECROITRE',['DECRUS','DECRUT','DECRUMES','DECRUTES','DECRURENT','DECRUSSENT','DECRUSSIEZ','DECRUSSIONS']);

  add('ASSAILLIR',['ASSAILLE','ASSAILLES','ASSAILLENT']);
  add('DEFAILLIR',['DEFAILLE','DEFAILLES','DEFAILLENT']);

  add('APERCEVOIR',['APERCOIS','APERCOIT','APERCEVONS','APERCEVEZ','APERCOIVENT',
    'APERCEVAIS','APERCEVAIT','APERCEVIONS','APERCEVIEZ','APERCEVAIENT',
    'APERCUS','APERCUT','APERCUMES','APERCUTES','APERCURENT',
    'APERCEVRAI','APERCEVRAIS','APERCEVRA','APERCEVRONS','APERCEVREZ','APERCEVRONT',
    'APERCEVRAIT','APERCEVRIONS','APERCEVRIEZ','APERCEVRAIENT',
    'APERCOIVE','APERCOIVES','APERCEVANT','APERCU','APERCUE','APERCUES','APERCUS']);

  add('GRAFF',['GRAFS']);

  add('SUIVRE',['SUIT','SUIVI','SUIVIE','SUIVIES','SUIVIS']);

  add('ACCOURIR',['ACCOURE','ACCOURES','ACCOURUT','ACCOURUIT']);

  // PARAITRE passé simple → fix faux positifs PARUT→PARURE et COMPARUMES→COMPARER
  add('PARAITRE',['PARUS','PARUT','PARUMES','PARUTES','PARURENT','PARUSSENT','PARUSSIEZ','PARUSSIONS']);
  add('APPARAITRE',['APPARU','APPARUS','APPARUT','APPARUMES','APPARUTES','APPARURENT','APPARUSSENT','APPARUSSIEZ']);

  // PLAIRE passé simple complets (PLU/PLUS/PLUT → COMPLAIRE/DEPLAIRE via boucle préfixes)
  add('PLAIRE',['PLU','PLUS','PLUT']);

  // CONCEVOIR / DECEVOIR conjugaison complète
  add('CONCEVOIR',['CONCOIS','CONCOIT','CONCEVONS','CONCEVEZ','CONCOIVENT',
    'CONCEVAIS','CONCEVAIT','CONCEVIONS','CONCEVIEZ','CONCEVAIENT',
    'CONCUS','CONCUT','CONCUMES','CONCUTES','CONCURENT',
    'CONCOIVE','CONCOIVES','CONCEVANT','CONCU','CONCUE','CONCUES']);
  add('DECEVOIR',['DECOIS','DECOIT','DECEVONS','DECEVEZ','DECOIVENT',
    'DECEVAIS','DECEVAIT','DECEVIONS','DECEVIEZ','DECEVAIENT',
    'DECUS','DECUT','DECUMES','DECUTES','DECURENT',
    'DECOIVE','DECOIVES','DECEVANT','DECU','DECUE','DECUES']);

  // COUVRIR/OUVRIR/OFFRIR/SOUFFRIR pp → DECOUVRIR/RECOUVRIR/ENTROUVERT via boucle préfixes
  add('COUVRIR',['COUVERT','COUVERTE','COUVERTES','COUVERTS']);
  add('OUVRIR',['OUVERT','OUVERTE','OUVERTES','OUVERTS']);
  add('OFFRIR',['OFFERT','OFFERTE','OFFERTES','OFFERTS']);
  add('SOUFFRIR',['SOUFFERT','SOUFFERTE','SOUFFERTES','SOUFFERTS']);

  // DISSOUDRE : formes en DISSOLV-
  add('DISSOUDRE',['DISSOLVE','DISSOLVES','DISSOLVENT',
    'DISSOLVAIS','DISSOLVAIT','DISSOLVIONS','DISSOLVIEZ','DISSOLVAIENT',
    'DISSOLVONS','DISSOLVEZ','DISSOLVANT','DISSOUTE','DISSOUTES','DISSOUTS']);

  // DORMIR présent → ENDORMIR/RENDORMIR via boucle préfixes
  add('DORMIR',['DORS','DORME','DORMES','DORMENT']);
  add('RENDORMIR',['RENDORS','RENDORT','RENDORME','RENDORMES','RENDORMENT']);

  // RELIRE/ELIRE pp (RELU→RELIRE, ELU→RE+ELIRE=REELIRE)
  add('RELIRE',['RELU','RELUE','RELUES','RELUS']);
  add('ELIRE',['ELU','ELUE','ELUES','ELUS']);

  // DEVOIR/POUVOIR subjonctif imparfait manquants
  add('DEVOIR',['DUSSENT','DUSSES','DUSSIEZ','DUSSIONS']);
  add('POUVOIR',['PUSSENT','PUSSES','PUSSIEZ','PUSSIONS']);

  // VIVRE/VOULOIR/EQUIVALOIR pp féminins
  add('VIVRE',['VECU','VECUE','VECUES','VECUS']);
  add('VOULOIR',['VOULUE','VOULUES']);
  add('EQUIVALOIR',['EQUIVALUE','EQUIVALUES','EQUIVALUS']);

  // APERCEVOIR subjonctif imparfait manquants
  add('APERCEVOIR',['APERCUSSE','APERCUSSES','APERCUSSENT','APERCUSSIONS','APERCUSSIEZ']);

  // ACQUERIR présent + composés (CONQUERIR/REQUERIR/ENQUERIR explicites car pas de décomposition directe)
  add('ACQUERIR',['ACQUIERS','ACQUIERT','ACQUIERENT','ACQUIERE','ACQUIERES',
    'ACQUIT','ACQUIRENT']);
  add('CONQUERIR',['CONQUIERS','CONQUIERT','CONQUIERENT','CONQUIERE','CONQUIERES',
    'CONQUIT','CONQUIRENT']);
  add('REQUERIR',['REQUIERS','REQUIERT','REQUIERENT','REQUIERE','REQUIERES',
    'REQUIT','REQUIRENT']);
  add('ENQUERIR',['ENQUIERS','ENQUIERT','ENQUIERENT','ENQUIERE','ENQUIERES',
    'ENQUIT','ENQUIRENT']);

  // SERVIR/SENTIR/PARTIR présent → verbes composés via boucle préfixes
  add('SERVIR',['SERS','SERT','SERVE','SERVES','SERVENT']);
  add('SENTIR',['SENS','SENT','SENTE','SENTES','SENTENT']);
  add('PARTIR',['PARS','PART','PARTE','PARTES','PARTENT']);
  add('RESSENTIR',['RESSENS','RESSENT','RESSENTE','RESSENTENT']);

  // REMOUDRE/EMOUDRE pp féminins
  add('REMOUDRE',['REMOULU','REMOULUE','REMOULUES','REMOULUS']);
  add('EMOUDRE',['EMOULU','EMOULUE','EMOULUES','EMOULUS']);

  // COUDRE passé simple manquants
  add('COUDRE',['COUSIS','COUSIT','COUSITES']);

  // DISSOUDRE passé simple → AUTODISSOUDRE via AUTO prefix compound
  add('DISSOUDRE',['DISSOLUS','DISSOLUT','DISSOLUMES','DISSOLUTES','DISSOLURENT',
    'DISSOLUSE','DISSOLUSES','DISSOLUSIONS','DISSOLUSIEZ','DISSOLUSSENT']);

  // PLAIRE subj impf manquant (COMPLUSSES/DEPLUSSES via boucle préfixes)
  add('PLAIRE',['PLUSSES']);

  // LIRE pp fém/plur
  add('LIRE',['LUE','LUES','LUS']);

  // VALOIR pp (VALUE→VALOIR, PREVALUE/REVALUE via boucle préfixes)
  add('VALOIR',['VALU','VALUE','VALUES','VALUS']);

  // AVOIR pp fém plur
  add('AVOIR',['EUES']);

  // OINDRE passé simple manquant
  add('OINDRE',['OIGNIS','OIGNIT','OIGNIMES','OIGNITES','OIGNIRENT']);

  // ACCROITRE subj impf manquant
  add('ACCROITRE',['ACCRUSSE','ACCRUSSES','ACCRUSSENT','ACCRUSSIEZ','ACCRUSSIONS']);

  // ASSEOIR 3p présent manquant
  add('ASSEOIR',['ASSEYENT']);

  // PERCEVOIR conjugaison complète (ENTRAPERCEVOIR via ENTRA prefix compound)
  add('PERCEVOIR',['PERCOIS','PERCOIT','PERCEVONS','PERCEVEZ','PERCOIVENT',
    'PERCEVAIS','PERCEVAIT','PERCEVIONS','PERCEVIEZ','PERCEVAIENT',
    'PERCU','PERCUE','PERCUES','PERCUS',
    'PERCUSSE','PERCUSSES','PERCUSSENT','PERCUSSIEZ','PERCUSSIONS',
    'PERCUTES','PERCOIVE','PERCOIVES','PERCEVANT']);

  // CONCEVOIR subj imparfait manquant (PRECONCEVOIR via PRE prefix compound)
  add('CONCEVOIR',['CONCUSSE','CONCUSSES','CONCUSSENT','CONCUSSIEZ','CONCUSSIONS']);

  // EQUIVALOIR passé simple manquant
  add('EQUIVALOIR',['EQUIVALUT','EQUIVALUS']);

  // SECOURIR conjugaison partielle
  add('SECOURIR',['SECOURUS','SECOURUT','SECOURUMES','SECOURUTES','SECOURURENT']);

  // ECHOIR passé simple
  add('ECHOIR',['ECHUT','ECHUMES','ECHUTES','ECHURENT']);

  // POURVOIT → POURVOIR (passé simple)
  add('POURVOIR',['POURVUT','POURVUMES','POURVUTES','POURVURENT']);

  // REPLAIRE (RE+PLAIRE) passé simple via irr_map directs
  add('PLAIRE',['REPLURENT']);

  // VOIR passé simple 1s/2s (ENTREVIS via ENTRE+VIS compound)
  add('VOIR',['VIS','VIT']);

  // RESOUDRE passé simple
  add('RESOUDRE',['RESOLUS','RESOLUT','RESOLUMES','RESOLUTES','RESOLURENT']);

  // POURVOIR pp fém → REPOURVUE etc. via RE compound
  add('POURVOIR',['POURVUE','POURVUES','POURVUS']);

  // COUDRE pp → RECOUSU etc. via RE compound
  add('COUDRE',['COUSU','COUSUE','COUSUES','COUSUS']);

  // ENQUERIR/CONQUERIR pp → composés via boucle préfixes
  add('ENQUERIR',['ENQUIS','ENQUISE','ENQUISES']);
  add('CONQUERIR',['CONQUIS','CONQUISE','CONQUISES']);

  // PERCEVOIR passé simple 3pl (ENTRAPERCEVOIR via ENTRA prefix)
  add('PERCEVOIR',['PERCURENT']);

  // DECROITRE pp masc; EMOUDRE passé simple 3sg
  add('DECROITRE',['DECRU']);
  add('EMOUDRE',['EMOULUT']);

  // PROMOUVOIR présent 3pl et subj manquants
  add('PROMOUVOIR',['PROMEUVENT','PROMEUVES']);

  // RESSORTIR présent 1s/2s (non décomposable par boucle préfixes)
  add('RESSORTIR',['RESSORS','RESSORT']);

  // ROUVRIR/ENTROUVRIR pp (préfixes ROU-/ENTR- non standard)
  add('ROUVRIR',['ROUVERT','ROUVERTE','ROUVERTES','ROUVERTS']);
  add('ENTROUVRIR',['ENTROUVERT','ENTROUVERTE','ENTROUVERTES','ENTROUVERTS']);

  // PRESSENTIR présent 1s/2s (PRES+SENTIR non décomposable)
  add('PRESSENTIR',['PRESSENS','PRESSENTE']);

  // POLICEWOMAN pluriel anglais
  add('POLICEWOMAN',['POLICEWOMEN']);

  // POURSUIVRE présent 1s/2s (POUR+SUIS→ETRE incorrect)
  add('POURSUIVRE',['POURSUIS']);

  // RECROITRE passé simple
  add('RECROITRE',['RECRUT','RECRUS']);

  // DECHOIR futur manquant
  add('DECHOIR',['DECHERREZ','DECHERRONT','DECHERRAS','DECHERRONS']);

  // Féminins d'adjectifs à double consonne
  add('BAS',['BASSE','BASSES']);
  add('SURGRAS',['SURGRASSE','SURGRASSES']);

  // Féminins en -ERESSE
  add('SEIGNEUR',['SEIGNEURESSE','SEIGNEURESSES']);
  add('COACQUEREUR',['COACQUERESSE','COACQUERESSES']);

  // GRAF/GRAFF synonymes, SERTAO sans diacritique, SERINGUEIRA féminin, CONTREFICHER pp, REPLEUVOIR
  add('GRAF',['GRAFF','GRAFS']);
  add('SERINGUEIRO',['SERINGUEIRA','SERINGUEIRAS']);
  add('CONTREFICHE',['CONTREFICHER','CONTREFICHU','CONTREFICHUE','CONTREFICHUES','CONTREFICHUS']);
  add('REPLEUVOIR',['REPLUSSENT','REPLUT']);

  return _irregMap;
}

/* ── Conjugation entries in c[] that should redirect to their infinitive ── */
let _conjMap = null;
function _getConjMap(){
  if(_conjMap) return _conjMap;
  _conjMap = new Map();
  const irr = _getIrregMap();
  const add = (inf, forms) => { for(const f of forms){ _conjMap.set(f, inf); irr.set(f, inf); } };
  add('ABSOUDRE',['ABSOUT']);
  add('BOIRE',['BUMES','BURENT','BUSSE','BUSSIEZ']);
  add('BOUILLIR',['BOUS']);
  add('BRAIRE',['BRAIT']);
  add('CHOIR',['CHERRONT','CHU','CHUMES']);
  add('COMPLAIRE',['COMPLUMES']);
  add('CONCEVOIR',['CONCUMES','CONCURENT','CONCUSSE','CONCUT']);
  add('COUDRE',['COUSE','COUSIMES','COUSIRENT']);
  add('DEBOUILLIR',['DEBOUS']);
  add('DECEVOIR',['DECUMES','DECURENT','DECUSSE','DECUT']);
  add('DECHOIR',['DECHERRA','DECHET','DECHUMES']);
  add('DECOUDRE',['DECOUSE','DECOUSIMES','DECOUSIRENT']);
  add('DEMENTIR',['DEMENS']);
  add('DEPLAIRE',['DEPLURENT']);
  add('DEPRENDRE',['DEPRIRENT','DEPRISSE']);
  add('DISSOUDRE',['DISSOUT']);
  add('ECHOIR',['ECHEENT','ECHERRA','ECHET','ECHU']);
  add('ELIRE',['ELUMES','ELUSSE']);
  add('EMBOIRE',['EMBUMES','EMBUSSE']);
  add('EMOUDRE',['EMOULE','EMOULUMES']);
  add('EMOUVOIR',['EMEUT','EMEUVE','EMUMES']);
  add('FLEURIR',['FLORISSAIS','FLORISSIEZ']);
  add('LIRE',['LUMES','LURENT','LUSSE']);
  add('MENTIR',['MENS']);
  add('MOUDRE',['MOULUMES','MOULUSSE']);
  add('MOUVOIR',['MEUS','MEUT','MEUVE','MUMES','MUT']);
  add('NAITRE',['NAQUIMES']);
  add('OINDRE',['OIGNE']);
  add('OUIR',['OIENT','OIS','OIT','OYAIENT','OYEZ']);
  add('PAITRE',['PAIS','PAISSE','PAIT']);
  add('PERCEVOIR',['PERCUMES','PERCUT']);
  add('PLAIRE',['PLURENT','PLUSSE']);
  add('PROMOUVOIR',['PROMEUS','PROMUMES']);
  add('RAIRE',['RAIT']);
  add('REBOIRE',['REBUMES','REBUSSE']);
  add('RECEVOIR',['RECUMES','RECUSSE']);
  add('RECOUDRE',['RECOUSE','RECOUSIMES','RECOUSIRENT']);
  add('REDEVOIR',['REDU','REDUMES','REDURENT']);
  add('RELIRE',['RELUMES','RELURENT']);
  add('REMOUDRE',['REMOULUT']);
  add('RENAITRE',['RENAQUIS','RENE']);
  add('REPAITRE',['REPAIS','REPUMES']);
  add('RESOUDRE',['RESOUT']);
  add('RETRAIRE',['RETRAIE','RETRAYAIS','RETRAYEZ']);
  add('REVALOIR',['REVAILLE']);
  add('SAVOIR',['SUMES','SURENT','SUSSE','SUTES']);
  add('TAIRE',['TUMES','TURENT','TUSSE','TUSSIONS','TUT','TUTES']);
  add('TRAIRE',['TRAIE','TRAYAIS','TRAYEZ']);
  add('VALOIR',['VAILLE']);
  return _conjMap;
}

/* ── Préfixes de verbes composés ── */
const _VERB_PREFIXES = ['RESSOU','DISCON','CIRCON','ENTRA','APPAR','MAIN','ENTRE','CONTRE','INTER','TRANS','CODE','REDE','SOUS','TRES','SATIS','POUR','PAR','SUR','ABS','SUB','SOU','CON','COM','PRE','PRO','DIS','OB','MES','RE','DE','DES','EN','EM','AD','AB'];

/* ── Checks supplémentaires pour radicaux irréguliers ── */
function _xchk(stem,cm){
  // -IGN → -INDRE (PEIGN→PEINDRE, ADJOIGN→ADJOINDRE, CRAIGN→CRAINDRE)
  if(stem.endsWith('IGN')&&stem.length>3){const c=stem.slice(0,-3)+'INDRE';if(cm.has(c))return c;}
  // -IGNI → -INDRE (passé simple 1s/2s: ASTREIGNIS→ASTREINDRE)
  if(stem.endsWith('IGNI')&&stem.length>5){const c=stem.slice(0,-4)+'INDRE';if(cm.has(c))return c;}
  // -S → -RE (-UIRE: CONDUIS→CONDUIRE, PRODUIS→PRODUIRE)
  if(stem.endsWith('S')&&stem.length>2){const c=stem.slice(0,-1)+'RE';if(cm.has(c))return c;}
  // -T → -RE (PP -UIRE: CONSTRUIT→CONSTRUIRE, INSCRIT→INSCRIRE)
  if(stem.endsWith('T')&&stem.length>2){const c=stem.slice(0,-1)+'RE';if(cm.has(c))return c;}
  // -TE → -RE (PP fém. -UIRE: CONSTRUITE→CONSTRUIRE, INSCRITE→INSCRIRE)
  if(stem.endsWith('TE')&&stem.length>3){const c=stem.slice(0,-2)+'RE';if(cm.has(c))return c;}
  // -V → -RE (ECRIV→ECRIRE, CIRCONSCRIV→CIRCONSCRIRE)
  if(stem.endsWith('V')&&stem.length>2){const c=stem.slice(0,-1)+'RE';if(cm.has(c))return c;}
  // -R → -OIR (conditionnel -OIR: APERCEVR→APERCEVOIR)
  if(stem.endsWith('R')&&stem.length>2){const c=stem.slice(0,-1)+'OIR';if(cm.has(c))return c;}
  // -RI → -OIR (conditionnel: CONCEVRI→CONCEVOIR)
  if(stem.endsWith('RI')&&stem.length>3){const c=stem.slice(0,-2)+'OIR';if(cm.has(c))return c;}
  // -I (double) → -RE (passé simple -IRE: CIRCONSCRIVI→CIRCONSCRIRE)
  if(stem.endsWith('I')&&stem.length>3){const c=stem.slice(0,-2)+'RE';if(cm.has(c))return c;}
  // stem + ENDRE (APPREN+ENDRE=APPRENDRE)
  if(cm.has(stem+'ENDRE'))return stem+'ENDRE';
  // stem + DRE (APPREN+DRE=APPRENDRE, présent 1pl/2pl/3pl)
  if(cm.has(stem+'DRE'))return stem+'DRE';
  // -NN → -N+DRE (APPRENN→APPRENDRE) ou -N bare (BONN→BON, PAYSANN→PAYSAN)
  if(stem.endsWith('NN')&&stem.length>2){
    const c=stem.slice(0,-1)+'DRE';if(cm.has(c))return c;
    if(cm.has(stem.slice(0,-1)))return stem.slice(0,-1);
  }
  // -LL → -L (féminin adj: NULL→NUL, PAREILL→PAREIL, GENTILL→GENTIL)
  if(stem.endsWith('LL')&&stem.length>2){if(cm.has(stem.slice(0,-1)))return stem.slice(0,-1);}
  // -TT → -T (féminin adj -ET/-OT: SOTT→SOT, MUETT→MUET, CADETT→CADET)
  if(stem.endsWith('TT')&&stem.length>2){if(cm.has(stem.slice(0,-1)))return stem.slice(0,-1);}
  // stem + URE (CONCL+URE=CONCLURE, subj. imp.)
  if(cm.has(stem+'URE'))return stem+'URE';
  // -L → -UDRE (ABSOL→ABSOUDRE, DISSOL→DISSOUDRE)
  if(stem.endsWith('L')&&stem.length>2){const c=stem.slice(0,-1)+'UDRE';if(cm.has(c))return c;}
  // stem + ERIR (ACQU+ERIR=ACQUERIR)
  if(cm.has(stem+'ERIR'))return stem+'ERIR';
  // stem + OIR (CONCEV+OIR=CONCEVOIR)
  if(cm.has(stem+'OIR'))return stem+'OIR';
  // stem + AITRE (APPAR+AITRE=APPARAITRE, subj. imp.)
  if(cm.has(stem+'AITRE'))return stem+'AITRE';
  // -U → -AITRE (passé simple PARAITRE composés: APPARU→APPARAITRE, COMPARU→COMPARAITRE)
  if(stem.endsWith('U')&&stem.length>2){const c=stem.slice(0,-1)+'AITRE';if(cm.has(c))return c;}
  // -E → bare (INSCRITE→INSCRIT après strip -S)
  if(stem.endsWith('E')&&stem.length>2&&cm.has(stem.slice(0,-1)))return stem.slice(0,-1);
  return null;
}

/* ── Lemme parent pour une forme fléchie ou conjuguée ── */
function findLemma(w){
  if(!w) return null;
  const cm = _getCMap();
  if(cm.has(w)) return w;
  const im = _getInflMap();
  if(im.has(w)) return im.get(w);

  // Table des irréguliers (base + composés via préfixe)
  const irr = _getIrregMap();
  if(irr.has(w)){
    const inf = irr.get(w); if(cm.has(inf)) return inf;
  }
  // Verbes composés : essayer de détacher un préfixe et chercher le reste
  for(const pfx of _VERB_PREFIXES){
    if(!w.startsWith(pfx) || w.length <= pfx.length+2) continue;
    const rest = w.slice(pfx.length);
    if(irr.has(rest)){
      const baseInf = irr.get(rest);
      const compound = pfx + baseInf;
      if(cm.has(compound)) return compound;
    }
  }

  // Participes passés féminins : -EES/-EE (verbes -ER), -IES/-IE (verbes -IR)
  for(const [sfx,vs] of [['EES',['ER']],['EE',['ER']],['IES',['IR','ER']],['IE',['IR','ER']]]){
    if(w.endsWith(sfx) && w.length > sfx.length+1){
      const st = w.slice(0,-sfx.length);
      for(const v of vs){ if(cm.has(st+v)) return st+v; }
    }
  }

  // Formes irrégulières -EINDRE/-OINDRE/-AINDRE (part. passés, présent 1s/2s)
  // et passé simple -TENIR/-VENIR (INT/INTS/INS)
  // Doit précéder le test endsWith('S') pour éviter PEINS→PEINE, ATTEINS→ATTEINDRE, etc.
  for(const [sfx,add] of [
    ['EINTS','EINDRE'],['EINT','EINDRE'],['EINS','EINDRE'],['EINTES','EINDRE'],['EINTE','EINDRE'],
    ['OINTS','OINDRE'],['OINT','OINDRE'],['OINS','OINDRE'],['OINTES','OINDRE'],['OINTE','OINDRE'],
    ['AINTS','AINDRE'],['AINT','AINDRE'],['AINS','AINDRE'],['AINTES','AINDRE'],['AINTE','AINDRE'],
    ['INTS',null],['INT',null],['INS','ENIR'],
  ]){
    if(!w.endsWith(sfx)||w.length<=sfx.length) continue;
    const st=w.slice(0,-sfx.length);
    if(add){ if(cm.has(st+add)) return st+add; }
    else{
      if(cm.has(st+'ENIR'))   return st+'ENIR';
      if(cm.has(st+'EINDRE')) return st+'EINDRE';
      if(cm.has(st+'INDRE'))  return st+'INDRE';
    }
  }

  // Pluriel simple en -S : ARAS→ARA avant de tomber dans les strips
  if(w.endsWith('S') && w.length>2){ const bare=w.slice(0,-1); if(cm.has(bare)) return bare; }

  // Strips
  const ER_FUTURE = new Set(['ERAI','ERAS','ERA','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERENT','ERIONS','ERIEZ','ERAIENT']);
  const VERB_SFXS = new Set([
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    'ISSAIENT','ISSAIT','ISSAIS','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    'AIENT','ERENT','IRENT','ATES','AMES','UMES','UTES','AT','AIT','AIS','IONS','IEZ',
    'ANT','ONS','ENT','EZ','IT','AI','AS','A','ES','IMES','ITES',
    'URENT',
  ]);
  const strips = [
    // Subjonctif imparfait
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    // Imparfait/formes en -ISS
    'ISSAIENT','ISSAIT','ISSAIS','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    // Conditionnel / futur
    'AIENT','ANT','ERENT','IRENT','ERAIENT','ERIONS','ERIEZ','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERAI',
    // Passé simple manquants + subj. imp. 3s
    'ATES','AMES','UMES','UTES','AT','IMES','ITES',
    // Présent / imparfait courant
    'AIT','AIS','IONS','IEZ','ONS','ONT','ENT','EZ','AI',
    'IT','EAUX','AUX',
    'AS','A','ERA','ERAS','ES','S','X',
    // Passé simple 3pl irr. (-UIRE, -AÎTRE, -OUDRE…)
    'URENT'];
  for(const s of strips){
    if(!w.endsWith(s)) continue;
    const stem = w.slice(0,-s.length);
    if(stem.length<2) continue;
    if(ER_FUTURE.has(s)){
      if(cm.has(stem+'ER')) return stem+'ER';
      if(cm.has(stem+'IR')) return stem+'IR';
      if(cm.has(stem+'RE')) return stem+'RE';
      if(stem.endsWith('OIE')&&cm.has(stem.slice(0,-3)+'OYER')) return stem.slice(0,-3)+'OYER';
      if(stem.endsWith('AIE')&&cm.has(stem.slice(0,-3)+'AYER')) return stem.slice(0,-3)+'AYER';
      if(stem.endsWith('UIE')&&cm.has(stem.slice(0,-3)+'UYER')) return stem.slice(0,-3)+'UYER';
      if(stem.endsWith('OI')&&cm.has(stem.slice(0,-2)+'OYER')) return stem.slice(0,-2)+'OYER';
      if(stem.endsWith('AI')&&cm.has(stem.slice(0,-2)+'AYER')) return stem.slice(0,-2)+'AYER';
      if(stem.endsWith('UI')&&cm.has(stem.slice(0,-2)+'UYER')) return stem.slice(0,-2)+'UYER';
      if((stem.endsWith('LL')||stem.endsWith('TT'))&&cm.has(stem.slice(0,-1)+'ER')) return stem.slice(0,-1)+'ER';
      if((stem.endsWith('LL')||stem.endsWith('TT'))&&cm.has(stem.slice(0,-1)+'IR')) return stem.slice(0,-1)+'IR';
      if(stem.endsWith('RR')&&cm.has(stem.slice(0,-1)+'IR')) return stem.slice(0,-1)+'IR';
      if(stem.endsWith('RR')&&cm.has(stem.slice(0,-1)+'RE')) return stem.slice(0,-1)+'RE';
      {const r=_xchk(stem,cm);if(r)return r;}
      if(cm.has(stem+'E'))  return stem+'E';
    }
    if(VERB_SFXS.has(s)){
      if(cm.has(stem+'ER'))    return stem+'ER';
      if(cm.has(stem+'IR'))    return stem+'IR';
      if(cm.has(stem+'RE'))    return stem+'RE';
      if(cm.has(stem+'ETTRE')) return stem+'ETTRE'; // METTRE composés (REEM→REEMETTRE)
      if(cm.has(stem+'ITRE'))  return stem+'ITRE';  // CONNAITRE, NAITRE, APPARAITRE…
      if(cm.has(stem+'AYER'))  return stem+'AYER';  // FRAYER (FRAIENT → FR → FRAYER, not FRIRE)
      if(cm.has(stem+'IRE'))   return stem+'IRE';   // LUIRE, NUIRE, SUFFIRE (LU→LUIRE)
      if(stem.endsWith('E')&&stem.length>2&&cm.has(stem.slice(0,-1)+'ER')) return stem.slice(0,-1)+'ER';
      if(stem.endsWith('I')&&cm.has(stem+'R')) return stem+'R';
      if(stem.endsWith('OIE')&&cm.has(stem.slice(0,-3)+'OYER')) return stem.slice(0,-3)+'OYER';
      if(stem.endsWith('AIE')&&cm.has(stem.slice(0,-3)+'AYER')) return stem.slice(0,-3)+'AYER';
      if(stem.endsWith('UIE')&&cm.has(stem.slice(0,-3)+'UYER')) return stem.slice(0,-3)+'UYER';
      if(stem.endsWith('OI')&&cm.has(stem.slice(0,-2)+'OYER')) return stem.slice(0,-2)+'OYER';
      if(stem.endsWith('AI')&&cm.has(stem.slice(0,-2)+'AYER')) return stem.slice(0,-2)+'AYER';
      if(stem.endsWith('UI')&&cm.has(stem.slice(0,-2)+'UYER')) return stem.slice(0,-2)+'UYER';
      if((stem.endsWith('LL')||stem.endsWith('TT'))&&cm.has(stem.slice(0,-1)+'ER')) return stem.slice(0,-1)+'ER';
      if((stem.endsWith('LL')||stem.endsWith('TT'))&&cm.has(stem.slice(0,-1)+'IR')) return stem.slice(0,-1)+'IR';
      if(stem.endsWith('RR')&&cm.has(stem.slice(0,-1)+'IR')) return stem.slice(0,-1)+'IR';
      if(stem.endsWith('U')&&stem.length>2){const su=stem.slice(0,-1);if(cm.has(su+'IR'))return su+'IR';if(cm.has(su+'RE'))return su+'RE';}
      if(stem.endsWith('I')&&stem.length>2){if(cm.has(stem+'R'))return stem+'R';if(cm.has(stem.slice(0,-1)+'RE'))return stem.slice(0,-1)+'RE';}
      {const r=_xchk(stem,cm);if(r)return r;}
    }
    if(cm.has(stem)) return stem;
    if(im.has(stem)) return im.get(stem);
    if(s==='AUX' && cm.has(stem+'AL')) return stem+'AL';
    if(s==='EAUX' && cm.has(stem+'EAU')) return stem+'EAU';
    if(cm.has(stem+'ER'))  return stem+'ER';
    if(cm.has(stem+'IR'))  return stem+'IR';
    if(cm.has(stem+'RE'))  return stem+'RE';
    if(cm.has(stem+'TRE')) return stem+'TRE';
    if(cm.has(stem+'E'))   return stem+'E';
    if(stem.endsWith('I')&&stem.length>2){if(cm.has(stem+'R'))return stem+'R';if(cm.has(stem.slice(0,-1)+'RE'))return stem.slice(0,-1)+'RE';}
    if(stem.endsWith('U')&&stem.length>2){const su=stem.slice(0,-1);if(cm.has(su+'IR'))return su+'IR';if(cm.has(su+'RE'))return su+'RE';}
    if(stem.endsWith('RR')&&stem.length>2){if(cm.has(stem.slice(0,-1)+'IR'))return stem.slice(0,-1)+'IR';if(cm.has(stem.slice(0,-1)+'RE'))return stem.slice(0,-1)+'RE';}
    {const r=_xchk(stem,cm);if(r)return r;}
  }

  // Formes féminines
  for(const [sfx,add] of [
    ['EUSES','EUX'],['EUSE','EUX'],
    ['EUSES','EUR'],['EUSE','EUR'],
    ['RICES','EUR'],['RICE','EUR'],
    ['IVES','IF'],['IVE','IF'],
    ['ELLES','EL'],['ELLE','EL'],
    ['IENNES','IEN'],['IENNE','IEN'],
    ['ONNES','ON'],['ONNE','ON'],
    ['ENNES','EN'],['ENNE','EN'],
    ['LLES','L'],['LLE','L'],
    ['ANNES','AN'],['ANNE','AN'],
  ]){
    if(w.endsWith(sfx)&&w.length>sfx.length+1){
      const st=w.slice(0,-sfx.length);
      if(cm.has(st+add)) return st+add;
    }
  }

  // Présent 1s/3s -ER et futurs -RE (CHANTE→CHANTER, COMMETTRA→COMMETTRE)
  if(w.endsWith('E') && w.length > 2){
    const st = w.slice(0,-1);
    if(cm.has(st+'ER'))   return st+'ER';
    if(st.endsWith('OI')&&cm.has(st.slice(0,-2)+'OYER')) return st.slice(0,-2)+'OYER';
    if(st.endsWith('AI')&&cm.has(st.slice(0,-2)+'AYER')) return st.slice(0,-2)+'AYER';
    if(st.endsWith('UI')&&cm.has(st.slice(0,-2)+'UYER')) return st.slice(0,-2)+'UYER';
    if(cm.has(st+'IR'))   return st+'IR';
    if(cm.has(st))        return st;
    if(cm.has(st+'RE'))   return st+'RE';
    if((st.endsWith('LL')||st.endsWith('TT'))&&cm.has(st.slice(0,-1)+'ER')) return st.slice(0,-1)+'ER';
    if((st.endsWith('LL')||st.endsWith('TT'))&&cm.has(st.slice(0,-1)+'IR')) return st.slice(0,-1)+'IR';
    if(st.endsWith('U')&&st.length>2){const su2=st.slice(0,-1);if(cm.has(su2+'IR'))return su2+'IR';if(cm.has(su2+'RE'))return su2+'RE';}
    {const r=_xchk(st,cm);if(r)return r;}
  }

  // Participes passés masc. en -U (ABSTENU→ABSTENIR, VAINCU→VAINCRE, VENDU→VENDRE)
  if(w.endsWith('U') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'IR')) return st+'IR';
    if(cm.has(st+'RE')) return st+'RE';
    if(cm.has(st+'ER')) return st+'ER';
    {const r=_xchk(st,cm);if(r)return r;}
  }

  // Participes passés masc. en -I (ABOLI→ABOLIR, AGI→AGIR, FUI→FUIR, NUI→NUIRE)
  if(w.endsWith('I') && w.length > 2){
    const st = w.slice(0,-1);
    if(cm.has(st+'IR'))  return st+'IR';
    if(cm.has(st+'IRE')) return st+'IRE';
  }

  // Présent 3s -RE/-TRE/-IR sans désinence (APPREND→APPRENDRE, COMMET→COMMETTRE, MENT→MENTIR)
  if(w.length > 3){
    if(cm.has(w+'RE'))  return w+'RE';
    if(cm.has(w+'TRE')) return w+'TRE';
    if(cm.has(w+'IR'))  return w+'IR';
  }
  // Présent 3s -T → strip T puis essayer (ACCOURT→ACCOURIR, ROMPT→ROMPRE, DISSOUT→DISSOUDRE)
  if(w.endsWith('T') && w.length > 3){
    const st = w.slice(0,-1);
    if(cm.has(st+'RE'))  return st+'RE';
    if(cm.has(st+'TRE')) return st+'TRE';
    if(cm.has(st+'DRE')) return st+'DRE';
    if(cm.has(st+'IR'))  return st+'IR';
    {const r=_xchk(st,cm);if(r)return r;}
  }
  // PP en -IS (APPRIS→APPRENDRE, TRANSMIS→TRANSMETTRE, SOUSCRIS→SOUSCRIRE)
  if(w.endsWith('IS') && w.length > 3){
    const st = w.slice(0,-2);
    if(cm.has(st+'ENDRE')) return st+'ENDRE';
    if(cm.has(st+'ETTRE')) return st+'ETTRE';
    if(cm.has(st+'IRE'))   return st+'IRE';
  }
  // PP fém en -ISE/-ISES (READMISE→READMETTRE, SOUMISE→SOUMETTRE, PROMISE→PROMETTRE)
  if(w.endsWith('ISES') && w.length > 5){
    const st = w.slice(0,-4);
    if(cm.has(st+'ETTRE')) return st+'ETTRE';
    if(cm.has(st+'IRE'))   return st+'IRE';
    if(cm.has(st+'ENDRE')) return st+'ENDRE';
  }
  if(w.endsWith('ISE') && w.length > 4){
    const st = w.slice(0,-3);
    if(cm.has(st+'ETTRE')) return st+'ETTRE';
    if(cm.has(st+'IRE'))   return st+'IRE';
    if(cm.has(st+'ENDRE')) return st+'ENDRE';
  }

  return null;
}

// Map lazy : mot canonique → index dans c[] (pour retrouver def/display)
let _cMap=null;
function _getCMap(){
  if(!_cMap){
    _cMap=new Map();
    const c=window.SEQODS_DATA?.c;
    if(c) c.forEach((w,i)=>_cMap.set(w,i));
  }
  return _cMap;
}


// Set lazy de tous les canons qui doivent afficher "/" (pré-construit en O(n) une seule fois)
let _wantsSlashSet = null;
function _getWantsSlashSet(){
  if(_wantsSlashSet) return _wantsSlashSet;
  _wantsSlashSet = new Set();
  const DATA=window.SEQODS_DATA; if(!DATA) return _wantsSlashSet;
  const {c:C,e:E,f:F}=DATA;
  const _INVAR=/\binterj\b|\bloc\b|\badv\b/;
  const _VAR=/\bn\.[mf]\b|\bn\.\s|\bn\.\)|\badj\b|\bv\.|\bpron\b|\bnum\b/;
  // Regrouper les indices par canon
  const byCanon=new Map();
  for(let i=0;i<C.length;i++){
    const c=C[i]; if(!byCanon.has(c)) byCanon.set(c,[i]); else byCanon.get(c).push(i);
  }
  for(const [canon,idxs] of byCanon){
    if(canon.endsWith('MENT')) continue;
    if(idxs.some(i=>(getNormToE()[C[i]]||'').includes('/'))) continue;
    let hasInvar=false, hasVar=false;
    for(const i of idxs){
      const f=getNormToF()[C[i]]||'';
      if(_INVAR.test(f)) hasInvar=true;
      if(_VAR.test(f)) hasVar=true;
    }
    if(hasInvar && !hasVar) _wantsSlashSet.add(canon);
  }
  return _wantsSlashSet;
}

// Conservé pour openDef / dictSelectWord (appels unitaires)
function _wantsSlash(canon){ return _getWantsSlashSet().has(canon); }


// Returns every index in c[] where c[i] === canon (handles homographs like CHOPPER x2).
function _findAllIdxs(canon){
  const C=window.SEQODS_DATA?.c; if(!C) return [];
  const out=[];
  for(let i=0;i<C.length;i++) if(C[i]===canon) out.push(i);
  return out;
}

// If w is also a conjugated form of a *different* verb in c[], return that verb.
// Handles cases like BRASQUE (noun) also being je/il brasque → BRASQUER.
function _findConjLemma(w){
  const cm=_getCMap();
  if(w.endsWith('E')&&w.length>3){
    const st=w.slice(0,-1);
    if(cm.has(st+'ER')&&st+'ER'!==w) return st+'ER';
    if(cm.has(st+'RE')&&st+'RE'!==w) return st+'RE';
  }
  if(w.endsWith('ES')&&w.length>4){
    const st=w.slice(0,-2);
    if(cm.has(st+'ER')&&st+'ER'!==w) return st+'ER';
  }
  return null;
}


/* ── Modale définition simple (indice 📖) ── */
function _renderWordLinks(container, list, label){
  if(!list || !list.length) return;
  const lbl = document.createElement("strong"); lbl.textContent = label;
  container.appendChild(lbl);
  const sp = document.createElement("span");
  list.forEach((w,i)=>{
    if(i) sp.appendChild(document.createTextNode(" • "));
    const a = document.createElement("a"); a.href="#"; a.className="def-link";
    a.textContent = w;
    a.addEventListener("click", e=>{ e.preventDefault(); openDef(norm(w), w); });
    sp.appendChild(a);
  });
  container.appendChild(sp);
}
