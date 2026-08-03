/* ============ MODO ESCALETA ATIVA ============
   Só uma escaleta pode estar ativa por vez -- activeOutlineId é um valor
   único, então ativar uma nova já desativa a anterior sozinho, sem precisar
   de nenhuma limpeza extra. */
function toggleActiveOutline(outlineId){
  const outline = state.notesItems.find(n=>n.id===outlineId && n.type==='outline');
  if(!outline) return;
  const wasActive = state.activeOutlineId === outlineId;
  state.activeOutlineId = wasActive ? null : outlineId;
  if(!state.activeOutlineId) state.activeOutlinePanelOpen = false; // desativou -- sai do modo painel também
  saveData(); render();
  showToast(wasActive ? `"${outline.name}" desativada.` : `"${outline.name}" ativada como escaleta ativa.`);
}
/* Visualização de LEITURA da escaleta ativa (não é a mesma tela do quadro
   kanban): lista vertical dos atos em ordem, cada um com seus capítulos —
   pensada pra consultar rapidamente enquanto se escreve outra nota, sem o
   scroll horizontal do quadro. Clicar num capítulo com nota vinculada abre
   essa nota (reaproveita openOutlineCardNote, mesmo comportamento do quadro). */
function renderActiveOutlineReadView(outline){
  const data = getOutlineData(outline);
  const labels = {todo:'Para escrever', writing:'Escrevendo', ready:'Pronto'};
  return `<div class="active-outline-acts">${data.columns.map(column=>{
    const cards = data.cards.filter(card=>card.columnId===column.id);
    return `<section class="active-outline-act">
      <h4>${escapeHtml(column.name)} <span style="color:var(--text-faint); font-weight:400;">${cards.length}</span></h4>
      ${cards.length ? cards.map(card=>`
      <div class="active-outline-chapter" ${card.linkedNoteId?`onclick="openOutlineCardNote('${outline.id}','${card.id}')" role="button" tabindex="0"`:''} title="${card.linkedNoteId?'Abrir capítulo vinculado':''}">
        <div class="active-outline-chapter-title">${escapeHtml(card.title)}${card.linkedNoteId?' ↗':''}</div>
        <span class="outline-status ${escapeHtml(card.status)}">${labels[card.status]||labels.todo}</span>
        ${card.summary ? `<div class="active-outline-chapter-summary">${escapeHtml(card.summary)}</div>` : ''}
        ${(card.checklist||[]).length?`<ul class="outline-checklist" onclick="event.stopPropagation()">${card.checklist.map(item=>`<li><label><input type="checkbox" ${item.done?'checked':''} onchange="toggleOutlineChecklist('${outline.id}','${card.id}','${item.id}')"> <span style="${item.done?'text-decoration:line-through; opacity:.65;':''}">${escapeHtml(item.text)}</span></label></li>`).join('')}</ul>`:''}
      </div>`).join('') : `<p style="font-size:11.5px; color:var(--text-faint); margin:0 0 10px;">Nenhum capítulo neste ato ainda.</p>`}
    </section>`;
  }).join('')}</div>`;
}
/* Abre a visualização da escaleta ativa: no celular, um modal em tela cheia
   (memoriza a posição de leitura pra reabrir no mesmo ponto); no desktop, o
   MESMO botão alterna o painel lateral entre o Chat da IA e a escaleta (ver
   renderActiveOutlinePanel() no shell do render()). */
function toggleActiveOutlineView(){
  if(!state.activeOutlineId){ showToast('Nenhuma escaleta ativa. Ative uma pela árvore de notas (ícone 🎯).', 'error'); return; }
  const outline = state.notesItems.find(n=>n.id===state.activeOutlineId && n.type==='outline');
  if(!outline){ showToast('A escaleta ativa não existe mais.', 'error'); state.activeOutlineId=null; saveData(); render(); return; }
  if(isDesktopLayout()){
    state.activeOutlinePanelOpen = !state.activeOutlinePanelOpen;
    if(state.activeOutlinePanelOpen) state.notesChatHidden = false; // garante que o painel fique visível
    render();
    return;
  }
  state.modal = {type:'active-outline-view', outlineId: outline.id};
  render(); // a restauração da posição de leitura acontece dentro do próprio render()
}
function closeActiveOutlineView(){
  const m = state.modal;
  if(m && m.type==='active-outline-view'){
    const el = document.querySelector('.active-outline-view-scroll');
    state.activeOutlineScroll = { outlineId: m.outlineId, top: el ? el.scrollTop : 0 };
  }
  state.modal = null;
  saveData(); render();
}
function renderActiveOutlineViewModal(m){
  const outline = state.notesItems.find(n=>n.id===m.outlineId && n.type==='outline');
  return `<div class="active-outline-view">
    <div class="active-outline-view-header">
      <strong>🧩 ${escapeHtml(outline ? outline.name : 'Escaleta')}</strong>
      <button class="icon-btn" title="Fechar" onclick="closeActiveOutlineView()">✕</button>
    </div>
    <div class="active-outline-view-scroll">${outline ? renderActiveOutlineReadView(outline) : `<p style="color:var(--text-faint); font-size:13px;">Essa escaleta não existe mais.</p>`}</div>
  </div>`;
}
function renderActiveOutlinePanel(){
  const outline = state.notesItems.find(n=>n.id===state.activeOutlineId && n.type==='outline');
  if(!outline){
    state.activeOutlineId = null; state.activeOutlinePanelOpen = false;
    return `<div style="padding:16px; font-size:12.5px; color:var(--text-faint);">A escaleta ativa não existe mais.</div>`;
  }
  return `<div style="display:flex; flex-direction:column; height:100%; margin:-14px; width:calc(100% + 28px);">
    <div class="active-outline-view-header" style="padding:10px 14px;">
      <strong style="font-size:12.5px;">🧩 ${escapeHtml(outline.name)}</strong>
      <button class="icon-btn" style="width:24px; height:24px; font-size:11px;" title="Voltar ao chat" onclick="toggleActiveOutlineView()">✕</button>
    </div>
    <div class="active-outline-view-scroll" style="padding:14px;">${renderActiveOutlineReadView(outline)}</div>
  </div>`;
}
function renderOutlineEditor(outline){
  const data=getOutlineData(outline);
  const labels={todo:'Para escrever',writing:'Escrevendo',ready:'Pronto'};
  return `<button class="ghost-btn mobile-back-btn" onclick="closeCurrentNote()">← Notas</button><div class="notes-editor-header"><div><h3 style="margin:0;">🧩 ${escapeHtml(outline.name)}</h3><div class="note-writing-stats">Escaleta · atos e capítulos do livro</div></div><button class="primary-btn" onclick="openOutlineColumnModal('${outline.id}')">＋ Ato</button></div><div class="outline-board">${data.columns.map(column=>{ const cards=data.cards.filter(card=>card.columnId===column.id); return `<section class="outline-column"><div class="outline-column-head"><h4>${escapeHtml(column.name)} <span style="color:var(--text-faint); font-weight:400;">${cards.length}</span></h4><div><button class="icon-btn" style="width:24px;height:24px;font-size:11px;" title="Renomear ato" onclick="openOutlineColumnModal('${outline.id}','${column.id}')">✏️</button><button class="icon-btn" style="width:24px;height:24px;font-size:11px;" title="Excluir ato" onclick="deleteOutlineColumn('${outline.id}','${column.id}')">🗑</button></div></div><div class="outline-dropzone" ondragover="outlineDragOver(event)" ondragleave="outlineDragLeave(event)" ondrop="dropOutlineCard(event,'${outline.id}','${column.id}')">${cards.map(card=>`<article class="outline-card" draggable="true" ondragstart="dragOutlineCard(event,'${outline.id}','${card.id}')" onclick="openOutlineCardModal('${outline.id}','${card.id}')"><div class="outline-card-title">${escapeHtml(card.title)}</div><div class="outline-card-summary">${escapeHtml(card.summary||card.ideas||'Sem resumo ainda.')}</div><span class="outline-status ${escapeHtml(card.status)}">${labels[card.status]||labels.todo}</span>${(card.checklist||[]).length?`<ul class="outline-checklist" onclick="event.stopPropagation()">${card.checklist.map(item=>`<li><label><input type="checkbox" ${item.done?'checked':''} onchange="toggleOutlineChecklist('${outline.id}','${card.id}','${item.id}')"> <span style="${item.done?'text-decoration:line-through; opacity:.65;':''}">${escapeHtml(item.text)}</span></label></li>`).join('')}</ul>`:''}${card.linkedNoteId?`<button class="ghost-btn outline-card-link" onclick="event.stopPropagation(); openOutlineCardNote('${outline.id}','${card.id}')">↗ Abrir capítulo</button>`:''}<input class="outline-add-topic" placeholder="＋ Adicionar tópico e Enter" onclick="event.stopPropagation()" onkeydown="addOutlineChecklistItem(event,'${outline.id}','${card.id}')"></article>`).join('')}<button class="ghost-btn" style="width:100%; font-size:12px;" onclick="openOutlineCardModal('${outline.id}',null,'${column.id}')">＋ Capítulo</button></div></section>`; }).join('')}<button class="outline-add-column" onclick="openOutlineColumnModal('${outline.id}')">＋ Adicionar ato</button></div>`;
}
/* --- arrastar notas/pastas pra reorganizar: soltar em cima de uma pasta move
   pra dentro dela, soltar no fundo da árvore (fora de qualquer pasta) move
   pra raiz. --- */
let draggedNoteItemId = null;
function onNoteDragStart(e, id){
  draggedNoteItemId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
}
function onNoteDragOverFolder(e, folderId){
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function onNoteDragLeaveFolder(e){
  e.currentTarget.classList.remove('drag-over');
}
function onNoteDropOnFolder(e, folderId){
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  const id = draggedNoteItemId || e.dataTransfer.getData('text/plain');
  draggedNoteItemId = null;
  moveNoteItemToParent(id, folderId);
}
function onNoteDropOnRoot(e){
  e.preventDefault();
  const id = draggedNoteItemId || e.dataTransfer.getData('text/plain');
  draggedNoteItemId = null;
  moveNoteItemToParent(id, null);
}
function isNoteDescendantOf(candidateId, ancestorId){
  let current = state.notesItems.find(n=>n.id===candidateId);
  while(current && current.parentId){
    if(current.parentId === ancestorId) return true;
    current = state.notesItems.find(n=>n.id===current.parentId);
  }
  return false;
}
function moveNoteItemToParent(id, newParentId){
  if(!id) return;
  const item = state.notesItems.find(n=>n.id===id);
  if(!item) return;
  if(item.parentId === newParentId) return;
  if(newParentId){
    if(item.id === newParentId || (item.type==='folder' && isNoteDescendantOf(newParentId, id))){
      showToast('Não dá pra mover uma pasta pra dentro dela mesma.', 'error');
      return;
    }
  }
  item.parentId = newParentId;
  item.updatedAt = Date.now();
  saveData(); render();
  showToast('Movido.');
}
function openNotesRenameModal(id){
  const item = state.notesItems.find(n=>n.id===id);
  if(!item) return;
  state.modal = { type:'rename-note-item', id, name: item.name };
  render();
}
function confirmRenameNoteItem(){
  const m = state.modal;
  const item = state.notesItems.find(n=>n.id===m.id);
  const name = (m.name||'').trim();
  if(!item || !name) return;
  item.name = name;
  item.updatedAt = Date.now();
  state.modal = null;
  saveData(); render();
}
function setNoteItemIcon(id, icon){
  const item = state.notesItems.find(n=>n.id===id);
  if(!item) return;
  item.icon = icon;
  item.updatedAt = Date.now();
  saveData(); render();
}
function setNoteItemColor(id, color){
  const item = state.notesItems.find(n=>n.id===id && n.type==='note');
  if(!item) return;
  item.iconColor = color;
  item.updatedAt = Date.now();
  saveData(); render();
}
function toggleNoteFavorite(id){
  const item = state.notesItems.find(n=>n.id===id && n.type==='note');
  if(!item) return;
  item.favorite = !item.favorite; item.updatedAt=Date.now(); saveData(); render();
}
