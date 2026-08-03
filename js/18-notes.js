/* ============ CADERNO DE NOTAS ============ */
// o TEXTO das notas não fica no Firestore (documento único de 1MB pra tudo do
// usuário) — só metadados (nome, pasta, datas) ficam ali. O conteúdo de verdade
// mora no R2 (mesmo bucket dos EPUBs/imagens), carregado sob demanda quando a
// nota é aberta e guardado aqui em memória enquanto a aba estiver aberta.
let noteContentCache = {};
let noteContentLoading = {};
let noteContentError = {};
// base 10: fica acima do conteúdo normal da página, mas abaixo do modal-overlay
// (z-index 50) e do toast (z-index 100) -- uma nota flutuante nunca deve tampar
// uma caixa de confirmação nem um aviso.
let floatingNoteZCounter = 10;
const noteScrollPositions = Object.create(null);
function rememberNoteScroll(noteId){
  if(!noteId) return;
  const pane=document.querySelector('.notes-editor-panes');
  const rich=document.getElementById('note-editor-plain');
  const textarea=document.getElementById('note-editor-textarea');
  noteScrollPositions[noteId]={pane:pane?.scrollTop||0,rich:rich?.scrollTop||0,textarea:textarea?.scrollTop||0};
}
function restoreNoteScroll(noteId){
  const position=noteScrollPositions[noteId]; if(!position) return;
  requestAnimationFrame(()=>{
    const pane=document.querySelector('.notes-editor-panes');
    const rich=document.getElementById('note-editor-plain');
    const textarea=document.getElementById('note-editor-textarea');
    if(pane) pane.scrollTop=position.pane;
    if(rich) rich.scrollTop=position.rich;
    if(textarea) textarea.scrollTop=position.textarea;
  });
}

/* Estado visual completo do editor. Várias ferramentas da barra abrem menus ou
   modais chamando render(), o que recria o contenteditable. Sem guardar também
   as rolagens internas e a seleção, o navegador leva a nota para o início. */
function captureNoteEditorScrollState(){
  if(state.view!=='notes' || !state.currentNoteId) return null;
  const main=document.querySelector('.main');
  const pane=document.querySelector('.notes-editor-panes');
  const rich=document.getElementById('note-editor-plain');
  const textarea=document.getElementById('note-editor-textarea');
  const scrolling=document.scrollingElement;
  return {
    noteId:state.currentNoteId,
    windowX:window.scrollX||0,
    windowY:window.scrollY||0,
    documentTop:scrolling?.scrollTop||0,
    documentLeft:scrolling?.scrollLeft||0,
    mainTop:main?.scrollTop||0,
    mainLeft:main?.scrollLeft||0,
    paneTop:pane?.scrollTop||0,
    paneLeft:pane?.scrollLeft||0,
    richTop:rich?.scrollTop||0,
    richLeft:rich?.scrollLeft||0,
    textareaTop:textarea?.scrollTop||0,
    textareaLeft:textarea?.scrollLeft||0
  };
}
function restoreNoteEditorScrollState(snapshot){
  if(!snapshot || state.view!=='notes' || state.currentNoteId!==snapshot.noteId) return;
  const restore=()=>{
    if(state.view!=='notes' || state.currentNoteId!==snapshot.noteId) return;
    const main=document.querySelector('.main');
    const pane=document.querySelector('.notes-editor-panes');
    const rich=document.getElementById('note-editor-plain');
    const textarea=document.getElementById('note-editor-textarea');
    const scrolling=document.scrollingElement;
    if(main){ main.scrollTop=snapshot.mainTop; main.scrollLeft=snapshot.mainLeft; }
    if(pane){ pane.scrollTop=snapshot.paneTop; pane.scrollLeft=snapshot.paneLeft; }
    if(rich){ rich.scrollTop=snapshot.richTop; rich.scrollLeft=snapshot.richLeft; }
    if(textarea){ textarea.scrollTop=snapshot.textareaTop; textarea.scrollLeft=snapshot.textareaLeft; }
    if(scrolling){ scrolling.scrollTop=snapshot.documentTop; scrolling.scrollLeft=snapshot.documentLeft; }
    window.scrollTo(snapshot.windowX,snapshot.windowY);
  };
  restore();
  requestAnimationFrame(()=>{ restore(); requestAnimationFrame(restore); });
}
function captureNoteEditorRenderState(){
  const scroll=captureNoteEditorScrollState();
  if(!scroll) return null;
  const rich=document.getElementById('note-editor-plain');
  const textarea=document.getElementById('note-editor-textarea');
  const active=document.activeElement;
  let editorId=null, selection=null, shouldRestoreFocus=false;
  if(textarea){
    editorId=textarea.id;
    if(active===textarea){
      shouldRestoreFocus=true;
      selection={start:textarea.selectionStart||0,end:textarea.selectionEnd||0,direction:textarea.selectionDirection||'none'};
    }
  }else if(rich){
    editorId=rich.id;
    selection=typeof captureRichCursorOffset==='function' ? captureRichCursorOffset() : null;
    shouldRestoreFocus=active===rich || !!selection;
  }
  return {...scroll,editorId,selection,shouldRestoreFocus};
}
function restoreNoteEditorRenderState(snapshot){
  if(!snapshot || state.view!=='notes' || state.currentNoteId!==snapshot.noteId) return;
  const desktopChatOnly=state.modal?.type==='note-chat' && typeof isDesktopLayout==='function' && isDesktopLayout();
  const modalOpen=!!state.noteCorrection || !!state.noteConversationManager || (!!state.modal && !desktopChatOnly);
  const restore=()=>{
    if(state.view!=='notes' || state.currentNoteId!==snapshot.noteId) return;
    restoreNoteEditorScrollState(snapshot);
    if(modalOpen) return;
    const editor=snapshot.editorId && document.getElementById(snapshot.editorId);
    if(!editor) return;
    if(snapshot.selection){
      if(editor.id==='note-editor-textarea'){
        const max=editor.value.length;
        const start=Math.max(0,Math.min(max,snapshot.selection.start||0));
        const end=Math.max(start,Math.min(max,snapshot.selection.end==null?start:snapshot.selection.end));
        try{ editor.setSelectionRange(start,end,snapshot.selection.direction||'none'); }catch(error){}
      }else if(typeof restoreRichCursorOffset==='function'){
        restoreRichCursorOffset(editor,snapshot.selection);
      }
    }
    if(snapshot.shouldRestoreFocus){
      try{ editor.focus({preventScroll:true}); }catch(error){ editor.focus(); }
    }
    restoreNoteEditorScrollState(snapshot);
  };
  restore();
  requestAnimationFrame(()=>{ restore(); requestAnimationFrame(restore); });
}
function getNoteContent(noteId){
  return noteContentCache[noteId] !== undefined ? noteContentCache[noteId] : '';
}
function makeNoteItem(type, name, parentId){
  const item = {
    id: uid(), type, name: (name||'').trim() || (type==='folder' ? 'Nova pasta' : (type==='outline' ? 'Nova escaleta' : 'Nova nota')),
    parentId: parentId || null,
    // Todas as notas novas usam o editor visual de texto normal.
    format: type === 'note' ? 'plain' : undefined,
    linkedDeckId: type === 'note' ? null : undefined,
    icon: type === 'folder' ? '📁' : undefined,
    iconColor: type === 'note' ? '#F5A623' : undefined,
    favorite: false,
    pageSettings: type === 'note' ? { ...DEFAULT_NOTE_PAGE_SETTINGS } : undefined,
    createdAt: Date.now(), updatedAt: Date.now()
  };
  if(type === 'note') noteContentCache[item.id] = ''; // nota nova nasce vazia — não precisa buscar nada no R2
  if(type === 'outline') item.outline={columns:[{id:uid(),name:'Ato I'}],cards:[]};
  return item;
}
function normalizeNoteItem(n){
  const type = n.type === 'folder' ? 'folder' : (n.type === 'outline' ? 'outline' : 'note');
  const rawOutline=n.outline||{};
  const columns=Array.isArray(rawOutline.columns)&&rawOutline.columns.length ? rawOutline.columns.map(c=>({id:c.id||uid(),name:String(c.name||'Ato')})) : [{id:uid(),name:'Ato I'}];
  return {
    id: n.id || uid(),
    type,
    name: n.name || (type==='folder' ? 'Pasta' : 'Nota'),
    parentId: n.parentId || null,
    // A aplicação não oferece mais Markdown: inclusive notas antigas passam
    // a abrir no editor de texto normal.
    format: type === 'note' ? 'plain' : undefined,
    linkedDeckId: type === 'note' ? (n.linkedDeckId || null) : undefined,
    icon: type === 'folder' ? (n.icon || '📁') : undefined,
    iconColor: type === 'note' ? (n.iconColor || '#F5A623') : undefined,
    favorite: type === 'note' && !!n.favorite,
    pageSettings: type === 'note' ? { ...DEFAULT_NOTE_PAGE_SETTINGS, ...(n.pageSettings || {}) } : undefined,
    aiConversations: type === 'note' ? (Array.isArray(n.aiConversations) ? n.aiConversations : []) : undefined,
    outline: type==='outline' ? {columns,cards:(Array.isArray(rawOutline.cards)?rawOutline.cards:[]).map(card=>({id:card.id||uid(),columnId:card.columnId||columns[0].id,title:String(card.title||'Capítulo'),summary:String(card.summary||''),ideas:String(card.ideas||''),status:['ready','writing','todo'].includes(card.status)?card.status:'todo',linkedNoteId:card.linkedNoteId||null,anchor:String(card.anchor||''),checklist:(Array.isArray(card.checklist)?card.checklist:[]).map(x=>({id:x.id||uid(),text:String(x.text||''),done:!!x.done}))}))} : undefined,
    createdAt: n.createdAt || Date.now(),
    updatedAt: n.updatedAt || Date.now()
  };
}
function getNoteConversations(note){
  if(!note) return [];
  if(!Array.isArray(note.aiConversations)) note.aiConversations = [];
  return note.aiConversations;
}
function createNoteConversation(note, type, data){
  const conversation = { id:uid(), type, title:(data && data.title) || (type==='chat' ? 'Nova conversa' : 'Sugestão de texto'), createdAt:Date.now(), updatedAt:Date.now(), favorite:false, messages:[], ...(data||{}) };
  getNoteConversations(note).unshift(conversation);
  saveData();
  return conversation;
}
function saveNoteConversation(note, conversation){
  if(!note || !conversation) return;
  const list = getNoteConversations(note);
  const index = list.findIndex(c=>c.id===conversation.id);
  if(index < 0) return;
  conversation.updatedAt = Date.now();
  list[index] = conversation;
  saveData();
}
function getConversationTitle(conversation){
  if(conversation.title && conversation.title !== 'Nova conversa') return conversation.title;
  const firstUser = (conversation.messages||[]).find(m=>m.role==='user');
  return firstUser ? firstUser.text.slice(0,52) : (conversation.type==='chat' ? 'Nova conversa' : 'Sugestão de texto');
}
// migração de uma versão anterior, que guardava o texto da nota junto com os
// metadados no Firestore: se ainda achar isso nos dados carregados, joga pro
// cache em memória na hora (nada de esperar) e reenvia pro R2 em segundo plano,
// pra da próxima vez em diante o Firestore já vir só com metadados.
function migrateLegacyInlineNoteContent(rawItems){
  (rawItems||[]).forEach(raw => {
    if(raw && raw.type !== 'folder' && typeof raw.content === 'string' && raw.content){
      noteContentCache[raw.id] = raw.content;
      saveNoteContentToR2(raw.id, raw.content);
    }
  });
}
function openNotes(){
  finishReadingActivity();
  finishNotesPresence();
  // O explorador começa compacto sempre que o caderno é aberto. Assim, uma
  // árvore grande não ocupa a tela inteira e cada pasta só mostra o conteúdo
  // quando a pessoa decidir expandi-la.
  state.notesCollapsedFolders = state.notesItems
    .filter(item => item.type === 'folder')
    .map(item => item.id);
  state.view = 'notes';
  // No desktop o chat é um painel fixo de trabalho: voltar ao explorador ou
  // trocar de nota não o fecha. No celular ele continua sendo uma janela.
  if(state.modal?.type==='note-chat' && !isDesktopLayout()) state.modal=null;
  // Reabre a última nota editada (se ela ainda existir) em vez de sempre cair
  // no explorador -- entrar na aba Notas deve continuar de onde a pessoa
  // parou. Se a nota sumiu (excluída em outro aparelho, por exemplo) ou
  // nunca houve uma, cai no explorador como antes; a nota também tem sua
  // própria tela de erro com botão de "tentar de novo" caso o carregamento
  // do conteúdo falhe, então reabrir automaticamente não trava mais a aba.
  const lastNote = state.lastNoteId && state.notesItems.find(item=>item.id===state.lastNoteId && item.type==='note');
  if(lastNote){
    openNote(lastNote.id);
  }else{
    state.currentNoteId = null;
    startNotesPresence(null);
    render();
  }
}
function startNotesExplorerResize(event){
  if(window.matchMedia('(max-width:820px)').matches) return;
  event.preventDefault();
  const explorer = document.querySelector('.notes-explorer');
  const startX = event.clientX, startWidth = explorer ? explorer.getBoundingClientRect().width : 250;
  const move = e => { document.documentElement.style.setProperty('--notes-explorer-width', `${Math.max(190, Math.min(480, startWidth + e.clientX-startX))}px`); };
  const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}
function startNotesChatResize(event){
  if(!isDesktopLayout()) return;
  event.preventDefault();
  const panel=document.querySelector('.desktop-note-chat');
  const startX=event.clientX, startWidth=panel ? panel.getBoundingClientRect().width : (state.notesChatWidth||340);
  const move=e=>{
    state.notesChatWidth=Math.max(280,Math.min(560,startWidth-(e.clientX-startX)));
    if(panel) panel.style.width=`${state.notesChatWidth}px`;
  };
  const up=()=>{ document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); saveData(); };
  document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
}
function toggleNotesChatPanel(){
  if(!isDesktopLayout()) return;
  state.notesChatHidden=!state.notesChatHidden;
  saveData(); render();
}
function openNotesCreateModal(parentId, kind){
  state.modal = { type:'new-note-item', kind: kind || 'note', name:'', format:'plain', parentId: parentId || null };
  render();
}
function focusQuickCommandInput(){
  requestAnimationFrame(()=>{
    const input=document.getElementById('quick-command-input');
    if(!input) return;
    input.focus();
    const position=input.value.length;
    try{ input.setSelectionRange(position,position); }catch(e){}
  });
}
// No desktop o chat da nota é um painel lateral, mas usa o mesmo estado de
// modal. Guardamos esse painel enquanto a paleta rápida está aberta para que
// Option/Alt + Espaço continue funcionando sem "fechar" o chat.
let suspendedEmbeddedNoteChat = null;
function openQuickCommand(){
  if(isDesktopLayout() && state.modal?.type==='note-chat') suspendedEmbeddedNoteChat = state.modal;
  state.modal = { type:'quick-command', query:'' };
  render(); focusQuickCommandInput();
}
function runQuickCommand(query){
  const q = String(query||'').trim(), lower=q.toLowerCase();
  if(!q) return;
  if(lower === 'chat'){ suspendedEmbeddedNoteChat=null; state.modal=null; openNoteChat(); return; }
  if(lower === 'nota'){ suspendedEmbeddedNoteChat=null; state.modal=null; openNotesCreateModal(null,'note'); return; }
  const note = state.notesItems.find(n=>n.type==='note' && n.name.toLowerCase()===lower);
  if(note){ suspendedEmbeddedNoteChat=null; state.modal=null; state.view='notes'; openNote(note.id); }
}
document.addEventListener('keydown', e => {
  if(e.altKey && e.code==='Space'){
    e.preventDefault();
    if(!state.modal || (isDesktopLayout() && state.modal.type==='note-chat')) openQuickCommand();
    else if(state.modal.type==='quick-command') focusQuickCommandInput();
  }
});
document.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && e.key==='\\'){
    e.preventDefault();
    toggleSidebarAutoHide();
  }
});
function confirmCreateNoteItem(){
  const m = state.modal;
  const name = (m.name||'').trim();
  if(!name){ showToast('Dê um nome pra continuar.', 'error'); return; }
  const item = makeNoteItem(m.kind, name, m.parentId);
  state.notesItems.push(item);
  state.modal = null;
  if(m.kind === 'note' || m.kind === 'outline'){ state.currentNoteId = item.id; if(m.kind==='note') state.lastNoteId = item.id; state.notesEditorMode = state.notesEditorMode || 'split'; }
  else {
    // Pastas novas seguem o mesmo padrão do explorador: começam fechadas.
    const collapsed = state.notesCollapsedFolders || (state.notesCollapsedFolders=[]);
    if(!collapsed.includes(item.id)) collapsed.push(item.id);
  }
  saveData(); render();
}
function toggleNotesFolder(id){
  const list = state.notesCollapsedFolders || (state.notesCollapsedFolders=[]);
  const idx = list.indexOf(id);
  if(idx===-1){
    // Ao abrir uma pasta, suas subpastas continuam fechadas até receberem um
    // clique próprio. Evita que uma árvore inteira se expanda de uma vez.
    list.push(id);
  }else{
    list.splice(idx,1);
    getNoteDescendantIds(id).forEach(childId => {
      const child = state.notesItems.find(item=>item.id===childId);
      if(child && child.type==='folder' && !list.includes(childId)) list.push(childId);
    });
  }
  render();
}
function closeCurrentNote(){
  finishNotesPresence();
  state.currentNoteId = null;
  state.noteFindReplace = null;
  render();
}
