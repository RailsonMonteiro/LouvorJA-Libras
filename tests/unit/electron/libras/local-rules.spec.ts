import { describe, expect, it } from 'vitest'
import { LocalRulesEngine } from '../../../../electron/services/libras/local/LocalRulesEngine'
import { irregularLemma } from '../../../../electron/services/libras/local/irregularVerbs'
import { replaceSpelledNumbers } from '../../../../electron/services/libras/local/spelledNumbers'
import {
  preprocess,
  removeEnclise
} from '../../../../electron/services/libras/local/textPreprocessing'

const engine = new LocalRulesEngine()
const gloss = (text: string): string => engine.run(text)

describe('spelled numbers', () => {
  const convert = (text: string): string => replaceSpelledNumbers(text.split(' ')).join(' ')

  it('turns number words into digits', () => {
    expect(convert('capítulo três')).toBe('capítulo 3')
    expect(convert('vinte e um irmãos')).toBe('21 irmãos')
    expect(convert('cento e vinte e três')).toBe('123')
    expect(convert('trezentos')).toBe('300')
    expect(convert('dois mil e quinhentos')).toBe('2500')
    expect(convert('um milhão e duzentos mil')).toBe('1200000')
    expect(convert('mil')).toBe('1000')
  })

  it('leaves "um" and "uma" alone, where they are articles', () => {
    expect(convert('uma nova bênção')).toBe('uma nova bênção')
    expect(convert('um')).toBe('um')
  })

  it('does not join numbers that are apart, nor swallow a lone "e"', () => {
    expect(convert('três e quatro vezes')).toBe('7 vezes') // "três e quatro" reads as one run
    expect(convert('cinco pães e dois peixes')).toBe('5 pães e 2 peixes')
  })
})

describe('text preprocessing', () => {
  it('removes symbols, quotes and brackets', () => {
    expect(preprocess('“Glória” (a Deus) [aleluia]!')).toBe('Glória a Deus aleluia!')
  })

  it('drops commas that are not inside numbers and normalizes decimals', () => {
    expect(preprocess('Paz, amor')).toBe('Paz amor')
    expect(preprocess('valor 3,5')).toBe('valor 3.5')
    expect(preprocess('valor 1.234,56')).toBe('valor 1234.56')
    expect(preprocess('mil 1.000.000')).toBe('mil 1000000')
    expect(preprocess('vale ,5')).toBe('vale 0.5')
  })

  it('removes pronouns glued to a verb', () => {
    expect(removeEnclise('amar-te')).toBe('amar')
    expect(removeEnclise('dá-me')).toBe('dá')
    expect(removeEnclise('bem-vindo')).toBe('bem-vindo')
  })
})

describe('irregular verbs', () => {
  it('maps every form of ser, estar, ter, haver and ir to the infinitive', () => {
    expect(irregularLemma('é')).toBe('ser')
    expect(irregularLemma('somos')).toBe('ser')
    expect(irregularLemma('esteja')).toBe('estar')
    expect(irregularLemma('tenhas')).toBe('ter')
    expect(irregularLemma('há')).toBe('haver')
    expect(irregularLemma('vamos')).toBe('ir')
  })

  it('does not touch other words, including look-alikes', () => {
    expect(irregularLemma('estado')).toBeNull()
    expect(irregularLemma('fora')).toBeNull()
    expect(irregularLemma('amor')).toBeNull()
  })
})

describe('LocalRulesEngine', () => {
  it('drops articles, "de", "em", "e" and the contractions that hide them', () => {
    expect(gloss('O Senhor é o meu pastor')).toBe('SENHOR SER MEU PASTOR')
    expect(gloss('A graça de Deus')).toBe('GRAÇA DEUS')
    expect(gloss('Cantamos ao Criador na igreja')).toBe('CANTAMOS CRIADOR IGREJA')
    expect(gloss('Deus fez o céu e a terra')).toBe('DEUS FEZ CÉU TERRA')
  })

  it('rewrites feminine possessives and irregular verbs', () => {
    expect(gloss('Deus abençoe a sua família')).toBe('DEUS ABENÇOE SEU FAMÍLIA')
    expect(gloss('Estamos aqui e somos felizes')).toBe('ESTAR AQUI SER FELIZES')
    expect(gloss('Vamos orar juntos')).toBe('IR ORAR JUNTOS')
  })

  it('writes numbers with digits', () => {
    expect(gloss('Abram a Bíblia em João capítulo três')).toBe('ABRAM BÍBLIA JOÃO CAPÍTULO 3')
    expect(gloss('Trezentos irmãos')).toBe('300 IRMÃOS')
    expect(gloss('Salmo 23')).toBe('SALMO 23')
    expect(gloss('vale 3,14')).toBe('VALE 3 VÍRGULA 14')
  })

  it('applies the tables of compound words and keeps expressions whole', () => {
    expect(gloss('Cristo voltará em breve')).toBe('CRISTO VOLTARÁ EM_BREVE')
    expect(gloss('De repente')).toBe('DE_REPENTE')
    expect(gloss('Ninguém é maior do que o Senhor')).toBe('NINGUÉM SER MAIOR DO_QUE SENHOR')
  })

  it('does not turn a common word into a place name', () => {
    // "Vitória" is also a city, but the official translator only marks places in another mode.
    expect(gloss('Ele me deu a vitória')).toBe('ELE ME DEU VITÓRIA')
  })

  it('signs hyphenated words apart and moves glued pronouns before the verb', () => {
    expect(gloss('Bem-vindos à nossa igreja')).toBe('BEM VINDOS NOSSO IGREJA')
    expect(gloss('Alegrem-se no Senhor')).toBe('SE ALEGREM SENHOR')
  })

  it('handles empty text, punctuation only and upper case text', () => {
    expect(gloss('')).toBe('')
    expect(gloss('  ...  ')).toBe('')
    expect(gloss('DEUS É AMOR')).toBe('DEUS SER AMOR')
  })

  it('is not cached, so a better engine turned on later is not hidden', () => {
    expect(engine.cacheable).toBe(false)
    expect(engine.id).toMatch(/^local:/)
  })

  it('answers through the engine interface too', async () => {
    await expect(engine.translate('Deus é amor')).resolves.toBe('DEUS SER AMOR')
  })
})

const SIGNS = new Set(
  `AMAR LOUVAR LOUVOR ADORAR ORAR CANTAR SALVAR ENTREGAR DESLIGAR REUNIR ABRIR VIVER QUERER FILHO IRMÃO
  ORAÇÃO ALTURA CELULAR ANJO CRIANÇA SÁBADO ERRO CASA CASAR CAMINHO CAMINHAR GUIA GUIAR AMA DIA TODO
  JUNTO PECADO PECAR MARAVILHOSO MARAVILHOSA BÊNÇÃO PAI PAIS PAÍS`.split(/\s+/)
)
const withCatalog = new LocalRulesEngine({
  catalog: () => ({ ready: true, has: (s) => SIGNS.has(s) })
})
const smart = (text: string): string => withCatalog.run(text)

describe('LocalRulesEngine with the sign catalog', () => {
  it('puts regular verbs in the infinitive when the infinitive is a sign', () => {
    expect(smart('Louvamos o Senhor')).toBe('LOUVAR SENHOR')
    expect(smart('Nós adoramos a Deus')).toBe('NÓS ADORAR DEUS')
    expect(smart('Ele salvou')).toBe('ELE SALVAR')
    expect(smart('Eles cantam')).toBe('ELES CANTAR')
    expect(smart('Vivemos')).toBe('VIVER')
  })

  it('handles spelling changes and lost accents', () => {
    expect(smart('Entregue')).toBe('ENTREGAR')
    expect(smart('Desliguem')).toBe('DESLIGAR')
    expect(smart('Ela se reúne')).toBe('ELA SE REUNIR')
    expect(smart('Abram')).toBe('ABRIR')
  })

  it('puts nouns in the singular and the feminine of adjectives in the masculine', () => {
    expect(smart('Os filhos')).toBe('FILHO')
    expect(smart('Irmãos e irmãos')).toBe('IRMÃO IRMÃO')
    expect(smart('As orações')).toBe('ORAÇÃO')
    expect(smart('As crianças')).toBe('CRIANÇA')
    expect(smart('Todos os dias')).toBe('TODO_DIA') // also a compound sign
  })

  it('keeps a feminine form that is a sign, and words it must not touch', () => {
    expect(smart('É maravilhosa')).toBe('SER MARAVILHOSA')
    expect(smart('Deus')).toBe('DEUS')
    expect(smart('Jesus')).toBe('JESUS')
    expect(smart('O país')).toBe('PAÍS')
  })

  it('does not take a noun for a verb after an article, but does after a subject', () => {
    expect(smart('O caminho')).toBe('CAMINHO')
    expect(smart('A casa')).toBe('CASA')
    expect(smart('Ele casa')).toBe('ELE CASAR')
    expect(smart('Deus guia')).toBe('DEUS GUIAR')
    expect(smart('O guia')).toBe('GUIA')
  })

  it('keeps participles as they are', () => {
    expect(smart('O pecado')).toBe('PECADO')
    expect(smart('Vocês são queridos')).toBe('VOCÊS SER QUERIDOS')
  })

  it('turns irregular verbs into the infinitive', () => {
    expect(smart('Ele fez')).toBe('ELE FAZER')
    expect(smart('Eu quero')).toBe('EU QUERER')
    expect(smart('Deus deu')).toBe('DEUS DAR')
  })

  it('leaves everything alone until the catalog is downloaded', () => {
    const empty = new LocalRulesEngine({ catalog: () => ({ ready: false, has: () => false }) })
    expect(empty.run('Louvamos os filhos')).toBe('LOUVAMOS FILHOS')
  })
})

describe('LocalRulesEngine, context and quantifiers', () => {
  const more = new LocalRulesEngine({
    catalog: () => ({
      ready: true,
      has: (s) =>
        ['TER', 'MEDO', 'MEDIR', 'SERVIR', 'ORAR', 'NOTÍCIA', 'NOTICIAR', 'PESSOA'].includes(s)
    })
  })

  it('takes what follows a verb for its object, not for another verb', () => {
    expect(more.run('Não tenham medo')).toBe('NÃO_TER MEDO')
    expect(more.run('Ele tem medo')).toBe('ELE TER MEDO')
  })

  it('reads the word after "boa", "nova"... as a noun', () => {
    expect(more.run('Venham ouvir a boa notícia')).toBe('VIR OUVIR BOA NOTÍCIA')
  })

  it('signs feminine quantifiers as the masculine ones', () => {
    expect(more.run('Todas as pessoas')).toBe('TODO PESSOA')
    expect(more.run('Muita alegria')).toBe('MUITO ALEGRIA')
  })

  it('changes the stem vowel of -ir verbs', () => {
    expect(more.run('Sirvam')).toBe('SERVIR')
  })
})
