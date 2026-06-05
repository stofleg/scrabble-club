#!/usr/bin/env python3
"""
Simulate findLemma() from common.js against ODS word list in blackscrab/data.js.
"""

import json
import re
import sys
from collections import defaultdict

# ── Step 1: Load canon set from data.js ──────────────────────────────────────
print("Loading data.js...", flush=True)
with open('/home/user/METHODS/data.js', 'r', encoding='utf-8') as f:
    raw = f.read()

# Extract the JSON object
m = re.match(r'window\.SEQODS_DATA\s*=\s*(\{.*\})\s*;?\s*$', raw, re.DOTALL)
if not m:
    print("ERROR: Could not parse data.js")
    sys.exit(1)

data = json.loads(m.group(1))
canon_list = data['c']
# cm = map word → index (like _getCMap in JS)
cm = {}
for i, w in enumerate(canon_list):
    if w not in cm:
        cm[w] = i
cm_set = set(cm.keys())

print(f"  {len(cm_set)} canonical entries loaded.", flush=True)

# ── Step 2: Load ODS word list from blackscrab/data.js ───────────────────────
print("Loading blackscrab/data.js...", flush=True)
with open('/home/user/METHODS/blackscrab/data.js', 'r', encoding='utf-8') as f:
    raw_bs = f.read()

# Extract BS_ALL array — format is [[sorted_letters, word], ...]
# The file has multiple assignments; extract only BS_ALL
m2 = re.search(r'window\.BS_ALL\s*=\s*(\[)', raw_bs)
if not m2:
    print("ERROR: Could not parse blackscrab/data.js")
    sys.exit(1)

# Use json decoder with raw_decode to parse just the array
import json as _json
decoder = _json.JSONDecoder()
bs_data, _ = decoder.raw_decode(raw_bs, m2.start(1))
# Each element is [sorted_letters, word1, (optional more words...)]
# Some entries have multiple words with the same sorted letters
bs_words = []
for item in bs_data:
    for word in item[1:]:
        bs_words.append(word)
bs_word_set = set(bs_words)
print(f"  {len(bs_words)} words in BS_ALL.", flush=True)

# ── Step 3: Build _irregMap ──────────────────────────────────────────────────
irr = {}  # form → infinitive

def add_irr(inf, forms):
    for f in forms:
        irr[f] = inf

add_irr('ETRE',['SUIS','SOMMES','ETES','SONT',
    'ETAIS','ETAIT','ETIONS','ETIEZ','ETAIENT',
    'FUS','FUT','FUMES','FUTES','FURENT',
    'SERAI','SERAS','SERA','SERONS','SEREZ','SERONT',
    'SERAIS','SERAIT','SERIONS','SERIEZ','SERAIENT',
    'SOIS','SOIT','SOYONS','SOYEZ','SOIENT',
    'FUSSE','FUSSES','FUSSIONS','FUSSIEZ','FUSSENT','ETANT'])

add_irr('AVOIR',['AVONS','AVEZ','ONT',
    'AVAIS','AVAIT','AVIONS','AVIEZ','AVAIENT',
    'EUS','EUT','EUMES','EUTES','EURENT',
    'AURAI','AURAS','AURA','AURONS','AUREZ','AURONT',
    'AURAIS','AURAIT','AURIONS','AURIEZ','AURAIENT',
    'AIE','AIES','AIT','AYONS','AYEZ','AIENT',
    'EUSSE','EUSSES','EUSSIONS','EUSSIEZ','EUSSENT','AYANT'])

add_irr('ALLER',['VAIS','VAS','ALLONS','ALLEZ','VONT',
    'ALLAIS','ALLAIT','ALLIONS','ALLIEZ','ALLAIENT',
    'ALLAI','ALLAS','ALLA','ALLAMES','ALLATES','ALLERENT',
    'IRAI','IRAS','IRA','IRONS','IREZ','IRONT',
    'IRAIS','IRAIT','IRIONS','IRIEZ','IRAIENT',
    'AILLE','AILLES','AILLENT',
    'ALLASSE','ALLASSES','ALLAT','ALLASSIONS','ALLASSIEZ','ALLASSENT',
    'ALLANT','ALLE'])

add_irr('FAIRE',['FAIS','FAIT','FAISONS','FAITES','FONT',
    'FAISAIS','FAISAIT','FAISIONS','FAISIEZ','FAISAIENT',
    'FIS','FIT','FIMES','FITES','FIRENT',
    'FERAI','FERAS','FERA','FERONS','FEREZ','FERONT',
    'FERAIS','FERAIT','FERIONS','FERIEZ','FERAIENT',
    'FASSE','FASSES','FASSIONS','FASSIEZ','FASSENT',
    'FISSE','FISSES','FISSIONS','FISSIEZ','FISSENT','FAISANT'])

add_irr('VOULOIR',['VEUX','VEUT','VEULENT',
    'VOULAIS','VOULAIT','VOULIONS','VOULIEZ','VOULAIENT',
    'VOULUS','VOULUT','VOULUMES','VOULUTES','VOULURENT',
    'VOUDRAI','VOUDRAS','VOUDRA','VOUDRONS','VOUDREZ','VOUDRONT',
    'VOUDRAIS','VOUDRAIT','VOUDRIONS','VOUDRIEZ','VOUDRAIENT',
    'VEUILLE','VEUILLES','VEUILLONS','VEUILLEZ','VEUILLENT',
    'VOULUSSE','VOULU','VOULANT'])

add_irr('POUVOIR',['PEUX','PEUT','PEUVENT',
    'POUVAIS','POUVAIT','POUVIONS','POUVIEZ','POUVAIENT',
    'PUS','PUT','PUMES','PUTES','PURENT',
    'POURRAI','POURRAS','POURRA','POURRONS','POURREZ','POURRONT',
    'POURRAIS','POURRAIT','POURRIONS','POURRIEZ','POURRAIENT',
    'PUISSE','PUISSES','PUISSIONS','PUISSIEZ','PUISSENT',
    'PUSSE','PU','POUVANT'])

add_irr('SAVOIR',['SAIS','SAIT','SAVONS','SAVEZ','SAVENT',
    'SAVAIS','SAVAIT','SAVIONS','SAVIEZ','SAVAIENT',
    'SUS','SUT','SUMES','SUTES','SURENT',
    'SAURAI','SAURAS','SAURA','SAURONS','SAUREZ','SAURONT',
    'SAURAIS','SAURAIT','SAURIONS','SAURIEZ','SAURAIENT',
    'SACHE','SACHES','SACHONS','SACHEZ','SACHENT',
    'SUSSE','SU','SACHANT'])

add_irr('VOIR',['VOIS','VOIT','VOYONS','VOYEZ','VOIENT',
    'VOYAIS','VOYAIT','VOYIONS','VOYIEZ','VOYAIENT',
    'VIMES','VITES','VIRENT',
    'VERRAI','VERRAS','VERRA','VERRONS','VERREZ','VERRONT',
    'VERRAIS','VERRAIT','VERRIONS','VERRIEZ','VERRAIENT',
    'VOIE','VOIES','VOIENT',
    'VISSE','VU','VOYANT'])

add_irr('DEVOIR',['DOIS','DOIT','DEVONS','DEVEZ','DOIVENT',
    'DEVAIS','DEVAIT','DEVIONS','DEVIEZ','DEVAIENT',
    'DUS','DUT','DUMES','DUTES','DURENT',
    'DEVRAI','DEVRAS','DEVRA','DEVRONS','DEVREZ','DEVRONT',
    'DEVRAIS','DEVRAIT','DEVRIONS','DEVRIEZ','DEVRAIENT',
    'DOIVE','DOIVES','DOIVENT',
    'DUSSE','DU','DEVANT'])

add_irr('VENIR',['VIENS','VIENT','VENONS','VENEZ','VIENNENT',
    'VENAIS','VENAIT','VENIONS','VENIEZ','VENAIENT',
    'VINS','VINT','VINMES','VINTES','VINRENT',
    'VIENDRAI','VIENDRAS','VIENDRA','VIENDRONS','VIENDREZ','VIENDRONT',
    'VIENDRAIS','VIENDRAIT','VIENDRIONS','VIENDRIEZ','VIENDRAIENT',
    'VIENNE','VIENNES','VIENNENT',
    'VINSSE','VINSSES','VINSSIONS','VINSSIEZ','VINSSENT','VENU','VENANT'])

add_irr('TENIR',['TIENS','TIENT','TENONS','TENEZ','TIENNENT',
    'TENAIS','TENAIT','TENIONS','TENIEZ','TENAIENT',
    'TINS','TINT','TINMES','TINTES','TINRENT',
    'TIENDRAI','TIENDRAS','TIENDRA','TIENDRONS','TIENDREZ','TIENDRONT',
    'TIENDRAIS','TIENDRAIT','TIENDRIONS','TIENDRIEZ','TIENDRAIENT',
    'TIENNE','TIENNES','TIENNENT',
    'TINSSE','TINSSES','TINSSIONS','TINSSIEZ','TINSSENT','TENU','TENANT'])

add_irr('PRENDRE',['PRENDS','PREND','PRENONS','PRENEZ','PRENNENT',
    'PRENAIS','PRENAIT','PRENIONS','PRENIEZ','PRENAIENT',
    'PRIT','PRIMES','PRITES','PRIRENT',
    'PRENDRAI','PRENDRAS','PRENDRA','PRENDRONS','PRENDREZ','PRENDRONT',
    'PRENDRAIS','PRENDRAIT','PRENDRIONS','PRENDRIEZ','PRENDRAIENT',
    'PRENNE','PRENNES','PRENNENT',
    'PRISSE','PRENANT'])

add_irr('METTRE',['METS','MET','METTONS','METTEZ','METTENT',
    'METTAIS','METTAIT','METTIONS','METTIEZ','METTAIENT',
    'MIS','MIT','MIMES','MITES','MIRENT',
    'METTRAI','METTRAS','METTRA','METTRONS','METTREZ','METTRONT',
    'METTRAIS','METTRAIT','METTRIONS','METTRIEZ','METTRAIENT',
    'METTE','METTES','METTENT',
    'MISSE','MISSES','MISSIONS','MISSIEZ','MISSENT','METTANT'])

add_irr('DIRE',['DISONS','DITES','DISENT',
    'DISAIS','DISAIT','DISIONS','DISIEZ','DISAIENT',
    'DIRAI','DIRAS','DIRA','DIRONS','DIREZ','DIRONT',
    'DIRAIS','DIRAIT','DIRIONS','DIRIEZ','DIRAIENT',
    'DISE','DISES','DISENT',
    'DISSE','DISSES','DISSIONS','DISSIEZ','DISSENT','DISANT'])

add_irr('LIRE',['LISONS','LISEZ','LISENT',
    'LISAIS','LISAIT','LISIONS','LISIEZ','LISAIENT',
    'LUS','LUT','LUMES','LUTES','LURENT',
    'LIRAI','LIRAS','LIRA','LIRONS','LIREZ','LIRONT',
    'LIRAIS','LIRAIT','LIRIONS','LIRIEZ','LIRAIENT',
    'LISE','LISES','LISENT',
    'LUSSE','LU','LISANT'])

add_irr('ECRIRE',['ECRIS','ECRIT','ECRIVONS','ECRIVEZ','ECRIVENT',
    'ECRIVAIS','ECRIVAIT','ECRIVIONS','ECRIVIEZ','ECRIVAIENT',
    'ECRIVIS','ECRIVIT','ECRIVIMES','ECRIVITES','ECRIVIRENT',
    'ECRIRAI','ECRIRAS','ECRIRA','ECRIRONS','ECRIREZ','ECRIRONT',
    'ECRIRAIS','ECRIRAIT','ECRIRIONS','ECRIRIEZ','ECRIRAIENT',
    'ECRIVE','ECRIVES','ECRIVENT',
    'ECRIVISSE','ECRIVANT'])

add_irr('BOIRE',['BOIS','BOIT','BUVONS','BUVEZ','BOIVENT',
    'BUVAIS','BUVAIT','BUVIONS','BUVIEZ','BUVAIENT',
    'BUS','BUT','BUMES','BUTES','BURENT',
    'BOIRAI','BOIRAS','BOIRA','BOIRONS','BOIREZ','BOIRONT',
    'BOIRAIS','BOIRAIT','BOIRIONS','BOIRIEZ','BOIRAIENT',
    'BOIVE','BOIVES','BOIVENT',
    'BUSSE','BU','BUVANT'])

add_irr('CROIRE',['CROIS','CROIT','CROYONS','CROYEZ','CROIENT',
    'CROYAIS','CROYAIT','CROYIONS','CROYIEZ','CROYAIENT',
    'CRUS','CRUT','CRUMES','CRUTES','CRURENT',
    'CROIRAI','CROIRAS','CROIRA','CROIRONS','CROIREZ','CROIRONT',
    'CROIRAIS','CROIRAIT','CROIRIONS','CROIRIEZ','CROIRAIENT',
    'CROIE','CROIES','CROIENT',
    'CRUSSE','CRU','CROYANT'])

add_irr('MOURIR',['MEURS','MEURT','MOURONS','MOUREZ','MEURENT',
    'MOURAIS','MOURAIT','MOURIONS','MOURIEZ','MOURAIENT',
    'MOURUS','MOURUT','MOURUMES','MOURUTES','MOURURENT',
    'MOURRAI','MOURRAS','MOURRA','MOURRONS','MOURREZ','MOURRONT',
    'MOURRAIS','MOURRAIT','MOURRIONS','MOURRIEZ','MOURRAIENT',
    'MEURE','MEURES','MEURENT',
    'MOURUSSE','MOURANT'])

add_irr('COURIR',['COURS','COURT','COURONS','COUREZ','COURENT',
    'COURAIS','COURAIT','COURIONS','COURIEZ','COURAIENT',
    'COURUS','COURUT','COURUMES','COURUTES','COURURENT',
    'COURRAI','COURRAS','COURRA','COURRONS','COURREZ','COURRONT',
    'COURRAIS','COURRAIT','COURRIONS','COURRIEZ','COURRAIENT',
    'COURE','COURES','COURENT',
    'COURUSSE','COURU','COURANT'])

add_irr('RECEVOIR',['RECOIS','RECOIT','RECEVONS','RECEVEZ','RECOIVENT',
    'RECEVAIS','RECEVAIT','RECEVIONS','RECEVIEZ','RECEVAIENT',
    'RECUS','RECUT','RECUMES','RECUTES','RECURENT',
    'RECEVRAI','RECEVRAS','RECEVRA','RECEVRONS','RECEVREZ','RECEVRONT',
    'RECEVRAIS','RECEVRAIT','RECEVRIONS','RECEVRIEZ','RECEVRAIENT',
    'RECOIVE','RECOIVES','RECOIVENT',
    'RECUSSE','RECU','RECEVANT'])

add_irr('VALOIR',['VAUX','VAUT','VALONS','VALEZ','VALENT',
    'VALAIS','VALAIT','VALIONS','VALIEZ','VALAIENT',
    'VALUS','VALUT','VALUMES','VALUTES','VALURENT',
    'VAUDRAI','VAUDRAS','VAUDRA','VAUDRONS','VAUDREZ','VAUDRONT',
    'VAUDRAIS','VAUDRAIT','VAUDRIONS','VAUDRIEZ','VAUDRAIENT',
    'VAILLE','VAILLES','VAILLENT',
    'VALUSSE','VALU','VALANT'])

add_irr('FALLOIR',['FAUT','FALLAIT','FALLUT','FAUDRA','FAUDRAIT','FAILLE','FALLU'])

add_irr('PLEUVOIR',['PLEUT','PLEUVAIT','PLEUVAIENT','PLUT','PLUSSENT','PLEUVRA','PLEUVRAIT','PLEUVRAIENT','PLEUVRONT','PLEUVE','PLEUVENT','PLEUVANT','PLU'])

add_irr('GESIR',['GIT','GISAIT','GISAIENT','GISONS','GISEZ','GISIEZ','GISIONS'])

add_irr('SEOIR',['SIEE','SIEENT','SIERAIT','SIERAIENT','SIERONT','SEYAIT'])

add_irr('MESSEOIR',['MESSIEENT','MESSIERAIT','MESSIERAIENT','MESSIERONT','MESSEYAIT'])

add_irr('SOURDRE',['SOURDAIT','SOURDAIENT','SOURDENT'])

add_irr('SAILLIR',['SAILLE','SAILLI','SAILLIRONT'])

add_irr('TRAIRE',['TRAYAIT','TRAYAIENT','TRAYANT','TRAYONS','TRAYIEZ','TRAYIONS','TRAIENT'])

add_irr('PAITRE',['PAISSAIT','PAISSAIENT','PAISSAIS','PAISSONS','PAISSEZ','PAISSENT','PAISSIONS','PAISSIEZ'])

add_irr('ABSOUDRE',['ABSOLVAIT','ABSOLVAIENT','ABSOLVAIS','ABSOLVANT','ABSOLVE','ABSOLVENT',
    'ABSOLVES','ABSOLVEZ','ABSOLVIEZ','ABSOLVIONS','ABSOLVONS','ABSOUTES','ABSOUTS'])

add_irr('RESOUDRE',['RESOLVAIT','RESOLVAIENT','RESOLVAIS','RESOLVANT','RESOLVE','RESOLVENT',
    'RESOLVES','RESOLVEZ','RESOLVIEZ','RESOLVIONS','RESOLVONS','RESOUTE','RESOUTES'])

add_irr('ECHOIR',['ECHOIE','ECHOIENT','ECHOYAIT','ECHOYAIENT','ECHOYANT','ECHERRAIENT','ECHERRONT'])
add_irr('DECHOIR',['DECHOYAIT','DECHOYAIENT','DECHOYAIS','DECHOYANT','DECHOYONS','DECHOYEZ','DECHOYIEZ','DECHOYIONS',
    'DECHERRAIENT','DECHERRONT','DECHERRAI','DECHERRAIS','DECHERRIONS','DECHERRIEZ','DECHERRONS','DECHUT','DECHUTES'])

add_irr('BRAIRE',['BRAIENT'])

add_irr('FOUTRE',['FOUT'])

add_irr('VIVRE',['VIVONS','VIVEZ','VIVENT',
    'VIVAIS','VIVAIT','VIVIONS','VIVIEZ','VIVAIENT',
    'VECUS','VECUT','VECUMES','VECUTES','VECURENT',
    'VIVRAI','VIVRAS','VIVRA','VIVRONS','VIVREZ','VIVRONT',
    'VIVRAIS','VIVRAIT','VIVRIONS','VIVRIEZ','VIVRAIENT',
    'VIVE','VIVES','VIVENT',
    'VECUSSE','VECUSSES','VECUSSIONS','VECUSSIEZ','VECUSSENT','VECU','VIVANT'])

add_irr('SUIVRE',['SUIT','SUIVONS','SUIVEZ','SUIVENT',
    'SUIVAIS','SUIVAIT','SUIVIONS','SUIVIEZ','SUIVAIENT',
    'SUIVIS','SUIVIT','SUIVIMES','SUIVITES','SUIVIRENT',
    'SUIVRAI','SUIVRAS','SUIVRA','SUIVRONS','SUIVREZ','SUIVRONT',
    'SUIVRAIS','SUIVRAIT','SUIVRIONS','SUIVRIEZ','SUIVRAIENT',
    'SUIVE','SUIVES','SUIVENT',
    'SUIVISSE','SUIVI','SUIVANT'])

add_irr('ENVOYER',['ENVERRAI','ENVERRAS','ENVERRA','ENVERRONS','ENVERREZ','ENVERRONT',
    'ENVERRAIS','ENVERRAIT','ENVERRIONS','ENVERRIEZ','ENVERRAIENT'])

add_irr('RENVOYER',['RENVERRA','RENVERRAI','RENVERRAS','RENVERRONS','RENVERREZ','RENVERRONT',
    'RENVERRAIS','RENVERRAIT','RENVERRIONS','RENVERRIEZ','RENVERRAIENT'])

add_irr('AVOIR',['EU','EUE'])

add_irr('RIRE',['RI','RIS','RIT','RIONS','RIEZ','RIENT',
    'RIAIS','RIAIT','RIIONS','RIIEZ','RIAIENT',
    'RIMES','RITES','RIRENT','RISSE','RIANT'])

add_irr('VAINCRE',['VAINC','VAINQUONS','VAINQUEZ','VAINQUAIS','VAINQUAIT',
    'VAINQUIONS','VAINQUIEZ','VAINQUAIENT','VAINQUANT',
    'VAINQUE','VAINQUES','VAINQUENT',
    'VAINQUIS','VAINQUIT','VAINQUIMES','VAINQUITES','VAINQUIRENT',
    'VAINQUISSE','VAINQUISSES','VAINQUISSIONS','VAINQUISSIEZ','VAINQUISSENT'])

add_irr('ASSEOIR',['ASSIEDS','ASSIED','ASSEYONS','ASSEYEZ',
    'ASSEYAIS','ASSEYAIT','ASSEYIONS','ASSEYIEZ','ASSEYAIENT',
    'ASSOYAIS','ASSOYAIT','ASSOYIONS','ASSOYIEZ','ASSOYAIENT','ASSOYONS','ASSOYEZ','ASSOYANT',
    'ASSEYE','ASSEYES','ASSEYANT',
    'ASSIERAI','ASSIERAIS','ASSIERIEZ','ASSIERIONS','ASSIERAIENT'])

add_irr('RASSEOIR',['RASSIEDS','RASSIED','RASSEYONS','RASSEYEZ',
    'RASSEYAIS','RASSEYAIT','RASSEYIONS','RASSEYIEZ','RASSEYAIENT',
    'RASSOYAIS','RASSOYAIT','RASSOYIONS','RASSOYIEZ','RASSOYAIENT','RASSOYONS','RASSOYEZ','RASSOYANT',
    'RASSEYE','RASSEYES','RASSEYENT','RASSEYANT'])

add_irr('POURVOIR',['POURVOYAIS','POURVOYAIT','POURVOYIONS','POURVOYIEZ','POURVOYAIENT',
    'POURVOYONS','POURVOYEZ','POURVOYANT'])

add_irr('SURSOIR',['SURSOYAIS','SURSOYAIT','SURSOYIONS','SURSOYIEZ','SURSOYAIENT',
    'SURSOYONS','SURSOYEZ','SURSOYANT'])

add_irr('FUIR',['FUYAIS','FUYAIT','FUYIONS','FUYIEZ','FUYAIENT','FUYONS','FUYEZ','FUYANT'])

add_irr('ATTRAIRE',['ATTRAYAIS','ATTRAYAIT','ATTRAYIONS','ATTRAYIEZ','ATTRAYAIENT',
    'ATTRAYONS','ATTRAYEZ'])

add_irr('EXTRAIRE',['EXTRAYAIS','EXTRAYAIT','EXTRAYIONS','EXTRAYIEZ','EXTRAYAIENT',
    'EXTRAYONS','EXTRAYEZ','EXTRAYANT'])

add_irr('BRUIRE',['BRUYAIS','BRUYAIT','BRUYIONS','BRUYIEZ','BRUYAIENT'])

add_irr('VETIR',['VET','VETE','VETIS','VETIT','VETENT','VETANT'])

add_irr('GAGWOMAN',['GAGWOMEN','GAGWOMANS'])
add_irr('JAZZWOMAN',['JAZZWOMEN','JAZZWOMANS'])
add_irr('GIPSY',['GIPSIES'])
add_irr('PINZUTU',['PINZUTI'])
add_irr('VEVEYSAN',['VEVEYSANNE','VEVEYSANNES'])
add_irr('GOUROU',['GOUROUTE','GOUROUTES'])
add_irr('LOUPIOTE',['LOUPIOTTE','LOUPIOTTES'])
add_irr('BOSCOT',['BOSCOTTE','BOSCOTTES'])
add_irr('MAIGRIOT',['MAIGRIOTTE','MAIGRIOTTES'])

add_irr('CONNAITRE',['CONNAIS','CONNAIT',
    'CONNUS','CONNUT','CONNUMES','CONNUTES','CONNURENT',
    'CONNAITRAI','CONNAITRAS','CONNAITRA','CONNAITRONS','CONNAITREZ','CONNAITRONT',
    'CONNAITRAIS','CONNAITRAIT','CONNAITRIONS','CONNAITRIEZ','CONNAITRAIENT',
    'CONNU','CONNAISSANT'])

add_irr('NAITRE',['NAIS','NAIT',
    'NAQUIS','NAQUIT','NAQUIMES','NAQUITES','NAQUIRENT',
    'NAITRAI','NAITRAS','NAITRA','NAITRONS','NAITREZ','NAITRONT',
    'NAITRAIS','NAITRAIT','NAITRIONS','NAITRIEZ','NAITRAIENT',
    'NAISSE','NAISSES','NAISSENT',
    'NAQUISSE','NAQUISSES','NAQUISSIONS','NAQUISSIEZ','NAQUISSENT',
    'NE','NAISSANT'])

add_irr('SURSEOIR',['SURSISE'])

add_irr('EQUIVALOIR',['EQUIVAUX','EQUIVAUT','EQUIVALONS','EQUIVALEZ','EQUIVALENT',
    'EQUIVALAIS','EQUIVALAIT','EQUIVALIONS','EQUIVALIEZ','EQUIVALAIENT',
    'EQUIVAUDRAI','EQUIVAUDRAS','EQUIVAUDRA','EQUIVAUDRONS','EQUIVAUDREZ','EQUIVAUDRONT',
    'EQUIVAUDRAIS','EQUIVAUDRAIT','EQUIVAUDRIONS','EQUIVAUDRIEZ','EQUIVAUDRAIENT',
    'EQUIVAILLE','EQUIVAILLES','EQUIVAILLENT','EQUIVALANT','EQUIVALU'])

add_irr('PLAIRE',['PLUMES','PLUTES','PLUSSIEZ','PLUSSENT','PLUSSIONS'])

add_irr('ASSEOIR',['ASSIERA','ASSIERAS','ASSIERONS','ASSIEREZ','ASSIERONT','ASSIERAIT'])
add_irr('RASSEOIR',['RASSIERA','RASSIERAS','RASSIERONS','RASSIEREZ','RASSIERONT','RASSIERAIT'])

add_irr('DORMIR',['DORT'])

add_irr('ELIRE',['ELUT','ELUTES','ELURENT','ELUSSIEZ','ELUSSIONS','ELUSSENT'])

add_irr('EMOUVOIR',['EMUT','EMUTES','EMURENT','EMUSSE','EMUSSIEZ','EMUSSIONS','EMUSSENT'])

add_irr('REBOIRE',['REBU','REBUE','REBUES'])

add_irr('ABSOUDRE',['ABSOLUS','ABSOLUT','ABSOLUMES','ABSOLUTES','ABSOLURENT','ABSOLUSSE','ABSOLUSSIONS','ABSOLUSSIEZ','ABSOLUSSENT'])

add_irr('ACCROITRE',['ACCRUS','ACCRUT','ACCRUMES','ACCRUTES','ACCRURENT','ACCRUSSENT','ACCRUSSIEZ','ACCRUSSIONS'])

add_irr('DECROITRE',['DECRUS','DECRUT','DECRUMES','DECRUTES','DECRURENT','DECRUSSENT','DECRUSSIEZ','DECRUSSIONS'])

add_irr('ASSAILLIR',['ASSAILLE','ASSAILLES','ASSAILLENT'])
add_irr('DEFAILLIR',['DEFAILLE','DEFAILLES','DEFAILLENT'])

add_irr('APERCEVOIR',['APERCOIS','APERCOIT','APERCEVONS','APERCEVEZ','APERCOIVENT',
    'APERCEVAIS','APERCEVAIT','APERCEVIONS','APERCEVIEZ','APERCEVAIENT',
    'APERCUS','APERCUT','APERCUMES','APERCUTES','APERCURENT',
    'APERCEVRAI','APERCEVRAIS','APERCEVRA','APERCEVRONS','APERCEVREZ','APERCEVRONT',
    'APERCEVRAIT','APERCEVRIONS','APERCEVRIEZ','APERCEVRAIENT',
    'APERCOIVE','APERCOIVES','APERCEVANT','APERCU','APERCUE','APERCUES','APERCUS'])

add_irr('GRAFF',['GRAFS'])

add_irr('SUIVRE',['SUIT','SUIVI','SUIVIE','SUIVIES','SUIVIS'])

add_irr('ACCOURIR',['ACCOURE','ACCOURES','ACCOURUT','ACCOURUIT'])

# Entries added in v4.21 batch (sync with common.js)
add_irr('PARAITRE',['PARUS','PARUT','PARUMES','PARUTES','PARURENT','PARUSSENT','PARUSSIEZ','PARUSSIONS'])
add_irr('APPARAITRE',['APPARU','APPARUS','APPARUT','APPARUMES','APPARUTES','APPARURENT','APPARUSSENT','APPARUSSIEZ'])
add_irr('PLAIRE',['PLU','PLUS','PLUT'])
add_irr('CONCEVOIR',['CONCOIS','CONCOIT','CONCEVONS','CONCEVEZ','CONCOIVENT',
  'CONCEVAIS','CONCEVAIT','CONCEVIONS','CONCEVIEZ','CONCEVAIENT',
  'CONCUS','CONCUT','CONCUMES','CONCUTES','CONCURENT',
  'CONCOIVE','CONCOIVES','CONCEVANT','CONCU','CONCUE','CONCUES'])
add_irr('DECEVOIR',['DECOIS','DECOIT','DECEVONS','DECEVEZ','DECOIVENT',
  'DECEVAIS','DECEVAIT','DECEVIONS','DECEVIEZ','DECEVAIENT',
  'DECUS','DECUT','DECUMES','DECUTES','DECURENT',
  'DECOIVE','DECOIVES','DECEVANT','DECU','DECUE','DECUES'])
add_irr('COUVRIR',['COUVERT','COUVERTE','COUVERTES','COUVERTS'])
add_irr('OUVRIR',['OUVERT','OUVERTE','OUVERTES','OUVERTS'])
add_irr('OFFRIR',['OFFERT','OFFERTE','OFFERTES','OFFERTS'])
add_irr('SOUFFRIR',['SOUFFERT','SOUFFERTE','SOUFFERTES','SOUFFERTS'])
add_irr('DISSOUDRE',['DISSOLVE','DISSOLVES','DISSOLVENT',
  'DISSOLVAIS','DISSOLVAIT','DISSOLVIONS','DISSOLVIEZ','DISSOLVAIENT',
  'DISSOLVONS','DISSOLVEZ','DISSOLVANT','DISSOUTE','DISSOUTES','DISSOUTS'])
add_irr('DORMIR',['DORS','DORME','DORMES','DORMENT'])
add_irr('RENDORMIR',['RENDORS','RENDORT','RENDORME','RENDORMES','RENDORMENT'])
add_irr('RELIRE',['RELU','RELUE','RELUES','RELUS'])
add_irr('ELIRE',['ELU','ELUE','ELUES','ELUS'])
add_irr('DEVOIR',['DUSSENT','DUSSES','DUSSIEZ','DUSSIONS'])
add_irr('POUVOIR',['PUSSENT','PUSSES','PUSSIEZ','PUSSIONS'])
add_irr('VIVRE',['VECU','VECUE','VECUES','VECUS'])
add_irr('VOULOIR',['VOULUE','VOULUES'])
add_irr('EQUIVALOIR',['EQUIVALUE','EQUIVALUES','EQUIVALUS'])
add_irr('APERCEVOIR',['APERCUSSE','APERCUSSES','APERCUSSENT','APERCUSSIONS','APERCUSSIEZ'])
add_irr('ACQUERIR',['ACQUIERS','ACQUIERT','ACQUIERENT','ACQUIERE','ACQUIERES','ACQUIT','ACQUIRENT'])
add_irr('CONQUERIR',['CONQUIERS','CONQUIERT','CONQUIERENT','CONQUIERE','CONQUIERES','CONQUIT','CONQUIRENT'])
add_irr('REQUERIR',['REQUIERS','REQUIERT','REQUIERENT','REQUIERE','REQUIERES','REQUIT','REQUIRENT'])
add_irr('ENQUERIR',['ENQUIERS','ENQUIERT','ENQUIERENT','ENQUIERE','ENQUIERES','ENQUIT','ENQUIRENT'])
add_irr('SERVIR',['SERS','SERT','SERVE','SERVES','SERVENT'])
add_irr('SENTIR',['SENS','SENT','SENTE','SENTES','SENTENT'])
add_irr('PARTIR',['PARS','PART','PARTE','PARTES','PARTENT'])
add_irr('RESSENTIR',['RESSENS','RESSENT','RESSENTE','RESSENTENT'])
add_irr('REMOUDRE',['REMOULU','REMOULUE','REMOULUES','REMOULUS'])
add_irr('EMOUDRE',['EMOULU','EMOULUE','EMOULUES','EMOULUS'])
add_irr('COUDRE',['COUSIS','COUSIT','COUSITES'])

add_irr('DISSOUDRE',['DISSOLUS','DISSOLUT','DISSOLUMES','DISSOLUTES','DISSOLURENT',
  'DISSOLUSE','DISSOLUSES','DISSOLUSIONS','DISSOLUSIEZ','DISSOLUSSENT'])
add_irr('PLAIRE',['PLUSSES','REPLURENT'])
add_irr('LIRE',['LUE','LUES','LUS'])
add_irr('VALOIR',['VALU','VALUE','VALUES','VALUS'])
add_irr('AVOIR',['EUES'])
add_irr('OINDRE',['OIGNIS','OIGNIT','OIGNIMES','OIGNITES','OIGNIRENT'])
add_irr('ACCROITRE',['ACCRUSSE','ACCRUSSES','ACCRUSSENT','ACCRUSSIEZ','ACCRUSSIONS'])
add_irr('ASSEOIR',['ASSEYENT'])
add_irr('PERCEVOIR',['PERCOIS','PERCOIT','PERCEVONS','PERCEVEZ','PERCOIVENT',
  'PERCEVAIS','PERCEVAIT','PERCEVIONS','PERCEVIEZ','PERCEVAIENT',
  'PERCU','PERCUE','PERCUES','PERCUS',
  'PERCUSSE','PERCUSSES','PERCUSSENT','PERCUSSIEZ','PERCUSSIONS',
  'PERCUTES','PERCOIVE','PERCOIVES','PERCEVANT'])
add_irr('CONCEVOIR',['CONCUSSE','CONCUSSES','CONCUSSENT','CONCUSSIEZ','CONCUSSIONS'])
add_irr('EQUIVALOIR',['EQUIVALUT','EQUIVALUS'])
add_irr('SECOURIR',['SECOURUS','SECOURUT','SECOURUMES','SECOURUTES','SECOURURENT'])
add_irr('ECHOIR',['ECHUT','ECHUMES','ECHUTES','ECHURENT'])
add_irr('POURVOIR',['POURVUT','POURVUMES','POURVUTES','POURVURENT'])

add_irr('VOIR',['VIS','VIT'])
add_irr('RESOUDRE',['RESOLUS','RESOLUT','RESOLUMES','RESOLUTES','RESOLURENT'])
add_irr('POURVOIR',['POURVUE','POURVUES','POURVUS'])
add_irr('COUDRE',['COUSU','COUSUE','COUSUES','COUSUS'])
add_irr('ENQUERIR',['ENQUIS','ENQUISE','ENQUISES'])
add_irr('CONQUERIR',['CONQUIS','CONQUISE','CONQUISES'])
add_irr('PERCEVOIR',['PERCURENT'])
add_irr('DECROITRE',['DECRU'])
add_irr('EMOUDRE',['EMOULUT'])
add_irr('PROMOUVOIR',['PROMEUVENT','PROMEUVES'])
add_irr('RESSORTIR',['RESSORS','RESSORT'])
add_irr('ROUVRIR',['ROUVERT','ROUVERTE','ROUVERTES','ROUVERTS'])
add_irr('ENTROUVRIR',['ENTROUVERT','ENTROUVERTE','ENTROUVERTES','ENTROUVERTS'])
add_irr('PRESSENTIR',['PRESSENS','PRESSENTE'])
add_irr('POLICEWOMAN',['POLICEWOMEN'])
add_irr('POURSUIVRE',['POURSUIS'])
add_irr('RECROITRE',['RECRUT','RECRUS'])
add_irr('DECHOIR',['DECHERREZ','DECHERRONT','DECHERRAS','DECHERRONS'])
add_irr('BAS',['BASSE','BASSES'])
add_irr('SURGRAS',['SURGRASSE','SURGRASSES'])
add_irr('SEIGNEUR',['SEIGNEURESSE','SEIGNEURESSES'])
add_irr('COACQUEREUR',['COACQUERESSE','COACQUERESSES'])

# GRAF/GRAFF synonymes, SERINGUEIRA féminin, CONTREFICHER pp, REPLEUVOIR
add_irr('GRAF',['GRAFF','GRAFS'])
add_irr('SERINGUEIRO',['SERINGUEIRA','SERINGUEIRAS'])
add_irr('CONTREFICHE',['CONTREFICHER','CONTREFICHU','CONTREFICHUE','CONTREFICHUES','CONTREFICHUS'])
add_irr('REPLEUVOIR',['REPLUSSENT','REPLUT'])

# ── Step 4: Build _conjMap (adds to BOTH conjMap and irr) ────────────────────
conj = {}

def add_conj(inf, forms):
    for f in forms:
        conj[f] = inf
        irr[f] = inf

add_conj('ABSOUDRE',['ABSOUT'])
add_conj('BOIRE',['BUMES','BURENT','BUSSE','BUSSIEZ'])
add_conj('BOUILLIR',['BOUS'])
add_conj('BRAIRE',['BRAIT'])
add_conj('CHOIR',['CHERRONT','CHU','CHUMES'])
add_conj('COMPLAIRE',['COMPLUMES'])
add_conj('CONCEVOIR',['CONCUMES','CONCURENT','CONCUSSE','CONCUT'])
add_conj('COUDRE',['COUSE','COUSIMES','COUSIRENT'])
add_conj('DEBOUILLIR',['DEBOUS'])
add_conj('DECEVOIR',['DECUMES','DECURENT','DECUSSE','DECUT'])
add_conj('DECHOIR',['DECHERRA','DECHET','DECHUMES'])
add_conj('DECOUDRE',['DECOUSE','DECOUSIMES','DECOUSIRENT'])
add_conj('DEMENTIR',['DEMENS'])
add_conj('DEPLAIRE',['DEPLURENT'])
add_conj('DEPRENDRE',['DEPRIRENT','DEPRISSE'])
add_conj('DISSOUDRE',['DISSOUT'])
add_conj('ECHOIR',['ECHEENT','ECHERRA','ECHET','ECHU'])
add_conj('ELIRE',['ELUMES','ELUSSE'])
add_conj('EMBOIRE',['EMBUMES','EMBUSSE'])
add_conj('EMOUDRE',['EMOULE','EMOULUMES'])
add_conj('EMOUVOIR',['EMEUT','EMEUVE','EMUMES'])
add_conj('FLEURIR',['FLORISSAIS','FLORISSIEZ'])
add_conj('LIRE',['LUMES','LURENT','LUSSE'])
add_conj('MENTIR',['MENS'])
add_conj('MOUDRE',['MOULUMES','MOULUSSE'])
add_conj('MOUVOIR',['MEUS','MEUT','MEUVE','MUMES','MUT'])
add_conj('NAITRE',['NAQUIMES'])
add_conj('OINDRE',['OIGNE'])
add_conj('OUIR',['OIENT','OIS','OIT','OYAIENT','OYEZ'])
add_conj('PAITRE',['PAIS','PAISSE','PAIT'])
add_conj('PERCEVOIR',['PERCUMES','PERCUT'])
add_conj('PLAIRE',['PLURENT','PLUSSE'])
add_conj('PROMOUVOIR',['PROMEUS','PROMUMES'])
add_conj('RAIRE',['RAIT'])
add_conj('REBOIRE',['REBUMES','REBUSSE'])
add_conj('RECEVOIR',['RECUMES','RECUSSE'])
add_conj('RECOUDRE',['RECOUSE','RECOUSIMES','RECOUSIRENT'])
add_conj('REDEVOIR',['REDU','REDUMES','REDURENT'])
add_conj('RELIRE',['RELUMES','RELURENT'])
add_conj('REMOUDRE',['REMOULUT'])
add_conj('RENAITRE',['RENAQUIS','RENE'])
add_conj('REPAITRE',['REPAIS','REPUMES'])
add_conj('RESOUDRE',['RESOUT'])
add_conj('RETRAIRE',['RETRAIE','RETRAYAIS','RETRAYEZ'])
add_conj('REVALOIR',['REVAILLE'])
add_conj('SAVOIR',['SUMES','SURENT','SUSSE','SUTES'])
add_conj('TAIRE',['TUMES','TURENT','TUSSE','TUSSIONS','TUT','TUTES'])
add_conj('TRAIRE',['TRAIE','TRAYAIS','TRAYEZ'])
add_conj('VALOIR',['VAILLE'])

print(f"  irregMap: {len(irr)} entries, conjMap: {len(conj)} entries", flush=True)

# ── Step 5: _VERB_PREFIXES ────────────────────────────────────────────────────
VERB_PREFIXES = ['RESSOU','DISCON','CIRCON','ENTRA','AUTO','APPAR','MAIN','ENTRE','CONTRE','INTER','TRANS','CODE','REDE','SOUS','TRES','SATIS','POUR','PAR','SUR','ABS','SUB','SOU','CON','COM','PRE','PRO','DIS','OB','MES','RE','DE','DES','EN','EM','AD','AB']

# ── Step 6: _xchk ────────────────────────────────────────────────────────────
def _xchk(stem, cm_set):
    # -IGN → -INDRE
    if stem.endswith('IGN') and len(stem) > 3:
        c = stem[:-3] + 'INDRE'
        if c in cm_set: return c
    # -IGNI → -INDRE
    if stem.endswith('IGNI') and len(stem) > 5:
        c = stem[:-4] + 'INDRE'
        if c in cm_set: return c
    # -S → -RE
    if stem.endswith('S') and len(stem) > 2:
        c = stem[:-1] + 'RE'
        if c in cm_set: return c
    # -T → -RE
    if stem.endswith('T') and len(stem) > 2:
        c = stem[:-1] + 'RE'
        if c in cm_set: return c
    # -TE → -RE
    if stem.endswith('TE') and len(stem) > 3:
        c = stem[:-2] + 'RE'
        if c in cm_set: return c
    # -V → -RE
    if stem.endswith('V') and len(stem) > 2:
        c = stem[:-1] + 'RE'
        if c in cm_set: return c
    # -R → -OIR
    if stem.endswith('R') and len(stem) > 2:
        c = stem[:-1] + 'OIR'
        if c in cm_set: return c
    # -RI → -OIR
    if stem.endswith('RI') and len(stem) > 3:
        c = stem[:-2] + 'OIR'
        if c in cm_set: return c
    # -I (double) → -RE
    if stem.endswith('I') and len(stem) > 3:
        c = stem[:-2] + 'RE'
        if c in cm_set: return c
    # stem + ENDRE
    if stem + 'ENDRE' in cm_set: return stem + 'ENDRE'
    # stem + DRE
    if stem + 'DRE' in cm_set: return stem + 'DRE'
    # -NN → -N+DRE or bare
    if stem.endswith('NN') and len(stem) > 2:
        c = stem[:-1] + 'DRE'
        if c in cm_set: return c
        if stem[:-1] in cm_set: return stem[:-1]
    # -LL → -L
    if stem.endswith('LL') and len(stem) > 2:
        if stem[:-1] in cm_set: return stem[:-1]
    # -TT → -T
    if stem.endswith('TT') and len(stem) > 2:
        if stem[:-1] in cm_set: return stem[:-1]
    # stem + URE
    if stem + 'URE' in cm_set: return stem + 'URE'
    # -L → -UDRE
    if stem.endswith('L') and len(stem) > 2:
        c = stem[:-1] + 'UDRE'
        if c in cm_set: return c
    # stem + ERIR
    if stem + 'ERIR' in cm_set: return stem + 'ERIR'
    # stem + OIR
    if stem + 'OIR' in cm_set: return stem + 'OIR'
    # stem + AITRE
    if stem + 'AITRE' in cm_set: return stem + 'AITRE'
    # -U → -AITRE
    if stem.endswith('U') and len(stem) > 2:
        c = stem[:-1] + 'AITRE'
        if c in cm_set: return c
    # -E → bare
    if stem.endswith('E') and len(stem) > 2 and stem[:-1] in cm_set:
        return stem[:-1]
    return None

# ── Step 7: _getInflMap (simplified — for BS_ALL words that are inflected forms) ──
# In the real code, this maps canonical inflected forms → their lemma via the e[] array.
# We can't easily replicate this without the full e[] array, but findLemma() only uses
# im.has(w) which would be very specific. For our simulation, we'll skip it since
# inflected forms in BS_ALL that are in cm_set will be caught by cm_set.has(w) first.
# Actually we need to build it properly. Let's use the e[] array.
im = {}  # inflected_canon → base_canon
if 'e' in data:
    E = data['e']
    C = data['c']
    # resolveInflectedCanon is complex; use a simple approximation:
    # For entries where e[i] has a comma, the inflected canonical is the base canon + suffix
    # We approximate by: find entries in C where C[i] appears later as a base canon
    # Actually, the inflMap maps the resolved inflected word → base canon
    # We'll build a best-effort version
    for i in range(len(C)):
        ei = E[i] if i < len(E) else ''
        if ei and ',' in ei:
            # Try to build the inflected form: canon + second part stripped of spaces
            base_canon = C[i]
            parts = ei.split(',')
            suf = parts[1].strip().replace('*','').strip()
            # Simple: append suffix to base, check if in C
            candidate = base_canon + suf
            if candidate in cm_set and candidate not in im:
                im[candidate] = base_canon

print(f"  inflMap: {len(im)} entries built.", flush=True)

# ── Step 8: findLemma() ──────────────────────────────────────────────────────
ER_FUTURE = {'ERAI','ERAS','ERA','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERENT','ERIONS','ERIEZ','ERAIENT'}
VERB_SFXS = {
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    'ISSAIENT','ISSAIT','ISSAIS','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    'AIENT','ERENT','IRENT','ATES','AMES','UMES','UTES','AT','AIT','AIS','IONS','IEZ',
    'ANT','ONS','ENT','EZ','IT','AI','AS','A','ES','IMES','ITES',
    'URENT',
}
strips = [
    'ASSENT','ASSIEZ','ASSIONS','ASSES','ASSE',
    'USSENT','USSIEZ','USSIONS','USSES','USSE',
    'ISSAIENT','ISSAIT','ISSAIS','ISSANT','ISSONS','ISSEZ','ISSENT','ISSIEZ','ISSIONS','ISSES','ISSE',
    'AIENT','ANT','ERENT','IRENT','ERAIENT','ERIONS','ERIEZ','ERONT','EREZ','ERONS','ERAIT','ERAIS','ERAI',
    'ATES','AMES','UMES','UTES','AT','IMES','ITES',
    'AIT','AIS','IONS','IEZ','ONS','ONT','ENT','EZ','AI',
    'IT','EAUX','AUX',
    'AS','A','ERA','ERAS','ES','S','X',
    'URENT',
]

def findLemma(w):
    if not w:
        return None
    # 1. Direct canon lookup
    if w in cm_set:
        return w
    # 2. inflMap
    if w in im:
        return im[w]
    # 3. irregMap
    if w in irr:
        inf = irr[w]
        if inf in cm_set:
            return inf
    # 4. Compound prefix loop
    for pfx in VERB_PREFIXES:
        if not w.startswith(pfx) or len(w) <= len(pfx) + 2:
            continue
        rest = w[len(pfx):]
        if rest in irr:
            base_inf = irr[rest]
            compound = pfx + base_inf
            if compound in cm_set:
                return compound
    # 5. Feminine PP: -EES/-EE/-IES/-IE
    for sfx, vs in [('EES',['ER']),('EE',['ER']),('IES',['IR','ER']),('IE',['IR','ER'])]:
        if w.endswith(sfx) and len(w) > len(sfx) + 1:
            st = w[:-len(sfx)]
            for v in vs:
                if st + v in cm_set:
                    return st + v
    # 6. -EINDRE/-OINDRE/-AINDRE/-TENIR/-VENIR block
    for sfx, add in [
        ('EINTS','EINDRE'),('EINT','EINDRE'),('EINS','EINDRE'),('EINTES','EINDRE'),('EINTE','EINDRE'),
        ('OINTS','OINDRE'),('OINT','OINDRE'),('OINS','OINDRE'),('OINTES','OINDRE'),('OINTE','OINDRE'),
        ('AINTS','AINDRE'),('AINT','AINDRE'),('AINS','AINDRE'),('AINTES','AINDRE'),('AINTE','AINDRE'),
        ('INTS',None),('INT',None),('INS','ENIR'),
    ]:
        if not w.endswith(sfx) or len(w) <= len(sfx):
            continue
        st = w[:-len(sfx)]
        if add:
            if st + add in cm_set:
                return st + add
        else:
            if st + 'ENIR' in cm_set:   return st + 'ENIR'
            if st + 'EINDRE' in cm_set: return st + 'EINDRE'
            if st + 'INDRE' in cm_set:  return st + 'INDRE'
    # 7. Pluriel simple en -S
    if w.endswith('S') and len(w) > 2:
        bare = w[:-1]
        if bare in cm_set:
            return bare
    # 8. Strips loop
    for s in strips:
        if not w.endswith(s):
            continue
        stem = w[:-len(s)]
        if len(stem) < 2:
            continue
        if s in ER_FUTURE:
            if stem + 'ER' in cm_set: return stem + 'ER'
            if stem + 'IR' in cm_set: return stem + 'IR'
            if stem + 'RE' in cm_set: return stem + 'RE'
            if stem.endswith('OIE') and stem[:-3] + 'OYER' in cm_set: return stem[:-3] + 'OYER'
            if stem.endswith('AIE') and stem[:-3] + 'AYER' in cm_set: return stem[:-3] + 'AYER'
            if stem.endswith('UIE') and stem[:-3] + 'UYER' in cm_set: return stem[:-3] + 'UYER'
            if stem.endswith('OI') and stem[:-2] + 'OYER' in cm_set: return stem[:-2] + 'OYER'
            if stem.endswith('AI') and stem[:-2] + 'AYER' in cm_set: return stem[:-2] + 'AYER'
            if stem.endswith('UI') and stem[:-2] + 'UYER' in cm_set: return stem[:-2] + 'UYER'
            if (stem.endswith('LL') or stem.endswith('TT')) and stem[:-1] + 'ER' in cm_set: return stem[:-1] + 'ER'
            if (stem.endswith('LL') or stem.endswith('TT')) and stem[:-1] + 'IR' in cm_set: return stem[:-1] + 'IR'
            if stem.endswith('RR') and stem[:-1] + 'IR' in cm_set: return stem[:-1] + 'IR'
            if stem.endswith('RR') and stem[:-1] + 'RE' in cm_set: return stem[:-1] + 'RE'
            r = _xchk(stem, cm_set)
            if r: return r
            if stem + 'E' in cm_set: return stem + 'E'
        if s in VERB_SFXS:
            if stem + 'ER' in cm_set:    return stem + 'ER'
            if stem + 'IR' in cm_set:    return stem + 'IR'
            if stem + 'RE' in cm_set:    return stem + 'RE'
            if stem + 'ETTRE' in cm_set: return stem + 'ETTRE'
            if stem + 'ITRE' in cm_set:  return stem + 'ITRE'
            if stem + 'AYER' in cm_set:  return stem + 'AYER'  # FRAYER (FRAIENT→FR→FRAYER not FRIRE)
            if stem + 'IRE' in cm_set:   return stem + 'IRE'
            if stem.endswith('E') and len(stem) > 2 and stem[:-1] + 'ER' in cm_set: return stem[:-1] + 'ER'
            if stem.endswith('I') and stem + 'R' in cm_set: return stem + 'R'
            if stem.endswith('OIE') and stem[:-3] + 'OYER' in cm_set: return stem[:-3] + 'OYER'
            if stem.endswith('AIE') and stem[:-3] + 'AYER' in cm_set: return stem[:-3] + 'AYER'
            if stem.endswith('UIE') and stem[:-3] + 'UYER' in cm_set: return stem[:-3] + 'UYER'
            if stem.endswith('OI') and stem[:-2] + 'OYER' in cm_set: return stem[:-2] + 'OYER'
            if stem.endswith('AI') and stem[:-2] + 'AYER' in cm_set: return stem[:-2] + 'AYER'
            if stem.endswith('UI') and stem[:-2] + 'UYER' in cm_set: return stem[:-2] + 'UYER'
            if (stem.endswith('LL') or stem.endswith('TT')) and stem[:-1] + 'ER' in cm_set: return stem[:-1] + 'ER'
            if (stem.endswith('LL') or stem.endswith('TT')) and stem[:-1] + 'IR' in cm_set: return stem[:-1] + 'IR'
            if stem.endswith('RR') and stem[:-1] + 'IR' in cm_set: return stem[:-1] + 'IR'
            if stem.endswith('U') and len(stem) > 2:
                su = stem[:-1]
                if su + 'IR' in cm_set: return su + 'IR'
                if su + 'RE' in cm_set: return su + 'RE'
            if stem.endswith('I') and len(stem) > 2:
                if stem + 'R' in cm_set: return stem + 'R'
                if stem[:-1] + 'RE' in cm_set: return stem[:-1] + 'RE'
            r = _xchk(stem, cm_set)
            if r: return r
        # Fall through
        if stem in cm_set: return stem
        if stem in im: return im[stem]
        if s == 'AUX' and stem + 'AL' in cm_set: return stem + 'AL'
        if s == 'EAUX' and stem + 'EAU' in cm_set: return stem + 'EAU'
        if stem + 'ER' in cm_set: return stem + 'ER'
        if stem + 'IR' in cm_set: return stem + 'IR'
        if stem + 'RE' in cm_set: return stem + 'RE'
        if stem + 'TRE' in cm_set: return stem + 'TRE'
        if stem + 'E' in cm_set:  return stem + 'E'
        if stem.endswith('I') and len(stem) > 2:
            if stem + 'R' in cm_set: return stem + 'R'
            if stem[:-1] + 'RE' in cm_set: return stem[:-1] + 'RE'
        if stem.endswith('U') and len(stem) > 2:
            su = stem[:-1]
            if su + 'IR' in cm_set: return su + 'IR'
            if su + 'RE' in cm_set: return su + 'RE'
        if stem.endswith('RR') and len(stem) > 2:
            if stem[:-1] + 'IR' in cm_set: return stem[:-1] + 'IR'
            if stem[:-1] + 'RE' in cm_set: return stem[:-1] + 'RE'
        r = _xchk(stem, cm_set)
        if r: return r
    # 9. Feminine forms
    for sfx, add in [
        ('EUSES','EUX'),('EUSE','EUX'),
        ('EUSES','EUR'),('EUSE','EUR'),
        ('RICES','EUR'),('RICE','EUR'),
        ('IVES','IF'),('IVE','IF'),
        ('ELLES','EL'),('ELLE','EL'),
        ('IENNES','IEN'),('IENNE','IEN'),
        ('ONNES','ON'),('ONNE','ON'),
        ('ENNES','EN'),('ENNE','EN'),
        ('LLES','L'),('LLE','L'),
        ('ANNES','AN'),('ANNE','AN'),
    ]:
        if w.endswith(sfx) and len(w) > len(sfx) + 1:
            st = w[:-len(sfx)]
            if st + add in cm_set:
                return st + add
    # 10. endsWith E
    if w.endswith('E') and len(w) > 2:
        st = w[:-1]
        if st + 'ER' in cm_set:   return st + 'ER'
        if st.endswith('OI') and st[:-2] + 'OYER' in cm_set: return st[:-2] + 'OYER'
        if st.endswith('AI') and st[:-2] + 'AYER' in cm_set: return st[:-2] + 'AYER'
        if st.endswith('UI') and st[:-2] + 'UYER' in cm_set: return st[:-2] + 'UYER'
        if st + 'IR' in cm_set:   return st + 'IR'
        if st in cm_set:        return st
        if st + 'RE' in cm_set: return st + 'RE'
        if (st.endswith('LL') or st.endswith('TT')) and st[:-1] + 'ER' in cm_set: return st[:-1] + 'ER'
        if (st.endswith('LL') or st.endswith('TT')) and st[:-1] + 'IR' in cm_set: return st[:-1] + 'IR'
        if st.endswith('U') and len(st) > 2:
            su2 = st[:-1]
            if su2 + 'IR' in cm_set: return su2 + 'IR'
            if su2 + 'RE' in cm_set: return su2 + 'RE'
        r = _xchk(st, cm_set)
        if r: return r
    # 11. endsWith U
    if w.endswith('U') and len(w) > 3:
        st = w[:-1]
        if st + 'IR' in cm_set: return st + 'IR'
        if st + 'RE' in cm_set: return st + 'RE'
        if st + 'ER' in cm_set: return st + 'ER'
        r = _xchk(st, cm_set)
        if r: return r
    # 12. endsWith I
    if w.endswith('I') and len(w) > 2:
        st = w[:-1]
        if st + 'IR' in cm_set:  return st + 'IR'
        if st + 'IRE' in cm_set: return st + 'IRE'
    # 13. w.length > 3: w+RE, w+TRE, w+IR
    if len(w) > 3:
        if w + 'RE' in cm_set:  return w + 'RE'
        if w + 'TRE' in cm_set: return w + 'TRE'
        if w + 'IR' in cm_set:  return w + 'IR'
    # 14. endsWith T
    if w.endswith('T') and len(w) > 3:
        st = w[:-1]
        if st + 'RE' in cm_set:  return st + 'RE'
        if st + 'TRE' in cm_set: return st + 'TRE'
        if st + 'DRE' in cm_set: return st + 'DRE'
        if st + 'IR' in cm_set:  return st + 'IR'
        r = _xchk(st, cm_set)
        if r: return r
    # 15. endsWith IS
    if w.endswith('IS') and len(w) > 3:
        st = w[:-2]
        if st + 'ENDRE' in cm_set: return st + 'ENDRE'
        if st + 'ETTRE' in cm_set: return st + 'ETTRE'
        if st + 'IRE' in cm_set:   return st + 'IRE'
    # 16. endsWith ISES
    if w.endswith('ISES') and len(w) > 5:
        st = w[:-4]
        if st + 'ETTRE' in cm_set: return st + 'ETTRE'
        if st + 'IRE' in cm_set:   return st + 'IRE'
        if st + 'ENDRE' in cm_set: return st + 'ENDRE'
    # 17. endsWith ISE
    if w.endswith('ISE') and len(w) > 4:
        st = w[:-3]
        if st + 'ETTRE' in cm_set: return st + 'ETTRE'
        if st + 'IRE' in cm_set:   return st + 'IRE'
        if st + 'ENDRE' in cm_set: return st + 'ENDRE'
    return None

# ── Step 9: Run simulation ───────────────────────────────────────────────────
print("\nRunning simulation...", flush=True)
resolved = 0
unresolved = []
results = {}

for w in bs_words:
    lemma = findLemma(w)
    if lemma is not None:
        resolved += 1
        results[w] = lemma
    else:
        unresolved.append(w)

total = len(bs_words)
print(f"\n=== RESULTS ===")
print(f"Total words:   {total}")
print(f"Resolved:      {resolved} ({100*resolved/total:.1f}%)")
print(f"Unresolved:    {len(unresolved)} ({100*len(unresolved)/total:.1f}%)")

# ── Step 10: Specifically check the requested words ──────────────────────────
print("\n=== SPECIFIC CHECKS ===")
specific = ['COMPLU','DEPLUT','COMPLUSSIEZ','DISPARUT','COMPARUMES','PARUT',
            'REEMISSENT','READMISE','ASSIERONT','EQUIVALU']
for w in specific:
    lemma = findLemma(w)
    in_bs = w in bs_word_set
    print(f"  {w:20s} → {lemma or 'NULL':25s}  {'[in BS_ALL]' if in_bs else '[NOT in BS_ALL]'}")

# ── Step 11: Group unknowns ───────────────────────────────────────────────────
print(f"\n=== UNRESOLVED WORDS ({len(unresolved)} total) ===")

# Group by suffix/pattern
def classify(w):
    # Try to find what kind of word it might be based on ending
    for sfx in ['USSENT','USSIONS','USSIEZ','USSES','USSE',
                'ASSENT','ASSIONS','ASSIEZ','ASSES','ASSE',
                'ISSENT','ISSIONS','ISSIEZ','ISSES','ISSE',
                'LURENT','LUTES','LUMES','LURES',
                'PURENT','PUTES','PUMES',
                'CURENT','CUTES','CUMES',
                'MURENT','MUTES','MUMES',
                'URENT','UTES','UMES',
                'AIENT','ERAIENT','IRAIENT',
                'ERONT','IRONT','EREZ','IREZ','ERONS','IRONS',
                'ERAIT','IRAIT',
                'ANT','IANT',
                'ISE','ISES','ISS',
                'EE','EES',
                'IE','IES']:
        if w.endswith(sfx):
            return f'ends-{sfx}'
    return f'ends-{w[-2:]}' if len(w) >= 2 else 'short'

groups = defaultdict(list)
for w in unresolved:
    groups[classify(w)].append(w)

# Sort groups by count
sorted_groups = sorted(groups.items(), key=lambda x: -len(x[1]))
for group, words in sorted_groups[:30]:
    examples = words[:5]
    print(f"  {group:30s} {len(words):4d}  e.g. {', '.join(examples)}")

# ── Step 12: Also show all unresolved words sorted ───────────────────────────
print(f"\n=== FULL LIST OF UNRESOLVED WORDS ===")
for w in sorted(unresolved):
    print(f"  {w}")
