/* ============ AGENDA E HISTÓRICO DE ATIVIDADES ============ */
const ACTIVITY_HISTORY_LIMIT = 240;
// Um minuto já é suficiente para aparecer na Agenda; pausas maiores são
// encerradas automaticamente, evitando contabilizar uma nota abandonada.
const WRITING_MIN_MS = 1 * 60 * 1000;
const READING_AUTOSAVE_MS = 2 * 60 * 60 * 1000;
let notesPresenceActivity = null;
function startNotesPresence(noteId){
  const title=noteId ? (state.notesItems.find(item=>item.id===noteId)?.name||'Nota') : 'Explorador de notas';
  if(notesPresenceActivity && notesPresenceActivity.noteId===noteId) return;
  finishNotesPresence();
  notesPresenceActivity={noteId:noteId||null,title,startedAt:Date.now()};
}
function finishNotesPresence(){
  const session=notesPresenceActivity; if(!session) return;
  const durationMs=Date.now()-session.startedAt;
  notesPresenceActivity=null;
  if(durationMs>=WRITING_MIN_MS) addActivity('notes',{durationMs,noteId:session.noteId,title:session.title});
}
function addActivity(type, details){
  const durationMs = Math.max(0, Math.round(details.durationMs || 0));
  if(!durationMs && !details.count) return;
  const endedAt=Number(details.endedAt)||Date.now();
  const startedAt=Number(details.startedAt)||Math.max(0,endedAt-durationMs);
  const activity={ id:uid(), type, at:endedAt, durationMs, startedAt, endedAt, ...details };
  state.activities.unshift(activity);
  state.activities = state.activities.slice(0, ACTIVITY_HISTORY_LIMIT);
  const agendaEvent=makeLettherActivityAgendaEvent(activity);
  if(agendaEvent) state.agendaEvents.unshift(agendaEvent);
  saveData();
}
function makeLettherActivityAgendaEvent(activity){
  // Cada sessão do próprio Letther B também é um registro concluído na Agenda.
  // Assim o calendário mostra tanto o planejamento quanto o que foi feito de fato.
  // flashcards fica de fora: completeAgendaReviewTask já converte o próprio
  // lembrete "Revisar {baralho}" pendente no registro com horário real —
  // criar também um evento genérico aqui duplicaria a mesma sessão na Agenda.
  if(!activity || !Number(activity.durationMs) || activity.type==='flashcards') return null;
  const presentation={
    notes:{icon:'📓',label:'Notas'}, writing:{icon:'✍️',label:'Escrita'},
    reading:{icon:'📖',label:'Leitura'}
  }[activity.type];
  if(!presentation) return null;
  const durationMs=Math.max(0,Number(activity.durationMs)||0);
  const endedAt=Number(activity.endedAt)||Number(activity.at)||Date.now();
  const startedAt=Number(activity.startedAt)||Math.max(0,endedAt-durationMs);
  const detail=String(activity.title||presentation.label).trim();
  return {
    id:uid(), activityId:activity.id, source:'letther-activity', activityType:activity.type,
    title:`${presentation.icon} ${presentation.label}${detail&&detail!==presentation.label?` — ${detail}`:''}`,
    date:agendaDateKey(startedAt), time:new Date(startedAt).toTimeString().slice(0,5),
    endTime:new Date(endedAt).toTimeString().slice(0,5),
    notes:`Registrado automaticamente pelo Letther B · ${formatActivityDuration(durationMs)}${activity.type==='flashcards'&&activity.count?` · ${activity.count} cartão(ões)`:''}`,
    completedAt:endedAt, createdAt:endedAt, updatedAt:endedAt
  };
}
function syncLettherActivitiesToAgenda(){
  const existing=new Set(state.agendaEvents.filter(event=>event.source==='letther-activity'&&event.activityId).map(event=>event.activityId));
  const missing=(state.activities||[]).filter(activity=>!existing.has(activity.id)).map(makeLettherActivityAgendaEvent).filter(Boolean);
  if(!missing.length) return false;
  state.agendaEvents.unshift(...missing);
  saveData();
  return true;
}
function startWritingActivity(noteId){
  const current = state.writingActivity;
  if(current && current.noteId === noteId){ current.lastInputAt = Date.now(); return; }
  finishWritingActivity();
  state.writingActivity = { noteId, startedAt:Date.now(), lastInputAt:Date.now() };
}
function finishWritingActivity(){
  const a = state.writingActivity;
  if(!a) return;
  const durationMs = a.lastInputAt - a.startedAt;
  if(durationMs >= WRITING_MIN_MS){
    const note = state.notesItems.find(n=>n.id===a.noteId);
    addActivity('writing', { durationMs, noteId:a.noteId, title:note ? note.name : 'Nota' });
  }
  state.writingActivity = null;
}
function startReadingActivity(bookId){
  if(state.readingActivity && state.readingActivity.bookId === bookId) return;
  finishReadingActivity();
  state.readingActivity = { bookId, startedAt:Date.now() };
}
function finishReadingActivity(){
  const a = state.readingActivity;
  if(!a) return;
  const durationMs = Date.now() - a.startedAt;
  // Sessões curtas não poluem o histórico; uma leitura longa ainda é salva
  // automaticamente a cada 2 horas pelo monitor abaixo.
  if(durationMs >= WRITING_MIN_MS){
    const book = state.books.find(b=>b.id===a.bookId);
    addActivity('reading', { durationMs, bookId:a.bookId, title:book ? book.title : 'Leitura' });
  }
  state.readingActivity = null;
}
function recordStudyActivity(session){
  if(!session || session.activityRecorded) return;
  const count = Math.min(session.index + (session.revealed ? 1 : 0), session.queue ? session.queue.length : 0);
  if(!count) return;
  session.activityRecorded = true;
  const deck = state.decks.find(d=>d.id===session.deckId);
  addActivity('flashcards', { durationMs:Date.now() - session.startTime, count, deckId:session.deckId, title:deck ? deck.name : 'Flashcards' });
  completeAgendaReviewTask(session.deckId, session.startTime, Date.now());
}
function agendaTimeFromTimestamp(ts){
  const d=new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
/* A revisão espaçada projeta um lembrete "Revisar {baralho}" por DATA de
   vencimento distinta entre os cartões pendentes do baralho -- não mais só
   um lembrete pro vencimento mais próximo. Um baralho com cartões vencendo
   amanhã, em 3 dias e em 15 dias aparece nos três dias simultaneamente, cada
   um representando só os cartões que vencem ali. O usuário não precisa
   agendar nada manualmente -- a Agenda projeta e mantém isso sozinha. */
function ensureAgendaReviewTasks(){
  const today=agendaDateKey(new Date());
  const now=Date.now();
  let changed=false;
  const archivedIds=new Set(state.decks.filter(deck=>deck.archived).map(deck=>deck.id));
  const before=state.agendaEvents.length;
  state.agendaEvents=state.agendaEvents.filter(event=>!(event.autoReview&&archivedIds.has(event.deckId)&&!event.completedAt));
  if(state.agendaEvents.length!==before) changed=true;
  // migração do formato por-cartão (usado numa versão anterior desta função):
  // descarta os pendentes -- a revisão volta a ser por data de vencimento, não
  // por cartão individual.
  const beforeMigration=state.agendaEvents.length;
  state.agendaEvents=state.agendaEvents.filter(event=>!(event.autoReview&&event.cardId&&!event.completedAt));
  if(state.agendaEvents.length!==beforeMigration) changed=true;
  state.decks.forEach(deck=>{
    if(deck.archived) return;
    const pool=getStudyPool(deck.id);
    // datas-alvo válidas pra esse baralho agora: hoje (se algo já venceu, ou
    // vai vencer até agora) e cada data futura distinta em que algum cartão
    // ainda vai vencer.
    const targetDates=new Set();
    pool.forEach(card=>{
      const due=card.due||0;
      targetDates.add(due<=now ? today : agendaDateKey(new Date(due)));
    });
    // um lembrete sem horário definido nunca foi "agendado manualmente" pelo
    // usuário -- remove os que sobraram de uma data que não corresponde mais
    // a nenhum vencimento atual (os cartões daquele dia foram estudados
    // adiantado, reagendados, ou o baralho ficou sem nada pendente).
    state.agendaEvents.filter(event=>event.autoReview&&event.deckId===deck.id&&!event.completedAt&&!event.time&&!targetDates.has(event.date)).forEach(stale=>{
      state.agendaEvents=state.agendaEvents.filter(event=>event!==stale);
      changed=true;
    });
    targetDates.forEach(targetDate=>{
      const task=state.agendaEvents.find(event=>event.autoReview&&event.deckId===deck.id&&!event.completedAt&&event.date===targetDate);
      if(!task){
        state.agendaEvents.unshift({id:uid(),title:`Revisar ${deck.name}`,date:targetDate,time:null,endTime:null,notes:'Criado automaticamente pela revisão espaçada.',deckId:deck.id,autoReview:true,source:null,completedAt:null,createdAt:Date.now(),updatedAt:Date.now()});
        changed=true;
      }else if(task.title!==`Revisar ${deck.name}`){
        task.title=`Revisar ${deck.name}`; task.updatedAt=Date.now(); changed=true;
      }
    });
  });
  if(changed) saveData();
}
/* Quando a sessão de estudo termina, ela revisou só os cartões JÁ vencidos
   agora -- então só o lembrete de HOJE desse baralho (o que representa esses
   cartões) vira o registro real da sessão, com o horário em que ela de fato
   começou e terminou. Outros lembretes do mesmo baralho projetados pra dias
   futuros (cartões com vencimento mais distante) continuam intocados,
   esperando a data deles. Cobre também o caso de adiantar um lembrete que só
   venceria num dia futuro: como não existe um lembrete de "hoje" ainda, um
   novo é criado na hora, já concluído com o horário real. Depois, reprojeta
   os lembretes a partir dos cartões que sobraram. */
function completeAgendaReviewTask(deckId, startedAt, endedAt){
  const deck=state.decks.find(item=>item.id===deckId);
  if(deck?.archived) return;
  const today=agendaDateKey(new Date());
  let task=state.agendaEvents.find(event=>event.autoReview&&event.deckId===deckId&&!event.completedAt&&(!event.date||event.date<=today));
  if(!task){
    task={id:uid(),deckId,autoReview:true,source:null,createdAt:Date.now()};
    state.agendaEvents.unshift(task);
  }
  task.title=`Revisar ${deck?deck.name:'baralho'}`;
  task.date=today;
  task.time=agendaTimeFromTimestamp(startedAt);
  task.endTime=agendaTimeFromTimestamp(endedAt);
  if(task.endTime<=task.time) task.endTime=agendaMinutesToTime(agendaTimeToMinutes(task.time)+1);
  task.notes='Registrado automaticamente pela sessão de flashcards.';
  task.completedAt=Date.now();
  task.updatedAt=Date.now();
  saveData();
  ensureAgendaReviewTasks();
}
function maintainActivityTimers(){
  const now = Date.now();
  const writing = state.writingActivity;
  // Três minutos sem editar encerram a sessão de escrita; assim uma aba deixada
  // aberta não vira horas fictícias de produção.
  if(writing && now - writing.lastInputAt > 3 * 60 * 1000) finishWritingActivity();
  const reading = state.readingActivity;
  if(reading && now - reading.startedAt >= READING_AUTOSAVE_MS){
    const book = state.books.find(b=>b.id===reading.bookId);
    addActivity('reading', { durationMs:READING_AUTOSAVE_MS, bookId:reading.bookId, title:book ? book.title : 'Leitura' });
    reading.startedAt = now;
  }
  if(rolloverAgendaOverdueTasks() && state.view==='agenda') render();
}

