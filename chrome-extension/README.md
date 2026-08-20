# Letther B — Flashcards da Web

Extensão Manifest V3 para Google Chrome/Chromium.

## Instalar em modo desenvolvedor

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `chrome-extension`.
5. Abra as opções da extensão e confirme o endereço onde o Letther B está publicado.

## Usar

Selecione um trecho de qualquer página e use uma destas opções:

- botão direito → **Criar flashcards no Letther B**; ou
- clique no ícone da extensão, escolha de 1 a 10 cartões e clique em **Criar flashcards**.

O Letther B abre, envia o trecho à IA configurada no próprio app e mostra uma revisão dos cartões antes de salvá-los.

## Privacidade

A extensão não armazena a chave Gemini nem credenciais do Firebase. O texto selecionado é colocado temporariamente no fragmento `#` da URL do Letther B; o fragmento não faz parte da requisição HTTP e é removido da barra de endereço assim que o app o consome.
