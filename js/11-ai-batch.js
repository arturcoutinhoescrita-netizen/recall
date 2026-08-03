/* ============ GERAÇÃO EM LOTE (pré-carrega frases da sessão pra economizar mensagens) ============ */
const LANG_BATCH_SIZE = 6; // itens processados por chamada de IA
async function generateSentencesBatch(terms, difficulty){
  const listText = terms.map((t,i)=>`${i}. "${t}"`).join('\n');
  const prompt = `Você vai receber uma lista numerada de termos em inglês para treinar.\n\n${listText}\n\nPara CADA termo, escreva UMA frase natural em inglês que use claramente o termo em contexto. ${sentenceDifficultyInstruction(difficulty)}\n\nResponda SOMENTE com um JSON válido, sem nenhum texto antes ou depois, exatamente neste formato:\n[{"i": 0, "sentence": "frase em inglês"}, ...]\n\nO campo "i" deve corresponder ao número do termo na lista acima (começando em 0).`;
  const text = (await callGemini(prompt, { maxTokens: (difficulty === 'easy' ? 60 : 120)*terms.length })).trim();
  const clean = text.replace(/```json|```/g,"").trim();
  const parsed = JSON.parse(clean);
  if(!Array.isArray(parsed)) throw new Error('formato inesperado');
  return parsed;
}
async function prefetchSessionContent(s){
  const cardsById = {};
  (state.cards[s.deckId]||[]).forEach(c => cardsById[c.id] = c);
  const writeIds = []; const seen = new Set();
  s.queue.forEach(item => {
    const key = `${item.cardId}:${item.exType}`;
    if(seen.has(key)) return;
    seen.add(key);
    if(item.exType === 'write') writeIds.push(item.cardId);
  });
  s.contentCache = {};
  if(writeIds.length === 0) return; // nada pra pré-gerar (mc agora é local, e os demais tipos também)

  s.prefetch = { active: true, done: 0, total: writeIds.length };
  render();

  for(let i=0; i<writeIds.length; i+=LANG_BATCH_SIZE){
    const batchIds = writeIds.slice(i, i+LANG_BATCH_SIZE);
    const terms = batchIds.map(id => cardsById[id].front);
    try{
      const results = await generateSentencesBatch(terms, s.sentenceDifficulty);
      results.forEach(r => {
        const cardId = batchIds[r.i];
        if(cardId && r.sentence) s.contentCache[`${cardId}:write`] = { sentence: r.sentence };
      });
    }catch(e){ console.error('Falha ao pré-gerar frases em lote', e); }
    s.prefetch.done = Math.min(s.prefetch.done + batchIds.length, s.prefetch.total);
    render();
  }
  s.prefetch.active = false;
  render();
}


