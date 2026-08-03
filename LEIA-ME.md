# Letther B — versão organizada com avisos apenas de erro

Esta versão conserva a lógica do arquivo original, mas separa apresentação, inicialização e funcionalidades.

## Estrutura

```text
Letther_B_apenas_erros/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── styles.css
├── js/
│   ├── theme-init.js
│   ├── 01-state.js
│   ├── 02-activity-history.js
│   ├── 03-firebase.js
│   ├── 04-cloudflare-r2.js
│   ├── 05-spaced-repetition.js
│   ├── 06-sound.js
│   ├── 07-gamification.js
│   ├── 08-decks-cards.js
│   ├── 09-import-export.js
│   ├── 10-ai-theme.js
│   ├── 11-ai-batch.js
│   ├── 12-photo-import.js
│   ├── 13-library.js
│   ├── 14-routine-agenda.js
│   ├── 15-study-session.js
│   ├── 16-language-session.js
│   ├── 17-epub-reader.js
│   ├── 18-notes.js
│   ├── 19-note-history.js
│   ├── 20-outline.js
│   ├── 21-active-outline.js
│   ├── 22-floating-notes.js
│   ├── 23-render.js
│   ├── 24-modals.js
│   ├── 25-utils-bootstrap.js
├── assets/
├── fonts/
└── original/
    └── index-original.html
```

## O que foi alterado

- O CSS saiu do `index.html` e foi para `css/styles.css`.
- O JavaScript foi separado por áreas funcionais, seguindo os marcadores que já existiam no código.
- A ordem dos scripts foi preservada para manter as dependências e os eventos `onclick` atuais.
- O `service worker` passou a armazenar os novos arquivos e teve o cache atualizado.
- O arquivo original foi incluído em `original/index-original.html` como segurança.

## Política de avisos desta versão

- Banners transitórios de sucesso, confirmação, progresso e informação foram desativados.
- Somente mensagens chamadas com o tipo `error` continuam aparecendo como toast.
- As telas de resultado dos exercícios, explicações de respostas e o painel de atividade em andamento foram preservados, pois fazem parte da interface funcional e não são notificações transitórias.
- O cache do Service Worker foi atualizado para forçar o carregamento desta versão.

## Como executar

Não abra apenas com duplo clique, porque Firebase, Service Worker e alguns recursos exigem servidor local/HTTPS. Na pasta do projeto, execute:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Próxima etapa recomendada

A divisão atual é conservadora: melhora muito a manutenção sem reescrever a arquitetura. Depois, os eventos `onclick` e o estado global podem ser migrados gradualmente para módulos ES, começando pelo Caderno de Notas.
