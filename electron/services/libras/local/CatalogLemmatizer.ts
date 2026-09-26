import { irregularLemma } from './irregularVerbs.ts'

/** What the lemmatizer needs from the sign catalog: whether a sign exists (upper case). */
export interface SignLookup {
  readonly ready: boolean
  has(sign: string): boolean
}

/**
 * Finds the base form of a word (verb in the infinitive, noun and adjective in the masculine
 * singular) by asking the sign catalog which candidate is a real sign. The official translator
 * does this with a part-of-speech tagger and the CoGrOO dictionaries; here the catalog, which the
 * app already has, plays the dictionary: "louvamos" becomes LOUVAR because LOUVAR is a sign.
 *
 * Without the tags a word like "casa" cannot be told apart (noun or "he marries"). A word that is
 * itself a sign and could be either is left alone when the word before it is an article, a
 * preposition or a similar word ("a casa", "de vida"), and taken as a verb otherwise.
 */
export class CatalogLemmatizer {
  private readonly signs: SignLookup

  constructor(signs: SignLookup) {
    this.signs = signs
  }

  /**
   * @param previous The word before this one in the original sentence (lower case), if any.
   * @param afterVerb Whether the word before was a verb: what follows a verb is usually its object.
   */
  lemma(word: string, previous: string | null, afterVerb = false): string {
    if (!this.signs.ready || word.length < 3 || UNCHANGED.has(word)) return word

    const irregular = irregularLemma(word) ?? IRREGULAR_MORE.get(word)
    if (irregular) return irregular

    const upper = word.toUpperCase()
    const known = this.signs.has(upper)
    const verb = this.verbCandidate(upper, known, afterVerb ? 'o' : previous)
    if (verb) return verb.toLowerCase()

    const plural = this.singularCandidate(upper)
    if (plural) return plural.toLowerCase()

    // A feminine form is only reduced when it has no sign of its own ("casa" stays: it exists).
    if (!known) {
      const masculine = this.masculineCandidate(upper)
      if (masculine) return masculine.toLowerCase()
    }
    return word
  }

  private verbCandidate(word: string, known: boolean, previous: string | null): string | null {
    for (const [ending, infinitives, ambiguous] of VERB_ENDINGS) {
      if (!word.endsWith(ending) || word.length - ending.length < 2) continue
      // A word that is also a sign and ends like a noun needs a verb context.
      if (known && ambiguous && isNounContext(previous)) continue

      const stem = word.slice(0, word.length - ending.length)
      for (const infinitive of infinitives) {
        for (const variant of stemVariants(stem, ending, infinitive)) {
          const candidate = variant + infinitive
          if (this.signs.has(candidate)) return candidate
        }
      }
    }
    return null
  }

  private singularCandidate(word: string): string | null {
    for (const [ending, replacement] of PLURAL_ENDINGS) {
      if (!word.endsWith(ending) || word.length - ending.length < 2) continue
      // "país", "mês": the s belongs to the word when an accented vowel comes right before it.
      if (ending === 'S' && /[ÁÉÍÓÚÂÊÔ]$/.test(word.slice(0, -1))) continue
      const candidate = word.slice(0, word.length - ending.length) + replacement
      if (candidate.length >= 3 && this.signs.has(candidate)) return candidate
    }
    return null
  }

  private masculineCandidate(word: string): string | null {
    for (const [ending, replacement] of FEMININE_ENDINGS) {
      if (!word.endsWith(ending) || word.length - ending.length < 2) continue
      const candidate = word.slice(0, word.length - ending.length) + replacement
      if (this.signs.has(candidate)) return candidate
    }
    return null
  }
}

const words = (list: string): string[] => list.split(/\s+/).filter(Boolean)

/** Words that must never be reduced: they are not inflected forms of a sign (or must stay). */
const UNCHANGED = new Set(
  words(`mas mais menos deus jesus cristo nós vós após atrás através depois pois apenas antes sobre
  para por com sem sob até entre como que quem já só não ele ela eles elas eu tu você vocês mim ti
  meu meus teu teus seu seus nosso nossos vosso vossos este esse aquele esta essa aquela isto isso
  aquilo muito muita muitos muitas tudo cada outro outra aqui ali lá onde quando porque porém também
  ainda agora hoje sempre nunca jamais ninguém alguém nada algo bem mal ontem amanhã aleluia amém
  glória senhor santo espírito pai país lápis ônibus gás mês vez vezes voz vozes luz luzes paz`)
)

/** Irregular verbs beyond ser, estar, ter, haver and ir: the forms that are not regular. */
const IRREGULAR_MORE = new Map<string, string>()
for (const [lemma, forms] of Object.entries({
  fazer: 'faço faz fazem fez fizeram fizemos faça façam fazendo feito feita',
  dar: 'dou dá dão deu deram demos dê deem dando dado',
  dizer: 'digo diz dizem disse disseram dissemos diga digam dizendo dito',
  poder: 'posso pode podem pôde puderam pudemos possa possam podendo',
  querer: 'quero quer querem quis quiseram quisemos queira queiram querendo',
  ver: 'vejo vê veem viu viram vimos veja vejam vendo visto',
  vir: 'venho vem vêm veio vieram viemos venha venham vindo',
  saber: 'sei sabe sabem soube souberam soubemos saiba saibam sabendo',
  pôr: 'ponho põe põem pôs puseram pusemos ponha ponham',
  pedir: 'peço peça peçam',
  ouvir: 'ouço ouça ouçam'
})) {
  for (const form of words(forms)) IRREGULAR_MORE.set(form, lemma)
}

/**
 * Words after which a word is a noun or an adjective, not a verb: articles, prepositions,
 * possessives, demonstratives and quantifiers. Anywhere else (start of the sentence, after a
 * subject, after "não") a word that could be a verb is taken as one.
 */
const NOUN_CONTEXT = new Set(
  words(`o a os as um uma uns umas ao à aos às do da dos das no na nas pelo pela pelos pelas de
  em por para com sem sob sobre até entre este esta esse essa aquele aquela isto isso aquilo meu
  minha meus minhas teu tua teus tuas seu sua seus suas nosso nossa nossos nossas vosso vossa
  vossos vossas muito muita muitos muitas mais menos tão cada todo toda todos todas qual quais
  outro outra outros outras mesmo mesma nenhum nenhuma tanto tanta bom boa bons boas novo nova novos
  novas grande grandes santo santa santos santas primeiro primeira último última pequeno pequena
  velho velha belo bela`)
)
const isNounContext = (previous: string | null): boolean =>
  previous !== null && (NOUN_CONTEXT.has(previous) || /^\d/.test(previous))

type VerbEnding = [ending: string, infinitives: string[], ambiguous: boolean]
const AR = ['AR']
const ER = ['ER']
const IR = ['IR']
const ANY = ['AR', 'ER', 'IR']

/**
 * Endings of regular verbs and the infinitives they may come from. The last flag marks endings
 * that nouns and adjectives share (-a, -o, -e): a word like that which is also a sign needs a
 * verb context. Endings that only plural nouns have (-os, -as, -es) and participles ("amado",
 * "querido" are adjectives too, and the official translator mostly keeps them) are left out.
 */
const ENDING_GROUPS: Array<[endings: string, infinitives: string[], ambiguous: boolean]> = [
  // future, conditional
  ['aremos areis arão arei arás ará aríamos aríeis ariam arias aria', AR, false],
  ['eremos ereis erão erei erás erá eríamos eríeis eriam erias eria', ER, false],
  ['iremos ireis irei irás iríamos iríeis iriam irias iria', IR, false],
  // imperfect, past perfect, imperfect subjunctive, preterite, gerund
  ['ávamos áveis avam avas ava ássemos ásseis assem asses asse aram astes aste ando ou', AR, false],
  ['íamos íeis iam ias ia', ['IR', 'ER'], false],
  ['êssemos êsseis essem esses esse eram estes este endo eu', ER, false],
  ['issemos isseis issem isses isse iram istes iste indo iu', IR, false],
  // present and subjunctive
  ['amos ais', AR, false],
  ['emos eis em am', ANY, false],
  ['imos', IR, false],
  ['ei', AR, false],
  ['i', ['ER', 'IR'], false],
  ['a e o', ANY, true]
]

const VERB_ENDINGS: VerbEnding[] = ENDING_GROUPS.flatMap(([endings, infinitives, ambiguous]) =>
  words(endings).map((ending): VerbEnding => [ending.toUpperCase(), infinitives, ambiguous])
).sort((a, b) => b[0].length - a[0].length)

/** Spelling changes between a conjugated stem and the infinitive: "entregue" -> ENTREGAR. */
function stemVariants(stem: string, ending: string, infinitive: string): string[] {
  const variants = [stem]
  const accentless = stem.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (accentless !== stem) variants.push(accentless) // "reúne" -> REUNIR

  // -ar verbs: the e endings need qu, gu and c to keep the sound of the infinitive.
  if (infinitive === 'AR' && /^[EÉÊ]/.test(ending)) {
    if (stem.endsWith('QU')) variants.push(stem.slice(0, -2) + 'C')
    if (stem.endsWith('GU')) variants.push(stem.slice(0, -2) + 'G')
    if (stem.endsWith('C')) variants.push(stem.slice(0, -1) + 'Ç')
  }
  // -ir verbs change the stem vowel: "sirvo" -> SERVIR, "durmo" -> DORMIR.
  if (infinitive === 'IR' && /^[AO]/.test(ending)) {
    const at = Math.max(stem.lastIndexOf('I'), stem.lastIndexOf('U'))
    if (at > 0 && !/[AEIOU]/.test(stem.slice(at + 1))) {
      variants.push(stem.slice(0, at) + (stem[at] === 'I' ? 'E' : 'O') + stem.slice(at + 1))
    }
  }
  // -er and -ir verbs: the a and o endings need j and ç ("proteja" -> PROTEGER).
  if (infinitive !== 'AR' && /^[AO]/.test(ending)) {
    if (stem.endsWith('J')) variants.push(stem.slice(0, -1) + 'G')
    if (stem.endsWith('Ç')) variants.push(stem.slice(0, -1) + 'C')
  }
  return variants
}

/** Plural endings and what they become in the singular, most specific first. */
const PLURAL_ENDINGS: [string, string][] = [
  ['ÕES', 'ÃO'],
  ['ÃES', 'ÃO'],
  ['ÃOS', 'ÃO'],
  ['AIS', 'AL'],
  ['ÉIS', 'EL'],
  ['ÓIS', 'OL'],
  ['UIS', 'UL'],
  ['NS', 'M'],
  ['RES', 'R'],
  ['ZES', 'Z'],
  ['SES', 'S'],
  ['S', '']
]

/** Feminine endings and their masculine forms. */
const FEMININE_ENDINGS: [string, string][] = [
  ['ORA', 'OR'],
  ['ESA', 'ÊS'],
  ['Ã', 'ÃO'],
  ['A', 'O']
]
