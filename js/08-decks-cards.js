/* ============ DECK / CARD CRUD ============ */
function createDeck(name, color, type){
  const d = { id: uid(), folderId:null, name: name.trim(), color: color || DECK_COLORS[state.decks.length % DECK_COLORS.length], type: type || 'standard', aiEnabled: true, sentenceDifficulty: 'intermediate', favorite:false, archived:false };
  state.decks.push(d);
  state.cards[d.id] = [];
  state.currentDeckId = d.id;
  state.lastDeckId = d.id;
  state.view = 'deck'; state.tab = 'cards';
  saveData(); render();
}
function getOrderedDeckFolders(){
  return [...state.deckFolders].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

function getDecksInFolder(folderId){
  return getOrderedDecks().filter(deck=>(deck.folderId||null)===(folderId||null));
}

function openDeckFolderModal(folderId){
  const folder=state.deckFolders.find(f=>f.id===folderId);
  state.modal={type:'deck-folder',folderId:folder?folder.id:null,name:folder?folder.name:''};
  render();
}

function confirmDeckFolderModal(){
  const modal=state.modal;
  if(!modal || modal.type!=='deck-folder')return;
  const name=String(modal.name||'').trim();
  if(!name){showToast('Digite o nome da pasta.','error');return;}
  if(name.length>80){showToast('O nome da pasta deve ter até 80 caracteres.','error');return;}
  const duplicate=state.deckFolders.some(f=>f.id!==modal.folderId && f.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
  if(duplicate){showToast('Já existe uma pasta com esse nome.','error');return;}
  if(modal.folderId){
    const folder=state.deckFolders.find(f=>f.id===modal.folderId);
    if(!folder){state.modal=null;render();return;}
    folder.name=name;
  }else{
    state.deckFolders.push({id:uid(),name,collapsed:false});
  }
  state.modal=null;
  saveData();render();showToast('Pasta salva.');
}

function toggleDeckFolder(folderId){
  const folder=state.deckFolders.find(f=>f.id===folderId);
  if(!folder)return;
  folder.collapsed=!folder.collapsed;
  saveData();render();
}

function deleteDeckFolder(folderId){
  const folder=state.deckFolders.find(f=>f.id===folderId);
  if(!folder)return;
  const count=state.decks.filter(d=>d.folderId===folderId).length;
  askConfirm('Excluir a pasta "'+folder.name+'"? '+count+' baralho(s) serão movidos para "Sem pasta" e nenhum cartão será apagado.',()=>{
    state.decks.forEach(d=>{if(d.folderId===folderId)d.folderId=null;});
    state.deckFolders=state.deckFolders.filter(f=>f.id!==folderId);
    saveData();render();showToast('Pasta excluída; os baralhos foram preservados.');
  });
}

function openMoveDeckModal(deckId){
  const deck=state.decks.find(d=>d.id===deckId);
  if(!deck)return;
  state.modal={type:'deck-move',deckId,folderId:deck.folderId||null};
  render();
}

function moveDeckToFolder(deckId,folderId){
  const deck=state.decks.find(d=>d.id===deckId);
  if(!deck)return false;
  const target=state.deckFolders.find(f=>f.id===folderId);
  const newFolderId=target?target.id:null;
  if(deck.folderId===newFolderId)return false;
  deck.folderId=newFolderId;
  if(target)target.collapsed=false;
  saveData();render();showToast(target?'Baralho movido para "'+target.name+'".':'Baralho movido para "Sem pasta".');
  return true;
}

function confirmMoveDeckModal(){
  const modal=state.modal;
  if(!modal || modal.type!=='deck-move')return;
  const id=modal.deckId,folderId=modal.folderId;
  state.modal=null;
  if(!moveDeckToFolder(id,folderId))render();
}

function startDeckDrag(event,deckId){
  if(!event.dataTransfer)return;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',deckId);
}

function allowDeckDrop(event){
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  event.currentTarget.classList.add('deck-folder-drop-active');
}

function leaveDeckDrop(event){
  event.currentTarget.classList.remove('deck-folder-drop-active');
}

function dropDeckOnFolder(event,folderId){
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('deck-folder-drop-active');
  const deckId=event.dataTransfer && event.dataTransfer.getData('text/plain');
  if(deckId)moveDeckToFolder(deckId,folderId);
}

function renderDeckFolderModal(modal){
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:min(420px,calc(100vw - 24px));">
    <h3>${modal.folderId?'Renomear pasta':'Nova pasta de baralhos'}</h3>
    <div class="field"><label>NOME DA PASTA</label><input type="text" maxlength="80" autofocus value="${escapeHtml(modal.name||'')}" placeholder="Ex.: História Medieval" oninput="state.modal.name=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();confirmDeckFolderModal()}"></div>
    <p style="font-size:12px;color:var(--text-muted);">Organize os baralhos por assunto, sem alterar seus cartões.</p>
    <div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmDeckFolderModal()">Salvar pasta</button></div>
  </div></div>`;
}

function renderMoveDeckModal(modal){
  const deck=state.decks.find(d=>d.id===modal.deckId);
  if(!deck)return '';
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:min(440px,calc(100vw - 24px));">
    <h3>Mover baralho</h3>
    <p style="font-size:13px;color:var(--text-muted);">Escolha uma pasta para <strong>${escapeHtml(deck.name)}</strong>.</p>
    <div class="field"><label>DESTINO</label><select onchange="state.modal.folderId=this.value||null">
      <option value="" ${!modal.folderId?'selected':''}>Sem pasta</option>
      ${getOrderedDeckFolders().map(f=>`<option value="${f.id}" ${modal.folderId===f.id?'selected':''}>📁 ${escapeHtml(f.name)}</option>`).join('')}
    </select></div>
    <div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmMoveDeckModal()">Mover</button></div>
  </div></div>`;
}

function isAiEnabled(deck){
  return !deck || deck.aiEnabled !== false; // padrão: ligada, a menos que explicitamente desligada
}
function toggleDeckAi(deckId){
  const deck = state.decks.find(d=>d.id===deckId);
  if(!deck) return;
  deck.aiEnabled = !isAiEnabled(deck);
  saveData(); render();
}
// sem render() no keyup, mesmo motivo do campo DATA DE CONCLUSÃO: redesenhar a
// página a cada tecla recria o <input>, perdendo o foco e a posição do cursor
// no meio da digitação. O ajuste final (trim, nome vazio) só acontece no blur.
function updateDeckName(id, value){
  const deck = state.decks.find(d=>d.id===id);
  if(!deck) return;
  deck.name = value;
  saveData();
}
function finalizeDeckName(id, value){
  const deck = state.decks.find(d=>d.id===id);
  if(!deck) return;
  deck.name = String(value||'').trim() || deck.name.trim() || 'Baralho sem nome';
  saveData(); render();
}
function toggleDeckFavorite(deckId){
  const deck=state.decks.find(d=>d.id===deckId);
  if(!deck) return;
  deck.favorite=!deck.favorite;
  saveData(); render();
}
function toggleDeckArchive(deckId){
  const deck=state.decks.find(d=>d.id===deckId);
  if(!deck) return;
  deck.archived=!deck.archived;
  if(deck.archived){
    state.agendaEvents=state.agendaEvents.filter(event=>!(event.autoReview&&event.deckId===deckId&&!event.completedAt));
  }
  saveData(); render();
  showToast(deck.archived ? 'Baralho arquivado. Ele continua disponível para estudo manual.' : 'Baralho reativado na agenda.');
}
function openSpacedRepetitionModal(deckId){
  const deck = state.decks.find(d=>d.id===deckId);
  if(!deck) return;
  state.modal = { type:'spaced-repetition', deckId, ...getSpacedRepetitionConfig(deck) };
  render();
}
function renderSpacedRepetitionModal(m){
  const deck = state.decks.find(d=>d.id===m.deckId);
  const num=(field,fallback)=>{ const v=Number(m[field]); return Number.isFinite(v)?v:fallback; };
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>⏱️ Revisão espaçada${deck?` — ${escapeHtml(deck.name)}`:''}</h3>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:0 0 4px;">Controla quantos dias se passam entre uma revisão e a próxima, só para este baralho. Já vem preenchido com o padrão do sistema — mude o que quiser.</p>
      <div class="field">
        <label>1º INTERVALO (dias após acertar pela 1ª vez)</label>
        <input type="number" min="0" step="1" value="${num('firstInterval',DEFAULT_SPACED_REPETITION.firstInterval)}" oninput="state.modal.firstInterval=Math.max(0,parseInt(this.value)||0)">
      </div>
      <div class="field">
        <label>2º INTERVALO (dias após acertar pela 2ª vez)</label>
        <input type="number" min="0" step="1" value="${num('secondInterval',DEFAULT_SPACED_REPETITION.secondInterval)}" oninput="state.modal.secondInterval=Math.max(0,parseInt(this.value)||0)">
      </div>
      <div class="field">
        <label>CRESCIMENTO (multiplicador a cada acerto seguinte)</label>
        <input type="number" min="1" step="0.1" value="${num('ease',DEFAULT_SPACED_REPETITION.ease)}" oninput="state.modal.ease=Math.max(1,parseFloat(this.value)||1)">
        <p style="font-size:11px; color:var(--text-faint); margin:3px 0 0;">Com 2,5, um intervalo de 6 dias vira ~15 dias na próxima vez, se você continuar acertando.</p>
      </div>
      <div class="field">
        <label>INTERVALO AO ERRAR (dias)</label>
        <input type="number" min="0" step="1" value="${num('wrongInterval',DEFAULT_SPACED_REPETITION.wrongInterval)}" oninput="state.modal.wrongInterval=Math.max(0,parseInt(this.value)||0)">
      </div>
      <div class="modal-actions" style="justify-content:space-between;">
        <button class="ghost-btn" onclick="resetSpacedRepetitionModal()">↺ Restaurar padrão</button>
        <div style="display:flex; gap:8px;">
          <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
          <button class="primary-btn" onclick="confirmSpacedRepetitionModal()">Salvar</button>
        </div>
      </div>
    </div>
  </div>`;
}
function resetSpacedRepetitionModal(){
  if(!state.modal || state.modal.type!=='spaced-repetition') return;
  Object.assign(state.modal, DEFAULT_SPACED_REPETITION);
  render();
}
function confirmSpacedRepetitionModal(){
  const m = state.modal; if(!m || m.type!=='spaced-repetition') return;
  const deck = state.decks.find(d=>d.id===m.deckId); if(!deck) return;
  deck.spacedRepetition = { firstInterval:m.firstInterval, secondInterval:m.secondInterval, ease:m.ease, wrongInterval:m.wrongInterval };
  state.modal = null;
  saveData();
  render();
  showToast('Revisão espaçada atualizada.');
}
function deleteDeck(id){
  const deck = state.decks.find(d=>d.id===id);
  if(!deck) return;
  const cardCount = (state.cards[id]||[]).length;
  askConfirm(`Excluir o baralho "${deck.name}" e ${cardCount} cartão(ões)? Essa ação não pode ser desfeita.`, () => {
    // Preserve a posição do usuário nos baralhos, em vez de voltar ao início.
    const orderedDecks = getOrderedDecks();
    const deletedIndex = orderedDecks.findIndex(d=>d.id===id);
    state.decks = state.decks.filter(d=>d.id!==id);
    delete state.cards[id];
    const remainingDecks = getOrderedDecks();
    const nextDeck = remainingDecks[Math.min(deletedIndex, remainingDecks.length-1)] || null;

    // O atalho "Baralhos" não deve tentar abrir um baralho já excluído.
    if(state.lastDeckId === id) state.lastDeckId = nextDeck ? nextDeck.id : null;
    if(state.currentDeckId === id){
      if(isDesktopLayout() && nextDeck){
        // No desktop, mantém o explorador aberto selecionando o próximo baralho.
        selectDeck(nextDeck.id);
        showToast('Baralho excluído.');
        return;
      }
      // No celular (ou ao excluir o último), abre a lista de baralhos.
      state.currentDeckId = null;
      state.view = 'deck-list';
      state.mobileHomeSection = 'decks';
      state.tab = 'cards';
      state.editingCardId = null;
    }
    saveData(); render();
    showToast('Baralho excluído.');
  });
}
function addCard(deckId, front, back, note){
  if(!front.trim() || !back.trim()) return;
  const card = makeCard(front, back);
  card.note = (note||'').trim();
  state.cards[deckId].push(card);
  saveData(); render();
}
function deleteCard(deckId, cardId){
  state.cards[deckId] = state.cards[deckId].filter(c=>c.id!==cardId);
  saveData(); render();
}
function makeCard(front, back){
  return { id: uid(), front: front.trim(), back: (back||'').trim(), note:'', ease:2.5, interval:0, reps:0, due:Date.now(), flagged:false, learned:false, priority:false };
}
function isImageCard(card){
  return !!(card && card.cardKind === 'image');
}
/* pino de imagem = um cartão comum (front=pergunta, back=resposta, note=nota) mais
   imageUrl/pinX/pinY — assim reaproveita toda a repetição espaçada já existente. */
function addImagePin(deckId, imageUrl, x, y, question, answer, note){
  if(!imageUrl || !question.trim() || !answer.trim()) return;
  const card = makeCard(question, answer);
  card.note = (note||'').trim();
  card.cardKind = 'image';
  card.imageUrl = imageUrl.trim();
  card.pinX = x; card.pinY = y;
  state.cards[deckId].push(card);
  saveData(); render();
  return card;
}
function getDeckImageUrls(deckId){
  const urls = (state.cards[deckId]||[]).filter(isImageCard).map(c=>c.imageUrl);
  return Array.from(new Set(urls));
}
function startNewPinAt(e){
  const rect = e.target.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  state.newPinPos = { x: Math.round(x*10)/10, y: Math.round(y*10)/10 };
  render();
}
function cancelNewPin(){
  state.newPinPos = null;
  render();
}
function submitNewPin(deckId){
  const q = document.getElementById('new-pin-question').value;
  const a = document.getElementById('new-pin-answer').value;
  const note = document.getElementById('new-pin-note').value;
  if(!q.trim() || !a.trim()){ showToast('Preencha pergunta e resposta do pino.', 'error'); return; }
  const pos = state.newPinPos;
  state.newPinPos = null;
  addImagePin(deckId, state.imageEditorUrl, pos.x, pos.y, q, a, note);
  showToast('Pino adicionado.');
}
function renderImageCardForm(deck){
  const url = (state.imageEditorUrl||'').trim();
  const pins = (state.cards[deck.id]||[]).filter(c => isImageCard(c) && c.imageUrl === url);
  return `
  <div class="field">
    <label>URL DA IMAGEM</label>
    <input type="text" id="image-editor-url" placeholder="Cole o link da imagem (https://...)" value="${escapeHtml(state.imageEditorUrl||'')}" oninput="state.imageEditorUrl=this.value; state.newPinPos=null; render();" onfocus="state._searchFocused=false;">
  </div>
  ${url ? `
    <p style="font-size:11.5px; color:var(--text-faint); margin:-4px 0 0 0;">Clique na imagem pra adicionar um pino. Já tem ${pins.length} pino(s) aqui.</p>
    <div style="position:relative; max-width:420px; margin:0 auto; background:var(--bg-2); border-radius:12px;">
      <img src="${escapeHtml(url)}" style="width:100%; display:block; border-radius:12px; cursor:crosshair;" onclick="startNewPinAt(event)" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
      <div style="display:none; padding:36px 16px; text-align:center; color:var(--error); font-size:13px;">⚠ Não foi possível carregar essa imagem. Confira o link.</div>
      ${pins.map((p,i) => `<div title="${escapeHtml(p.front)}" style="position:absolute; left:${p.pinX}%; top:${p.pinY}%; transform:translate(-50%,-50%); width:22px; height:22px; border-radius:50%; background:var(--accent); color:var(--brand-text); font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; border:2px solid var(--brand-text); pointer-events:none;">${i+1}</div>`).join('')}
      ${state.newPinPos ? `<div style="position:absolute; left:${state.newPinPos.x}%; top:${state.newPinPos.y}%; transform:translate(-50%,-50%); width:22px; height:22px; border-radius:50%; background:var(--success); border:2px solid #06210F; pointer-events:none;"></div>` : ''}
    </div>
    ${state.newPinPos ? `
    <div class="field">
      <label>PERGUNTA DO PINO</label>
      <textarea id="new-pin-question" rows="2" placeholder="Ex: O que é essa estrutura?" autofocus></textarea>
    </div>
    <div class="field">
      <label>RESPOSTA</label>
      <textarea id="new-pin-answer" rows="2" placeholder="Ex: Válvula mitral"></textarea>
    </div>
    <div class="field">
      <label>NOTA (opcional)</label>
      <textarea id="new-pin-note" rows="2" placeholder="Explicação mais detalhada"></textarea>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="ghost-btn" onclick="cancelNewPin()">Cancelar pino</button>
      <button class="primary-btn" onclick="submitNewPin('${deck.id}')">＋ Salvar pino</button>
    </div>
    ` : ''}
  ` : ''}
  `;
}
function toggleCardFlag(deckId, cardId){
  const card = (state.cards[deckId]||[]).find(c=>c.id===cardId);
  if(!card) return;
  card.flagged = !card.flagged;
  saveData(); render();
}
function toggleFlagCurrentCard(){
  const s = state.session; if(!s) return;
  const card = getCurrentCard(); if(!card) return;
  card.flagged = !card.flagged;
  saveData(); render();
}
function toggleNoteView(){
  const s = state.session; if(!s) return;
  s.showNote = !s.showNote;
  render();
}
function toggleCardLearned(deckId, cardId){
  const card = (state.cards[deckId]||[]).find(c=>c.id===cardId);
  if(!card) return;
  card.learned = !card.learned;
  if(card.learned) card.priority = false; // não faz sentido as duas juntas
  saveData(); render();
}
function toggleLearnedCurrentCard(){
  const s = state.session; if(!s) return;
  const card = getCurrentCard(); if(!card) return;
  card.learned = !card.learned;
  if(card.learned) card.priority = false;
  saveData(); render();
  if(card.learned) showToast('Marcado como aprendido — não vai mais aparecer nas próximas sessões.');
}
function toggleCardPriority(deckId, cardId){
  const card = (state.cards[deckId]||[]).find(c=>c.id===cardId);
  if(!card) return;
  card.priority = !card.priority;
  if(card.priority) card.learned = false;
  saveData(); render();
}
function togglePriorityCurrentCard(){
  const s = state.session; if(!s) return;
  const card = getCurrentCard(); if(!card) return;
  card.priority = !card.priority;
  if(card.priority) card.learned = false;
  saveData(); render();
}
function resetDeckFlags(deckId){
  const deck = state.decks.find(d=>d.id===deckId);
  askConfirm(`Limpar sinalizações, aprendidos e prioridades de todos os cartões de "${deck ? deck.name : ''}"? Isso não afeta o progresso de repetição espaçada, só essas marcações.`, () => {
    (state.cards[deckId]||[]).forEach(c => { c.flagged = false; c.learned = false; c.priority = false; });
    saveData(); render();
    showToast('Marcações do baralho resetadas.');
  }, 'Resetar');
}
function findDuplicateLanguageTerm(deckId, term, category, excludeCardId){
  const termKey = normalizeAnswer(stripParens(term));
  const categoryKey = normalizeAnswer(category || '');
  return (state.cards[deckId] || []).find(card =>
    card.id !== excludeCardId &&
    normalizeAnswer(stripParens(card.front)) === termKey &&
    normalizeAnswer(card.category || '') === categoryKey
  );
}
function addTermCard(deckId, term, translation, note, category){
  if(!term.trim()) return;
  const duplicate = findDuplicateLanguageTerm(deckId, term, category);
  if(duplicate){
    showToast(`O termo "${term.trim()}" já existe neste baralho${category ? ` como ${category}` : ' sem categoria'}.`, 'error');
    return false;
  }
  const card = makeCard(term, translation||'');
  card.note = (note||'').trim();
  card.category = (category||'').trim();
  state.cards[deckId].push(card);
  saveData(); render();
  return true;
}
function fillTranslation(deckId, cardId){
  const val = collectTranslationFields(`fill-back-${cardId}`);
  if(!val) return;
  const card = (state.cards[deckId]||[]).find(c=>c.id===cardId);
  if(!card) return;
  card.back = val;
  saveData(); render();
}

