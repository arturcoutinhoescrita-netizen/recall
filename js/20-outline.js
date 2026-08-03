/* ============ ESCALETA ============ */
function getOutlineData(outline){
  if(!outline.outline) outline.outline={columns:[{id:uid(),name:'Ato I'}],cards:[]};
  if(!Array.isArray(outline.outline.columns)||!outline.outline.columns.length) outline.outline.columns=[{id:uid(),name:'Ato I'}];
  if(!Array.isArray(outline.outline.cards)) outline.outline.cards=[];
  return outline.outline;
}
function saveOutline(outline){ outline.updatedAt=Date.now(); saveData(); render(); }
function openOutlineColumnModal(outlineId, columnId){
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); if(!outline) return;
  const column=columnId&&getOutlineData(outline).columns.find(item=>item.id===columnId);
  state.modal={type:'outline-column',outlineId,columnId:column?.id||null,name:column?.name||''}; render();
}
function confirmOutlineColumn(){
  const m=state.modal, outline=state.notesItems.find(item=>item.id===m?.outlineId&&item.type==='outline');
  const name=String(m?.name||'').trim().slice(0,60); if(!outline||!name){ showToast('Dê um nome ao ato.', 'error'); return; }
  const data=getOutlineData(outline), existing=data.columns.find(item=>item.id===m.columnId);
  if(existing) existing.name=name; else data.columns.push({id:uid(),name});
  state.modal=null; saveOutline(outline);
}
function deleteOutlineColumn(outlineId,columnId){
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); if(!outline) return;
  const data=getOutlineData(outline); if(data.columns.length<=1){ showToast('A escaleta precisa ter ao menos um ato.', 'error'); return; }
  const target=data.columns.find(item=>item.id===columnId); if(!target) return;
  askConfirm(`Excluir “${target.name}”? Os capítulos irão para o primeiro ato.`,()=>{
    const fallback=data.columns.find(item=>item.id!==columnId);
    data.cards.forEach(card=>{ if(card.columnId===columnId) card.columnId=fallback.id; });
    data.columns=data.columns.filter(item=>item.id!==columnId); saveOutline(outline);
  },'Excluir ato');
}
function openOutlineCardModal(outlineId, cardId, columnId){
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); if(!outline) return;
  const data=getOutlineData(outline), card=cardId&&data.cards.find(item=>item.id===cardId);
  state.modal={type:'outline-card',outlineId,cardId:card?.id||null,columnId:card?.columnId||columnId||data.columns[0].id,title:card?.title||'',summary:card?.summary||'',ideas:card?.ideas||'',status:card?.status||'todo',linkedNoteId:card?.linkedNoteId||'',anchor:card?.anchor||'',checklistText:(card?.checklist||[]).map(item=>item.text).join('\n')}; render();
}
function confirmOutlineCard(){
  const m=state.modal, outline=state.notesItems.find(item=>item.id===m?.outlineId&&item.type==='outline');
  const title=String(m?.title||'').trim().slice(0,120); if(!outline||!title){ showToast('Dê um título ao capítulo.', 'error'); return; }
  const data=getOutlineData(outline); const checklist=String(m.checklistText||'').split('\n').map(text=>text.trim()).filter(Boolean).slice(0,30).map((text,index)=>{
    const old=(data.cards.find(card=>card.id===m.cardId)?.checklist||[])[index]; return {id:old?.id||uid(),text,done:!!old?.done};
  });
  const value={title,summary:String(m.summary||'').slice(0,1200),ideas:String(m.ideas||'').slice(0,1600),status:['ready','writing','todo'].includes(m.status)?m.status:'todo',columnId:m.columnId,linkedNoteId:m.linkedNoteId||null,anchor:String(m.anchor||'').trim().slice(0,180),checklist};
  const card=data.cards.find(item=>item.id===m.cardId);
  if(card) Object.assign(card,value); else data.cards.push({id:uid(),...value});
  state.modal=null; saveOutline(outline);
}
function deleteOutlineCard(outlineId,cardId){
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); if(!outline) return;
  getOutlineData(outline).cards=getOutlineData(outline).cards.filter(card=>card.id!==cardId); saveOutline(outline);
}
function dragOutlineCard(event,outlineId,cardId){ event.dataTransfer.setData('text/plain',`${outlineId}:${cardId}`); event.dataTransfer.effectAllowed='move'; }
function outlineDragOver(event){ event.preventDefault(); event.currentTarget.classList.add('drag-over'); }
function outlineDragLeave(event){ event.currentTarget.classList.remove('drag-over'); }
function dropOutlineCard(event,outlineId,columnId){
  event.preventDefault(); event.currentTarget.classList.remove('drag-over');
  const [fromOutlineId,cardId]=String(event.dataTransfer.getData('text/plain')||'').split(':');
  if(fromOutlineId!==outlineId||!cardId) return;
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); const card=outline&&getOutlineData(outline).cards.find(item=>item.id===cardId);
  if(!card) return; card.columnId=columnId; saveOutline(outline);
}
function toggleOutlineChecklist(outlineId,cardId,itemId){
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); const card=outline&&getOutlineData(outline).cards.find(item=>item.id===cardId); const item=card&&(card.checklist||[]).find(entry=>entry.id===itemId);
  if(!item) return; item.done=!item.done; saveOutline(outline);
}
function addOutlineChecklistItem(event,outlineId,cardId){
  if(event.key!=='Enter') return; event.preventDefault(); const text=event.currentTarget.value.trim(); if(!text) return;
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline'); const card=outline&&getOutlineData(outline).cards.find(item=>item.id===cardId); if(!card) return;
  card.checklist=card.checklist||[]; card.checklist.push({id:uid(),text:text.slice(0,180),done:false}); saveOutline(outline);
}
function openOutlineCardNote(outlineId,cardId){
  const outline=state.notesItems.find(item=>item.id===outlineId&&item.type==='outline');
  const card=outline&&getOutlineData(outline).cards.find(item=>item.id===cardId);
  if(!card?.linkedNoteId){ showToast('Vincule uma nota ao capítulo primeiro.', 'error'); return; }
  state.pendingOutlineAnchor={noteId:card.linkedNoteId,anchor:String(card.anchor||'').trim()}; openNote(card.linkedNoteId);
}
function focusPendingOutlineAnchor(){
  const pending=state.pendingOutlineAnchor; if(!pending||pending.noteId!==state.currentNoteId) return;
  state.pendingOutlineAnchor=null;
  if(!pending.anchor){ showToast('Nota aberta. Informe o texto inicial do capítulo no vínculo para ir ao ponto exato.'); return; }
  setTimeout(()=>{ try{ if(!window.find(pending.anchor,false,false,true,false,false,false)) showToast('Nota aberta, mas não encontrei o texto inicial do capítulo.'); }catch(e){} },80);
}
