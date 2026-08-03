/* ============ IMPORTAR CARTÕES DE UMA FOTO ============ */
const PHOTO_MAX_DIM = 1280; // reduz a imagem antes de enviar pra IA, economiza tokens/tempo
function drawImageRegionToBase64(imgEl, sx, sy, sw, sh){
  let outW = sw, outH = sh;
  if(outW > PHOTO_MAX_DIM || outH > PHOTO_MAX_DIM){
    const scale = PHOTO_MAX_DIM / Math.max(outW, outH);
    outW = Math.round(outW * scale); outH = Math.round(outH * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(outW)); canvas.height = Math.max(1, Math.round(outH));
  canvas.getContext('2d').drawImage(imgEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}
function openImagePicker(useCamera, onReady){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if(useCamera) input.capture = 'environment'; // só força abrir a câmera nesse caso; sem isso, abre a galeria/arquivos normalmente
  input.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast('Não consegui ler essa imagem.', 'error');
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const probe = new Image();
      probe.onerror = () => showToast('Não consegui ler essa imagem.', 'error');
      probe.onload = () => onReady(dataUrl);
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
function openPhotoImportPicker(useCamera){
  openImagePicker(useCamera, (dataUrl) => {
    // caixa inicial já quase cobrindo a foto toda — o usuário só precisa
    // arrastar os cantos pra apertar em volta do trecho que interessa.
    state.modal = { type:'photo-crop', rawDataUrl: dataUrl, box: { x:5, y:5, w:90, h:90 }, purpose:'flashcards' };
    render();
  });
}

/* arrastar/redimensionar a área de corte: usa Pointer Events (unifica mouse e touch)
   e evita chamar render() durante o arraste — um innerHTML novo destruiria os
   listeners no meio do gesto, então só mexemos direto no estilo do DOM até soltar. */
let cropDragState = null;
function clampCropBox(box){
  box.w = Math.max(4, Math.min(100, box.w));
  box.h = Math.max(4, Math.min(100, box.h));
  box.x = Math.max(0, Math.min(100 - box.w, box.x));
  box.y = Math.max(0, Math.min(100 - box.h, box.y));
  return box;
}
function applyCropBoxStyle(box){
  const el = document.getElementById('crop-box');
  if(!el) return;
  el.style.left = box.x + '%'; el.style.top = box.y + '%';
  el.style.width = box.w + '%'; el.style.height = box.h + '%';
}
function startCropDrag(e){
  const m = state.modal;
  if(!m || m.type !== 'photo-crop') return;
  const container = document.getElementById('crop-container');
  const rect = container.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * 100;
  const py = ((e.clientY - rect.top) / rect.height) * 100;
  const handleEl = e.target.closest && e.target.closest('[data-handle]');
  if(handleEl){
    cropDragState = { mode:'resize', handle: handleEl.dataset.handle, rect, startBox: { ...m.box } };
  } else {
    const box = m.box;
    const inside = px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
    if(inside){
      cropDragState = { mode:'move', rect, startBox: { ...box }, startPx: px, startPy: py };
    } else {
      cropDragState = { mode:'new', rect, originX: px, originY: py };
      m.box = { x: px, y: py, w: 0, h: 0 };
      applyCropBoxStyle(m.box);
    }
  }
  e.preventDefault();
  document.addEventListener('pointermove', onCropDrag);
  document.addEventListener('pointerup', endCropDrag, { once:true });
}
function onCropDrag(e){
  if(!cropDragState) return;
  const m = state.modal; if(!m || m.type !== 'photo-crop') return;
  const rect = cropDragState.rect;
  const px = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const py = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
  let box;
  if(cropDragState.mode === 'new'){
    const x0 = cropDragState.originX, y0 = cropDragState.originY;
    box = { x: Math.min(x0, px), y: Math.min(y0, py), w: Math.abs(px - x0), h: Math.abs(py - y0) };
  } else if(cropDragState.mode === 'move'){
    const dx = px - cropDragState.startPx, dy = py - cropDragState.startPy;
    box = { ...cropDragState.startBox, x: cropDragState.startBox.x + dx, y: cropDragState.startBox.y + dy };
  } else { // resize
    const sb = cropDragState.startBox;
    box = { ...sb };
    if(cropDragState.handle.includes('n')){ box.h = sb.y + sb.h - py; box.y = py; }
    if(cropDragState.handle.includes('s')){ box.h = py - sb.y; }
    if(cropDragState.handle.includes('w')){ box.w = sb.x + sb.w - px; box.x = px; }
    if(cropDragState.handle.includes('e')){ box.w = px - sb.x; }
  }
  if(cropDragState.mode !== 'new') clampCropBox(box);
  else { box.x = Math.max(0, box.x); box.y = Math.max(0, box.y); box.w = Math.min(100 - box.x, box.w); box.h = Math.min(100 - box.y, box.h); }
  m.box = box;
  applyCropBoxStyle(box);
  e.preventDefault();
}
function endCropDrag(){
  document.removeEventListener('pointermove', onCropDrag);
  cropDragState = null;
  const m = state.modal;
  if(m && m.type === 'photo-crop'){
    // corte acidentalmente minúsculo (ex: só um toque) não é útil — volta pra imagem inteira
    if(m.box.w < 4 || m.box.h < 4) m.box = { x:5, y:5, w:90, h:90 };
    else clampCropBox(m.box);
  }
  render();
}
function skipCropAndUseFull(){
  if(state.modal && state.modal.type === 'photo-crop') state.modal.box = { x:0, y:0, w:100, h:100 };
  confirmCrop();
}
function confirmCrop(){
  const m = state.modal;
  if(!m || m.type !== 'photo-crop') return;
  const box = m.box;
  const purpose = m.purpose, bookId = m.bookId;
  const img = new Image();
  img.onload = () => {
    const sx = (box.x / 100) * img.naturalWidth;
    const sy = (box.y / 100) * img.naturalHeight;
    const sw = (box.w / 100) * img.naturalWidth;
    const sh = (box.h / 100) * img.naturalHeight;
    const cropped = drawImageRegionToBase64(img, sx, sy, sw, sh);
    if(purpose === 'quote') runQuoteCapture(cropped, bookId);
    else runPhotoImportGeneration(cropped);
  };
  img.src = m.rawDataUrl;
}
async function runPhotoImportGeneration(img){
  const defaultDeck = state.decks.find(d => d.id === state.currentDeckId && d.type !== 'language') || state.decks.find(d => d.type !== 'language');
  state.modal = { type:'photo-import', status:'processing', imageDataUrl: img.dataUrl, base64: img.base64, mime: img.mime, cards: [], deckId: defaultDeck ? defaultDeck.id : '__new__', newDeckName:'', regenerating:false };
  render();
  try{
    const cards = await generateFlashcardsFromImage(img.base64, img.mime);
    if(cards.length === 0) throw new Error('empty_response');
    if(state.modal && state.modal.type === 'photo-import'){
      state.modal.status = 'review';
      state.modal.cards = cards.map(c => ({ ...c, include:true }));
    }
  }catch(err){
    console.error('Falha ao gerar cartões a partir da foto', err);
    if(state.modal && state.modal.type === 'photo-import'){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
    }
  }
  render();
}
function regenerateUncheckedCards(){
  const m = state.modal;
  if(!m || m.type !== 'photo-import' || m.status !== 'review' || m.regenerating) return;
  const uncheckedIdx = m.cards.map((c,i)=>i).filter(i => !m.cards[i].include);
  if(uncheckedIdx.length === 0){ showToast('Desmarque os cartões que quer trocar antes de gerar de novo.', 'error'); return; }
  m.regenerating = true; render();
  const keptFronts = m.cards.filter(c => c.include).map(c => c.front);
  generateFlashcardsFromImage(m.base64, m.mime, uncheckedIdx.length, keptFronts).then(newCards => {
    if(!state.modal || state.modal.type !== 'photo-import' || state.modal.status !== 'review') return;
    uncheckedIdx.forEach((idx,i) => { if(newCards[i]) state.modal.cards[idx] = { ...newCards[i], include:false }; });
  }).catch(err => {
    console.error('Falha ao gerar novos cartões', err);
    if(state.modal && state.modal.type === 'photo-import') showToast(friendlyAiErrorMsg(err), 'error');
  }).finally(() => {
    if(state.modal && state.modal.type === 'photo-import') state.modal.regenerating = false;
    render();
  });
}
function confirmPhotoImport(){
  const m = state.modal;
  const chosen = m.cards.filter(c => c.include && c.front.trim() && c.back.trim());
  if(chosen.length === 0){ showToast('Selecione ao menos um cartão pra adicionar.', 'error'); return; }
  let deckId = m.deckId;
  if(deckId === '__new__'){
    const name = (m.newDeckName||'').trim();
    if(!name){ showToast('Dê um nome ao novo baralho.', 'error'); return; }
    const color = DECK_COLORS[state.decks.length % DECK_COLORS.length];
    const deck = { id: uid(), name, color, type:'standard' };
    state.decks.push(deck);
    state.cards[deck.id] = [];
    deckId = deck.id;
  }
  if(!deckId || !state.decks.some(d=>d.id===deckId)){ showToast('Escolha um baralho.', 'error'); return; }
  chosen.forEach(c => {
    const card = makeCard(c.front, c.back);
    card.note = (c.note||'').trim();
    state.cards[deckId].push(card);
  });
  state.modal = null;
  state.currentDeckId = deckId; state.view = 'deck'; state.tab = 'cards';
  saveData(); render();
  showToast(`${chosen.length} cartão(ões) adicionado(s) ao baralho.`);
}

