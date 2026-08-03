/* ============ STUDY SESSION ============ */
const AI_SESSION_CAP = 20;
function expandPoolForPriority(pool){
  // cartões marcados com 🔥 prioridade aparecem 2x na mesma sessão
  const expanded = [];
  pool.forEach(c => {
    expanded.push(c);
    if(c.priority) expanded.push(c);
  });
  return expanded;
}
function startSession(deckId, mode){
  finishWritingActivity();
  finishReadingActivity();
  const deck = state.decks.find(d=>d.id===deckId);
  const isImageMode = mode === 'image-answer' || mode === 'image-locate';
  const due = getDueCards(deckId,{includeArchived:true}).filter(c => isImageCard(c) === isImageMode);
  const basePool = due.length ? due : getStudyPool(deckId).filter(c => isImageCard(c) === isImageMode);
  if(basePool.length === 0){ showToast(isImageMode ? 'Nenhum cartão de imagem pronto pra estudar.' : 'Este baralho ainda não tem cartões.', 'error'); return; }
  const pool = expandPoolForPriority(basePool);
  const aiOn = isAiEnabled(deck);
  const usesAI = (mode === 'mc' || mode === 'open') && aiOn; // 'direct' é sempre local; mc/open só usam IA se o baralho tiver ela ligada

  let queue;
  if(usesAI){
    const fullIds = pool.map(c=>c.id);
    const carry = ((deck && deck.carryOverByMode && deck.carryOverByMode[mode]) || []).filter(id => fullIds.includes(id));
    const carrySet = new Set(carry);
    const fresh = shuffle(fullIds.filter(id => !carrySet.has(id)));
    const ordered = [...shuffle(carry), ...fresh];
    queue = ordered.slice(0, AI_SESSION_CAP);
    const leftover = ordered.slice(AI_SESSION_CAP);
    if(deck){
      deck.carryOverByMode = deck.carryOverByMode || {};
      deck.carryOverByMode[mode] = leftover;
      saveData();
    }
  } else {
    queue = shuffle(pool.map(c=>c.id));
  }

  state.session = {
    deckId, mode,
    usesGradedOpen: mode === 'open' && !aiOn,
    queue,
    index: 0,
    correct: 0,
    total: queue.length,
    startTime: Date.now(),
    cardStart: Date.now(),
    revealed: false,
    userInput: '',
    options: null,
    loadingOptions: false,
    verifying: false,
    verifyResult: null,
    lastFeedback: null,
    chosenIndex: null,
    graded: false,
    gradeChosen: null,
    autoMatched: false
  };
  state.view = 'study';
  render();
  const first = getCurrentCard();
  if(!first) return;
  if(mode === 'mc') loadOptionsForCurrent();
}
function finalizeCarryOver(){
  const s = state.session; if(!s) return;
  const remainder = s.queue.slice(s.index);
  if(remainder.length === 0) return;
  const deck = state.decks.find(d=>d.id===s.deckId);
  if(!deck) return;
  if(s.mode === 'lang-mixed'){
    const existing = deck.carryOverLang || [];
    const seen = new Set(existing.map(i=>`${i.cardId}:${i.exType}`));
    remainder.forEach(item => {
      const key = `${item.cardId}:${item.exType}`;
      if(!seen.has(key)){ existing.push(item); seen.add(key); }
    });
    deck.carryOverLang = existing;
    saveData();
  } else if(s.mode === 'std-mixed'){
    const existing = deck.carryOverStd || [];
    const seen = new Set(existing.map(i=>`${i.cardId}:${i.exType}`));
    remainder.forEach(item => {
      const key = `${item.cardId}:${item.exType}`;
      if(!seen.has(key)){ existing.push(item); seen.add(key); }
    });
    deck.carryOverStd = existing;
    saveData();
  } else if(s.mode === 'mc' || s.mode === 'open'){
    deck.carryOverByMode = deck.carryOverByMode || {};
    const existing = deck.carryOverByMode[s.mode] || [];
    const seen = new Set(existing);
    remainder.forEach(id => { if(!seen.has(id)){ existing.push(id); seen.add(id); } });
    deck.carryOverByMode[s.mode] = existing;
    saveData();
  }
}
function getCurrentCard(){
  const s = state.session;
  if(!s) return null;
  const item = s.queue[s.index];
  const id = (item && typeof item === 'object') ? item.cardId : item;
  return (state.cards[s.deckId]||[]).find(c=>c.id===id);
}
function getCurrentExType(){
  const s = state.session;
  if(!s) return null;
  const item = s.queue[s.index];
  return (item && typeof item === 'object') ? item.exType : null;
}
function getCurrentQueueItem(){
  const s = state.session;
  if(!s) return null;
  const item = s.queue[s.index];
  return (item && typeof item === 'object') ? item : null;
}

