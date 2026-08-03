/* ============ ROTINA ============ */
const ROUTINE_CHECKIN_MS = 2 * 60 * 60 * 1000;
const ROUTINE_DEFAULT_ACTIONS = [
  {id:'shower',icon:'🚿',title:'Banho'}, {id:'breakfast',icon:'🥣',title:'Café da manhã'},
  {id:'lunch',icon:'🍽️',title:'Almoço'}, {id:'dinner',icon:'🍲',title:'Jantar'},
  {id:'work',icon:'💼',title:'Trabalho'}, {id:'study',icon:'📚',title:'Estudo'},
  {id:'exercise',icon:'🏃',title:'Exercício'}, {id:'walk',icon:'🚶',title:'Caminhada'},
  {id:'transport',icon:'🚌',title:'Deslocamento'}, {id:'cooking',icon:'👩‍🍳',title:'Cozinhar'},
  {id:'cleaning',icon:'🧹',title:'Limpeza'}, {id:'meditation',icon:'🧘',title:'Meditação'},
  {id:'rest',icon:'🛋️',title:'Descanso'}, {id:'leisure',icon:'🎮',title:'Lazer'},
  {id:'medicine',icon:'💊',title:'Medicamentos'}, {id:'sleep',icon:'😴',title:'Sono'}
];
let routineTimer = null;
function getRoutineActions(){ return [...ROUTINE_DEFAULT_ACTIONS,...(state.routineActivities||[])]; }
function formatRoutineElapsed(startedAt){
  const total=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
  const hours=Math.floor(total/3600), minutes=Math.floor((total%3600)/60), seconds=total%60;
  return `${hours?`${String(hours).padStart(2,'0')}:`:''}${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
function routineTimeLabel(timestamp){ return new Date(timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function recordRoutineActivity(activity, startedAt, endedAt, source){
  const start=Math.max(0,Number(startedAt)||Date.now()), end=Math.max(start,Number(endedAt)||Date.now());
  const durationMs=Math.max(1000,end-start);
  state.activities.unshift({id:uid(),type:'routine',at:start,durationMs,title:activity.title,icon:activity.icon||'✅',routineId:activity.id,startedAt:start,endedAt:end,source:source||'timer'});
  state.activities=state.activities.slice(0,ACTIVITY_HISTORY_LIMIT);
  state.agendaEvents.unshift({id:uid(),title:`${activity.icon||'✅'} ${activity.title}`,date:agendaDateKey(start),time:new Date(start).toTimeString().slice(0,5),endTime:new Date(end).toTimeString().slice(0,5),notes:`Rotina concluída · ${routineTimeLabel(start)}–${routineTimeLabel(end)} · ${formatActivityDuration(durationMs)}`,completedAt:end,source:'routine',routineId:activity.id,createdAt:end,updatedAt:end});
}
function startRoutineActivity(id){
  const activity=getRoutineActions().find(item=>item.id===id); if(!activity) return;
  if(state.routineActive && state.routineActive.id===id){ stopRoutineActivity(); return; }
  if(state.routineActive) stopRoutineActivity(false);
  state.routineActive={id:activity.id,title:activity.title,icon:activity.icon||'✅',startedAt:Date.now()};
  saveData(); ensureRoutineTimer(); render();
}
function stopRoutineActivity(showMessage=true){
  const active=state.routineActive; if(!active) return;
  const endedAt=Date.now();
  recordRoutineActivity(active,active.startedAt,endedAt,'timer');
  state.routineActive=null; saveData(); render();
  if(showMessage) showToast(`${active.title} registrado na agenda.`);
}
function pauseRoutineActivity(showMessage=true){
  const active=state.routineActive;
  if(!active) return false;
  // Pausar encerra o trecho atual e o mantém registrado; retomar depois inicia
  // um novo trecho, sem contabilizar o intervalo de pausa como atividade.
  stopRoutineActivity(false);
  if(showMessage) showToast(`${active.title} pausada e registrada até agora.`);
  return true;
}
function ensureRoutineTimer(){
  if(routineTimer) return;
  routineTimer=setInterval(()=>{
    syncRoutineTimerDisplay();
  },1000);
}
function syncRoutineTimerDisplay(){
  if(state.view!=='routine'||!state.routineActive) return;
  const elapsed=formatRoutineElapsed(state.routineActive.startedAt);
  document.querySelectorAll('[data-routine-elapsed]').forEach(el=>{ el.textContent=elapsed; });
}
function openRoutine(){
  finishReadingActivity(); finishWritingActivity();
  state.view='routine'; ensureRoutineTimer();
  const now=Date.now();
  if(!state.routineLastCheckInAt){ state.routineLastCheckInAt=now; saveData(); render(); return; }
  if(now-state.routineLastCheckInAt>=ROUTINE_CHECKIN_MS){
    state.modal={type:'routine-catchup',input:'',sending:false,from:state.routineLastCheckInAt,to:now}; render(); return;
  }
  render();
}
function openRoutineActionModal(){ state.modal={type:'routine-action',title:'',icon:'✨'}; render(); }
function confirmRoutineAction(){
  const m=state.modal, title=String(m?.title||'').trim(); if(!title){ showToast('Dê um nome para a atividade.', 'error'); return; }
  state.routineActivities.push({id:uid(),title:title.slice(0,60),icon:String(m.icon||'✅').trim().slice(0,4)||'✅'});
  state.modal=null; saveData(); render();
}
function normalizeRoutineTitle(title){ return String(title||'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' '); }
function ensureRoutineShortcut(activity){
  const title=String(activity?.title||'Atividade').trim().slice(0,60)||'Atividade';
  const existing=getRoutineActions().find(item=>normalizeRoutineTitle(item.title)===normalizeRoutineTitle(title));
  if(existing) return existing;
  const created={id:uid(),title,icon:String(activity?.icon||'✅').trim().slice(0,4)||'✅'};
  state.routineActivities.push(created);
  return created;
}
function makeRoutineFallbackFromReport(report, from, to){
  const text=String(report||'').trim();
  const normalized=text.toLocaleLowerCase('pt-BR');
  let title='Atividade registrada'; let icon='✅';
  if(/desenvolv/.test(normalized)&&/(software|program|c[oó]digo|app)/.test(normalized)){ title='Desenvolver software'; icon='💻'; }
  else if(/trabalh/.test(normalized)){ title='Trabalho'; icon='💼'; }
  else if(/estud/.test(normalized)){ title='Estudo'; icon='📚'; }
  else if(/leit|li /i.test(normalized)){ title='Leitura'; icon='📖'; }
  else if(/caminh/.test(normalized)){ title='Caminhada'; icon='🚶'; }
  else if(/exerc|academ/.test(normalized)){ title='Exercício'; icon='🏃'; }
  else if(/almo[cç]|jantar|cafe da manh/.test(normalized)){ title='Refeição'; icon='🍽️'; }
  return {title,icon,startedAt:from,endedAt:to};
}
function skipRoutineCatchup(){ state.routineLastCheckInAt=Date.now(); state.modal=null; saveData(); render(); }
function extractRoutineJson(text){
  const clean=String(text||'').replace(/```json|```/g,'').trim();
  const match=clean.match(/\{[\s\S]*\}/); return JSON.parse(match?match[0]:clean);
}
async function submitRoutineCatchup(){
  const m=state.modal, report=String(m?.input||'').trim(); if(!report){ showToast('Conte brevemente o que você fez.', 'error'); return; }
  if(!getApiKey()){ showToast('Configure a chave da IA para registrar o relato.', 'error'); return; }
  m.sending=true; render();
  try{
    const prompt=`Você organiza rotina pessoal. Converta o relato em atividades concluídas. Janela: de ${new Date(m.from).toLocaleString('pt-BR')} até ${new Date(m.to).toLocaleString('pt-BR')}. Relato: "${report}". Responda APENAS JSON: {"activities":[{"title":"atividade curta","icon":"emoji","startedAt":"ISO 8601 dentro da janela","endedAt":"ISO 8601 dentro da janela"}]}. Se horários não foram ditos, distribua estimativas razoáveis dentro da janela; no máximo 6 atividades.`;
    const parsed=extractRoutineJson(await callGemini(prompt,{maxTokens:700,responseMimeType:'application/json'}));
    const parsedItems=Array.isArray(parsed.activities)?parsed.activities.slice(0,6):[];
    // O relato nunca deve desaparecer se a IA devolver uma resposta incompleta.
    // Nesse caso registramos uma única atividade cobrindo a janela informada.
    const items=parsedItems.length ? parsedItems : [makeRoutineFallbackFromReport(report,m.from,m.to)];
    items.forEach((item,index)=>{
      const fallbackStart=m.from+index*Math.max(60000,Math.floor((m.to-m.from)/Math.max(1,items.length)));
      const start=Date.parse(item.startedAt); const end=Date.parse(item.endedAt);
      const activity=ensureRoutineShortcut({title:String(item.title||'Atividade').slice(0,60),icon:String(item.icon||'✅').slice(0,4)});
      recordRoutineActivity(activity,Number.isFinite(start)?start:fallbackStart,Number.isFinite(end)?end:Math.min(m.to,fallbackStart+30*60000),'ai-checkin');
    });
    state.routineLastCheckInAt=Date.now(); state.modal=null; saveData(); render();
    showToast(items.length?`${items.length} atividade(s) registrada(s) na agenda.`:'Não encontrei atividades para registrar.');
  }catch(err){
    // Mesmo se a resposta estruturada da IA falhar, o relato do usuário é
    // valioso: registramos uma atividade simples, em vez de descartá-lo.
    console.error(err);
    const activity=ensureRoutineShortcut(makeRoutineFallbackFromReport(report,m.from,m.to));
    recordRoutineActivity(activity,m.from,m.to,'ai-checkin-fallback');
    state.routineLastCheckInAt=Date.now(); state.modal=null; saveData(); render();
    showToast(`${activity.title} foi registrado na Agenda.`);
  }
}
function renderRoutineView(){
  const active=state.routineActive;
  const query=normalizeRoutineTitle(state.routineSearch);
  const matches=item=>!query||normalizeRoutineTitle(`${item.title} ${item.icon}`).includes(query);
  const actions=getRoutineActions().filter(matches);
  const history=state.activities.filter(item=>item.type==='routine').filter(matches).slice(0,24);
  return `<div style="max-width:980px; margin:0 auto;"><button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Menu</button><div class="deck-header" style="margin-bottom:14px;"><div><h2 style="margin:0 0 5px;">🌿 Rotina</h2><p>Toque em uma atividade para iniciar; toque novamente para encerrar e registrar na Agenda.</p></div><button class="primary-btn" onclick="openRoutineActionModal()">＋ Criar atividade</button></div>${active?`<div class="routine-active-banner"><div><strong>${escapeHtml(active.icon)} ${escapeHtml(active.title)}</strong><div style="font-size:12px; color:var(--text-muted); margin-top:3px;">Em andamento desde ${routineTimeLabel(active.startedAt)} · <span class="mono" data-routine-elapsed>${formatRoutineElapsed(active.startedAt)}</span></div></div><button class="primary-btn" onclick="stopRoutineActivity()">✓ Concluir</button></div>`:''}<div style="margin:0 0 12px;"><input type="search" value="${escapeHtml(state.routineSearch||'')}" placeholder="Pesquisar atividades e registros…" aria-label="Pesquisar atividades de rotina" oninput="state.routineSearch=this.value; render()"></div><div class="routine-grid">${actions.map(item=>`<button class="routine-action ${active?.id===item.id?'active':''}" onclick="startRoutineActivity('${item.id}')"><span class="routine-action-icon">${escapeHtml(item.icon)}</span><span class="routine-action-name">${escapeHtml(item.title)}</span><span class="routine-action-time" ${active?.id===item.id?'data-routine-elapsed':''}>${active?.id===item.id?formatRoutineElapsed(active.startedAt):'Iniciar'}</span></button>`).join('')||`<p style="color:var(--text-faint); font-size:13px;">Nenhuma atividade encontrada.</p>`}</div><div style="margin-top:22px;"><h3 style="font-size:15px; margin:0 0 8px;">Registros recentes</h3>${history.length?`<div style="display:flex; flex-direction:column; gap:6px; max-height:430px; overflow-y:auto; padding-right:3px;">${history.map(item=>`<div class="agenda-card" style="margin:0; display:flex; justify-content:space-between; gap:10px;"><span>${escapeHtml(item.icon||'✅')} <strong>${escapeHtml(item.title||'Atividade')}</strong></span><span class="agenda-meta">${new Date(item.at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} · ${routineTimeLabel(item.startedAt||item.at)}–${routineTimeLabel(item.endedAt||(item.at+(item.durationMs||0)))} · ${formatActivityDuration(item.durationMs)}</span></div>`).join('')}</div>`:`<p style="color:var(--text-faint); font-size:13px;">Nenhum registro encontrado.</p>`}</div></div>`;
}
function openAgendaEventModal(eventId){
  const event=eventId && state.agendaEvents.find(item=>item.id===eventId);
  state.modal={type:'agenda-event',eventId:event?event.id:null,title:event?event.title:'',date:event?event.date:'',time:event?event.time:'',endTime:event?event.endTime:'',notes:event?event.notes:'',completed:!!event?.completedAt}; render();
}
function addAgendaHour(time){
  const parts=String(time||'').split(':').map(Number); if(parts.length!==2||parts.some(Number.isNaN)) return '';
  return `${String((parts[0]+1)%24).padStart(2,'0')}:${String(parts[1]).padStart(2,'0')}`;
}
function openAgendaEventAt(event,date,time){
  event.preventDefault();
  event.stopPropagation();
  state.modal={type:'agenda-event',eventId:null,title:'',date:date||'',time:time||'',endTime:addAgendaHour(time),notes:''};
  render();
}
function confirmAgendaEvent(){
  const m=state.modal; if(!m || m.type!=='agenda-event') return;
  const title=String(m.title||'').trim(); if(!title){ showToast('Dê um título à tarefa.', 'error'); return; }
  const event=m.eventId ? state.agendaEvents.find(item=>item.id===m.eventId) : null;
  const time=m.time||null, endTime=time ? (m.endTime||addAgendaHour(time)) : null;
  if(time && endTime && endTime<=time){ showToast('O horário de término deve ser depois do início.', 'error'); return; }
  const value={id:event?event.id:uid(),title,date:m.date||null,time,endTime,notes:m.notes||'',deckId:m.deckId||(event&&event.deckId)||null,source:event?.source||null,autoReview:event?!!event.autoReview:false,completedAt:m.completed?(event?.completedAt||Date.now()):null,createdAt:event?event.createdAt:Date.now(),updatedAt:Date.now()};
  if(event) Object.assign(event,value); else state.agendaEvents.unshift(value);
  state.modal=null; saveData(); render();
}
function deleteAgendaEvent(id){ state.agendaEvents=state.agendaEvents.filter(event=>event.id!==id); saveData(); render(); }
function setAgendaEventCompleted(id, completed){
  const event=state.agendaEvents.find(item=>item.id===id);
  if(!event) return;
  event.completedAt=completed?Date.now():null;
  event.updatedAt=Date.now();
  state.modal=null; saveData(); render();
  showToast(completed?`${event.title} concluído.`:`${event.title} reaberto.`);
}
function toggleAgendaEventCompleted(event,id){
  event.preventDefault(); event.stopPropagation();
  const item=state.agendaEvents.find(entry=>entry.id===id);
  if(!item || item.source==='companion') return;
  setAgendaEventCompleted(id,!item.completedAt);
}
/* --- arrastar eventos da Agenda: a Drag and Drop nativa do HTML5 (draggable=""/
   ondragstart/ondrop) simplesmente NÃO funciona em toque — é como a maioria abre
   o app no celular, então o recurso parecia quebrado. Pointer Events resolvem
   mouse e toque com o mesmo código (é o mesmo truque já usado pra redimensionar
   imagem nas notas). Só vira um "arraste de verdade" depois que o ponteiro se
   move além de um limiar — assim um toque/clique simples continua abrindo o
   modal do evento normalmente, sem confundir com um arraste. */
let agendaDragCandidate = null;
let agendaDragState = null;
let suppressAgendaClickUntil = 0;
const AGENDA_DRAG_THRESHOLD = 6;
function agendaPointerDown(event, id){
  if(event.pointerType==='mouse' && event.button!==0){ return; }
  const item=state.agendaEvents.find(task=>task.id===id);
  if(!item){ return; }
  if(item.completedAt){ return; }
  if(item.source==='companion'){ return; }
  agendaDragCandidate={ id, startX:event.clientX, startY:event.clientY, title:item.title };
  window.addEventListener('pointermove', agendaPointerMoveCheck);
  window.addEventListener('pointerup', agendaPointerUpCancel, {once:true});
  // no celular, o navegador às vezes decide no meio do gesto que era rolagem
  // (não arraste) e manda pointercancel em vez de pointerup — sem tratar isso,
  // o estado ficava "preso" pensando que ainda havia um candidato a arrastar.
  window.addEventListener('pointercancel', agendaPointerUpCancel, {once:true});
}
function agendaPointerMoveCheck(event){
  const c=agendaDragCandidate;
  if(!c) return;
  const dist=Math.hypot(event.clientX-c.startX, event.clientY-c.startY);
  if(dist < AGENDA_DRAG_THRESHOLD) return;
  window.removeEventListener('pointermove', agendaPointerMoveCheck);
  window.removeEventListener('pointerup', agendaPointerUpCancel);
  window.removeEventListener('pointercancel', agendaPointerUpCancel);
  startAgendaDrag(event, c);
}
function agendaPointerUpCancel(){
  window.removeEventListener('pointermove', agendaPointerMoveCheck);
  window.removeEventListener('pointerup', agendaPointerUpCancel);
  window.removeEventListener('pointercancel', agendaPointerUpCancel);
  agendaDragCandidate=null;
}
function startAgendaDrag(event, candidate){
  agendaDragCandidate=null;
  event.preventDefault();
  const ghost=document.createElement('div');
  ghost.className='agenda-drag-ghost';
  ghost.textContent=candidate.title;
  document.body.appendChild(ghost);
  agendaDragState={ id:candidate.id, ghost, lastTarget:null };
  positionAgendaGhost(event);
  window.addEventListener('pointermove', moveAgendaDrag);
  window.addEventListener('pointerup', endAgendaDrag, {once:true});
  window.addEventListener('pointercancel', cancelAgendaDrag, {once:true});
}
function positionAgendaGhost(event){
  const drag=agendaDragState;
  if(!drag) return;
  drag.ghost.style.left=`${event.clientX+14}px`;
  drag.ghost.style.top=`${event.clientY+14}px`;
}
function moveAgendaDrag(event){
  const drag=agendaDragState;
  if(!drag) return;
  positionAgendaGhost(event);
  drag.ghost.style.display='none'; // não deixa o fantasma ser "achado" no lugar do alvo real embaixo dele
  const el=document.elementFromPoint(event.clientX, event.clientY);
  drag.ghost.style.display='';
  const target=el && el.closest ? el.closest('[data-agenda-drop]') : null;
  if(drag.lastTarget && drag.lastTarget!==target) drag.lastTarget.classList.remove('agenda-drop-target');
  if(target) target.classList.add('agenda-drop-target');
  drag.lastTarget=target||null;
}
function endAgendaDrag(event){
  const drag=agendaDragState;
  window.removeEventListener('pointermove', moveAgendaDrag);
  window.removeEventListener('pointercancel', cancelAgendaDrag);
  if(!drag) return;
  agendaDragState=null;
  if(drag.lastTarget && drag.lastTarget.classList) drag.lastTarget.classList.remove('agenda-drop-target');
  // reconfere o alvo NA HORA de soltar, em vez de confiar só no que foi visto
  // durante o arraste: se a Agenda foi redesenhada no meio do gesto (uma
  // sincronização do Firestore chegando de outro aparelho, por exemplo, já que
  // essa tela também recebe dados em tempo real), o elemento salvo em
  // drag.lastTarget podia já não existir mais na página — aí soltar em
  // qualquer lugar nunca encontrava alvo nenhum, mesmo em cima de um horário
  // válido. Escondendo o fantasma antes de checar, senão ele mesmo aparece
  // como "alvo" embaixo do próprio cursor.
  drag.ghost.style.display='none';
  const elAtDrop=document.elementFromPoint(event.clientX, event.clientY);
  drag.ghost.remove();
  const target=(elAtDrop && elAtDrop.closest ? elAtDrop.closest('[data-agenda-drop]') : null) || drag.lastTarget;
  suppressAgendaClickUntil=Date.now()+300; // evita abrir o modal do evento logo depois de soltar
  if(!target){ return; }
  const date=target.dataset.agendaDate||null, time=target.dataset.agendaTime||null;
  if(target.classList) target.classList.remove('agenda-drop-target');
  moveAgendaEventTo(drag.id, date, time);
}
function cancelAgendaDrag(){
  window.removeEventListener('pointermove', moveAgendaDrag);
  window.removeEventListener('pointerup', endAgendaDrag);
  const drag=agendaDragState;
  if(!drag) return;
  agendaDragState=null;
  drag.ghost.remove();
  if(drag.lastTarget) drag.lastTarget.classList.remove('agenda-drop-target');
}
function moveAgendaEventTo(id, date, time){
  const item=state.agendaEvents.find(task=>task.id===id);
  if(!item || item.completedAt || item.source==='companion') return;
  const oldStart=agendaTimeToMinutes(item.time), oldEnd=agendaTimeToMinutes(getAgendaEventEndTime(item));
  const duration=oldStart!==null&&oldEnd!==null&&oldEnd>oldStart ? oldEnd-oldStart : 60;
  item.date=date||null;
  item.time=time||null;
  if(time){
    item.endTime=agendaMinutesToTime(agendaTimeToMinutes(time)+duration);
  }else{
    // Ao voltar para Tarefas do dia ou A fazer, deixa de ser um compromisso
    // com duração: não preserva um horário invisível da posição anterior.
    item.endTime=null;
  }
  item.updatedAt=Date.now();
  saveData();
  render();
}
function getAgendaWeekNumber(date){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day=d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}
function getActivityTotals(activities){
  return activities.reduce((totals,activity)=>{
    totals[activity.type]=(totals[activity.type]||0)+(activity.durationMs||0);
    if(activity.type==='flashcards') totals.cards+=(activity.count||0);
    return totals;
  },{reading:0,writing:0,notes:0,flashcards:0,cards:0});
}
function agendaTimeToMinutes(time){
  const parts=String(time||'').split(':').map(Number);
  return parts.length===2 && parts.every(Number.isFinite) ? parts[0]*60+parts[1] : null;
}
function agendaMinutesToTime(minutes){
  const safe=((Number(minutes)||0)%1440+1440)%1440;
  return `${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`;
}
function getAgendaEventEndTime(event){ return event.endTime || (event.time ? addAgendaHour(event.time) : ''); }
function renderScheduledAgendaEvent(event){
  const start=agendaTimeToMinutes(event.time), end=agendaTimeToMinutes(getAgendaEventEndTime(event));
  // a grade cobre o dia inteiro (0h–24h, ver timeSlots em renderAgendaWeekView),
  // então esse limite é só uma proteção contra horário malformado -- não existe
  // mais nenhum horário "fora da grade" que faça o evento sumir da tela.
  if(start===null || end===null || start<0 || start>=1440) return '';
  const displayedEnd=Math.max(start+1,end);
  const top=(start/10)*16;
  // altura mínima de 14px (em vez de 2px) garante que até um evento de 5 minutos
  // continue com espaço pra mostrar o título — antes disso ficava um risco sem
  // nenhum texto (font-size:0), como se o evento simplesmente não existisse.
  const height=Math.max(14,((displayedEnd-start)/10)*16-2);
  const tiny=height<24;
  const range=`${event.time}–${getAgendaEventEndTime(event)}`;
  const title=`${range} · ${event.title}`;
  const companion=event.source==='companion';
  const draggable=!(companion||event.completedAt);
  const label=tiny ? escapeHtml(event.title) : `${event.completedAt&&!companion?'✓ ':''}<strong>${range}</strong> ${escapeHtml(event.title)}`;
  // .agenda-scheduled-event fica posicionado por cima do .agenda-slot (são irmãos
  // no HTML, não pai/filho — o evento flutua em position:absolute por cima da
  // grade) — então soltar um arraste bem em cima de um evento JÁ existente (até um
  // concluído, ou do Companion) fazia o ponto do dedo/mouse "bater" nesse botão em
  // vez do slot embaixo, e como o botão não tinha os atributos de alvo de soltar,
  // o arraste falhava calado. Repetir esses atributos aqui, calculando o horário
  // mais próximo (arredondado pra baixo, de 30 em 30min), resolve isso.
  const dayKey=getAgendaEventDateKey(event);
  const slotTime=agendaMinutesToTime(Math.floor(start/10)*10);
  return `<button class="agenda-scheduled-event ${companion?'companion':''} ${event.completedAt&&!companion?'done':''} ${tiny?'tiny':''}" style="top:${top}px; height:${height}px;" title="${escapeHtml(title)}" data-agenda-drop="1" data-agenda-date="${dayKey}" data-agenda-time="${slotTime}" ${draggable?`onpointerdown="agendaPointerDown(event,'${event.id}')"`:''} onclick="if(Date.now()<suppressAgendaClickUntil) return; openAgendaEventModal('${event.id}')">${label}</button>`;
}
function openAgendaSuggestions(){
  const start=agendaDateFromKey(state.agendaWeekStart||agendaDateKey(new Date()));
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  const todos=state.agendaEvents.filter(event=>!getAgendaEventDateKey(event)&&!event.completedAt).slice(0,5);
  const slots=[];
  for(let day=0;day<7;day++) for(const time of ['09:00','14:00','19:00']){
    const date=new Date(start); date.setDate(start.getDate()+day); const key=agendaDateKey(date);
    if(!state.agendaEvents.some(event=>getAgendaEventDateKey(event)===key&&event.time===time)) slots.push({date:key,time});
  }
  state.modal={type:'agenda-suggestions',suggestions:todos.map((event,index)=>({eventId:event.id,slot:slots[index]||null}))}; render();
}
function applyAgendaSuggestion(eventId,date,time){
  const event=state.agendaEvents.find(item=>item.id===eventId); if(!event||!date||!time) return;
  event.date=date; event.time=time; event.endTime=event.endTime||addAgendaHour(time); event.updatedAt=Date.now(); saveData();
  if(state.modal?.type==='agenda-suggestions') state.modal.suggestions=state.modal.suggestions.filter(item=>item.eventId!==eventId);
  render();
}
function isToday(timestamp){
  const now = new Date(), date = new Date(timestamp);
  return now.getFullYear()===date.getFullYear() && now.getMonth()===date.getMonth() && now.getDate()===date.getDate();
}
function renderAgendaActivity(activity){
  const icon = activity.type === 'reading' ? '📖' : activity.type === 'writing' ? '✍️' : activity.type === 'notes' ? '📓' : activity.type === 'routine' ? (activity.icon||'✅') : '🧠';
  const label = activity.type === 'reading' ? 'Leitura' : activity.type === 'writing' ? 'Escrita' : activity.type === 'notes' ? 'Notas' : activity.type === 'routine' ? (activity.title||'Rotina') : 'Flashcards';
  const detail = activity.type === 'flashcards'
    ? `${activity.count||0} cartão(ões) · ${formatActivityDuration(activity.durationMs)}`
    : formatActivityDuration(activity.durationMs);
  return `<div class="agenda-card"><div>${icon} <strong>${label}</strong> · ${escapeHtml(activity.title||'')}</div><div class="agenda-meta">${detail} · ${formatActivityTime(activity.at)}</div></div>`;
}
function renderAgendaWeekView(){
  const start=agendaDateFromKey(state.agendaWeekStart||agendaDateKey(new Date()));
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  const week=Array.from({length:7},(_,index)=>{ const date=new Date(start); date.setDate(start.getDate()+index); return date; });
  const todayKey=agendaDateKey(new Date());
  // usa getAgendaEventDateKey (não event.date direto): eventos vindos da IA, do
  // Companion ou de uma sincronização antiga podem guardar a data num formato
  // diferente de "YYYY-MM-DD" (Timestamp do Firestore, data por extenso etc.) —
  // comparar o campo cru fazia esses eventos sumirem de toda a Agenda, mesmo
  // existindo normalmente na lista.
  const todos=state.agendaEvents.filter(event=>!getAgendaEventDateKey(event) && !event.completedAt);
  // de 10 em 10 minutos, cobrindo o dia inteiro (0h–24h) -- antes ia de 30 em 30min
  // e só começava às 6h, então qualquer evento criado de madrugada (antes das 6h)
  // era salvo normalmente mas nunca aparecia em lugar nenhum da tela.
  const timeSlots=Array.from({length:144},(_,i)=>{ const minutes=i*10; return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`; });
  const eventCard=(event, todo)=>{
    const draggable=!(event.completedAt||event.source==='companion');
    return `<div class="agenda-event ${todo?'todo':''} ${event.source==='companion'?'companion':''} ${event.completedAt&&event.source!=='companion'?'done':''}" role="button" tabindex="0" ${draggable?`onpointerdown="agendaPointerDown(event,'${event.id}')"`:''} onclick="if(Date.now()<suppressAgendaClickUntil) return; openAgendaEventModal('${event.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openAgendaEventModal('${event.id}')}">${event.completedAt&&event.source!=='companion'?'✓ ':''}${event.time&&!todo?`<strong>${event.time}${event.endTime?`–${event.endTime}`:''}</strong> `:''}${escapeHtml(event.title)}</div>`;
  };
  const dayColumn=date=>{
    const key=agendaDateKey(date);
    const dayTasks=state.agendaEvents.filter(event=>getAgendaEventDateKey(event)===key&&!event.time);
    const scheduled=state.agendaEvents.filter(event=>getAgendaEventDateKey(event)===key&&event.time);
    return `<div class="agenda-week-day ${key===todayKey?'today':''}"><div class="agenda-week-title">${date.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}<br><span style="color:var(--text-faint);">${date.getDate()}</span></div><div class="agenda-day-tasks" data-agenda-drop="1" data-agenda-date="${key}" data-agenda-time=""><span class="agenda-day-tasks-label">TAREFAS DO DIA</span>${dayTasks.map(event=>eventCard(event,true)).join('')}${!dayTasks.length?`<span style="font-size:10px; color:var(--text-faint);">Solte uma tarefa aqui</span>`:''}</div><div class="agenda-day-hours">${timeSlots.map(time=>`<div class="agenda-slot" data-agenda-drop="1" data-agenda-date="${key}" data-agenda-time="${time}" oncontextmenu="openAgendaEventAt(event,'${key}','${time}')"><span class="agenda-slot-time ${time.endsWith(':00')?'':'half'}">${time}</span></div>`).join('')}${scheduled.map(renderScheduledAgendaEvent).join('')}</div></div>`;
  };
  return `<div style="max-width:1400px; margin:0 auto;"><button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Menu</button><div class="deck-header" style="margin-bottom:14px;"><div><h2 style="margin:0 0 5px;">🗓️ Agenda</h2><p>Arraste pendências entre “A fazer”, tarefas do dia e horários.</p></div><button class="primary-btn" onclick="openAgendaEventModal()">＋ Novo evento</button></div><div class="agenda-week-toolbar"><div class="agenda-week-navigation"><button class="icon-btn" aria-label="Semana anterior" title="Semana anterior" onclick="changeAgendaWeek(-1)">‹</button><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="goToAgendaToday()">Hoje</button><button class="icon-btn" aria-label="Próxima semana" title="Próxima semana" onclick="changeAgendaWeek(1)">›</button></div><strong class="agenda-week-period">${start.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} — ${week[6].toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</strong><div class="agenda-week-actions"><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="openAgendaSuggestions()">✨ Sugerir</button><button class="icon-btn" title="Chat IA da Agenda" aria-label="Chat IA da Agenda" onclick="openGlobalAiChat()">💬</button><button class="ghost-btn active-mode" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('week')">Semana</button><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('month')">Mês</button><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('report')">Relatório</button></div></div><div class="agenda-source-legend"><i></i> Azul: uso registrado no celular pelo Companion</div><div class="agenda-week-layout"><aside class="agenda-todo" data-agenda-drop="1" data-agenda-date="" data-agenda-time=""><div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0; font-size:15px;">📌 A fazer</h3><span style="font-size:11px; color:var(--text-faint);">${todos.length}</span></div><p style="font-size:11.5px; color:var(--text-faint);">Solte aqui uma pendência sem dia ou horário.</p>${todos.map(event=>eventCard(event,true)).join('') || `<p style="font-size:12px; color:var(--text-faint);">Arraste para um dia ou horário quando decidir.</p>`}</aside><section class="agenda-week">${week.map(dayColumn).join('')}</section></div></div>`;
}
function renderAgendaView(){
  // Garante a migração também para sessões antigas que ficaram abertas ou
  // receberam dados depois da carga inicial.
  rolloverAgendaOverdueTasks();
  // Sessões registradas antes desta versão também entram como eventos
  // concluídos, sem exigir que a pessoa repita a atividade.
  syncLettherActivitiesToAgenda();
  if((state.agendaView||'week')==='report') return renderAgendaReportView();
  if((state.agendaView||'week')==='week') return renderAgendaWeekView();
  const dueDecks = state.decks.map(deck => ({ deck, count:getDueCards(deck.id).length })).filter(item => item.count);
  const totalDue = dueDecks.reduce((sum,item)=>sum+item.count,0);
  const cursor=getAgendaCursor();
  const monthStart=new Date(cursor.year,cursor.month,1);
  const monthLabel=monthStart.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const selectedKey=state.agendaSelectedDate || agendaDateKey(new Date());
  const selectedDate=agendaDateFromKey(selectedKey);
  const activitiesByDay={};
  state.activities.forEach(activity=>{ const key=agendaDateKey(activity.at); (activitiesByDay[key]||(activitiesByDay[key]=[])).push(activity); });
  const selectedActivities=(activitiesByDay[selectedKey]||[]).sort((a,b)=>b.at-a.at);
  const selectedTotals=getActivityTotals(selectedActivities);
  const leading=(monthStart.getDay()+6)%7;
  const gridStart=new Date(cursor.year,cursor.month,1-leading);
  const calendarDays=Array.from({length:42},(_,index)=>{
    const date=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+index);
    const key=agendaDateKey(date), activities=activitiesByDay[key]||[], totals=getActivityTotals(activities);
    const markers=[(totals.flashcards||totals.cards)&&'<i class="agenda-day-dot" style="background:#7DA9FA"></i>',totals.writing&&'<i class="agenda-day-dot" style="background:#B88E74"></i>',totals.reading&&'<i class="agenda-day-dot" style="background:#6EE7B7"></i>'].filter(Boolean).join('');
    const label=activities.length ? `${activities.length} atividade${activities.length>1?'s':''}` : '';
    return `<button class="agenda-day ${date.getMonth()!==cursor.month?'other-month':''} ${key===agendaDateKey(new Date())?'today':''} ${key===selectedKey?'selected':''}" title="${date.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}${label?` · ${label}`:''}" onclick="selectAgendaDate('${key}')"><span class="agenda-day-number">${date.getDate()}</span><span class="agenda-day-summary">${markers}</span><span class="agenda-day-count">${label}</span></button>`;
  }).join('');
  return `
  <div style="max-width:1200px; margin:0 auto;">
    <button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Menu</button>
    <div class="deck-header" style="margin-bottom:20px;">
      <div><h2 style="margin:0 0 6px;">🗓️ Agenda</h2><p>Seu calendário de estudo, escrita e leitura.</p></div>
      <div style="display:flex; gap:6px; align-items:center;"><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('week')">Semana</button><button class="ghost-btn active-mode" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('month')">Mês</button><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('report')">Relatório</button><button class="primary-btn" style="padding:7px 10px; font-size:12px;" onclick="openAgendaEventModal()">＋ Evento</button></div>
    </div>
    <div class="agenda-summary-grid">
      <div class="agenda-summary-chip"><strong>${selectedTotals.flashcards?formatActivityDuration(selectedTotals.flashcards):'0 min'}</strong><span>em flashcards</span></div>
      <div class="agenda-summary-chip"><strong>${selectedTotals.writing?formatActivityDuration(selectedTotals.writing):'0 min'}</strong><span>escrevendo</span></div>
      <div class="agenda-summary-chip"><strong>${selectedTotals.reading?formatActivityDuration(selectedTotals.reading):'0 min'}</strong><span>lendo</span></div>
    </div>
    <div class="agenda-board">
      <section class="agenda-calendar" style="grid-column:span 2;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:9px;"><button class="icon-btn" title="Mês anterior" onclick="changeAgendaMonth(-1)">‹</button><div style="text-align:center;"><strong style="font-size:16px; text-transform:capitalize;">${monthLabel}</strong><div style="font-size:10.5px; color:var(--text-faint);">Ano ${cursor.year}</div></div><div style="display:flex; gap:5px;"><button class="ghost-btn" style="padding:5px 8px; font-size:11px;" onclick="goToAgendaToday()">Hoje</button><button class="icon-btn" title="Próximo mês" onclick="changeAgendaMonth(1)">›</button></div></div>
        <div class="agenda-calendar-weekdays"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
        <div class="agenda-calendar-grid">${calendarDays}</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 4px 0; color:var(--text-faint); font-size:10.5px;"><span><i class="agenda-day-dot" style="display:inline-block; background:#7DA9FA"></i> Flashcards</span><span><i class="agenda-day-dot" style="display:inline-block; background:#B88E74"></i> Escrita</span><span><i class="agenda-day-dot" style="display:inline-block; background:#6EE7B7"></i> Leitura</span></div>
      </section>
      <section class="agenda-column">
        <h3>${selectedDate.toLocaleDateString('pt-BR',{day:'numeric',month:'long'})} <span style="font-size:11px; color:var(--text-faint);">· semana ${getAgendaWeekNumber(selectedDate)}</span></h3>
        <p style="margin:0; font-size:11.5px; color:var(--text-faint);">${selectedTotals.cards||0} cartão(ões) · ${selectedActivities.length} registro(s)</p>
        ${selectedActivities.length ? selectedActivities.map(renderAgendaActivity).join('') : `<p style="color:var(--text-faint); font-size:12.5px;">Nenhuma atividade registrada neste dia.</p>`}
      </section>
      <section class="agenda-column">
        <h3>📌 Revisões <span style="font-size:11px; color:var(--text-faint);">${totalDue}</span></h3>
        ${dueDecks.length ? dueDecks.map(({deck,count}) => `<div class="agenda-card"><div style="display:flex; justify-content:space-between; gap:8px; align-items:center;"><strong>${escapeHtml(deck.name)}</strong><span class="due-badge">${count}</span></div><div class="agenda-meta">${count} cartão(ões) vencido(s)</div><button class="ghost-btn" style="font-size:11.5px; padding:6px 9px; margin-top:9px;" onclick="openAgendaDeckStudy('${deck.id}')">Abrir revisão</button></div>`).join('') : `<p style="color:var(--text-faint); font-size:12.5px;">Nenhuma revisão vencida. Um ótimo momento para avançar em outros projetos.</p>`}
      </section>
    </div>
  </div>`;
}
function backToLibrary(){
  state.view = 'library'; state.currentBookId = null;
  render();
}
function openBook(id){
  state.currentBookId = id; state.view = 'book';
  playBookOpen();
  render();
}
function deleteBook(id){
  const book = state.books.find(b=>b.id===id);
  askConfirm(`Excluir "${book ? book.title : ''}" da estante, junto com as citações guardadas? Essa ação não pode ser desfeita.`, () => {
    state.books = state.books.filter(b=>b.id!==id);
    if(state.currentBookId === id){ state.currentBookId = null; state.view = 'library'; }
    saveData(); render();
    showToast('Livro removido da estante.');
  });
}
function updateBookField(id, field, value){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book[field] = value;
  saveData();
}
function setBookRating(id, rating){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.rating = (book.rating === rating) ? 0 : rating; // clicar na mesma estrela zera a nota
  saveData(); render();
}
function setBookStatus(id, status){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.status = status;
  if(status === 'lido'){
    if(!book.dateFinished) book.dateFinished = todayStr();
    if(book.totalPages > 0) book.pagesRead = book.totalPages;
  }
  saveData(); render();
}
function setBookDateFinished(id, value){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.dateFinished = value || null;
  saveData();
}
function addBookReread(id){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.rereads = book.rereads || [];
  book.rereads.push(todayStr());
  saveData(); render();
}
// sem render() aqui de propósito -- mesmo motivo do campo DATA DE CONCLUSÃO:
// um <input type="date"> já preenchido dispara "change" a cada dígito
// digitado por cima, e redesenhar a página a cada tecla recria o campo do
// zero, resetando o segmento (dia/mês/ano) que o navegador estava editando.
function setBookRereadDate(id, index, value){
  const book = state.books.find(b=>b.id===id);
  if(!book || !Array.isArray(book.rereads) || index<0 || index>=book.rereads.length) return;
  book.rereads[index] = value || todayStr();
  saveData();
}
function removeBookReread(id, index){
  const book = state.books.find(b=>b.id===id);
  if(!book || !Array.isArray(book.rereads)) return;
  book.rereads.splice(index,1);
  saveData(); render();
}
function setBookPages(id, field, value){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  let n = parseInt(value, 10);
  if(isNaN(n) || n < 0) n = 0;
  book[field] = n;
  if(field === 'totalPages' && book.pagesRead > n) book.pagesRead = n;
  if(field === 'pagesRead' && book.totalPages > 0 && n > book.totalPages) book.pagesRead = book.totalPages;
  saveData();
}
function addBookCategory(id){
  const input = document.getElementById('book-category-input-'+id);
  const val = (input.value||'').trim();
  if(!val) return;
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.categories = book.categories || [];
  if(!book.categories.includes(val)) book.categories.push(val);
  input.value = '';
  saveData(); render();
}
function removeBookCategory(id, index){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.categories.splice(index, 1);
  saveData(); render();
}
function renderTagChips(tags, removeFn, removeArgsPrefix){
  return (tags||[]).map((t,i) => `
    <span style="display:inline-flex; align-items:center; gap:4px; background:var(--bg-2); border:1px solid var(--border); border-radius:6px; padding:3px 8px; font-size:11.5px; color:var(--text-muted);">
      ${escapeHtml(t)}
      <span style="cursor:pointer; opacity:0.6;" onclick="${removeFn}(${removeArgsPrefix}${i})">×</span>
    </span>
  `).join('');
}
function setBookLinkedDeck(id, deckId){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  if(deckId === '__new__'){
    state.modal = { type:'create-deck-for-book', bookId:id, name: book.title || '', deckType: book.isEnglish ? 'language' : 'standard' };
    render();
    return;
  }
  book.linkedDeckId = deckId || null;
  saveData(); render();
}
function confirmCreateDeckForBook(){
  const m = state.modal;
  if(!m || m.type !== 'create-deck-for-book') return;
  const name = (m.name||'').trim();
  if(!name){ showToast('Dê um nome ao baralho.', 'error'); return; }
  const book = state.books.find(b=>b.id===m.bookId);
  if(!book){ state.modal = null; render(); return; }
  const color = DECK_COLORS[state.decks.length % DECK_COLORS.length];
  const deck = { id: uid(), name, color, type: m.deckType };
  state.decks.push(deck);
  state.cards[deck.id] = [];
  book.linkedDeckId = deck.id;
  state.modal = null;
  saveData(); render();
  showToast('Baralho criado e vinculado ao livro.');
}
function goToLinkedDeck(deckId){
  if(!state.decks.some(d=>d.id===deckId)) return;
  selectDeck(deckId);
}
function deleteQuote(bookId, quoteId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book) return;
  book.quotes = (book.quotes||[]).filter(q=>q.id!==quoteId);
  saveData(); render();
}

/* busca metadados/capa reais na API pública do Google Books — mais confiável
   que pedir pra uma IA "adivinhar" esses dados, e não gasta cota do Gemini. */
async function searchGoogleBooks(query){
  const key = getBooksApiKey();
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8${key ? `&key=${encodeURIComponent(key)}` : ''}`;
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('books_api_error');
  const data = await resp.json();
  return (data.items||[]).map(it => {
    const info = it.volumeInfo || {};
    const cover = info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '') : '';
    return {
      title: info.title || '',
      author: (info.authors||[]).join(', '),
      category: (info.categories||[])[0] || '',
      coverUrl: cover.replace('http://','https://')
    };
  }).filter(b => b.title);
}
function openAddBookModal(){
  state.modal = { type:'add-book', query:'', searching:false, results:[], manual:{title:'',author:'',categories:[],coverUrl:''} };
  render();
}
function addManualCategory(){
  const m = state.modal;
  if(!m || m.type !== 'add-book') return;
  const input = document.getElementById('manual-category-input');
  const val = (input.value||'').trim();
  if(!val) return;
  m.manual.categories = m.manual.categories || [];
  if(!m.manual.categories.includes(val)) m.manual.categories.push(val);
  input.value = '';
  render();
}
function removeManualCategory(index){
  const m = state.modal;
  if(!m || m.type !== 'add-book') return;
  m.manual.categories.splice(index, 1);
  render();
}
async function searchBookModal(){
  const m = state.modal;
  if(!m || m.type !== 'add-book') return;
  const q = (m.query||'').trim();
  if(!q){ showToast('Digite o nome do livro pra buscar.', 'error'); return; }
  m.searching = true; render();
  try{
    const results = await searchGoogleBooks(q);
    if(state.modal && state.modal.type === 'add-book') state.modal.results = results;
    if(results.length === 0) showToast('Nenhum resultado encontrado — pode preencher à mão.', 'error');
  }catch(e){
    console.error('Falha ao buscar na API do Google Books', e);
    showToast('Não consegui buscar na internet agora. Preencha à mão.', 'error');
  }
  if(state.modal && state.modal.type === 'add-book') state.modal.searching = false;
  render();
}
function pickBookResult(i){
  const m = state.modal;
  if(!m || m.type !== 'add-book') return;
  const r = m.results[i];
  if(!r) return;
  m.manual = { title: r.title, author: r.author, categories: r.category ? [r.category] : [], coverUrl: r.coverUrl };
  m.results = [];
  render();
}
function confirmAddBook(){
  const m = state.modal;
  const title = (m.manual.title||'').trim();
  if(!title){ showToast('Dê um título ao livro.', 'error'); return; }
  const book = makeBook(title, m.manual.author);
  book.categories = (m.manual.categories||[]).slice();
  book.coverUrl = (m.manual.coverUrl||'').trim();
  state.books.push(book);
  state.modal = null;
  saveData();
  openBook(book.id);
  showToast('Livro adicionado à estante.');
}

/* captura de citação: reaproveita o mesmo corte de foto dos flashcards, mas
   ao invés de gerar perguntas, só transcreve o texto pra guardar no livro. */
function openQuoteCapturePicker(bookId, useCamera){
  openImagePicker(useCamera, (dataUrl) => {
    state.modal = { type:'photo-crop', rawDataUrl: dataUrl, box: { x:5, y:5, w:90, h:90 }, purpose:'quote', bookId };
    render();
  });
}
async function extractTextFromImage(base64Data, mimeType){
  const prompt = `Esta imagem é uma foto de uma página de livro. Transcreva EXATAMENTE o texto que aparece nela, preservando as quebras de parágrafo. Não resuma, não corrija e não comente nada — responda SOMENTE com o texto transcrito, sem nenhum texto adicional antes ou depois.`;
  const text = (await callGemini(prompt, { maxTokens: 1200, imageBase64: base64Data, imageMime: mimeType, model: GEMINI_MODEL_VISION })).trim();
  if(!text) throw new Error('empty_response');
  return text;
}
async function runQuoteCapture(img, bookId){
  state.modal = { type:'quote-capture', status:'processing', imageDataUrl: img.dataUrl, bookId, text:'' };
  render();
  try{
    const text = await extractTextFromImage(img.base64, img.mime);
    if(state.modal && state.modal.type === 'quote-capture'){
      state.modal.status = 'review';
      state.modal.text = text;
    }
  }catch(err){
    console.error('Falha ao transcrever a foto', err);
    if(state.modal && state.modal.type === 'quote-capture'){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
    }
  }
  render();
}
function confirmQuoteCapture(){
  const m = state.modal;
  const text = (m.text||'').trim();
  if(!text){ showToast('O texto da citação está vazio.', 'error'); return; }
  const book = state.books.find(b => b.id === m.bookId);
  state.modal = null;
  if(!book){ render(); return; }
  book.quotes = book.quotes || [];
  book.quotes.push({ id: uid(), text, createdAt: Date.now() });
  saveData(); render();
  showToast('Citação guardada.');
}

