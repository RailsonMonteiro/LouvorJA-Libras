# Sincronização e overlay

Fases 5 e 6 do documento de arquitetura: o slide chega, é traduzido, os sinais são preparados e o
avatar interpreta, tudo ao mesmo tempo, sobre a apresentação.

## Sincronização (fase 5)

O caminho de cada slide é sempre o mesmo, e a tela **Projeção** mostra em que etapa ele está
("Sincronização": Slide → Tradução → Sinais → Avatar):

1. **Slide.** O LouvorJA manda o slide (o app consulta o servidor de transmissão).
2. **Tradução.** O texto vira glosa (correção manual → cache → online, se ligado → motor local).
3. **Sinais.** Os sinais da glosa são baixados do dicionário para o computador (`SignCache`). O app já
   deixa prontos, em segundo plano, também os sinais do **próximo** slide.
4. **Avatar.** Só então o avatar começa. Se os sinais demorarem mais de 2,5 s, ele começa mesmo assim e
   baixa o que faltar; a etapa "Sinais" fica em amarelo se algum não pôde ser baixado.

**Atraso para começar a interpretar.** Em Projeção → Avatar e ajustes há um controle de 0 a 15 s (de meio em meio
segundo; padrão 0). Se a letra entra no ar e a interpretação deve começar 3 s depois, ajuste 3 s. O
tempo conta a partir do momento em que o slide entrou no ar, então a tradução e o download dos sinais já
estão dentro dele (se demorarem mais que o atraso, o avatar começa assim que estiver pronto). Vale para
cada slide, na janela principal e no overlay, e a etapa "Avatar" da sincronização mostra "começa em N s".
Se outro slide chegar (ou a apresentação acabar) durante a espera, ela é descartada. Interpretar,
repetir e os outros botões da tela Projeção não esperam.

Regras que mantêm tudo em ordem (`avatar.store.ts`):

- Vale sempre o slide que está no ar. Se outro chegar enquanto o anterior espera seus sinais, o
  anterior é descartado e o avatar interrompe o que estiver fazendo (`playNow`).
- O mesmo slide não é interpretado duas vezes seguidas (a consulta ao LouvorJA repete o slide).
- Quando o slide some (fim da apresentação, slide em branco), o avatar para.
- Com "Interpretar cada slide automaticamente" desligado, nada disso dispara sozinho; os botões da
  tela Projeção continuam funcionando.

## Overlay (fase 6)

Uma janela **transparente, sempre por cima e sem cliques** cobre uma tela inteira e mostra só o avatar,
sobre a apresentação do LouvorJA (no telão ou no monitor da plateia). É aberta em **Projeção → Sobre a
apresentação (overlay)**.

- **Tela.** "Automática" usa a segunda tela, se houver, ou a única que existir. Dá para escolher uma
  tela específica; a escolha é lembrada. Se a tela sumir (projetor desligado), o overlay vai para a
  escolha automática, e volta a seguir a tela quando ela reaparecer.
- **Posição, escala e opacidade.** São as mesmas configurações da prévia. A prévia é uma miniatura da
  tela: o que se vê no palco é o que aparece no overlay (tamanho em % da altura da tela).
- **Só aparece durante a apresentação.** Com "Mostrar o avatar só durante a apresentação" ligado (o
  padrão), a janela fica aberta e transparente. O avatar aparece quando o **primeiro texto** entra no ar
  e fica visível, inclusive entre um slide e outro, até o **último texto** terminar; 1,5 s depois de a
  apresentação acabar (e do avatar terminar de interpretar), ele some com um esmaecer de 0,4 s
  (`useOverlayVisibility`). O player continua rodando por baixo, então não há atraso para reaparecer.
  Desligado, o avatar fica sempre à vista. A prévia da tela Projeção mostra sempre o avatar.
- **Abrir ao iniciar.** Opção para o overlay abrir sozinho quando o app começa.
- **Sempre na frente da apresentação.** No Windows, todas as janelas "sempre por cima" dividem uma só
  camada e a última usada fica na frente. A janela de apresentação do LouvorJA também é assim, e ao
  ser clicada passava por cima do avatar. O overlay se traz de volta para a frente a cada 0,4 s
  (`moveTop`, que não ativa a janela nem tira o teclado da apresentação).
- **Testar.** Interpretar, pausar, parar e repetir na tela Projeção valem também para o overlay.
- **Segurança e uso.** A janela não recebe foco nem mouse (`focusable: false`,
  `setIgnoreMouseEvents`), fica acima de janelas em tela cheia (`alwaysOnTop` no nível
  `screen-saver`) e fecha junto com a janela principal. Roda a mesma interface, na rota `#/overlay`
  (`src/modules/overlay/OverlayApp.vue`), com o mesmo `preload`, a mesma validação de IPC e a mesma CSP.

### Como funciona por dentro

- `electron/main/windows/OverlayController.ts` cria e posiciona a janela, acompanha as telas
  (`display-added`, `display-removed`, `display-metrics-changed`) e avisa todas as janelas do estado.
  A escolha da tela está em `displays.ts` (funções puras, testadas).
- O overlay é um segundo renderer completo: ele mesmo recebe os slides (mesmos eventos do LouvorJA),
  traduz, baixa os sinais e roda o player Unity. Por isso há **dois players** ativos com o overlay
  aberto (o da janela principal, mesmo fora da tela Projeção, e o do overlay). Em computadores fracos
  isso pesa; o player da janela principal não pode ser descarregado sem perder a prévia.
- As configurações são empurradas a todas as janelas (`settings:changed`), então mudar o avatar, a
  posição ou a região na janela principal atualiza o overlay na hora.
- A janela cobre a tela inteira (inclusive a barra de tarefas). No Windows, uma janela nova é limitada
  à área de trabalho; por isso as dimensões são pedidas de novo depois que ela existe.

### Limites conhecidos

- Windows com escala fracionária (125%, 150%) pode deixar a janela 1 a 2 pixels maior que a tela.
  Não tem efeito visível, porque o fundo é transparente.
- Em macOS/Linux o comportamento "acima de tudo" depende do gerenciador de janelas; só o Windows foi
  testado.
- O fundo do avatar é transparente, mas nada apaga o que estiver atrás dele: o avatar aparece sobre o
  conteúdo do LouvorJA, sem recorte. Se o slide tiver texto na região do avatar, o texto fica atrás.

## Fase 7 (IA, opcional)

Não implementada de propósito. A "tradução automática" da fase 7 já existe (motor local e motor online
opcional). O "apoio à estruturação em Libras" com um modelo de linguagem exigiria enviar o texto dos
slides a um serviço externo e guardar uma chave de API; o projeto trata isso como escolha explícita de
quem usa (como o tradutor online, que vem desligado). Se for desejado, o ponto de entrada é um novo
`GlossEngine` (ver `docs/tradutor-libras.md`), que já recebe texto e devolve glosa, com o mesmo aviso e
o mesmo interruptor.
