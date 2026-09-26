/**
 * Forms of the verbs the official translator always reduces to the same word, whatever the tense:
 * "é", "somos", "foi" and "seja" become SER, and so on. They are the most frequent words of any
 * text and a closed list, so they do not need a dictionary or a part-of-speech tagger.
 *
 * (The official translator takes them from the tagger's tags `SR`, `ET`, `TR` and `HV`; the
 * lists below were written for this project from Portuguese conjugation tables.)
 */
const FORMS: Record<string, string> = {
  ser: `sou és é somos sois são era eras éramos éreis eram fui foste foi fomos fostes foram
    fôramos fôreis seja sejas sejamos sejais sejam fosse fosses fôssemos fôsseis fossem for fores formos
    fordes forem serei serás será seremos sereis serão seria serias seríamos seríeis seriam sendo sido`,
  estar: `estou estás está estamos estais estão estava estavas estávamos estáveis estavam estive estiveste
    esteve estivemos estivestes estiveram estivera estiveras estivéramos estivéreis esteja estejas
    estejamos estejais estejam estivesse estivesses estivéssemos estivésseis estivessem estiver estiveres
    estivermos estiverdes estiverem estarei estarás estará estaremos estareis estarão estaria estarias
    estaríamos estaríeis estariam estando`,
  ter: `tenho tens tem temos tendes têm tinha tinhas tínhamos tínheis tinham tive tiveste teve tivemos
    tivestes tiveram tivera tiveras tivéramos tivéreis tenha tenhas tenhamos tenhais tenham tivesse
    tivesses tivéssemos tivésseis tivessem tiver tiveres tivermos tiverdes tiverem terei terás terá
    teremos tereis terão teria terias teríamos teríeis teriam tendo tido`,
  haver: `hei hás há havemos haveis hão havia havias havíamos havíeis haviam houve houveste houvemos
    houvestes houveram houvera houveras houvéramos houvéreis haja hajas hajamos hajais hajam houvesse
    houvesses houvéssemos houvésseis houvessem houver houveres houvermos houverdes houverem haverei
    haverás haverá haveremos havereis haverão haveria haverias haveríamos haveríeis haveriam havendo
    havido`,
  ir: `vou vais vai vamos ides vão ia ias íamos íeis iam irei irás irá iremos ireis irão iria irias
    iríamos iríeis iriam vá vás vades ido indo`
}

const LEMMA_OF = new Map<string, string>()
for (const [lemma, forms] of Object.entries(FORMS)) {
  for (const form of forms.split(/\s+/).filter(Boolean)) LEMMA_OF.set(form, lemma)
}

/** The infinitive of an irregular form ("somos" -> "ser"), or `null` for any other word. */
export function irregularLemma(word: string): string | null {
  return LEMMA_OF.get(word) ?? null
}
