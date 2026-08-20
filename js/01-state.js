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
async function loadData(){
  for(let attempt=0; attempt<2; attempt++){
    try{
      if(hasClaudeStorage()){
        const r = await window.storage.get(STORAGE_KEY, false);
        if(r && r.value){
          const d = JSON.parse(r.value);
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
          // descarta notas flutuantes de notas que foram excluídas em outro
          // aparelho enquanto este ficou fechado.
          state.floatingNotes = (Array.isArray(d.floatingNotes) ? d.floatingNotes : []).filter(f=>f && f.noteId && state.notesItems.some(n=>n.id===f.noteId)).map(f=>({
            noteId: f.noteId,
            x: Number(f.x)||80, y: Number(f.y)||90,
            width: Math.max(220, Number(f.width)||300), height: Math.max(180, Number(f.height)||320),
            opacity: Math.min(1, Math.max(0.2, Number(f.opacity)||1)),
            z: Number(f.z)||10
          }));
          // limpa a escaleta ativa se ela foi excluída em outro aparelho enquanto este ficou fechado
          state.activeOutlineId = (d.activeOutlineId && state.notesItems.some(n=>n.id===d.activeOutlineId && n.type==='outline')) ? d.activeOutlineId : null;
          state.activeOutlineScroll = (d.activeOutlineScroll && d.activeOutlineScroll.outlineId) ? { outlineId: d.activeOutlineScroll.outlineId, top: Number(d.activeOutlineScroll.top)||0 } : {outlineId:null, top:0};
          migrateLegacyInlineNoteContent(d.notesItems);
          if(d.geminiApiKey) setApiKey(d.geminiApiKey);
          if(d.geminiApiKey2) setApiKey2(d.geminiApiKey2);
          if(d.booksApiKey) setBooksApiKey(d.booksApiKey);
        }
      } else if(hasFirebaseUser()){
        const snap = await db.collection('users').doc(state.firebaseUser.uid).get();
        if(snap.exists){
          const d = snap.data();
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
          // descarta notas flutuantes de notas que foram excluídas em outro
          // aparelho enquanto este ficou fechado.
          state.floatingNotes = (Array.isArray(d.floatingNotes) ? d.floatingNotes : []).filter(f=>f && f.noteId && state.notesItems.some(n=>n.id===f.noteId)).map(f=>({
            noteId: f.noteId,
            x: Number(f.x)||80, y: Number(f.y)||90,
            width: Math.max(220, Number(f.width)||300), height: Math.max(180, Number(f.height)||320),
            opacity: Math.min(1, Math.max(0.2, Number(f.opacity)||1)),
            z: Number(f.z)||10
          }));
          // limpa a escaleta ativa se ela foi excluída em outro aparelho enquanto este ficou fechado
          state.activeOutlineId = (d.activeOutlineId && state.notesItems.some(n=>n.id===d.activeOutlineId && n.type==='outline')) ? d.activeOutlineId : null;
          state.activeOutlineScroll = (d.activeOutlineScroll && d.activeOutlineScroll.outlineId) ? { outlineId: d.activeOutlineScroll.outlineId, top: Number(d.activeOutlineScroll.top)||0 } : {outlineId:null, top:0};
          migrateLegacyInlineNoteContent(d.notesItems);
          // sincroniza a chave do Gemini entre aparelhos logados na mesma conta —
          // assim não precisa configurar de novo em cada navegador/celular.
          if(d.geminiApiKey) setApiKey(d.geminiApiKey);
          if(d.geminiApiKey2) setApiKey2(d.geminiApiKey2);
          if(d.booksApiKey) setBooksApiKey(d.booksApiKey);
        }
      }
      // Faz a virada de dia logo depois de trazer os dados da conta. Assim,
      // uma tarefa não concluída não depende de a pessoa abrir a Agenda ou de
      // manter o aplicativo aberto até o próximo intervalo do temporizador.
      rolloverAgendaOverdueTasks();
      break; // sucesso, não precisa repetir
    }catch(e){
      if(attempt === 0){ await sleep(600); continue; } // falha temporária: tenta mais uma vez em silêncio
      // segunda falha: segue com o app vazio, sem travar a tela nem assustar com um log de erro
    }
  }
  if(typeof consumePendingWebFlashcardImport==='function') consumePendingWebFlashcardImport();
  render();
}
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
// Gravações podem acontecer quase ao mesmo tempo (por exemplo, uma mensagem do
// agente, seguida de uma nota criada por ele). Enfileirar evita que um snapshot
// antigo termine depois e sobrescreva uma criação mais nova no armazenamento.
let dataSaveQueue = Promise.resolve();
function saveData(){
  const payload = JSON.parse(JSON.stringify({decks: state.decks, cards: state.cards, stats: state.stats, activities: state.activities, agendaEvents: state.agendaEvents, routineActivities: state.routineActivities, routineActive: state.routineActive, routineLastCheckInAt: state.routineLastCheckInAt, globalAiMessages: state.globalAiMessages, books: state.books, notesItems: state.notesItems, sidebarAutoHide: state.sidebarAutoHide, notesChatWidth: state.notesChatWidth, notesChatHidden: state.notesChatHidden, lastDeckId: state.lastDeckId, lastNoteId: state.lastNoteId, floatingNotes: state.floatingNotes, activeOutlineId: state.activeOutlineId, activeOutlineScroll: state.activeOutlineScroll, geminiApiKey: getApiKey(), geminiApiKey2: getApiKey2(), booksApiKey: getBooksApiKey()}));
  const persist = async () => {
    for(let attempt=0; attempt<2; attempt++){
      try{
        if(hasClaudeStorage()){
          await window.storage.set(STORAGE_KEY, JSON.stringify(payload), false);
        } else if(hasFirebaseUser()){
          await db.collection('users').doc(state.firebaseUser.uid).set(payload);
        }
        if(state.saveFailed){ state.saveFailed = false; render(); }
        break; // sucesso
      }catch(e){
        if(attempt === 0){ await sleep(600); continue; }
        state.saveFailed = true; // segunda falha: sinaliza discretamente na UI, sem banner de erro
        render();
      }
    }
    // se o usuário escolheu um arquivo local (File System Access API), mantém ele sincronizado também
    if(state.fileHandle){
      try{
        const writable = await state.fileHandle.createWritable();
        await writable.write(JSON.stringify(payload));
        await writable.close();
      }catch(e){
        console.error('Falha ao sincronizar com o arquivo local', e);
        // não interrompe o fluxo — o armazenamento padrão já cuidou de salvar
      }
    }
  };
  dataSaveQueue = dataSaveQueue.catch(()=>{}).then(persist);
  return dataSaveQueue;
}

