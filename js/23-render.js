/* ============ RENDER ============ */
function renderPointsBadge(s){
  if(!s.revealed || !s.lastFeedback || !s.lastEarned) return '';
  return `<div style="margin-top:6px; font-size:12px; color:var(--success); text-align:center; font-weight:600;">+${s.lastEarned} pontos${s.lastBonusMsg ? ` · 🎉 ${escapeHtml(s.lastBonusMsg)}` : ''}</div>`;
}
function fmtTime(ms){
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const sec = s%60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function fmtDue(due){
  if(!due) return 'novo';
  const diff = due - Date.now();
  if(diff <= 0) return 'hoje';
  const days = Math.round(diff/(24*60*60*1000));
  if(days <= 0) return 'hoje';
  if(days === 1) return 'amanhã';
  return `em ${days}d`;
}

let __lastRenderKey = null;
let pageTransitionTimer = null;

/* Entrada por IME/dead keys (acentos, til, cedilha etc.)
   ---------------------------------------------------------
   No macOS, especialmente no Chrome/Chromium, uma "dead key" pode ser
   anunciada no keydown como key="Dead" ANTES de compositionstart. Isso cria
   uma janela perigosa entre pressionar o acento e pressionar a vogal: qualquer
   render() nesse intervalo substitui o input/contenteditable e o navegador
   perde o estado nativo que produziria á/ã/ê/ç.

   Há ainda diferenças de ordem entre compositionend e o input final. Portanto
   não liberamos um render pendente imediatamente no compositionend: esperamos
   o commit do input e um pequeno período de estabilização do DOM.

   Esta guarda é global de propósito: o mesmo problema pode atingir notas,
   busca, modais e respostas de estudo. Nenhum evento é cancelado; apenas
   adiamos rerenders que recriariam o elemento focado. */
let __nativeCompositionDepth = 0;
let __deadKeyInputPending = false;
let __textInputSettleUntil = 0;
let __renderPendingAfterComposition = false;
let __deadKeyFallbackTimer = null;
let __textInputSettleTimer = null;

function isEditableTextTarget(target){
  if(!target || target.nodeType !== 1) return false;
  if(target.isContentEditable || target.closest?.('[contenteditable="true"]')) return true;
  if(target.tagName === 'TEXTAREA') return true;
  if(target.tagName !== 'INPUT') return false;
  const type=String(target.type||'text').toLowerCase();
  return !['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes(type);
}
function isTextCompositionActive(){
  return __nativeCompositionDepth > 0 || __deadKeyInputPending || Date.now() < __textInputSettleUntil;
}
function flushDeferredRenderAfterTextInput(){
  if(isTextCompositionActive() || !__renderPendingAfterComposition) return;
  __renderPendingAfterComposition = false;
  requestAnimationFrame(()=>{
    // Um novo dead key/composition pode ter começado entre o timer e este frame.
    if(isTextCompositionActive()){
      __renderPendingAfterComposition = true;
      return;
    }
    render();
  });
}
function scheduleTextInputSettle(delay=120){
  __textInputSettleUntil = Math.max(__textInputSettleUntil, Date.now()+delay);
  if(__textInputSettleTimer) clearTimeout(__textInputSettleTimer);
  __textInputSettleTimer=setTimeout(()=>{
    if(__nativeCompositionDepth>0 || __deadKeyInputPending) return;
    __textInputSettleUntil=0;
    flushDeferredRenderAfterTextInput();
  }, delay+8);
}
function armDeadKeyInputGuard(){
  __deadKeyInputPending=true;
  if(__deadKeyFallbackTimer) clearTimeout(__deadKeyFallbackTimer);
  // Se o usuário desistir da combinação (trocar foco, apertar outra tecla etc.),
  // a UI não pode ficar bloqueada indefinidamente.
  __deadKeyFallbackTimer=setTimeout(()=>{
    __deadKeyInputPending=false;
    scheduleTextInputSettle(80);
  }, 2200);
}
function releaseDeadKeyInputGuard(){
  __deadKeyInputPending=false;
  if(__deadKeyFallbackTimer){ clearTimeout(__deadKeyFallbackTimer); __deadKeyFallbackTimer=null; }
}

// CAPTURE é intencional: esta proteção precisa começar antes de qualquer
// atalho/handler do aplicativo enxergar a tecla que iniciou a composição.
document.addEventListener('keydown', event=>{
  if(!isEditableTextTarget(event.target)) return;
  // Não dependemos apenas de key="Dead": no layout Brazilian - Pro o Chrome
  // pode anunciar a tecla morta como uma tecla imprimível comum. Armamos a
  // guarda para toda tecla capaz de iniciar texto e a soltamos no input que
  // confirma a edição. Atalhos com Cmd/Ctrl ficam de fora.
  const isPotentialTextKey = (!event.metaKey && !event.ctrlKey && String(event.key||'').length===1) ||
    event.key === 'Dead' || event.key === 'Process' ||
    event.key === 'Unidentified' || event.keyCode === 229 ||
    /^[`´~^¨]$/.test(event.key||'');
  if(isPotentialTextKey) armDeadKeyInputGuard();
}, true);

document.addEventListener('compositionstart', event=>{
  if(!isEditableTextTarget(event.target)) return;
  __nativeCompositionDepth += 1;
  armDeadKeyInputGuard();
}, true);

document.addEventListener('compositionend', event=>{
  if(!isEditableTextTarget(event.target)) return;
  __nativeCompositionDepth = Math.max(0, __nativeCompositionDepth - 1);
  releaseDeadKeyInputGuard();
  // Não renderizar aqui. Alguns engines ainda vão disparar/confirmar o input.
  scheduleTextInputSettle(140);
}, true);

document.addEventListener('beforeinput', event=>{
  if(!isEditableTextTarget(event.target)) return;
  // Protege também caracteres diretos (como ç) quando o oninput do campo
  // chama render(): o DOM só pode ser recriado depois do commit nativo.
  scheduleTextInputSettle(event.isComposing ? 180 : 90);
  if(event.isComposing || /Composition/i.test(event.inputType||'') || __deadKeyInputPending){
    // Mantém a guarda viva até o input que efetivamente alterou o editor.
    if(__deadKeyInputPending) armDeadKeyInputGuard();
  }
}, true);

document.addEventListener('input', event=>{
  if(!isEditableTextTarget(event.target)) return;
  const belongsToComposition = event.isComposing || /Composition/i.test(event.inputType||'') || __deadKeyInputPending || __nativeCompositionDepth>0;
  if(!belongsToComposition){
    scheduleTextInputSettle(90);
    return;
  }
  // Se esse já é o input final (não composing), podemos soltar a dead key, mas
  // ainda damos ao navegador alguns ms para concluir Selection/DOM internamente.
  if(!event.isComposing && __nativeCompositionDepth===0) releaseDeadKeyInputGuard();
  scheduleTextInputSettle(140);
}, true);

document.addEventListener('focusout', event=>{
  if(!isEditableTextTarget(event.target)) return;
  if(__nativeCompositionDepth===0){
    releaseDeadKeyInputGuard();
    scheduleTextInputSettle(40);
  }
}, true);

// Trocar de aplicativo/aba no meio de uma tecla morta pode cancelar a
// composição sem disparar compositionend. Nunca carregamos esse estado
// incompleto quando o Letther B perde ou recupera o foco.
function resetInterruptedTextComposition(){
  __nativeCompositionDepth=0;
  releaseDeadKeyInputGuard();
  __textInputSettleUntil=0;
  if(__textInputSettleTimer){ clearTimeout(__textInputSettleTimer); __textInputSettleTimer=null; }
  flushDeferredRenderAfterTextInput();
}
function renderNavigationChange(){
  // Cliques que mudam de tela/aba não podem ficar presos atrás da proteção de
  // teclado. Isso acontecia ao sair de um campo de cartão e clicar em Estudar:
  // state.tab mudava, mas o render visível continuava adiado.
  __renderPendingAfterComposition=false;
  resetInterruptedTextComposition();
  render();
}
window.addEventListener('blur', resetInterruptedTextComposition);
window.addEventListener('focus', resetInterruptedTextComposition);
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) resetInterruptedTextComposition();
});

function render(){
  if(isTextCompositionActive()){
    __renderPendingAfterComposition = true;
    return;
  }
  // A navegação muda `state.view` antes de chegar aqui. Encerrar neste ponto
  // garante que sair de Notas por qualquer menu registre o tempo acumulado.
  if(state.view!=='notes') finishNotesPresence();
  // guarda foco e posição do cursor ANTES de recriar a tela, pra restaurar depois —
  // evita que re-renders disparados por outra coisa (ex: o toast sumindo sozinho)
  // joguem o cursor de volta pro início enquanto o usuário está digitando.
  const active = document.activeElement;
  let savedId = null, savedStart = null, savedEnd = null;
  if(active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') && active.id){
    savedId = active.id;
    try{ savedStart = active.selectionStart; savedEnd = active.selectionEnd; }catch(e){}
  }
  // idem pra rolagem: render() recria .main do zero a cada chamada, então sem isso
  // qualquer clique (marcar status, adicionar tag, favoritar...) jogava a tela de
  // volta pro topo. Só restaura se a "tela" continua sendo a mesma (mesma view,
  // mesmo livro/baralho/aba) — trocar de tela deve mesmo começar do topo.
  const prevMain = document.querySelector('.main');
  const prevScrollTop = prevMain ? prevMain.scrollTop : 0;
  // Notas têm rolagem própria dentro de .notes-editor-panes. Menus de cor,
  // títulos, links, imagens e modais chamam render(); preservar só .main não
  // basta, porque o editor interno seria recriado no topo.
  const noteEditorRenderState = typeof captureNoteEditorRenderState==='function'
    ? captureNoteEditorRenderState()
    : null;
  // Cada coluna da agenda possui rolagem própria. Ao abrir/editar um evento,
  // preservamos o horário que estava sendo observado em vez de voltar para 6h.
  const prevAgendaHourScrolls = state.view==='agenda'
    ? Array.from(document.querySelectorAll('.agenda-day-hours')).map(el=>el.scrollTop)
    : [];
  const renderKey = `${state.view}|${state.currentBookId||''}|${state.currentDeckId||''}|${state.tab||''}`;
  const restoreScroll = renderKey === __lastRenderKey;
  __lastRenderKey = renderKey;

  const app = document.getElementById('app');
  if(!hasClaudeStorage() && !state.firebaseUser){
    app.innerHTML = renderAuthGate();
    return;
  }
  // no mobile, alterna entre a "etapa" da lista de baralhos e a do baralho aberto;
  // no desktop essa classe não tem efeito nenhum (barra lateral fica sempre visível).
  app.className = `${state.view === 'home' ? 'step-home' : 'step-detail'}${state.sidebarAutoHide ? ' sidebar-auto-hide' : ''}${state.pageTransition ? ' page-transition' : ''}`;
  app.innerHTML = `
    ${renderSidebar()}
    <div class="app-workspace">
      ${renderDesktopTopNav()}
      <div class="desktop-content">
        ${renderDesktopDeckExplorer()}
        <div class="main">${renderMain()}</div>
      </div>
    </div>
    ${renderFloatingNotes()}
    ${state.noteCorrection ? renderModal(state.noteCorrection) : (state.modal && !(state.modal.type==='note-chat' && isDesktopLayout()) ? renderModal() : '')}
    ${state.noteConversationManager ? renderNoteConversationManager(state.noteConversationManager) : ''}
    ${state.toast ? renderToast() : ''}
  `;
  if(restoreScroll){
    const newMain = document.querySelector('.main');
    if(newMain) newMain.scrollTop = prevScrollTop;
  }
  if(noteEditorRenderState && typeof restoreNoteEditorRenderState==='function'){
    restoreNoteEditorRenderState(noteEditorRenderState);
  }
  if(prevAgendaHourScrolls.length){
    document.querySelectorAll('.agenda-day-hours').forEach((el,index)=>{ el.scrollTop=prevAgendaHourScrolls[index]||0; });
  }else if(state.view==='agenda'){
    // Primeira vez entrando na Agenda nesta visita à tela (prevAgendaHourScrolls
    // vazio == não havia ".agenda-day-hours" no DOM antes deste render, ou seja,
    // não tem posição de rolagem prévia pra restaurar). A grade agora cobre o dia
    // inteiro a partir da meia-noite (antes começava às 6h) -- sem isso a tela
    // sempre abriria lá em cima, na madrugada, em vez de num horário mais útil.
    document.querySelectorAll('.agenda-day-hours').forEach(el=>{ el.scrollTop=576; });
  }
  if(state.modal?.type==='active-outline-view' && state.activeOutlineScroll.outlineId===state.modal.outlineId){
    const outlineScrollEl = document.querySelector('.active-outline-view-scroll');
    if(outlineScrollEl) outlineScrollEl.scrollTop = state.activeOutlineScroll.top;
  }
  if(state.pageTransition){
    if(pageTransitionTimer) clearTimeout(pageTransitionTimer);
    pageTransitionTimer=setTimeout(()=>{ state.pageTransition=false; app.classList.remove('page-transition'); },280);
  }

  if(savedId){
    const el = document.getElementById(savedId);
    if(el){
      el.focus();
      if(savedStart !== null){
        const len = el.value.length;
        try{ el.setSelectionRange(Math.min(savedStart, len), Math.min(savedEnd, len)); }catch(e){}
      }
      return; // já restauramos o foco certo, não precisa do fallback abaixo
    }
  }
  if(state.modal?.type==='quick-command'){ focusQuickCommandInput(); return; }
  requestAnimationFrame(focusStudyInput);
}
function focusStudyInput(){
  if(state.view === 'deck' && state.tab === 'cards' && state._searchFocused){
    const el = document.getElementById('card-search-input');
    if(el){
      el.focus();
      const pos = el.value.length;
      try{ el.setSelectionRange(pos, pos); }catch(e){}
    }
    return;
  }
  if(state.view !== 'study' || !state.session) return;
  const s = state.session;
  if(s.revealed || s.verifying) return;
  let id = null;
  if(s.mode === 'open' && !s.usesGradedOpen) id = 'open-input';
  else if(s.mode === 'open' && s.usesGradedOpen && !s.revealed) id = 'open-graded-input';
  else if(s.mode === 'copy-memorize') id = 'copy-input';
  else if(s.mode === 'std-mixed'){
    const exType = getCurrentExType();
    if(exType === 'open' || exType === 'image-answer'){
      id = s.usesGradedOpen ? 'open-graded-input' : 'open-input';
    }
  }
  else if(s.mode === 'lang-mixed'){
    const exType = getCurrentExType();
    if(exType === 'translate') id = 'lang-input';
    else if(exType === 'reverseTranslate') id = 'lang-input';
    else if(exType === 'write' && s.content && !s.content.error && !s.loadingContent) id = 'lang-input';
    else if(exType === 'translateOther') id = 'lang-input';
    else if(exType === 'copy-translation') id = 'lang-input';
  }
  if(!id) return;
  const el = document.getElementById(id);
  if(el){ el.focus(); }
}
function isDesktopLayout(){ return typeof window!=='undefined' && window.matchMedia('(min-width:821px)').matches; }
function openDesktopDecks(){
  finishReadingActivity(); finishWritingActivity();
  // A primeira tela do app é neutra; só abrimos um baralho depois do clique.
  // Daí em diante, Baralhos sempre retoma o último baralho realmente usado.
  const lastDeck = state.decks.find(deck => deck.id===state.lastDeckId);
  const fallbackDeck = getOrderedDecks()[0];
  const deck = lastDeck || fallbackDeck;
  if(!deck){ state.view='home'; state.currentDeckId=null; state.tab='cards'; render(); return; }
  selectDeck(deck.id);
}
function renderDesktopTopNav(){
  const deckActive=state.view==='deck'||state.view==='study';
  return `<nav class="desktop-top-nav" aria-label="Navegação principal">
    <button class="desktop-top-brand" title="Baralhos" onclick="openDesktopDecks()"><span><strong>Letther B</strong><small>let it be</small></span></button>
    <button class="ghost-btn ${deckActive?'active':''}" onclick="openDesktopDecks()">🗂️ Baralhos</button>
    <button class="ghost-btn ${state.view==='notes'?'active':''}" onclick="openNotes()">📓 Notas</button>
    <button class="ghost-btn ${state.view==='agenda'?'active':''}" onclick="openAgenda()">🗓️ Agenda</button>
    <button class="ghost-btn ${state.view==='routine'?'active':''}" onclick="openRoutine()">🌿 Rotina</button>
    <button class="ghost-btn ${(state.view==='library'||state.view==='book'||state.view==='epub-reader')?'active':''}" onclick="openLibrary()">📚 Leituras</button>
    <button class="ghost-btn" title="Configurações, backup e chaves" onclick="openAppOptionsModal()">⚙️</button>
    <span class="desktop-app-version" title="Versão do Letther B">v2026.08.23.137</span>
  </nav>`;
}
function renderDesktopDeckExplorer(){
  const show=state.view==='deck'||state.view==='study';
  if(!show) return '';
  return `<aside class="desktop-deck-explorer">
    <div style="display:flex; justify-content:space-between; align-items:center;"><strong style="font-size:13px;">Baralhos</strong><span style="font-size:11px; color:var(--text-faint);">${state.decks.length}</span></div>
    <div class="desktop-deck-actions"><button class="icon-btn" title="Novo baralho" onclick="openNewDeckModal()">＋</button><button class="icon-btn" title="Tirar foto" onclick="openPhotoImportPicker(true)">📷</button><button class="icon-btn" title="Carregar imagem" onclick="openPhotoImportPicker(false)">🖼️</button></div>
    ${getOrderedDecks().map(d=>{ const due=getDueCards(d.id).length; const active=state.currentDeckId===d.id&&state.view==='deck'; return `<div class="deck-item ${active?'active':''}" onclick="selectDeck('${d.id}')"><span class="deck-dot" style="background:${d.color}"></span><span class="deck-item-name">${escapeHtml(d.name)}</span>${due?`<span class="due-badge">${due}</span>`:''}<button class="deck-favorite-toggle ${d.favorite?'active':''}" onclick="event.stopPropagation(); toggleDeckFavorite('${d.id}')">${d.favorite?'★':'☆'}</button></div>`; }).join('') || `<p style="font-size:12px; color:var(--text-faint);">Nenhum baralho.</p>`}
  </aside>`;
}

function renderSidebar(){
  return `
  <div class="sidebar-edge-trigger" aria-hidden="true"></div>
  <div class="sidebar">
    <div class="desktop-sidebar-content">
    <div class="brand">
      <div class="brand-mark"></div>
      <div>
        <h1>Letther B</h1>
        <span>LET IT BE</span>
        <span class="brand-version">v2026.08.23.137</span>
      </div>
    </div>
    <button class="ghost-btn sidebar-focus-toggle" title="No modo foco, encoste o mouse na borda esquerda para revelar o menu" onclick="toggleSidebarAutoHide()">${state.sidebarAutoHide?'⇤ Fixar menu':'⇥ Ocultar menu'}</button>
    <button class="ghost-btn" style="font-size:13px; padding:10px 12px; margin-bottom:6px; ${(state.view==='library'||state.view==='book') ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="openLibrary()">📚 Leituras</button>
    <button class="ghost-btn" style="font-size:13px; padding:10px 12px; margin-bottom:6px; ${state.view==='notes' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="openNotes()">📓 Notas</button>
    <button class="ghost-btn" style="font-size:13px; padding:10px 12px; margin-bottom:6px; ${state.view==='agenda' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="openAgenda()">🗓️ Agenda</button>
    <button class="new-deck-btn" onclick="openNewDeckModal()">＋ Novo baralho</button>
    <button class="ghost-btn" style="font-size:12.5px; padding:9px 12px;" onclick="openPhotoImportPicker(true)">📷 Tirar foto (cartões)</button>
    <button class="ghost-btn" style="font-size:12.5px; padding:9px 12px;" onclick="openPhotoImportPicker(false)">🖼️ Carregar imagem (cartões)</button>
    <div class="deck-list">
      ${state.decks.length === 0 ? `<div style="color:var(--text-faint); font-size:12.5px; padding:8px 4px;">Nenhum baralho ainda.</div>` : ''}
      ${getOrderedDecks().map(d => {
        const due = getDueCards(d.id).length;
        const active = state.currentDeckId === d.id && state.view !== 'home' && state.view !== 'library' && state.view !== 'book' && state.view !== 'notes';
        return `
        <div class="deck-item ${active?'active':''}" onclick="selectDeck('${d.id}')">
          <div class="deck-dot" style="background:${d.color}"></div>
          <div class="deck-item-name">${escapeHtml(d.name)}</div>
          ${due>0 ? `<div class="due-badge">${due}</div>` : ''}
          <button class="deck-favorite-toggle ${d.favorite?'active':''}" title="${d.favorite?'Remover dos favoritos':'Adicionar aos favoritos'}" onclick="event.stopPropagation(); toggleDeckFavorite('${d.id}')">${d.favorite?'★':'☆'}</button>
        </div>`;
      }).join('')}
    </div>
    <div class="sidebar-foot">
      ${state.saveFailed ? `<div style="color:var(--error); margin-bottom:6px;">⚠ Não consegui salvar as últimas mudanças. Exporte um backup pra não perder nada.</div>` : ''}
      ${hasFirebaseUser() ? `<div style="margin-bottom:4px;">👤 ${escapeHtml(state.firebaseUser.email||'')} · <a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); signOutUser();">Sair</a></div>` : ''}
      ${state.decks.length} baralho(s) · dados salvos automaticamente<br>
      <a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); exportAllBackup();">Exportar backup completo</a>
      &nbsp;·&nbsp;
      <a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); triggerImportBackup();">Importar backup</a>
      ${(!hasClaudeStorage() && hasFileSystemAccess()) ? `
      <br><a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); saveToFileSystem();">${state.fileHandle ? '💾 Sincronizando com arquivo local ✓' : '💾 Salvar em arquivo local'}</a>
      &nbsp;·&nbsp;
      <a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); openFromFileSystem();">📂 Abrir arquivo local</a>
      ${state.pendingFileHandle ? `<br><a href="#" style="color:var(--accent); text-decoration:underline;" onclick="event.preventDefault(); reconnectFileHandle();">🔌 Reconectar ao arquivo local usado antes</a>` : ''}
      ` : ''}
      <br><a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); openApiKeyModal();">${getApiKey() ? 'Chave de API do Gemini configurada ✓' : '⚠ Configurar chave de API do Gemini'}</a>
      <br><a href="#" style="color:var(--text-muted); text-decoration:underline;" onclick="event.preventDefault(); toggleTheme();">${getTheme()==='light' ? '🌙 Usar tema escuro' : '☀️ Usar tema claro'}</a>
    </div>
    </div>
    ${renderMobileSidebar()}
  </div>`;
}
function getOrderedDecks(){
  return [...state.decks].sort((a,b)=>(Number(!!b.favorite)-Number(!!a.favorite)) || a.name.localeCompare(b.name,'pt-BR'));
}
function markMainMenuTransition(){ state.pageTransition=true; }
function selectMobileHomeSection(section){
  markMainMenuTransition();
  if(section==='decks'){ state.mobileHomeSection='decks'; state.view='deck-list'; render(); return; }
  state.mobileHomeSection=section;
  if(section==='library') openLibrary();
  else if(section==='notes') openNotes();
  else if(section==='agenda') openAgenda();
  else if(section==='routine') openRoutine();
}
function renderMobileSidebar(){
  const section=null;
  const nav=(key,label,icon)=>`<button class="ghost-btn mobile-nav-button ${section===key?'active':''}" onclick="selectMobileHomeSection('${key}')"><span style="font-size:20px;">${icon}</span>${label}</button>`;
  return `<div class="mobile-sidebar-content">
    <div class="brand"><div class="brand-mark"></div><div><h1>Letther B</h1><span>LET IT BE</span><span class="brand-version">v2026.08.23.137</span></div></div>
    <div class="mobile-home-nav">
      ${nav('decks','Baralhos','🗂️')}
      ${nav('library','Leituras','📚')}
      ${nav('notes','Notas','📓')}
      ${nav('agenda','Agenda','🗓️')}
      ${nav('routine','Rotina','🌿')}
      <button class="ghost-btn mobile-nav-button" onclick="openAppOptionsModal()"><span style="font-size:20px;">⚙️</span>Opções</button>
      <div style="display:flex; gap:7px;"><button class="ghost-btn mobile-nav-button" style="flex:1; margin:0;" onclick="openGlobalAiChat()"><span style="font-size:20px;">💬</span>Chat IA</button><button class="ghost-btn" style="width:58px; padding:0; font-size:21px;" title="Tirar foto para criar cartões" onclick="openPhotoImportPicker(true)">📷</button></div>
    </div>
  </div>`;
}
function toggleSidebarAutoHide(){
  if(window.matchMedia('(max-width:820px)').matches) return;
  state.sidebarAutoHide=!state.sidebarAutoHide;
  saveData();
  render();
}

function selectDeck(id){
  state.currentDeckId = id; state.lastDeckId = id; state.view = 'deck'; state.tab = 'cards'; state.editingCardId = null;
  state.cardSearch = ''; state.cardFilterFlagged = false; state.cardFilterLearned = false; state.cardFilterPriority = false;
  state.cardFormMode = 'text'; state.imageEditorUrl = ''; state.newPinPos = null;
  saveData(); render();
}
function backToHome(){
  finishReadingActivity();
  finishWritingActivity();
  markMainMenuTransition();
  state.mobileHomeSection=null;
  state.view = 'home';
  render();
}

function renderMain(){
  if(state.view === 'deck-list') return renderMobileDeckListView();
  if(state.view === 'library') return renderLibraryView();
  if(state.view === 'book') return renderBookDetailView();
  if(state.view === 'epub-reader') return renderEpubReaderView();
  if(state.view === 'notes') return renderNotesView();
  if(state.view === 'agenda') return renderAgendaView();
  if(state.view === 'routine') return renderRoutineView();
  if(state.view === 'home' || !state.currentDeckId){
    return `
    <div class="empty-state">
      <div class="brand-mark" style="width:92px; height:92px; border-radius:25px;"></div>
      <h2 class="app-home-title">Letther B</h2>
      <p>Let it be. Crie um baralho, adicione perguntas e respostas e estude no seu ritmo. Seu progresso fica salvo automaticamente.</p>
      ${(state.stats && state.stats.totalPoints > 0) ? `<div style="margin-top:18px; font-size:14px; color:var(--success); font-weight:600;">🏆 ${state.stats.totalPoints} pontos acumulados no total</div>` : ''}
    </div>`;
  }
  if(state.view === 'deck') return renderDeckView();
  if(state.view === 'study') return renderStudyView();
  if(state.view === 'results') return renderResultsView();
  return '';
}
function renderMobileDeckListView(){
  return `<div class="mobile-deck-selection">
    <button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Menu</button>
    <div style="display:flex; justify-content:space-between; align-items:center;"><div><h2 style="margin:0; font-size:24px;">Baralhos</h2><p style="margin:3px 0 0; font-size:12px; color:var(--text-faint);">Seus favoritos aparecem primeiro.</p></div><span style="font-size:12px; color:var(--text-faint);">${state.decks.length}</span></div>
    <div class="mobile-deck-actions"><button class="icon-btn" title="Novo baralho" onclick="openNewDeckModal()">＋</button><button class="icon-btn" title="Tirar foto para criar cartões" onclick="openPhotoImportPicker(true)">📷</button><button class="icon-btn" title="Carregar imagem para criar cartões" onclick="openPhotoImportPicker(false)">🖼️</button></div>
    <div class="mobile-deck-list">${getOrderedDecks().length ? getOrderedDecks().map(d=>{ const due=getDueCards(d.id).length; return `<div class="mobile-deck-card" onclick="selectDeck('${d.id}')"><span class="deck-dot" style="background:${d.color}"></span><span class="deck-item-name">${escapeHtml(d.name)}</span>${due?`<span class="due-badge">${due}</span>`:''}<button class="mobile-deck-star ${d.favorite?'active':''}" title="Favoritar" onclick="event.stopPropagation(); toggleDeckFavorite('${d.id}')">${d.favorite?'★':'☆'}</button></div>`; }).join('') : `<p style="font-size:12px; color:var(--text-faint); text-align:center;">Crie seu primeiro baralho.</p>`}</div>
  </div>`;
}

function getReadingStats(){
  const now = new Date();
  const curMonth = now.getMonth(), curYear = now.getFullYear();
  let month = 0, year = 0;
  state.books.forEach(b => {
    if(b.status === 'lido' && b.dateFinished){
      const d = new Date(b.dateFinished+'T00:00:00');
      if(d.getFullYear() === curYear){
        year++;
        if(d.getMonth() === curMonth) month++;
      }
    }
  });
  return { month, year };
}
function renderNotesView(){
  const currentNote = state.notesItems.find(n=>n.id===state.currentNoteId && n.type!=='folder');
  const hasRootItems = state.notesItems.some(n=>n.parentId===null);
  const searchQuery = (state.notesSearch && state.notesSearch.query) || '';
  return `
  <div class="notes-desktop-shell">
  ${!currentNote ? `<button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Início</button>` : ''}
  <div class="notes-layout ${currentNote ? 'note-open' : ''}">
    <div class="notes-explorer">
      <div class="notes-explorer-header">
        <h3 style="margin:0; font-size:15px;">📓 Notas</h3>
        <div style="display:flex; gap:4px;">
          <button class="icon-btn" title="Nova nota" onclick="openNotesCreateModal(null,'note')">📄</button>
          <button class="icon-btn" title="Nova escaleta" onclick="openNotesCreateModal(null,'outline')">🧩</button><button class="icon-btn" title="Nova pasta" onclick="openNotesCreateModal(null,'folder')">📁</button>${isDesktopLayout()?`<button class="icon-btn" title="${state.notesChatHidden?'Mostrar':'Ocultar'} Chat IA" onclick="toggleNotesChatPanel()">${state.notesChatHidden?'💬':'◧'}</button>`:''}
        </div>
      </div>
      <div class="notes-search-bar">
        <input type="text" id="notes-search-input" placeholder="🔎 Buscar nota ou trecho..." value="${escapeHtml(searchQuery)}" oninput="updateNotesSearchQuery(this.value)" onkeydown="if(event.key==='Enter'){ event.preventDefault(); searchAllNotesContent(); }">
        ${searchQuery ? `<button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Limpar busca" onclick="clearNotesSearch()">✕</button>` : ''}
      </div>
      ${renderFavoriteNotes()}
      <div class="notes-tree" ondragover="event.preventDefault();" ondrop="onNoteDropOnRoot(event)">
        ${!hasRootItems ? `<p style="color:var(--text-faint); font-size:12px; padding:8px 4px;">Nenhuma nota ainda. Crie a primeira com os botões acima.</p>` : ''}
        ${renderNotesTreeLevel(null, 0)}
      </div>
      <div class="notes-search-extras">${renderNotesSearchExtras()}</div>
    </div>
    <div class="notes-resizer" onmousedown="startNotesExplorerResize(event)"></div>
    <div class="notes-editor">
      ${currentNote ? (currentNote.type==='outline' ? renderOutlineEditor(currentNote) : renderNoteEditor(currentNote)) : `
      <div class="empty-state" style="height:60vh;">
        <div style="font-size:40px;">📓</div>
        <h2>Seu caderno de notas</h2>
        <p>Crie uma nota na lista ao lado, ou clique numa já existente pra editar. Use [[Nome da nota]] pra linkar de uma nota pra outra.</p>
      </div>
      `}
    </div>
  </div>
  ${isDesktopLayout() && !state.notesChatHidden && state.activeOutlinePanelOpen ? `<div class="notes-chat-resizer" onmousedown="startNotesChatResize(event)" title="Arraste para ajustar a largura do painel"></div><aside class="desktop-note-chat" style="width:${state.notesChatWidth||340}px;">${renderActiveOutlinePanel()}</aside>` : (isDesktopLayout() && !state.notesChatHidden && state.modal && state.modal.type==='note-chat' ? `<div class="notes-chat-resizer" onmousedown="startNotesChatResize(event)" title="Arraste para ajustar a largura do chat"></div>${renderNoteChatModal(state.modal, true)}` : '')}
  </div>
  `;
}
function renderFavoriteNotes(){
  const favorites = state.notesItems.filter(n=>n.type==='note' && n.favorite).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(!favorites.length) return '';
  return `<div class="notes-favorites"><div style="font-size:11px; color:var(--text-faint); font-weight:700; margin-bottom:5px;">★ FAVORITOS</div>${favorites.map(note=>`<div class="favorite-note-row"><button class="ghost-btn favorite-note-open" title="Abrir e editar nota" onclick="openNote('${note.id}')"><span class="note-color-dot" style="display:inline-block; background:${escapeHtml(note.iconColor||'#F5A623')};"></span> ${escapeHtml(note.name)}</button><button class="icon-btn" title="Renomear" onclick="openNotesRenameModal('${note.id}')">✏️</button><button class="icon-btn" title="Duplicar nota" onclick="duplicateNoteItem('${note.id}')">⧉</button><button class="icon-btn" title="Remover dos favoritos" onclick="toggleNoteFavorite('${note.id}')">★</button><button class="icon-btn" title="Excluir nota" onclick="deleteNoteItem('${note.id}')">🗑</button></div>`).join('')}</div>`;
}
function renderNotesSearchExtras(){
  const s = state.notesSearch;
  if(!s || !s.query) return '';
  let html = `<button class="ghost-btn" style="width:100%; font-size:12px; padding:6px; margin-top:6px;" onclick="searchAllNotesContent()" ${s.searching?'disabled':''}>${s.searching ? '🔎 Buscando no conteúdo...' : '🔎 Buscar também no conteúdo de todas as notas'}</button>`;
  if(s.contentResults) html += renderNotesContentSearchResults();
  return html;
}
function renderNotesContentSearchResults(){
  const results = state.notesSearch.contentResults;
  if(!results.length) return `<p style="color:var(--text-faint); font-size:12px; padding:8px 4px;">Nada encontrado no conteúdo das notas.</p>`;
  return `
  <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
    ${results.map(r => `
    <div class="notes-search-result" onclick="openNoteSearchResult('${r.noteId}')">
      <div style="font-size:12.5px; font-weight:600;">📄 ${escapeHtml(r.noteName)} <span style="font-weight:400; color:var(--text-faint);">(${r.matchCount})</span></div>
      <div style="font-size:11.5px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.snippet)}</div>
    </div>
    `).join('')}
  </div>`;
}
function renderFloatingNotes(){
  // exclusivo do desktop -- no celular a tela é pequena demais pra janelas
  // sobrepostas fazerem sentido, e o gesto de arrastar/redimensionar
  // colidiria com rolagem por toque.
  if(!isDesktopLayout() || !state.floatingNotes.length) return '';
  return `<div class="floating-notes-layer">${state.floatingNotes.map(renderFloatingNote).join('')}</div>`;
}
function renderFloatingNote(f){
  const note = state.notesItems.find(n=>n.id===f.noteId && n.type==='note');
  if(!note) return ''; // a nota foi excluída em outro lugar -- some sozinha; state.floatingNotes se limpa no próximo load
  const color = note.iconColor || '#F5A623';
  const loading = noteContentLoading[note.id] || noteContentCache[note.id] === undefined;
  const error = noteContentError[note.id];
  let body;
  if(error){
    body = `<div class="floating-note-body" style="display:flex; align-items:center; justify-content:center; text-align:center; gap:8px; flex-direction:column;"><span style="font-size:11px; color:var(--error);">Não consegui carregar.</span><button class="ghost-btn" style="font-size:10px; padding:4px 8px;" onclick="delete noteContentError['${note.id}']; ensureFloatingNoteContentLoaded('${note.id}'); render();">Tentar de novo</button></div>`;
  } else if(loading){
    body = `<div class="floating-note-body" style="display:flex; align-items:center; justify-content:center;"><div class="spinner"></div></div>`;
  } else {
    const content = noteContentCache[note.id];
    // foco puro no texto: sem barra de ferramentas de formatação, mas
    // mantém o mesmo TIPO de editor da nota (rich contenteditable pra
    // format==='plain', textarea pra markdown) pra não mostrar tags HTML
    // cruas nem perder a formatação já existente.
    body = note.format === 'plain'
      ? `<div class="floating-note-body" contenteditable="true" oninput="onNoteContentInput('${note.id}', this.innerHTML)">${content}</div>`
      : `<textarea class="floating-note-body" oninput="onNoteContentInput('${note.id}', this.value)">${escapeHtml(content)}</textarea>`;
  }
  return `<div class="floating-note" id="floating-note-${note.id}" style="left:${f.x}px; top:${f.y}px; width:${f.width}px; height:${f.height}px; opacity:${f.opacity}; z-index:${f.z||10}; border-color:${color};">
    <div class="floating-note-header" onpointerdown="startFloatingNoteDrag(event,'${note.id}')">
      <button class="icon-btn" title="Fechar (salva automaticamente)" onclick="closeFloatingNote('${note.id}')">✕</button>
      <button class="icon-btn" title="Localizar no gerenciador" onclick="locateFloatingNoteInManager('${note.id}')">🔍</button>
      <button class="icon-btn ${note.favorite?'active':''}" title="${note.favorite?'Remover dos favoritos':'Favoritar'}" onclick="toggleNoteFavorite('${note.id}')">${note.favorite?'★':'☆'}</button>
      <span style="position:relative;">
        <button class="icon-btn" title="Mudar o ícone (cor) da nota" onclick="toggleFloatingNoteColorMenu('${note.id}')" style="color:${color};">●</button>
        ${state.floatingColorMenuFor===note.id ? renderFloatingNoteColorMenu(note.id) : ''}
      </span>
      <input type="range" class="floating-note-opacity" min="20" max="100" value="${Math.round(f.opacity*100)}" title="Opacidade" onpointerdown="event.stopPropagation()" oninput="previewFloatingNoteOpacity('${note.id}', this.value)" onchange="commitFloatingNoteOpacity('${note.id}', this.value)">
    </div>
    <div class="floating-note-title" onpointerdown="startFloatingNoteDrag(event,'${note.id}')" title="${escapeHtml(note.name)}">${escapeHtml(note.name)}</div>
    ${body}
    <div class="floating-note-resize floating-note-resize-n" onpointerdown="startFloatingNoteResize(event,'${note.id}','n')"></div>
    <div class="floating-note-resize floating-note-resize-s" onpointerdown="startFloatingNoteResize(event,'${note.id}','s')"></div>
    <div class="floating-note-resize floating-note-resize-e" onpointerdown="startFloatingNoteResize(event,'${note.id}','e')"></div>
    <div class="floating-note-resize floating-note-resize-w" onpointerdown="startFloatingNoteResize(event,'${note.id}','w')"></div>
    <div class="floating-note-resize floating-note-resize-ne" onpointerdown="startFloatingNoteResize(event,'${note.id}','ne')"></div>
    <div class="floating-note-resize floating-note-resize-nw" onpointerdown="startFloatingNoteResize(event,'${note.id}','nw')"></div>
    <div class="floating-note-resize floating-note-resize-se" onpointerdown="startFloatingNoteResize(event,'${note.id}','se')"></div>
    <div class="floating-note-resize floating-note-resize-sw" onpointerdown="startFloatingNoteResize(event,'${note.id}','sw')"></div>
  </div>`;
}
function renderFloatingNoteColorMenu(noteId){
  const colors = ['#F5A623','#FB7185','#A78BFA','#60A5FA','#34D399','#F472B6','#FACC15','#94A3B8'];
  return `<div class="floating-note-color-menu" onpointerdown="event.stopPropagation()">
    ${colors.map(c=>`<button type="button" title="${c}" onclick="pickFloatingNoteColor('${noteId}','${c}')" style="background:${c};"></button>`).join('')}
  </div>`;
}
function renderNotesTreeLevel(parentId, depth){
  const searchQuery = ((state.notesSearch && state.notesSearch.query) || '').trim();
  let items = state.notesItems.filter(n=>n.parentId===parentId).sort((a,b) => {
    if(a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
  if(searchQuery) items = items.filter(item => noteSubtreeMatchesSearch(item.id, searchQuery));
  return items.map(item => {
    if(item.type === 'folder'){
      const collapsed = !searchQuery && (state.notesCollapsedFolders||[]).includes(item.id);
      return `
      <div class="notes-tree-row" style="padding-left:${depth*16}px;" draggable="true" ondragstart="onNoteDragStart(event,'${item.id}')" ondragover="onNoteDragOverFolder(event,'${item.id}')" ondragleave="onNoteDragLeaveFolder(event)" ondrop="onNoteDropOnFolder(event,'${item.id}')">
        <div class="notes-tree-label" onclick="toggleNotesFolder('${item.id}')">
          <span>${escapeHtml(collapsed ? (item.icon || '📁') : ((item.icon || '📁')==='📁' ? '📂' : item.icon))}</span> <span>${escapeHtml(item.name)}</span>
        </div>
        <div class="notes-tree-actions">
          <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Novo item aqui dentro" onclick="event.stopPropagation(); openNotesCreateModal('${item.id}','note')">➕</button>
          <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Renomear" onclick="event.stopPropagation(); openNotesRenameModal('${item.id}')">✏️</button>
          <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Excluir" onclick="event.stopPropagation(); deleteNoteItem('${item.id}')">🗑</button>
        </div>
      </div>
      ${!collapsed ? renderNotesTreeLevel(item.id, depth+1) : ''}
      `;
    }
    if(item.type === 'outline') return `
    <div class="notes-tree-row ${state.currentNoteId===item.id?'active':''}" style="padding-left:${depth*16+16}px;" draggable="true" ondragstart="onNoteDragStart(event,'${item.id}')">
      <div class="notes-tree-label" onclick="openNote('${item.id}')"><span>🧩</span> ${escapeHtml(item.name)}</div>
      <div class="notes-tree-actions">
        <button class="icon-btn ${state.activeOutlineId===item.id?'active':''}" style="width:22px;height:22px;font-size:11px;" title="${state.activeOutlineId===item.id?'Desativar escaleta ativa':'Ativar como escaleta ativa'}" onclick="event.stopPropagation(); toggleActiveOutline('${item.id}')">🎯</button>
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Renomear" onclick="event.stopPropagation(); openNotesRenameModal('${item.id}')">✏️</button>
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Excluir" onclick="event.stopPropagation(); deleteNoteItem('${item.id}')">🗑</button>
      </div>
    </div>`;
    return `
    <div class="notes-tree-row ${state.currentNoteId===item.id?'active':''} ${state.notesHighlightId===item.id?'notes-tree-row-flash':''}" data-note-id="${item.id}" style="padding-left:${depth*16+16}px;" draggable="true" ondragstart="onNoteDragStart(event,'${item.id}')">
      <div class="notes-tree-label" onclick="openNote('${item.id}')"><span class="note-color-dot" style="background:${escapeHtml(item.iconColor || '#F5A623')};"></span>${escapeHtml(item.name)}</div>
      <div class="notes-tree-actions">
        <button class="icon-btn" style="width:22px;height:22px;font-size:12px; ${item.favorite?'color:#F5A623;':''}" title="${item.favorite?'Remover dos favoritos':'Adicionar aos favoritos'}" onclick="event.stopPropagation(); toggleNoteFavorite('${item.id}')">${item.favorite?'★':'☆'}</button>
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Renomear" onclick="event.stopPropagation(); openNotesRenameModal('${item.id}')">✏️</button>
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Duplicar" onclick="event.stopPropagation(); duplicateNoteItem('${item.id}')">⧉</button>
        <button class="icon-btn" style="width:22px;height:22px;font-size:11px;" title="Excluir" onclick="event.stopPropagation(); deleteNoteItem('${item.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}
function renderNoteFindBar(fr){
  return `
  <div class="notes-find-bar">
    <input type="text" id="note-find-input" placeholder="Buscar na nota..." autofocus value="${escapeHtml(fr.query)}" oninput="updateNoteFindQuery(this.value)" onkeydown="if(event.key==='Enter'){ event.preventDefault(); if(event.shiftKey) prevNoteFindMatch(); else nextNoteFindMatch(); } if(event.key==='Escape'){ closeNoteFind(); }">
    <span class="notes-find-count">${fr.matches.length ? `${fr.currentIndex+1}/${fr.matches.length}` : (fr.query ? '0/0' : '')}</span>
    <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Anterior" onclick="prevNoteFindMatch()">↑</button>
    <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Próximo" onclick="nextNoteFindMatch()">↓</button>
    <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="${fr.showReplace?'Esconder substituir':'Substituir'}" onclick="toggleNoteFindReplace()">⇄</button>
    <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Fechar" onclick="closeNoteFind()">✕</button>
  </div>
  ${fr.showReplace ? `
  <div class="notes-find-bar">
    <input type="text" id="note-replace-input" placeholder="Substituir por..." value="${escapeHtml(fr.replaceQuery)}" oninput="state.noteFindReplace.replaceQuery=this.value">
    <button class="ghost-btn" style="font-size:12px; padding:6px 10px;" onclick="replaceCurrentNoteMatch()">Substituir</button>
    <button class="ghost-btn" style="font-size:12px; padding:6px 10px;" onclick="replaceAllNoteMatches()">Substituir tudo</button>
  </div>
  ` : ''}
  `;
}
function renderNoteCommentsPanel(note){
  const p = state.noteCommentsPanel;
  if(!p) return '';
  const comments = getNoteComments(note);
  const c = comments[p.index];
  if(!c) return '';
  return `
  <div class="notes-comments-panel">
    <div class="notes-comments-panel-nav">
      <span style="font-size:12px; color:var(--text-faint);">📝 Comentário ${p.index+1} de ${comments.length}</span>
      <div style="display:flex; gap:6px;">
        <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Anterior" onclick="prevNoteComment()">‹</button>
        <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Próximo" onclick="nextNoteComment()">›</button>
        <button class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Fechar" onclick="closeNoteCommentsPanel()">✕</button>
      </div>
    </div>
    <div class="notes-comments-panel-versions">
      <div style="${c.showing==='original'?'border-color:var(--success); font-weight:600;':'opacity:0.6;'}">ANTIGA: ${escapeHtml(c.original)}</div>
      <div style="${c.showing==='proposed'?'border-color:var(--success); font-weight:600;':'opacity:0.6;'}">NOVA: ${escapeHtml(c.proposed)}</div>
    </div>
    <p style="font-size:11.5px; color:var(--text-faint); margin:0;">Mostrando agora na nota: <strong>${c.showing==='proposed'?'a versão nova':'a versão antiga'}</strong>.</p>
    <div class="notes-comments-panel-actions">
      <button class="ghost-btn" style="font-size:12px; padding:6px 10px;" onclick="toggleActiveNoteComment()">🔁 Alternar versão</button>
      <button class="ghost-btn" style="font-size:12px; padding:6px 10px;" onclick="resolveActiveNoteComment(false)">🗑️ Descartar (mantém a antiga)</button>
      <button class="primary-btn" style="font-size:12px; padding:6px 10px;" onclick="resolveActiveNoteComment(${c.showing==='proposed'?'true':'false'})">✅ Finalizar mudança (mantém a ${c.showing==='proposed'?'nova':'antiga'})</button>
    </div>
  </div>
  `;
}
function renderNoteEditor(note){
  const backBtn = `<button class="ghost-btn mobile-back-btn" onclick="closeCurrentNote()">← Notas</button>`;
  if(noteContentError[note.id]){
    return `
    ${backBtn}
    <div class="loading-line" style="flex-direction:column; gap:14px; justify-content:center; padding:60px;">
      <p style="color:var(--error); margin:0;">Não consegui carregar essa nota.</p>
      <button class="ghost-btn" onclick="retryLoadNoteContent('${note.id}')">Tentar de novo</button>
    </div>`;
  }
  if(noteContentLoading[note.id] || noteContentCache[note.id] === undefined){
    return `${backBtn}<div class="loading-line" style="justify-content:center; padding:60px;"><div class="spinner"></div> Carregando nota...</div>`;
  }
  const content = getNoteContent(note.id);
  const isPlain = note.format === 'plain';
  const page = getNotePageSettings(note);
  const px = page.unit === 'cm' ? 37.795 : 1;
  const pageStyle = `--page-w:${page.width*px}px; --page-h:${page.height*px}px; --page-margin:${page.margin*px}px;`;
  const mode = isPlain ? null : (state.notesEditorMode || 'split');
  const pendingComments = getNoteComments(note);
  const pagedPreview = isPlain && state.notesPageView ? renderPagedNotePreview(note,content) : '';
  const actualPageCount = isPlain && state.notesPageView ? lastRenderedNotePageCount : null;
  return `
  ${backBtn}
  <div class="notes-editor-header">
    <div>
      <h3 style="margin:0;">${escapeHtml(note.name)}</h3>
      <div id="note-writing-stats" class="note-writing-stats" title="${actualPageCount?'Contagem real da visualização em páginas':'Estimativa baseada no tamanho e nas margens configurados para esta nota'}">${getNoteWritingStats(content, note, actualPageCount)}</div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <button class="icon-btn" style="${note.favorite?'color:#F5A623;':''}" title="${note.favorite?'Remover dos favoritos':'Adicionar aos favoritos'}" onclick="toggleNoteFavorite('${note.id}')">${note.favorite?'★':'☆'}</button>
      ${isDesktopLayout() ? `<button class="icon-btn ${state.floatingNotes.some(f=>f.noteId===note.id)?'active':''}" title="Transformar em nota flutuante (post-it) — atalho: Ctrl+Shift+P" onclick="toggleFloatingNote('${note.id}')">📌</button>` : ''}
      <button class="icon-btn ${state.activeOutlinePanelOpen?'active':''}" style="${state.activeOutlineId?'':'opacity:.45;'}" title="${state.activeOutlineId?`Ver escaleta ativa: ${escapeHtml(state.notesItems.find(n=>n.id===state.activeOutlineId)?.name||'')}`:'Nenhuma escaleta ativa — ative uma pela árvore de notas'}" onclick="toggleActiveOutlineView()">🎬</button>
      <button class="icon-btn" title="Exportar esta nota como arquivo HTML" onclick="exportNoteAsHtml('${note.id}')">⇩</button>
      <button class="icon-btn" title="Sumário (títulos H1/H2/H3)" onclick="openNoteTocModal()">📑</button>
      <button class="icon-btn" title="Configuração de página" onclick="openNotePageSettings()">⚙️</button>
      ${pendingComments.length ? `<button class="icon-btn" style="width:auto; padding:0 10px; font-size:12px; color:var(--success);" title="Revisar comentários pendentes" onclick="openNoteCommentsPanel()">📝 ${pendingComments.length}</button>` : ''}
      <button class="icon-btn" title="Buscar e substituir nesta nota" onclick="openNoteFind()">🔍</button>
      <button class="icon-btn" title="Conversar com a IA sobre esta nota" onclick="openNoteChat()">💬</button>
      ${isPlain ? `<button class="icon-btn" title="${state.notesPageView?'Usar visualização contínua':'Visualização de página'}" onclick="toggleNotePageView()">${state.notesPageView?'↕️':'📄'}</button>` : ''}
      ${!isPlain ? `
      <div class="notes-mode-toggle">
        <button class="ghost-btn ${mode==='source'?'active-mode':''}" onclick="setNotesEditorMode('source')">Editar</button>
        <button class="ghost-btn ${mode==='split'?'active-mode':''}" onclick="setNotesEditorMode('split')">Dividido</button>
        <button class="ghost-btn ${mode==='preview'?'active-mode':''}" onclick="setNotesEditorMode('preview')">Prévia</button>
      </div>
      ` : ''}
    </div>
  </div>
  ${renderNoteCommentsPanel(note)}
  ${state.noteFindReplace && state.noteFindReplace.active ? renderNoteFindBar(state.noteFindReplace) : ''}
  ${isDesktopLayout() ? `<div class="notes-nav-history">
    <button class="icon-btn" title="Nota anterior" ${hasNoteHistoryBack()?'':'disabled'} onclick="navigateNoteHistoryBack()">←</button>
    <button class="icon-btn" title="Próxima nota" ${hasNoteHistoryForward()?'':'disabled'} onclick="navigateNoteHistoryForward()">→</button>
  </div>` : ''}
  ${(isPlain || mode !== 'preview') ? renderNotesToolbar(note.format) : ''}
  ${isPlain ? `
  <div class="notes-editor-panes plain ${state.notesPageView ? 'page-view' : ''}" style="${state.notesPageView ? pageStyle : ''}">
    ${state.notesPageView ? pagedPreview : `<div id="note-editor-plain" class="notes-plain-editor notes-preview" contenteditable="true" data-placeholder="Escreva à vontade, sem se preocupar com formatação..." oninput="handleRichEditorInput(this)" onkeydown="if(handleWikiAutocompleteKeydown(event)) return; if(maybeAutoFormatRichHeading(event,this)) return; if(event.key==='Tab'){ event.preventDefault(); insertRichIndent(); }">${content}</div>`}
  </div>
  ` : `
  <div class="notes-editor-panes ${mode}">
    ${mode !== 'preview' ? `<textarea id="note-editor-textarea" class="notes-textarea" placeholder="Escreva em markdown... use [[Nome da nota]] pra linkar outra nota." oninput="onNoteContentInput('${note.id}', this.value)" onkeydown="if(event.key==='Tab'){ event.preventDefault(); insertTabIndent('note-editor-textarea'); }">${escapeHtml(content)}</textarea>` : ''}
    ${mode !== 'source' ? `<div class="notes-preview">${renderNoteMarkdown(content)}</div>` : ''}
  </div>
  `}
  <div id="note-selection-bar" style="display:none; position:fixed; left:0; right:0; bottom:0; background:var(--surface); border-top:1px solid var(--border); padding:12px 20px; align-items:center; justify-content:center; gap:10px; box-shadow:0 -4px 16px rgba(0,0,0,0.2); z-index:50; flex-wrap:wrap;">
    <button class="ghost-btn" id="note-correct-btn" onmousedown="event.preventDefault()" title="Atalho: ${noteShortcutLabel('g')}" onclick="requestNoteCorrection()">✏️ Corrigir</button>
    <button class="ghost-btn" onmousedown="event.preventDefault()" title="Atalho: ${noteShortcutLabel('v')}" onclick="requestNoteOpinion()">💭 Opinião da IA</button>
    <button class="ghost-btn" id="note-comment-btn" onmousedown="event.preventDefault()" onclick="openNoteCommentModal()">📝 Comentário</button>
    <button class="primary-btn" onmousedown="event.preventDefault()" title="Atalho: ${noteShortcutLabel('f')}" onclick="requestCardFromNoteSelection()">📌 Criar cartão</button>
  </div>
  <div id="wiki-link-autocomplete" class="wiki-link-autocomplete" role="listbox" aria-label="Notas para vincular"></div>
  `;
}
function renderRichColorPalette(kind){
  const menu = state.noteColorMenu;
  if(!menu || menu.kind !== kind) return '';
  const colors = kind === 'text'
    ? ['#000000','#F4F1EA','#F5A623','#FB7185','#A78BFA','#60A5FA','#34D399']
    : ['#F5D76E','#F9A8D4','#A7F3D0','#BFDBFE','#DDD6FE','#FED7AA'];
  const noColor = kind === 'text' ? 'inherit' : 'transparent';
  return `<div style="position:absolute; top:38px; left:0; z-index:120; display:flex; gap:6px; flex-wrap:wrap; width:176px; padding:9px; background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 10px 24px rgba(0,0,0,.25);">
    ${colors.map(color=>`<button type="button" title="${color}" onmousedown="event.preventDefault()" onclick="applyRichPaletteColor('${kind}','${color}')" style="width:22px; height:22px; border-radius:50%; border:1px solid ${color==='#000000'?'rgba(255,255,255,0.35)':'var(--border)'}; background:${color};"></button>`).join('')}
    <button type="button" class="ghost-btn" onmousedown="event.preventDefault()" onclick="applyRichPaletteColor('${kind}','${noColor}')" style="width:100%; padding:5px 7px; font-size:10px;">Sem cor</button>
  </div>`;
}
function renderNotesToolbar(format){
  const id = 'note-editor-textarea';
  const isMarkdown = format !== 'plain';
  // onmousedown com preventDefault: sem isso, clicar no botão tira o foco/a
  // seleção do contenteditable ANTES do onclick rodar — dava a impressão de
  // negrito/itálico "grudado" (o comando aplicava na posição errada, ou numa
  // seleção já vazia) e inserções (link, imagem) iam sempre pro início do
  // texto em vez de onde o cursor estava. Não afeta o modo markdown (a
  // textarea guarda selectionStart/End independente do foco).
  const noSteal = isMarkdown ? '' : `onmousedown="event.preventDefault(); captureRichToolbarContext()" `;
  const bold = isMarkdown ? `applyMdWrap('${id}','**')` : `applyRichCommand('bold')`;
  const italic = isMarkdown ? `applyMdWrap('${id}','*')` : `applyRichCommand('italic')`;
  const list = isMarkdown ? `applyMdLinePrefix('${id}','- ')` : `applyRichCommand('insertUnorderedList')`;
  const olist = isMarkdown ? `applyMdLinePrefix('${id}','1. ')` : `applyRichCommand('insertOrderedList')`;
  const indent = isMarkdown ? `insertTabIndent('${id}')` : `insertRichIndent()`;
  const link = isMarkdown ? `applyMdLink('${id}')` : `openInsertRichLinkModal()`;
  const wikiLink = isMarkdown ? `insertWikiLink('${id}')` : `openInsertWikiLinkModalRich()`;
  return `
  <div class="notes-toolbar">
    <button class="icon-btn" onmousedown="event.preventDefault()" title="Desfazer (${noteShortcutLabel('z')})" onclick="undoNoteEdit()">↶</button>
    <button class="icon-btn" onmousedown="event.preventDefault()" title="Refazer (${isMacPlatform() ? '⌘⇧Z' : 'Ctrl+Shift+Z'})" onclick="redoNoteEdit()">↷</button>
    <span style="width:1px; background:var(--border); margin:2px 2px;"></span>
    <button class="icon-btn" style="width:auto; padding:0 8px; font-size:12px;" ${noSteal}title="Negrito" onclick="${bold}"><strong>B</strong></button>
    <button class="icon-btn" style="width:auto; padding:0 8px; font-size:12px;" ${noSteal}title="Itálico" onclick="${italic}"><em>I</em></button>
    ${!isMarkdown ? `<span style="display:inline-flex; position:relative;"><button class="icon-btn" ${noSteal}title="Aplicar última cor de texto" onclick="applyLastRichColor('text')" style="font-size:13px; border-bottom:3px solid ${state.lastRichTextColor||'#000000'};">A</button><button class="icon-btn" ${noSteal}title="Escolher cor do texto" onclick="openRichColorMenu('text')" style="width:20px; font-size:10px; margin-left:-4px;">▾</button>${renderRichColorPalette('text')}</span>
    <span style="display:inline-flex; position:relative;"><button class="icon-btn" ${noSteal}title="Aplicar último destaque" onclick="applyLastRichColor('highlight')" style="font-size:14px; border-bottom:3px solid ${state.lastRichHighlight||'#F5D76E'};">🖍</button><button class="icon-btn" ${noSteal}title="Escolher cor do destaque" onclick="openRichColorMenu('highlight')" style="width:20px; font-size:10px; margin-left:-4px;">▾</button>${renderRichColorPalette('highlight')}</span>
    <select title="Fonte" style="width:auto; max-width:150px; padding:5px 7px; font-size:11px;" onpointerdown="captureRichToolbarContext()" onchange="setRichFont(this.value)"><option value="inherit">Fonte</option><option value="Arial">Arial</option><option value="Arial Rounded">Arial Rounded</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Courier New">Monoespaçada</option><option value="Cinzel Decorative">Cinzel Decorative</option><option value="Great Vibes">Great Vibes</option><option value="Nickainley">Nickainley</option><option value="SangGuru">SangGuru</option><option value="Special Elite">Special Elite</option><option value="Zeyada">Zeyada</option></select>
    <select title="Tamanho da fonte" style="width:auto; max-width:84px; padding:5px 7px; font-size:11px;" onpointerdown="captureRichToolbarContext()" onchange="setRichFontSize(this.value)"><option value="">Tamanho</option><option value="10">10 px</option><option value="12">12 px</option><option value="14">14 px</option><option value="16">16 px</option><option value="18">18 px</option><option value="20">20 px</option><option value="24">24 px</option><option value="28">28 px</option><option value="32">32 px</option><option value="36">36 px</option></select>` : ''}
    ${!isMarkdown ? `<span style="display:inline-flex; position:relative;"><button class="icon-btn" style="width:auto; padding:0 8px; font-size:12px;" ${noSteal}title="Aplicar último título" onclick="setRichHeading('${state.lastRichHeading||'h1'}')">${String(state.lastRichHeading||'h1').toUpperCase()}</button><button class="icon-btn" style="width:20px; font-size:10px; margin-left:-4px;" ${noSteal}title="Escolher título" onclick="toggleRichHeadingMenu()">▾</button>${renderRichHeadingMenu()}</span>` : `<button class="icon-btn" style="width:auto; padding:0 8px; font-size:12px;" title="Título 1" onclick="applyMdLinePrefix('${id}','# ')">H1</button>`}
    <button class="icon-btn" style="width:auto; padding:0 8px; font-size:12px;" ${noSteal}title="Lista" onclick="${list}">•</button>
    <button class="icon-btn" style="width:auto; padding:0 8px; font-size:12px;" ${noSteal}title="Lista numerada" onclick="${olist}">1.</button>
    <button class="icon-btn" ${noSteal}title="Recuo de parágrafo (igual à tecla Tab)" onclick="${indent}">↹</button>
    ${!isMarkdown ? `<select title="Alinhamento do texto" style="width:auto; max-width:112px; padding:5px 7px; font-size:11px;" onpointerdown="captureRichToolbarContext()" onchange="setRichAlignment(this.value)"><option value="left" ${(state.lastRichAlignment||'left')==='left'?'selected':''}>← Esquerda</option><option value="center" ${(state.lastRichAlignment||'left')==='center'?'selected':''}>↔ Centro</option><option value="right" ${(state.lastRichAlignment||'left')==='right'?'selected':''}>Direita →</option><option value="justify" ${(state.lastRichAlignment||'left')==='justify'?'selected':''}>☰ Justificar</option></select>` : ''}
    ${!isMarkdown ? `<select title="Inserir na nota" style="width:auto; max-width:112px; padding:5px 7px; font-size:11px;" onpointerdown="captureNoteInsertContext()" onchange="openNoteInsertOption(this)"><option value="">＋ Inserir</option><option value="link">🔗 Link</option><option value="image-url">🖼️ Imagem por link</option><option value="image-upload">📤 Enviar imagem</option></select>` : `<button class="icon-btn" title="Link" onclick="${link}">🔗</button>`}
    <button class="icon-btn" ${noSteal}title="Link pra outra nota (${noteShortcutLabel('l')})" onclick="${wikiLink}">🔀</button>
  </div>`;
}
function renderLibraryView(){
  const q = (state.bookSearch||'').toLowerCase().trim();
  const filteredBooks = q ? state.books.filter(b => b.title.toLowerCase().includes(q)) : state.books;
  const quoteQ = (state.quoteSearch||'').toLowerCase().trim();
  let quoteResults = [];
  if(quoteQ){
    state.books.forEach(b => {
      (b.quotes||[]).forEach(quote => {
        if(quote.text.toLowerCase().includes(quoteQ)) quoteResults.push({ book:b, quote });
      });
    });
  }
  const stats = getReadingStats();
  return `
  <button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Início</button>
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:10px;">
    <h2 style="margin:0;">📚 Leituras</h2>
    <div style="display:flex; gap:8px;">
      <button class="ghost-btn" onclick="openEpubUploadForNewBook()">📖 Carregar EPUB</button>
      <button class="primary-btn" onclick="openAddBookModal()">＋ Adicionar livro</button>
    </div>
  </div>
  <div style="font-size:13px; color:var(--text-muted); margin-bottom:18px;">📖 ${stats.month} livro(s) lido(s) este mês · ${stats.year} este ano</div>
  <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:20px;">
    <div class="field" style="max-width:340px; flex:1;">
      <label>BUSCAR LIVRO POR NOME</label>
      <input type="text" value="${escapeHtml(state.bookSearch)}" placeholder="Ex: Dom Casmurro" oninput="state.bookSearch=this.value; render();">
    </div>
    <div class="field" style="max-width:340px; flex:1;">
      <label>BUSCAR CITAÇÃO EM TODOS OS LIVROS</label>
      <input type="text" value="${escapeHtml(state.quoteSearch)}" placeholder="Trecho da citação..." oninput="state.quoteSearch=this.value; render();">
    </div>
  </div>
  ${quoteQ ? `
  <div style="margin-bottom:26px;">
    <h3 style="font-size:13.5px; margin:0 0 10px 0; color:var(--text-muted);">${quoteResults.length} citação(ões) encontrada(s)</h3>
    ${quoteResults.length===0 ? `<div style="color:var(--text-faint); font-size:13px;">Nenhuma citação bate com essa busca.</div>` : quoteResults.map(r => `
      <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 16px; margin-bottom:8px; cursor:pointer;" onclick="openBook('${r.book.id}')">
        <div style="font-size:12px; color:var(--accent); font-weight:600; margin-bottom:4px;">${escapeHtml(r.book.title)}</div>
        <div style="font-size:13.5px; color:var(--text); line-height:1.5;">"${escapeHtml(r.quote.text.length>220 ? r.quote.text.slice(0,220)+'…' : r.quote.text)}"</div>
      </div>
    `).join('')}
  </div>` : ''}
  ${filteredBooks.length===0 ? `<div style="color:var(--text-faint); font-size:13px;">${state.books.length===0 ? 'Nenhum livro na estante ainda. Clique em "Adicionar livro" pra começar.' : 'Nenhum livro bate com essa busca.'}</div>` : `
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:18px;">
    ${filteredBooks.map(b => `
      <div style="cursor:pointer;" onclick="${b.epub ? `openEpubReader('${b.id}')` : `openBook('${b.id}')`}">
        <div class="book-cover-hover" style="width:100%; aspect-ratio:2/3; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:32px; position:relative;">
          ${b.coverUrl ? `<img src="${escapeHtml(b.coverUrl)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='📖';">` : '📖'}
          ${b.epub ? `<div style="position:absolute; top:6px; left:6px; background:var(--accent); color:var(--brand-text); font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:5px;">📖 EPUB</div>` : ''}
          <button class="icon-btn" style="position:absolute; top:4px; right:4px; width:24px; height:24px; font-size:12px; background:rgba(0,0,0,0.45); border:none; color:#fff;" title="Editar propriedades" onclick="event.stopPropagation(); openBook('${b.id}')">⚙️</button>
          ${b.epub ? `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.55); color:#fff; font-size:10px; font-weight:600; text-align:center; padding:3px 0;">${getEpubReadPercent(b)}% lido</div>` : ''}
        </div>
        <div style="font-size:12.5px; font-weight:600; margin-top:6px; line-height:1.3;">${escapeHtml(b.title)}</div>
        ${b.author ? `<div style="font-size:11px; color:var(--text-muted);">${escapeHtml(b.author)}</div>` : ''}
        ${b.rating>0 ? `<div style="font-size:11px; color:#F5D76E; margin-top:2px;">${'★'.repeat(b.rating)}${'☆'.repeat(5-b.rating)}</div>` : ''}
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
          <span style="font-size:10px; color:var(--text-muted); background:var(--bg-2); border-radius:6px; padding:2px 6px;">${BOOK_STATUS_LABELS[b.status]||BOOK_STATUS_LABELS['quero-ler']}</span>
          ${(b.categories||[]).map(c=>`<span style="font-size:10px; color:var(--text-muted); background:var(--bg-2); border-radius:6px; padding:2px 6px;">${escapeHtml(c)}</span>`).join('')}
        </div>
        ${b.totalPages>0 ? `<div style="font-size:10.5px; color:var(--text-faint); margin-top:4px;">${b.pagesRead||0}/${b.totalPages} págs</div>` : ''}
      </div>
    `).join('')}
  </div>`}
  `;
}
function renderBookDetailView(){
  const book = state.books.find(b=>b.id===state.currentBookId);
  if(!book) return '';
  const allCategories = Array.from(new Set(state.books.flatMap(b=>b.categories||[]).filter(Boolean)));
  const linkedDeck = book.linkedDeckId ? state.decks.find(d=>d.id===book.linkedDeckId) : null;
  const quotes = book.quotes || [];
  return `
  <button class="ghost-btn mobile-back-btn" onclick="backToLibrary()">← Leituras</button>
  <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:28px;">
    <div style="width:160px; flex-shrink:0;">
      <div style="width:100%; aspect-ratio:2/3; background:var(--bg-2); border:1px solid var(--border); border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:40px;">
        ${book.coverUrl ? `<img src="${escapeHtml(book.coverUrl)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='📖';">` : '📖'}
      </div>
      <div class="field" style="margin-top:10px;">
        <label style="font-size:10px;">URL DA CAPA</label>
        <input type="text" value="${escapeHtml(book.coverUrl)}" placeholder="Colar link da imagem" onkeyup="updateBookField('${book.id}','coverUrl',this.value)" onchange="render()">
      </div>
    </div>
    <div style="flex:1; min-width:240px; display:flex; flex-direction:column; gap:12px;">
      <div class="field">
        <label style="font-size:10px;">TÍTULO</label>
        <input type="text" style="font-size:18px; font-weight:700;" value="${escapeHtml(book.title)}" onkeyup="updateBookField('${book.id}','title',this.value)">
      </div>
      <div class="field">
        <label style="font-size:10px;">AUTOR</label>
        <input type="text" value="${escapeHtml(book.author)}" onkeyup="updateBookField('${book.id}','author',this.value)">
      </div>
      <div class="field">
        <label style="font-size:10px;">STATUS</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${Object.keys(BOOK_STATUS_LABELS).map(val => `
            <button type="button" class="ghost-btn" style="flex:1; min-width:110px; ${book.status===val ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="setBookStatus('${book.id}','${val}')">${BOOK_STATUS_LABELS[val]}</button>
          `).join('')}
        </div>
      </div>
      ${book.status==='lido' ? `
      <div class="field">
        <label style="font-size:10px;">DATA DE CONCLUSÃO</label>
        <input type="date" value="${book.dateFinished||''}" onchange="setBookDateFinished('${book.id}', this.value);">
      </div>
      <div class="field">
        <label style="font-size:10px;">RELEITURAS</label>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${(book.rereads||[]).map((date,i)=>`
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="date" value="${date||''}" style="flex:1;" onchange="setBookRereadDate('${book.id}',${i},this.value);">
            <button type="button" class="ghost-btn" style="padding:6px 9px; color:var(--error); border-color:var(--error);" title="Remover releitura" onclick="removeBookReread('${book.id}',${i})">✕</button>
          </div>`).join('') || `<p style="font-size:11.5px; color:var(--text-faint); margin:0;">Nenhuma releitura registrada ainda.</p>`}
          <button type="button" class="ghost-btn" style="align-self:flex-start;" onclick="addBookReread('${book.id}')">＋ Adicionar releitura</button>
        </div>
      </div>` : ''}
      <div style="display:flex; gap:14px; flex-wrap:wrap;">
        <div class="field" style="flex:1; min-width:120px;">
          <label style="font-size:10px;">TOTAL DE PÁGINAS</label>
          <input type="number" min="0" value="${book.totalPages||''}" onchange="setBookPages('${book.id}','totalPages',this.value); render();">
        </div>
        <div class="field" style="flex:1; min-width:120px;">
          <label style="font-size:10px;">PÁGINAS LIDAS</label>
          <input type="number" min="0" value="${book.pagesRead||''}" onchange="setBookPages('${book.id}','pagesRead',this.value); render();">
        </div>
      </div>
      <div class="field">
        <label style="font-size:10px;">CATEGORIAS (tags)</label>
        <div style="display:flex; flex-wrap:wrap; gap:6px; ${(book.categories||[]).length ? 'margin-bottom:8px;' : ''}">
          ${renderTagChips(book.categories, 'removeBookCategory', `'${book.id}', `)}
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="book-category-input-${book.id}" list="book-categories-list" placeholder="Ex: ficção, terror..." style="flex:1;" onkeydown="if(event.key==='Enter'){ event.preventDefault(); addBookCategory('${book.id}'); }">
          <button type="button" class="ghost-btn" onclick="addBookCategory('${book.id}')">+ Add</button>
        </div>
        <datalist id="book-categories-list">${allCategories.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label style="font-size:10px;">NOTA</label>
        <div style="display:flex; gap:4px; font-size:24px; line-height:1;">
          ${[1,2,3,4,5].map(n => `<span style="cursor:pointer; color:${n<=book.rating?'#F5D76E':'var(--text-faint)'};" onclick="setBookRating('${book.id}', ${n})">★</span>`).join('')}
        </div>
      </div>
      <div class="field">
        <label style="font-size:10px;">BARALHO VINCULADO</label>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select onchange="setBookLinkedDeck('${book.id}', this.value)" style="flex:1; min-width:160px;">
            <option value="">Nenhum</option>
            ${state.decks.map(d=>`<option value="${d.id}" ${book.linkedDeckId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}
            <option value="__new__">+ Criar novo baralho</option>
          </select>
          ${linkedDeck ? `<button class="ghost-btn" onclick="goToLinkedDeck('${linkedDeck.id}')">🔗 Ir pro baralho</button>` : ''}
        </div>
      </div>
      <div class="field">
        <label style="font-size:10px;">IDIOMA DO LIVRO</label>
        <div style="display:flex; gap:8px;">
          <button type="button" class="ghost-btn" style="flex:1; ${!book.isEnglish?'border-color:var(--accent); color:var(--accent);':''}" onclick="setBookIsEnglish('${book.id}', false)">Outro idioma</button>
          <button type="button" class="ghost-btn" style="flex:1; ${book.isEnglish?'border-color:var(--accent); color:var(--accent);':''}" onclick="setBookIsEnglish('${book.id}', true)">Inglês</button>
        </div>
        <p style="font-size:11px; color:var(--text-faint); margin:4px 0 0 0;">${book.isEnglish ? 'No leitor, as palavras do texto ficam clicáveis pra ver a tradução e criar um cartão.' : 'No leitor, selecionar um trecho oferece guardar como citação ou pedir um cartão à IA.'}</p>
      </div>
      <div class="field">
        <label style="font-size:10px;">ARQUIVO EPUB</label>
        ${book.epub ? `
        <div style="display:flex; align-items:center; gap:10px; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px; font-size:12.5px;">${escapeHtml(book.epub.fileName)} · ${book.epub.chapterCount} capítulo(s) · ${getEpubReadPercent(book)}% lido</div>
          <button class="ghost-btn" onclick="openEpubReader('${book.id}')">📖 Ler</button>
          <button class="ghost-btn" style="color:var(--error); border-color:var(--error);" onclick="deleteEpubFromBook('${book.id}')">🗑</button>
        </div>` : `
        <button type="button" class="ghost-btn" onclick="openEpubUploadPicker('${book.id}')" ${book.epubStatus==='uploading'?'disabled':''}>${book.epubStatus==='uploading' ? 'Carregando...' : '＋ Carregar EPUB'}</button>
        <p style="font-size:11px; color:var(--text-faint); margin:4px 0 0 0;">Arquivo .epub sem proteção DRM.</p>`}
      </div>
      <button class="ghost-btn" style="align-self:flex-start; color:var(--error); border-color:var(--error);" onclick="deleteBook('${book.id}')">🗑 Excluir livro</button>
    </div>
  </div>
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
    <h3 style="margin:0;">Citações (${quotes.length})</h3>
    <div style="display:flex; gap:8px;">
      <button class="ghost-btn" onclick="openQuoteCapturePicker('${book.id}', true)">📷 Tirar foto</button>
      <button class="ghost-btn" onclick="openQuoteCapturePicker('${book.id}', false)">🖼️ Carregar imagem</button>
    </div>
  </div>
  ${quotes.length===0 ? `<div style="color:var(--text-faint); font-size:13px;">Nenhuma citação guardada ainda.</div>` : `
  <div style="display:flex; flex-direction:column; gap:10px;">
    ${quotes.slice().reverse().map(quote => `
      <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; display:flex; gap:12px; align-items:flex-start;">
        <div style="flex:1; font-size:13.5px; line-height:1.6; white-space:pre-wrap;">"${escapeHtml(quote.text)}"</div>
        <button class="icon-btn" title="Excluir citação" onclick="deleteQuote('${book.id}','${quote.id}')">🗑</button>
      </div>
    `).join('')}
  </div>`}
  <button class="primary-btn" style="width:100%; margin-top:28px; padding:16px; font-size:15px; background:var(--success); color:#06210F;" onclick="backToLibrary()">✓ Concluir</button>
  `;
}

function renderDeckView(){
  const deck = state.decks.find(d=>d.id===state.currentDeckId);
  if(!deck) return '';
  const cards = state.cards[deck.id] || [];
  const due = getDueCards(deck.id).length;
  const stateCounts = getDeckStateCounts(deck.id);
  return `
  <button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Baralhos</button>
  <div class="deck-header">
    <div style="flex:1; min-width:0;">
      <div style="display:flex; align-items:center; gap:9px; flex-wrap:wrap;">
        <input type="text" class="deck-name-input" value="${escapeHtml(deck.name)}" title="Clique para renomear o baralho" onkeyup="updateDeckName('${deck.id}', this.value)" onchange="finalizeDeckName('${deck.id}', this.value)">
        ${deck.archived?'<span style="font-size:12px; font-weight:600; color:var(--text-faint);">📦 Arquivado</span>':''}
      </div>
      <p>${cards.length} cartão(ões) neste baralho${deck.archived?' · fora da agenda, disponível para estudo manual':''}</p>
    </div>
    <div style="display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end;">
      <button class="ghost-btn" onclick="openSpacedRepetitionModal('${deck.id}')" title="Ajustar os intervalos da revisão espaçada deste baralho">⏱️ Revisão espaçada</button>
      <button class="ghost-btn" onclick="toggleDeckArchive('${deck.id}')" title="${deck.archived?'Voltar este baralho para a agenda':'Manter para estudo manual, sem aparecer na agenda'}">${deck.archived?'↩ Reativar':'📦 Arquivar'}</button>
      <button class="ghost-btn" style="color:var(--error); border-color:var(--error);" onclick="deleteDeck('${deck.id}')" title="Excluir baralho">🗑 Excluir</button>
    </div>
  </div>
  <div class="stat-row">
    <div class="stat-chip"><div class="num">${cards.length}</div><div class="lbl">total de cartões</div></div>
    <div class="stat-chip"><div class="num">${due}</div><div class="lbl">para revisar hoje</div></div>
    <div class="stat-chip"><div class="num" style="color:${CARD_STATE_INFO.new.color};">${stateCounts.new}</div><div class="lbl">novo</div></div>
    <div class="stat-chip"><div class="num" style="color:${CARD_STATE_INFO.learning.color};">${stateCounts.learning}</div><div class="lbl">aprendendo</div></div>
    <div class="stat-chip"><div class="num" style="color:${CARD_STATE_INFO.mature.color};">${stateCounts.mature}</div><div class="lbl">maduro</div></div>
  </div>
  <div class="tab-row">
    <button class="tab ${state.tab==='cards'?'active':''}" onclick="setTab('cards')">Cartões</button>
    <button class="tab ${state.tab==='study'?'active':''}" onclick="setTab('study')">Estudar</button>
  </div>
  ${state.tab === 'cards' ? renderCardsTab(deck) : renderStudyPicker(deck)}
  `;
}
function setTab(t){ state.tab = t; renderNavigationChange(); }

function renderTranslationFields(idPrefix, existingBack){
  const parts = String(existingBack||'').split('/').map(s=>s.trim());
  const vals = [0,1,2,3].map(i => escapeHtml(parts[i] || ''));
  const labels = ['Tradução 1', 'Tradução 2 (opcional)', 'Tradução 3 (opcional)', 'Tradução 4 (opcional)'];
  return `
  <div style="display:flex; flex-direction:column; gap:6px;">
    ${[0,1,2,3].map(i => `<input type="text" id="${idPrefix}-${i}" value="${vals[i]}" placeholder="${labels[i]}" style="padding:7px 9px; font-size:13px;">`).join('')}
  </div>`;
}
function collectTranslationFields(idPrefix){
  return [0,1,2,3].map(i => {
    const el = document.getElementById(`${idPrefix}-${i}`);
    return el ? el.value.trim() : '';
  }).filter(Boolean).join('/');
}
function renderCardsTab(deck){
  const allCards = state.cards[deck.id] || [];
  const isLanguage = deck.type === 'language';
  const search = (state.cardSearch||'').trim().toLowerCase();
  const flaggedOnly = !!state.cardFilterFlagged;
  const learnedOnly = !!state.cardFilterLearned;
  const priorityOnly = !!state.cardFilterPriority;
  const flaggedCount = allCards.filter(c=>c.flagged).length;
  const learnedCount = allCards.filter(c=>c.learned).length;
  const priorityCount = allCards.filter(c=>c.priority).length;
  const cards = allCards.filter(c => {
    if(flaggedOnly && !c.flagged) return false;
    if(learnedOnly && !c.learned) return false;
    if(priorityOnly && !c.priority) return false;
    if(search && !((c.front||'').toLowerCase().includes(search) || (c.back||'').toLowerCase().includes(search))) return false;
    return true;
  });
  return `
  <div class="card-form">
    ${isLanguage ? `
    <div class="row">
      <div class="field">
        <label>TERMO EM INGLÊS</label>
        <input type="text" id="new-term" placeholder="Ex: nevertheless">
        <input type="text" id="new-term-category" list="grammar-categories" placeholder="Categoria (ex: verbo, adjetivo)" style="margin-top:6px; padding:7px 9px; font-size:12px;">
      </div>
      <div class="field">
        <label>TRADUÇÕES ACEITAS (até 4)</label>
        ${renderTranslationFields('new-term-translation', '')}
      </div>
    </div>
    <p style="font-size:11.5px; color:var(--text-faint); margin:-4px 0 0 0;">Preencha quantas quiser — na hora de estudar, qualquer uma delas conta como resposta certa.</p>
    <datalist id="grammar-categories"><option value="substantivo"><option value="verbo"><option value="adjetivo"><option value="advérbio"><option value="pronome"><option value="preposição"><option value="conjunção"><option value="interjeição"></datalist>
    <div class="field">
      <label>NOTA (opcional)</label>
      <textarea id="new-term-note" rows="2" placeholder="Uma explicação mais detalhada sobre o assunto, pra consultar durante o estudo"></textarea>
    </div>
    <button class="primary-btn" onclick="submitNewTerm('${deck.id}')">＋ Adicionar termo</button>
    ` : `
    <div style="display:flex; gap:8px; margin-bottom:14px;">
      <button type="button" class="ghost-btn" style="flex:1; ${state.cardFormMode!=='image' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.cardFormMode='text'; render();">Cartão normal</button>
      <button type="button" class="ghost-btn" style="flex:1; ${state.cardFormMode==='image' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.cardFormMode='image'; render();">🖼️ Cartão de imagem</button>
    </div>
    ${state.cardFormMode === 'image' ? renderImageCardForm(deck) : `
    <div class="row">
      <div class="field">
        <label>PERGUNTA (frente)</label>
        <textarea id="new-front" rows="2" placeholder="Ex: Qual a capital da Mongólia?"></textarea>
      </div>
      <div class="field">
        <label>RESPOSTA (verso)</label>
        <textarea id="new-back" rows="2" placeholder="Ex: Ulan Bator"></textarea>
      </div>
    </div>
    <div class="field">
      <label>NOTA (opcional)</label>
      <textarea id="new-note" rows="2" placeholder="Uma explicação mais detalhada sobre o assunto, pra consultar durante o estudo"></textarea>
    </div>
    <button class="primary-btn" onclick="submitNewCard('${deck.id}')">＋ Adicionar cartão</button>
    `}
    `}
  </div>
  <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
    <button class="ghost-btn" onclick="triggerImportInput('${deck.id}')">⇧ Importar (.txt do Anki / .csv / .json)</button>
    <button class="ghost-btn" onclick="exportDeckTxt('${deck.id}')">⇩ Exportar .txt</button>
    <button class="ghost-btn" onclick="exportDeckJson('${deck.id}')">⇩ Exportar .json</button>
    <button class="ghost-btn" style="margin-left:auto; color:var(--error); border-color:var(--error);" onclick="resetDeckFlags('${deck.id}')">↺ Resetar marcações do baralho</button>
  </div>
  <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
    <input type="text" id="card-search-input" placeholder="Buscar por termo/pergunta ou resposta..." value="${escapeHtml(state.cardSearch||'')}" style="flex:1; min-width:200px; padding:9px 12px; font-size:13px;" oninput="state.cardSearch=this.value; render();" onfocus="state._searchFocused=true;" onblur="state._searchFocused=false;">
    <button type="button" class="ghost-btn" style="padding:9px 14px; font-size:12.5px; ${flaggedOnly ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.cardFilterFlagged=!state.cardFilterFlagged; render();">🚩 Só sinalizadas${flaggedCount ? ` (${flaggedCount})` : ''}</button>
    <button type="button" class="ghost-btn" style="padding:9px 14px; font-size:12.5px; ${learnedOnly ? 'border-color:var(--success); color:var(--success);' : ''}" onclick="state.cardFilterLearned=!state.cardFilterLearned; render();">✅ Só aprendidas${learnedCount ? ` (${learnedCount})` : ''}</button>
    <button type="button" class="ghost-btn" style="padding:9px 14px; font-size:12.5px; ${priorityOnly ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.cardFilterPriority=!state.cardFilterPriority; render();">🔥 Só prioritárias${priorityCount ? ` (${priorityCount})` : ''}</button>
  </div>
  <div class="cards-grid">
    ${allCards.length===0 ? `<div style="color:var(--text-faint); font-size:13px; padding:10px 2px;">Nenhum cartão ainda — adicione o primeiro acima.</div>` : ''}
    ${allCards.length>0 && cards.length===0 ? `<div style="color:var(--text-faint); font-size:13px; padding:10px 2px;">Nenhum cartão encontrado com esse filtro.</div>` : ''}
    ${cards.map(c => {
      if(state.editingCardId === c.id){
        return `
        <div class="card-row" style="align-items:flex-start;">
          <div class="row" style="flex:1; margin:0;">
            <div class="field" style="gap:4px;">
              <label style="font-size:10px;">${isLanguage ? 'TERMO' : 'PERGUNTA'}</label>
              <input type="text" id="edit-front-${c.id}" value="${escapeHtml(c.front)}" style="padding:7px 9px; font-size:13px;" onkeydown="if(event.key==='Enter'){event.preventDefault(); saveEditCard('${deck.id}','${c.id}');} else if(event.key==='Escape'){ cancelEditCard(); }">
            </div>
            <div class="field" style="gap:4px;">
              <label style="font-size:10px;">${isLanguage ? 'TRADUÇÕES (até 4)' : 'RESPOSTA'}</label>
              ${isLanguage
                ? renderTranslationFields(`edit-back-${c.id}`, c.back)
                : `<input type="text" id="edit-back-${c.id}" value="${escapeHtml(c.back)}" style="padding:7px 9px; font-size:13px;" onkeydown="if(event.key==='Enter'){event.preventDefault(); saveEditCard('${deck.id}','${c.id}');} else if(event.key==='Escape'){ cancelEditCard(); }">`}
            </div>
            ${isLanguage ? `<div class="field" style="gap:4px;">
              <label style="font-size:10px;">CATEGORIA GRAMATICAL</label>
              <input type="text" id="edit-category-${c.id}" list="grammar-categories" value="${escapeHtml(c.category||'')}" placeholder="Ex: verbo" style="padding:7px 9px; font-size:13px;">
            </div>` : ''}
            <div class="field" style="gap:4px;">
              <label style="font-size:10px;">NOTA (opcional)</label>
              <textarea id="edit-note-${c.id}" rows="2" style="padding:7px 9px; font-size:13px;" placeholder="Explicação mais detalhada" onkeydown="if(event.key==='Escape'){ cancelEditCard(); }">${escapeHtml(c.note||'')}</textarea>
            </div>
          </div>
          <div style="display:flex; gap:6px; padding-top:18px;">
            <button class="ghost-btn" style="padding:6px 10px; font-size:12px;" onclick="cancelEditCard()">Cancelar</button>
            <button class="primary-btn" style="padding:6px 12px; font-size:12px;" onclick="saveEditCard('${deck.id}','${c.id}')">Salvar</button>
          </div>
        </div>`;
      }
      const learnedBtn = `<button class="icon-btn" style="width:28px; height:28px; font-size:13px; ${c.learned ? 'color:var(--success);' : 'opacity:0.4;'}" title="${c.learned ? 'Desmarcar como aprendido' : 'Marcar como aprendido (some das próximas sessões)'}" onclick="toggleCardLearned('${deck.id}','${c.id}')">✅</button>`;
      const priorityBtn = `<button class="icon-btn" style="width:28px; height:28px; font-size:13px; ${c.priority ? 'color:var(--accent);' : 'opacity:0.4;'}" title="${c.priority ? 'Remover prioridade' : 'Marcar prioridade (aparece mais vezes)'}" onclick="toggleCardPriority('${deck.id}','${c.id}')">🔥</button>`;
      const flagBtn = `<button class="icon-btn" style="width:28px; height:28px; font-size:13px; ${c.flagged ? 'color:var(--accent);' : 'opacity:0.4;'}" title="${c.flagged ? 'Remover sinalização' : 'Sinalizar para revisar depois'}" onclick="toggleCardFlag('${deck.id}','${c.id}')">🚩</button>`;
      const stateDot = renderStateDot(c);
      const rowStyle = c.learned ? 'style="background:rgba(110,231,183,0.06); border-color:rgba(110,231,183,0.3);"' : c.flagged ? 'style="background:rgba(245,166,35,0.07); border-color:rgba(245,166,35,0.35);"' : '';
      return isLanguage ? `
      <div class="card-row" ${rowStyle}>
        <div class="front" style="flex:1;">${escapeHtml(c.front)}${c.category ? ` <span style="font-size:10px; color:var(--text-faint); font-weight:500;">(${escapeHtml(c.category)})</span>` : ''}</div>
        ${c.back ? `
          <div class="back" style="flex:1;">${escapeHtml(c.back.split('/').join(' / '))}</div>
        ` : `
          <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
            ${renderTranslationFields(`fill-back-${c.id}`, '')}
            <button class="ghost-btn" style="padding:6px 10px; font-size:12px; align-self:flex-start;" onclick="fillTranslation('${deck.id}','${c.id}')">Salvar</button>
          </div>
        `}
        ${stateDot}
        <div class="due-tag">${fmtDue(c.due)}</div>
        ${learnedBtn}
        ${priorityBtn}
        ${flagBtn}
        <button class="icon-btn" style="width:28px; height:28px; font-size:13px;" title="Editar" onclick="startEditCard('${c.id}')">✎</button>
        <button class="del" onclick="deleteCard('${deck.id}','${c.id}')">✕</button>
      </div>
      ` : `
      <div class="card-row" ${rowStyle}>
        <div class="front">${isImageCard(c) ? '🖼️ ' : ''}${escapeHtml(c.front)}</div>
        <div class="back">${escapeHtml(c.back)}</div>
        ${stateDot}
        <div class="due-tag">${fmtDue(c.due)}</div>
        ${learnedBtn}
        ${priorityBtn}
        ${flagBtn}
        <button class="icon-btn" style="width:28px; height:28px; font-size:13px;" title="Editar" onclick="startEditCard('${c.id}')">✎</button>
        <button class="del" onclick="deleteCard('${deck.id}','${c.id}')">✕</button>
      </div>
    `;
    }).join('')}
  </div>`;
}
function renderStateDot(card){
  const info = CARD_STATE_INFO[getCardState(card)];
  return `<div title="${info.label}" style="width:8px; height:8px; border-radius:50%; background:${info.color}; flex-shrink:0;"></div>`;
}
function startEditCard(cardId){ state.editingCardId = cardId; render(); }
function cancelEditCard(){ state.editingCardId = null; render(); }
function saveEditCard(deckId, cardId){
  const frontInput = document.getElementById(`edit-front-${cardId}`);
  if(!frontInput) return;
  const front = frontInput.value.trim();
  const deck = state.decks.find(d=>d.id===deckId);
  const isLanguage = deck && deck.type === 'language';
  const back = isLanguage
    ? collectTranslationFields(`edit-back-${cardId}`)
    : (document.getElementById(`edit-back-${cardId}`) ? document.getElementById(`edit-back-${cardId}`).value.trim() : '');
  if(!front || (!isLanguage && !back)) { showToast('Preencha os campos antes de salvar.', 'error'); return; }
  const noteInput = document.getElementById(`edit-note-${cardId}`);
  const note = noteInput ? noteInput.value.trim() : '';
  const categoryInput = document.getElementById(`edit-category-${cardId}`);
  const category = categoryInput ? categoryInput.value.trim() : '';
  const card = (state.cards[deckId]||[]).find(c=>c.id===cardId);
  if(!card) return;
  if(isLanguage && findDuplicateLanguageTerm(deckId, front, category, cardId)){
    showToast(`O termo "${front}" já existe neste baralho${category ? ` como ${category}` : ' sem categoria'}.`, 'error');
    return;
  }
  card.front = front;
  card.back = back;
  card.note = note;
  if(isLanguage) card.category = category;
  state.editingCardId = null;
  saveData(); render();
}
function submitNewCard(deckId){
  const front = document.getElementById('new-front').value;
  const back = document.getElementById('new-back').value;
  const note = document.getElementById('new-note').value;
  addCard(deckId, front, back, note);
}
function submitNewTerm(deckId){
  const term = document.getElementById('new-term').value;
  const translation = collectTranslationFields('new-term-translation');
  const note = document.getElementById('new-term-note').value;
  const categoryInput = document.getElementById('new-term-category');
  const category = categoryInput ? categoryInput.value : '';
  const added = addTermCard(deckId, term, translation, note, category);
  if(!added) return;
  const termInput = document.getElementById('new-term');
  if(termInput) termInput.value = '';
  if(categoryInput) categoryInput.value = '';
}

function renderStudyPicker(deck){
  const due = getDueCards(deck.id,{includeArchived:true}).length;
  const total = (state.cards[deck.id]||[]).length;
  if(total === 0){
    return `<div style="color:var(--text-faint); font-size:13.5px;">Adicione ${deck.type==='language'?'termos':'cartões'} na aba "Cartões" antes de estudar.</div>`;
  }
  const dueLine = `<p style="color:var(--text-muted); font-size:13.5px; margin-bottom:14px;">
    ${deck.archived ? `Este baralho está arquivado: não entra na agenda, mas pode ser estudado livremente.` : due>0 ? `${due} ${deck.type==='language'?'termo(s)':'cartão(ões)'} prontos para revisão hoje.` : `Nada vencido — você pode revisar o baralho inteiro mesmo assim.`}
  </p>`;
  if(deck.type === 'language'){
    const enabled = getEnabledExercises(deck);
    const usesAI = enabled.includes('write') || enabled.includes('translateAI');
    const carryCount = (deck.carryOverLang || []).length;
    return `
    ${dueLine}
    <div style="margin-bottom:16px;">
      <label style="font-size:11px; letter-spacing:0.06em; color:var(--text-faint); text-transform:uppercase; font-weight:600;">Exercícios ativos nesta sessão</label>
      <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
        ${EXERCISE_TYPES.map(exType => `
          <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${enabled.includes(exType) ? 'border-color:var(--accent); color:var(--accent);' : 'opacity:0.55;'}" onclick="toggleExerciseType('${deck.id}','${exType}')">
            ${enabled.includes(exType) ? '✓ ' : ''}${EXERCISE_LABELS[exType]}
          </button>
        `).join('')}
      </div>
      ${enabled.includes('write') ? `
      <div style="margin-top:14px;">
        <label style="font-size:11px; letter-spacing:0.06em; color:var(--text-faint); text-transform:uppercase; font-weight:600;">Dificuldade da tradução de frase</label>
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
          <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${getSentenceDifficulty(deck)==='easy' ? 'border-color:var(--accent); color:var(--accent);' : 'opacity:0.6;'}" onclick="setSentenceDifficulty('${deck.id}','easy')">✓ Fácil</button>
          <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${getSentenceDifficulty(deck)==='intermediate' ? 'border-color:var(--accent); color:var(--accent);' : 'opacity:0.6;'}" onclick="setSentenceDifficulty('${deck.id}','intermediate')">Intermediário</button>
        </div>
        <p style="font-size:11.5px; color:var(--text-faint); margin:7px 0 0 0;">Fácil usa frases curtas, com vocabulário do dia a dia e estruturas básicas.</p>
      </div>` : ''}
      ${enabled.length === 0 ? `<p style="font-size:11.5px; color:var(--error); margin-top:8px;">Ative pelo menos 1 tipo de exercício pra estudar.</p>` : ''}
      ${usesAI && carryCount > 0 ? `<p style="font-size:11.5px; color:var(--accent); margin-top:8px;">🔁 ${carryCount} exercício(s) pendente(s) da sessão anterior serão priorizados agora.</p>` : ''}
    </div>
    <div class="mode-grid" style="grid-template-columns:1fr;">
      <button class="mode-card" ${enabled.length===0?'disabled style="opacity:0.5; cursor:not-allowed;"':''} onclick="${enabled.length>0 ? `startLanguageSession('${deck.id}')` : ''}">
        <div class="m-icon">🧠</div>
        <h3>Começar sessão</h3>
        <p>Para cada termo, mistura os exercícios ativos acima.${enabled.includes('translate') ? ' Tradução direta é verificada na hora, sem gastar IA.' : ''}</p>
        ${enabled.includes('translate') ? `<p style="margin-top:6px; font-size:11.5px;">Termos sem tradução cadastrada pulam o exercício de tradução direta — adicione a tradução na aba "Cartões" pra aproveitar todos.</p>` : ''}
        ${usesAI ? `<p style="margin-top:6px; font-size:11.5px;">⚡ Sessões com IA são limitadas a ${AI_SESSION_CAP} perguntas — o resto fica pendente pra próxima vez.</p>` : ''}
      </button>
    </div>`;
  }
  const aiOn = isAiEnabled(deck);
  const hasImageCards = (state.cards[deck.id]||[]).some(isImageCard);
  const enabledStd = getEnabledStandardTypes(deck).filter(t => t !== 'image' || hasImageCards);
  const carryStdCount = (deck.carryOverStd || []).length;
  return `
  ${dueLine}
  <div style="margin-bottom:16px;">
    <label style="font-size:11px; letter-spacing:0.06em; color:var(--text-faint); text-transform:uppercase; font-weight:600;">Inteligência artificial</label>
    <div style="margin-top:8px;">
      <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${aiOn ? 'border-color:var(--accent); color:var(--accent);' : 'border-color:var(--text-faint); opacity:0.7;'}" onclick="toggleDeckAi('${deck.id}')">
        ${aiOn ? '🤖 IA ligada' : '📴 IA desligada'}
      </button>
      <p style="font-size:11.5px; color:var(--text-faint); margin-top:6px;">
        ${aiOn
          ? 'Múltipla escolha usa a IA pra criar alternativas, e pergunta aberta verifica sua resposta com busca na internet.'
          : 'Múltipla escolha usa respostas de outros cartões do baralho como alternativas, e pergunta aberta (e cartões de imagem) vira autoavaliação (fácil/médio/difícil) — tudo local, sem gastar IA.'}
      </p>
    </div>
  </div>
  <div style="margin-bottom:16px;">
    <label style="font-size:11px; letter-spacing:0.06em; color:var(--text-faint); text-transform:uppercase; font-weight:600;">Tipos de cartão ativos nesta sessão</label>
    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
      <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${enabledStd.includes('mc') ? 'border-color:var(--accent); color:var(--accent);' : 'opacity:0.55;'}" onclick="toggleStandardType('${deck.id}','mc')">
        ${enabledStd.includes('mc') ? '✓ ' : ''}🎯 Múltipla escolha
      </button>
      <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${enabledStd.includes('open') ? 'border-color:var(--accent); color:var(--accent);' : 'opacity:0.55;'}" onclick="toggleStandardType('${deck.id}','open')">
        ${enabledStd.includes('open') ? '✓ ' : ''}🌐 Aberta
      </button>
      ${hasImageCards ? `
      <button type="button" class="ghost-btn" style="padding:8px 14px; font-size:12.5px; ${enabledStd.includes('image') ? 'border-color:var(--accent); color:var(--accent);' : 'opacity:0.55;'}" onclick="toggleStandardType('${deck.id}','image')">
        ${enabledStd.includes('image') ? '✓ ' : ''}🖼️ Com imagem
      </button>
      ` : ''}
    </div>
    ${enabledStd.length === 0 ? `<p style="font-size:11.5px; color:var(--error); margin-top:8px;">Ative pelo menos 1 tipo de exercício pra estudar.</p>` : ''}
    ${aiOn && carryStdCount > 0 ? `<p style="font-size:11.5px; color:var(--accent); margin-top:8px;">🔁 ${carryStdCount} exercício(s) pendente(s) da sessão anterior serão priorizados agora.</p>` : ''}
  </div>
  <div class="mode-grid" style="grid-template-columns:1fr;">
    <button class="mode-card" ${enabledStd.length===0?'disabled style="opacity:0.5; cursor:not-allowed;"':''} onclick="${enabledStd.length>0 ? `startMixedStandardSession('${deck.id}')` : ''}">
      <div class="m-icon">🧠</div>
      <h3>Começar sessão</h3>
      <p>Mistura os tipos ativos acima. Múltipla escolha e aberta ${aiOn ? 'usam IA' : 'ficam locais, sem IA'}; cartões de imagem sempre são digitados e autoavaliados.</p>
      ${aiOn ? `<p style="margin-top:6px; font-size:11.5px;">⚡ Sessões com IA são limitadas a ${AI_SESSION_CAP} perguntas — o resto fica pendente pra próxima vez.</p>` : ''}
    </button>
  </div>
  ${hasImageCards ? `
  <div class="mode-grid" style="grid-template-columns:1fr; margin-top:10px;">
    <button class="mode-card" onclick="startSession('${deck.id}','image-locate')">
      <div class="m-icon">📍</div>
      <h3>Localizar (só imagem)</h3>
      <p>Modo separado: mostra só a pergunta, sem revelar onde fica o pino — clique no ponto certo da imagem. Não entra na sessão mista acima.</p>
    </button>
  </div>
  ` : ''}
  `;
}

function renderPrefetchLoading(s){
  const p = s.prefetch;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 100;
  return `
  <div class="study-wrap">
    <div class="session-top">
      <button class="ghost-btn" onclick="endSessionEarly()">Encerrar</button>
      <div style="flex:1; margin:0 20px;">
        <div class="progress-track" style="margin:0;"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>
    <div class="study-card" style="align-items:center; text-align:center;">
      <div class="spinner" style="margin:0 auto 14px;"></div>
      <div class="question" style="font-size:16px;">Preparando sessão...</div>
      <p style="color:var(--text-muted); font-size:13px; margin-top:6px;">Gerando as perguntas de IA em lote pra economizar mensagens (${p.done}/${p.total})</p>
    </div>
  </div>`;
}
function renderStudyView(){
  const s = state.session;
  if(!s) return '';
  if(s.prefetch && s.prefetch.active) return renderPrefetchLoading(s);
  const card = getCurrentCard();
  const pct = Math.round((s.index / s.queue.length) * 100);
  const elapsed = Date.now() - s.startTime;

  let body = '';
  if(s.mode === 'direct'){
    body = renderDirectMode(s, card);
  } else if(s.mode === 'mc'){
    body = renderMCMode(s, card);
  } else if(s.mode === 'open'){
    body = renderOpenMode(s, card);
  } else if(s.mode === 'copy-memorize'){
    body = renderCopyMemorizeMode(s, card);
  } else if(s.mode === 'image-answer'){
    body = renderImageAnswerMode(s, card);
  } else if(s.mode === 'image-locate'){
    body = renderImageLocateMode(s, card);
  } else if(s.mode === 'std-mixed'){
    const stdExType = getCurrentExType();
    if(stdExType === 'mc') body = renderMCMode(s, card);
    else if(stdExType === 'open') body = renderOpenMode(s, card);
    else if(stdExType === 'image-answer') body = renderImageAnswerMode(s, card);
  } else if(s.mode === 'lang-mixed'){
    const exType = getCurrentExType();
    if(exType === 'translate') body = renderTranslateExercise(s, card);
    else if(exType === 'translateAI') body = renderTranslateAIExercise(s, card);
    else if(exType === 'reverseTranslate') body = renderReverseTranslateExercise(s, card);
    else if(exType === 'write') body = renderWriteExercise(s, card);
    else if(exType === 'mc') body = renderLangMCExercise(s, card);
    else if(exType === 'translateOther') body = renderTranslateOtherExercise(s, card);
    else if(exType === 'copy-translation') body = renderCopyTranslationExercise(s, card);
  }

  const exLabel = s.mode === 'lang-mixed' ? ` · ${EXERCISE_LABELS[getCurrentExType()]}` : (s.mode === 'std-mixed' ? ` · ${STD_TYPE_LABELS[getCurrentExType()]}` : '');
  const remaining = s.queue.length - s.index;
  const currentExType = (s.mode === 'lang-mixed' || s.mode === 'std-mixed') ? getCurrentExType() : null;
  const isReverse = currentExType === 'reverseTranslate';
  // No modo de idioma, a pergunta da múltipla escolha já vem em s.content.prompt.
  // No modo padrão, o enunciado é o próprio card.front e precisa continuar visível.
  const hideTopQuestion = s.mode === 'lang-mixed' && currentExType === 'mc';
  const questionText = isReverse
    ? (s.content && s.content.chosenTranslation ? s.content.chosenTranslation : '...')
    : card.front;

  return `
  <div class="study-wrap">
    <div class="session-top">
      <button class="ghost-btn" onclick="endSessionEarly()">Encerrar</button>
      <div class="session-progress" style="flex:1; margin:0 20px;">
        <div class="progress-track" style="margin:0;"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-faint); margin-top:5px; font-family:ui-monospace,'SF Mono','Cascadia Code','Roboto Mono',Consolas,'Courier New',monospace;">
          <span>${s.index} respondida(s)</span>
          <span>${remaining} restante(s)</span>
        </div>
      </div>
      <div class="session-badges" style="display:flex; align-items:center; gap:10px;">
        ${(s.streak||0) >= 2 ? `<div style="font-size:12.5px; color:var(--accent); font-weight:600; white-space:nowrap;">🔥 ${s.streak}</div>` : ''}
        <div style="font-size:12.5px; color:var(--success); font-weight:600; white-space:nowrap;">🏆 ${s.points||0} pts</div>
        <div class="timer mono">${fmtTime(elapsed)}</div>
      </div>
    </div>
    ${(!s.memorizeMode && s.mode !== 'copy-memorize' && (card.missStreak||0) >= 3) ? `
    <div style="background:rgba(245,166,35,0.12); border:1px solid rgba(245,166,35,0.4); border-radius:10px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <span style="font-size:12.5px; color:var(--accent);">Você errou essa questão 3 vezes seguidas.</span>
      <button class="primary-btn" style="padding:8px 14px; font-size:12.5px; white-space:nowrap;" onclick="${s.mode === 'lang-mixed' ? 'startMemorizeMode()' : 'startCopyMemorize()'}">🎯 Memorizar</button>
    </div>
    ` : ''}
    ${s.memorizeMode && s.mode === 'lang-mixed' ? `
    <div style="background:rgba(125,169,250,0.12); border:1px solid rgba(125,169,250,0.4); border-radius:10px; padding:8px 14px; margin-bottom:14px; font-size:12px; color:#7DA9FA; text-align:center;">
      🎯 Modo memorizar — ${s.returnToReaderBookId ? `volta pra leitura ao terminar estes ${s.queue.length} exercícios` : `a sessão normal retoma de onde parou ao terminar estes ${s.queue.length} exercícios`}
    </div>
    ` : ''}
    ${s.mode === 'copy-memorize' ? `
    <div style="background:rgba(125,169,250,0.12); border:1px solid rgba(125,169,250,0.4); border-radius:10px; padding:8px 14px; margin-bottom:14px; font-size:12px; color:#7DA9FA; text-align:center;">
      🎯 Modo memorizar — a sessão normal retoma assim que você copiar certinho
    </div>
    ` : ''}
    <div class="study-card">
      <div class="eyebrow" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Cartão ${s.index+1} de ${s.queue.length}${exLabel}${(s.mode==='lang-mixed' && getCardTranslations(card).length >= 2) ? ` · <span style="opacity:0.7;">${getCardTranslations(card).length} respostas possíveis</span>` : ''}</span>
        <div style="display:flex; gap:4px;">
          ${card.note ? `<button class="icon-btn" style="width:26px; height:26px; font-size:13px; ${s.showNote ? 'color:#F5D76E;' : 'opacity:0.5;'}" title="Ver nota (L)" onclick="toggleNoteView()">💡</button>` : ''}
          <button class="icon-btn" style="width:26px; height:26px; font-size:13px; ${card.learned ? 'color:var(--success);' : 'opacity:0.4;'}" title="${card.learned ? 'Desmarcar como aprendido' : 'Marcar como aprendido (some das próximas sessões)'}" onclick="toggleLearnedCurrentCard()">✅</button>
          <button class="icon-btn" style="width:26px; height:26px; font-size:13px; ${card.priority ? 'color:var(--accent);' : 'opacity:0.4;'}" title="${card.priority ? 'Remover prioridade' : 'Marcar prioridade (aparece mais vezes)'}" onclick="togglePriorityCurrentCard()">🔥</button>
          <button class="icon-btn" style="width:26px; height:26px; font-size:13px; ${card.flagged ? 'color:var(--accent);' : 'opacity:0.4;'}" title="${card.flagged ? 'Remover sinalização' : 'Sinalizar esta pergunta para editar/revisar depois'}" onclick="toggleFlagCurrentCard()">🚩</button>
        </div>
      </div>
      ${(card.note && s.showNote) ? `<div style="background:var(--accent-soft); border:1px solid var(--accent-dim); border-radius:10px; padding:10px 14px; margin:10px 0 0 0; font-size:13px; color:var(--text); text-align:left; white-space:pre-wrap;">💡 ${escapeHtml(card.note)}</div>` : ''}
      ${isReverse ? `<p style="color:var(--text-muted); font-size:12px; margin:0 0 4px 0;">Digite o termo em inglês para:</p>` : ''}
      ${hideTopQuestion ? '' : `<div class="question">${escapeHtml(questionText)}${(s.mode==='lang-mixed' && card.category) ? ` <span style="font-size:13px; font-weight:600; color:var(--text-faint); vertical-align:middle;">(${escapeHtml(card.category)})</span>` : ''}</div>`}
    </div>
    ${body}
  </div>`;
}

function renderCopyMemorizeMode(s, card){
  if(!s.revealed){
    return `
    <div class="answer-zone">
      <p style="color:var(--text-muted); font-size:12.5px; text-align:center;">Copie a resposta abaixo, digitando ela certinho, pra fixar:</p>
      <div class="answer-box">${escapeHtml(card.back)}</div>
      <textarea id="copy-input" rows="2" placeholder="Digite a resposta..." autofocus autocomplete="off" autocorrect="off" spellcheck="false" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); submitCopyMemorize(); }" onkeyup="state.session.userInput=this.value">${escapeHtml(s.userInput||'')}</textarea>
      <div class="action-row"><button class="primary-btn" onclick="submitCopyMemorize()">Verificar</button></div>
      ${s.copyMismatch ? `
      <div class="feedback-banner no">
        <div style="margin-bottom:6px;">Confira as palavras destacadas em vermelho — são as que não batem com a resposta:</div>
        <div style="line-height:1.9; font-weight:400;">${diffWords(s.lastCopyAttempt||'', card.back).map(w => `<span style="${w.correct ? 'color:var(--success);' : 'color:var(--error); text-decoration:underline wavy; text-underline-offset:3px;'}">${escapeHtml(w.text)}</span>`).join(' ')}</div>
      </div>
      ` : ''}
    </div>`;
  }
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="feedback-banner ok">✓ Copiado certinho! Isso ajuda a fixar.</div>
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Concluir →</button></div>
    </div>
  </div>`;
}
function renderDirectMode(s, card){
  if(!s.revealed){
    return `
    <div class="answer-zone" style="align-items:center;">
      <button class="primary-btn" onclick="submitDirectReveal()">Revelar resposta</button>
    </div>`;
  }
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="answer-box">${escapeHtml(card.back)}</div>
      ${s.lastFeedback === null ? `
        <p style="color:var(--text-muted); font-size:13.5px;">Você acertou?</p>
        <div class="action-row">
          <button class="ghost-btn" style="border-color:var(--error); color:var(--error);" onclick="answerDirect(false)">✕ Errei</button>
          <button class="primary-btn" onclick="answerDirect(true)">✓ Acertei</button>
        </div>
      ` : `
        <div class="feedback-banner ${s.lastFeedback?'ok':'no'}">${s.lastFeedback? '✓ Mandou bem!' : '✕ Vamos revisar de novo em breve.'}</div>
        ${renderPointsBadge(s)}
        <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
      `}
    </div>
  </div>`;
}

function renderImagePinMarkers(card, highlightCurrent){
  const allPins = (state.cards[state.session.deckId]||[]).filter(c => isImageCard(c) && c.imageUrl === card.imageUrl);
  return allPins.map(p => {
    const isCurrent = p.id === card.id;
    const size = (highlightCurrent && isCurrent) ? 24 : 14;
    const bg = (highlightCurrent && isCurrent) ? 'var(--accent)' : 'rgba(244,241,234,0.4)';
    const ring = (highlightCurrent && isCurrent) ? 'box-shadow:0 0 0 6px rgba(245,166,35,0.25);' : '';
    return `<div style="position:absolute; left:${p.pinX}%; top:${p.pinY}%; transform:translate(-50%,-50%); width:${size}px; height:${size}px; border-radius:50%; background:${bg}; border:2px solid var(--brand-text); ${ring} pointer-events:none;"></div>`;
  }).join('');
}
function renderImageBroken(){
  return `<div style="display:none; padding:36px 16px; text-align:center; color:var(--error); font-size:13px; background:var(--bg-2); border-radius:12px;">⚠ Não foi possível carregar essa imagem.</div>`;
}
function renderImageAnswerMode(s, card){
  // reaproveita 100% a mesma lógica de pergunta aberta (digita, autoavalia fácil/médio/difícil
  // quando a IA tá desligada, ou verificação por IA quando ligada) — só acrescenta a imagem em cima.
  const imageBlock = `
  <div style="position:relative; max-width:420px; width:100%; margin:0 auto 14px;">
    <img src="${escapeHtml(card.imageUrl)}" style="width:100%; display:block; border-radius:12px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
    ${renderImageBroken()}
    ${renderImagePinMarkers(card, true)}
  </div>`;
  return renderOpenMode(s, card, imageBlock);
}
const IMAGE_LOCATE_TOLERANCE_PCT = 7;
function answerImageLocate(e){
  const s = state.session; const card = getCurrentCard();
  if(!s || s.revealed) return;
  const rect = e.target.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  const dist = Math.hypot(x - card.pinX, y - card.pinY);
  const correct = dist <= IMAGE_LOCATE_TOLERANCE_PCT;
  s.clickPos = { x, y };
  scheduleCard(card, correct, s.deckId);
  if(correct){ s.correct++; } else { requeueOnWrong(); }
  awardPoints(card, correct, 'image-locate');
  s.lastFeedback = correct;
  s.revealed = true;
  saveData();
  render();
}
function renderImageLocateMode(s, card){
  if(!s.revealed){
    return `
    <div class="answer-zone" style="align-items:center;">
      <div style="position:relative; max-width:420px; width:100%; margin:0 auto;">
        <img src="${escapeHtml(card.imageUrl)}" style="width:100%; display:block; border-radius:12px; cursor:crosshair;" onclick="answerImageLocate(event)" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        ${renderImageBroken()}
      </div>
      <p style="color:var(--text-muted); font-size:12.5px; text-align:center;">Clique no ponto certo da imagem.</p>
    </div>`;
  }
  return `
  <div class="answer-zone">
    <div style="position:relative; max-width:420px; width:100%; margin:0 auto;">
      <img src="${escapeHtml(card.imageUrl)}" style="width:100%; display:block; border-radius:12px;">
      <div style="position:absolute; left:${card.pinX}%; top:${card.pinY}%; transform:translate(-50%,-50%); width:22px; height:22px; border-radius:50%; background:var(--success); border:2px solid #06210F;"></div>
      ${(!s.lastFeedback && s.clickPos) ? `<div style="position:absolute; left:${s.clickPos.x}%; top:${s.clickPos.y}%; transform:translate(-50%,-50%); width:18px; height:18px; border-radius:50%; background:var(--error); border:2px solid #2A0A10;"></div>` : ''}
    </div>
    <div class="reveal-zone">
      <div class="feedback-banner ${s.lastFeedback?'ok':'no'}">${s.lastFeedback? '✓ Isso aí!' : '✕ Não era ali — o certo tá marcado em verde.'}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}

function renderMCMode(s, card){
  if(s.loadingOptions){
    return `<div class="answer-zone" style="align-items:center;">
      <div class="loading-line"><div class="spinner"></div> Gerando alternativas...</div>
    </div>`;
  }
  if(s.optionsUnavailable){
    return `<div class="answer-zone" style="align-items:center;"><p style="color:var(--text-muted); font-size:13px; text-align:center;">Esse baralho precisa de pelo menos 4 cartões com respostas diferentes pra montar alternativas sem IA. Adicione mais cartões, ou ative a IA do baralho.</p></div>`;
  }
  if(!s.options) return '';
  return `
  <div class="answer-zone">
    <div class="options-grid">
      ${s.options.map((opt, i) => {
        let cls = '';
        if(s.revealed){
          if(opt === card.back) cls = 'correct';
          else if(opt === s.chosen) cls = 'wrong';
        }
        return `<button class="option-btn ${cls}" ${s.revealed?'disabled':''} onclick="answerMC(${i})"><span class="opt-num">${i+1}</span>${escapeHtml(opt)}</button>`;
      }).join('')}
    </div>
    ${s.revealed ? `
      <div class="feedback-banner ${s.lastFeedback?'ok':'no'}">${s.lastFeedback? '✓ Isso aí!' : '✕ Não foi dessa vez.'}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    ` : ''}
  </div>`;
}

function renderOpenMode(s, card, extraTop){
  if(s.usesGradedOpen) return renderOpenGradedMode(s, card, extraTop);
  if(!s.revealed){
    return `
    <div class="answer-zone">
      ${extraTop||''}
      <textarea id="open-input" rows="3" placeholder="Digite sua resposta... (Enter para confirmar, Shift+Enter para quebrar linha)" autofocus autocomplete="off" autocorrect="off" spellcheck="false" ${s.verifying?'disabled':''} onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); if(!${s.verifying}) submitOpenAnswerFromInput(); }" onkeyup="state.session.userInput=this.value">${escapeHtml(s.userInput||'')}</textarea>
      <div class="action-row">
        <button class="primary-btn" ${s.verifying?'disabled':''} onclick="submitOpenAnswerFromInput()">
          ${s.verifying ? 'Verificando na internet...' : 'Verificar resposta'}
        </button>
      </div>
      ${s.verifying ? `<div class="loading-line" style="justify-content:center;"><div class="spinner"></div> Buscando informações para conferir...</div>` : ''}
      <div style="text-align:center; margin-top:-4px;">
        <a href="#" style="font-size:11.5px; color:var(--text-faint); text-decoration:underline;" onclick="event.preventDefault(); dontKnowOpen();">não sei <span style="opacity:0.6;">(Esc)</span></a>
      </div>
    </div>`;
  }
  const r = s.verifyResult;
  return `
  <div class="answer-zone">
    ${extraTop||''}
    <div class="reveal-zone">
      <div class="answer-box"><strong>Resposta de referência:</strong> ${escapeHtml(card.back)}</div>
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct? '✓ Correto' : '✕ Incorreto'} — ${escapeHtml(r.explanation)}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}
function renderOpenGradedMode(s, card, extraTop){
  if(!s.revealed){
    return `
    <div class="answer-zone">
      ${extraTop||''}
      <textarea id="open-graded-input" rows="3" placeholder="Digite sua resposta... (Enter para confirmar, Shift+Enter para quebrar linha)" autofocus autocomplete="off" autocorrect="off" spellcheck="false" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); submitOpenGraded(); }" onkeyup="state.session.userInput=this.value">${escapeHtml(s.userInput||'')}</textarea>
      <div class="action-row">
        <button class="primary-btn" onclick="submitOpenGraded()">Verificar resposta</button>
      </div>
      <div style="text-align:center; margin-top:-4px;">
        <a href="#" style="font-size:11.5px; color:var(--text-faint); text-decoration:underline;" onclick="event.preventDefault(); dontKnowOpen();">não sei <span style="opacity:0.6;">(Esc)</span></a>
      </div>
    </div>`;
  }
  if(!s.graded){
    return `
    <div class="answer-zone">
      ${extraTop||''}
      <div class="reveal-zone">
        <div class="answer-box"><strong>Sua resposta:</strong> ${escapeHtml(s.userInput||'')}</div>
        <div class="answer-box"><strong>Resposta de referência:</strong> ${escapeHtml(card.back)}</div>
        <p style="color:var(--text-muted); font-size:13.5px; margin-top:4px;">Sua resposta é diferente da referência. Como foi pra você?</p>
        <div style="display:flex; gap:8px; width:100%;">
          <button class="ghost-btn" style="flex:1; border-color:var(--error); color:var(--error);" onclick="answerOpenGraded('hard')">😖 Difícil</button>
          <button class="ghost-btn" style="flex:1; border-color:var(--accent); color:var(--accent);" onclick="answerOpenGraded('medium')">😐 Médio</button>
          <button class="ghost-btn" style="flex:1; border-color:var(--success); color:var(--success);" onclick="answerOpenGraded('easy')">😌 Fácil</button>
        </div>
      </div>
    </div>`;
  }
  const gradeLabels = { easy: '😌 Fácil', medium: '😐 Médio', hard: '😖 Difícil' };
  return `
  <div class="answer-zone">
    ${extraTop||''}
    <div class="reveal-zone">
      <div class="feedback-banner ${s.lastFeedback?'ok':'no'}">${s.autoMatched ? '✓ Bateu certinho com a resposta de referência!' : `Marcado como ${gradeLabels[s.gradeChosen]}${s.gradeChosen==='hard' ? ' — vai voltar a aparecer em breve' : ''}`}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}
function submitOpenAnswerFromInput(){
  const val = document.getElementById('open-input').value;
  state.session.userInput = val;
  submitOpenAnswer();
}

function langLoadError(s){
  if(s && s.content && s.content.missingKey){
    return `<div class="answer-zone" style="align-items:center;"><p style="color:var(--error); font-size:13.5px; text-align:center;">É preciso configurar sua chave de API do Gemini pra gerar exercícios de IA. <button class="ghost-btn" onclick="openApiKeyModal()">Configurar chave</button></p></div>`;
  }
  return `<div class="answer-zone" style="align-items:center;"><p style="color:var(--error); font-size:13.5px; text-align:center;">Não foi possível gerar o exercício. <button class="ghost-btn" onclick="loadContentForCurrent()">Tentar de novo</button></p></div>`;
}

function renderWriteExercise(s, card){
  if(s.loadingContent){
    return `<div class="answer-zone" style="align-items:center;"><div class="loading-line"><div class="spinner"></div> Gerando frase...</div></div>`;
  }
  if(!s.content || s.content.error) return langLoadError(s);
  if(!s.revealed){
    return `
    <div class="answer-zone">
      <div class="answer-box" style="text-align:left;">${renderClickableSentence(s.content.sentence)}</div>
      <p style="font-size:11px; color:var(--text-faint); margin:-8px 0 0 0; text-align:left;">💡 Clique numa palavra pra ver a tradução</p>
      <textarea id="lang-input" rows="2" placeholder="Traduza a frase para português... (Enter para confirmar)" autofocus autocomplete="off" autocorrect="off" spellcheck="false" ${s.verifying?'disabled':''} onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); if(!${s.verifying}) submitFromInput('lang-input'); }" onkeyup="state.session.userInput=this.value">${escapeHtml(s.userInput||'')}</textarea>
      <div class="action-row">
        <button class="primary-btn" ${s.verifying?'disabled':''} onclick="submitFromInput('lang-input')">
          ${s.verifying ? 'Verificando...' : 'Verificar tradução'}
        </button>
      </div>
      ${s.verifying ? `<div class="loading-line" style="justify-content:center;"><div class="spinner"></div> Conferindo sua resposta...</div>` : ''}
      ${renderDontKnowLangLink()}
    </div>`;
  }
  const r = s.verifyResult;
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="answer-box"><strong>Frase:</strong> ${renderClickableSentence(s.content.sentence)}</div>
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct? '✓ Correto' : '✕ Incorreto'} — ${escapeHtml(r.explanation)}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}

function renderLangMCExercise(s, card){
  if(!s.content || s.content.error || !s.content.options){
    if(s.content && s.content.notEnoughCards){
      return `<div class="answer-zone" style="align-items:center;"><p style="color:var(--text-muted); font-size:13px; text-align:center;">Esse baralho precisa de pelo menos 4 termos com tradução cadastrada pra montar alternativas de múltipla escolha. Adicione mais traduções na aba "Cartões".</p></div>`;
    }
    return langLoadError(s);
  }
  const correctIdx = s.content.correctIndexes || [];
  const checked = s.checkedIndexes || [];
  const multi = correctIdx.length > 1;
  // a dica ajuda a escolher entre as opções, então mostra ANTES de responder —
  // ela nunca cita a tradução, só descreve a situação, então não tem spoiler.
  const hintIndexes = s.content.promptTranslationIndex != null ? [s.content.promptTranslationIndex] : (s.content.correctTranslationIndexes||[]);
  const hints = collectHints(card, hintIndexes);
  return `
  <div class="answer-zone">
    <div class="answer-box" style="text-align:left;">${escapeHtml(s.content.prompt)}</div>
    ${hints.map(renderHintBox).join('')}
    ${(multi && !s.revealed) ? `<p style="color:var(--text-muted); font-size:12px; text-align:center; margin:-4px 0 0 0;">Esse termo tem mais de uma tradução certa — marque todas antes de avançar.</p>` : ''}
    <div class="options-grid">
      ${s.content.options.map((opt, i) => {
        let cls = '';
        const isChecked = checked.includes(i);
        if(s.revealed){
          if(correctIdx.includes(i)) cls = 'correct';
          else if(i === s.chosenIndex || isChecked) cls = 'wrong';
        } else if(isChecked){
          cls = 'correct';
        }
        return `<button class="option-btn ${cls}" ${(s.revealed||isChecked)?'disabled':''} onclick="answerLangMC(${i})"><span class="opt-num">${isChecked && !s.revealed ? '✓' : i+1}</span>${escapeHtml(opt)}</button>`;
      }).join('')}
    </div>
    ${(!s.revealed && s.partialCorrect) ? `<div class="feedback-banner ok">☑ Essa foi! Ainda falta marcar ${correctIdx.length - checked.length} opção(ões) certa(s).</div>` : ''}
    ${!s.revealed ? renderDontKnowLangLink() : ''}
    ${s.revealed ? `
      <div class="feedback-banner ${s.lastFeedback?'ok':'no'}">${s.lastFeedback? '✓ Isso aí!' : '✕ Não foi dessa vez.'}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    ` : ''}
  </div>`;
}
function renderTranslateOtherExercise(s, card){
  if(!s.content) return `<div class="answer-zone" style="align-items:center;"><div class="loading-line"><div class="spinner"></div> Carregando...</div></div>`;
  if(!s.revealed){
    return `
    <div class="answer-zone">
      <p style="color:var(--text-muted); font-size:13.5px; text-align:center;">Digite uma tradução diferente de "${escapeHtml(s.content.excluded)}".</p>
      <input type="text" id="lang-input" placeholder="Tradução..." value="${escapeHtml(s.userInput||'')}" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" onkeyup="if(event.key==='Enter') submitFromInput('lang-input'); else state.session.userInput=this.value">
      <div class="action-row">
        <button class="primary-btn" onclick="submitFromInput('lang-input')">Verificar</button>
      </div>
      ${renderDontKnowLangLink()}
    </div>`;
  }
  const r = s.verifyResult;
  const matchedIdx = findTranslationIndexForAnswer(card, s.userInput||'');
  const hint = matchedIdx >= 0
    ? getHintForIndex(card, matchedIdx)
    : ((card.hints||[]).find(Boolean) || '');
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct? '✓ Correto' : `✕ ${escapeHtml(r.explanation)}`}</div>
      ${renderHintBox(hint)}
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}
function renderCopyTranslationExercise(s, card){
  if(!s.content) return `<div class="answer-zone" style="align-items:center;"><div class="loading-line"><div class="spinner"></div> Carregando...</div></div>`;
  if(!s.revealed){
    return `
    <div class="answer-zone">
      <p style="color:var(--text-muted); font-size:12.5px; text-align:center;">Copie a tradução abaixo, digitando ela certinho, pra fixar:</p>
      <div class="answer-box">${escapeHtml(s.content.targetTranslation)}</div>
      ${renderHintBox(getHintForIndex(card, s.content.translationIndex))}
      <input type="text" id="lang-input" placeholder="Digite a tradução..." value="${escapeHtml(s.userInput||'')}" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" onkeyup="if(event.key==='Enter') submitFromInput('lang-input'); else state.session.userInput=this.value">
      <div class="action-row">
        <button class="primary-btn" onclick="submitFromInput('lang-input')">Verificar</button>
      </div>
    </div>`;
  }
  const r = s.verifyResult;
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct? '✓ Copiado certinho!' : `✕ ${escapeHtml(r.explanation)}`}</div>
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}

function renderTranslateExercise(s, card){
  // sorteado uma vez ao carregar o exercício (loadContentForCurrent) — mesma
  // dica antes e depois de responder, pra não parecer que "mudou de ideia".
  const hint = getHintForIndex(card, s.content && s.content.hintIndex);
  if(!s.revealed){
    return `
    <div class="answer-zone">
      <p style="color:var(--text-muted); font-size:13.5px; text-align:center;">Digite a tradução direta do termo, em português.</p>
      ${renderHintBox(hint)}
      <input type="text" id="lang-input" placeholder="Tradução..." value="${escapeHtml(s.userInput||'')}" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" onkeyup="if(event.key==='Enter') submitFromInput('lang-input'); else state.session.userInput=this.value">
      <div class="action-row">
        <button class="primary-btn" onclick="submitFromInput('lang-input')">Verificar</button>
      </div>
      ${renderDontKnowLangLink()}
    </div>`;
  }
  const r = s.verifyResult;
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct? `✓ Correto${r.explanation ? ` — ${escapeHtml(r.explanation)}` : ''}` : `✕ ${escapeHtml(r.explanation)}`}</div>
      ${renderHintBox(hint)}
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}

function renderTranslateAIExercise(s, card){
  if(!s.revealed){
    return `
    <div class="answer-zone">
      <p style="color:var(--text-muted); font-size:13.5px; text-align:center;">Digite a tradução direta do termo. A IA aceita respostas válidas mesmo que não estejam cadastradas.</p>
      <input type="text" id="lang-input" placeholder="Tradução..." value="${escapeHtml(s.userInput||'')}" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ${s.verifying?'disabled':''} onkeyup="if(event.key==='Enter' && !${s.verifying}) submitFromInput('lang-input'); else state.session.userInput=this.value">
      <div class="action-row">
        <button class="primary-btn" ${s.verifying?'disabled':''} onclick="submitFromInput('lang-input')">${s.verifying ? 'Verificando...' : 'Verificar com IA'}</button>
      </div>
      ${s.verifying ? `<div class="loading-line" style="justify-content:center;"><div class="spinner"></div> Avaliando o sentido da resposta...</div>` : ''}
      ${renderDontKnowLangLink()}
    </div>`;
  }
  const r = s.verifyResult;
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct ? `✓ Correto${r.explanation ? ` — ${escapeHtml(r.explanation)}` : ''}` : `✕ ${escapeHtml(r.explanation)}`}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}

function renderReverseTranslateExercise(s, card){
  const hint = getHintForIndex(card, s.content && s.content.chosenIndex);
  if(!s.revealed){
    return `
    <div class="answer-zone">
      ${renderHintBox(hint)}
      <input type="text" id="lang-input" placeholder="Termo em inglês..." value="${escapeHtml(s.userInput||'')}" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" onkeyup="if(event.key==='Enter') submitFromInput('lang-input'); else state.session.userInput=this.value">
      <div class="action-row">
        <button class="primary-btn" onclick="submitFromInput('lang-input')">Verificar</button>
      </div>
      ${renderDontKnowLangLink()}
    </div>`;
  }
  const r = s.verifyResult;
  return `
  <div class="answer-zone">
    <div class="reveal-zone">
      <div class="feedback-banner ${r.correct?'ok':'no'}">${r.correct? '✓ Correto' : `✕ ${escapeHtml(r.explanation)}`}</div>
      ${renderPointsBadge(s)}
      <div class="action-row"><button class="primary-btn" onclick="nextCard()">Próximo →</button></div>
    </div>
  </div>`;
}

function restartCompletedSession(){
  const previous = state.session;
  if(!previous) return;
  if(previous.mode === 'lang-mixed') startLanguageSession(previous.deckId);
  else if(previous.mode === 'std-mixed') startMixedStandardSession(previous.deckId);
  else startSession(previous.deckId, previous.mode);
}

function renderResultsView(){
  const s = state.session;
  if(!s) return '';
  const total = s.queue.length;
  const accuracy = total ? Math.round((s.correct / total) * 100) : 0;
  const elapsed = Date.now() - s.startTime;
  const avgSec = total ? (elapsed/1000/total) : 0;
  let rank = 'D';
  if(accuracy >= 90 && avgSec < 10) rank = 'S';
  else if(accuracy >= 80) rank = 'A';
  else if(accuracy >= 60) rank = 'B';
  else if(accuracy >= 40) rank = 'C';

  return `
  <div class="results-wrap">
    <div class="eyebrow" style="font-size:11px; letter-spacing:0.1em; color:var(--text-faint); text-transform:uppercase; font-weight:600;">Sessão concluída</div>
    <div class="rank-ring" style="--pct:${accuracy}"><div class="rank-letter">${rank}</div></div>
    <h2 style="margin:0;">${accuracy}% de acerto</h2>
    <div class="results-stats">
      <div class="res-chip"><div class="num mono">${fmtTime(elapsed)}</div><div class="lbl">tempo total</div></div>
      <div class="res-chip"><div class="num mono">${s.correct}/${total}</div><div class="lbl">acertos</div></div>
      <div class="res-chip"><div class="num mono">${avgSec.toFixed(1)}s</div><div class="lbl">média por cartão</div></div>
      <div class="res-chip"><div class="num mono" style="color:var(--success);">🏆 ${s.points||0}</div><div class="lbl">pontos ganhos</div></div>
    </div>
    <div class="action-row">
      <button class="ghost-btn" onclick="backToDeck()">Voltar ao baralho</button>
      <button class="primary-btn" onclick="restartCompletedSession()">Estudar de novo</button>
    </div>
  </div>`;
}
function backToDeck(){
  state.view = 'deck'; state.tab = 'study'; state.session = null;
  render();
}
