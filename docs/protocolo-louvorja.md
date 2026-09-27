# Integração com o servidor de transmissão do LouvorJA

Este documento descreve como o LouvorJA (versão desktop em Delphi, pasta `desktop-main`) transmite
o que está na tela, e como o LouvorJA Libras o consome. Tudo foi tirado da leitura do código-fonte
do LouvorJA (`fmTransmitir.pas`, `fmMusica.pas`, `fmMenu.pas`, `server/`). **Ainda não foi
verificado contra o programa em execução**: veja a seção 6.

## 1. Como o servidor funciona

O LouvorJA tem um servidor HTTP embutido (componente Indy `IdHTTPServer`), ligado na aba
**Transmitir** com o botão _Iniciar Servidor_.

| Item                  | Valor                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Protocolo             | HTTP simples. **Não há WebSocket nem envio espontâneo**: quem quer saber o que está na tela precisa perguntar |
| Porta padrão          | `7070` (se a porta estiver ocupada, o programa sorteia outra e tenta de novo)                                 |
| Onde escuta           | no IP da rede local escolhido na aba, e também em `127.0.0.1`                                                 |
| Token                 | 5 letras/números, gerado ao iniciar pela primeira vez (botão de atualizar na aba)                             |
| Configuração salva em | `%APPDATA%\LouvorJA\configPT.ja`, seção `[Servidor]` (`URL`, `Porta`, `Token`, `Conectar`)                    |

Endereços que o programa mostra na aba: a página de controle remoto (`/?token=...`) e as saídas para
OBS/vMix (`/musica?transmissao`, `/musica?retorno`, `/biblia?transmissao`). Essas páginas leem o
arquivo `server/file/file.ja` a cada 500 ms, o que confirma que o modelo do programa é consulta
periódica.

### Autenticação

- Da **mesma máquina** (conexão em `127.0.0.1`), nenhum token é exigido.
- De **outra máquina**, o token é obrigatório, senão a resposta é `401` com `INVALID_TOKEN`.
- v2: cabeçalho `Authorization: Bearer <token>` (preferido) ou `?token=`. v1: só `?token=`.

### "Token recusado" em alguns computadores (Windows 11 Home Single Language) - 2026-09-23

Relato: em alguns computadores (não todos - Windows 11 Home Single Language é o padrão comum
entre eles) a conexão dá "O LouvorJA recusou o token" mesmo com o endereço, a porta e a mesma
rede confirmados certos. `LouvorJAApiAdapter.request()` só produz esse erro quando o LouvorJA
responde HTTP `401` de verdade (`response.status === 401`) - ou seja, o servidor está mesmo
recusando o que foi enviado, não é um bug de classificação do lado de cá.

`isValidToken` (`^[A-Za-z0-9._~-]{0,64}$`) já garante que nada invisível (espaço de largura
zero, BOM) passa despercebido - se houvesse um caractere assim, o erro seria "o token só pode ter
letras e números", não "recusado". Isso aponta para algo que muda o texto mas mantém os
caracteres dentro desse conjunto - a explicação mais provável: o recurso do Windows 11 "Mostrar
sugestões de texto ao digitar no teclado físico" (Configurações → Hora e idioma → Digitação →
Configurações avançadas de teclado), que **vem ligado por padrão em instalações de consumidor
recentes** (comum em notebooks OEM vendidos com Home Single Language) e capitaliza/corrige
palavras conforme a pessoa digita - inclusive a primeira letra de qualquer campo, como se fosse o
início de uma frase. Isso muda maiúscula/minúscula sem a pessoa notar, e o token do LouvorJA é
comparado da forma exata (case-sensitive).

**Por que só nesses computadores**: esse recurso é dos que variam por edição/instalação -
comum em instalações "prontas para uso" de consumidor, e frequentemente desligado (por política
de grupo, ou por quem configurou a máquina) em instalações Pro/corporativas. Não é exclusivo do
Windows 11 Home Single Language, mas é o perfil de máquina onde ele mais aparece ligado por
padrão.

**Mitigado, não comprovadamente corrigido** (`ConnectionForm.vue`): os campos de Endereço e
Token pedem `autocapitalize="off"` e `autocorrect="off"` (além do `spellcheck="false"` e do
`autocomplete="off"` que já tinham). Isso continuou acontecendo depois dessa mudança - os
atributos HTML controlam o comportamento do próprio Chromium (autocapitalização pensada para
teclado virtual/toque), não o recurso do Windows 11 em si (que atua na camada TSF do sistema);
não há garantia de que um sempre implica o outro.

### Atalho que evita o problema por completo (2026-09-26)

Em vez de tentar impedir que o sistema altere o texto enquanto a pessoa digita, o formulário
agora reconhece o link que o próprio botão "Copiar Link" do LouvorJA (aba Transmitir) coloca na
área de transferência - `http://<endereço>:<porta>/?token=<token>` - e, ao colar esse link em
**qualquer** campo do formulário de conexão, preenche endereço, porta e token de uma vez
(`parseLouvorJALink`, `src/modules/louvorja/types/louvorja.types.ts`; colagem tratada em
`ConnectionForm.vue`). Assim o token nunca passa pelo teclado nem por nenhum recurso de
sugestão/autocorreção do Windows - a colagem entrega exatamente os bytes que o LouvorJA gerou,
sem digitação manual em nenhum dos dois lados. Resolve o problema não importa qual seja a causa
exata do lado do Windows.

### Pista encontrada no código-fonte do LouvorJA (2026-09-26)

Lendo o código-fonte do LouvorJA (Delphi, projeto `desktop-main`), o caminho que a v2 realmente
usa - cabeçalho `Authorization: Bearer <token>`, lido direto de `RawHeaders` em `v2TokenValido`
(`fmTransmitir.pas`) - não passa por nenhuma decodificação de charset (isso só afetaria acentos,
não letras/dígitos comuns) nem por transformação de maiúscula/minúscula. Ou seja: o cabeçalho
HTTP, que é o que `LouvorJAApiAdapter` de fato envia (`dialect` começa em `'v2'`), parece limpo.

O que chama atenção é outra coisa, em `TfmIndex.lerParam` (`fmMenu.pas`): se a leitura do arquivo
de configuração (`TIniFile.ReadString`) lançar qualquer exceção - arquivo temporariamente
bloqueado por outro processo, antivírus, etc. - o erro é só logado, e a função **devolve o valor
default que foi passado**, silenciosamente. O ponto que carrega o token na inicialização
(`fmIniciando.pas`, por volta da linha 295) passa como default `fTransmitir.geraToken()` - **uma
função que gera um token novo e aleatório a cada chamada**, diferente do padrão correto já usado
em outros dois lugares do mesmo arquivo (`if (trim(...) = '') then ... := geraToken();`, que só
gera um novo token se o campo estiver de fato vazio). Se essa leitura falhar nessa hora - mais
plausível em máquinas de consumidor com antivírus/OneDrive mais agressivo, o perfil comum do
Windows 11 Home Single Language citado no relato original - o campo na tela mostra um token
**diferente** do que está (ou ficará) gravado no arquivo, e toda comparação seguinte falha.
Ainda não confirmado ao vivo (não há como reproduzir sem uma máquina afetada), mas é uma causa
plausível e teria o mesmo sintoma. Correção proposta, não aplicada ainda por ser noutro projeto:
trocar aquele `lerParam('Servidor', 'Token', fTransmitir.geraToken())` por
`lerParam('Servidor', 'Token', '')` seguido do mesmo idioma `if vazio then geraToken()` já usado
alhures.

Também foi adicionado um log de aviso (`LouvorJAApiAdapter`, campo `onWarning`) sempre que o
LouvorJA responde 401: registra o _tamanho_ do token enviado e seu primeiro/último caractere
(nunca o token inteiro), para comparar com o que a aba Transmitir mostra na próxima vez que
alguém relatar o problema - sem essa comparação, qualquer teoria continua sendo só teoria.

**Ainda não confirmado contra uma máquina real com o problema** - a pessoa que relatou pode
testar de novo depois desta correção, ou desligar o recurso à mão (o caminho do Windows acima)
para confirmar se é mesmo essa a causa enquanto isso.

### API v2 (`/api/v2/...`, documentada em `server/api-v2.html`)

Resposta sempre em JSON UTF-8 com `status`, `action` e `code` (o `code` é o contrato estável).

| Chamada                                              | Resposta que usamos                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v2/ping`                                   | `{"status":"ok","code":"PONG","app":"LouvorJA","version":"26.8.9716.65265"}`                                                                               |
| `GET /api/v2/song-slides?action=slide&slide=current` | com música: `{"code":"SONG_PLAYING","playing":true,"slide":"TEXTO\nDA LINHA","which":"current"}`; sem música: `{"code":"NO_SONG_PLAYING","playing":false}` |
| `GET /api/v2/song-slides?action=slide&slide=next`    | igual, com `"slide":""` e `"is_last":true` no último                                                                                                       |
| `GET /api/v2/bible?action=status`                    | `{"ready":true,"text":"\"Versículo...\"","reference":"João 3:16 (ARA)","version":"ARA",...}`                                                               |

Códigos HTTP: `401` token, `409` o estado do programa impede, `503` a interface não respondeu em
5 s (costuma ser uma janela modal aberta no LouvorJA).

### API v1 (`/api/...`, versões mais antigas)

| Chamada                                                     | Resposta                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/ping`                                             | `{"status":"ok","app":"LouvorJA"}`                                                                                                               |
| `GET /api/song-slides?action=get-slide&slide=current\|next` | `{"code":"SONG_PLAYING","message":"TEXTO"}`; sem música `{"code":"NO_SONG_PLAYING","message":""}`; depois do último slide, `next` traz `< FIM >` |

Particularidade do programa: numa rota desconhecida (por exemplo `/api/v2/ping` num LouvorJA antigo) ele
**responde 200 com a página 404**, e não um 404 de verdade. Por isso a detecção da versão da API olha
o corpo da resposta.

## 2. O que o LouvorJA envia, e o que não envia

- O texto do slide vem **em MAIÚSCULAS** (`Ansiuppercase` no código do programa), com uma quebra de
  linha por linha do slide.
- Não há **identificador** do slide, **posição** (n de N) nem **título**. O primeiro slide de uma
  música é a capa (título e álbum).
- O tipo do slide (`capa`, `letra`...) só existe no arquivo `file.ja`, que não usamos.
- Não há evento de "música aberta" ou "música fechada": deduzimos por `playing`.

## 3. Como o LouvorJA Libras usa isso

`electron/services/louvorja/adapters/LouvorJAApiAdapter.ts` faz uma consulta a cada 700 ms e
transforma mudanças em eventos:

1. `connect`: `ping` na v2; se a resposta não for do LouvorJA, tenta a v1. Resposta 401 vira erro de
   token; resposta que não é do LouvorJA vira "servidor incompatível". Ambos são **fatais** (não adianta
   tentar de novo).
2. Cada consulta pergunta o slide atual. Só quando ele **muda** pergunta também o próximo (uma
   requisição a menos por ciclo), que serve para traduzir o próximo slide com antecedência.
3. Sem música tocando, consulta o versículo da Bíblia. Música tem prioridade.
4. Ao começar uma música, abre uma _apresentação_ (título = primeira linha do primeiro slide); ao
   `playing` virar falso, fecha.
5. `503`/`409` e slide em branco **mantêm** o que já estava na tela, em vez de fechar a apresentação.
6. Falhas de rede seguidas (3) contam como conexão perdida e o serviço reconecta sozinho com espera
   crescente (1 s até 15 s). A versão do LouvorJA e a API detectada aparecem na tela de conexão.

Antes de traduzir, o texto em maiúsculas recebe de volta a caixa normal (`restoreCase`), porque o
tradutor do VLibras usa maiúsculas como pista de nome próprio. No teste com o serviço oficial, 18 de
20 frases davam o mesmo resultado, e as outras 2 pioravam (`O MEU PASTOR`).

## 4. Limitações conhecidas

- **Consulta, não evento.** Se o operador passar dois slides em menos de 700 ms, o do meio não é
  visto. Para tradução isso não importa.
- **Slides idênticos em sequência** (por exemplo o mesmo refrão duas vezes) não se distinguem: o
  segundo não gera evento.
- **Sem posição do slide**: a tela mostra "Slide n de N" só quando esse dado existe, e hoje não existe.
- **Versículo antigo**: o estado da Bíblia continua no programa depois de projetado. Se nenhuma
  música estiver tocando, o último versículo pode aparecer como "na tela".
- O LouvorJA da versão nova (Vue/Electron, pasta `LouvorJA`) tem só um servidor de arquivos na porta
  7070 e **não** tem esta API.

## 5. Como testar sem o LouvorJA

```bash
npm run mock:louvorja -- --port 7070 --interval 4
npm run mock:louvorja -- --token AB12c        # exige token, como uma conexão de outra máquina
npm run mock:louvorja -- --dialect v1         # imita um LouvorJA antigo
```

O simulador (`scripts/mock-louvorja/server.mts`) reproduz as respostas acima, inclusive o `503`
quando ocupado, a resposta 200 com página 404 da v1 e o token. É usado por todos os testes de
integração e e2e.

## 6. O que ainda precisa ser conferido com o programa de verdade

O simulador foi escrito a partir do código-fonte, então o que falta provar é se o programa real, com
o Indy, responde exatamente assim. Roteiro (2 minutos):

1. No LouvorJA, aba **Transmitir**, anote o endereço, a porta e o token e clique em _Iniciar Servidor_.
2. No LouvorJA Libras, página **LouvorJA**, informe esses dados e conecte. A linha "Programa:
   LouvorJA _versão_ (API v2)" confirma que achou o programa certo.
3. Abra uma música e avance os slides: a página **Slides** deve acompanhar, com o texto em maiúsculas.
4. Feche a música e projete um versículo na aba Bíblia: ele deve aparecer com a referência.

Neste computador o LouvorJA está configurado em `192.168.110.1:4560` (não em 7070).
