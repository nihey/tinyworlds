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
