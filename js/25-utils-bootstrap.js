/* ============ UTIL ============ */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* live timer tick while studying */
setInterval(()=>{ if(state.view === 'study'){ const t = document.querySelector('.timer'); if(t && state.session) t.textContent = fmtTime(Date.now()-state.session.startTime); } }, 1000);
setInterval(maintainActivityTimers, 60000);
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ finishReadingActivity(); finishWritingActivity(); }
  else { syncRoutineTimerDisplay(); }
});
window.addEventListener('pageshow', () => { syncRoutineTimerDisplay(); });
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPwaInstallPrompt=event;
  state.pwaInstallAvailable=true;
  if(state.modal?.type==='app-options') render();
});

/* Enter avança para a próxima pergunta quando o botão "Próximo →" está visível,
   sem precisar clicar com o mouse. Enquanto o campo de resposta ainda não foi
   revelado, o Enter continua sendo tratado pelo próprio campo (confirma a resposta). */
document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter') return;
  if(state.view !== 'study' || !state.session) return;
  const s = state.session;
  const stdMixedExType = s.mode === 'std-mixed' ? getCurrentExType() : null;
  const isGradedContext = (s.mode === 'open' || stdMixedExType === 'open' || stdMixedExType === 'image-answer') && s.usesGradedOpen;
  const nextVisible = s.mode === 'direct'
    ? (s.revealed && s.lastFeedback !== null)
    : isGradedContext
      ? (s.revealed && s.graded)
      : (s.revealed && !s.verifying);
  if(nextVisible){
    e.preventDefault();
    nextCard();
  }
});

/* Teclas 1-4 escolhem a alternativa correspondente nos modos de múltipla escolha. */
document.addEventListener('keydown', function(e){
  if(!['1','2','3','4'].includes(e.key)) return;
  if(state.view !== 'study' || !state.session) return;
  const s = state.session;
  if(s.revealed || s.verifying) return;
  const idx = parseInt(e.key, 10) - 1;
  if((s.mode === 'mc' || (s.mode === 'std-mixed' && getCurrentExType() === 'mc')) && s.options && !s.loadingOptions){
    if(idx < s.options.length){ e.preventDefault(); answerMC(idx); }
  } else if(s.mode === 'lang-mixed' && getCurrentExType() === 'mc' && s.content && s.content.options && !s.loadingContent){
    if(idx < s.content.options.length){ e.preventDefault(); answerLangMC(idx); }
  }
});

/* Esc aciona "não sei" nas perguntas abertas e nos exercícios de idioma, antes de revelar a resposta. */
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  if(state.view !== 'study' || !state.session) return;
  const s = state.session;
  const stdMixedExType = s.mode === 'std-mixed' ? getCurrentExType() : null;
  if((s.mode === 'open' || stdMixedExType === 'open' || stdMixedExType === 'image-answer') && !s.revealed && !s.verifying){
    e.preventDefault();
    dontKnowOpen();
  } else if(s.mode === 'lang-mixed' && !s.revealed && !s.memorizeMode){
    e.preventDefault();
    dontKnowLang();
  }
});

/* Tecla L mostra/esconde a nota do cartão — só quando não tem campo de texto focado,
   pra não atrapalhar quem está digitando uma resposta que contenha a letra L. */
document.addEventListener('keydown', function(e){
  if(e.key !== 'l' && e.key !== 'L') return;
  if(state.view !== 'study' || !state.session) return;
  const active = document.activeElement;
  if(active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
  const card = getCurrentCard();
  if(!card || !card.note) return;
  e.preventDefault();
  toggleNoteView();
});

/* Atalhos de teclado pra escrever nas notas: Ctrl (Windows/Linux) ou Cmd (Mac) +
   Shift + uma letra — sempre com Shift junto pra reduzir chance de colidir com
   atalhos padrão do navegador (Ctrl/Cmd sozinho com letra é praticamente todo
   reservado por algum navegador: salvar, imprimir, localizar, etc). */
document.addEventListener('keydown', function(e){
  if(state.view !== 'notes' || !state.currentNoteId || state.modal) return;
  if(!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
  const key = e.key.toLowerCase();
  if(!['f','g','l','v','p'].includes(key)) return;
  e.preventDefault();
  const sel = state.noteSelection;
  if(key === 'p'){ // transforma a nota aberta em nota flutuante (Post-it)
    toggleFloatingNote(state.currentNoteId);
  } else if(key === 'f'){ // criar cartão (Flashcard)
    if(!sel || !sel.text){ showToast('Selecione um trecho da nota primeiro.', 'error'); return; }
    requestCardFromNoteSelection();
  } else if(key === 'g'){ // corriGir
    if(!sel || !sel.text || (sel.source !== 'textarea' && sel.source !== 'richtext')){ showToast('Selecione um trecho na área de edição (não na prévia) pra corrigir.', 'error'); return; }
    requestNoteCorrection();
  } else if(key === 'v'){ // opinião
    if(!sel || !sel.text){ showToast('Selecione um trecho da nota primeiro.', 'error'); return; }
    requestNoteOpinion();
  } else if(key === 'l'){ // Link pra outra nota (wikilink) — não depende de seleção
    if(currentNoteIsPlain()) openInsertWikiLinkModalRich();
    else insertWikiLink('note-editor-textarea');
  }
});

// Histórico próprio das notas: cobre digitação, botões de formatação e também
// alterações inseridas pela IA/comentários, que o histórico nativo não conhece.
document.addEventListener('keydown', function(e){
  if(!(e.ctrlKey || e.metaKey) || state.view !== 'notes' || !state.currentNoteId) return;
  const active = document.activeElement;
  const target = e.target;
  const isNoteEditor = !!(
    (active && (active.id === 'note-editor-textarea' || active.id === 'note-editor-plain')) ||
    (target && (target.id === 'note-editor-textarea' || target.id === 'note-editor-plain' || target.closest?.('#note-editor-plain')))
  );
  if(!isNoteEditor) return;
  const key = e.key.toLowerCase();
  if(key === 'z'){
    e.preventDefault();
    if(e.shiftKey) redoNoteEdit(); else undoNoteEdit();
  }else if(key === 'y' && !e.shiftKey){
    e.preventDefault();
    redoNoteEdit();
  }
});

/* Ctrl/Cmd+seta esquerda/direita navegam pelo histórico de notas abertas --
   atalho de teclado pras mesmas setas ← → da barra de navegação (que só
   existem no desktop, ver renderNoteEditor), então o atalho segue a mesma
   restrição. Só dispara com o foco FORA do editor de texto da nota: dentro
   dele, Cmd/Ctrl+seta é o atalho nativo do sistema pra ir ao início/fim da
   linha (Mac) ou pular palavra (Windows/Linux) -- roubar isso do usuário no
   meio da digitação seria pior do que não ter o atalho. */
document.addEventListener('keydown', function(e){
  if(!(e.ctrlKey || e.metaKey) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  if(state.view !== 'notes' || !state.currentNoteId || !isDesktopLayout()) return;
  const active = document.activeElement;
  const isEditableField = active && (active.id === 'note-editor-textarea' || active.id === 'note-editor-plain' || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable);
  if(isEditableField) return;
  if(e.key === 'ArrowLeft'){
    if(!hasNoteHistoryBack()) return;
    e.preventDefault();
    navigateNoteHistoryBack();
  }else{
    if(!hasNoteHistoryForward()) return;
    e.preventDefault();
    navigateNoteHistoryForward();
  }
});

if(hasClaudeStorage()){
  loadData();
  tryReconnectFileHandle();
} else {
  initFirebase();
}

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('Falha ao registrar o service worker', e));
  });
}