/* ============ IMPORT / EXPORT ============ */
function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function safeFileName(name){ return name.replace(/[^a-z0-9\-_]/gi,'_'); }

function exportDeckTxt(deckId){
  const deck = state.decks.find(d=>d.id===deckId);
  const cards = state.cards[deckId] || [];
  const content = cards.map(c => `${c.front}\t${c.back}`).join('\n');
  downloadFile(`${safeFileName(deck.name)}.txt`, content, 'text/plain;charset=utf-8');
}
function exportDeckJson(deckId){
  const deck = state.decks.find(d=>d.id===deckId);
  const cards = state.cards[deckId] || [];
  downloadFile(`${safeFileName(deck.name)}.json`, JSON.stringify({ deck, cards }, null, 2), 'application/json');
}
function exportAllBackup(){
  downloadFile('recall_backup.json', JSON.stringify({ decks: state.decks, cards: state.cards, stats: state.stats, books: state.books }, null, 2), 'application/json');
}
function hasFileSystemAccess(){
  return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
}

/* Lembra qual arquivo local foi escolhido, pra tentar reconectar sozinho na próxima vez
   que a página abrir (só faz sentido fora do sandbox do Claude.ai). */
const FS_DB_NAME = 'recall_fs_handles';
const FS_STORE = 'handles';
function openHandleDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(FS_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
/* o arquivo lembrado fica preso à conta logada, não só ao navegador — assim, se
   duas pessoas usarem o mesmo computador com contas diferentes, uma não reconecta
   sem querer ao arquivo que a outra configurou. */
function getFileHandleKey(){
  return hasFirebaseUser() ? `user:${state.firebaseUser.uid}` : 'main';
}
async function storeFileHandle(handle){
  try{
    const db = await openHandleDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FS_STORE, 'readwrite');
      tx.objectStore(FS_STORE).put(handle, getFileHandleKey());
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }catch(e){ console.error('Falha ao lembrar do arquivo local', e); }
}
async function loadStoredFileHandle(){
  try{
    const db = await openHandleDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FS_STORE, 'readonly');
      const req = tx.objectStore(FS_STORE).get(getFileHandleKey());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }catch(e){ console.error(e); return null; }
}
async function tryReconnectFileHandle(){
  if(hasClaudeStorage() || !hasFileSystemAccess()) return;
  const handle = await loadStoredFileHandle();
  if(!handle) return;
  try{
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if(perm === 'granted'){
      state.fileHandle = handle;
      render();
    } else {
      state.pendingFileHandle = handle; // precisa de 1 clique pra reconceder a permissão
      render();
    }
  }catch(e){ console.error('Falha ao tentar reconectar ao arquivo local', e); }
}
async function reconnectFileHandle(){
  const handle = state.pendingFileHandle;
  if(!handle) return;
  try{
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if(perm === 'granted'){
      state.fileHandle = handle;
      state.pendingFileHandle = null;
      showToast('Reconectado ao arquivo local.');
      render();
    } else {
      showToast('Permissão negada para o arquivo.', 'error');
    }
  }catch(e){ console.error(e); showToast('Não foi possível reconectar ao arquivo.', 'error'); }
}
async function saveToFileSystem(){
  try{
    if(!state.fileHandle){
      state.fileHandle = await window.showSaveFilePicker({
        suggestedName: 'recall-backup.json',
        types: [{ description: 'Backup do Letther B', accept: {'application/json': ['.json']} }]
      });
      storeFileHandle(state.fileHandle);
    }
    const payload = JSON.stringify({ decks: state.decks, cards: state.cards, stats: state.stats }, null, 2);
    const writable = await state.fileHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    showToast('Salvo no arquivo. As próximas mudanças sincronizam automaticamente nele, inclusive se você recarregar a página.');
    render();
  }catch(e){
    if(e && e.name === 'AbortError') return; // usuário cancelou o seletor
    console.error(e);
    state.fileHandle = null;
    showToast('Não foi possível salvar nesse arquivo. Tente exportar o backup manualmente.', 'error');
  }
}
async function openFromFileSystem(){
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Backup do Letther B', accept: {'application/json': ['.json']} }],
      multiple: false
    });
    const file = await handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if(!data || !Array.isArray(data.decks)){ showToast('Esse arquivo não parece ser um backup do Letther B.', 'error'); return; }
    state.fileHandle = handle;
    storeFileHandle(handle);
    replaceAllData(data);
    showToast('Baralhos carregados do arquivo. Mudanças a partir de agora sincronizam automaticamente nele, mesmo depois de recarregar a página.');
  }catch(e){
    if(e && e.name === 'AbortError') return;
    console.error(e);
    showToast('Não foi possível abrir esse arquivo.', 'error');
  }
}
function replaceAllData(data){
  state.decks = (data.decks || []).map(d => ({ id: d.id || uid(), name: d.name, color: d.color || DECK_COLORS[0], type: d.type || 'standard', enabledExercises: d.enabledExercises, sentenceDifficulty: d.sentenceDifficulty || 'intermediate', carryOverLang: d.carryOverLang || [], carryOverByMode: d.carryOverByMode || {}, archived:!!d.archived }));
  const newCards = {};
  state.decks.forEach(d => {
    const oldCards = (data.cards && data.cards[d.id]) || [];
    newCards[d.id] = oldCards.map(c => normalizeImportedCard(c));
  });
  state.cards = newCards;
  state.stats = data.stats || { totalPoints: 0 };
  state.currentDeckId = null; state.view = 'home';
  saveData(); render();
}
function normalizeImportedCard(c){
  const card = {
    id: c.id || uid(), front: c.front, back: c.back || '', note: c.note || '',
    ease: c.ease || 2.5, interval: c.interval || 0, reps: c.reps || 0, due: c.due || Date.now(),
    flagged: !!c.flagged, learned: !!c.learned, priority: !!c.priority,
    missStreak: c.missStreak || 0, usedTranslateAnswers: c.usedTranslateAnswers || []
  };
  if(c.cardKind === 'image'){
    card.cardKind = 'image'; card.imageUrl = c.imageUrl || ''; card.pinX = c.pinX || 0; card.pinY = c.pinY || 0;
  }
  return card;
}

function triggerImportInput(deckId){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.csv,.tsv,.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => handleImportFile(deckId, file.name, String(reader.result));
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}
function triggerImportBackup(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(String(reader.result));
        if(!data.decks || !data.cards){ showToast('Esse arquivo não parece ser um backup do Letther B.', 'error'); return; }
        importFullBackup(data);
        showToast('Backup importado com sucesso!');
      }catch(err){ console.error(err); showToast('Não foi possível ler esse arquivo de backup.', 'error'); }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}
function importFullBackup(data){
  const deckIdMap = {}; // id antigo -> novo, pra remapear o vínculo livro->baralho
  (data.decks || []).forEach(d => {
    const newId = uid();
    deckIdMap[d.id] = newId;
    state.decks.push({ id:newId, name: d.name, color: d.color || DECK_COLORS[state.decks.length % DECK_COLORS.length], type: d.type || 'standard', enabledExercises: d.enabledExercises, sentenceDifficulty: d.sentenceDifficulty || 'intermediate', carryOverLang: d.carryOverLang || [], carryOverByMode: d.carryOverByMode || {}, archived:!!d.archived });
    const oldCards = (data.cards && data.cards[d.id]) || [];
    state.cards[newId] = oldCards.map(c => normalizeImportedCard(c));
  });
  (data.books || []).forEach(b => {
    const nb = normalizeBook(b);
    nb.id = uid();
    nb.quotes = (b.quotes||[]).map(q=>({ id: uid(), text: q.text||'', createdAt: q.createdAt||Date.now() }));
    nb.linkedDeckId = deckIdMap[b.linkedDeckId] || null;
    state.books.push(nb);
  });
  saveData(); render();
}

function handleImportFile(deckId, filename, content){
  const deck = state.decks.find(d=>d.id===deckId);
  const isLanguage = deck && deck.type === 'language';
  let added = 0;
  let skippedDuplicates = 0;
  try{
    if(filename.toLowerCase().endsWith('.json')){
      const data = JSON.parse(content);
      let items = [];
      if(Array.isArray(data)) items = data;
      else if(Array.isArray(data.cards)) items = data.cards;
      else if(data.decks && data.cards){ importFullBackup(data); showToast('Backup completo importado como novo(s) baralho(s).'); return; }
      items.forEach(item => {
        if(isLanguage){
          const term = typeof item === 'string' ? item : (item && (item.front || item.term));
          const translation = (item && typeof item === 'object') ? (item.back || item.translation || '') : '';
          const category = (item && typeof item === 'object') ? (item.category || '') : '';
          if(term && String(term).trim()){
            if(findDuplicateLanguageTerm(deckId, String(term), String(category))){ skippedDuplicates++; return; }
            const card = makeCard(String(term), String(translation||''));
            card.category = String(category).trim();
            state.cards[deckId].push(card); added++;
          }
        } else if(item && item.front && item.back){
          state.cards[deckId].push(makeCard(item.front, item.back)); added++;
        }
      });
    } else {
      // .txt / .csv / .tsv — cobre a exportação "Notes in Plain Text" do Anki
      const lines = content.split(/\r?\n/);
      lines.forEach(line => {
        if(!line.trim() || line.startsWith('#')) return; // ignora cabeçalho de metadados do Anki
        let parts = line.split('\t');
        if(parts.length < 2) parts = line.split(';');
        if(parts.length < 2) parts = line.split(',');
        if(isLanguage){
          const term = parts[0].trim().replace(/^"|"$/g,'').replace(/<[^>]+>/g,'');
          const translation = parts.length >= 2 ? parts[1].trim().replace(/^"|"$/g,'').replace(/<[^>]+>/g,'') : '';
          if(term){
            if(findDuplicateLanguageTerm(deckId, term, '')){ skippedDuplicates++; return; }
            state.cards[deckId].push(makeCard(term, translation)); added++;
          }
          return;
        }
        if(parts.length >= 2){
          const front = parts[0].trim().replace(/^"|"$/g,'').replace(/<[^>]+>/g,'');
          const back = parts[1].trim().replace(/^"|"$/g,'').replace(/<[^>]+>/g,'');
          if(front && back){ state.cards[deckId].push(makeCard(front, back)); added++; }
        }
      });
    }
  }catch(e){
    console.error(e);
    showToast('Não foi possível importar esse arquivo. Confira o formato e tente de novo.', 'error');
    return;
  }
  saveData(); render();
  showToast(added > 0 ? `${added} cartão(ões) importado(s) com sucesso.${skippedDuplicates ? ` ${skippedDuplicates} repetido(s) foram ignorados.` : ''}` : (skippedDuplicates ? 'Todos os termos já existiam neste baralho.' : 'Nenhum cartão válido encontrado nesse arquivo.'));
}

