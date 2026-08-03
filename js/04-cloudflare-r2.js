/* ============ CLOUDFLARE R2 (arquivos .epub, via Worker) ============
   Não falamos com o R2 direto — o Worker confere o login do Firebase
   (ID token) antes de liberar leitura/escrita do arquivo de cada um. */
const EPUB_WORKER_URL = 'https://recall-epub-bridge.arturcoutinho-escrita.workers.dev';
// evita ficar "carregando pra sempre" se o Worker não responder — sem isso,
// uma falha de rede podia deixar a tela girando pra sempre.
function withTimeout(promise, ms, timeoutMessage){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage || 'timeout')), ms))
  ]);
}
async function getFirebaseIdToken(){
  if(!auth || !auth.currentUser) throw new Error('not_logged_in');
  return await auth.currentUser.getIdToken();
}
async function uploadEpubForBook(bookId, file){
  const token = await getFirebaseIdToken();
  const resp = await withTimeout(fetch(`${EPUB_WORKER_URL}/epub/${bookId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` },
    body: file
  }), 25000, 'upload_timeout');
  if(!resp.ok) throw new Error('epub_upload_error');
}
async function downloadEpubForBook(bookId){
  const token = await getFirebaseIdToken();
  const resp = await withTimeout(fetch(`${EPUB_WORKER_URL}/epub/${bookId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }), 15000, 'download_timeout');
  if(!resp.ok) throw new Error('epub_download_error');
  return await resp.blob();
}
async function deleteEpubForBook(bookId){
  try{
    const token = await getFirebaseIdToken();
    await fetch(`${EPUB_WORKER_URL}/epub/${bookId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }catch(e){ console.error('Falha ao excluir epub no R2', e); } // se falhar, ignora — não trava a exclusão do livro
}
async function uploadNoteImage(file){
  const token = await getFirebaseIdToken();
  const userId = auth.currentUser.uid;
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const imagePath = `${userId}/${uid()}.${ext}`;
  const resp = await withTimeout(fetch(`${EPUB_WORKER_URL}/notes-image/${imagePath}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  }), 25000, 'upload_timeout');
  if(!resp.ok) throw new Error('note_image_upload_error');
  return `${EPUB_WORKER_URL}/notes-image/${imagePath}`;
}
async function loadNoteContentFromR2(noteId){
  // A renovação do token pode ficar pendente quando a conexão/login expira.
  // Sem este limite a tela da nota ficava eternamente em “Carregando”.
  const token = await withTimeout(getFirebaseIdToken(), 8000, 'note_content_auth_timeout');
  const userId = auth.currentUser.uid;
  const resp = await withTimeout(fetch(`${EPUB_WORKER_URL}/note-content/${userId}/${noteId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }), 15000, 'note_content_download_timeout');
  if(resp.status === 404) return ''; // nota ainda sem conteúdo salvo no R2
  if(!resp.ok) throw new Error('note_content_download_error');
  return await resp.text();
}
async function saveNoteContentToR2(noteId, content){
  try{
    const token = await getFirebaseIdToken();
    const userId = auth.currentUser.uid;
    const resp = await fetch(`${EPUB_WORKER_URL}/note-content/${userId}/${noteId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body: content
    });
    if(!resp.ok) throw new Error('note_content_upload_error');
    if(state.saveFailed){ state.saveFailed = false; render(); }
  }catch(e){
    console.error('Falha ao salvar conteúdo da nota no R2', e);
    state.saveFailed = true;
    render();
  }
}
async function deleteNoteContentFromR2(noteId){
  try{
    const token = await getFirebaseIdToken();
    const userId = auth.currentUser.uid;
    await fetch(`${EPUB_WORKER_URL}/note-content/${userId}/${noteId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }catch(e){ console.error('Falha ao excluir conteúdo da nota no R2', e); }
}
function renderAuthGate(){
  if(!state.authReady){
    return `
    <div style="width:100%; min-height:100vh; display:flex; align-items:center; justify-content:center;">
      <div class="spinner"></div>
    </div>`;
  }
  const standalone = isStandaloneApp();
  return `
  <div style="width:100%; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; text-align:center; padding:20px;">
    <div class="brand-mark" style="width:56px; height:56px; border-radius:14px;"></div>
    <h1 class="app-auth-name" style="margin:0;">Letther B</h1>
    ${standalone ? `
      <p style="color:var(--text-muted); max-width:320px; font-size:14px;">Como o app está instalado, o login do Google funciona melhor abrindo pelo navegador na primeira vez.</p>
      <button class="primary-btn" onclick="openInBrowserForLogin()">Abrir no navegador pra entrar</button>
      <p style="color:var(--text-faint); max-width:320px; font-size:12px;">Depois de entrar lá, volte aqui — o app instalado reconhece o login sozinho.</p>
    ` : `
      <p style="color:var(--text-muted); max-width:320px; font-size:14px;">Entre com sua conta Google pra acessar seus baralhos, sincronizados em qualquer computador ou celular.</p>
      <button class="primary-btn" onclick="signInWithGoogle()">Entrar com Google</button>
    `}
  </div>`;
}

