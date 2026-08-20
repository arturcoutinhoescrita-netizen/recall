/* ============ IMPORTAR FLASHCARDS DE TEXTO DA WEB ============
   Usado pela extensão do Chrome incluída em /chrome-extension. A extensão não
   recebe credenciais: só abre o Letther B com um payload no fragmento (#), que
   nunca é enviado ao servidor na requisição HTTP. O app consome e limpa o hash. */
const WEB_FLASHCARD_MAX_TEXT = 16000;
const WEB_FLASHCARD_DEFAULT_COUNT = 3;

function decodeWebImportPayload(encoded){
  try{
    const normalized=String(encoded||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized + '='.repeat((4-normalized.length%4)%4);
    const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(error){
    console.warn('Payload da extensão inválido',error);
    return null;
  }
}
function getWebImportPayloadFromLocation(){
  const prefix='#letther-import=';
  if(!location.hash.startsWith(prefix)) return null;
  return decodeWebImportPayload(location.hash.slice(prefix.length));
}
function clearWebImportHash(){
  try{ history.replaceState(null,'',location.pathname+location.search); }
  catch(error){ location.hash=''; }
}
function normalizeWebImportPayload(payload){
  if(!payload || typeof payload!=='object') return null;
  const text=String(payload.text||'').trim().slice(0,WEB_FLASHCARD_MAX_TEXT);
  if(!text) return null;
  return {
    text,
    title:String(payload.title||'').trim().slice(0,300),
    url:String(payload.url||'').trim().slice(0,2000),
    count:Math.max(1,Math.min(10,parseInt(payload.count,10)||WEB_FLASHCARD_DEFAULT_COUNT))
  };
}
function consumePendingWebFlashcardImport(){
  const payload=normalizeWebImportPayload(getWebImportPayloadFromLocation());
  if(!payload) return false;
  clearWebImportHash();
  const defaultDeck=state.decks.find(d=>d.id===state.currentDeckId && d.type!=='language') || state.decks.find(d=>d.type!=='language');
  state.modal={
    type:'web-flashcards', status:'processing', text:payload.text,
    sourceTitle:payload.title, sourceUrl:payload.url, count:payload.count,
    cards:[], deckId:defaultDeck?defaultDeck.id:'__new__', newDeckName:'', regenerating:false
  };
  // loadData() chama esta função imediatamente antes do render final. A geração
  // começa no próximo microtask, quando a interface já pode mostrar o progresso.
  queueMicrotask(()=>runWebFlashcardGeneration());
  return true;
}

async function generateFlashcardsFromWebText(text,count,sourceTitle,avoidFronts){
  count=Math.max(1,Math.min(10,parseInt(count,10)||WEB_FLASHCARD_DEFAULT_COUNT));
  const avoid=(avoidFronts&&avoidFronts.length)
    ? `\n\nJá existem estes cartões aprovados; não repita perguntas nem o mesmo foco:\n${avoidFronts.map(v=>`- ${v}`).join('\n')}`
    : '';
  const source=sourceTitle ? `\nTítulo da página: ${sourceTitle}` : '';
  const prompt=`Você vai transformar um trecho selecionado de uma página da internet em flashcards para estudo.${source}\n\nTRECHO:\n${text}\n\nCrie exatamente ${count} flashcard(s) em português sobre as informações realmente presentes no trecho. Priorize conceitos, relações, definições, causas, consequências e fatos que valha a pena recordar. Não invente informações externas. Faça perguntas independentes e objetivas; respostas curtas e diretas. Em cada cartão, escreva também uma nota breve (1-2 frases) que dê contexto sem repetir simplesmente a resposta.${avoid}\n\nResponda SOMENTE com JSON válido, sem markdown nem comentários, neste formato:\n[{"front":"pergunta","back":"resposta","note":"contexto breve"}, ...]`;
  const result=(await callGemini(prompt,{maxTokens:Math.max(500,360*count)})).trim();
  const clean=result.replace(/```json|```/g,'').trim();
  const parsed=JSON.parse(clean);
  if(!Array.isArray(parsed)||!parsed.length) throw new Error('empty_response');
  return parsed.slice(0,count).map(item=>({
    front:String(item?.front||'').trim(), back:String(item?.back||'').trim(), note:String(item?.note||'').trim()
  })).filter(item=>item.front&&item.back);
}

async function runWebFlashcardGeneration(){
  const m=state.modal;
  if(!m || m.type!=='web-flashcards') return;
  m.status='processing';
  render();
  try{
    const cards=await generateFlashcardsFromWebText(m.text,m.count,m.sourceTitle);
    if(!cards.length) throw new Error('empty_response');
    if(state.modal!==m) return;
    m.cards=cards.map(card=>({...card,include:true}));
    m.status='review';
  }catch(error){
    console.error('Falha ao gerar flashcards do texto da web',error);
    if(state.modal!==m) return;
    m.status='error';
    m.error=friendlyAiErrorMsg(error);
  }
  render();
}

function updateWebFlashcardCount(value){
  const m=state.modal;
  if(!m||m.type!=='web-flashcards') return;
  m.count=Math.max(1,Math.min(10,parseInt(value,10)||WEB_FLASHCARD_DEFAULT_COUNT));
}
async function regenerateUncheckedWebFlashcards(){
  const m=state.modal;
  if(!m||m.type!=='web-flashcards'||m.status!=='review'||m.regenerating) return;
  const indexes=m.cards.map((card,index)=>index).filter(index=>!m.cards[index].include);
  if(!indexes.length){ showToast('Desmarque os cartões que quer trocar antes de gerar de novo.','error'); return; }
  m.regenerating=true; render();
  try{
    const kept=m.cards.filter(card=>card.include).map(card=>card.front);
    const fresh=await generateFlashcardsFromWebText(m.text,indexes.length,m.sourceTitle,kept);
    if(state.modal!==m) return;
    indexes.forEach((index,i)=>{ if(fresh[i]) m.cards[index]={...fresh[i],include:false}; });
  }catch(error){
    console.error('Falha ao regenerar flashcards da web',error);
    if(state.modal===m) showToast(friendlyAiErrorMsg(error),'error');
  }finally{
    if(state.modal===m){ m.regenerating=false; render(); }
  }
}
function confirmWebFlashcards(){
  const m=state.modal;
  if(!m||m.type!=='web-flashcards'||m.status!=='review') return;
  const selected=m.cards.filter(card=>card.include&&card.front.trim()&&card.back.trim());
  if(!selected.length){ showToast('Selecione ao menos um cartão para adicionar.','error'); return; }
  let deckId=m.deckId;
  if(deckId==='__new__'){
    const name=String(m.newDeckName||'').trim();
    if(!name){ showToast('Dê um nome ao novo baralho.','error'); return; }
    const deck={id:uid(),name,color:DECK_COLORS[state.decks.length%DECK_COLORS.length],type:'standard'};
    state.decks.push(deck); state.cards[deck.id]=[]; deckId=deck.id;
  }
  if(!deckId||!state.decks.some(deck=>deck.id===deckId)){ showToast('Escolha um baralho.','error'); return; }
  selected.forEach(item=>{
    const card=makeCard(item.front,item.back);
    card.note=String(item.note||'').trim();
    if(m.sourceUrl) card.sourceUrl=m.sourceUrl;
    if(m.sourceTitle) card.sourceTitle=m.sourceTitle;
    state.cards[deckId].push(card);
  });
  state.modal=null;
  state.currentDeckId=deckId; state.lastDeckId=deckId; state.view='deck'; state.tab='cards';
  saveData(); render();
  showToast(`${selected.length} cartão(ões) criado(s) a partir da página.`);
}

function renderWebFlashcardsModal(m){
  if(m.status==='processing'){
    return `<div class="modal-overlay"><div class="modal" style="width:460px; text-align:center;"><h3>🌐 Criando flashcards…</h3><div class="loading-line" style="justify-content:center;"><div class="spinner"></div> A IA está lendo o trecho selecionado e montando ${m.count} cartão(ões).</div>${m.sourceTitle?`<p style="font-size:11.5px;color:var(--text-faint);margin-top:10px;">${escapeHtml(m.sourceTitle)}</p>`:''}</div></div>`;
  }
  if(m.status==='error'){
    return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:480px;"><h3>Não deu para gerar os flashcards</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.5;">${escapeHtml(m.error||'Falha inesperada.')}</p><div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Fechar</button><button class="primary-btn" onclick="runWebFlashcardGeneration()">Tentar novamente</button></div></div></div>`;
  }
  const standardDecks=state.decks.filter(deck=>deck.type!=='language');
  const included=m.cards.filter(card=>card.include).length;
  const unchecked=m.cards.length-included;
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:560px;max-height:88vh;overflow-y:auto;"><h3>🌐 Revisar flashcards da web</h3><p style="font-size:12px;color:var(--text-faint);margin:0;line-height:1.45;">${m.sourceTitle?`Fonte: <strong>${escapeHtml(m.sourceTitle)}</strong>. `:''}Edite o que quiser, desmarque cartões ruins ou gere novas opções para os desmarcados.</p><details style="margin:8px 0;"><summary style="font-size:11.5px;color:var(--text-muted);cursor:pointer;">Ver trecho capturado</summary><div style="margin-top:7px;max-height:130px;overflow:auto;white-space:pre-wrap;font-size:12px;line-height:1.45;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:9px;">${escapeHtml(m.text)}</div></details><div style="display:flex;flex-direction:column;gap:10px;margin:8px 0;">${m.cards.map((card,i)=>`<div style="display:flex;gap:10px;padding:12px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;${!card.include?'opacity:.5;':''}"><input type="checkbox" style="margin-top:4px;" ${card.include?'checked':''} ${m.regenerating?'disabled':''} onchange="state.modal.cards[${i}].include=this.checked;render();"><div style="flex:1;display:flex;flex-direction:column;gap:8px;"><div class="field" style="gap:4px;"><label>PERGUNTA</label><textarea rows="2" oninput="state.modal.cards[${i}].front=this.value">${escapeHtml(card.front)}</textarea></div><div class="field" style="gap:4px;"><label>RESPOSTA</label><textarea rows="2" oninput="state.modal.cards[${i}].back=this.value">${escapeHtml(card.back)}</textarea></div><div class="field" style="gap:4px;"><label>NOTA (opcional)</label><textarea rows="2" oninput="state.modal.cards[${i}].note=this.value">${escapeHtml(card.note||'')}</textarea></div></div></div>`).join('')}</div><button class="ghost-btn" style="width:100%;" onclick="regenerateUncheckedWebFlashcards()" ${(unchecked===0||m.regenerating)?'disabled':''}>${m.regenerating?'⏳ Gerando novas opções…':`🔄 Gerar novamente (${unchecked} ${unchecked===1?'desmarcado':'desmarcados'})`}</button><div class="field" style="margin-top:10px;"><label>ADICIONAR AO BARALHO</label><select onchange="state.modal.deckId=this.value;render();"><option value="" ${!m.deckId?'selected':''}>Escolher baralho...</option>${standardDecks.map(deck=>`<option value="${deck.id}" ${m.deckId===deck.id?'selected':''}>${escapeHtml(deck.name)}</option>`).join('')}<option value="__new__" ${m.deckId==='__new__'?'selected':''}>+ Criar novo baralho</option></select>${m.deckId==='__new__'?`<input type="text" style="margin-top:6px;" placeholder="Nome do novo baralho" value="${escapeHtml(m.newDeckName||'')}" oninput="state.modal.newDeckName=this.value">`:''}</div><div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmWebFlashcards()" ${included===0?'disabled':''}>Adicionar ${included} cartão(ões)</button></div></div></div>`;
}

window.addEventListener('hashchange',()=>{
  // Também funciona se uma futura versão da extensão reutilizar uma aba já aberta.
  if(getWebImportPayloadFromLocation()){
    if(hasClaudeStorage() || state.firebaseUser) { consumePendingWebFlashcardImport(); render(); }
  }
});
