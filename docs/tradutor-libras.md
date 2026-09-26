# Tradutor de Libras

Este documento registra o que foi descoberto sobre o VLibras (organização
[spbgovbr-vlibras](https://github.com/spbgovbr-vlibras)), o que já está implementado e o plano para
portar o tradutor para TypeScript.

## 1. O que a organização VLibras realmente oferece

| Peça                             | Onde está                                                                                                                                                                            | Licença                      | Serve para nós?                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Tradução texto → glosa           | biblioteca Python `vlibras-translate` (PyPI e GitLab da UFPB/LAVID). O GitHub só tem um _worker_ (`vlibras-translator-text-core`) e uma API (`vlibras-translator-api`) em volta dela | LGPL-3.0                     | Sim, como fonte para o porte. Não roda dentro do app (Python, Java e `hunspell` só para Linux) |
| Serviço público de tradução      | `POST https://traducao2.vlibras.gov.br/translate` com `{"text": "..."}`, resposta em texto puro (limite de 300 requisições)                                                          | sem termos de uso publicados | Sim, como motor opcional e como **referência para medir** o nosso                              |
| Índice de sinais                 | `https://dicionario2.vlibras.gov.br/static/TREES/2018.3.1.json` (trie de 3,4 MB, 22.498 sinais)                                                                                      | sem licença declarada        | Sim, baixado sob demanda (nunca embutido)                                                      |
| Sinais (animações)               | `https://dicionario2.vlibras.gov.br/static/BUNDLES/2018.3.1/WEBGL/BR/<SINAL>`: _AssetBundle_ do Unity (`UnityFS`), ~21 KB cada                                                       | sem licença declarada        | Só pelo player Unity. **Não** carregam no Three.js                                             |
| Player                           | `vlibras-player-webjs`: avatar Unity WebGL (~14 MB) e mensagens simples (`playNow`, `stopAll`, velocidade, avatar, emoções)                                                          | LGPL-3.0                     | Sim, é o plano para o avatar (próxima etapa)                                                   |
| Repositórios de sinais no GitHub | `vlibras-dictionary-repository` só tem `.gitignore` de espaço reservado; `-bundles`, `-cache` e `-video` estão vazios                                                                | sem licença                  | Não há dados de sinais no GitHub                                                               |

Formato das glosas: `DEUS AMOR AMAR NÓS`, compostos com `_` (`ESPÍRITO_SANTO`, `EM_BREVE`), verbos
direcionais `1S_AJUDAR_2S` (quem faz → para quem), desambiguação com `&` (`ABAIXAR&OBJETO`,
`TERCEIRO&ORDINAL`) e números em algarismos (`9`, `300`).

## 2. Como o tradutor oficial funciona (versão de produção, `vlibras-translate` 1.3.4rc1)

O caminho por regras (`rule_translation`) **não usa o analisador sintático**: cada palavra é
etiquetada e depois removida ou normalizada conforme a classe gramatical.

1. Expandir abreviações, limpar caracteres, converter números por extenso.
2. **Tokenizar e etiquetar** (Aelius + HunPos).
3. Mascarar nomes próprios (dicionário de nomes), números e erros de ortografia (Hunspell).
4. **Lematizar** por classe (`lemma.py`): remove artigos, `de`/`em`, `e`, `um`; verbos vão para o
   infinitivo; contrações e pronomes oblíquos são reescritos. O lema vem do CoGrOO.
5. Aplicar sinônimos, palavras compostas e pronomes (arquivos de dados) e o pós-processamento.

Dependências que não são código Python puro:

| Dependência                    | O que é                                                                                                                  | Tamanho     | Licença                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------ |
| Modelo HunPos (`AeliusHunPos`) | etiquetador estatístico. O modelo é um binário **OCaml Marshal**, lido por um executável Linux (`hunpos-tag`)            | 11 MB       | **OpenContent License (OPL)**                                            |
| CoGrOO                         | Java. `lemmatize` roda um modelo do OpenNLP e dicionários FSA **Morfologik/jspell** (`pt_br_jspell*.dict`, ~330 KB cada) | 17 MB (JAR) | LGPL (a confirmar); o _wrapper_ Python (`cogroo4py`) não declara licença |
| Hunspell pt-BR                 | corretor ortográfico. Só é chamado no Linux (no Windows `check` devolve sempre verdadeiro)                               | 5,6 MB      | a confirmar                                                              |
| Lista de nomes                 | `pygtrie` serializado com `pickle`                                                                                       | 1 MB        | a confirmar                                                              |

## 3. O que já está implementado

Camada de tradução com **vários motores intercambiáveis** (`electron/services/libras`):

```
texto do slide
  → correção manual (o que uma pessoa escreveu sempre vence)
  → cache no SQLite (uma tradução por texto, funciona sem internet)
  → motores, em ordem: online (se ligado), depois o local (regras, sempre disponível)
  → palavras do slide em maiúsculas (só se tudo falhar, marcado como "Palavras do slide")
```

- **Motor online** (`VLibrasOnlineEngine`): desligado por padrão, porque envia o texto para um
  servidor. Endereço configurável (dá para usar uma instância própria, montada com os repositórios
  `vlibras-translator-*` do GitHub). Trata limite de requisições, _timeout_ e respostas que não são
  glosa.
- **Motor local** (`electron/services/libras/local`, etapa 2 do porte e um substituto do lematizador):
  traduz por regras, sem rede. Limpa o texto, converte números por extenso em algarismos, tira o que
  não se sinaliza (artigos, `de`, `em`, `e` e contrações como `do`, `na`, `ao`), passa `ser`, `estar`, `ter`,
  `haver`, `ir` e alguns outros verbos irregulares para o infinitivo, troca possessivos femininos pelos
  masculinos e aplica as tabelas do `vlibras-translate` (2.784 sinônimos e palavras compostas,
  expressões). **Com o catálogo de sinais baixado**, o `CatalogLemmatizer` coloca os verbos regulares no
  infinitivo e os substantivos no singular: ele gera candidatos (`louvamos` → `LOUVAR`, `filhos` → `FILHO`,
  `entregue` → `ENTREGAR`) e só aceita o que é um sinal de verdade. O catálogo faz o papel do dicionário do
  CoGrOO. Sem etiquetador, uma palavra que é substantivo e verbo ao mesmo tempo (`casa`, `guia`) só é lida como
  verbo quando a palavra anterior não é artigo, preposição, possessivo ou parecido. Particípios e
  adjetivos no plural ficam como estão (o oficial faz o mesmo na maioria dos casos). Os resultados não
  vão para o cache (`cacheable = false`), para não esconder o motor online ligado depois.
- **Catálogo de sinais**: baixado sob demanda do índice e guardado no SQLite. Cada palavra da glosa
  é marcada como _sinal_, _soletrada_ (não tem sinal, mas as letras têm) ou _ausente_.
- **Correção manual** com "voltar à automática", guardada por texto normalizado.
- Interface: glosa abaixo do slide na página **Slides**; configurações em **Configurações →
  Tradutor de Libras**.
- Tabelas (migração `0003`): `signs`, `libras_meta`, `translations`, `translation_cache`.

## 4. Como medir a qualidade

```bash
npm run libras:oracle      # pergunta ao serviço oficial as 65 frases de tests/fixtures/libras/corpus.txt
npm run libras:benchmark   # compara um motor com essas respostas
```

`tests/fixtures/libras/oracle.json` guarda as respostas oficiais (referência para testes, nada em
tempo de execução depende dele). Resultado atual (`npm run libras:benchmark`, que baixa o catálogo como o app faz; `--no-catalog` mede sem ele):

| Métrica                     | Palavras do slide | Regras, sem catálogo | Regras + catálogo |
| --------------------------- | ----------------- | -------------------- | ----------------- |
| Frases idênticas ao oficial | 0 de 111          | 19 de 111            | 66 de 111         |
| Precisão por palavra        | 39,2%             | 65,9%                | 91,3%             |
| Revocação por palavra       | 52,2%             | 65,9%                | 90,7%             |
| F1 por palavra              | 44,8%             | 65,9%                | 91,0%             |

**Cuidado com o ajuste ao corpus.** As regras foram afinadas olhando as 65 primeiras frases. As 46
seguintes foram escritas e medidas depois, sem ajuste prévio: F1 de 88,5% com o catálogo (contra 89,9%
nas primeiras). Um ajuste geral feito depois de olhar os erros dessas 46 as levou a 92,0% (as
primeiras foram a 90,3%), então esse número já não é totalmente "às cegas". Para novas melhorias,
escreva frases novas antes de mexer nas regras.

O que ainda separa o motor local do oficial: ordinais (`TERCEIRO&ORDINAL`), o `nós` deslocado (`nos ama` →
`AMAR NÓS`), `ser`/`ir` usados como auxiliar, adjetivos femininos que também são sinal (`MARAVILHOSA` →
`MARAVILHOSO`), particípios que o oficial reduz (`OBRIGADO` → `OBRIGAR`) e as escolhas do CoGrOO que nem o
oficial acerta de forma consistente (`JUNTOS` fica, `FILHOS` vira `FILHO`).

O corpus (111 frases) tem frases de igreja escritas para este projeto (sem letras de música nem versículos sob
direitos autorais). O serviço oficial também erra (`FALTAR 2 IR PARA BATISMO`, `ALELUIO`), e o alvo do
porte é **reproduzir o oficial**, incluindo esses erros, porque é a referência de comparação.

## 5. Plano do porte para TypeScript

Cada etapa termina com o benchmark rodando e com testes; nada entra sem número.

| Etapa                               | Entrega                                                                                                                   | Depende de                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1. Base _(feita)_                   | motores, cache, correção manual, catálogo, corpus de referência, benchmark                                                | —                                               |
| 2. Regras sem etiquetador _(feita)_ | limpeza de texto, números por extenso → algarismos, palavras removidas, compostos/sinônimos, verbos irregulares           | dados LGPL do `vlibras-translate`               |
| 3. Etiquetador                      | leitor do formato OCaml Marshal, algoritmo do HunPos (trigramas + palpite por sufixo), tokenizador e contrações do Aelius | modelo `AeliusHunPos` (**licença OPL**)         |
| 4. Lematizador                      | leitor de dicionário FSA (Morfologik), regras de `lemma.py`                                                               | dicionários do CoGrOO (**licença a confirmar**) |
| 5. Nomes e ortografia               | lista de nomes (ler o `pickle`), verificação ortográfica, pós-processamento                                               | dicionários (licença a confirmar)               |
| 6. Paridade                         | ampliar o corpus, medir, corrigir diferenças, ligar o motor local antes do online                                         | tudo acima                                      |

Alternativa se a licença do modelo ou dos dicionários for um problema: treinar nosso próprio
etiquetador e lematizador com corpora livres (por exemplo Mac-Morpho), o que é mais trabalhoso e
provavelmente menos fiel ao serviço oficial.

## 6. Riscos e pontos que precisam de decisão

1. **Licenças dos dados.** O projeto é LGPL-3.0, mas o modelo do Aelius/HunPos vem com a **OpenContent
   License**, que exige que trabalhos derivados sejam distribuídos sob os termos dela, e isso pode não
   ser compatível com a LGPL. Os dicionários do CoGrOO/jspell e o Hunspell também precisam ser
   verificados. **Isso não é parecer jurídico**; confirmar antes de distribuir qualquer dado embutido.
2. **Tamanho do trabalho.** Reproduzir o oficial exige reimplementar etiquetador, lematizador e
   ler formatos binários (OCaml Marshal, FSA). Estimativa: várias etapas, não uma tarde.
3. **Sinais offline.** 22.498 sinais × ~20 KB ≈ 450 MB. O plano é cache sob demanda mais um pacote
   com o vocabulário mais usado nas igrejas, e não embutir tudo.
4. **Player Unity.** É uma build de 2018 (`UnityLoader.js`). Ainda não foi testado dentro do Electron
   atual, nem com fundo transparente para o overlay.
5. **Envio de texto.** O motor online manda o texto dos slides para um servidor externo. Por isso
   vem desligado, com aviso, e o que já foi traduzido fica no cache local.
