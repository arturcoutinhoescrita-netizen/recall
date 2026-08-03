/* ============ SESSÃO DE IDIOMA (5 exercícios por termo, misturados) ============ */
function getEnabledExercises(deck){
  if(deck.enabledExercises && deck.enabledExercises.length) return deck.enabledExercises;
  // Exercícios existentes continuam ativos por padrão; o novo modo com IA fica
  // opt-in para não aumentar chamadas/custo em baralhos já criados.
  return EXERCISE_TYPES.filter(type => type !== 'translateAI');
}
function toggleExerciseType(deckId, exType){
  const deck = state.decks.find(d=>d.id===deckId);
  if(!deck) return;
  let enabled = getEnabledExercises(deck).slice();
  if(enabled.includes(exType)) enabled = enabled.filter(t=>t!==exType);
  else enabled.push(exType);
  deck.enabledExercises = enabled;
  saveData(); render();
}
function setSentenceDifficulty(deckId, difficulty){
  const deck = state.decks.find(d=>d.id===deckId);
  if(!deck || !['easy','intermediate'].includes(difficulty)) return;
  deck.sentenceDifficulty = difficulty;
  saveData(); render();
}
function getEnabledStandardTypes(deck){
  if(deck.enabledStandardTypes && deck.enabledStandardTypes.length) return deck.enabledStandardTypes;
  return [...STANDARD_STUDY_TYPES]; // padrão: todos ativos
}
function toggleStandardType(deckId, type){
  const deck = state.decks.find(d=>d.id===deckId);
  if(!deck) return;
  let enabled = getEnabledStandardTypes(deck).slice();
  if(enabled.includes(type)) enabled = enabled.filter(t=>t!==type);
  else enabled.push(type);
  deck.enabledStandardTypes = enabled;
  saveData(); render();
}
function startMixedStandardSession(deckId){
  const deck = state.decks.find(d=>d.id===deckId);
  const enabledTypes = deck ? getEnabledStandardTypes(deck) : STANDARD_STUDY_TYPES;
  if(enabledTypes.length === 0){ showToast('Ative pelo menos 1 tipo de exercício antes de estudar.', 'error'); return; }
  const due = getDueCards(deckId,{includeArchived:true});
  const basePool = due.length ? due : getStudyPool(deckId);
  if(basePool.length === 0){ showToast('Este baralho ainda não tem cartões.', 'error'); return; }
  const pool = expandPoolForPriority(basePool);
  let fullQueue = [];
  pool.forEach(c => {
    if(isImageCard(c)){
      if(enabledTypes.includes('image')) fullQueue.push({ cardId: c.id, exType: 'image-answer' });
    } else {
      if(enabledTypes.includes('mc')) fullQueue.push({ cardId: c.id, exType: 'mc' });
      if(enabledTypes.includes('open')) fullQueue.push({ cardId: c.id, exType: 'open' });
    }
  });
  if(fullQueue.length === 0){ showToast('Nenhum cartão combina com os tipos ativos — ajuste os tipos ou adicione cartões.', 'error'); return; }

  const aiOn = isAiEnabled(deck);
  const usesAI = aiOn && (enabledTypes.includes('mc') || enabledTypes.includes('open') || enabledTypes.includes('image'));
  let queue;
  if(usesAI){
    const fullKeys = new Set(fullQueue.map(i => `${i.cardId}:${i.exType}`));
    const carry = ((deck && deck.carryOverStd) || []).filter(i => fullKeys.has(`${i.cardId}:${i.exType}`));
    const carrySet = new Set(carry.map(i => `${i.cardId}:${i.exType}`));
    const fresh = shuffle(fullQueue.filter(i => !carrySet.has(`${i.cardId}:${i.exType}`)));
    const ordered = [...shuffle(carry), ...fresh];
    queue = ordered.slice(0, AI_SESSION_CAP);
    const leftover = ordered.slice(AI_SESSION_CAP);
    if(deck){ deck.carryOverStd = leftover; saveData(); }
  } else {
    queue = shuffle(fullQueue);
  }

  state.session = {
    deckId, mode: 'std-mixed',
    usesGradedOpen: !aiOn,
    queue, index: 0,
    correct: 0, total: queue.length,
    startTime: Date.now(), cardStart: Date.now(),
    revealed: false, userInput: '', options: null, loadingOptions: false,
    verifying: false, verifyResult: null, lastFeedback: null, chosenIndex: null,
    graded: false, gradeChosen: null, autoMatched: false
  };
  state.view = 'study';
  render();
  if(getCurrentExType() === 'mc') loadOptionsForCurrent();
}
function startLanguageSession(deckId){
  finishWritingActivity();
  finishReadingActivity();
  const deck = state.decks.find(d=>d.id===deckId);
  const enabledTypes = deck ? getEnabledExercises(deck) : EXERCISE_TYPES;
  if(enabledTypes.length === 0){ showToast('Ative pelo menos 1 tipo de exercício antes de estudar.', 'error'); return; }
  const due = getDueCards(deckId,{includeArchived:true});
  const basePool = due.length ? due : getStudyPool(deckId);
  if(basePool.length === 0){ showToast('Este baralho ainda não tem termos.', 'error'); return; }
  const pool = expandPoolForPriority(basePool);
  let fullQueue = [];
  pool.forEach(c => {
    enabledTypes.forEach(exType => {
      if((exType === 'translate' || exType === 'reverseTranslate') && !c.back) return; // sem tradução cadastrada, pula esses tipos pra esse termo
      if(exType === 'translateOther' && getCardTranslations(c).length < 2) return; // precisa de pelo menos 2 traduções pra ter uma resposta "alternativa" válida
      fullQueue.push({ cardId: c.id, exType });
    });
  });
  if(fullQueue.length === 0){ showToast('Adicione a tradução de pelo menos um termo (ou ative outro tipo de exercício) antes de estudar.', 'error'); return; }

  const usesAI = enabledTypes.includes('write') || enabledTypes.includes('translateAI');
  let queue;
  if(usesAI){
    const fullKeys = new Set(fullQueue.map(i => `${i.cardId}:${i.exType}`));
    const carry = (deck && deck.carryOverLang || []).filter(i => fullKeys.has(`${i.cardId}:${i.exType}`));
    const carrySet = new Set(carry.map(i => `${i.cardId}:${i.exType}`));
    const fresh = shuffle(fullQueue.filter(i => !carrySet.has(`${i.cardId}:${i.exType}`)));
    const ordered = [...shuffle(carry), ...fresh];
    queue = ordered.slice(0, AI_SESSION_CAP);
    const leftover = ordered.slice(AI_SESSION_CAP);
    if(deck){ deck.carryOverLang = leftover; saveData(); }
  } else {
    queue = shuffle(fullQueue);
  }

  state.session = {
    deckId, mode: 'lang-mixed',
    sentenceDifficulty: getSentenceDifficulty(deck),
    queue, index: 0,
    correct: 0, total: queue.length,
    startTime: Date.now(), cardStart: Date.now(),
    revealed: false, userInput: '', verifying: false, verifyResult: null, lastFeedback: null,
    loadingContent: false, content: null, chosenIndex: null
  };
  state.view = 'study';
  render();
  prefetchSessionContent(state.session).then(() => loadContentForCurrent());
}
function friendlyAiErrorMsg(e){
  if(e && e.code === 'missing_api_key') return 'É preciso configurar sua chave de API do Gemini (link no rodapé da barra lateral) para usar os recursos de IA.';
  return 'Não foi possível verificar agora. Tente novamente.';
}
async function loadContentForCurrent(){
  const s = state.session; if(!s) return;
  const card = getCurrentCard(); if(!card) return;
  const exType = getCurrentExType();
  if(exType === 'translate'){
    // sorteia qual sentido "focar" a dica dessa vez — a pontuação continua
    // aceitando qualquer tradução válida, a dica só ajuda a lembrar uma delas.
    const options = getCardTranslations(card);
    const hintIndex = Math.floor(Math.random()*options.length);
    s.loadingContent = false; s.content = { hintIndex }; render(); return; // local, sem IA
  }
  if(exType === 'translateAI'){
    s.loadingContent = false; s.content = {}; render(); return;
  }
  if(exType === 'reverseTranslate'){
    const options = String(card.back||'').split('/').map(o=>o.trim()).filter(Boolean);
    const idx = Math.floor(Math.random()*options.length);
    const chosen = options[idx] || card.back;
    s.loadingContent = false; s.content = { chosenTranslation: chosen, chosenIndex: idx }; render(); return; // local, sem IA
  }
  if(exType === 'mc'){
    const mc = generateLocalMC(card, state.cards[s.deckId]);
    s.loadingContent = false;
    s.content = mc || { error: true, notEnoughCards: true };
    render();
    return; // local, sem IA
  }
  if(exType === 'translateOther'){
    const options = getCardTranslations(card);
    const excludeIdx = Math.floor(Math.random()*options.length);
    s.loadingContent = false;
    s.content = { excluded: options[excludeIdx], validOptions: options.filter((_,i)=>i!==excludeIdx) };
    render();
    return; // local, sem IA
  }
  if(exType === 'copy-translation'){
    const item = getCurrentQueueItem();
    const options = getCardTranslations(card);
    const idx = Math.min((item && item.translationIndex) || 0, options.length-1);
    s.loadingContent = false;
    s.content = { targetTranslation: options[idx], translationIndex: idx };
    render();
    return; // local, sem IA
  }
  const cacheKey = `${card.id}:${exType}`;
  if(s.contentCache && s.contentCache[cacheKey]){
    s.loadingContent = false; s.content = s.contentCache[cacheKey]; render(); return; // já veio pré-gerado em lote
  }
  s.loadingContent = true; s.content = null; render();
  try{
    if(exType === 'write'){
      s.content = { sentence: await generateSentenceForTerm(card.front, s.sentenceDifficulty) };
    }
  }catch(e){
    console.error(e);
    s.content = { error: true, missingKey: e && e.code === 'missing_api_key' };
  }
  s.loadingContent = false; render();
}
function submitFromInput(inputId){
  const val = document.getElementById(inputId).value;
  state.session.userInput = val;
  submitLanguageAnswer();
}
function requeueOnWrong(){
  const s = state.session; if(!s) return;
  const current = s.queue[s.index];
  const clone = (current && typeof current === 'object') ? { ...current } : current;
  const offset = 3 + Math.floor(Math.random()*4); // reaparece de 3 a 6 perguntas à frente
  const insertAt = Math.min(s.index + offset, s.queue.length);
  s.queue.splice(insertAt, 0, clone);
}
function startMemorizeMode(){
  const s = state.session; if(!s || s.mode !== 'lang-mixed') return;
  const card = getCurrentCard(); if(!card) return;
  const translations = getCardTranslations(card);
  if(translations.length === 0){ showToast('Esse termo não tem tradução cadastrada — adicione uma antes de memorizar.', 'error'); return; }
  // 1 pergunta de cópia por tradução (até 2), depois sempre 2 de recordação livre —
  // assim quem tem só 1 tradução treina menos e quem tem 2+ é empurrado a usar as duas.
  let queue = [];
  const copyCount = Math.min(2, translations.length);
  for(let i=0; i<copyCount; i++) queue.push({ cardId: card.id, exType: 'copy-translation', translationIndex: i });
  queue.push({ cardId: card.id, exType: 'translate' });
  queue.push({ cardId: card.id, exType: 'translate' });
  state.previousSession = s; // guarda a sessão normal pra retomar depois
  state.session = {
    deckId: s.deckId, mode: 'lang-mixed', memorizeMode: true, memorizeCardId: card.id,
    queue, index: 0,
    correct: 0, total: queue.length,
    startTime: Date.now(), cardStart: Date.now(),
    revealed: false, userInput: '', verifying: false, verifyResult: null, lastFeedback: null,
    loadingContent: false, content: null, chosenIndex: null
  };
  showToast(`Modo memorizar: ${queue.length} exercícios focados só nesse termo.`);
  render();
  prefetchSessionContent(state.session).then(() => loadContentForCurrent());
}
function dontKnowOpen(){
  const s = state.session; const card = getCurrentCard();
  const inOpenContext = s && (s.mode === 'open' || (s.mode === 'std-mixed' && getCurrentExType() === 'open'));
  if(!s || !card || !inOpenContext || s.revealed) return;
  if(s.usesGradedOpen){
    scheduleCardGraded(card, 'hard', s.deckId);
    awardPoints(card, false, 'open-graded', 'hard');
  } else {
    scheduleCard(card, false, s.deckId);
    awardPoints(card, false, 'open');
  }
  requeueOnWrong(); // essa pergunta volta a aparecer mais à frente na sessão normal
  saveData();
  startCopyMemorize();
  // avança a sessão pausada além dessa pergunta, pra não repetir ela de novo assim que voltar
  if(state.previousSession){
    state.previousSession.index++;
    state.previousSession.revealed = false;
    state.previousSession.userInput = '';
    state.previousSession.verifyResult = null;
    state.previousSession.lastFeedback = null;
    state.previousSession.graded = false;
    state.previousSession.gradeChosen = null;
    state.previousSession.autoMatched = false;
  }
}
function dontKnowLang(){
  const s = state.session; const card = getCurrentCard();
  if(!s || !card || s.mode !== 'lang-mixed' || s.revealed || s.memorizeMode) return;
  scheduleCard(card, false, s.deckId);
  awardPoints(card, false, getCurrentExType());
  requeueOnWrong(); // essa pergunta volta a aparecer mais à frente na sessão normal
  saveData();
  startMemorizeMode();
  // avança a sessão pausada além dessa pergunta, pra não repetir ela de novo assim que voltar
  if(state.previousSession){
    state.previousSession.index++;
    state.previousSession.revealed = false;
    state.previousSession.userInput = '';
    state.previousSession.verifyResult = null;
    state.previousSession.lastFeedback = null;
    state.previousSession.content = null;
    state.previousSession.chosenIndex = null;
    state.previousSession.checkedIndexes = null;
    state.previousSession.partialCorrect = false;
    state.previousSession.loadingContent = false;
  }
}
function renderDontKnowLangLink(){
  return `<div style="text-align:center; margin-top:-4px;">
    <a href="#" style="font-size:11.5px; color:var(--text-faint); text-decoration:underline;" onclick="event.preventDefault(); dontKnowLang();">não sei <span style="opacity:0.6;">(Esc)</span></a>
  </div>`;
}
/* transforma uma frase gerada pela IA em texto com cada palavra clicável,
   pra consultar a tradução de termos desconhecidos sem sair do exercício. */
function renderClickableSentence(sentence){
  if(!sentence) return '';
  const tokens = sentence.split(/(\s+)/);
  return tokens.map(tok => {
    const m = tok.match(/^([A-Za-zÀ-ÿ']+)(.*)$/);
    if(m && m[1]){
      const word = m[1];
      return `<span class="clickable-word" onclick="lookupWord('${word.replace(/'/g,"\\'")}')">${escapeHtml(word)}</span>${escapeHtml(m[2])}`;
    }
    return escapeHtml(tok);
  }).join('');
}
/* deckId/sentenceOverride ficam de fora quando chamado durante uma sessão de estudo
   (usa o baralho e a frase da sessão atual); o leitor de EPUB passa os dois explicitamente,
   já que ali não existe uma sessão de estudo ativa. */
function lookupWord(word, deckId, sentenceOverride){
  const targetDeckId = deckId || (state.session && state.session.deckId);
  const sentence = sentenceOverride != null ? sentenceOverride : ((state.session && state.session.content && state.session.content.sentence) || '');
  const cleanWord = (word||'').trim();
  if(!cleanWord) return;
  state.modal = { type:'word-lookup', word: cleanWord, sentence, deckId: targetDeckId, status:'loading', direct:'', contextual:[], category:'', hint:'', note:'' };
  render();
  translateWordInContext(cleanWord, sentence).then(result => {
    if(state.modal && state.modal.type === 'word-lookup' && state.modal.word === cleanWord){
      state.modal.status = 'done';
      state.modal.direct = result.direct;
      state.modal.contextual = result.contextual;
      state.modal.category = result.category;
      state.modal.hint = result.hint;
      state.modal.note = result.note;
      render();
    }
  }).catch(err => {
    console.error('Falha ao traduzir palavra', err);
    if(state.modal && state.modal.type === 'word-lookup' && state.modal.word === cleanWord){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
      render();
    }
  });
}
// front = a palavra, back = tradução direta (a que mais importa) + as opções
// contextuais, todas separadas por "/" (o mesmo formato que getCardTranslations
// já espera pra virar respostas alternativas) — sem repetir se a direta já
// coincidir com uma das contextuais. note = explicação breve da IA (livre pra
// citar a tradução, só aparece se a pessoa clicar pra ver), category = classe
// gramatical (substantivo/verbo/etc.) mostrada durante o estudo.
// hints = uma DICA por opção (mesma ordem de allTranslations): em branco pra
// tradução direta (índice 0, não depende de contexto nenhum) e uma pista curta
// da situação pras opções contextuais — sem citar a tradução, só ajuda a
// lembrar qual sentido usar sem entregar a resposta.
function buildLookupCard(m){
  const seen = new Set();
  const allTranslations = [];
  const hints = [];
  // rede de segurança: se por algum motivo a dica da IA citar uma das próprias
  // traduções aceitas, é melhor não mostrar nada do que entregar a resposta.
  const allAcceptedNorms = [m.direct, ...(m.contextual||[])].filter(Boolean).map(normalizeAnswer);
  const safeHint = (() => {
    const hint = (m.hint||'').trim();
    if(!hint) return '';
    const hintNorm = normalizeAnswer(hint);
    const leaks = allAcceptedNorms.some(t => t && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(hintNorm));
    return leaks ? '' : hint;
  })();
  if(m.direct){
    allTranslations.push(m.direct);
    hints.push(''); // direta não depende de contexto
    seen.add(normalizeAnswer(m.direct));
  }
  (m.contextual||[]).forEach(t => {
    const norm = normalizeAnswer(t);
    if(!seen.has(norm)){
      allTranslations.push(t);
      hints.push(safeHint);
      seen.add(norm);
    }
  });
  const card = makeCard(m.word, allTranslations.join(' / '));
  card.note = m.note || '';
  card.category = m.category || '';
  card.hints = hints;
  return card;
}
function addLookupWordToDeck(){
  const m = state.modal;
  if(!m || m.type !== 'word-lookup' || m.status !== 'done') return;
  if(!m.deckId || !state.cards[m.deckId]){ state.modal = null; render(); return; }
  const card = buildLookupCard(m);
  if(findDuplicateLanguageTerm(m.deckId, card.front, card.category)){
    showToast(`"${card.front}" já existe neste baralho com a categoria ${card.category || 'não informada'}.`, 'error');
    return;
  }
  state.cards[m.deckId].push(card);
  state.modal = null;
  saveData(); render();
  showToast(`"${m.word}" adicionado ao baralho.`);
}
// cria o cartão igual addLookupWordToDeck, mas já abre uma sessão rápida de
// memorizar com ele — quando o usuário termina (ou sai), volta pro leitor.
function memorizeLookupWord(){
  const m = state.modal;
  if(!m || m.type !== 'word-lookup' || m.status !== 'done') return;
  if(!m.deckId || !state.cards[m.deckId]){ showToast('Vincule um baralho a este livro pra poder memorizar.', 'error'); return; }
  const card = buildLookupCard(m);
  if(findDuplicateLanguageTerm(m.deckId, card.front, card.category)){
    showToast(`"${card.front}" já existe neste baralho com a categoria ${card.category || 'não informada'}.`, 'error');
    return;
  }
  state.cards[m.deckId].push(card);
  const bookId = state.currentBookId;
  state.modal = null;
  saveData();
  startReaderMemorize(m.deckId, card, bookId);
}
// mesmo critério do "memorizar" do modo idioma (startMemorizeMode): uma pergunta
// de copiar por CADA tradução (sem limitar a 2, já que aqui o termo geralmente
// só tem uma sessão de memorização na vida — vale treinar todas as opções),
// terminando em UMA pergunta de tradução livre (sem ver a resposta antes).
function startReaderMemorize(deckId, card, bookId){
  const translations = getCardTranslations(card);
  if(translations.length === 0){ showToast('Esse termo não tem tradução cadastrada.', 'error'); return; }
  const queue = translations.map((t,i) => ({ cardId: card.id, exType: 'copy-translation', translationIndex: i }));
  queue.push({ cardId: card.id, exType: 'translate' });
  state.previousSession = null;
  state.currentDeckId = deckId; // renderMain() cai na tela vazia sem isso, mesmo com view='study'
  state.session = {
    deckId, mode: 'lang-mixed', memorizeMode: true, memorizeCardId: card.id,
    queue, index: 0,
    correct: 0, total: queue.length,
    startTime: Date.now(), cardStart: Date.now(),
    revealed: false, userInput: '', verifying: false, verifyResult: null, lastFeedback: null,
    loadingContent: false, content: null, chosenIndex: null,
    returnToReaderBookId: bookId
  };
  state.view = 'study';
  showToast(`Memorizando "${card.front}": ${queue.length} exercícios antes de voltar pra leitura.`);
  render();
  prefetchSessionContent(state.session).then(() => loadContentForCurrent());
}
function startCopyMemorize(){
  const s = state.session; if(!s) return;
  const card = getCurrentCard(); if(!card) return;
  state.previousSession = s;
  state.session = {
    deckId: s.deckId, mode: 'copy-memorize', memorizeMode: true, memorizeCardId: card.id,
    queue: [card.id], index: 0,
    correct: 0, total: 1,
    startTime: Date.now(), cardStart: Date.now(),
    revealed: false, userInput: '', verifying: false, verifyResult: null, lastFeedback: null,
    copyMismatch: false, points: 0, streak: 0
  };
  showToast('Modo memorizar: copie a resposta certinho pra fixar.');
  render();
}
function endMemorizeMode(){
  const returnBookId = state.session && state.session.returnToReaderBookId;
  if(returnBookId){
    // veio do leitor de epub (memorizar direto da tradução), não de uma sessão
    // de estudo pausada — volta pra página onde a pessoa estava lendo.
    state.session = null;
    state.previousSession = null;
    state.currentDeckId = null; // senão o baralho do cartão memorizado fica marcado como "ativo" na barra lateral por engano
    state._epubPendingPageJump = null; // defensivo: não deixa um pulo pendente de antes disparar num capítulo errado
    state.currentBookId = returnBookId;
    state.view = 'epub-reader';
    render();
    return;
  }
  const prev = state.previousSession;
  state.previousSession = null;
  if(prev){
    const card = (state.cards[prev.deckId]||[]).find(c=>c.id === state.session.memorizeCardId);
    if(card) card.missStreak = 0; // zera pra não reabrir o memorizar de novo imediatamente
    if(prev.index >= prev.queue.length){
      // a sessão pausada já tinha chegado ao fim (ex: "não sei" na última pergunta)
      state.session = prev;
      finalizeCarryOver();
      state.view = 'results';
      render();
      return;
    }
    state.session = prev;
    state.view = 'study';
    saveData();
    render();
    if(prev.mode === 'mc') loadOptionsForCurrent();
    else if(prev.mode === 'lang-mixed') loadContentForCurrent();
    else if(prev.mode === 'std-mixed' && getCurrentExType() === 'mc') loadOptionsForCurrent();
  } else {
    state.view = 'results';
    render();
  }
}
function submitCopyMemorize(){
  const s = state.session; const card = getCurrentCard();
  const input = document.getElementById('copy-input');
  const val = input ? input.value : (s.userInput||'');
  if(!val.trim()) return;
  const match = normalizeAnswer(val) === normalizeAnswer(card.back);
  if(match){
    s.revealed = true;
    s.copyMismatch = false;
    playCorrect();
    render();
  } else {
    s.copyMismatch = true;
    s.lastCopyAttempt = val;
    render();
  }
}
async function submitLanguageAnswer(){
  const s = state.session; const card = getCurrentCard(); const exType = getCurrentExType();
  if(!s.userInput.trim()) return;
  if(exType === 'translate'){
    // verificação 100% local, sem chamada de IA
    const correct = checkLocalTranslation(s.userInput.trim(), card.back);
    const acceptedList = String(card.back||'').split('/').map(s=>s.trim()).filter(Boolean);
    const typedNorm = normalizeAnswer(s.userInput.trim());
    const otherOptions = acceptedList.filter(a => normalizeAnswer(a) !== typedNorm);
    const explanation = correct
      ? (otherOptions.length ? `Outras traduções também aceitas: ${otherOptions.join(', ')}` : '')
      : `Tradução esperada: ${acceptedList.join(', ')}`;
    s.verifyResult = { correct, explanation };
    scheduleCard(card, correct, s.deckId);
    if(correct){ s.correct++; } else { requeueOnWrong(); }
    awardPoints(card, correct, 'translate');
    s.lastFeedback = correct;
    s.revealed = true;
    saveData();
    render();
    return;
  }
  if(exType === 'translateAI'){
    s.verifying = true; render();
    try{
      const result = await verifyDirectTranslationWithAI(card.front, card.category || '', s.userInput.trim());
      s.verifyResult = result;
      scheduleCard(card, result.correct, s.deckId);
      if(result.correct){ s.correct++; } else { requeueOnWrong(); }
      awardPoints(card, result.correct, 'translateAI');
      s.lastFeedback = result.correct;
    }catch(e){
      console.error(e);
      s.verifyResult = { correct:false, explanation: friendlyAiErrorMsg(e) };
    }
    s.verifying = false; s.revealed = true;
    saveData();
    render();
    return;
  }
  if(exType === 'reverseTranslate'){
    // verificação 100% local, sem chamada de IA — compara com o termo original (front), ignorando texto entre parênteses
    const cleanFront = stripParens(card.front);
    const correct = normalizeAnswer(s.userInput.trim()) === normalizeAnswer(cleanFront);
    s.verifyResult = { correct, explanation: correct ? '' : `Termo esperado: ${cleanFront}` };
    scheduleCard(card, correct, s.deckId);
    if(correct){ s.correct++; } else { requeueOnWrong(); }
    awardPoints(card, correct, 'reverseTranslate');
    s.lastFeedback = correct;
    s.revealed = true;
    saveData();
    render();
    return;
  }
  if(exType === 'translateOther'){
    // verificação 100% local — precisa bater com alguma tradução aceita QUE NÃO seja a excluída
    const typedNorm = normalizeAnswer(s.userInput.trim());
    const excludedNorm = normalizeAnswer(s.content.excluded);
    const correct = typedNorm !== excludedNorm && s.content.validOptions.some(o => normalizeAnswer(o) === typedNorm);
    const explanation = correct ? '' : `Não vale "${s.content.excluded}" — outra(s) tradução(ões) aceita(s): ${s.content.validOptions.join(', ')}`;
    s.verifyResult = { correct, explanation };
    scheduleCard(card, correct, s.deckId);
    if(correct){ s.correct++; } else { requeueOnWrong(); }
    awardPoints(card, correct, 'translateOther');
    s.lastFeedback = correct;
    s.revealed = true;
    saveData();
    render();
    return;
  }
  if(exType === 'copy-translation'){
    // só copiar certinho pra fixar — não afeta a repetição espaçada, igual o copy-memorize do baralho padrão
    const correct = normalizeAnswer(s.userInput.trim()) === normalizeAnswer(s.content.targetTranslation);
    s.verifyResult = { correct, explanation: correct ? '' : `Devia ser: ${s.content.targetTranslation}` };
    s.lastFeedback = correct;
    s.revealed = true;
    if(correct) playCorrect(); else playWrong();
    render();
    return;
  }
  s.verifying = true; render();
  try{
    let result;
    if(exType === 'write') result = await verifyTranslation(card.front, s.content.sentence, s.userInput.trim());
    s.verifyResult = result;
    scheduleCard(card, result.correct, s.deckId);
    if(result.correct){ s.correct++; } else { requeueOnWrong(); }
    awardPoints(card, result.correct, 'write');
    s.lastFeedback = result.correct;
  }catch(e){
    console.error(e);
    s.verifyResult = { correct:false, explanation: friendlyAiErrorMsg(e) };
  }
  s.verifying = false; s.revealed = true;
  saveData();
  render();
}
function answerLangMC(optionIndex){
  const s = state.session; const card = getCurrentCard();
  if(s.revealed) return;
  const correctIdx = s.content.correctIndexes || [];
  s.checkedIndexes = s.checkedIndexes || [];
  if(s.checkedIndexes.includes(optionIndex)) return;
  const isCorrectPick = correctIdx.includes(optionIndex);
  if(!isCorrectPick){
    // marcou uma errada: encerra a questão como errada, mesmo se já tinha achado uma certa antes
    s.chosenIndex = optionIndex; s.revealed = true; s.lastFeedback = false; s.partialCorrect = false;
    scheduleCard(card, false, s.deckId);
    requeueOnWrong();
    awardPoints(card, false, 'langMC');
    saveData();
    render();
    return;
  }
  s.checkedIndexes.push(optionIndex);
  if(s.checkedIndexes.length < correctIdx.length){
    // achou uma certa, mas ainda tem outra(s) — não revela nem avança ainda
    s.partialCorrect = true;
    render();
    return;
  }
  // achou todas as opções certas
  s.revealed = true; s.lastFeedback = true; s.partialCorrect = false;
  scheduleCard(card, true, s.deckId);
  s.correct++;
  awardPoints(card, true, 'langMC');
  saveData();
  render();
}
async function loadOptionsForCurrent(){
  const s = state.session; if(!s) return;
  const card = getCurrentCard(); if(!card) return;
  const deck = state.decks.find(d=>d.id===s.deckId);
  if(!isAiEnabled(deck)){
    const localOptions = generateLocalMCStandard(card, state.cards[s.deckId]);
    s.loadingOptions = false;
    s.options = localOptions;
    s.optionsUnavailable = !localOptions;
    render();
    return;
  }
  s.loadingOptions = true; s.options = null; s.optionsUnavailable = false; render();
  try{
    const wrongs = await generateDistractors(card.front, card.back);
    s.options = shuffle([card.back, ...wrongs]);
  }catch(e){
    console.error(e);
    s.options = shuffle([card.back, e && e.code==='missing_api_key' ? 'Configure sua chave de API (rodapé)' : 'Não foi possível gerar alternativas', 'Tente novamente mais tarde', 'Erro ao carregar opção']);
  }
  s.loadingOptions = false; render();
}
function submitDirectReveal(){
  const s = state.session; s.revealed = true; render();
}
function answerDirect(correct){
  const s = state.session; const card = getCurrentCard();
  scheduleCard(card, correct, s.deckId);
  if(correct){ s.correct++; } else { requeueOnWrong(); }
  awardPoints(card, correct, 'direct');
  s.lastFeedback = correct;
  saveData();
  render();
}
function answerMC(optionIndex){
  const s = state.session; const card = getCurrentCard();
  const chosenText = s.options[optionIndex];
  const correct = chosenText === card.back;
  scheduleCard(card, correct, s.deckId);
  if(correct){ s.correct++; } else { requeueOnWrong(); }
  awardPoints(card, correct, 'mc-standard');
  s.revealed = true; s.chosen = chosenText; s.lastFeedback = correct;
  saveData();
  render();
}
async function submitOpenAnswer(){
  const s = state.session; const card = getCurrentCard();
  if(!s.userInput.trim()) return;
  s.verifying = true; render();
  try{
    const result = await verifyOpenAnswer(card.front, card.back, s.userInput.trim());
    s.verifyResult = result;
    scheduleCard(card, result.correct, s.deckId);
    if(result.correct){ s.correct++; } else { requeueOnWrong(); }
    awardPoints(card, result.correct, 'open');
    s.lastFeedback = result.correct;
  }catch(e){
    console.error(e);
    s.verifyResult = { correct:false, explanation: friendlyAiErrorMsg(e) };
  }
  s.verifying = false; s.revealed = true;
  saveData();
  render();
}
function submitOpenGraded(){
  const s = state.session; const card = getCurrentCard();
  const input = document.getElementById('open-graded-input');
  const val = input ? input.value : (s.userInput||'');
  if(!val.trim()) return;
  s.userInput = val;
  s.revealed = true;
  const match = normalizeAnswer(val) === normalizeAnswer(card.back);
  if(match){
    s.autoMatched = true;
    answerOpenGraded('easy');
  } else {
    s.autoMatched = false;
    render();
  }
}
function answerOpenGraded(grade){
  const s = state.session; const card = getCurrentCard();
  const correct = grade !== 'hard';
  scheduleCardGraded(card, grade, s.deckId);
  if(correct){ s.correct++; } else { requeueOnWrong(); }
  awardPoints(card, correct, 'open-graded', grade);
  s.lastFeedback = correct;
  s.gradeChosen = grade;
  s.graded = true;
  saveData();
  render();
}

function nextCard(){
  const s = state.session;
  s.index++;
  s.revealed = false; s.userInput=''; s.options=null; s.chosen=null; s.verifyResult=null; s.lastFeedback=null;
  s.content=null; s.chosenIndex=null; s.graded=false; s.gradeChosen=null; s.copyMismatch=false; s.autoMatched=false; s.lastCopyAttempt='';
  s.checkedIndexes=null; s.partialCorrect=false; s.showNote=false; s.clickPos=null;
  s.cardStart = Date.now();
  if(s.index >= s.queue.length){
    recordStudyActivity(s);
    if(s.memorizeMode){ endMemorizeMode(); return; }
    finalizeCarryOver();
    state.view = 'results';
    render();
    return;
  }
  render();
  if(s.mode === 'mc') loadOptionsForCurrent();
  else if(s.mode === 'lang-mixed') loadContentForCurrent();
  else if(s.mode === 'std-mixed' && getCurrentExType() === 'mc') loadOptionsForCurrent();
}
function endSessionEarly(){
  if(state.session && state.session.memorizeMode){ endMemorizeMode(); return; }
  recordStudyActivity(state.session);
  finalizeCarryOver();
  state.view = 'results';
  render();
}

