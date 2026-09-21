/* ============ STATE ============ */
const STORAGE_KEY = 'flashcards_app_data';
const DECK_COLORS = ['#F5A623','#6EE7B7','#7DA9FA','#FB7185','#C99CF7','#F5D76E'];
const EXERCISE_TYPES = ['translate','translateAI','reverseTranslate','write','mc','translateOther'];
const EXERCISE_LABELS = { translate:'Tradução direta', translateAI:'Tradução direta com IA', reverseTranslate:'Tradução invertida', write:'Tradução de frase', mc:'Múltipla escolha', translateOther:'Tradução alternativa', 'copy-translation':'Copiar tradução' };
const STANDARD_STUDY_TYPES = ['mc', 'open', 'image'];
const STD_TYPE_LABELS = { mc:'Múltipla escolha', open:'Aberta', 'image-answer':'Com imagem' };
function getCardTranslations(card){
  return String((card&&card.back)||'').split('/').map(t=>t.trim()).filter(Boolean);
}
// card.hints é um array paralelo a getCardTranslations(card) — uma dica curta
// por opção de tradução (a situação/cenário, SEM citar a tradução — não é
// spoiler). O índice 0 é sempre a tradução DIRETA e fica em branco de
// propósito: ela não depende de contexto nenhum.
function getHintForIndex(card, idx){
  if(idx == null || idx <= 0) return '';
  const hints = (card && card.hints) || [];
  return hints[idx] || '';
}
// acha em qual posição de getCardTranslations(card) uma resposta digitada cai —
// usado depois que o usuário responde, pra saber qual dica mostrar (ou
// nenhuma, se a resposta bateu com a tradução direta).
function findTranslationIndexForAnswer(card, answer){
  const list = getCardTranslations(card);
  const norm = normalizeAnswer(answer);
  return list.findIndex(a => normalizeAnswer(a) === norm);
}
function renderHintBox(hint){
  if(!hint) return '';
  return `<div style="background:var(--accent-soft); border:1px solid var(--accent-dim); border-radius:10px; padding:10px 14px; margin-top:10px; font-size:12.5px; color:var(--text); text-align:left; white-space:pre-wrap;">🔎 <strong>Dica:</strong> ${escapeHtml(hint)}</div>`;
}
// usado pela múltipla escolha, que às vezes tem mais de uma resposta certa
// (traduções diferentes do mesmo cartão) — junta as dicas sem repetir.
function collectHints(card, indexes){
  const hints = [];
  const seen = new Set();
  (indexes||[]).forEach(i => {
    const h = getHintForIndex(card, i);
    if(h && !seen.has(h)){ hints.push(h); seen.add(h); }
  });
  return hints;
}

function stripParens(str){
  return String(str||'').replace(/\([^)]*\)/g, '').replace(/\s+/g,' ').trim();
}
function normalizeAnswer(str){
  return String(str||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // remove acentos
    .replace(/[.,!?;:"'()]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}
function diffWords(typedText, correctText){
  // compara palavra por palavra (maior subsequência comum) e marca quais palavras
  // digitadas pelo usuário não batem com a resposta correta, na ordem certa.
  const typedWords = String(typedText||'').split(/\s+/).filter(Boolean);
  const correctWords = String(correctText||'').split(/\s+/).filter(Boolean);
  const a = typedWords.map(normalizeAnswer);
  const b = correctWords.map(normalizeAnswer);
  const n = a.length, m = b.length;
  const dp = Array.from({length: n+1}, () => new Array(m+1).fill(0));
  for(let i=n-1; i>=0; i--){
    for(let j=m-1; j>=0; j--){
      dp[i][j] = a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  const matched = new Array(n).fill(false);
  let i=0, j=0;
  while(i<n && j<m){
    if(a[i]===b[j]){ matched[i]=true; i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]) i++;
    else j++;
  }
  return typedWords.map((w, idx) => ({ text: w, correct: matched[idx] }));
}
function checkLocalTranslation(userInput, correctBack){
  const norm = normalizeAnswer(userInput);
  const options = String(correctBack||'').split('/').map(o=>normalizeAnswer(o)).filter(Boolean);
  return options.includes(norm);
}

let state = {
  decks: [],
  cards: {},          // deckId -> [card]
  currentDeckId: null,
  view: 'home',        // home | deck | study | results | library | book
  tab: 'cards',         // cards | study (within deck view)
  modal: null,          // 'new-deck' | 'edit-deck'
  session: null,
  editingCardId: null,
  cardSearch: '',
  cardFilterFlagged: false,
  cardFilterLearned: false,
  cardFilterPriority: false,
  _searchFocused: false,
  cardFormMode: 'text',   // 'text' | 'image' — só relevante em baralhos padrão
  imageEditorUrl: '',
  newPinPos: null,
  previousSession: null,
  stats: { totalPoints: 0 },
  activities: [],
  companionReports: [],
  agendaEvents: [],
  routineActivities: [],
  routineActive: null,
  routineLastCheckInAt: null,
  routineSearch: '',
  pwaInstallAvailable: false,
  globalAiMessages: [],
  fileHandle: null,
  pendingFileHandle: null,
  firebaseUser: null,
  authReady: false,
  dataReady: false,
  dataLoadFailed: false,
  syncStatus: 'loading', // loading | saving | saved | offline | error | conflict
  syncError: '',
  lastSavedAt: null,
  books: [],           // estante de livros ("Leituras")
  currentBookId: null,
  bookSearch: '',
  quoteSearch: '',
  notesItems: [],      // caderno de notas: lista achatada de pastas/notas, ligadas por parentId
  currentNoteId: null,
  notesCollapsedFolders: [], // ids de pastas fechadas no explorer (só estado de UI)
  notesEditorMode: 'split', // 'source' | 'split' | 'preview'
  notesPageView: false,
  sidebarAutoHide: false,
  mobileHomeSection: null,
  notesChatWidth: 340,
  notesChatHidden: false,
  // A tela inicial permanece neutra. Estes ids só servem para retomar o
  // último conteúdo quando a pessoa escolher Baralhos ou Notas novamente.
  lastDeckId: null,
  lastNoteId: null,
  // notas flutuantes ("post-it"): só no desktop, ficam por cima de qualquer
  // tela do app (baralho, agenda, etc.) enquanto a aba estiver aberta.
  floatingNotes: [], // [{noteId,x,y,width,height,opacity,z}]
  floatingColorMenuFor: null, // id da nota flutuante com o popup de cor aberto (só estado de UI)
  notesHighlightId: null, // pisca a linha da nota na árvore depois de "Localizar no gerenciador" (só estado de UI)
  // modo escaleta ativa: só uma por vez, pra consultar sem sair da nota que
  // está sendo escrita. activeOutlineId é a designação durável (persiste);
  // activeOutlinePanelOpen é só o estado de "o painel do desktop está
  // mostrando a escaleta agora, em vez do chat" (não persiste, como o resto
  // do modo de exibição das notas).
  activeOutlineId: null,
  activeOutlineScroll: {outlineId:null, top:0}, // lembra onde parou de ler no celular
  activeOutlinePanelOpen: false,
  // histórico de navegação entre notas (setas ← →, só desktop) -- estado de
  // sessão, como o modo de exibição das notas: não precisa sobreviver a um
  // recarregamento, igual o histórico de abas de um navegador começa vazio.
  noteNavHistory: [],
  noteNavIndex: -1
};

function uid(){ return Math.random().toString(36).slice(2,10); }

/* alert()/confirm() nativos do navegador são bloqueados dentro do sandbox de
   artifacts do Claude.ai, então usamos toast + modal próprios do app. */
let toastTimer = null;
/*
 * Política de avisos do app:
 * - mensagens de sucesso, progresso e informação não exibem banner;
 * - somente mensagens explicitamente marcadas como erro continuam visíveis.
 *
 * O render() é mantido também nos avisos silenciosos porque algumas ações do
 * app usavam o toast para atualizar a interface depois de alterar os dados.
 */
function showToast(message, type){
  const toastType = type || 'info';
  if(toastType !== 'error'){
    // Nunca apaga um erro que ainda esteja sendo mostrado.
    if(state.toast && state.toast.type !== 'error') state.toast = null;
    render();
    return;
  }

  state.toast = { message, type:'error' };
  render();
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ state.toast = null; render(); }, 3800);
}
let deferredPwaInstallPrompt = null;
async function requestPwaInstall(){
  if(!deferredPwaInstallPrompt){ showToast('Use “Adicionar à Tela de Início” no menu do navegador para instalar o Letther B.'); return; }
  const promptEvent=deferredPwaInstallPrompt;
  deferredPwaInstallPrompt=null;
  state.pwaInstallAvailable=false;
  await promptEvent.prompt();
  await promptEvent.userChoice.catch(()=>null);
  render();
}
function renderToast(){
  const t = state.toast;
  if(!t || t.type !== 'error') return '';
  return `<div class="toast toast-error" role="alert" aria-live="assertive">${escapeHtml(t.message)}</div>`;
}
let pendingConfirmAction = null;
function askConfirm(message, onConfirm, confirmLabel){
  pendingConfirmAction = onConfirm;
  state.modal = { type:'confirm', message, confirmLabel: confirmLabel||'Excluir' };
  render();
}
function confirmPendingAction(){
  const fn = pendingConfirmAction;
  pendingConfirmAction = null;
  state.modal = null;
  render();
  if(fn) fn();
}
function cancelPendingAction(){
  pendingConfirmAction = null;
  state.modal = null;
  render();
}

function hasClaudeStorage(){
  return typeof window.storage !== 'undefined' && window.storage && typeof window.storage.get === 'function';
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function hasFirebaseUser(){
  return !hasClaudeStorage() && !!state.firebaseUser;
}

const LOCAL_PENDING_PREFIX = 'letther_b_pending_v1:';
const LOCAL_GOOD_PREFIX = 'letther_b_last_good_v1:';
const SYNC_CLIENT_KEY = 'letther_b_sync_client_id';
const FIRESTORE_SAFE_PAYLOAD_BYTES = 950000;
let dataSyncRevision = 0;
let dataSaveVersion = 0;
let pendingRemoteSave = null;
let remoteSaveRunning = false;
let remoteSaveTimer = null;
let remoteRetryTimer = null;
let localRecoveryTimer = null;
let lastAcknowledgedRecoveryRecord = null;

function getSyncClientId(){
  try{
    let value=localStorage.getItem(SYNC_CLIENT_KEY);
    if(!value){ value=`${Date.now().toString(36)}-${uid()}`; localStorage.setItem(SYNC_CLIENT_KEY,value); }
    return value;
  }catch(error){ return `ephemeral-${uid()}`; }
}
const syncClientId=getSyncClientId();
function recoveryStorageKey(prefix){
  return `${prefix}${state.firebaseUser?.uid||'anonymous'}`;
}
function buildDataPayload(){
  return JSON.parse(JSON.stringify({decks: state.decks, cards: state.cards, stats: state.stats, activities: state.activities, agendaEvents: state.agendaEvents, routineActivities: state.routineActivities, routineActive: state.routineActive, routineLastCheckInAt: state.routineLastCheckInAt, globalAiMessages: state.globalAiMessages, books: state.books, notesItems: state.notesItems, sidebarAutoHide: state.sidebarAutoHide, notesChatWidth: state.notesChatWidth, notesChatHidden: state.notesChatHidden, lastDeckId: state.lastDeckId, lastNoteId: state.lastNoteId, floatingNotes: state.floatingNotes, activeOutlineId: state.activeOutlineId, activeOutlineScroll: state.activeOutlineScroll, geminiApiKey: getApiKey(), geminiApiKey2: getApiKey2(), booksApiKey: getBooksApiKey()}));
}
function payloadByteLength(payload){
  try{ return new TextEncoder().encode(JSON.stringify(payload)).length; }
  catch(error){ return JSON.stringify(payload).length; }
}
function makeRecoveryRecord(payload, baseRevision){
  const contents={};
  if(typeof noteContentCache!=='undefined') Object.entries(noteContentCache).forEach(([id,value])=>{ if(typeof value==='string') contents[id]=value; });
  return {savedAt:Date.now(),baseRevision:Number(baseRevision)||0,clientId:syncClientId,payload,noteContents:contents};
}
function persistPendingRecovery(payload, baseRevision){
  if(!state.firebaseUser) return null;
  const record=makeRecoveryRecord(payload,baseRevision);
  try{
    localStorage.setItem(recoveryStorageKey(LOCAL_PENDING_PREFIX),JSON.stringify(record));
    state.localBackupFailed=false;
    return record;
  }catch(error){
    console.error('Falha ao criar cópia de recuperação local',error);
    state.localBackupFailed=true;
    return null;
  }
}
function scheduleLocalRecoverySnapshot(){
  if(!hasFirebaseUser() || !state.dataReady) return;
  if(localRecoveryTimer) clearTimeout(localRecoveryTimer);
  localRecoveryTimer=setTimeout(()=>{ localRecoveryTimer=null; persistPendingRecovery(buildDataPayload(),dataSyncRevision); },150);
}
function flushLocalRecoverySnapshot(){
  if(localRecoveryTimer){ clearTimeout(localRecoveryTimer); localRecoveryTimer=null; }
  if(hasFirebaseUser() && state.dataReady) persistPendingRecovery(buildDataPayload(),dataSyncRevision);
}
function readPendingRecovery(){
  if(!state.firebaseUser) return null;
  try{
    const raw=localStorage.getItem(recoveryStorageKey(LOCAL_PENDING_PREFIX));
    if(!raw) return null;
    const record=JSON.parse(raw);
    return record&&record.payload ? record : null;
  }catch(error){ console.error('Cópia de recuperação local inválida',error); return null; }
}
function readLastGoodRecovery(){
  if(!state.firebaseUser) return null;
  try{
    const raw=localStorage.getItem(recoveryStorageKey(LOCAL_GOOD_PREFIX));
    return raw ? JSON.parse(raw) : null;
  }catch(error){ console.error('Cópia local confirmada inválida',error); return null; }
}
function acknowledgeRecovery(record,committedRevision){
  if(!record || !state.firebaseUser) return;
  try{
    const confirmed={...record,committedRevision:Number(committedRevision)||0,acknowledgedAt:Date.now()};
    localStorage.setItem(recoveryStorageKey(LOCAL_GOOD_PREFIX),JSON.stringify(confirmed));
    lastAcknowledgedRecoveryRecord=confirmed;
    maybeClearPendingRecovery();
  }catch(error){ console.error('Falha ao atualizar cópia local confirmada',error); }
}
function maybeClearPendingRecovery(){
  if(!lastAcknowledgedRecoveryRecord || pendingRemoteSave || remoteSaveRunning || state.noteSaveFailed) return;
  if(typeof noteContentSaveQueues!=='undefined' && noteContentSaveQueues.size) return;
  try{
    const current=readPendingRecovery();
    if(!current || current.savedAt<=lastAcknowledgedRecoveryRecord.savedAt){
      localStorage.removeItem(recoveryStorageKey(LOCAL_PENDING_PREFIX));
      lastAcknowledgedRecoveryRecord=null;
    }
  }catch(error){ console.error('Falha ao concluir cópia local',error); }
}
function mergeArrayById(remoteItems,localItems){
  const result=[],positions=new Map();
  [...(Array.isArray(remoteItems)?remoteItems:[]),...(Array.isArray(localItems)?localItems:[])].forEach(item=>{
    if(!item || !item.id){ result.push(item); return; }
    if(positions.has(item.id)) result[positions.get(item.id)]=item;
    else { positions.set(item.id,result.length); result.push(item); }
  });
  return result;
}
function mergeCardsPreservingData(remoteCards,localCards){
  const result={};
  const keys=new Set([...Object.keys(remoteCards||{}),...Object.keys(localCards||{})]);
  keys.forEach(key=>{ result[key]=mergeArrayById(remoteCards?.[key],localCards?.[key]); });
  return result;
}
function mergeRecoveryPayload(remote,local){
  const merged={...(remote||{}),...(local||{})};
  merged.decks=mergeArrayById(remote?.decks,local?.decks);
  merged.cards=mergeCardsPreservingData(remote?.cards,local?.cards);
  merged.notesItems=mergeArrayById(remote?.notesItems,local?.notesItems);
  merged.books=mergeArrayById(remote?.books,local?.books);
  merged.activities=mergeArrayById(remote?.activities,local?.activities).sort((a,b)=>(Number(b?.at)||0)-(Number(a?.at)||0)).slice(0,240);
  merged.agendaEvents=mergeArrayById(remote?.agendaEvents,local?.agendaEvents);
  merged.routineActivities=mergeArrayById(remote?.routineActivities,local?.routineActivities);
  return merged;
}
function applyDataPayload(d){
  d=d||{};
  state.decks = d.decks || [];
  state.cards = d.cards || {};
  state.stats = d.stats || { totalPoints: 0 };
  state.activities = Array.isArray(d.activities) ? d.activities : [];
  state.agendaEvents = Array.isArray(d.agendaEvents) ? d.agendaEvents : [];
  state.routineActivities = Array.isArray(d.routineActivities) ? d.routineActivities : [];
  state.routineActive = d.routineActive || null;
  state.routineLastCheckInAt = Number(d.routineLastCheckInAt) || null;
  state.globalAiMessages = Array.isArray(d.globalAiMessages) ? d.globalAiMessages : [];
  state.books = (d.books || []).map(normalizeBook);
  state.notesItems = (d.notesItems || []).map(normalizeNoteItem);
  state.sidebarAutoHide = !!d.sidebarAutoHide;
  state.notesChatWidth = Math.max(280,Math.min(560,Number(d.notesChatWidth)||340));
  state.notesChatHidden = !!d.notesChatHidden;
  state.lastDeckId = d.lastDeckId || null;
  state.lastNoteId = d.lastNoteId || null;
  state.floatingNotes = (Array.isArray(d.floatingNotes) ? d.floatingNotes : []).filter(f=>f && f.noteId && state.notesItems.some(n=>n.id===f.noteId)).map(f=>({
    noteId:f.noteId,x:Number(f.x)||80,y:Number(f.y)||90,width:Math.max(220,Number(f.width)||300),height:Math.max(180,Number(f.height)||320),opacity:Math.min(1,Math.max(0.2,Number(f.opacity)||1)),z:Number(f.z)||10
  }));
  state.activeOutlineId = (d.activeOutlineId && state.notesItems.some(n=>n.id===d.activeOutlineId && n.type==='outline')) ? d.activeOutlineId : null;
  state.activeOutlineScroll = (d.activeOutlineScroll && d.activeOutlineScroll.outlineId) ? {outlineId:d.activeOutlineScroll.outlineId,top:Number(d.activeOutlineScroll.top)||0} : {outlineId:null,top:0};
  migrateLegacyInlineNoteContent(d.notesItems);
  if(d.geminiApiKey) setApiKey(d.geminiApiKey);
  if(d.geminiApiKey2) setApiKey2(d.geminiApiKey2);
  if(d.booksApiKey) setBooksApiKey(d.booksApiKey);
}
async function loadData(){
  state.dataReady=false;
  state.dataLoadFailed=false;
  state.syncStatus='loading';
  let recoveredRecord=null;
  for(let attempt=0; attempt<2; attempt++){
    try{
      if(hasClaudeStorage()){
        const r = await window.storage.get(STORAGE_KEY, false);
        if(r && r.value){
          applyDataPayload(JSON.parse(r.value));
        }
      } else if(hasFirebaseUser()){
        const snap = await db.collection('users').doc(state.firebaseUser.uid).get();
        let d=snap.exists ? snap.data() : {};
        dataSyncRevision=Number(d?._sync?.revision)||0;
        recoveredRecord=readPendingRecovery();
        // Uma versão antiga do app ainda aberta em outro dispositivo pode usar
        // set() sem o campo _sync e fazer a revisão do servidor regredir a zero.
        // Nesse caso recuperamos automaticamente a última cópia confirmada.
        if(!recoveredRecord){
          const lastGood=readLastGoodRecovery();
          if(lastGood && Number(lastGood.committedRevision)>dataSyncRevision) recoveredRecord=lastGood;
        }
        if(recoveredRecord){
          d=mergeRecoveryPayload(d,recoveredRecord.payload);
          if(typeof noteContentCache!=='undefined') Object.assign(noteContentCache,recoveredRecord.noteContents||{});
          state.recoveredLocalDraft=true;
        }
        applyDataPayload(d);
      }
      state.dataReady=true;
      state.syncStatus=recoveredRecord ? 'saving' : 'saved';
      state.syncError='';
      // Faz a virada de dia logo depois de trazer os dados da conta. Assim,
      // uma tarefa não concluída não depende de a pessoa abrir a Agenda ou de
      // manter o aplicativo aberto até o próximo intervalo do temporizador.
      rolloverAgendaOverdueTasks();
      break; // sucesso, não precisa repetir
    }catch(e){
      if(attempt === 0){ await sleep(600); continue; } // falha temporária: tenta mais uma vez em silêncio
      console.error('Falha ao carregar dados da conta',e);
      state.dataLoadFailed=true;
      state.syncStatus='error';
      state.syncError='Não foi possível carregar seus dados. Nenhuma alteração será permitida até reconectar.';
      render();
      return false;
    }
  }
  if(recoveredRecord){
    saveData();
    Object.entries(recoveredRecord.noteContents||{}).forEach(([noteId,content])=>{
      if(typeof saveNoteContentToR2==='function') saveNoteContentToR2(noteId,content);
    });
  }
  if(typeof consumePendingWebFlashcardImport==='function') consumePendingWebFlashcardImport();
  render();
  return true;
}
function retryLoadData(){ if(state.firebaseUser) loadData().then(ok=>{ if(ok) loadCompanionReports(); }); }
async function loadCompanionReports(){
  if(!hasFirebaseUser() || !db) return;
  try{
    const snapshot=await db.collection('users').doc(state.firebaseUser.uid).collection('companionReports').orderBy('date','desc').limit(14).get();
    state.companionReports=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
    syncCompanionSessionsToAgenda(state.companionReports);
  }catch(error){
    // A integração é opcional: sem Companion ou sem regra liberada, o Letther B
    // continua funcionando normalmente e simplesmente não recebe relatórios.
    console.warn('Relatórios do Companion indisponíveis', error);
    state.companionReports=[];
  }
}
const COMPANION_MIN_SESSION_MS=60*1000;
const COMPANION_MONITORED_PACKAGES=new Set(['com.whatsapp','com.google.android.youtube','com.android.chrome','com.amazon.kindle','com.spotify.music','com.instagram.android']);
const COMPANION_FRIENDLY_NAMES={
  'com.whatsapp':'WhatsApp', 'com.google.android.youtube':'YouTube',
  'com.android.chrome':'Chrome', 'com.amazon.kindle':'Kindle',
  'com.spotify.music':'Spotify', 'com.instagram.android':'Instagram'
};
function getCompanionAppName(item){
  const packageName=String(item?.packageName||'');
  return COMPANION_FRIENDLY_NAMES[packageName] || String(item?.appName||packageName||'Aplicativo');
}
function isMeaningfulCompanionSession(session){
  const duration=Number(session.durationMs)||((Number(session.endedAt)||0)-(Number(session.startedAt)||0));
  return duration>=COMPANION_MIN_SESSION_MS && COMPANION_MONITORED_PACKAGES.has(String(session.packageName||''));
}
function syncCompanionSessionsToAgenda(reports){
  let changed=false;
  // Recria somente os eventos automáticos do Companion a partir dos relatórios
  // filtrados. Eventos criados manualmente pelo usuário não são tocados.
  const beforeCleanup=state.agendaEvents.length;
  state.agendaEvents=state.agendaEvents.filter(event=>event.source!=='companion');
  if(state.agendaEvents.length!==beforeCleanup) changed=true;
  (reports||[]).forEach(report=>{
    (report.sessions||[]).forEach(session=>{
      const startedAt=Number(session.startedAt), endedAt=Number(session.endedAt);
      if(!Number.isFinite(startedAt)||!Number.isFinite(endedAt)||endedAt<=startedAt||!isMeaningfulCompanionSession(session)) return;
      const sessionId=String(session.id||`${session.packageName||'app'}:${startedAt}`);
      const existing=state.agendaEvents.find(event=>event.source==='companion'&&event.companionSessionId===sessionId);
      const appName=getCompanionAppName(session);
      const value={
        title:`📱 ${appName}`,
        date:agendaDateKey(startedAt),
        time:new Date(startedAt).toTimeString().slice(0,5),
        endTime:new Date(endedAt).toTimeString().slice(0,5),
        notes:`Uso registrado pelo Letther B Companion · ${appName}${session.packageName?` (${session.packageName})`:''}`,
        completedAt:endedAt,
        source:'companion', companionSessionId:sessionId,
        companionPackage:String(session.packageName||''),
        companionDurationMs:Math.max(0,endedAt-startedAt),
        companionActive:!!session.isActive,
        createdAt:existing?.createdAt||endedAt, updatedAt:Date.now()
      };
      if(existing){
        // Sessões ainda em andamento chegam novamente a cada sincronização com
        // um horário final maior; persiste essa atualização na agenda.
        if(existing.endTime!==value.endTime || existing.companionActive!==value.companionActive || existing.completedAt!==value.completedAt) changed=true;
        Object.assign(existing,value);
      }else { state.agendaEvents.unshift({id:uid(),...value}); changed=true; }
    });
  });
  if(changed) saveData();
}
function updateSyncIndicator(){
  const el=document.getElementById('sync-status-indicator');
  if(!el) return;
  const labels={loading:'Carregando…',saving:'Salvando…',saved:'Salvo no servidor',offline:'Offline · protegido neste dispositivo',error:'Falha ao salvar',conflict:'Conflito de sincronização'};
  el.textContent=labels[state.syncStatus]||labels.saved;
  el.className=`sync-status sync-${state.syncStatus}`;
}
function setSyncProblem(status,message,error){
  state.syncStatus=status;
  state.syncError=message||'';
  state.saveFailed=status==='error'||status==='conflict';
  if(error) console.error(message,error);
  render();
}
function scheduleRemoteSave(delay){
  if(remoteSaveTimer) clearTimeout(remoteSaveTimer);
  remoteSaveTimer=setTimeout(()=>{ remoteSaveTimer=null; flushRemoteSave(); },delay==null?250:delay);
}
async function flushRemoteSave(){
  if(remoteSaveRunning || !pendingRemoteSave || !hasFirebaseUser() || !state.dataReady) return;
  if(!navigator.onLine){ state.syncStatus='offline'; updateSyncIndicator(); return; }
  const entry=pendingRemoteSave;
  pendingRemoteSave=null;
  remoteSaveRunning=true;
  const expectedRevision=dataSyncRevision;
  try{
    const ref=db.collection('users').doc(state.firebaseUser.uid);
    let committedRevision=expectedRevision+1;
    await db.runTransaction(async transaction=>{
      const snap=await transaction.get(ref);
      const remoteRevision=snap.exists ? (Number(snap.data()?._sync?.revision)||0) : 0;
      if(remoteRevision!==expectedRevision){
        const conflict=new Error('sync_conflict'); conflict.code='sync_conflict'; throw conflict;
      }
      committedRevision=remoteRevision+1;
      transaction.set(ref,{...entry.payload,_sync:{revision:committedRevision,clientId:syncClientId,clientUpdatedAt:Date.now(),serverUpdatedAt:firebase.firestore.FieldValue.serverTimestamp()}});
    });
    dataSyncRevision=committedRevision;
    state.lastSavedAt=Date.now();
    state.saveFailed=false;
    state.syncError='';
    acknowledgeRecovery(entry.record,committedRevision);
    if(pendingRemoteSave){
      pendingRemoteSave.record=persistPendingRecovery(pendingRemoteSave.payload,dataSyncRevision)||pendingRemoteSave.record;
      state.syncStatus='saving';
    }else state.syncStatus='saved';
    updateSyncIndicator();
  }catch(error){
    if(!pendingRemoteSave || pendingRemoteSave.version<entry.version) pendingRemoteSave=entry;
    if(error?.code==='sync_conflict'){
      setSyncProblem('conflict','Outra aba ou aparelho alterou os dados. Esta cópia ficou protegida localmente; recarregue para mesclar sem perder nada.',error);
    }else{
      state.syncStatus=navigator.onLine?'error':'offline';
      state.syncError=navigator.onLine?'O servidor não confirmou o salvamento. A cópia local está protegida e tentaremos novamente.':'Sem conexão. As mudanças estão protegidas neste dispositivo e serão enviadas ao reconectar.';
      state.saveFailed=navigator.onLine;
      if(navigator.onLine) console.error('Falha ao salvar dados no Firestore',error);
      render();
      if(remoteRetryTimer) clearTimeout(remoteRetryTimer);
      remoteRetryTimer=setTimeout(()=>{ remoteRetryTimer=null; flushRemoteSave(); },5000);
    }
  }finally{
    remoteSaveRunning=false;
    maybeClearPendingRecovery();
    if(pendingRemoteSave && state.syncStatus!=='conflict' && navigator.onLine) scheduleRemoteSave(0);
  }
}
function saveData(){
  const payload=buildDataPayload();
  if(hasClaudeStorage()){
    return window.storage.set(STORAGE_KEY,JSON.stringify(payload),false).catch(error=>{ setSyncProblem('error','Não foi possível salvar as últimas mudanças.',error); return false; });
  }
  if(!hasFirebaseUser() || !state.dataReady){
    setSyncProblem('error','Os dados ainda não foram carregados; o salvamento foi bloqueado para evitar sobrescrita.');
    return Promise.resolve(false);
  }
  const record=persistPendingRecovery(payload,dataSyncRevision);
  if(!record){ setSyncProblem('error','Não foi possível criar a cópia local de segurança. Libere espaço no navegador antes de continuar.'); return Promise.resolve(false); }
  const bytes=payloadByteLength(payload);
  if(bytes>FIRESTORE_SAFE_PAYLOAD_BYTES){
    setSyncProblem('error',`O banco atingiu ${(bytes/1024).toFixed(0)} KB e está perto do limite do Firestore. A mudança ficou protegida localmente, mas não foi enviada.`);
    return Promise.resolve(false);
  }
  dataSaveVersion++;
  pendingRemoteSave={payload,record,version:dataSaveVersion};
  state.syncStatus=navigator.onLine?'saving':'offline';
  state.syncError=navigator.onLine?'':'Sem conexão. As mudanças estão protegidas neste dispositivo e serão enviadas ao reconectar.';
  updateSyncIndicator();
  scheduleRemoteSave();
  if(state.fileHandle){
    (async()=>{ try{ const writable=await state.fileHandle.createWritable(); await writable.write(JSON.stringify(payload)); await writable.close(); }catch(error){ console.error('Falha ao sincronizar com o arquivo local',error); } })();
  }
  // A alteração já está durável no armazenamento local. A confirmação remota é
  // refletida separadamente pelo indicador de sincronização.
  return Promise.resolve(true);
}
window.addEventListener('online',()=>{ if(pendingRemoteSave){ state.syncStatus='saving'; updateSyncIndicator(); scheduleRemoteSave(0); } });
window.addEventListener('offline',()=>{ if(pendingRemoteSave){ state.syncStatus='offline'; updateSyncIndicator(); } });
window.addEventListener('pagehide',flushLocalRecoverySnapshot);
