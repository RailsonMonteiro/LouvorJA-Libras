# Avatar e tela de Projeção

O avatar é o **player oficial do VLibras** (Unity WebGL), embutido no app dentro de um `iframe`.
Esta página explica como ele é instalado, como o app conversa com ele e como a tela de Projeção
(o "preview" do que o público vê) funciona.

## Escolha do avatar e ajustes

Tela **Projeção** (`/projection`), coluna "Avatar e ajustes". Tudo é guardado nas configurações
(SQLite) e reaplicado quando o app abre:

| Ajuste               | Chave                          | Valores                                |
| -------------------- | ------------------------------ | -------------------------------------- |
| Avatar               | `avatar`                       | `icaro`, `guga`, `hosana`              |
| Velocidade           | `avatarSpeed`                  | 0.5, 1, 1.5, 2, 2.5                    |
| Região dos sinais    | `signRegion`                   | `BR` (padrão nacional) e os 27 estados |
| Interpretar sozinho  | `autoInterpret`                | liga/desliga; a cada slide novo        |
| Nome do sinal        | `avatarSubtitles`              | legenda do player                      |
| Slide ao fundo       | `stageShowSlide`               | mostra o texto do slide no palco       |
| Posição              | `avatarPosition`               | `left`, `center`, `right`              |
| Tamanho / opacidade  | `avatarScale`, `avatarOpacity` | 30–100 % / 20–100 %                    |
| Dicionário de sinais | `dictionaryUrl`                | http(s); em Configurações              |

## O palco (`ProjectionStage`)

Um retângulo 16:9 com o slide atual e o avatar por cima, na posição e no tamanho configurados. É a
prévia do que será projetado. O texto do slide reserva espaço do lado do avatar para não ficar
embaixo dele.

O avatar **não é desenhado dentro do palco**: existe uma única camada global (`AvatarLayer`,
montada no `App.vue`) com o `iframe` do player. Quem quer mostrar o avatar (hoje o palco, amanhã a
janela de projeção/overlay da fase 6) só diz onde ele deve ficar (`useAvatarPlacement`). Assim o
player Unity carrega uma vez só e não reinicia ao trocar de página.

## Como o player é obtido

Os arquivos do player (LGPL-3.0, do repositório `spbgovbr-vlibras/vlibras-web-browsers`) **não estão
no repositório**. `npm run player:fetch` (roda sozinho antes de `dev` e `build`) baixa uma revisão
fixa, confere o SHA-256 de cada arquivo e grava em `public/vlibras/`. Sem internet o app abre
normalmente e a tela de Projeção avisa "Player não instalado".

## Como o app conversa com o player

`VLibrasPlayer` (`src/modules/avatar/engine`) fala o protocolo `postMessage` do player:

- comandos: `playNow`, `stopAll`, `setSlider` (velocidade), `Change` (avatar), `setPauseState`,
  `setBaseUrl`, `setSubtitlesState` (sempre desligado - o player mostra por padrão a palavra sendo
  sinalizada acima do avatar, e isso nunca é uma configuração exposta a quem usa o app);
- eventos: `update_progress`, `on_load_player`, `on_playing_state_change`, `counter_gloss`,
  `get_avatar`, `on_error`.

A `avatar.store` guarda o estado (`checking`, `unavailable`, `loading`, `ready`, `error`), reaplica
as configurações quando o player fica pronto (ele esquece tudo ao reiniciar) e interpreta o slide
da vez quando `autoInterpret` está ligado. Se o player não terminar de carregar em 45 s, mostra
erro com botão "Tentar de novo".

## Sinais (dicionário)

Cada sinal é um _AssetBundle_ Unity (`UnityFS`) do dicionário público do VLibras
(`https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/<REGIÃO>/<SINAL>`). O player nunca fala com a
internet: ele pede `app://renderer/__signs__/<REGIÃO>/<SINAL>` e o processo principal
(`SignCache`) baixa o sinal **uma vez**, confere o cabeçalho `UnityFS` e guarda em
`userData/signs/`. Depois disso o sinal funciona sem internet. O app baixa antes os sinais do slide
atual e do próximo (`avatar:prefetch`). Sinais que o dicionário não tem ficam 5 min lembrados como
"inexistentes" para não repetir a consulta. Em Configurações dá para ver o espaço usado, limpar e
trocar o endereço do dicionário (por exemplo, uma cópia local).

## Protocolo `app://` e segurança

Em produção a interface é servida por `app://renderer/` (e não `file://`), porque o Unity precisa
de `fetch`/XHR. O manipulador (`electron/main/protocol.ts`):

- só serve arquivos dentro da pasta do renderer (tentativas de `..`, `%2e%2e`, NUL etc. dão 404);
- responde ao proxy de sinais;
- envia o CSP por caminho (`electron/main/security/csp.ts`): a aplicação continua estrita; só a
  página do player (`/vlibras/`) ganha `'unsafe-eval'` e `'wasm-unsafe-eval'`, e mesmo assim só
  conecta em `app://renderer`. O `iframe` roda com `sandbox` (scripts, mesma origem, pointer lock).

## Testes

- Unitários: `tests/unit/electron/avatar` (cache de sinais com dicionário falso, caminhos e CSP),
  `tests/unit/renderer/avatar.store.spec.ts`, `vlibras-player.spec.ts`, esquema das configurações.
- e2e: `tests/e2e/avatar.spec.ts`. Os testes que exigem o player pulam sozinhos se ele não foi baixado.

## Ainda não feito

- Nada pendente: a janela de overlay (fase 6) reaproveita a mesma camada do avatar. Veja
  [overlay.md](overlay.md).
