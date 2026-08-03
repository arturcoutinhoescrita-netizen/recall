/* ============ LEITURAS (estante de livros) ============ */
function makeBook(title, author){
  return {
    id: uid(), title: (title||'').trim(), author: (author||'').trim(), categories:[], coverUrl:'', rating:0,
    quotes:[], linkedDeckId:null, addedAt: Date.now(),
    status:'quero-ler', dateFinished:null, rereads:[], totalPages:0, pagesRead:0,
    isEnglish:false, epub:null
  };
}
const BOOK_STATUS_LABELS = { 'quero-ler':'📌 Quero ler', 'lendo':'📖 Lendo', 'lido':'✅ Lido' };
// livros salvos antes dessa atualização tinham "category" (string única) em vez de
// "categories" (array) e não tinham status/páginas/epub — normaliza pro formato novo.
function normalizeBook(b){
  return {
    id: b.id || uid(),
    title: b.title || '',
    author: b.author || '',
    categories: Array.isArray(b.categories) ? b.categories : (b.category ? [b.category] : []),
    coverUrl: b.coverUrl || '',
    rating: b.rating || 0,
    quotes: b.quotes || [],
    linkedDeckId: b.linkedDeckId || null,
    addedAt: b.addedAt || Date.now(),
    status: b.status || 'quero-ler',
    dateFinished: b.dateFinished || null,
    rereads: Array.isArray(b.rereads) ? b.rereads : [],
    totalPages: b.totalPages || 0,
    pagesRead: b.pagesRead || 0,
    isEnglish: b.isEnglish || false,
    epub: normalizeBookEpub(b.epub)
  };
}
// epubs salvos antes dos marcadores/sumário não tinham esses campos —
// preenche com padrão vazio pra não quebrar o leitor em livros antigos.
function normalizeBookEpub(epub){
  if(!epub) return null;
  return {
    ...epub,
    currentPageIndex: epub.currentPageIndex || 0,
    pagesInCurrentChapter: epub.pagesInCurrentChapter || 1,
    toc: Array.isArray(epub.toc) ? epub.toc : [],
    chapterTitles: Array.isArray(epub.chapterTitles) ? epub.chapterTitles : [],
    bookmarks: Array.isArray(epub.bookmarks) ? epub.bookmarks.map(bm => ({ ...bm, pageIndex: bm.pageIndex || 0 })) : []
  };
}
function setBookIsEnglish(id, value){
  const book = state.books.find(b=>b.id===id);
  if(!book) return;
  book.isEnglish = !!value;
  saveData(); render();
}
function todayStr(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function openLibrary(){
  finishReadingActivity();
  finishWritingActivity();
  state.view = 'library'; state.bookSearch = ''; state.quoteSearch = '';
  render();
}
function openAgenda(){
  finishReadingActivity();
  finishWritingActivity();
  rolloverAgendaOverdueTasks();
  ensureAgendaReviewTasks();
  const now=new Date();
  if(!state.agendaCursor) state.agendaCursor={year:now.getFullYear(),month:now.getMonth()};
  if(!state.agendaSelectedDate) state.agendaSelectedDate=agendaDateKey(now);
  if(!state.agendaView) state.agendaView='week';
  if(!state.agendaWeekStart){ const monday=new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7)); state.agendaWeekStart=agendaDateKey(monday); }
  state.view = 'agenda';
  render();
}
function openAgendaDeckStudy(deckId){
  state.currentDeckId = deckId;
  state.view = 'deck';
  state.tab = 'study';
  render();
}
function formatActivityDuration(durationMs){
  const minutes = Math.max(1, Math.round((durationMs||0) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${minutes} min`;
}
function formatActivityTime(timestamp){
  return new Date(timestamp).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}
function agendaDateKey(value){
  const d=value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function agendaDateFromKey(key){
  const parts=String(key||'').split('-').map(Number);
  return parts.length===3 ? new Date(parts[0],parts[1]-1,parts[2]) : new Date();
}
function getAgendaEventDateKey(event){
  if(event?.date && typeof event.date==='object'){
    if(typeof event.date.toDate==='function') return agendaDateKey(event.date.toDate());
    if(Number.isFinite(event.date.seconds)) return agendaDateKey(Number(event.date.seconds)*1000);
  }
  const raw=String(event?.date||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Aceita também datas que possam ter sido salvas por versões antigas ou
  // por uma ação da IA em formato brasileiro/ISO completo.
  const br=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(br) return `${br[3]}-${String(br[2]).padStart(2,'0')}-${String(br[1]).padStart(2,'0')}`;
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?agendaDateKey(parsed):'';
}
function rolloverAgendaOverdueTasks(){
  const today=agendaDateKey(new Date());
  let moved=0;
  state.agendaEvents.forEach(event=>{
    const eventDate=getAgendaEventDateKey(event);
    // Registros concluídos são histórico e ficam no dia em que aconteceram.
    // Apenas pendências anteriores voltam para “A fazer”.
    if(!event.completedAt && eventDate && eventDate<today){
      event.date=null;
      event.time=null;
      event.endTime=null;
      event.updatedAt=Date.now();
      moved++;
    }
  });
  if(moved) saveData();
  return moved;
}
function getAgendaCursor(){
  const now=new Date();
  const c=state.agendaCursor;
  return c && Number.isInteger(c.year) && Number.isInteger(c.month) ? c : {year:now.getFullYear(),month:now.getMonth()};
}
function changeAgendaMonth(delta){
  const cursor=getAgendaCursor();
  const next=new Date(cursor.year,cursor.month+delta,1);
  state.agendaCursor={year:next.getFullYear(),month:next.getMonth()};
  state.agendaSelectedDate=agendaDateKey(next);
  render();
}
function goToAgendaToday(){
  const now=new Date();
  state.agendaCursor={year:now.getFullYear(),month:now.getMonth()};
  state.agendaSelectedDate=agendaDateKey(now);
  const monday=new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7)); state.agendaWeekStart=agendaDateKey(monday);
  render();
}
function selectAgendaDate(key){ state.agendaSelectedDate=key; render(); }
function changeAgendaWeek(delta){
  const d=agendaDateFromKey(state.agendaWeekStart||agendaDateKey(new Date()));
  d.setDate(d.getDate()+Number(delta||0)*7);
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  state.agendaWeekStart=agendaDateKey(d);
  state.agendaSelectedDate=state.agendaWeekStart;
  state.agendaCursor={year:d.getFullYear(),month:d.getMonth()};
  render();
}
function setAgendaView(view){
  state.agendaView=view;
  if(view==='report' && !state.agendaReportPeriod) state.agendaReportPeriod='24h';
  render();
}
function setAgendaReportPeriod(period){ state.agendaReportPeriod=period==='week'?'week':'24h'; render(); }
function getCompanionUsageForPeriod(period){
  const now=Date.now();
  const periodMs=period==='week' ? 7*24*60*60*1000 : 24*60*60*1000;
  const since=now-periodMs;
  const totals=new Map();
  (state.companionReports||[]).forEach(report=>(report.sessions||[]).forEach(session=>{
    if(!isMeaningfulCompanionSession(session)) return;
    const startedAt=Number(session.startedAt), endedAt=Number(session.endedAt);
    if(!Number.isFinite(startedAt)||!Number.isFinite(endedAt)||endedAt<=since) return;
    const duration=Math.max(0,endedAt-Math.max(startedAt,since));
    if(!duration) return;
    const packageName=String(session.packageName||'');
    const item=totals.get(packageName)||{packageName,name:getCompanionAppName(session),durationMs:0};
    item.durationMs+=duration;
    totals.set(packageName,item);
  }));
  return [...totals.values()].sort((a,b)=>b.durationMs-a.durationMs);
}
function getLettherUsageForPeriod(period){
  const now=Date.now();
  const since=now-(period==='week'?7:1)*24*60*60*1000;
  const labels={
    writing:{name:'✍️ Escrita',key:'writing'}, reading:{name:'📖 Leitura',key:'reading'},
    notes:{name:'📓 Notas',key:'notes'}, flashcards:{name:'🧠 Flashcards',key:'flashcards'}
  };
  const totals=new Map();
  (state.activities||[]).forEach(activity=>{
    const endedAt=Number(activity.endedAt)||Number(activity.at)||0;
    const duration=Math.max(0,Number(activity.durationMs)||0);
    const startedAt=Number(activity.startedAt)||Math.max(0,endedAt-duration);
    if(!endedAt||endedAt<=since) return;
    const counted=Math.max(0,endedAt-Math.max(startedAt,since));
    if(!counted) return;
    const label=activity.type==='routine'
      ? {key:`routine:${activity.routineId||activity.title||'other'}`,name:`${activity.icon||'✅'} ${activity.title||'Rotina'}`}
      : (labels[activity.type]||{key:activity.type||'other',name:'🌿 Letther B'});
    const item=totals.get(label.key)||{name:label.name,durationMs:0};
    item.durationMs+=counted;
    totals.set(label.key,item);
  });
  return [...totals.values()].sort((a,b)=>b.durationMs-a.durationMs);
}
function renderAgendaReportView(){
  const period=state.agendaReportPeriod==='week'?'week':'24h';
  const usage=getCompanionUsageForPeriod(period);
  const lettherUsage=getLettherUsageForPeriod(period);
  const companionTotal=usage.reduce((sum,item)=>sum+item.durationMs,0);
  const lettherTotal=lettherUsage.reduce((sum,item)=>sum+item.durationMs,0);
  const max=Math.max(...usage.map(item=>item.durationMs),1);
  const lettherMax=Math.max(...lettherUsage.map(item=>item.durationMs),1);
  const top=[...usage,...lettherUsage].sort((a,b)=>b.durationMs-a.durationMs)[0];
  const label=period==='week'?'últimos 7 dias':'últimas 24 horas';
  return `<div class="agenda-report"><button class="ghost-btn mobile-back-btn" onclick="backToHome()">← Menu</button><div class="deck-header" style="margin-bottom:14px;"><div><h2 style="margin:0 0 5px;">📊 Relatório</h2><p>Visão conjunta do celular e das atividades feitas no Letther B.</p></div><div style="display:flex; gap:6px; align-items:center;"><button class="ghost-btn ${period==='24h'?'active-mode':''}" style="padding:6px 9px; font-size:12px;" onclick="setAgendaReportPeriod('24h')">24 horas</button><button class="ghost-btn ${period==='week'?'active-mode':''}" style="padding:6px 9px; font-size:12px;" onclick="setAgendaReportPeriod('week')">Semana</button><button class="ghost-btn" style="padding:6px 9px; font-size:12px;" onclick="setAgendaView('week')">Agenda</button></div></div><div class="agenda-report-summary"><div class="agenda-report-stat"><strong>${formatActivityDuration(companionTotal)}</strong><span>uso no celular</span></div><div class="agenda-report-stat"><strong>${formatActivityDuration(lettherTotal)}</strong><span>atividades no Letther B</span></div><div class="agenda-report-stat"><strong>${top?escapeHtml(top.name):'—'}</strong><span>${top?formatActivityDuration(top.durationMs):'Nenhum registro'}</span></div></div><section class="usage-chart"><h3>Uso no celular</h3><p class="usage-chart-subtitle">${label}. Apenas os aplicativos escolhidos por você são mostrados.</p>${usage.length?usage.map(item=>`<div class="usage-row"><span class="usage-app">📱 ${escapeHtml(item.name)}</span><span class="usage-track"><i class="usage-bar" style="width:${Math.max(2,(item.durationMs/max)*100)}%"></i></span><span class="usage-duration">${formatActivityDuration(item.durationMs)}</span></div>`).join(''):`<p style="margin:0; color:var(--text-faint); font-size:13px;">Ainda não há uso do celular sincronizado neste período.</p>`}</section><section class="usage-chart" style="margin-top:14px;"><h3>Atividades no Letther B</h3><p class="usage-chart-subtitle">Escrita, leitura, flashcards e rotina registrados em ${label}.</p>${lettherUsage.length?lettherUsage.map(item=>`<div class="usage-row"><span class="usage-app">${escapeHtml(item.name)}</span><span class="usage-track"><i class="usage-bar letther" style="width:${Math.max(2,(item.durationMs/lettherMax)*100)}%"></i></span><span class="usage-duration">${formatActivityDuration(item.durationMs)}</span></div>`).join(''):`<p style="margin:0; color:var(--text-faint); font-size:13px;">Ainda não há atividades do Letther B registradas neste período.</p>`}</section></div>`;
}
