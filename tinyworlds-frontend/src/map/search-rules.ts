/**
 * How a language writes addresses, as far as the search needs to know: what people type for
 * what the map calls it. A world picks one of these and adds its own local shorthand.
 */
export interface SearchRules {
  /** What "&" is read as. */
  and: string;
  /** Words replaced by digits in names and queries alike: "fifth" → "5". */
  numberWords: Record<string, string>;
  /** Strips the ordinal ending from a number: "42nd" → "42". */
  ordinal: RegExp | null;
  /**
   * A query word also matches as any of these. An entry starting with "=" must be a whole word
   * of the name ("=xv" finds "XV" but not "Xavier"); the others may also start one.
   */
  abbreviations: Record<string, string[]>;
  /** Small words left out when a name is reduced to its initials. */
  initialsSkip: string[];
  /**
   * Articles and prepositions written onto the next word with an apostrophe ("d'Octubre",
   * "l'Ajuntament"): the first group is kept as a word of its own, so the word after it can be
   * found. Without this the apostrophe is simply dropped ("Patrick's" → "patricks").
   */
  elision?: RegExp;
}

export const EN_RULES: SearchRules = {
  and: "and",
  numberWords: {
    first: "1",
    second: "2",
    third: "3",
    fourth: "4",
    fifth: "5",
    sixth: "6",
    seventh: "7",
    eighth: "8",
    ninth: "9",
    tenth: "10",
    eleventh: "11",
    twelfth: "12",
  },
  ordinal: /^(\d+)(st|nd|rd|th)$/,
  abbreviations: {
    st: ["street", "saint"],
    ave: ["avenue"],
    av: ["avenue"],
    blvd: ["boulevard"],
    pkwy: ["parkway"],
    expy: ["expressway"],
    hwy: ["highway"],
    sq: ["square"],
    pl: ["place"],
    rd: ["road"],
    dr: ["drive"],
    ct: ["court"],
    ln: ["lane"],
    ter: ["terrace"],
    pk: ["park"],
    ctr: ["center"],
    centre: ["center"],
    hts: ["heights"],
    ft: ["fort"],
    mt: ["mount"],
    w: ["west"],
    e: ["east"],
    n: ["north"],
    s: ["south"],
    mus: ["museum"],
  },
  initialsSkip: ["of", "the", "and", "at", "for", "in"],
};

const PT_CARDINALS = [
  "",
  "um",
  "dois",
  "tres",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
  "vinte",
];
const PT_ORDINALS = [
  "",
  "primeiro",
  "segundo",
  "terceiro",
  "quarto",
  "quinto",
  "sexto",
  "setimo",
  "oitavo",
  "nono",
  "decimo",
];

/** 1…39 in Roman numerals, lower case. */
export function roman(n: number): string {
  const tens = ["", "x", "xx", "xxx"][Math.floor(n / 10)] ?? "";
  const ones = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"][n % 10];
  return tens + ones;
}

/**
 * Brazilian streets are named after dates and after kings and popes: "Nove de Julho",
 * "XV de Novembro", "Pedro II", "João XXIII". Every way of writing a number finds the others,
 * as whole words only, so "9" does not also find "Novembro".
 */
function ptNumbers(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let n = 1; n <= 31; n++) {
    const forms = [String(n), roman(n)];
    if (PT_CARDINALS[n]) forms.push(PT_CARDINALS[n]);
    if (n === 14) forms.push("quatorze");
    if (n === 30) forms.push("trinta");
    // "um" is also the article; "primeiro" is how the first of the month and Pedro I are said
    if (PT_ORDINALS[n]) forms.push(PT_ORDINALS[n]);
    for (const form of forms) {
      if (form === "um") continue;
      out[form] = forms.filter((other) => other !== form).map((other) => `=${other}`);
    }
  }
  return out;
}

export const PT_RULES: SearchRules = {
  and: "e",
  numberWords: {},
  ordinal: null,
  abbreviations: {
    ...ptNumbers(),
    r: ["rua"],
    av: ["avenida"],
    avn: ["avenida"],
    al: ["alameda"],
    tv: ["travessa"],
    trav: ["travessa"],
    pc: ["praca"],
    pca: ["praca"],
    rod: ["rodovia"],
    est: ["estrada"],
    estr: ["estrada"],
    vd: ["viaduto"],
    jd: ["jardim"],
    vl: ["vila"],
    pq: ["parque"],
    pque: ["parque"],
    res: ["residencial"],
    cj: ["conjunto"],
    conj: ["conjunto"],
    cond: ["condominio"],
    dr: ["doutor"],
    dra: ["doutora"],
    prof: ["professor", "professora"],
    profa: ["professora"],
    pres: ["presidente"],
    pref: ["prefeito"],
    gov: ["governador"],
    ver: ["vereador"],
    dep: ["deputado"],
    sen: ["senador"],
    min: ["ministro"],
    des: ["desembargador"],
    eng: ["engenheiro"],
    com: ["comendador"],
    cel: ["coronel"],
    cap: ["capitao"],
    gen: ["general"],
    gal: ["general"],
    mal: ["marechal"],
    brig: ["brigadeiro"],
    maj: ["major"],
    ten: ["tenente"],
    sgt: ["sargento"],
    pe: ["padre"],
    fr: ["frei"],
    d: ["dom", "dona"],
    sta: ["santa"],
    sto: ["santo"],
    s: ["sao"],
    ns: ["nossa", "senhora"],
    hosp: ["hospital"],
    esc: ["escola"],
    univ: ["universidade"],
    shop: ["shopping"],
  },
  initialsSkip: ["de", "da", "do", "das", "dos", "e", "a", "o", "em"],
};

const ES_CARDINALS = [
  "",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidos",
  "veintitres",
  "veinticuatro",
  "veinticinco",
  "veintiseis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
  "treinta",
];
const ES_ORDINALS = [
  "",
  "primero",
  "segundo",
  "tercero",
  "cuarto",
  "quinto",
  "sexto",
  "septimo",
  "octavo",
  "noveno",
  "decimo",
];
/** Valencian numbers that turn up in street names ("Nou d'Octubre", "Primer de Maig"). */
const VA_NUMBERS: Record<number, string[]> = {
  1: ["primer"],
  3: ["tercer"],
  4: ["quatre"],
  5: ["cinc"],
  6: ["sis"],
  7: ["set"],
  8: ["huit", "vuit"],
  9: ["nou"],
};

/**
 * Spanish streets are named after dates and after kings and popes too: "9 de Julio",
 * "Primero de Mayo", "Alfonso XIII", "Jaume I". Every way of writing a number finds the others,
 * as whole words only.
 */
function esNumbers(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let n = 1; n <= 30; n++) {
    const forms = [String(n), roman(n), ES_CARDINALS[n]];
    if (ES_ORDINALS[n]) forms.push(ES_ORDINALS[n]);
    forms.push(...(VA_NUMBERS[n] ?? []));
    for (const form of forms)
      out[form] = forms.filter((other) => other !== form).map((other) => `=${other}`);
  }
  return out;
}

/**
 * The same thing in Spanish and in Valencian. Valencia's map names its streets in Valencian
 * ("Carrer de Colón", "Plaça de l'Ajuntament", "Ciutat de les Arts i les Ciències") and people
 * type either, so each word finds the other. Written as the search compares them: no accents.
 */
const ES_VA: [string, string][] = [
  ["calle", "carrer"],
  ["avenida", "avinguda"],
  ["plaza", "placa"],
  ["paseo", "passeig"],
  ["camino", "cami"],
  ["puente", "pont"],
  ["puerto", "port"],
  ["puerta", "porta"],
  ["playa", "platja"],
  ["jardin", "jardi"],
  ["jardines", "jardins"],
  ["parque", "parc"],
  ["rio", "riu"],
  ["mercado", "mercat"],
  ["iglesia", "esglesia"],
  ["palacio", "palau"],
  ["museo", "museu"],
  ["estacion", "estacio"],
  ["ayuntamiento", "ajuntament"],
  ["lonja", "llotja"],
  ["ciudad", "ciutat"],
  ["artes", "arts"],
  ["ciencias", "ciencies"],
  ["universidad", "universitat"],
  ["colegio", "collegi"],
  ["barrio", "barri"],
  ["san", "sant"],
  ["virgen", "mare"],
  ["norte", "nord"],
  ["sur", "sud"],
  ["nuevo", "nou"],
  ["nueva", "nova"],
  ["viejo", "vell"],
  ["reino", "regne"],
  ["y", "i"],
  ["alameda", "albereda"],
  ["enero", "gener"],
  ["febrero", "febrer"],
  ["marzo", "marc"],
  ["mayo", "maig"],
  ["junio", "juny"],
  ["julio", "juliol"],
  ["agosto", "agost"],
  ["septiembre", "setembre"],
  ["noviembre", "novembre"],
  ["diciembre", "desembre"],
];

/** Abbreviations and their meanings, merged: a word may be in several lists ("nou" is 9 and "new"). */
function merge(...lists: Record<string, string[]>[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const list of lists)
    for (const [word, also] of Object.entries(list))
      out[word] = [...new Set([...(out[word] ?? []), ...also])];
  return out;
}

function bothWays(pairs: [string, string][]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [es, va] of pairs) {
    if (es === va) continue;
    out[es] = [...(out[es] ?? []), `=${va}`];
    out[va] = [...(out[va] ?? []), `=${es}`];
  }
  return out;
}

/** Spanish, with Valencian beside it: Valencia's map is in both, El Calafate's in the first. */
export const ES_RULES: SearchRules = {
  and: "y",
  numberWords: {},
  ordinal: null,
  abbreviations: merge(esNumbers(), bothWays(ES_VA), {
    // the small words differ too: "del Ayuntamiento" is "de l'Ajuntament", "de los" is "dels"
    del: ["=de", "=dels"],
    de: ["=d", "=del"],
    d: ["=de"],
    la: ["=l", "=les"],
    el: ["=l", "=els"],
    l: ["=la", "=el"],
    los: ["=els", "=dels"],
    las: ["=les"],
    les: ["=las", "=los"],
    els: ["=los"],
    dels: ["=del", "=los"],
    c: ["calle", "carrer"],
    cl: ["calle"],
    av: ["avenida", "avinguda"],
    avda: ["avenida", "avinguda"],
    avd: ["avenida", "avinguda"],
    avgda: ["avinguda", "avenida"],
    pl: ["plaza", "placa"],
    pza: ["plaza", "placa"],
    plza: ["plaza", "placa"],
    pca: ["placa", "plaza"],
    p: ["paseo", "passeig"],
    ps: ["paseo", "passeig"],
    pso: ["paseo", "passeig"],
    pg: ["passeig", "paseo"],
    ctra: ["carretera"],
    cra: ["carretera"],
    cno: ["camino", "cami"],
    pje: ["pasaje"],
    psje: ["pasaje"],
    bv: ["bulevar", "boulevard"],
    blvd: ["bulevar", "boulevard"],
    rda: ["ronda"],
    gv: ["gran"],
    rn: ["ruta"],
    rp: ["ruta"],
    urb: ["urbanizacion"],
    bo: ["barrio"],
    pq: ["parque", "parc"],
    pque: ["parque", "parc"],
    est: ["estacion", "estacio"],
    dr: ["doctor"],
    dra: ["doctora"],
    prof: ["profesor", "profesora", "professor"],
    ing: ["ingeniero"],
    arq: ["arquitecto", "arquitecte"],
    gral: ["general"],
    gdor: ["gobernador"],
    gob: ["gobernador"],
    pte: ["presidente"],
    pdte: ["presidente"],
    int: ["intendente"],
    cnel: ["coronel"],
    cdte: ["comandante"],
    cte: ["comandante"],
    tte: ["teniente"],
    cap: ["capitan"],
    sgto: ["sargento"],
    alte: ["almirante"],
    mtro: ["maestro"],
    mons: ["monsenor"],
    hno: ["hermano"],
    hnos: ["hermanos"],
    pe: ["padre"],
    fr: ["fray"],
    dn: ["don"],
    sta: ["santa"],
    sto: ["santo"],
    s: ["san", "sant"],
    ntra: ["nuestra"],
    sra: ["senora"],
    ns: ["nuestra", "senora"],
    hosp: ["hospital"],
    univ: ["universidad", "universitat"],
    cc: ["centro", "centre"],
    pto: ["puerto", "port"],
    pta: ["punta", "puerta"],
  }),
  initialsSkip: [
    "de",
    "del",
    "la",
    "las",
    "el",
    "los",
    "y",
    "e",
    "en",
    "a",
    "al",
    "d",
    "l",
    "les",
    "els",
    "i",
    "dels",
  ],
  elision: /\b([dl])['’](?=[a-z])/g,
};
