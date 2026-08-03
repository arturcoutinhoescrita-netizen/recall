/* ============ SPACED REPETITION (SM-2 simplified) ============ */
// Valores padrão do sistema -- um baralho sem configuração própria usa exatamente
// esses números, então a mudança pra torná-los ajustáveis por baralho não altera
// o comportamento de nenhum baralho existente até o usuário mexer nele.
const DEFAULT_SPACED_REPETITION = { firstInterval:1, secondInterval:6, ease:2.5, wrongInterval:1 };
function getSpacedRepetitionConfig(deck){
  return { ...DEFAULT_SPACED_REPETITION, ...(deck && deck.spacedRepetition || {}) };
}
function scheduleCard(card, correct, deckId){
  const now = Date.now();
  const cfg = getSpacedRepetitionConfig(state.decks.find(d=>d.id===deckId));
  card.ease = card.ease || cfg.ease;
  card.reps = card.reps || 0;
  card.interval = card.interval || 0;
  card.missStreak = card.missStreak || 0;
  if(correct){
    card.reps += 1;
    if(card.reps === 1) card.interval = cfg.firstInterval;
    else if(card.reps === 2) card.interval = cfg.secondInterval;
    else card.interval = Math.round(card.interval * card.ease);
    card.ease = Math.max(1.3, card.ease + 0.1);
    card.missStreak = 0;
  } else {
    card.reps = 0;
    card.interval = cfg.wrongInterval;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.missStreak += 1;
  }
  card.due = now + card.interval * 24*60*60*1000;
}
/* variante com 3 níveis de dificuldade, usada na pergunta aberta sem IA (autoavaliação) */
function scheduleCardGraded(card, grade, deckId){
  const now = Date.now();
  const cfg = getSpacedRepetitionConfig(state.decks.find(d=>d.id===deckId));
  card.ease = card.ease || cfg.ease;
  card.reps = card.reps || 0;
  card.interval = card.interval || 0;
  card.missStreak = card.missStreak || 0;
  if(grade === 'hard'){
    card.reps = 0;
    card.interval = cfg.wrongInterval;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.missStreak += 1;
  } else {
    card.reps += 1;
    if(card.reps === 1) card.interval = cfg.firstInterval;
    else if(card.reps === 2) card.interval = cfg.secondInterval;
    else card.interval = Math.round(card.interval * card.ease);
    if(grade === 'easy'){
      card.ease = Math.max(1.3, card.ease + 0.15);
      card.interval = Math.round(card.interval * 1.3);
    } else { // medium
      card.ease = Math.max(1.3, card.ease + 0.05);
    }
    card.missStreak = 0;
  }
  card.due = now + card.interval * 24*60*60*1000;
}
function getDueCards(deckId, options={}){
  const deck=state.decks.find(item=>item.id===deckId);
  if(deck?.archived && !options.includeArchived) return [];
  const cards = state.cards[deckId] || [];
  const now = Date.now();
  return cards.filter(c => !c.learned && (c.due||0) <= now);
}
function getStudyPool(deckId){
  // todos os cartões elegíveis pra estudo, exceto os marcados como aprendidos
  return (state.cards[deckId] || []).filter(c => !c.learned);
}
/* interval só passa de 0 depois da primeira revisão (correta ou não), então
   interval===0 identifica com segurança um cartão nunca estudado. */
const MATURE_INTERVAL_DAYS = 21;
function getCardState(card){
  if(!card.interval) return 'new';
  return card.interval >= MATURE_INTERVAL_DAYS ? 'mature' : 'learning';
}
const CARD_STATE_INFO = {
  new: { label:'Novo', color:'#7DA9FA' },
  learning: { label:'Aprendendo', color:'var(--accent)' },
  mature: { label:'Maduro', color:'var(--success)' }
};
function getDeckStateCounts(deckId){
  const counts = { new:0, learning:0, mature:0 };
  (state.cards[deckId]||[]).forEach(c => counts[getCardState(c)]++);
  return counts;
}
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

