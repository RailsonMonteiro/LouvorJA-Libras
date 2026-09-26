# Decisões técnicas

## Fase 1 – Base

| Tema       | Decisão                                                                             | Motivo                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Build      | `electron-vite` (`electron.vite.config.ts`) no lugar de um `vite.config.ts` simples | Compila main, preload e renderer no mesmo pipeline. Equivale ao `vite.config.ts` do documento.                                     |
| Versões    | Vuetify 3 (o 4 já existe), Vite 7, TypeScript 6.0                                   | Vuetify 3 é o especificado. `electron-vite` 5 só suporta Vite ≤ 7 e `typescript-eslint` exige TypeScript < 6.1.                    |
| SQLite     | `node:sqlite`, embutido no Electron                                                 | Sem módulo nativo para recompilar (`better-sqlite3` exige toolchain C++ por plataforma). Dificulta menos a vida de quem contribui. |
| Migrações  | Arquivos `.sql` em `database/migrations`, embutidos via `import.meta.glob`          | Funcionam dentro do asar sem caminhos em tempo de execução. Cada migração roda numa transação.                                     |
| Esquema    | Só `settings` e `logs` na Fase 1                                                    | As demais tabelas do documento entram junto com o módulo que as usa. Isso evita projetar esquema antes da hora.                    |
| Roteamento | Hash history                                                                        | O app empacotado é servido por `file://`.                                                                                          |
| Ícones     | `@mdi/font`                                                                         | Funciona offline. Pode migrar para `@mdi/js` para reduzir o tamanho (o build inclui `.eot`/`.ttf` sem uso).                        |
| Idiomas    | pt-BR (padrão) e en, em JSON                                                        | Facilita contribuições de tradução.                                                                                                |

## Identidade visual (baseada no LouvorJA)

Analisada a partir do código-fonte do LouvorJA (Vue 3 + Vuetify 3, licença MIT):

- Cor primária `#0097d7`, acento amarelo `#ffc107`, tema escuro azul-marinho (barra lateral `#181722`, fundo `#262a3b`, cartões `#2f3449`) e tema claro `#f5f7fb`. Tokens em `src/styles/main.scss`.
- Raio de 12px, sombras suaves, barra de rolagem azul que fica amarela no hover.
- Barra de título própria de 32px (janela sem moldura), com botões estilo Windows ou estilo macOS conforme a plataforma.
- Barra lateral que recolhe para um trilho de ícones (72px) e expande no hover ou quando fixada; item ativo com gradiente azul.
- Cabeçalho de módulo com selo azul de 48px e título de 24px; selo de versão no canto inferior direito.
- Fonte Roboto (empacotada via `@fontsource/roboto`, funciona offline) e ícones MDI.
- Logo e ícones do app copiados do LouvorJA (`src/assets/images/logo.svg`, `build/icon.*`).
- **Não copiada:** a fonte DIN Condensed Bold que o LouvorJA usa nos slides. Verificar a licença antes de incluí-la.

## Segurança (seção 13 do documento)

- `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`.
- O renderer só enxerga `window.louvorja`. `ipcRenderer` nunca é exposto.
- Todo canal IPC é declarado em `src/types/ipc.ts`, valida o payload com Zod e só aceita chamadas
  vindas de páginas do próprio app (`electron/main/ipc/handle.ts`).
- CSP aplicada por cabeçalho de resposta (mais permissiva só no modo dev, por causa do HMR).
  Coberta por teste e2e.
- Permissões de sessão (câmera, microfone, etc.) negadas, navegação externa e `<webview>` bloqueados.

## Fase 2 – Integração com o LouvorJA

| Tema                | Decisão                                                                                                                                                               | Motivo                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onde roda a conexão | Processo principal (`electron/services/louvorja`), não o renderer como sugere a árvore do documento                                                                   | Mantém o CSP fechado (sem liberar `ws://` arbitrário) e, na Fase 6, as janelas de apresentação e overlay recebem os mesmos slides de um ponto único. O renderer só tem store, componentes e um cliente IPC fino em `src/modules/louvorja`. |
| Protocolo           | API HTTP do servidor de transmissão do LouvorJA desktop (v2, com v1 como reserva), por consulta periódica. Detalhes em [protocolo-louvorja.md](protocolo-louvorja.md) | O LouvorJA não usa WebSocket nem envia eventos: foi lido o código-fonte dele. O protocolo antes suposto (WebSocket) foi descartado.                                                                                                        |
| Adapters            | `LouvorJAApiAdapter` atrás da interface `LouvorJAAdapter`                                                                                                             | Um protocolo diferente no futuro só troca o adapter.                                                                                                                                                                                       |
| Token               | Guardado junto do endereço no SQLite; erro de token e servidor que não é o LouvorJA são **fatais** (sem reconexão automática)                                         | Tentar de novo não resolve. Da própria máquina o LouvorJA dispensa token.                                                                                                                                                                  |
| Reconexão           | Automática, espera de 1 s a 15 s (dobrando), até o usuário desconectar                                                                                                | Em cultos o LouvorJA pode abrir depois do app ou a rede oscilar.                                                                                                                                                                           |
| Erros               | O processo principal envia códigos (`unreachable`, `timeout`, `closed`, `http-status`, `unauthorized`, `incompatible`) e a interface traduz                           | Mensagens nos 3 idiomas sem texto fixo no backend.                                                                                                                                                                                         |
| Endereço            | Só IPv4 ou nome de host simples, validado no renderer e de novo no IPC (Zod)                                                                                          | Impede que `host` altere a URL (barras, portas, usuário).                                                                                                                                                                                  |
| Persistência        | Tabelas `connections`, `connection_history`, `presentations`, `presentation_slides` (migração 0002), com limpeza de 30 dias                                           | Base para os módulos de Slides e Ensaios.                                                                                                                                                                                                  |
| Mudança de estado   | Eventos empurrados para todas as janelas; a store assina primeiro e depois pede o snapshot                                                                            | Nenhum evento se perde na inicialização.                                                                                                                                                                                                   |
| Nova configuração   | `autoConnect` (padrão ligado)                                                                                                                                         | Reconecta ao último endereço que funcionou ao abrir o app.                                                                                                                                                                                 |

## Tradutor de Libras

| Tema               | Decisão                                                                                                   | Motivo                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Licença            | LGPL-3.0-only                                                                                             | Escolhida pelo usuário: é a licença do VLibras, o que permite portar código dele. Detalhes e riscos em [tradutor-libras.md](tradutor-libras.md). |
| Tradução           | Vários motores atrás de `GlossEngine`: correção manual → cache → motores → palavras do slide              | O porte para TypeScript é longo. A interface deixa o motor local entrar sem mexer no resto.                                                      |
| Motor online       | Opcional e **desligado por padrão**, com endereço configurável                                            | O texto sai do computador. Quem hospedar a própria instância só troca o endereço.                                                                |
| Onde roda          | Processo principal                                                                                        | Mesmo motivo da conexão com o LouvorJA: CSP fechado e uma única fonte para todas as janelas.                                                     |
| Catálogo de sinais | Baixado sob demanda e guardado no SQLite, nunca embutido                                                  | Os dados são de terceiros, sem licença declarada.                                                                                                |
| Avatar             | Player Unity oficial do VLibras (próxima etapa)                                                           | Os sinais são _AssetBundles_ do Unity e não carregam no Three.js. A interface de motor de avatar deixa um Three.js próprio entrar depois.        |
| Validação          | Corpus de 65 frases + respostas do serviço oficial (`tests/fixtures/libras`) e `npm run libras:benchmark` | Permite medir cada etapa do porte com número.                                                                                                    |

## Avatar e Projeção

| Tema              | Decisão                                                                                                  | Motivo                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Player            | Unity WebGL oficial do VLibras num `iframe`, baixado por `npm run player:fetch` (revisão fixa + SHA-256) | Os sinais são AssetBundles Unity. Não commitar evita redistribuir binários grandes e deixa a origem clara. |
| Interface         | `app://renderer` em produção no lugar de `file://`                                                       | O Unity usa XHR/fetch, que `file://` bloqueia.                                                             |
| CSP               | Estrito na aplicação; `unsafe-eval`/wasm só na página do player, que só conecta em `app://`              | O player não é nosso para alterar e exige eval e WebAssembly.                                              |
| Sinais            | Proxy `app://renderer/__signs__/…` no processo principal, com cache em disco                             | Baixa uma vez e funciona offline; o player não acessa a internet; valida o cabeçalho `UnityFS`.            |
| Camada do avatar  | Uma só `AvatarLayer` global, posicionada sobre qualquer "palco"                                          | O Unity carrega uma vez (~5 s) e a mesma camada servirá à janela de projeção da fase 6.                    |
| Escolha do avatar | Ícaro, Guga ou Hosana em `settings`; posição, tamanho, opacidade, velocidade e região também             | Pedido do usuário: escolher o avatar e ver como está sendo projetado.                                      |

## Sincronização e overlay

| Tema          | Decisão                                                                                                              | Motivo                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Ordem         | Slide → tradução → sinais → avatar; o avatar espera os sinais até 2,5 s                                              | Sem os sinais o avatar trava no meio da frase. Esperar mais atrasaria a interpretação.     |
| Slide atual   | Vale sempre o slide no ar; o anterior é descartado. Sem slide, o avatar para                                         | Nunca interpretar um slide que já saiu da tela.                                            |
| Overlay       | Segunda `BrowserWindow` transparente, `alwaysOnTop`, sem foco e sem mouse, com a mesma interface na rota `#/overlay` | Reaproveita stores, IPC e segurança. Não toma o teclado nem o mouse da apresentação.       |
| Onde roda     | Cada janela tem seu player e recebe os slides pelos mesmos eventos                                                   | Sem passar vídeo entre processos. Custa dois players quando o overlay está aberto.         |
| Configurações | O processo principal empurra toda mudança de configuração a todas as janelas                                         | O overlay segue a janela principal (avatar, posição, escala) sem consulta.                 |
| Fase 7 (IA)   | Não implementada; o ponto de entrada seria um novo `GlossEngine`, opcional e desligado por padrão                    | Exige mandar texto a um serviço externo e guardar uma chave de API: é escolha de quem usa. |

## Tela de abertura

| Tema         | Decisão                                                                                                       | Motivo                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Onde         | HTML e CSS puros no `index.html`, fora do `#app`                                                              | Aparece no primeiro quadro, antes de qualquer script. Não depende do Vue nem de estilos que ainda não carregaram. |
| O que espera | Configurações, estado da conexão, código de **todas** as telas, fontes e o player do avatar                   | Nada precisa ser buscado no meio de um culto: a primeira visita a cada tela não trava.                            |
| Limite       | Espera o avatar por até 20 s; sem player instalado ou com erro, segue                                         | O app nunca fica preso na abertura.                                                                               |
| Overlay      | A janela do overlay não mostra a tela de abertura (`insertCSS` no `dom-ready` e remoção no início)            | Ela é transparente e não deve aparecer nada além do avatar.                                                       |
| Cor          | Segue o tema do sistema (claro ou escuro), porque o tema do app só é conhecido depois de ler as configurações | Evita um clarão de cor errada na abertura.                                                                        |

## Desenvolvimento (`npm run dev`)

- **Tela em branco por segundos ao abrir uma página nova (corrigido).** O `autoImport` do
  `vite-plugin-vuetify` gera importações profundas (`vuetify/components/VBtn`) que o varredor do Vite
  não enxerga na largada. Cada componente novo era "descoberto" ao abrir a página, o Vite
  reotimizava as dependências (`optimized dependencies changed. reloading`) e recarregava a janela
  inteira, que ficava vazia até terminar. A correção é `optimizeDeps: { exclude: ['vuetify'] }` em
  `electron.vite.config.ts` (configuração recomendada pelo Vuetify). Não afeta o build de produção.
  Se voltar a aparecer `optimized dependencies changed` no terminal do `npm run dev`, é este problema.
- **Janela em branco e `Failed to fetch dynamically imported module` depois de reiniciar o `npm run dev` (corrigido).**
  O Vite marca os módulos de dependências (`?v=...`) como imutáveis por um ano, e os estilos do
  Vuetify são módulos virtuais que só o servidor em execução conhece. Ao reiniciar o servidor, a janela
  pegava os scripts do Vuetify do cache em disco e pedia ao servidor novo estilos que ele nunca tinha
  gerado (`404 /@id/virtual:plugin-vuetify:components/VMain/VMain.sass`). Em dev, o processo principal
  agora limpa o cache ao abrir e responde tudo do servidor de dev com `Cache-Control: no-cache` (sempre revalida)
  (`electron/main/security/index.ts`). No terminal, as linhas `[window]`, `[net]` e `[renderer]` mostram o
  tempo de carga e qualquer falha.
- Antivírus e bloqueadores (por exemplo o AdGuard) injetam scripts nas páginas do Electron em modo dev.
  O CSP os bloqueia e o console mostra avisos de `local.adguard.org`. É inofensivo.
- **Página em branco ao clicar em qualquer item do menu, só em `npm run dev` (corrigido).** O
  `<router-view>` trocava de página com `<Transition mode="out-in">` (a antiga sai, só então a nova
  entra). Só no servidor de desenvolvimento — nunca no build — a primeira vez que uma rota abria
  por navegação (diferente de já ter sido pré-carregada) a transição ficava presa: a página antiga
  saía e a nova nunca chegava a entrar, sem nenhum erro no console. Rodar `pageLoaders` (que
  pré-carrega as páginas na tela de abertura) chamando as mesmas funções que o roteador usaria não
  era a causa; o `mode="out-in"` em si, combinado ao empacotamento das páginas em modo dev, é.
  A correção tirou o `mode="out-in"`: a página que sai agora vira `position: absolute` (some da
  disposição normal, sem alongar nem repetir a rolagem) enquanto a que entra já ocupa o lugar normal
  desde o início (`src/app/App.vue`). Visualmente idêntico; funciona em dev e em produção.
- **Troca de aba "travando" (corrigido).** A correção acima ainda fazia as duas páginas existirem e
  serem pintadas ao mesmo tempo por um instante (a que sai, com fade e `position: absolute`, sobre a
  que entra) - em páginas mais pesadas (Projeção com o avatar, Configurações com vários cartões) isso
  bastava para travar visivelmente a troca. A correção final tirou a transição de saída: a página
  antiga é só removida, sem "position: absolute" nem fade nenhum; só a que entra continua com um
  fade leve (0.15 s). Sem sobreposição, não tem o que travar.
- **Avatar desaparecendo da tela de Projeção (corrigido).** A correção acima, ao tirar o
  `position: absolute` da página que sai, não a remove de fato no mesmo instante: o Vue ainda leva
  um ou dois quadros para desmontá-la mesmo sem transição para esperar. Nesse intervalo as duas
  páginas coexistem em fluxo normal, e a que sai (agora sem `position: absolute`) empurra a que
  entra para baixo pela própria altura. O `useAvatarPlacement` mede a posição do palco de Projeção
  logo ao montar - lê esse empurrão, calcula um recorte (`clip-path`) errado e nunca corrige depois,
  porque só observa o tamanho do próprio palco (que não muda) e não sua posição. Corrigido devolvendo
  `position: absolute` só à página que sai (`.page-leave-active`, `src/app/App.vue`) - ela some da
  disposição normal de novo, sem transição nenhuma (continua removida "de uma vez", sem travar),
  mas também sem empurrar a página que chega enquanto ainda existe.

## Pendências conhecidas

- Ícone do aplicativo (`build/icon.*`).
- `appId` (`org.louvorja.libras`) é provisório.
- Assinatura de código e atualização automática (módulo "Atualizações") ficam para depois.
