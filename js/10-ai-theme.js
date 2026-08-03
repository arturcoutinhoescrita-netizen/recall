/* ============ AI CALLS ============ */
/* ============ TEMA (claro/escuro) ============ */
function getTheme(){ return localStorage.getItem('recall_theme') || 'dark'; }
function applyTheme(theme){
  document.documentElement.setAttribute('data-recall-theme', theme === 'light' ? 'light' : 'dark');
  const tc = document.getElementById('theme-color-meta'); if(tc) tc.content = theme==='light' ? '#FAF8F5' : '#14162B';
  const sb = document.getElementById('status-bar-style-meta'); if(sb) sb.content = theme==='light' ? 'default' : 'black-translucent';
}
function toggleTheme(){
  const next = getTheme() === 'light' ? 'dark' : 'light';
  localStorage.setItem('recall_theme', next);
  applyTheme(next);
  render(); // atualiza o texto do link no rodapé
}

function getApiKey(){ return localStorage.getItem('recall_gemini_api_key') || ''; }
function setApiKey(key){ localStorage.setItem('recall_gemini_api_key', (key||'').trim()); }
// segunda chave opcional (de outra conta Google) — usada como reforço quando a
// principal estoura a cota, pra somar os limites gratuitos das duas contas.
function getApiKey2(){ return localStorage.getItem('recall_gemini_api_key_2') || ''; }
function setApiKey2(key){ localStorage.setItem('recall_gemini_api_key_2', (key||'').trim()); }
function getBooksApiKey(){ return localStorage.getItem('recall_books_api_key') || ''; }
function setBooksApiKey(key){ localStorage.setItem('recall_books_api_key', (key||'').trim()); }

// modelo usado só pra ler foto e gerar as perguntas (função da câmera); o resto do
// app (pergunta aberta, tradução, múltipla escolha etc.) usa GEMINI_MODEL_TEXT.
// Os dois também servem de fallback um do outro quando a cota estoura (veja callGemini).
const GEMINI_MODEL_VISION = "gemini-3.1-flash-lite";
const GEMINI_MODEL_TEXT = "gemini-3.5-flash-lite";
async function callGeminiOnce(prompt, opts, key, model){
  const parts = [{ text: prompt }];
  if(opts.imageBase64) parts.push({ inline_data: { mime_type: opts.imageMime || 'image/jpeg', data: opts.imageBase64 } });
  // os modelos "flash" atuais do Gemini gastam uma parte imprevisível do limite de tokens
  // em raciocínio interno (não aparece na resposta) antes de escrever o texto visível —
  // sem essa folga, respostas curtas saem cortadas no meio (finishReason: MAX_TOKENS). A
  // folga de +800 sozinha não bastava, daí a tentativa de desligar esse raciocínio de vez
  // com thinkingConfig.thinkingBudget:0. Só que nem todo modelo/variante aceita esse campo
  // -- descobrimos na prática que pelo menos um deles responde 400 (Bad Request) quando ele
  // vem no corpo, o que trocar de chave OU de modelo não resolve (os dois recebem o mesmo
  // corpo inválido). Por isso: tenta primeiro COM thinkingConfig; se der 400, tenta nessa
  // MESMA chave/modelo de novo, sem esse campo, antes de desistir -- assim continua evitando
  // resposta cortada onde o modelo aceita, sem travar onde não aceita.
  const makeBody = (withThinking) => {
    const generationConfig = { maxOutputTokens: (opts.maxTokens||400) + 800 };
    if(withThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    // O agente da nota depende de uma resposta que a aplicação consiga ler e
    // executar. Pedir JSON ao modelo no prompt ajuda, mas não impede que ele
    // acrescente uma frase antes/depois do objeto; o MIME type torna o contrato
    // explícito na própria API.
    if(opts.responseMimeType) generationConfig.responseMimeType = opts.responseMimeType;
    const b = { contents: [{ parts }], generationConfig };
    if(opts.useSearch) b.tools = [{ google_search: {} }];
    return b;
  };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const doFetch = (body) => fetch(endpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
  let resp = await doFetch(makeBody(true));
  if(!resp.ok && resp.status === 400){
    resp = await doFetch(makeBody(false));
  }
  if(!resp.ok){
    const errBody = await resp.text().catch(()=> '');
    const err = new Error('api_error');
    err.code = 'api_error'; err.status = resp.status; err.detail = errBody;
    throw err;
  }
  const data = await resp.json();
  const candidate = (data.candidates||[])[0];
  const text = (candidate && candidate.content && candidate.content.parts) ? candidate.content.parts.map(p=>p.text||'').join('') : '';
  if(!text){ const err = new Error('empty_response'); err.code = 'empty_response'; throw err; }
  return text;
}
// tenta o modelo pedido na chave principal; se a cota estourar (429) ou o serviço
// estiver sobrecarregado (503), cai pro outro modelo na mesma chave e, se houver
// uma segunda chave configurada (outra conta Google), repete a mesma dupla de
// modelos nela — assim usa toda cota disponível nas duas contas antes de desistir.
// Qualquer outro tipo de erro (prompt ruim, resposta vazia etc.) não é retentado,
// já que trocar de chave/modelo não resolveria.
async function callGemini(prompt, opts){
  opts = opts || {};
  const key1 = getApiKey();
  if(!key1){ const err = new Error('missing_api_key'); err.code = 'missing_api_key'; throw err; }
  const key2 = getApiKey2();
  const preferredModel = opts.model || GEMINI_MODEL_TEXT;
  const otherModel = preferredModel === GEMINI_MODEL_TEXT ? GEMINI_MODEL_VISION : GEMINI_MODEL_TEXT;
  const attempts = [{ key: key1, model: preferredModel }, { key: key1, model: otherModel }];
  if(key2) attempts.push({ key: key2, model: preferredModel }, { key: key2, model: otherModel });

  let lastErr;
  for(let i=0; i<attempts.length; i++){
    try{
      return await callGeminiOnce(prompt, opts, attempts[i].key, attempts[i].model);
    }catch(e){
      lastErr = e;
      const isQuotaError = e && e.code === 'api_error' && (e.status === 429 || e.status === 503);
      if(!isQuotaError) throw e;
    }
  }
  throw lastErr;
}

async function generateDistractors(question, correctAnswer){
  const prompt = `Pergunta: ${question}\nResposta correta: ${correctAnswer}\n\nGere exatamente 3 alternativas ERRADAS, plausíveis, curtas e no mesmo estilo/formato da resposta correta, para um quiz de múltipla escolha. As alternativas devem poder confundir alguém que não sabe bem o assunto, mas precisam estar objetivamente erradas. Responda SOMENTE com um array JSON de 3 strings, sem nenhum texto antes ou depois. Exemplo de formato: ["alternativa 1", "alternativa 2", "alternativa 3"]`;
  const text = (await callGemini(prompt, { maxTokens: 300 })).trim();
  const clean = text.replace(/```json|```/g,"").trim();
  const arr = JSON.parse(clean);
  if(!Array.isArray(arr) || arr.length < 3) throw new Error('formato inesperado');
  return arr.slice(0,3);
}

async function verifyOpenAnswer(question, referenceAnswer, userAnswer){
  const prompt = `Pergunta: ${question}\nResposta de referência: ${referenceAnswer}\nResposta dada pelo usuário: ${userAnswer}\n\nUse a busca na internet se precisar checar fatos atuais ou específicos. Avalie se a resposta do usuário está correta em conteúdo (não precisa ser idêntica em palavras). Termine sua resposta com uma linha, exatamente neste formato: "VEREDITO: CORRETO" ou "VEREDITO: INCORRETO", seguida de uma explicação de no máximo 2 frases sobre por quê.`;
  // a busca no Google (useSearch) tem uma cota gratuita bem mais restrita que as
  // chamadas comuns e costuma estourar (429) rapidinho; se isso acontecer, refaz
  // a verificação sem busca (só com o conhecimento do modelo) em vez de falhar.
  let text;
  try{
    text = await callGemini(prompt, { maxTokens: 600, useSearch: true });
  }catch(e){
    if(e && e.code === 'api_error' && e.status === 429){
      text = await callGemini(prompt, { maxTokens: 600, useSearch: false });
    } else {
      throw e;
    }
  }
  const isIncorrect = /VEREDITO:\s*INCORRETO/i.test(text);
  const isCorrect = !isIncorrect && /VEREDITO:\s*CORRETO/i.test(text);
  let explanation = text.split(/VEREDITO:\s*(CORRETO|INCORRETO)/i).pop().trim();
  if(!explanation) explanation = text.trim().slice(-280);
  return { correct: isCorrect, explanation };
}

async function generateFlashcardsFromImage(base64Data, mimeType, count, avoidFronts){
  count = count || 3;
  const avoidText = (avoidFronts && avoidFronts.length)
    ? `\n\nJá existem estes flashcards aprovados sobre essa mesma imagem — NÃO repita essas perguntas nem o mesmo foco, gere outras diferentes:\n${avoidFronts.map(f => `- ${f}`).join('\n')}`
    : '';
  const prompt = `Esta imagem é uma foto de uma página de livro. Leia e entenda o texto da página e crie exatamente ${count} flashcard(s) de pergunta e resposta em português sobre o conteúdo principal dela. As perguntas devem ser objetivas e as respostas curtas e diretas. Para cada flashcard, escreva também uma nota breve (1-2 frases) com uma explicação um pouco mais elaborada do conteúdo, pra consultar depois durante o estudo.${avoidText}\n\nResponda SOMENTE com um JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:\n[{"front":"pergunta","back":"resposta objetiva","note":"breve explicação do conteúdo"}, ...]`;
  const text = (await callGemini(prompt, { maxTokens: 300*count, imageBase64: base64Data, imageMime: mimeType, model: GEMINI_MODEL_VISION })).trim();
  const clean = text.replace(/```json|```/g,"").trim();
  const arr = JSON.parse(clean);
  if(!Array.isArray(arr) || arr.length === 0) throw new Error('formato inesperado');
  return arr.slice(0,count).map(c => ({
    front: String((c && c.front) || '').trim(),
    back: String((c && c.back) || '').trim(),
    note: String((c && c.note) || '').trim()
  })).filter(c => c.front && c.back);
}

function getSentenceDifficulty(deck){
  return deck && deck.sentenceDifficulty === 'easy' ? 'easy' : 'intermediate';
}
function sentenceDifficultyInstruction(difficulty){
  if(difficulty === 'easy') return 'A frase deve ser MUITO curta (de 4 a 8 palavras), usar vocabulário cotidiano e estruturas básicas de nível iniciante (A1/A2). Use uma única oração simples, de preferência no presente. Não use palavras avançadas, expressões idiomáticas, orações subordinadas ou pontuação complexa.';
  return 'Use nível intermediário, com uma frase natural e clara.';
}
async function generateSentenceForTerm(term, difficulty){
  const prompt = `Termo em inglês a treinar: "${term}"\n\nEscreva UMA frase natural em inglês que use claramente o termo "${term}" em contexto. ${sentenceDifficultyInstruction(difficulty)} Responda SOMENTE com a frase em inglês, sem aspas e sem nenhum texto adicional.`;
  const text = (await callGemini(prompt, { maxTokens: difficulty === 'easy' ? 60 : 150 })).trim();
  return text.replace(/^"|"$/g,'');
}

async function translateWordInContext(word, sentence){
  const prompt = `Frase em inglês: "${sentence}"\nPalavra específica dentro dessa frase: "${word}"\n\nPreciso de duas traduções pra essa palavra:\n1. DIRETA: a tradução mais comum/de dicionário dela, independente dessa frase (o sentido que a maioria das pessoas associaria à palavra isolada).\n2. NESSE CONTEXTO: a tradução considerando o sentido específico dela NESSA frase (pode ser igual à direta, ou diferente — a mesma palavra muda de sentido dependendo do contexto). Se houver mais de uma tradução igualmente válida pra esse sentido específico (sinônimos próximos, não sentidos diferentes), liste até 3, da mais natural pra menos natural.\n\nIdentifique também a categoria gramatical da palavra NESSA frase, em português (ex: substantivo, verbo, adjetivo, advérbio, pronome, preposição, conjunção, interjeição).\n\nEscreva uma DICA curta (no máximo 8 palavras, em português) sobre a SITUAÇÃO/CENÁRIO em que a palavra é usada nessa frase — algo que ajude a lembrar qual sentido é esse, tipo uma pista. IMPORTANTE: a dica NÃO PODE conter a tradução nem nenhuma palavra parecida com ela — é só uma pista da situação, sem entregar a resposta. Exemplo: se "bank" nessa frase significa margem de rio, uma dica válida seria "cenário ao ar livre, perto de água" — NUNCA "margem" ou "beira de rio" (isso entregaria a resposta).\n\nEscreva também uma explicação breve (1-2 frases, em português) sobre o significado/uso do termo nesse contexto, pra consultar depois se quiser entender mais — essa pode mencionar a tradução livremente, não precisa evitar spoiler.\n\nResponda SOMENTE com um JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:\n{"direct":"tradução direta","contextual":["tradução no contexto","outra opção"],"category":"substantivo","hint":"pista curta sem spoiler","note":"explicação breve"}`;
  const text = (await callGemini(prompt, { maxTokens: 400 })).trim();
  const clean = text.replace(/```json|```/g,"").trim();
  const obj = JSON.parse(clean);
  const direct = String(obj.direct||'').trim();
  const contextual = (Array.isArray(obj.contextual) ? obj.contextual : []).map(t=>String(t||'').trim()).filter(Boolean);
  if(!direct && contextual.length === 0) throw new Error('empty_response');
  return { direct, contextual, category: String(obj.category||'').trim(), hint: String(obj.hint||'').trim(), note: String(obj.note||'').trim() };
}

async function verifyTranslation(term, sentence, userTranslation){
  const prompt = `Frase em inglês: "${sentence}"\nTermo sendo treinado: "${term}"\nTradução para português dada pelo usuário: "${userTranslation}"\n\nAvalie se a tradução está correta em sentido geral e no uso específico do termo "${term}" (pequenas variações de palavras são aceitáveis se o sentido estiver certo). Se houver erro, explique claramente qual foi o erro e qual seria uma tradução mais adequada. Termine sua resposta com uma linha exatamente neste formato: "VEREDITO: CORRETO" ou "VEREDITO: INCORRETO", seguida de uma explicação em português (máximo 3 frases).`;
  const text = await callGemini(prompt, { maxTokens: 400 });
  const isIncorrect = /VEREDITO:\s*INCORRETO/i.test(text);
  const isCorrect = !isIncorrect && /VEREDITO:\s*CORRETO/i.test(text);
  let explanation = text.split(/VEREDITO:\s*(CORRETO|INCORRETO)/i).pop().trim();
  if(!explanation) explanation = text.trim().slice(-280);
  return { correct: isCorrect, explanation };
}
// Avalia tradução direta sem consultar as respostas salvas no cartão. Assim,
// respostas corretas que ainda não foram cadastradas também podem ser aceitas.
async function verifyDirectTranslationWithAI(term, category, userTranslation){
  const categoryLine = category ? `Categoria gramatical informada: "${category}".` : 'A categoria gramatical não foi informada; considere o uso mais comum do termo isolado.';
  const prompt = `Termo em inglês: "${term}"\n${categoryLine}\nResposta do usuário em português: "${userTranslation}"\n\nAvalie se a resposta é uma tradução direta válida e comum para esse termo, respeitando a categoria gramatical quando ela for informada. Aceite sinônimos naturais e variações de número, gênero, artigo ou flexão que preservem o sentido. Não use, não mencione e não presuma nenhuma lista de respostas cadastrada. Rejeite respostas vagas, de outra classe gramatical ou com sentido claramente diferente.\n\nTermine com uma linha exatamente neste formato: "VEREDITO: CORRETO" ou "VEREDITO: INCORRETO". Depois, escreva uma explicação curta em português (no máximo 2 frases); se estiver incorreta, indique uma tradução direta adequada.`;
  const text = await callGemini(prompt, { maxTokens: 350 });
  const isIncorrect = /VEREDITO:\s*INCORRETO/i.test(text);
  const isCorrect = !isIncorrect && /VEREDITO:\s*CORRETO/i.test(text);
  let explanation = text.split(/VEREDITO:\s*(CORRETO|INCORRETO)/i).pop().trim();
  if(!explanation) explanation = text.trim().slice(-280);
  return { correct: isCorrect, explanation };
}

async function aiVerify(prompt, maxTokens){
  const text = await callGemini(prompt, { maxTokens: maxTokens||400 });
  const isIncorrect = /VEREDITO:\s*INCORRETO/i.test(text);
  const isCorrect = !isIncorrect && /VEREDITO:\s*CORRETO/i.test(text);
  let explanation = text.split(/VEREDITO:\s*(CORRETO|INCORRETO)/i).pop().trim();
  if(!explanation) explanation = text.trim().slice(-280);
  return { correct: isCorrect, explanation };
}

function shuffleMCOptions(content){
  // usado pra evitar viés de posição em conteúdo vindo de fora (ex: IA sempre no índice 0)
  if(!content || !Array.isArray(content.options)) return content;
  const order = shuffle(content.options.map((_, i) => i));
  return {
    ...content,
    options: order.map(i => content.options[i]),
    correctIndex: order.indexOf(content.correctIndex)
  };
}
function generateLocalMC(card, deckCards){
  // múltipla escolha 100% local: usa as traduções de OUTROS termos do baralho como alternativas erradas
  const eligibleOthers = (deckCards||[]).filter(c => c.id !== card.id && c.back);
  if(!card.back || eligibleOthers.length < 3) return null; // não há termos suficientes com tradução cadastrada
  const pickOne = (backStr) => {
    const opts = String(backStr||'').split('/').map(s=>s.trim()).filter(Boolean);
    return opts[Math.floor(Math.random()*opts.length)] || backStr;
  };
  // igual pickOne, mas também devolve o índice escolhido (só faz sentido pra
  // tradução do PRÓPRIO cartão — pra puxar a nota de contexto certa depois).
  const pickOneWithIndex = (backStr) => {
    const opts = String(backStr||'').split('/').map(s=>s.trim()).filter(Boolean);
    const idx = Math.floor(Math.random()*opts.length);
    return { text: opts[idx] || backStr, index: idx };
  };
  const distractorCards = shuffle(eligibleOthers.slice()).slice(0, 3);
  const direction = Math.random() < 0.5 ? 'term' : 'translation';
  const cardTranslations = getCardTranslations(card);
  let promptText, correctTexts, distractorTexts;
  let correctTranslationIndexes = [], promptTranslationIndex = null;
  if(direction === 'term'){
    promptText = `Qual é a tradução de "${card.front}"?`;
    if(cardTranslations.length >= 2){
      // termo com 2+ traduções aceitas: inclui 2 delas como certas, pra reforçar que mais de uma resposta vale
      const shuffledIdx = shuffle(cardTranslations.map((_,i)=>i)).slice(0, 2);
      correctTexts = shuffledIdx.map(i => cardTranslations[i]);
      correctTranslationIndexes = shuffledIdx;
      distractorTexts = distractorCards.map(c => pickOne(c.back)).slice(0, 2);
    } else {
      const picked = pickOneWithIndex(card.back);
      correctTexts = [picked.text];
      correctTranslationIndexes = [picked.index];
      distractorTexts = distractorCards.map(c => pickOne(c.back));
    }
  } else {
    const picked = pickOneWithIndex(card.back);
    promptTranslationIndex = picked.index;
    promptText = `Qual termo em inglês significa "${picked.text}"?`;
    correctTexts = [stripParens(card.front)];
    distractorTexts = distractorCards.map(c => stripParens(c.front));
  }
  const entries = shuffle([
    ...correctTexts.map(t => ({ text: t, correct: true })),
    ...distractorTexts.map(t => ({ text: t, correct: false }))
  ]);
  return {
    prompt: promptText,
    options: entries.map(e => e.text),
    correctIndexes: entries.map((e,i) => e.correct ? i : -1).filter(i => i !== -1),
    correctTranslationIndexes,
    promptTranslationIndex
  };
}
function generateLocalMCStandard(card, deckCards){
  // múltipla escolha local pro baralho padrão: usa respostas de OUTROS cartões como alternativas erradas
  const eligibleOthers = (deckCards||[]).filter(c => c.id !== card.id && c.back && c.back !== card.back);
  if(eligibleOthers.length < 3) return null; // não há cartões suficientes no baralho
  const distractorCards = shuffle(eligibleOthers.slice()).slice(0, 3);
  return shuffle([card.back, ...distractorCards.map(c => c.back)]);
}

