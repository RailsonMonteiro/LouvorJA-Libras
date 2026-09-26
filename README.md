# LouvorJA Libras

Aplicativo desktop, open source e gratuito para igrejas, que se integra ao LouvorJA, recebe os
slides em tempo real e apresenta um avatar 3D fazendo a interpretação em Libras, inclusive como
overlay sobre a apresentação.

A arquitetura completa está no documento _LouvorJA Libras – Arquitetura Técnica e Estrutura do
Projeto Open Source_. Este repositório segue esse documento.

## Status

| Fase | Escopo                                                                                             | Status    |
| ---- | -------------------------------------------------------------------------------------------------- | --------- |
| 1    | Base: Electron, Vue, TypeScript, Vite, Vuetify, Pinia, Router, I18n, SQLite                        | Concluída |
| 2    | Integração com o LouvorJA (endereço, porta, token, slides e versículos)                            | Concluída |
| 4    | Libras: tradutor (motor local por regras, motor online opcional, cache, correção manual, catálogo) | Concluída |
| 3    | Avatar (player oficial do VLibras), escolha do avatar e tela de Projeção (prévia)                  | Concluída |
| 5    | Sincronização slide → tradução → sinais → avatar                                                   | Concluída |
| 6    | Overlay: janela transparente sobre a apresentação, escolha de tela, posição, escala e opacidade    | Concluída |
| 7    | IA (opcional): tradução automática já existe; apoio por modelo de linguagem não foi feito          | Opcional  |

## Requisitos

- Node.js 22.12 ou superior (recomendado: 24)
- npm 10 ou superior

## Comandos

```bash
npm install          # instala as dependências
npm run dev          # roda o app em modo desenvolvimento (HMR)
npm run build        # typecheck + build de produção em out/
npm run typecheck    # tsc (processo main) + vue-tsc (renderer)
npm run lint         # ESLint
npm run format       # Prettier
npm test             # testes unitários e de integração (Vitest)
npm run test:e2e     # build + testes end-to-end (Playwright + Electron)
npm run dist         # gera o instalador com electron-builder
npm run release      # gera e publica um release no GitHub (usado pelo CI ao empurrar uma tag "vX.Y.Z")
npm run brand:build   # refaz a logo (marca do LouvorJA + mãos de Libras) e os ícones do app em build/
npm run player:fetch  # baixa o player oficial do avatar para public/vlibras (roda antes de dev e build)
npm run libras:oracle    # gera as respostas oficiais do VLibras usadas como referência
npm run libras:benchmark # mede um motor de tradução contra essa referência
npm run mock:louvorja  # sobe um LouvorJA falso para testar a integração (veja docs/protocolo-louvorja.md)
```

> **Editores baseados em Electron (VS Code):** se o terminal integrado exportar
> `ELECTRON_RUN_AS_NODE=1`, o app inicia como Node puro e falha em `app.requestSingleInstanceLock`.
> Rode `unset ELECTRON_RUN_AS_NODE` (bash) ou `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell)
> antes de `npm run dev`. Os testes e2e já ignoram essa variável.

### Publicando uma nova versão

O app se auto-atualiza a partir dos releases do GitHub (veja "Atualizações" em
[docs/decisoes.md](docs/decisoes.md)). Para publicar uma:

1. Suba o campo `"version"` do `package.json` (ex.: `1.2.0` → `1.3.0`).
2. Crie e empurre uma tag igual, com o prefixo `v`: `git tag v1.3.0 && git push origin v1.3.0`.
3. O workflow `.github/workflows/release.yml` builda para Windows, macOS e Linux e publica tudo
   num release do GitHub - inclusive o `latest.yml` que os apps já instalados usam para se
   atualizar sozinhos.

## Licença

LGPL-3.0-only, a mesma do VLibras (veja [LICENSE](LICENSE)). O texto da licença é o do `vlibras-translate`.

## Idiomas

O aplicativo está disponível em três idiomas: **português (Brasil)**, **español** e **English**. As traduções ficam em `src/locales/`.

## Estrutura

Segue a seção 4 do documento de arquitetura. Pontos de atenção:

- `electron/main`: processo principal (janelas, IPC validado com Zod, segurança, menu).
- `electron/preload`: única ponte para o renderer (`window.louvorja`), via `contextBridge`.
- `electron/services`: serviços do processo principal (SQLite, configurações, logs).
- `src/types/ipc.ts`: contrato de IPC compartilhado entre main, preload e renderer.
- `database/migrations/*.sql`: migrações do SQLite, embutidas no build e aplicadas na inicialização.
- `electron/services/louvorja`: adapter da API do LouvorJA (consulta periódica), reconexão automática e recebimento de slides. Roda no processo principal.
- `src/modules/louvorja`: store, componentes e tela de conexão. `src/modules/slides`: slides recebidos.
- `scripts/mock-louvorja`: simulador do LouvorJA usado em desenvolvimento e nos testes.
- `src/modules/*`: módulos de interface (os demais chegam nas próximas fases).

## Documentação

- [docs/decisoes.md](docs/decisoes.md): decisões técnicas de cada fase.
- [docs/tradutor-libras.md](docs/tradutor-libras.md): análise do VLibras, o que foi implementado, como medir e o plano do porte.
- [docs/overlay.md](docs/overlay.md): sincronização, overlay sobre a apresentação, telas e limites.
- [docs/avatar.md](docs/avatar.md): escolha do avatar, tela de Projeção, player do VLibras, cache de sinais e protocolo `app://`.
- [docs/protocolo-louvorja.md](docs/protocolo-louvorja.md): como o servidor de transmissão do LouvorJA funciona (tirado do código dele) e como o app o consome.
