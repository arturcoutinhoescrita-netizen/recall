/* ============ HISTÓRICO DE NAVEGAÇÃO ENTRE NOTAS (setas ← →, desktop) ============ */
function pushNoteNavHistory(id){
  // corta o "futuro" se o usuário tinha voltado e agora abre algo novo --
  // mesmo comportamento do histórico de navegação de um navegador.
  if(state.noteNavIndex < state.noteNavHistory.length-1){
    state.noteNavHistory = state.noteNavHistory.slice(0, state.noteNavIndex+1);
  }
  // não empilha de novo se a nota já é a que está no topo (reabrir a mesma
  // nota não deveria virar uma entrada nova no histórico)
  if(state.noteNavHistory[state.noteNavHistory.length-1] !== id){
    state.noteNavHistory.push(id);
  }
  state.noteNavIndex = state.noteNavHistory.length-1;
}
function hasNoteHistoryBack(){
  for(let i=state.noteNavIndex-1; i>=0; i--) if(state.notesItems.some(n=>n.id===state.noteNavHistory[i])) return true;
  return false;
}
function hasNoteHistoryForward(){
  for(let i=state.noteNavIndex+1; i<state.noteNavHistory.length; i++) if(state.notesItems.some(n=>n.id===state.noteNavHistory[i])) return true;
  return false;
}
// pula por cima de entradas de notas já excluídas -- em vez de remover do
// histórico (o que bagunçaria os índices), só ignora na hora de navegar.
function navigateNoteHistoryBack(){
  for(let i=state.noteNavIndex-1; i>=0; i--){
    if(state.notesItems.some(n=>n.id===state.noteNavHistory[i])){
      state.noteNavIndex = i;
      openNote(state.noteNavHistory[i], {skipHistory:true});
      return;
    }
  }
}
function navigateNoteHistoryForward(){
  for(let i=state.noteNavIndex+1; i<state.noteNavHistory.length; i++){
    if(state.notesItems.some(n=>n.id===state.noteNavHistory[i])){
      state.noteNavIndex = i;
      openNote(state.noteNavHistory[i], {skipHistory:true});
      return;
    }
  }
}
function openNote(id, opts){
  rememberNoteScroll(state.currentNoteId);
  finishNotesPresence();
  const selectedItem=state.notesItems.find(item=>item.id===id);
  if(!selectedItem) return;
  // opts.skipHistory: usado pelas próprias setas de navegar (navigateNoteHistoryBack/
  // Forward) -- senão clicar em "voltar" empilharia a nota de volta no topo do
  // histórico, e "avançar" nunca funcionaria de verdade.
  if(!(opts && opts.skipHistory)) pushNoteNavHistory(id);
  state.currentNoteId = id;
  startNotesPresence(id);
  if(selectedItem.type==='note') state.lastNoteId = id;
  state.noteFindReplace = null; // trocar de nota fecha qualquer busca/substituição aberta na anterior
  saveData();
  if(selectedItem.type==='outline'){ render(); restoreNoteScroll(id); return; }
  if(isDesktopLayout()) ensureNoteChatFor(id);
  if(noteContentCache[id] === undefined && !noteContentLoading[id]){
    noteContentLoading[id] = true;
    delete noteContentError[id];
    render();
    withTimeout(loadNoteContentFromR2(id), 12000, 'note_content_load_timeout').then(content => {
      const note = state.notesItems.find(n=>n.id===id);
      // notas "texto normal" fazem a conversão de texto legado (de antes da
      // reescrita pra WYSIWYG) UMA VEZ SÓ aqui, no carregamento — nunca a
      // cada render(), senão o texto ia sendo escapado de novo a cada vez
      // que a tela recarregasse (abrir a busca, por exemplo), acumulando
      // "código" (entidades HTML tipo &amp;lt;) visível no meio da nota.
      noteContentCache[id] = (note && note.format === 'plain') ? normalizePlainNoteContentForEditing(content) : content;
      delete noteContentLoading[id];
      render();
      focusPendingOutlineAnchor();
      restoreNoteScroll(id);
    }).catch(err => {
      console.error('Falha ao carregar conteúdo da nota', err);
      delete noteContentLoading[id];
      noteContentError[id] = true;
      render();
    });
  } else {
    render();
    focusPendingOutlineAnchor();
    restoreNoteScroll(id);
  }
}
function retryLoadNoteContent(id){
  delete noteContentError[id];
  openNote(id);
}
