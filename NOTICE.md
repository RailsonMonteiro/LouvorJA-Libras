# Avisos de terceiros

LouvorJA Libras é distribuído sob a LGPL-3.0-only (veja `LICENSE`).

## VLibras (spbgovbr-vlibras)

- O texto de `LICENSE` é o da LGPL-3.0 distribuído com o `vlibras-translate`.
- `tests/fixtures/libras/oracle.json` contém respostas do serviço público de tradução do VLibras
  (`https://traducao2.vlibras.gov.br/translate`) para as frases de `corpus.txt`. Servem só como
  referência de comparação em testes.
- O aplicativo baixa, em tempo de execução e sob demanda, o índice de sinais do dicionário do VLibras.
  Esses dados não são distribuídos junto com o aplicativo.
- O motor local de tradução (`electron/services/libras/local`) é um porte parcial, em TypeScript, do
  `vlibras-translate` 1.1.10 (LGPL-3.0, UFPB/LAVID): `textPreprocessing.ts` vem de `char_preprocessing.py`,
  e `LocalRulesEngine.ts` reimplementa `word_processing.py` e partes de `translation.py` e `lemma.py`.
  `vlibras-data.ts` contém, sem alteração de conteúdo, os arquivos de dados `palavras_compostas_e_sinonimos`,
  `expressoes_com_palavras_removiveis`, `lugares` e `famosos` do mesmo pacote. As listas de formas dos
  verbos irregulares (`irregularVerbs.ts`) foram escritas para este projeto.

## Player do avatar (vlibras-web-browsers)

- O player Unity do avatar (Ícaro, Guga e Hosana) é do repositório `spbgovbr-vlibras/vlibras-web-browsers`,
  sob LGPL-3.0. Ele **não é commitado**: `npm run player:fetch` baixa uma revisão fixa (`scripts/fetch-vlibras-player.mts`),
  confere o SHA-256 e guarda em `public/vlibras/` junto com o `LICENSE` e um `SOURCE.txt` que indica a origem.
  O instalador leva esses arquivos sem modificá-los (exceto a versão no `index.js`).
- Os retratos dos avatares em `src/assets/images/avatars/` são capturas do próprio player (Ícaro, Guga e
  Hosana), geradas por `npm run brand:avatars`. São obra derivada do player e seguem a LGPL-3.0.
- Os sinais (AssetBundles) vêm do dicionário público do VLibras, sob demanda, e ficam no computador
  do usuário (`userData/signs`). Não são distribuídos com o aplicativo.

## Ícones do pacote Flaticon UIcons

- Vêm do pacote `@flaticon/flaticon-uicons`, da família "UIcons" da Flaticon (Freepik Company).
  Usados sob a licença gratuita da Flaticon, que **exige este crédito**: ícones de
  [Flaticon UIcons by Flaticon](https://www.flaticon.com/uicons).
- O ícone da seção "Conexão" do menu lateral (`fi fi-rr-link`) usa a família "regular rounded".
  Os botões de posição do avatar, na página Projeção (`fi fi-rs-align-left`, espelhado em CSS para
  "direita", e `fi fi-ss-align-center`), usam as famílias "regular straight" e "solid straight". O
  ícone de ajuda (`fi fi-sr-info`, usado nos balões "Como conectar" e no item "Sobre" do menu
  lateral) usa a família "solid rounded".
- Só essas quatro famílias são carregadas (não o conjunto completo de ícones do pacote).
- Isso é diferente da LGPL do restante do projeto: a licença da Flaticon não é livre (uso editorial/
  não comercial sem assinatura Premium; ver `LICENSE` dentro do pacote em
  `node_modules/@flaticon/flaticon-uicons`). Antes de distribuir o instalador, confirmar se esse uso
  está de acordo com os termos atuais da Flaticon para o tipo de distribuição deste app (gratuito,
  código aberto, sem fins lucrativos).

## Pendências de licença

Antes de distribuir dados embutidos, confirmar as licenças do modelo HunPos do Aelius (OpenContent
License), dos dicionários do CoGrOO/jspell e do dicionário Hunspell pt-BR. Veja
`docs/tradutor-libras.md`.
