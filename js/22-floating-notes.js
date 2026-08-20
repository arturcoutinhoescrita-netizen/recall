/* ============ NOTAS FLUTUANTES ("post-it") — só desktop ============
   Ficam por cima de qualquer tela do app (baralho, agenda, etc.) enquanto a
   aba estiver aberta. De propósito NÃO tocam em state.currentNoteId: abrir
   uma nota flutuante não pode fechar/trocar o Chat da IA, que continua preso
   à nota normal aberta no editor principal. */
function toggleFloatingNote(noteId){
  if(!isDesktopLayout()){ showToast('Notas flutuantes só estão disponíveis no desktop.', 'error'); return; }
  const note = state.notesItems.find(n=>n.id===noteId && n.type==='note');
  if(!note) return;
  if(state.floatingNotes.some(f=>f.noteId===noteId)){ closeFloatingNote(noteId); return; }
  floatingNoteZCounter++;
  // cascata leve pra notas abertas em sequência não nascerem todas empilhadas
  // exatamente no mesmo lugar, escondendo uma atrás da outra.
  const cascade = state.floatingNotes.length % 6;
  state.floatingNotes.push({ noteId, x:90+cascade*28, y:90+cascade*24, width:300, height:320, opacity:1, z:floatingNoteZCounter });
  ensureFloatingNoteContentLoaded(noteId);
  saveData(); render();
}
function ensureFloatingNoteContentLoaded(id){
  if(noteContentCache[id] !== undefined || noteContentLoading[id]) return;
  noteContentLoading[id] = true;
  delete noteContentError[id];
  render();
  withTimeout(loadNoteContentFromR2(id), 12000, 'note_content_load_timeout').then(content => {
    const note = state.notesItems.find(n=>n.id===id);
    noteContentCache[id] = (note && note.format === 'plain') ? normalizePlainNoteContentForEditing(content) : content;
    delete noteContentLoading[id];
    render();
  }).catch(err => {
    console.error('Falha ao carregar conteúdo da nota flutuante', err);
    delete noteContentLoading[id];
    noteContentError[id] = true;
    render();
  });
}
function closeFloatingNote(noteId){
  // "fechar salva automaticamente": o conteúdo já vai sendo salvo sozinho a
  // cada edição (onNoteContentInput, com debounce de 600ms) -- essa chamada
  // extra aqui só garante que uma edição feita bem no instante de fechar não
  // fique presa esperando o debounce. Não mexe no temporizador compartilhado
  // (notesSaveTimer): cancelá-lo aqui poderia derrubar o salvamento pendente
  // de OUTRA nota sendo editada ao mesmo tempo no editor principal.
  if(noteContentCache[noteId] !== undefined) saveNoteContentToR2(noteId, noteContentCache[noteId]);
  state.floatingNotes = state.floatingNotes.filter(f=>f.noteId!==noteId);
  state.floatingColorMenuFor = state.floatingColorMenuFor===noteId ? null : state.floatingColorMenuFor;
  saveData(); render();
}
function locateFloatingNoteInManager(noteId){
  const note = state.notesItems.find(n=>n.id===noteId);
  if(!note) return;
  // expande toda a cadeia de pastas-mãe até a raiz -- senão a nota pode estar
  // escondida dentro de uma pasta fechada e o "localizar" não acha nada.
  const collapsed = state.notesCollapsedFolders || (state.notesCollapsedFolders=[]);
  let parentId = note.parentId;
  while(parentId){
    const idx = collapsed.indexOf(parentId);
    if(idx>=0) collapsed.splice(idx,1);
    const parent = state.notesItems.find(n=>n.id===parentId);
    parentId = parent ? parent.parentId : null;
  }
  state.view = 'notes';
  state.notesHighlightId = noteId;
  render();
  requestAnimationFrame(()=>{
    const el = document.querySelector(`[data-note-id="${noteId}"]`);
    if(el) el.scrollIntoView({block:'center', behavior:'smooth'});
  });
  setTimeout(()=>{ if(state.notesHighlightId===noteId){ state.notesHighlightId=null; render(); } }, 1800);
}
function toggleFloatingNoteColorMenu(noteId){
  state.floatingColorMenuFor = state.floatingColorMenuFor===noteId ? null : noteId;
  render();
}
function pickFloatingNoteColor(noteId, color){
  state.floatingColorMenuFor = null;
  setNoteItemColor(noteId, color); // já salva e renderiza
}
function previewFloatingNoteOpacity(noteId, value){
  // só reflexo visual imediato enquanto o slider é arrastado -- sem
  // saveData()/render() a cada movimento, só ao soltar (onchange, ver commit).
  const el = document.getElementById(`floating-note-${noteId}`);
  if(el) el.style.opacity = Math.max(0.2, Math.min(1, Number(value)/100));
}
function commitFloatingNoteOpacity(noteId, value){
  const f = state.floatingNotes.find(x=>x.noteId===noteId);
  if(!f) return;
  f.opacity = Math.max(0.2, Math.min(1, Number(value)/100));
  saveData();
}
function bringFloatingNoteToFront(noteId){
  const f = state.floatingNotes.find(x=>x.noteId===noteId);
  if(!f) return;
  floatingNoteZCounter++;
  f.z = floatingNoteZCounter;
  const el = document.getElementById(`floating-note-${noteId}`);
  if(el) el.style.zIndex = f.z; // direto no DOM -- não precisa de render() só pra reordenar
}
/* Arrastar e redimensionar seguem o mesmo padrão já usado no arraste da
   Agenda: Pointer Events (funciona em mouse e toque com o mesmo código),
   manipulação direta do estilo do elemento durante o gesto (sem render() a
   cada pixel movido, senão perderia fluidez e recriaria a nota flutuante do
   zero a cada frame), e só grava em state.floatingNotes + saveData() no
   pointerup, quando o gesto termina de verdade. */
let floatingNoteDragState = null;
function startFloatingNoteDrag(event, noteId){
  if(event.target.closest('button, input, [contenteditable="true"], textarea')) return;
  event.preventDefault();
  const f = state.floatingNotes.find(x=>x.noteId===noteId);
  if(!f) return;
  bringFloatingNoteToFront(noteId);
  floatingNoteDragState = { noteId, startX:event.clientX, startY:event.clientY, startLeft:f.x, startTop:f.y };
  window.addEventListener('pointermove', moveFloatingNoteDrag);
  window.addEventListener('pointerup', endFloatingNoteDrag, {once:true});
}
function moveFloatingNoteDrag(event){
  const d = floatingNoteDragState; if(!d) return;
  const el = document.getElementById(`floating-note-${d.noteId}`);
  if(!el) return;
  el.style.left = `${Math.max(0, d.startLeft + (event.clientX - d.startX))}px`;
  el.style.top = `${Math.max(0, d.startTop + (event.clientY - d.startY))}px`;
}
function endFloatingNoteDrag(){
  window.removeEventListener('pointermove', moveFloatingNoteDrag);
  const d = floatingNoteDragState; floatingNoteDragState = null;
  if(!d) return;
  const el = document.getElementById(`floating-note-${d.noteId}`);
  const f = state.floatingNotes.find(x=>x.noteId===d.noteId);
  if(!el || !f) return;
  f.x = parseFloat(el.style.left) || f.x;
  f.y = parseFloat(el.style.top) || f.y;
  saveData();
}
const FLOATING_NOTE_MIN_W = 220, FLOATING_NOTE_MIN_H = 180;
let floatingNoteResizeState = null;
function startFloatingNoteResize(event, noteId, dir){
  event.preventDefault();
  event.stopPropagation(); // não deixa o mousedown "vazar" pro header e iniciar um arraste junto
  const f = state.floatingNotes.find(x=>x.noteId===noteId);
  if(!f) return;
  bringFloatingNoteToFront(noteId);
  floatingNoteResizeState = { noteId, dir, startX:event.clientX, startY:event.clientY, startLeft:f.x, startTop:f.y, startW:f.width, startH:f.height };
  window.addEventListener('pointermove', moveFloatingNoteResize);
  window.addEventListener('pointerup', endFloatingNoteResize, {once:true});
}
function moveFloatingNoteResize(event){
  const r = floatingNoteResizeState; if(!r) return;
  const el = document.getElementById(`floating-note-${r.noteId}`);
  if(!el) return;
  const dx = event.clientX - r.startX, dy = event.clientY - r.startY;
  let x = r.startLeft, y = r.startTop, w = r.startW, h = r.startH;
  if(r.dir.includes('e')) w = Math.max(FLOATING_NOTE_MIN_W, r.startW + dx);
  if(r.dir.includes('s')) h = Math.max(FLOATING_NOTE_MIN_H, r.startH + dy);
  if(r.dir.includes('w')){ w = Math.max(FLOATING_NOTE_MIN_W, r.startW - dx); x = r.startLeft + (r.startW - w); }
  if(r.dir.includes('n')){ h = Math.max(FLOATING_NOTE_MIN_H, r.startH - dy); y = r.startTop + (r.startH - h); }
  el.style.width = `${w}px`; el.style.height = `${h}px`; el.style.left = `${x}px`; el.style.top = `${y}px`;
}
function endFloatingNoteResize(){
  window.removeEventListener('pointermove', moveFloatingNoteResize);
  const r = floatingNoteResizeState; floatingNoteResizeState = null;
  if(!r) return;
  const el = document.getElementById(`floating-note-${r.noteId}`);
  const f = state.floatingNotes.find(x=>x.noteId===r.noteId);
  if(!el || !f) return;
  f.width = parseFloat(el.style.width) || f.width;
  f.height = parseFloat(el.style.height) || f.height;
  f.x = parseFloat(el.style.left) || f.x;
  f.y = parseFloat(el.style.top) || f.y;
  saveData();
}
function getNoteDescendantIds(id){
  const ids = [];
  const stack = [id];
  while(stack.length){
    const current = stack.pop();
    state.notesItems.filter(n=>n.parentId===current).forEach(c => { ids.push(c.id); stack.push(c.id); });
  }
  return ids;
}
function deleteNoteItem(id){
  const item = state.notesItems.find(n=>n.id===id);
  if(!item) return;
  const isFolder = item.type === 'folder';
  const descendantIds = isFolder ? getNoteDescendantIds(id) : [];
  const msg = (isFolder && descendantIds.length)
    ? `Excluir a pasta "${item.name}" e ${descendantIds.length} item(ns) dentro dela?`
    : `Excluir "${item.name}"?`;
  askConfirm(msg, () => {
    const toRemove = new Set([id, ...descendantIds]);
    state.notesItems.filter(n => toRemove.has(n.id) && n.type==='note').forEach(n => deleteNoteContentFromR2(n.id));
    state.notesItems = state.notesItems.filter(n => !toRemove.has(n.id));
    toRemove.forEach(rid => { delete noteContentCache[rid]; delete noteContentLoading[rid]; delete noteContentError[rid]; });
    if(toRemove.has(state.currentNoteId)) state.currentNoteId = null;
    state.floatingNotes = state.floatingNotes.filter(f=>!toRemove.has(f.noteId));
    if(toRemove.has(state.activeOutlineId)){ state.activeOutlineId = null; state.activeOutlinePanelOpen = false; }
    saveData(); render();
    showToast('Excluído.');
  }, 'Excluir');
}
// duplica só nota (não pasta) — se o conteúdo ainda não foi carregado (nota
// nunca aberta nesta sessão), busca no R2 antes de copiar, pra não duplicar
// uma nota vazia por engano.
async function duplicateNoteItem(id){
  const item = state.notesItems.find(n=>n.id===id && n.type==='note');
  if(!item) return;
  let content = noteContentCache[id];
  if(content === undefined){
    try{
      content = await loadNoteContentFromR2(id);
    }catch(err){
      console.error('Falha ao carregar nota pra duplicar', err);
      showToast('Não consegui carregar essa nota pra duplicar.', 'error');
      return;
    }
  }
  const copy = makeNoteItem('note', `${item.name} (cópia)`, item.parentId);
  copy.linkedDeckId = item.linkedDeckId || null;
  noteContentCache[copy.id] = content;
  state.notesItems.push(copy);
  saveData(); render();
  saveNoteContentToR2(copy.id, content);
  showToast('Nota duplicada.');
}
let notesSaveTimer = null;
// Página 15 × 21 cm com margens de 1,5 cm deixa uma área útil de 12 × 18 cm.
// Em fonte de leitura comum (aprox. 12 pt, entrelinha 1,5), isso equivale a
// cerca de 230 palavras por página — ainda é uma estimativa, não paginação real.
const NOTE_WORDS_PER_PAGE = 230;
const NOTE_PAGE_PRESETS = {
  book:{ key:'book', label:'Livro — 15 × 21 cm', width:15, height:21 },
  a4:{ key:'a4', label:'A4 — 21 × 29,7 cm', width:21, height:29.7 },
  a3:{ key:'a3', label:'A3 — 29,7 × 42 cm', width:29.7, height:42 }
};
const DEFAULT_NOTE_PAGE_SETTINGS = { preset:'book', width:15, height:21, margin:2, unit:'cm', pageNumbers:false, pageNumberPosition:'right', hiddenPages:'' };
function getNotePageSettings(note){ return { ...DEFAULT_NOTE_PAGE_SETTINGS, ...((note && note.pageSettings) || {}) }; }
function getNotePagePresetKey(settings){
  const s=settings||DEFAULT_NOTE_PAGE_SETTINGS;
  const exact=Object.values(NOTE_PAGE_PRESETS).find(p=>Math.abs(Number(s.width)-p.width)<.01 && Math.abs(Number(s.height)-p.height)<.01 && s.unit!=='px');
  return exact ? exact.key : 'book';
}
function getNoteWordsPerPage(note){
  const p = getNotePageSettings(note);
  const factor = p.unit === 'px' ? 37.795 : 1;
  const width = Math.max(1, p.width / factor - 2 * p.margin / factor);
  const height = Math.max(1, p.height / factor - 2 * p.margin / factor);
  return Math.max(60, Math.round(230 * (width * height) / (12 * 18)));
}
function getNoteWritingStats(content, note, actualPages){
  const text = htmlToText(String(content || ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, alias) => alias || name);
  const wordCount = (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
  const hasActualPages=Number.isFinite(actualPages);
  const pages = hasActualPages ? actualPages : Math.round((wordCount / getNoteWordsPerPage(note)) * 10) / 10;
  const pageLabel = pages === 1 ? 'página' : 'páginas';
  return `${wordCount.toLocaleString('pt-BR')} ${wordCount === 1 ? 'palavra' : 'palavras'} · ${hasActualPages?'':'≈ '}${pages.toLocaleString('pt-BR', { maximumFractionDigits:1 })} ${pageLabel}`;
}
function renderCurrentPageNumber(note, content){
  const settings = getNotePageSettings(note);
  if(!settings.pageNumbers) return '';
  const hidden = String(settings.hiddenPages||'').split(',').some(part => part.trim()==='1');
  if(hidden) return '';
  const align = settings.pageNumberPosition==='left' ? 'left' : settings.pageNumberPosition==='center' ? 'center' : 'right';
  return `<div class="note-page-number" style="text-align:${align}; padding:0 ${settings.margin}${settings.unit};">1</div>`;
}
function pageNumberIsHidden(page, hiddenPages){
  return String(hiddenPages||'').split(',').some(raw => {
    const part=raw.trim(); if(!part) return false;
    const range=part.match(/^(\d+)\s*-\s*(\d+)$/); if(range) return page>=Number(range[1]) && page<=Number(range[2]);
    return Number(part)===page;
  });
}
function splitNoteHtmlIntoPages(content, wordsPerPage){
  const holder = document.createElement('div'); holder.innerHTML = content || '';
  const pages = [], current = []; let count = 0;
  const push = () => { if(current.length){ pages.push(current.join('')); current.length=0; count=0; } };
  const wordCount = node => (node.textContent||'').trim().split(/\s+/).filter(Boolean).length;
  const units = [];
  const collect = node => {
    const words = wordCount(node);
    if(node.nodeType===3 && words > wordsPerPage){
      const parts=(node.textContent||'').trim().split(/\s+/);
      for(let i=0;i<parts.length;i+=wordsPerPage) units.push(document.createTextNode(parts.slice(i,i+wordsPerPage).join(' ')));
      return;
    }
    // Containers grandes (div, p, section) são abertos até seus filhos. Já
    // elementos pequenos como <strong>, <em> e <li> continuam inteiros.
    if(node.nodeType===1 && words > wordsPerPage && node.childNodes.length>1 && !/^(LI|STRONG|EM|A)$/i.test(node.tagName)) Array.from(node.childNodes).forEach(collect);
    else units.push(node);
  };
  Array.from(holder.childNodes).forEach(collect);
  units.forEach(node => {
    const html = node.outerHTML || escapeHtml(node.textContent||'');
    const words = wordCount(node);
    if(current.length && count + words > wordsPerPage) push();
    current.push(html); count += words;
  });
  push();
  return pages.length ? pages : [''];
}
function splitNoteHtmlByRenderedHeight(content, contentWidth, contentHeight){
  const source=document.createElement('div');
  source.innerHTML=content||'';

  // No editor, todas as linhas vazias continuam intactas. Na visualização
  // paginada, sequências muito longas são limitadas a duas linhas para não
  // criar páginas quase vazias quando o formato muda entre 15×21, A4 e A3.
  const isBlankBlock=el=>el && el.nodeType===1 && /^(DIV|P)$/i.test(el.tagName) && !(el.textContent||'').trim() && !el.querySelector('img,video,iframe,hr');
  const collapseBlankRuns=parent=>{
    let run=0;
    Array.from(parent.children).forEach(child=>{
      if(isBlankBlock(child)){
        run++;
        if(run>2){ child.remove(); return; }
      }else run=0;
      collapseBlankRuns(child);
    });
  };
  collapseBlankRuns(source);

  // Uma linha vazia também ocupa espaço. O caractere invisível faz com que
  // Range consiga incluí-la na página correta sem alterar sua aparência.
  source.querySelectorAll('div,p').forEach(el=>{
    if(!(el.textContent||'').length && !el.querySelector('img,video,iframe,hr')){
      el.innerHTML='\u200b';
    }
  });
  source.querySelectorAll('img,video,iframe,hr').forEach(el=>{
    if(!el.nextSibling || el.nextSibling.nodeType!==3) el.after(document.createTextNode('\u200b'));
  });

  const measureShell=document.createElement('div');
  measureShell.style.cssText=`position:fixed;left:-10000px;top:0;visibility:hidden;width:${Math.max(40,contentWidth)}px;height:auto;padding:0;border:0;overflow:visible;`;
  const measure=document.createElement('div');
  measure.className='note-page-sheet-content';
  measure.style.cssText=`box-sizing:border-box;width:${Math.max(40,contentWidth)}px;height:${Math.max(40,contentHeight)}px;max-height:${Math.max(40,contentHeight)}px;overflow:hidden;line-height:1.7;font-size:14.5px;`;
  measureShell.appendChild(measure);
  document.body.appendChild(measureShell);

  const textNodes=[];
  const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
  let textNode;
  while((textNode=walker.nextNode())) textNodes.push(textNode);
  if(!textNodes.length){
    measureShell.remove();
    return [source.innerHTML];
  }

  const lengths=[];
  let total=0;
  textNodes.forEach(node=>{ lengths.push(total); total+=(node.data||'').length; });
  const plainText=textNodes.map(node=>node.data||'').join('');
  const boundary=offset=>{
    if(offset>=total){
      const last=textNodes[textNodes.length-1];
      return { node:last, offset:(last.data||'').length };
    }
    let low=0, high=textNodes.length-1;
    while(low<high){
      const mid=Math.ceil((low+high)/2);
      if(lengths[mid]<=offset) low=mid; else high=mid-1;
    }
    return { node:textNodes[low], offset:offset-lengths[low] };
  };
  const htmlBetween=(start,end)=>{
    const a=boundary(start), b=boundary(end);
    const range=document.createRange();
    range.setStart(a.node,a.offset);
    range.setEnd(b.node,b.offset);
    const wrapper=document.createElement('div');
    wrapper.appendChild(range.cloneContents());
    return wrapper.innerHTML;
  };
  const fits=html=>{
    measure.innerHTML=html;
    return measure.scrollHeight<=measure.clientHeight+1;
  };

  const pages=[];
  let start=0;
  while(start<total){
    let low=start+1, high=total, best=start;
    while(low<=high){
      const mid=Math.floor((low+high)/2);
      if(fits(htmlBetween(start,mid))){ best=mid; low=mid+1; }
      else high=mid-1;
    }
    if(best===start) best=Math.min(total,start+1);

    // Sempre que possível, muda de página entre palavras. A medição final
    // garante que recuar até esse espaço continua cabendo.
    if(best<total){
      let wordBreak=best;
      // Linhas vazias usam U+200B como marcador interno e são pontos ideais
      // para a quebra. Ignorá-las fazia o algoritmo recuar até a palavra
      // anterior e deixar um grande vazio, especialmente em A4 e A3.
      while(wordBreak>start && best-wordBreak<80 && !/[\s\u200b]/.test(plainText.charAt(wordBreak-1))) wordBreak--;
      const foundNaturalBreak=wordBreak>start && /[\s\u200b]/.test(plainText.charAt(wordBreak-1));
      // Se não houver espaço nos últimos 80 caracteres (URL longa, código ou
      // palavra contínua), mantém o limite medido. Recuar mesmo sem encontrar
      // uma quebra desperdiçava cerca de duas linhas em todas as páginas.
      if(foundNaturalBreak && fits(htmlBetween(start,wordBreak))) best=wordBreak;
    }
    pages.push(htmlBetween(start,best));
    start=best;
  }
  measureShell.remove();
  return pages.length?pages:[''];
}
let lastRenderedNotePageCount=null;
function renderPagedNotePreview(note, content){
  const s=getNotePageSettings(note), factor=s.unit==='px'?1:37.795;
  const configuredWidth=s.width*factor, configuredHeight=s.height*factor, configuredMargin=s.margin*factor;
  const pane=document.querySelector('.notes-editor-panes');
  const availableWidth=Math.max(240,(pane ? pane.clientWidth : window.innerWidth)-48);
  // Todos os formatos usam o mesmo nível de zoom, calculado pelo 15×21.
  // Antes A4 e A3 eram espremidos para a mesma largura da tela, diminuindo
  // fonte e margens. Agora a folha realmente cresce e pode rolar na horizontal.
  const referenceWidth=15*37.795;
  const scale=Math.min(1,availableWidth/referenceWidth);
  const displayWidth=configuredWidth*scale, displayHeight=configuredHeight*scale;
  const footerReserve=s.pageNumbers?Math.max(22,Math.min(34,configuredMargin*.55)):0;
  const contentWidth=Math.max(40,configuredWidth-configuredMargin*2);
  const contentHeight=Math.max(40,configuredHeight-configuredMargin*2-footerReserve);
  const fontProbe=document.createElement('div');
  fontProbe.innerHTML=content||'';
  let largestFont=14.5;
  fontProbe.querySelectorAll('[style*="font-size"],font[size]').forEach(el=>{
    let size=parseFloat(el.style.fontSize);
    if(el.style.fontSize.endsWith('pt')) size*=96/72;
    else if(el.style.fontSize.endsWith('em')) size*=14.5;
    if(!size && el.hasAttribute('size')) size=({1:10,2:13,3:16,4:18,5:24,6:32,7:48})[Number(el.getAttribute('size'))]||14.5;
    if(Number.isFinite(size)) largestFont=Math.max(largestFont,size);
  });
  // Reserva uma linha inteira da maior fonte. Diferenças de arredondamento,
  // margens de listas e fontes carregadas não conseguem mais empurrar a última
  // linha para fora da folha depois que o fragmento já foi aprovado.
  const paginationSafety=Math.ceil(largestFont*1.9);
  const paginationHeight=Math.max(40,contentHeight-paginationSafety);
  // A paginação usa o tamanho físico configurado. O scale abaixo é apenas o
  // zoom de visualização necessário para a folha caber na tela: fonte, margem,
  // imagens e rodapé diminuem juntos, como num editor de documentos.
  const chunks = splitNoteHtmlByRenderedHeight(content,contentWidth,paginationHeight).map(html=>({html}));
  if(!chunks.length) chunks.push({ html:'' });
  lastRenderedNotePageCount=chunks.length;
  return `<div class="notes-paged-preview">${chunks.map((chunk,index)=>{ const page=index+1; const position=s.pageNumberPosition==='book' ? (page%2?'right':'left') : s.pageNumberPosition; const number=s.pageNumbers&&!pageNumberIsHidden(page,s.hiddenPages) ? `<div class="note-page-sheet-number" style="text-align:${position}; padding:0 ${configuredMargin}px ${Math.max(8,configuredMargin*.25)}px;">${page}</div>` : ''; return `<div class="note-page-frame" style="width:${displayWidth}px; height:${displayHeight}px;"><article class="note-page-sheet" style="width:${configuredWidth}px; height:${configuredHeight}px; padding:${configuredMargin}px; transform:scale(${scale});"><div class="note-page-sheet-content" style="height:${contentHeight}px; max-height:${contentHeight}px;">${chunk.html}</div>${number}</article></div>`; }).join('')}</div>`;
}
function updateNoteWritingStats(content){
  const el = document.getElementById('note-writing-stats');
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(el) el.textContent = getNoteWritingStats(content, note);
}
const noteEditHistory = Object.create(null);
const NOTE_HISTORY_LIMIT = 100;
function recordNoteHistory(id, before, after){
  if(before === after) return;
  let history = noteEditHistory[id];
  if(!history || history.entries[history.index] !== before){
    history = noteEditHistory[id] = { entries:[before], index:0 };
  }
  history.entries = history.entries.slice(0, history.index + 1);
  history.entries.push(after);
  if(history.entries.length > NOTE_HISTORY_LIMIT) history.entries.shift();
  history.index = history.entries.length - 1;
}
/* Guarda o ponto de leitura do editor antes de aplicar uma entrada do
   histórico. No contenteditable, trocar todo o innerHTML invalida a Selection
   do navegador; sem restaurá-la, o Safari/Chrome pode levar o foco e a rolagem
   para o começo da nota ao usar Cmd/Ctrl+Z. */
function captureNoteHistoryEditorState(editor){
  if(!editor) return null;
  const stateSnapshot = {
    editorId:editor.id,
    windowX:window.scrollX||0,
    windowY:window.scrollY||0,
    documentTop:document.scrollingElement ? document.scrollingElement.scrollTop : 0,
    mainTop:document.querySelector('.main')?.scrollTop||0,
    paneTop:document.querySelector('.notes-editor-panes')?.scrollTop||0,
    editorTop:editor.scrollTop||0,
    editorLeft:editor.scrollLeft||0,
    selection:null,
    currentText:editor.id === 'note-editor-textarea' ? editor.value : (editor.textContent||'')
  };
  if(editor.id === 'note-editor-textarea'){
    stateSnapshot.selection={
      start:Number.isFinite(editor.selectionStart)?editor.selectionStart:0,
      end:Number.isFinite(editor.selectionEnd)?editor.selectionEnd:0,
      direction:editor.selectionDirection||'none'
    };
  }else{
    stateSnapshot.selection=captureRichCursorOffset();
  }
  return stateSnapshot;
}
function noteHistoryTargetText(editorId,value){
  if(editorId === 'note-editor-textarea') return String(value||'');
  const holder=document.createElement('div');
  holder.innerHTML=String(value||'');
  return holder.textContent||'';
}
/* Converte a posição do cursor da versão atual para a versão restaurada.
   Assim, ao desfazer uma inserção no meio do texto, o cursor volta para o
   ponto da alteração em vez de permanecer deslocado um caractere. */
function mapNoteHistoryOffset(offset,currentText,targetText){
  const current=String(currentText||''), target=String(targetText||'');
  let prefix=0;
  while(prefix<current.length && prefix<target.length && current[prefix]===target[prefix]) prefix++;
  let suffix=0;
  while(suffix<current.length-prefix && suffix<target.length-prefix && current[current.length-1-suffix]===target[target.length-1-suffix]) suffix++;
  const currentEnd=current.length-suffix;
  const targetEnd=target.length-suffix;
  const pos=Math.max(0,Math.min(Number(offset)||0,current.length));
  if(pos<prefix) return pos;
  if(pos>currentEnd) return Math.max(0,Math.min(target.length,pos+(target.length-current.length)));
  return targetEnd;
}
function restoreNoteHistoryRichSelection(editor,selection){
  if(!editor || !selection) return;
  const max=(editor.textContent||'').length;
  const start=Math.max(0,Math.min(max,selection.start||0));
  const end=Math.max(start,Math.min(max,selection.end==null?start:selection.end));
  let range=textOffsetToRange(editor,start,end);
  if(!range){
    range=document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  const browserSelection=window.getSelection();
  if(browserSelection){
    browserSelection.removeAllRanges();
    browserSelection.addRange(range);
  }
}
function restoreNoteHistoryEditorState(editor,snapshot,targetValue){
  if(!editor || !snapshot) return;
  const targetText=noteHistoryTargetText(editor.id,targetValue);
  const originalSelection=snapshot.selection;
  const mappedSelection=originalSelection ? {
    start:mapNoteHistoryOffset(originalSelection.start,snapshot.currentText,targetText),
    end:mapNoteHistoryOffset(originalSelection.end,snapshot.currentText,targetText),
    direction:originalSelection.direction||'none'
  } : null;
  const restore=()=>{
    const currentEditor=document.getElementById(snapshot.editorId);
    if(!currentEditor) return;
    try{ currentEditor.focus({preventScroll:true}); }catch(error){ currentEditor.focus(); }
    if(mappedSelection){
      if(currentEditor.id === 'note-editor-textarea'){
        const max=currentEditor.value.length;
        const start=Math.max(0,Math.min(max,mappedSelection.start));
        const end=Math.max(start,Math.min(max,mappedSelection.end));
        try{ currentEditor.setSelectionRange(start,end,mappedSelection.direction); }catch(error){}
      }else{
        restoreNoteHistoryRichSelection(currentEditor,mappedSelection);
      }
    }
    currentEditor.scrollTop=snapshot.editorTop;
    currentEditor.scrollLeft=snapshot.editorLeft;
    const pane=document.querySelector('.notes-editor-panes');
    const main=document.querySelector('.main');
    if(pane) pane.scrollTop=snapshot.paneTop;
    if(main) main.scrollTop=snapshot.mainTop;
    if(document.scrollingElement) document.scrollingElement.scrollTop=snapshot.documentTop;
    window.scrollTo(snapshot.windowX,snapshot.windowY);
  };
  // Restaura imediatamente e novamente após o navegador recalcular o layout.
  // A segunda passagem impede o salto tardio causado pelo focus/Selection.
  restore();
  requestAnimationFrame(()=>{ restore(); requestAnimationFrame(restore); });
}
function syncNoteEditorFromHistory(id, value){
  const note = state.notesItems.find(n=>n.id===id);
  if(!note) return;
  const editor = document.getElementById(note.format === 'plain' ? 'note-editor-plain' : 'note-editor-textarea');
  const editorState = captureNoteHistoryEditorState(editor);
  if(editor){
    if(note.format === 'plain') editor.innerHTML = value;
    else editor.value = value;
  }
  onNoteContentInput(id, value, true);
  restoreNoteHistoryEditorState(editor,editorState,value);
}
function undoNoteEdit(){
  const id = state.currentNoteId;
  const history = id && noteEditHistory[id];
  if(!history || history.index <= 0){ showToast('Não há mais alterações para desfazer.'); return; }
  history.index -= 1;
  syncNoteEditorFromHistory(id, history.entries[history.index]);
  showToast('Alteração desfeita.');
}
function redoNoteEdit(){
  const id = state.currentNoteId;
  const history = id && noteEditHistory[id];
  if(!history || history.index >= history.entries.length - 1){ showToast('Não há alterações para refazer.'); return; }
  history.index += 1;
  syncNoteEditorFromHistory(id, history.entries[history.index]);
  showToast('Alteração refeita.');
}
function onNoteContentInput(id, value, skipHistory){
  const item = state.notesItems.find(n=>n.id===id);
  if(!item) return;
  const previous = noteContentCache[id] == null ? '' : noteContentCache[id];
  if(!skipHistory) recordNoteHistory(id, previous, value);
  if(!skipHistory && previous !== value) startWritingActivity(id);
  noteContentCache[id] = value;
  item.updatedAt = Date.now();
  updateNoteWritingStats(value);
  // NÃO chama render() aqui — recriar a textarea inteira a cada tecla perdia
  // a posição de rolagem dela (a tela "pulava" ao digitar linhas mais abaixo,
  // pior ainda no celular) e podia cancelar acentos compostos no meio da
  // digitação (o teclado monta "´"+"a"="á" num processo que se quebra se o
  // elemento for substituído antes de terminar). Atualiza só a prévia, que é
  // um elemento à parte e não afeta o foco/digitação da textarea.
  // nota "texto normal": o contenteditable É o próprio editor (WYSIWYG), não
  // tem uma prévia separada pra atualizar — reescrever o innerHTML dele aqui
  // apagaria o que o usuário acabou de digitar e quebraria o cursor.
  if(item.format !== 'plain'){
    const previewEl = document.querySelector('.notes-preview');
    if(previewEl) previewEl.innerHTML = renderNoteMarkdown(value);
  }
  if(notesSaveTimer) clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(() => {
    saveData(); // metadados (nome, pasta, updatedAt) no Firestore
    saveNoteContentToR2(id, value); // o texto de verdade no R2
  }, 600);
}
function exportNoteAsHtml(id){
  const note=state.notesItems.find(item=>item.id===id && item.type==='note');
  if(!note) return;
  const page=getNotePageSettings(note);
  const unit=page.unit==='px'?'px':'cm';
  const content=getNoteContent(id);
  const title=escapeHtml(note.name);
  const exportedAt=new Date().toLocaleString('pt-BR');
  const html=`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box} body{margin:0;background:#f3f0e8;color:#38291f;font:18px/1.7 Georgia,'Iowan Old Style',serif}
    main{width:min(100%,${page.width}${unit});min-height:${page.height}${unit};margin:24px auto;background:#fff;padding:${page.margin}${unit};box-shadow:0 4px 24px rgba(0,0,0,.12)}
    h1,h2,h3{line-height:1.25} h1{font-size:2em} h2{font-size:1.5em} h3{font-size:1.2em}
    p{margin:0 0 .85em} img{max-width:100%;height:auto;border-radius:6px} figure{margin:1em 0} figcaption{font:14px/1.4 system-ui,sans-serif;color:#665b53}
    ul,ol{padding-left:1.4em} a{color:#9d5b16} blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #d6a355;color:#5e5148}
    @media print{body{background:#fff}main{margin:0;box-shadow:none;width:${page.width}${unit};min-height:${page.height}${unit}}}
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
  const fileName=(note.name||'nota').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'') || 'nota';
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url; link.download=`${fileName}.html`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast('Arquivo HTML exportado.');
}
function setNotesEditorMode(mode){
  state.notesEditorMode = mode;
  render();
}
function openNotePageSettings(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!note) return;
  const current=getNotePageSettings(note);
  const presetKey=getNotePagePresetKey(current);
  const preset=NOTE_PAGE_PRESETS[presetKey];
  state.modal = { type:'note-page-settings', noteId:note.id, settings:{...current,preset:presetKey,width:preset.width,height:preset.height,unit:'cm'} };
  render();
}
function confirmNotePageSettings(){
  const m = state.modal;
  const note = m && state.notesItems.find(n=>n.id===m.noteId);
  if(!note) return;
  const s = m.settings;
  const preset=NOTE_PAGE_PRESETS[s.preset]||NOTE_PAGE_PRESETS.book;
  const margin=Math.min(Math.max(0,Number(s.margin)||0),Math.min(preset.width,preset.height)/2-.5);
  note.pageSettings = { preset:preset.key, width:preset.width, height:preset.height, margin, unit:'cm', pageNumbers:!!s.pageNumbers, pageNumberPosition:s.pageNumberPosition||'right', hiddenPages:String(s.hiddenPages||'') };
  note.updatedAt = Date.now(); state.modal = null; saveData(); render();
}
function findNoteByName(name){
  const norm = normalizeAnswer(name);
  return state.notesItems.find(n => n.type==='note' && normalizeAnswer(n.name) === norm);
}
function preprocessWikiLinks(md){
  return (md||'').replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, name, _, alias) => {
    const cleanName = name.trim();
    const display = (alias||cleanName).trim();
    const exists = !!findNoteByName(cleanName);
    const cls = exists ? 'wiki-link' : 'wiki-link wiki-link-new';
    return `<a href="#" class="${cls}" data-note-name="${escapeHtml(cleanName)}" title="${exists ? 'Abrir nota' : 'Criar nota'}">${escapeHtml(display)}</a>`;
  });
}
function renderNoteMarkdown(content){
  const withLinks = preprocessWikiLinks(content);
  try{
    return marked.parse(withLinks, { breaks: true });
  }catch(e){
    return `<p style="color:var(--error);">Erro ao renderizar o markdown.</p>`;
  }
}
document.addEventListener('click', (e) => {
  const link = e.target.closest && e.target.closest('.wiki-link');
  if(!link) return;
  e.preventDefault();
  openOrCreateNoteByName(link.dataset.noteName);
});
function openOrCreateNoteByName(name){
  const existing = findNoteByName(name);
  // usa openNote() em vez de só trocar state.currentNoteId direto: é o
  // openNote() que dispara o carregamento do conteúdo do R2 quando a nota
  // ainda não foi aberta nesta sessão (noteContentCache[id] indefinido).
  // Sem isso, a nota linkada nunca tinha seu conteúdo buscado nem
  // noteContentLoading marcado, e a tela ficava presa em "Carregando
  // nota..." pra sempre — só saía do zero se o usuário abrisse a mesma nota
  // de novo pelo gerenciador, que já passava por openNote() corretamente.
  if(existing){ openNote(existing.id); return; }
  const current = state.notesItems.find(n=>n.id===state.currentNoteId);
  const parentId = current ? current.parentId : null;
  const item = makeNoteItem('note', name, parentId);
  state.notesItems.push(item);
  saveData();
  openNote(item.id);
  showToast(`Nota "${name}" criada.`);
}
/* Autocompletar de links entre notas: ao digitar [[ no editor rico, a lista
   aparece junto ao cursor. A implementação usa offsets do texto visível para
   funcionar mesmo quando o parágrafo já tem negrito, links ou outras tags. */
let wikiAutocomplete = { active:false, query:'', start:0, end:0, items:[], selected:0 };
function getRichWikiAutocompleteContext(editor){
  const selection=window.getSelection();
  if(!editor || !selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return null;
  const range=selection.getRangeAt(0);
  if(!range.collapsed) return null;
  const end=domPositionToTextOffset(editor, range.endContainer, range.endOffset);
  const before=(editor.textContent||'').slice(0,end);
  const start=before.lastIndexOf('[[');
  if(start<0) return null;
  const query=before.slice(start+2);
  if(/[\n\r\[\]]/.test(query)) return null;
  return { start, end, query };
}
function hideWikiAutocomplete(){
  wikiAutocomplete.active=false;
  const menu=document.getElementById('wiki-link-autocomplete');
  if(menu) menu.style.display='none';
}
function getWikiAutocompleteItems(query){
  const normalized=normalizeAnswer(query);
  const matches=state.notesItems.filter(item=>item.type==='note' && (!normalized || normalizeAnswer(item.name).includes(normalized)))
    .sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite) || (b.updatedAt||0)-(a.updatedAt||0))
    .slice(0,7)
    .map(item=>({kind:'note', id:item.id, name:item.name, favorite:!!item.favorite}));
  const exact=state.notesItems.some(item=>item.type==='note' && normalizeAnswer(item.name)===normalized);
  if(query.trim() && !exact) matches.push({kind:'create', name:query.trim()});
  return matches;
}
function showWikiAutocomplete(editor, context){
  const menu=document.getElementById('wiki-link-autocomplete');
  if(!menu) return;
  const items=getWikiAutocompleteItems(context.query);
  const sameQuery=wikiAutocomplete.active && wikiAutocomplete.query===context.query;
  wikiAutocomplete={active:true, query:context.query, start:context.start, end:context.end, items, selected:sameQuery ? Math.min(wikiAutocomplete.selected,Math.max(0,items.length-1)) : 0};
  if(!items.length){ hideWikiAutocomplete(); return; }
  menu.innerHTML=`<div class="wiki-link-autocomplete-label">VINCULAR NOTA</div>${items.map((item,index)=>`<button type="button" class="wiki-link-autocomplete-option ${index===wikiAutocomplete.selected?'active':''}" onmousedown="event.preventDefault()" onclick="selectWikiAutocompleteItem(${index})">${item.kind==='create'?'＋ Criar nota: ':''}${item.favorite?'★ ':''}${escapeHtml(item.name)}</button>`).join('')}`;
  const selection=window.getSelection();
  const range=selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  const rect=range && range.getBoundingClientRect();
  const fallback=editor.getBoundingClientRect();
  const left=Math.max(12,Math.min((rect && rect.left) || fallback.left, window.innerWidth-312));
  const top=Math.min(((rect && rect.bottom) || fallback.top+28)+6, window.innerHeight-80);
  menu.style.left=`${left}px`; menu.style.top=`${top}px`; menu.style.display='block';
}
function createNoteFromWikiLink(name){
  const clean=String(name||'').trim();
  if(!clean) return null;
  const existing=findNoteByName(clean);
  if(existing) return existing;
  const current=state.notesItems.find(item=>item.id===state.currentNoteId);
  const item=makeNoteItem('note',clean,current ? current.parentId : null);
  state.notesItems.push(item);
  saveData();
  return item;
}
function replaceRichWikiText(editor,start,end,name){
  const range=textOffsetToRange(editor,start,end);
  if(!range) return false;
  const note=createNoteFromWikiLink(name);
  if(!note) return false;
  const link=document.createElement('a');
  link.href='#'; link.className='wiki-link'; link.dataset.noteName=note.name; link.title='Abrir nota'; link.textContent=note.name;
  range.deleteContents(); range.insertNode(link);
  const caret=document.createRange(); caret.setStartAfter(link); caret.collapse(true);
  const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(caret);
  onNoteContentInput(state.currentNoteId,editor.innerHTML);
  return true;
}
/* Digitar "# "/"## "/"### " no começo de uma linha vira título (H1/H2/H3) na
   hora, como no Obsidian -- só existe na nota "texto normal" (contenteditable
   sem sintaxe markdown visível); nas notas em markdown a mesma sintaxe já
   funciona sozinha, o marked.js já entende "#"/"##"/"###" na prévia. Dispara
   no keydown da barra de espaço (antes dela ser inserida), igual o gatilho
   do Obsidian/Notion: comitar o "#" acumulado assim que o espaço é digitado. */
function maybeAutoFormatRichHeading(event, editor){
  if(event.isComposing || (typeof isTextCompositionActive==='function' && isTextCompositionActive())) return false;
  if(event.key !== ' ' || !editor) return false;
  const selection = window.getSelection();
  if(!selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return false;
  const range = selection.getRangeAt(0);
  if(!range.collapsed) return false;
  let block = range.startContainer;
  block = block.nodeType === 3 ? block.parentElement : block;
  while(block && block !== editor && block.parentElement && block.parentElement !== editor) block = block.parentElement;
  if(!block) block = editor;
  const measure = document.createRange();
  measure.setStart(block, 0);
  measure.setEnd(range.startContainer, range.startOffset);
  const textBeforeCaret = measure.toString();
  const level = {'#':'h1','##':'h2','###':'h3'}[textBeforeCaret];
  if(!level) return false;
  event.preventDefault();
  const deleteRange = document.createRange();
  deleteRange.setStart(block, 0);
  deleteRange.setEnd(range.startContainer, range.startOffset);
  deleteRange.deleteContents();
  // Monta o elemento de título manualmente (em vez de document.execCommand
  // ('formatBlock',...)) -- formatBlock decide sozinho "qual é o bloco atual"
  // e, testado na prática, às vezes formata a linha ERRADA quando o bloco em
  // que o cursor está fica vazio (comportamento notoriamente inconsistente
  // dessa API antiga/depreciada). Substituir o elemento à mão garante que é
  // sempre exatamente a linha onde o "#"/"##"/"###" foi digitado.
  const heading = document.createElement(level);
  if(block === editor){
    // primeira linha, ainda sem <div> própria (editor vazio até agora) --
    // o conteúdo restante (depois de apagar os "#") é filho direto do editor.
    while(editor.firstChild) heading.appendChild(editor.firstChild);
    editor.appendChild(heading);
  }else{
    while(block.firstChild) heading.appendChild(block.firstChild);
    block.replaceWith(heading);
  }
  // deleteContents() pode deixar pra trás um nó de texto vazio (sem removê-lo
  // de fato) em vez de simplesmente não sobrar nada -- sem isso, um título
  // "vazio" ficava sem o <br> que os navegadores usam pra dar altura/cursor
  // a uma linha em branco, como se a linha tivesse sumido visualmente.
  if(!heading.textContent){ heading.innerHTML=''; heading.appendChild(document.createElement('br')); }
  const collapsedRange = document.createRange();
  collapsedRange.setStart(heading, 0);
  collapsedRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(collapsedRange);
  state.lastRichHeading = level;
  onNoteContentInput(state.currentNoteId, editor.innerHTML);
  return true;
}
function maybeFinalizeRichWikiLink(editor){
  const selection=window.getSelection();
  if(!editor || !selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return false;
  const range=selection.getRangeAt(0);
  if(!range.collapsed) return false;
  const end=domPositionToTextOffset(editor,range.endContainer,range.endOffset);
  const before=(editor.textContent||'').slice(0,end);
  const match=before.match(/\[\[([^\]\n]+)\]\]$/);
  if(!match) return false;
  const name=match[1].trim();
  if(!name) return false;
  return replaceRichWikiText(editor,end-match[0].length,end,name);
}
function handleRichEditorInput(editor){
  if(!editor || !state.currentNoteId) return;
  onNoteContentInput(state.currentNoteId,editor.innerHTML);
  // Durante composição, qualquer transformação estrutural do DOM (como fechar
  // um wikilink) pode interromper o caractere que o sistema ainda está montando.
  if(typeof isTextCompositionActive==='function' && isTextCompositionActive()) return;
  if(maybeFinalizeRichWikiLink(editor)){ hideWikiAutocomplete(); return; }
  const context=getRichWikiAutocompleteContext(editor);
  if(context) showWikiAutocomplete(editor,context); else hideWikiAutocomplete();
}
function selectWikiAutocompleteItem(index){
  const editor=document.getElementById('note-editor-plain');
  const item=wikiAutocomplete.items[index];
  if(!editor || !item || !wikiAutocomplete.active) return;
  replaceRichWikiText(editor,wikiAutocomplete.start,wikiAutocomplete.end,item.name);
  hideWikiAutocomplete();
}
function handleWikiAutocompleteKeydown(event){
  if(event.isComposing || (typeof isTextCompositionActive==='function' && isTextCompositionActive())) return false;
  if(!wikiAutocomplete.active) return false;
  if(event.key==='ArrowDown' || event.key==='ArrowUp'){
    event.preventDefault();
    const step=event.key==='ArrowDown' ? 1 : -1;
    wikiAutocomplete.selected=(wikiAutocomplete.selected+step+wikiAutocomplete.items.length)%wikiAutocomplete.items.length;
    const editor=document.getElementById('note-editor-plain');
    const context=getRichWikiAutocompleteContext(editor);
    if(editor && context) showWikiAutocomplete(editor,context);
    return true;
  }
  if(event.key==='Enter' || event.key==='Tab'){
    event.preventDefault(); selectWikiAutocompleteItem(wikiAutocomplete.selected); return true;
  }
  if(event.key==='Escape'){ event.preventDefault(); hideWikiAutocomplete(); return true; }
  return false;
}
document.addEventListener('mousedown',event=>{
  if(event.target.closest && (event.target.closest('#wiki-link-autocomplete') || event.target.closest('#note-editor-plain'))) return;
  hideWikiAutocomplete();
});
function applyMdWrap(textareaId, before, after){
  const el = document.getElementById(textareaId);
  if(!el) return;
  after = after != null ? after : before;
  const start = el.selectionStart, end = el.selectionEnd;
  const val = el.value;
  const selected = val.slice(start, end);
  const newVal = val.slice(0,start) + before + selected + after + val.slice(end);
  el.value = newVal;
  el.focus();
  el.setSelectionRange(start+before.length, start+before.length+selected.length);
  onNoteContentInput(state.currentNoteId, newVal);
}
function applyMdLinePrefix(textareaId, prefix){
  const el = document.getElementById(textareaId);
  if(!el) return;
  const start = el.selectionStart;
  const val = el.value;
  const lineStart = val.lastIndexOf('\n', start-1) + 1;
  const newVal = val.slice(0,lineStart) + prefix + val.slice(lineStart);
  el.value = newVal;
  const newPos = start + prefix.length;
  el.focus();
  el.setSelectionRange(newPos, newPos);
  onNoteContentInput(state.currentNoteId, newVal);
}
function applyMdAlign(textareaId, align){
  const el = document.getElementById(textareaId);
  if(!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const val = el.value;
  const selected = val.slice(start, end) || 'texto';
  const wrapped = `<div style="text-align:${align}">\n\n${selected}\n\n</div>`;
  const newVal = val.slice(0,start) + wrapped + val.slice(end);
  el.value = newVal;
  el.focus();
  const pos = start + wrapped.length;
  el.setSelectionRange(pos, pos);
  onNoteContentInput(state.currentNoteId, newVal);
}
function insertTabIndent(textareaId){
  const el = document.getElementById(textareaId);
  if(!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const val = el.value;
  // espaço não-quebrável (U+00A0), não espaço/tab normal — dá recuo visual sem
  // disparar a regra do markdown que vira bloco de código com 4+ espaços/tab
  // no início da linha.
  const indent = '    ';
  const newVal = val.slice(0,start) + indent + val.slice(end);
  el.value = newVal;
  const pos = start + indent.length;
  el.focus();
  el.setSelectionRange(pos, pos);
  onNoteContentInput(state.currentNoteId, newVal);
}
function applyMdLink(textareaId){
  const el = document.getElementById(textareaId);
  if(!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const val = el.value;
  const selected = val.slice(start,end) || 'texto do link';
  const md = `[${selected}](url)`;
  const newVal = val.slice(0,start) + md + val.slice(end);
  el.value = newVal;
  el.focus();
  const urlStart = start + selected.length + 3, urlEnd = urlStart + 3;
  el.setSelectionRange(urlStart, urlEnd);
  onNoteContentInput(state.currentNoteId, newVal);
}
function insertWikiLink(textareaId){
  const el = document.getElementById(textareaId);
  if(!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const val = el.value;
  const selected = val.slice(start,end);
  const label = selected || 'Nome da nota';
  const md = `[[${label}]]`;
  const newVal = val.slice(0,start) + md + val.slice(end);
  el.value = newVal;
  el.focus();
  const innerStart = start+2, innerEnd = innerStart + label.length;
  el.setSelectionRange(innerStart, innerEnd);
  onNoteContentInput(state.currentNoteId, newVal);
}
function insertImageMarkdown(textareaId, url, alt){
  const el = document.getElementById(textareaId);
  if(!el) return;
  const start = el.selectionStart;
  const val = el.value;
  const md = `![${alt||'imagem'}](${url})`;
  const newVal = val.slice(0,start) + md + val.slice(start);
  el.value = newVal;
  const pos = start + md.length;
  el.focus();
  el.setSelectionRange(pos,pos);
  onNoteContentInput(state.currentNoteId, newVal);
}
/* --- edição rica (WYSIWYG) da nota tipo "texto normal": mesmas ferramentas
   da nota markdown (negrito, título, lista, alinhar, link...), só que aplicadas
   direto via execCommand num contenteditable — o usuário vê o resultado final
   na hora, sem símbolo de sintaxe nenhum, e por isso não precisa das abas
   Editar/Dividido/Prévia (não existe "fonte" separada da "prévia"). --- */
let pendingRichToolbarContext = null;
function captureRichToolbarContext(){
  const selection=captureRichCursorOffset();
  pendingRichToolbarContext={
    noteId:state.currentNoteId,
    createdAt:Date.now(),
    selection,
    text:window.getSelection()?.toString()||'',
    scroll:typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null
  };
  return pendingRichToolbarContext;
}
function captureNoteInsertContext(){
  const context=captureRichToolbarContext();
  state.pendingNoteInsertOffset=context?.selection||null;
  state.pendingNoteInsertText=context?.text||'';
  state.pendingNoteInsertScroll=context?.scroll||null;
}
function takeRichToolbarContext(){
  const context=pendingRichToolbarContext;
  pendingRichToolbarContext=null;
  if(!context || context.noteId!==state.currentNoteId || Date.now()-context.createdAt>15000) return null;
  return context;
}
/* Os pequenos menus de cor, marca-texto e tipo de título não precisam
   reconstruir o aplicativo inteiro. Atualizar somente a barra preserva o
   contenteditable original, a seleção e a rolagem sem depender de correções
   posteriores do navegador. */
function refreshRichNotesToolbarOnly(scrollState, selection){
  const toolbar=document.querySelector('.notes-toolbar');
  const note=state.notesItems.find(item=>item.id===state.currentNoteId && item.type==='note');
  if(!toolbar || !note || typeof renderNotesToolbar!=='function') return false;
  const savedScroll=scrollState || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  const savedSelection=selection || captureRichCursorOffset();
  toolbar.outerHTML=renderNotesToolbar(note.format);
  const editor=document.getElementById('note-editor-plain');
  if(editor && savedSelection) restoreRichCursorOffset(editor,savedSelection);
  if(savedScroll && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(savedScroll);
  return true;
}
function focusRichEditor(){
  const el = document.getElementById('note-editor-plain');
  if(!el) return null;
  const scroll=typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null;
  try{ el.focus({preventScroll:true}); }catch(error){ el.focus(); }
  if(scroll && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scroll);
  return el;
}
function applyRichCommand(cmd, value){
  const context=takeRichToolbarContext();
  const scroll=context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  const selection=context?.selection || captureRichCursorOffset();
  const el=focusRichEditor();
  if(!el) return;
  if(selection) restoreRichCursorOffset(el,selection);
  document.execCommand(cmd, false, value != null ? value : null);
  onNoteContentInput(state.currentNoteId, el.innerHTML);
  if(scroll && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scroll);
}
function setRichTextColor(color){ applyRichCommand('foreColor', color); }
function setRichHighlight(color){ applyRichCommand('hiliteColor', color); }
function setRichFont(font){ applyRichCommand('fontName', font); }
function setRichHeading(level){
  if(!['h1','h2','h3'].includes(level)) return;
  state.lastRichHeading=level;
  applyRichCommand('formatBlock',`<${level}>`);
}
function toggleRichHeadingMenu(){
  const context=takeRichToolbarContext();
  const savedOffset=context?.selection || captureRichCursorOffset();
  const scrollState=context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  state.noteColorMenu=null;
  state.noteHeadingMenu=state.noteHeadingMenu ? null : {savedOffset,scrollState};
  if(!refreshRichNotesToolbarOnly(scrollState,savedOffset)) render();
}
function chooseRichHeading(level){
  const menu=state.noteHeadingMenu;
  state.noteHeadingMenu=false;
  state.lastRichHeading=level;
  if(!refreshRichNotesToolbarOnly(menu?.scrollState,menu?.savedOffset)) render();
  const editor=focusRichEditor();
  if(editor){
    restoreRichCursorOffset(editor,menu?.savedOffset);
    document.execCommand('formatBlock',false,`<${level}>`);
    onNoteContentInput(state.currentNoteId,editor.innerHTML);
    if(menu?.scrollState && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(menu.scrollState);
  }
}
function renderRichHeadingMenu(){
  if(!state.noteHeadingMenu) return '';
  return `<div style="position:absolute; top:38px; right:0; z-index:120; display:flex; flex-direction:column; gap:3px; width:76px; padding:6px; background:var(--surface); border:1px solid var(--border); border-radius:9px; box-shadow:0 10px 24px rgba(0,0,0,.25);"><button class="ghost-btn" style="padding:6px; font-size:11px;" onmousedown="event.preventDefault()" onclick="chooseRichHeading('h1')">H1</button><button class="ghost-btn" style="padding:6px; font-size:11px;" onmousedown="event.preventDefault()" onclick="chooseRichHeading('h2')">H2</button><button class="ghost-btn" style="padding:6px; font-size:11px;" onmousedown="event.preventDefault()" onclick="chooseRichHeading('h3')">H3</button></div>`;
}
function setRichAlignment(alignment){
  const commands={left:'justifyLeft',center:'justifyCenter',right:'justifyRight',justify:'justifyFull'};
  if(!commands[alignment]) return;
  state.lastRichAlignment=alignment;
  applyRichCommand(commands[alignment]);
}
function setRichFontSize(size){
  const px=Math.max(8,Math.min(72,Number(size)||14));
  const context=takeRichToolbarContext();
  const scroll=context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  const selection=context?.selection || captureRichCursorOffset();
  const editor=focusRichEditor();
  if(!editor) return;
  if(selection) restoreRichCursorOffset(editor,selection);
  // O HTML exibido é a fonte de verdade para o histórico. Capturá-lo antes do
  // execCommand impede que "Desfazer" restaure marcação intermediária <font>.
  noteContentCache[state.currentNoteId]=editor.innerHTML;
  // execCommand aceita somente os tamanhos legados 1–7. O valor 7 funciona
  // como marcador temporário; em seguida ele é convertido para CSS em pixels,
  // que preserva o tamanho exato e também é respeitado pela paginação.
  document.execCommand('fontSize',false,'7');
  editor.querySelectorAll('font[size="7"]').forEach(el=>{
    el.removeAttribute('size');
    el.style.fontSize=`${px}px`;
  });
  onNoteContentInput(state.currentNoteId,editor.innerHTML);
  if(scroll && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scroll);
  const picker=document.querySelector('select[title="Tamanho da fonte"]');
  if(picker) picker.value='';
}
function openRichColorMenu(kind){
  const context=takeRichToolbarContext();
  const savedOffset = context?.selection || captureRichCursorOffset();
  const scrollState = context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  const isSameMenu=state.noteColorMenu?.kind===kind;
  state.noteHeadingMenu=null;
  state.noteColorMenu = isSameMenu ? null : { kind, savedOffset, scrollState };
  if(!refreshRichNotesToolbarOnly(scrollState,savedOffset)) render();
}
function applyRichPaletteColor(kind, color){
  const menu = state.noteColorMenu;
  state.noteColorMenu = null;
  if(kind === 'text') state.lastRichTextColor = color;
  else state.lastRichHighlight = color;
  if(!refreshRichNotesToolbarOnly(menu?.scrollState,menu?.savedOffset)) render();
  const editor = focusRichEditor();
  if(editor){
    restoreRichCursorOffset(editor, menu && menu.savedOffset);
    document.execCommand(kind === 'text' ? 'foreColor' : 'hiliteColor', false, color);
    onNoteContentInput(state.currentNoteId, editor.innerHTML);
    if(menu?.scrollState && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(menu.scrollState);
  }
}
function applyLastRichColor(kind){
  applyRichCommand(kind === 'text' ? 'foreColor' : 'hiliteColor', kind === 'text' ? (state.lastRichTextColor || '#000000') : (state.lastRichHighlight || '#F5D76E'));
}
function toggleNotePageView(){
  state.notesPageView = !state.notesPageView;
  render();
}
function insertRichIndent(){
  applyRichCommand('insertHTML','    ');
}
// captura a posição do cursor/seleção no contenteditable ANTES de abrir um
// modal — a Selection global do navegador se move assim que o modal ganha
// foco (o input de dentro dele tem autofocus), então sem isso qualquer
// inserção feita depois (link, imagem) sempre acabava caindo no início do
// texto em vez de onde o usuário realmente estava escrevendo.
function captureRichCursorOffset(){
  const el = document.getElementById('note-editor-plain');
  const sel = window.getSelection();
  if(!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  return {
    start: domPositionToTextOffset(el, r.startContainer, r.startOffset),
    end: domPositionToTextOffset(el, r.endContainer, r.endOffset)
  };
}
function restoreRichCursorOffset(el, savedOffset){
  if(!savedOffset) return;
  const range = textOffsetToRange(el, savedOffset.start, savedOffset.end);
  if(range){
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
function openInsertRichLinkModal(savedOffsetOverride, selectedTextOverride, savedScrollOverride){
  const context=savedOffsetOverride ? null : takeRichToolbarContext();
  const sel = window.getSelection();
  const text = selectedTextOverride != null ? selectedTextOverride : (context?.text != null ? context.text : (sel ? sel.toString() : ''));
  const savedOffset = savedOffsetOverride || context?.selection || captureRichCursorOffset();
  const scrollState = savedScrollOverride || context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  state.modal = { type:'insert-rich-link', url:'', text, savedOffset, scrollState };
  render();
}
function confirmInsertRichLink(){
  const m = state.modal;
  const url = (m.url||'').trim();
  if(!url){ showToast('Cole o link.', 'error'); return; }
  const text = (m.text||'').trim() || url;
  const savedOffset = m.savedOffset;
  const scrollState = m.scrollState;
  state.modal = null;
  render();
  const el = focusRichEditor();
  if(el){
    restoreRichCursorOffset(el, savedOffset);
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`);
    onNoteContentInput(state.currentNoteId, el.innerHTML);
    if(scrollState && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scrollState);
  }
}
function openInsertWikiLinkModalRich(){
  const context=takeRichToolbarContext();
  const sel = window.getSelection();
  const name = context?.text != null ? context.text : (sel ? sel.toString() : '');
  const savedOffset = context?.selection || captureRichCursorOffset();
  const scrollState = context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  state.modal = { type:'insert-wiki-link-rich', name, savedOffset, scrollState };
  render();
}
function confirmInsertWikiLinkRich(){
  const m = state.modal;
  const name = (m.name||'').trim();
  if(!name){ showToast('Digite o nome da nota.', 'error'); return; }
  const savedOffset = m.savedOffset;
  const scrollState = m.scrollState;
  state.modal = null;
  render();
  const el = focusRichEditor();
  if(el){
    restoreRichCursorOffset(el, savedOffset);
    const exists = !!findNoteByName(name);
    const cls = exists ? 'wiki-link' : 'wiki-link wiki-link-new';
    document.execCommand('insertHTML', false, `<a href="#" class="${cls}" data-note-name="${escapeHtml(name)}" title="${exists?'Abrir nota':'Criar nota'}">${escapeHtml(name)}</a>`);
    onNoteContentInput(state.currentNoteId, el.innerHTML);
    if(scrollState && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scrollState);
  }
}
// notas "texto normal" criadas antes dessa mudança guardavam texto puro (sem
// tag nenhuma); se o conteúdo não parece ter HTML, escapa e vira <br> nas
// quebras de linha antes de jogar dentro do contenteditable, senão símbolos
// como "<" quebrariam a renderização e as quebras de linha sumiriam.
function normalizePlainNoteContentForEditing(content){
  if(!content) return '';
  if(/<[a-z][\s\S]*>/i.test(content)) return content;
  return escapeHtml(content).replace(/\n/g, '<br>');
}
function htmlToText(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || '';
}
// mapeia um intervalo de caracteres do texto visível (ex: os índices que
// findTextMatches devolve) de volta pra um Range real do DOM — necessário
// pra buscar/substituir dentro do contenteditable, onde o texto pode estar
// espalhado por vários nós por causa das tags de formatação.
function textOffsetToRange(container, start, end){
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node, charCount = 0;
  let startNode, startOffset, endNode, endOffset;
  while(node = walker.nextNode()){
    const nextCount = charCount + node.length;
    if(startNode === undefined && start <= nextCount){ startNode = node; startOffset = start - charCount; }
    if(endNode === undefined && end <= nextCount){ endNode = node; endOffset = end - charCount; break; }
    charCount = nextCount;
  }
  if(startNode === undefined || endNode === undefined) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
// Substitui um intervalo do editor rico sem depender de document.execCommand.
// Em alguns navegadores, especialmente no celular, o comando "insertText"
// apagava a seleção mas não inseria o texto devolvido pela IA.
function replaceRichTextRange(container, start, end, replacement){
  const range = textOffsetToRange(container, start, end);
  if(!range) return false;
  const fragment = document.createDocumentFragment();
  const lines = String(replacement == null ? '' : replacement).split(/\r?\n/);
  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line));
    if(index < lines.length - 1) fragment.appendChild(document.createElement('br'));
  });
  range.deleteContents();
  range.insertNode(fragment);
  return true;
}

/* A correção da IA trabalha com texto puro, mas a nota rica guarda HTML. Antes,
   aceitar uma correção substituía a seleção inteira por um único nó de texto e
   destruía negrito, itálico, cor, marca-texto, links e tamanhos de fonte.

   A solução é calcular somente os pequenos trechos que realmente mudaram e
   aplicá-los do fim para o começo. As partes que a IA não alterou nunca saem do
   DOM; e uma palavra corrigida continua sendo inserida no mesmo contexto do nó
   original (por exemplo, dentro do <b> ou <span style=...> que já a envolvia). */
function tokenizeCorrectionText(text){
  const value=String(text==null?'':text);
  try{ return value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) || []; }
  catch(error){ return value.match(/\s+|[A-Za-zÀ-ÿ0-9_]+|[^\sA-Za-zÀ-ÿ0-9_]+/g) || []; }
}
function buildCorrectionReplacementOps(original, corrected){
  const oldTokens=tokenizeCorrectionText(original), newTokens=tokenizeCorrectionText(corrected);
  const m=oldTokens.length, n=newTokens.length;
  // Para seleções muito grandes, evita construir uma matriz LCS gigante.
  // Como correção ortográfica costuma alterar poucos tokens, um alinhamento
  // local por janela preserva os mesmos pequenos pontos de edição sem trocar o
  // HTML inteiro (o que voltaria a apagar a formatação).
  if(m*n > 4000000){
    const ops=[]; let i=0,j=0,oldOffset=0;
    const LOOKAHEAD=80;
    while(i<m || j<n){
      if(i<m && j<n && oldTokens[i]===newTokens[j]){ oldOffset+=oldTokens[i].length; i++; j++; continue; }
      const start=oldOffset;
      let best=null;
      for(let di=0;di<=LOOKAHEAD && i+di<m;di++){
        for(let dj=0;dj<=LOOKAHEAD && j+dj<n;dj++){
          if(oldTokens[i+di]!==newTokens[j+dj]) continue;
          const score=di+dj;
          if(!best || score<best.score){ best={di,dj,score}; if(score===1) break; }
        }
        if(best && best.score===1) break;
      }
      if(!best){
        const oldTail=oldTokens.slice(i).join('');
        const newTail=newTokens.slice(j).join('');
        ops.push({start,end:start+oldTail.length,replacement:newTail});
        break;
      }
      const removed=oldTokens.slice(i,i+best.di).join('');
      const inserted=newTokens.slice(j,j+best.dj).join('');
      if(removed || inserted) ops.push({start,end:start+removed.length,replacement:inserted});
      oldOffset+=removed.length; i+=best.di; j+=best.dj;
    }
    return ops;
  }
  const dp=Array.from({length:m+1},()=>new Uint16Array(n+1));
  for(let i=m-1;i>=0;i--){
    for(let j=n-1;j>=0;j--){
      dp[i][j]=oldTokens[i]===newTokens[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
    }
  }
  const ops=[];
  let i=0,j=0,oldOffset=0,change=null;
  const flush=()=>{
    if(!change) return;
    change.replacement=change.newParts.join('');
    delete change.newParts;
    // Não cria operações vazias que não façam nada.
    if(change.start!==change.end || change.replacement) ops.push(change);
    change=null;
  };
  const begin=()=>{ if(!change) change={start:oldOffset,end:oldOffset,newParts:[]}; };
  while(i<m || j<n){
    if(i<m && j<n && oldTokens[i]===newTokens[j]){
      flush();
      oldOffset+=oldTokens[i].length; i++; j++; continue;
    }
    begin();
    if(j<n && (i>=m || dp[i][j+1] > dp[i+1][j])){
      change.newParts.push(newTokens[j]); j++; continue;
    }
    if(i<m){
      oldOffset+=oldTokens[i].length;
      change.end=oldOffset;
      i++; continue;
    }
  }
  flush();
  return ops;
}
function replaceRichTextRangePreservingFormatting(container,start,end,original,corrected){
  if(!container) return false;
  const oldText=String(original==null?'':original), newText=String(corrected==null?'':corrected);
  if(oldText===newText) return true;
  const ops=buildCorrectionReplacementOps(oldText,newText);
  // Aplica ao contrário para que os offsets do começo da seleção permaneçam
  // válidos mesmo quando uma correção aumenta/diminui o número de caracteres.
  for(let i=ops.length-1;i>=0;i--){
    const op=ops[i];
    if(!replaceRichTextRange(container,start+op.start,start+op.end,op.replacement)) return false;
  }
  return true;
}
// Versão para o marcador de comentário. O HTML é produzido só pelo próprio
// app, com o conteúdo do usuário escapado antes de chegar aqui.
function replaceRichHtmlRange(container, start, end, html){
  const range = textOffsetToRange(container, start, end);
  if(!range) return false;
  const fragment = range.createContextualFragment(html);
  range.deleteContents();
  range.insertNode(fragment);
  return true;
}
// o inverso de textOffsetToRange: acha o índice de caractere (relativo ao
// .textContent do container) que corresponde a um nó+offset do DOM. Usado
// pra guardar a seleção como números (que sobrevivem a um render()) em vez
// de um objeto Range (que fica inválido assim que o nó original é recriado).
function domPositionToTextOffset(container, node, offset){
  // um boundary de Range pode apontar pra um nó de TEXTO (offset = índice do
  // caractere) ou pra um ELEMENTO (offset = índice do filho) — o próprio
  // Range.setEnd já sabe resolver os dois casos corretamente, então em vez
  // de reimplementar isso na mão, só mede o texto do começo do container até
  // esse ponto.
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}
function openInsertImageModal(savedOffsetOverride, savedScrollOverride){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  const context=savedOffsetOverride ? null : takeRichToolbarContext();
  const savedOffset = savedOffsetOverride || context?.selection || ((note && note.format === 'plain') ? captureRichCursorOffset() : null);
  const scrollState = savedScrollOverride || context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  state.modal = { type:'insert-note-image', url:'', alt:'', savedOffset, scrollState };
  render();
}
function openNoteInsertOption(select){
  const choice=select.value;
  select.value='';
  if(!choice) return;
  const savedOffset=state.pendingNoteInsertOffset || null;
  const selectedText=state.pendingNoteInsertText || '';
  const savedScroll=state.pendingNoteInsertScroll || null;
  state.pendingNoteInsertOffset=null;
  state.pendingNoteInsertText=null;
  state.pendingNoteInsertScroll=null;
  pendingRichToolbarContext=null;
  if(choice==='link') openInsertRichLinkModal(savedOffset,selectedText,savedScroll);
  else if(choice==='image-url') openInsertImageModal(savedOffset,savedScroll);
  else if(choice==='image-upload') openNoteImageUploadPicker(savedOffset,savedScroll);
}
function confirmInsertNoteImage(){
  const m = state.modal;
  const url = (m.url||'').trim();
  if(!url){ showToast('Cole o link da imagem.', 'error'); return; }
  const alt = m.alt||'';
  const savedOffset = m.savedOffset;
  const scrollState = m.scrollState;
  state.modal = null;
  render();
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(note && note.format === 'plain'){
    const el = focusRichEditor();
    if(el){
      restoreRichCursorOffset(el, savedOffset);
      document.execCommand('insertHTML', false, `<img data-note-image-id="${uid()}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`);
      onNoteContentInput(state.currentNoteId, el.innerHTML);
      if(scrollState && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scrollState);
    }
  } else {
    insertImageMarkdown('note-editor-textarea', url, alt);
  }
}
function openNoteImageUploadPicker(savedOffsetOverride, savedScrollOverride){
  const noteId = state.currentNoteId;
  if(!noteId) return;
  const note = state.notesItems.find(n=>n.id===noteId);
  const context=savedOffsetOverride ? null : takeRichToolbarContext();
  const savedOffset = savedOffsetOverride || context?.selection || ((note && note.format === 'plain') ? captureRichCursorOffset() : null);
  const scrollState = savedScrollOverride || context?.scroll || (typeof captureNoteEditorScrollState==='function' ? captureNoteEditorScrollState() : null);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    showToast('Enviando imagem...');
    try{
      const url = await uploadNoteImage(file);
      const alt = file.name.replace(/\.[^/.]+$/, '');
      if(note && note.format === 'plain'){
        const el = focusRichEditor();
        if(el){
          restoreRichCursorOffset(el, savedOffset);
          document.execCommand('insertHTML', false, `<img data-note-image-id="${uid()}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`);
          onNoteContentInput(noteId, el.innerHTML);
          if(scrollState && typeof restoreNoteEditorScrollState==='function') restoreNoteEditorScrollState(scrollState);
        }
      } else {
        insertImageMarkdown('note-editor-textarea', url, alt);
      }
      showToast('Imagem enviada!');
    }catch(err){
      console.error('Falha ao enviar imagem da nota', err);
      showToast('Não consegui enviar a imagem. Tente de novo.', 'error');
    }
  };
  input.click();
}

// Imagens inseridas por upload, link ou pela IA são imagens HTML comuns no
// editor visual. Um clique mostra alças diretamente na imagem, sem precisar
// baixar ou reenviar o arquivo original.
let selectedNoteImageId = null;
let noteImageTransformOverlay = null;
let noteImageTransformDrag = null;
let noteImageLayoutMenu = null;
let noteImageLongPressTimer = null;
let noteImageLongPressStart = null;
let suppressNoteImageClickUntil = 0;
document.addEventListener('click', (event) => {
  const image = event.target && event.target.closest && event.target.closest('#note-editor-plain img, .note-page-sheet-content img');
  if(event.target && event.target.closest && event.target.closest('.note-image-layout-menu')) return;
  if(image && Date.now()<suppressNoteImageClickUntil){ event.preventDefault(); return; }
  closeNoteImageLayoutMenu();
  if(!image){
    if(!event.target.closest || !event.target.closest('.note-image-transform-overlay')) clearSelectedNoteImage();
    return;
  }
  selectNoteImage(image);
});
function selectNoteImage(image){
  document.querySelectorAll('#note-editor-plain img.note-image-selected, .note-page-sheet-content img.note-image-selected').forEach(img => img.classList.remove('note-image-selected'));
  image.dataset.noteImageId = image.dataset.noteImageId || uid();
  image.classList.add('note-image-selected');
  selectedNoteImageId = image.dataset.noteImageId;
  // O painel abre um modal e redesenha a nota. Mantemos o identificador no
  // HTML em memória para que a imagem continue selecionada depois do redraw.
  const editor = document.getElementById('note-editor-plain');
  if(editor && editor.contains(image)){
    noteContentCache[state.currentNoteId] = editor.innerHTML;
  }else{
    const holder=document.createElement('div');
    holder.innerHTML=getNoteContent(state.currentNoteId);
    const previewImages=Array.from(document.querySelectorAll('.note-page-sheet-content img'));
    const index=previewImages.indexOf(image);
    const sourceImage=Array.from(holder.querySelectorAll('img'))[index];
    if(sourceImage){
      sourceImage.dataset.noteImageId=selectedNoteImageId;
      noteContentCache[state.currentNoteId]=holder.innerHTML;
    }
  }
  setTimeout(syncNoteImageTransformOverlay, 0);
}
function clearSelectedNoteImage(){
  document.querySelectorAll('#note-editor-plain img.note-image-selected, .note-page-sheet-content img.note-image-selected').forEach(img => img.classList.remove('note-image-selected'));
  selectedNoteImageId=null;
  removeNoteImageTransformOverlay();
  closeNoteImageLayoutMenu();
}
document.addEventListener('contextmenu', (event) => {
  const image=event.target && event.target.closest && event.target.closest('#note-editor-plain img, .note-page-sheet-content img');
  if(!image) return;
  event.preventDefault();
  selectNoteImage(image);
  openNoteImageLayoutMenu(event.clientX,event.clientY);
});
document.addEventListener('pointerdown', (event) => {
  if(event.pointerType!=='touch') return;
  const image=event.target && event.target.closest && event.target.closest('#note-editor-plain img, .note-page-sheet-content img');
  if(!image) return;
  clearTimeout(noteImageLongPressTimer);
  noteImageLongPressStart={x:event.clientX,y:event.clientY,image};
  noteImageLongPressTimer=setTimeout(()=>{
    if(!noteImageLongPressStart) return;
    selectNoteImage(noteImageLongPressStart.image);
    suppressNoteImageClickUntil=Date.now()+750;
    openNoteImageLayoutMenu(noteImageLongPressStart.x,noteImageLongPressStart.y);
    noteImageLongPressStart=null;
  },550);
},true);
document.addEventListener('pointermove', (event) => {
  if(!noteImageLongPressStart) return;
  if(Math.hypot(event.clientX-noteImageLongPressStart.x,event.clientY-noteImageLongPressStart.y)>12){ clearTimeout(noteImageLongPressTimer); noteImageLongPressStart=null; }
},true);
document.addEventListener('pointerup', ()=>{ clearTimeout(noteImageLongPressTimer); noteImageLongPressStart=null; },true);
document.addEventListener('pointercancel', ()=>{ clearTimeout(noteImageLongPressTimer); noteImageLongPressStart=null; },true);
function closeNoteImageLayoutMenu(){
  if(noteImageLayoutMenu){ noteImageLayoutMenu.remove(); noteImageLayoutMenu=null; }
}
function openNoteImageLayoutMenu(x,y){
  closeNoteImageLayoutMenu();
  const image=getSelectedNoteImage();
  if(!image) return;
  const active=image.dataset.noteImageLayout||'inline';
  const choices=[
    ['inline','↔ Em linha com o texto'], ['block','↕ Acima e abaixo'],
    ['wrap-left','◧ Texto à direita'], ['wrap-right','◨ Texto à esquerda'],
    ['behind','▤ Atrás do texto'], ['free','▣ Livre, sobre o texto']
  ];
  noteImageLayoutMenu=document.createElement('div');
  noteImageLayoutMenu.className='note-image-layout-menu';
  noteImageLayoutMenu.innerHTML=`<div class="note-image-layout-menu-label">COMPORTAMENTO NO TEXTO</div><div class="note-image-layout-menu-grid">${choices.map(([value,label])=>`<button type="button" data-note-image-layout-choice="${value}" class="${active===value?'active':''}">${label}</button>`).join('')}</div><button type="button" data-note-image-delete style="margin-top:7px; color:var(--error);">⌫ Excluir imagem</button><div class="note-image-layout-menu-label">Clique fora para fechar</div>`;
  noteImageLayoutMenu.querySelectorAll('[data-note-image-layout-choice]').forEach(button=>button.addEventListener('click',(event)=>{ event.stopPropagation(); setNoteImageLayout(button.dataset.noteImageLayoutChoice); closeNoteImageLayoutMenu(); }));
  noteImageLayoutMenu.querySelector('[data-note-image-delete]').addEventListener('click',(event)=>{ event.stopPropagation(); deleteSelectedNoteImage(); });
  document.body.appendChild(noteImageLayoutMenu);
  const menuRect=noteImageLayoutMenu.getBoundingClientRect();
  noteImageLayoutMenu.style.left=`${Math.max(8,Math.min(x,window.innerWidth-menuRect.width-8))}px`;
  noteImageLayoutMenu.style.top=`${Math.max(8,Math.min(y,window.innerHeight-menuRect.height-8))}px`;
}
function setNoteImageLayout(layout){
  const image=getSelectedNoteImage();
  if(!image) return;
  const host=image.closest('figure')||image;
  const rect=host.getBoundingClientRect();
  const parentRect=host.parentElement?.getBoundingClientRect();
  image.dataset.noteImageLayout=layout;
  host.dataset.noteImageLayout=layout;
  host.style.float=''; host.style.clear=''; host.style.position=''; host.style.left=''; host.style.top=''; host.style.zIndex=''; host.style.opacity='';
  if(layout==='inline'){
    host.style.display='inline'; host.style.margin='0 4px';
  }else if(layout==='block'){
    host.style.display='block'; host.style.margin='12px auto';
  }else if(layout==='wrap-left' || layout==='wrap-right'){
    host.style.display='block';
  }else{
    host.style.display='block';
    host.style.left=`${Math.max(0,rect.left-(parentRect?.left||rect.left))}px`;
    host.style.top=`${Math.max(0,rect.top-(parentRect?.top||rect.top))}px`;
  }
  commitSelectedNoteImageStyle(image);
}
function deleteSelectedNoteImage(){
  const image=getSelectedNoteImage();
  if(!image) return;
  const editor=document.getElementById('note-editor-plain');
  if(editor && editor.contains(image)){
    (image.closest('figure')||image).remove();
    onNoteContentInput(state.currentNoteId,editor.innerHTML);
  }else{
    const holder=document.createElement('div');
    holder.innerHTML=getNoteContent(state.currentNoteId);
    const source=holder.querySelector(`img[data-note-image-id="${selectedNoteImageId}"]`);
    if(!source) return;
    (source.closest('figure')||source).remove();
    onNoteContentInput(state.currentNoteId,holder.innerHTML);
    render();
  }
  clearSelectedNoteImage();
  showToast('Imagem excluída.');
}
document.addEventListener('keydown', (event) => {
  if(!selectedNoteImageId || (event.key!=='Delete' && event.key!=='Backspace')) return;
  const active=document.activeElement;
  if(active && ['INPUT','TEXTAREA'].includes(active.tagName)) return;
  if(!getSelectedNoteImage()) return;
  event.preventDefault();
  deleteSelectedNoteImage();
});
function getSelectedNoteImage(){
  return selectedNoteImageId ? document.querySelector(`#note-editor-plain img[data-note-image-id="${selectedNoteImageId}"], .note-page-sheet-content img[data-note-image-id="${selectedNoteImageId}"]`) : null;
}
function removeNoteImageTransformOverlay(){
  if(noteImageTransformOverlay){ noteImageTransformOverlay.remove(); noteImageTransformOverlay=null; }
}
function syncNoteImageTransformOverlay(){
  const image=getSelectedNoteImage();
  if(!image || !image.isConnected){ removeNoteImageTransformOverlay(); return; }
  const rawRect=image.getBoundingClientRect();
  const rect=getNoteImageVisibleRect(image,rawRect);
  if(rect.width<4 || rect.height<4){ removeNoteImageTransformOverlay(); return; }
  if(!noteImageTransformOverlay){
    noteImageTransformOverlay=document.createElement('div');
    noteImageTransformOverlay.className='note-image-transform-overlay';
    noteImageTransformOverlay.innerHTML=`
      <button type="button" class="note-image-resize-handle" data-note-image-action="resize-nw" aria-label="Redimensionar imagem"></button>
      <button type="button" class="note-image-resize-handle" data-note-image-action="resize-ne" aria-label="Redimensionar imagem"></button>
      <button type="button" class="note-image-resize-handle" data-note-image-action="resize-se" aria-label="Redimensionar imagem"></button>
      <button type="button" class="note-image-resize-handle" data-note-image-action="resize-sw" aria-label="Redimensionar imagem"></button>
      <button type="button" class="note-image-crop-handle n" data-note-image-action="crop-n" aria-label="Recortar topo"></button>
      <button type="button" class="note-image-crop-handle e" data-note-image-action="crop-e" aria-label="Recortar direita"></button>
      <button type="button" class="note-image-crop-handle s" data-note-image-action="crop-s" aria-label="Recortar base"></button>
      <button type="button" class="note-image-crop-handle w" data-note-image-action="crop-w" aria-label="Recortar esquerda"></button>
      <button type="button" class="note-image-layout-trigger" aria-label="Comportamento da imagem">•••</button>`;
    noteImageTransformOverlay.querySelectorAll('[data-note-image-action]').forEach(handle=>handle.addEventListener('pointerdown', beginNoteImageTransform));
    noteImageTransformOverlay.querySelector('.note-image-layout-trigger').addEventListener('click',(event)=>{
      event.preventDefault(); event.stopPropagation();
      const trigger=event.currentTarget.getBoundingClientRect();
      openNoteImageLayoutMenu(trigger.left+trigger.width/2,trigger.bottom+6);
    });
    document.body.appendChild(noteImageTransformOverlay);
  }
  Object.assign(noteImageTransformOverlay.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  const handle=(action)=>noteImageTransformOverlay.querySelector(`[data-note-image-action="${action}"]`);
  Object.assign(handle('resize-nw').style,{left:'-7px',top:'-7px',cursor:'nwse-resize'});
  Object.assign(handle('resize-ne').style,{right:'-7px',top:'-7px',cursor:'nesw-resize'});
  Object.assign(handle('resize-se').style,{right:'-7px',bottom:'-7px',cursor:'nwse-resize'});
  Object.assign(handle('resize-sw').style,{left:'-7px',bottom:'-7px',cursor:'nesw-resize'});
  Object.assign(handle('crop-n').style,{top:'-3px'});
  Object.assign(handle('crop-e').style,{right:'-3px'});
  Object.assign(handle('crop-s').style,{bottom:'-3px'});
  Object.assign(handle('crop-w').style,{left:'-3px'});
}
function readNoteImageCrop(image){
  const match=(image.style.clipPath||'').match(/^inset\(([\d.]+)% ([\d.]+)% ([\d.]+)% ([\d.]+)%\)$/);
  return match ? {top:+match[1],right:+match[2],bottom:+match[3],left:+match[4]} : {top:0,right:0,bottom:0,left:0};
}
function getNoteImageVisibleRect(image, rawRect=image.getBoundingClientRect(), crop=readNoteImageCrop(image)){
  const horizontal=Math.max(.01,1-(crop.left+crop.right)/100);
  const vertical=Math.max(.01,1-(crop.top+crop.bottom)/100);
  return {
    left:rawRect.left+rawRect.width*crop.left/100,
    top:rawRect.top+rawRect.height*crop.top/100,
    width:rawRect.width*horizontal,
    height:rawRect.height*vertical,
    horizontal, vertical
  };
}
function beginNoteImageTransform(event){
  const image=getSelectedNoteImage();
  if(!image) return;
  event.preventDefault(); event.stopPropagation();
  const rawRect=image.getBoundingClientRect();
  const crop=readNoteImageCrop(image);
  const rect=getNoteImageVisibleRect(image,rawRect,crop);
  noteImageTransformDrag={
    image, action:event.currentTarget.dataset.noteImageAction, startX:event.clientX, startY:event.clientY,
    rect, rawRect, crop, containerWidth:Math.max(rawRect.width, image.parentElement?.getBoundingClientRect().width||rawRect.width)
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', moveNoteImageTransform);
  window.addEventListener('pointerup', finishNoteImageTransform, {once:true});
}
function moveNoteImageTransform(event){
  const drag=noteImageTransformDrag;
  if(!drag) return;
  const {image,action,rect,rawRect}=drag;
  const dx=event.clientX-drag.startX, dy=event.clientY-drag.startY;
  if(action.startsWith('resize-')){
    const horizontal=action.endsWith('e') ? dx : -dx;
    const vertical=action.includes('s') ? dy : -dy;
    const nextVisibleWidth=Math.max(40, rect.width + (Math.abs(horizontal)>Math.abs(vertical)?horizontal:vertical));
    const nextRawWidth=nextVisibleWidth/rect.horizontal;
    image.style.width=`${Math.min(100, Math.max(8, nextRawWidth/drag.containerWidth*100)).toFixed(2)}%`;
  }else{
    const crop={...drag.crop};
    const cap=(value, other)=>Math.max(0,Math.min(92-other,value));
    if(action==='crop-n') crop.top=cap(drag.crop.top+dy/rawRect.height*100,crop.bottom);
    if(action==='crop-s') crop.bottom=cap(drag.crop.bottom-dy/rawRect.height*100,crop.top);
    if(action==='crop-w') crop.left=cap(drag.crop.left+dx/rawRect.width*100,crop.right);
    if(action==='crop-e') crop.right=cap(drag.crop.right-dx/rawRect.width*100,crop.left);
    image.style.clipPath=`inset(${crop.top.toFixed(2)}% ${crop.right.toFixed(2)}% ${crop.bottom.toFixed(2)}% ${crop.left.toFixed(2)}%)`;
  }
  syncNoteImageTransformOverlay();
}
function finishNoteImageTransform(){
  window.removeEventListener('pointermove', moveNoteImageTransform);
  if(!noteImageTransformDrag) return;
  const image=noteImageTransformDrag.image;
  noteImageTransformDrag=null;
  commitSelectedNoteImageStyle(image);
}
function commitSelectedNoteImageStyle(image){
  const editor=document.getElementById('note-editor-plain');
  if(editor && editor.contains(image)){
    onNoteContentInput(state.currentNoteId, editor.innerHTML);
  }else{
    const holder=document.createElement('div');
    holder.innerHTML=getNoteContent(state.currentNoteId);
    const source=holder.querySelector(`img[data-note-image-id="${selectedNoteImageId}"]`);
    if(source){
      source.style.cssText=image.style.cssText;
      if(image.dataset.noteImageLayout) source.dataset.noteImageLayout=image.dataset.noteImageLayout;
      else delete source.dataset.noteImageLayout;
      const sourceHost=source.closest('figure');
      const imageHost=image.closest('figure');
      if(sourceHost && imageHost){
        sourceHost.style.cssText=imageHost.style.cssText;
        if(imageHost.dataset.noteImageLayout) sourceHost.dataset.noteImageLayout=imageHost.dataset.noteImageLayout;
        else delete sourceHost.dataset.noteImageLayout;
      }
      onNoteContentInput(state.currentNoteId,holder.innerHTML); render();
    }
  }
  setTimeout(syncNoteImageTransformOverlay,0);
}
window.addEventListener('resize', syncNoteImageTransformOverlay);
document.addEventListener('scroll', syncNoteImageTransformOverlay, true);
function applyNoteImageChange(image, change){
  if(change.reset){ image.style.width=''; image.style.display=''; image.style.marginLeft=''; image.style.marginRight=''; image.style.aspectRatio=''; image.style.objectFit=''; image.style.clipPath=''; return; }
  if(change.size) image.style.width = `${change.size}%`;
  if(change.align){ image.style.display='block'; image.style.marginLeft=change.align==='left'?'0':'auto'; image.style.marginRight=change.align==='right'?'0':'auto'; }
  if(change.crop === 'square'){ image.style.width='48%'; image.style.aspectRatio='1 / 1'; image.style.objectFit='cover'; }
  if(change.crop === 'wide'){ image.style.width='100%'; image.style.aspectRatio='16 / 9'; image.style.objectFit='cover'; }
  if(change.crop === 'original'){ image.style.aspectRatio=''; image.style.objectFit=''; }
}
function updateSelectedNoteImage(change){
  const image = getSelectedNoteImage();
  if(!image){ showToast('Clique na imagem que deseja ajustar primeiro.', 'error'); return; }
  const editor=document.getElementById('note-editor-plain');
  if(editor){
    const sourceImage=editor.querySelector(`img[data-note-image-id="${selectedNoteImageId}"]`);
    if(!sourceImage){ showToast('Não encontrei a imagem selecionada.', 'error'); return; }
    applyNoteImageChange(sourceImage,change);
    onNoteContentInput(state.currentNoteId,editor.innerHTML);
  }else{
    const holder=document.createElement('div');
    holder.innerHTML=getNoteContent(state.currentNoteId);
    const sourceImage=holder.querySelector(`img[data-note-image-id="${selectedNoteImageId}"]`);
    if(!sourceImage){ showToast('Não encontrei a imagem selecionada.', 'error'); return; }
    applyNoteImageChange(sourceImage,change);
    onNoteContentInput(state.currentNoteId,holder.innerHTML);
    render();
  }
  setTimeout(syncNoteImageTransformOverlay,0);
}

/* --- seleção de texto na nota: criar cartão a partir do trecho, ou pedir
   correção ortográfica/gramatical à IA. A correção só é oferecida quando a
   seleção vem da textarea (fonte), porque só ali dá pra saber o start/end
   exato pra substituir depois — na prévia renderizada não tem como mapear
   de volta pro markdown original com segurança. --- */
document.addEventListener('mouseup', handleNoteSelection);
// no celular, o touchend dispara antes da seleção "assentar" (e o usuário ainda
// pode arrastar as alcinhas nativas depois, sem gerar outro touchend no editor) —
// por isso, além do touchend com um pequeno atraso, também escutamos o
// selectionchange do documento inteiro, que É disparado a cada ajuste das
// alcinhas. Não funciona 100% em todo navegador/celular, mas quando funciona já
// evita ter que copiar e colar o trecho pra usar os botões de IA.
document.addEventListener('touchend', () => setTimeout(handleNoteSelection, 60));
document.addEventListener('keyup', handleNoteSelection);
document.addEventListener('select', handleNoteSelection);
let noteSelectionChangeTimer = null;
document.addEventListener('selectionchange', () => {
  if(state.view !== 'notes' || !state.currentNoteId) return;
  // Dead keys/IME também mexem temporariamente na Selection. Não rodamos a
  // lógica de barra contextual nesse intervalo: mesmo sem alterar o Range,
  // consultar/atualizar UI no meio da composição é fonte de bugs entre engines.
  if(typeof isTextCompositionActive==='function' && isTextCompositionActive()) return;
  clearTimeout(noteSelectionChangeTimer);
  noteSelectionChangeTimer = setTimeout(()=>{
    if(typeof isTextCompositionActive==='function' && isTextCompositionActive()) return;
    handleNoteSelection();
  }, 220);
});
function handleNoteSelection(e){
  if(state.view !== 'notes' || !state.currentNoteId) return;
  if((e && e.isComposing) || (typeof isTextCompositionActive==='function' && isTextCompositionActive())) return;
  // clicar nos próprios botões da barra (Corrigir/Criar cartão) dispara um mouseup
  // fora da textarea/prévia, que sem essa guarda apagaria state.noteSelection um
  // instante antes do onclick do botão rodar — os botões pareciam não fazer nada.
  if(e && e.target && e.target.closest && e.target.closest('#note-selection-bar')) return;
  const bar = document.getElementById('note-selection-bar');
  if(!bar) return;
  const correctBtn = document.getElementById('note-correct-btn');
  const commentBtn = document.getElementById('note-comment-btn');
  const activeEl = document.activeElement;
  if(activeEl && activeEl.id === 'note-editor-textarea'){
    const start = activeEl.selectionStart, end = activeEl.selectionEnd;
    if(end > start){
      const rawText = activeEl.value.slice(start, end);
      const leading = rawText.length - rawText.trimStart().length;
      const trailing = rawText.length - rawText.trimEnd().length;
      const text = rawText.slice(leading, rawText.length - trailing);
      if(text){
        state.noteSelection = { text, source:'textarea', start:start+leading, end:end-trailing };
        bar.style.display = 'flex';
        if(correctBtn) correctBtn.style.display = '';
        if(commentBtn) commentBtn.style.display = '';
        return;
      }
    }
  } else {
    const richEl = document.getElementById('note-editor-plain');
    const sel = window.getSelection();
    const rawSelectedText = sel ? sel.toString() : '';
    const leadingSelectedWhitespace = rawSelectedText.length - rawSelectedText.trimStart().length;
    const trailingSelectedWhitespace = rawSelectedText.length - rawSelectedText.trimEnd().length;
    const text = rawSelectedText.slice(leadingSelectedWhitespace, rawSelectedText.length - trailingSelectedWhitespace);
    // texto normal (contenteditable): a correção também funciona aqui — guarda
    // os ÍNDICES de caractere (não um Range de verdade, que ficaria inválido
    // assim que render() recriar o contenteditable enquanto a IA está pensando).
    if(text && richEl && sel.rangeCount && !sel.isCollapsed && richEl.contains(sel.anchorNode)){
      const r = sel.getRangeAt(0);
      const start = domPositionToTextOffset(richEl, r.startContainer, r.startOffset) + leadingSelectedWhitespace;
      const end = domPositionToTextOffset(richEl, r.endContainer, r.endOffset) - trailingSelectedWhitespace;
      state.noteSelection = { text, source:'richtext', start, end };
      bar.style.display = 'flex';
      if(correctBtn) correctBtn.style.display = '';
      if(commentBtn) commentBtn.style.display = '';
      return;
    }
    const preview = document.querySelector('.notes-preview');
    if(text && preview && sel.anchorNode && preview.contains(sel.anchorNode)){
      state.noteSelection = { text, source:'preview' };
      bar.style.display = 'flex';
      if(correctBtn) correctBtn.style.display = 'none';
      if(commentBtn) commentBtn.style.display = 'none';
      return;
    }
  }
  state.noteSelection = null;
  bar.style.display = 'none';
}
function hideNoteSelectionBar(){
  state.noteSelection = null;
  const bar = document.getElementById('note-selection-bar');
  if(bar) bar.style.display = 'none';
  if(window.getSelection) window.getSelection().removeAllRanges();
}
// app roda tanto no Windows quanto no Mac — os atalhos de teclado da nota usam
// Ctrl num e Cmd no outro, então o rótulo mostrado no título dos botões também
// precisa mudar (senão um usuário de Mac vê "Ctrl" e não acha o atalho).
function isMacPlatform(){
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
}
function noteShortcutLabel(letter){
  return isMacPlatform() ? `⌘⇧${letter.toUpperCase()}` : `Ctrl+Shift+${letter.toUpperCase()}`;
}
/* --- Revisor: testar uma mudança num trecho sem comprometer o texto ainda.
   Em vez de guardar os comentários numa lista separada (que exigiria recalcular
   a posição de cada um toda vez que outro trecho do texto muda de tamanho), a
   marcação fica EMBUTIDA no próprio conteúdo da nota, como uma tag <mark> —
   o mesmo truque que os wikilinks já usam (preprocessWikiLinks). Assim, um
   comentário nunca fica "desalinhado": ele é sempre encontrado pelo id, não por
   posição. Guarda a versão antiga e a nova nos atributos, e mostra uma das duas
   como conteúdo visível da tag, conforme o usuário for alternando. --- */
function noteCommentTagRegex(id){
  return new RegExp(`<mark class="revisor-mark" data-comment-id="${id}" data-original="([^"]*)" data-proposed="([^"]*)" data-showing="(?:proposed|original)">[\\s\\S]*?<\\/mark>`);
}
function getNoteComments(note){
  const content = getNoteContent(note.id);
  const re = /<mark class="revisor-mark" data-comment-id="([^"]+)" data-original="([^"]*)" data-proposed="([^"]*)" data-showing="(proposed|original)">[\s\S]*?<\/mark>/g;
  const out = [];
  let m;
  while((m = re.exec(content))){
    out.push({ id:m[1], original: htmlToText(m[2]), proposed: htmlToText(m[3]), showing: m[4] });
  }
  return out;
}
function openNoteCommentModal(){
  const sel = state.noteSelection;
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!sel || !sel.text || (sel.source !== 'textarea' && sel.source !== 'richtext') || !note) return;
  if(note.format !== 'plain' && /\n/.test(sel.text)){
    showToast('Por enquanto, selecione um trecho de uma linha só pra comentar.', 'error');
    return;
  }
  hideNoteSelectionBar();
  state.modal = { type:'note-comment-create', noteId: note.id, source: sel.source, start: sel.start, end: sel.end, original: sel.text, proposed: sel.text };
  render();
}
function confirmCreateNoteComment(){
  const m = state.modal;
  if(!m || m.type !== 'note-comment-create') return;
  const proposed = (m.proposed||'').trim();
  if(!proposed){ showToast('Escreva o texto novo.', 'error'); return; }
  const note = state.notesItems.find(n=>n.id===m.noteId);
  if(!note) return;
  const before = getNoteContent(note.id);
  const id = uid();
  const originalEsc = escapeHtml(m.original);
  const proposedEsc = escapeHtml(proposed);
  const tag = `<mark class="revisor-mark" data-comment-id="${id}" data-original="${originalEsc}" data-proposed="${proposedEsc}" data-showing="proposed">${proposedEsc}</mark>`;

  if(m.source === 'richtext'){
    const el = document.getElementById('note-editor-plain');
    if(!el || !replaceRichHtmlRange(el, m.start, m.end, tag)){
      showToast('Não consegui localizar o trecho — tente selecionar de novo.', 'error');
      return;
    }
    noteContentCache[note.id] = el.innerHTML;
  } else {
    const current = getNoteContent(note.id);
    noteContentCache[note.id] = current.slice(0, m.start) + tag + current.slice(m.end);
  }
  recordNoteHistory(note.id, before, noteContentCache[note.id]);
  note.updatedAt = Date.now();
  state.modal = null;
  saveData(); render();
  saveNoteContentToR2(note.id, noteContentCache[note.id]);
  showToast('Comentário criado — o trecho novo está destacado em verde.');
}
// aplica a troca de tag no conteúdo (string) da nota e salva — usado tanto pra
// alternar entre versões quanto pra resolver (finalizar/descartar) um comentário.
function saveNoteContentUpdate(note, updated){
  recordNoteHistory(note.id, getNoteContent(note.id), updated);
  noteContentCache[note.id] = updated;
  note.updatedAt = Date.now();
  saveData();
  saveNoteContentToR2(note.id, updated);
}
function openNoteCommentsPanel(focusCommentId){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!note) return;
  const comments = getNoteComments(note);
  if(!comments.length){ showToast('Essa nota não tem comentários pendentes.', 'error'); return; }
  let index = focusCommentId ? comments.findIndex(c=>c.id===focusCommentId) : 0;
  if(index < 0) index = 0;
  state.noteCommentsPanel = { index };
  render();
}
function closeNoteCommentsPanel(){
  state.noteCommentsPanel = null;
  render();
}
function nextNoteComment(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  const p = state.noteCommentsPanel;
  if(!note || !p) return;
  const n = getNoteComments(note).length;
  if(!n) return;
  p.index = (p.index+1) % n;
  render();
}
function prevNoteComment(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  const p = state.noteCommentsPanel;
  if(!note || !p) return;
  const n = getNoteComments(note).length;
  if(!n) return;
  p.index = (p.index-1+n) % n;
  render();
}
function toggleActiveNoteComment(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  const p = state.noteCommentsPanel;
  if(!note || !p) return;
  const c = getNoteComments(note)[p.index];
  if(!c) return;
  const content = getNoteContent(note.id);
  const match = content.match(noteCommentTagRegex(c.id));
  if(!match) return;
  const [full, originalEsc, proposedEsc] = match;
  const newShowing = c.showing === 'proposed' ? 'original' : 'proposed';
  const displayEsc = newShowing === 'proposed' ? proposedEsc : originalEsc;
  const newTag = `<mark class="revisor-mark" data-comment-id="${c.id}" data-original="${originalEsc}" data-proposed="${proposedEsc}" data-showing="${newShowing}">${displayEsc}</mark>`;
  const updated = content.slice(0, match.index) + newTag + content.slice(match.index + full.length);
  saveNoteContentUpdate(note, updated);
  render();
}
// resolve (aplica ou descarta) o comentário ativo: troca a tag inteira pelo
// texto escolhido puro, sem marcação — o comentário deixa de existir.
function resolveActiveNoteComment(keepProposed){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  const p = state.noteCommentsPanel;
  if(!note || !p) return;
  const c = getNoteComments(note)[p.index];
  if(!c) return;
  const content = getNoteContent(note.id);
  const match = content.match(noteCommentTagRegex(c.id));
  if(!match) return;
  const [full, originalEsc, proposedEsc] = match;
  const chosenEsc = keepProposed ? proposedEsc : originalEsc;
  // nota markdown guarda texto puro (o textarea decodifica sozinho); nota "texto
  // normal" guarda innerHTML, onde o caractere precisa continuar escapado.
  const chosen = note.format === 'plain' ? chosenEsc : htmlToText(chosenEsc);
  const updated = content.slice(0, match.index) + chosen + content.slice(match.index + full.length);
  saveNoteContentUpdate(note, updated);
  const remaining = getNoteComments(note);
  state.noteCommentsPanel = remaining.length ? { index: Math.min(p.index, remaining.length-1) } : null;
  render();
  showToast(keepProposed ? 'Mudança aplicada — o comentário foi resolvido.' : 'Comentário descartado — o texto voltou ao original.');
}
/* --- Sumário: lê os títulos H1/H2/H3 direto do conteúdo (não guarda lista à
   parte) — assim nunca fica desatualizado, sempre reflete o texto atual. --- */
function getNoteHeadings(note){
  if(note.format === 'plain'){
    const tmp = document.createElement('div');
    tmp.innerHTML = getNoteContent(note.id);
    return Array.from(tmp.querySelectorAll('h1,h2,h3')).map((h,i) => ({
      level: parseInt(h.tagName.slice(1),10), text: h.textContent.trim(), index: i
    })).filter(h => h.text);
  }
  const content = getNoteContent(note.id);
  const re = /^(#{1,3})[ \t]+(.+)$/gm;
  const out = [];
  let m;
  while((m = re.exec(content))){
    const text = m[2].trim();
    if(text) out.push({ level: m[1].length, text, start: m.index, index: out.length });
  }
  return out;
}
function openNoteTocModal(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!note) return;
  state.modal = { type:'note-toc', noteId: note.id };
  render();
}
function jumpToNoteHeading(index){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!note) return;
  if(note.format === 'plain'){
    const el = document.getElementById('note-editor-plain');
    const target = el ? el.querySelectorAll('h1,h2,h3')[index] : null;
    if(target) target.scrollIntoView({ block:'start', behavior:'smooth' });
    return;
  }
  const headings = getNoteHeadings(note);
  const target = headings[index];
  if(!target) return;
  const textarea = document.getElementById('note-editor-textarea');
  if(textarea){
    textarea.focus();
    textarea.setSelectionRange(target.start, target.start + target.level + 1 + target.text.length);
  }
  const previewEl = document.querySelector('.notes-preview');
  const previewTarget = previewEl ? previewEl.querySelectorAll('h1,h2,h3')[index] : null;
  if(previewTarget) previewTarget.scrollIntoView({ block:'start', behavior:'smooth' });
}
function jumpToNoteHeadingFromModal(index){
  closeModal();
  jumpToNoteHeading(index);
}
document.addEventListener('click', (e) => {
  const mark = e.target.closest && e.target.closest('.revisor-mark');
  if(!mark || !mark.dataset.commentId) return;
  e.preventDefault();
  openNoteCommentsPanel(mark.dataset.commentId);
});
function requestCardFromNoteSelection(){
  const sel = state.noteSelection;
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!sel || !sel.text || !note) return;
  hideNoteSelectionBar();
  state.modal = { type:'note-passage-card', status:'loading', passage:sel.text, card:{front:'',back:'',note:''}, deckId: note.linkedDeckId || '', noteId: note.id };
  render();
  generateCardFromPassage(sel.text).then(card => {
    if(state.modal && state.modal.type === 'note-passage-card'){
      state.modal.status = 'review';
      state.modal.card = card;
      render();
    }
  }).catch(err => {
    console.error('Falha ao gerar cartão a partir da nota', err);
    if(state.modal && state.modal.type === 'note-passage-card'){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
      render();
    }
  });
}
function selectNotePassageCardDeck(value){
  const m = state.modal;
  if(!m || m.type !== 'note-passage-card') return;
  if(value === '__new__'){
    const note = state.notesItems.find(n=>n.id===m.noteId);
    m.creatingNewDeck = true;
    m.newDeckName = (note && note.name) || '';
  } else {
    m.deckId = value;
    m.creatingNewDeck = false;
  }
  render();
}
function confirmCreateDeckInlineForNote(){
  const m = state.modal;
  if(!m || m.type !== 'note-passage-card') return;
  const name = (m.newDeckName||'').trim();
  if(!name){ showToast('Dê um nome ao baralho.', 'error'); return; }
  const color = DECK_COLORS[state.decks.length % DECK_COLORS.length];
  const deck = { id: uid(), name, color, type: 'standard' };
  state.decks.push(deck);
  state.cards[deck.id] = [];
  m.deckId = deck.id;
  m.creatingNewDeck = false;
  saveData(); render();
  showToast('Baralho criado.');
}
function confirmNotePassageCard(){
  const m = state.modal;
  if(!m || m.type !== 'note-passage-card') return;
  const front = (m.card.front||'').trim(), back = (m.card.back||'').trim();
  if(!front || !back){ showToast('Preencha pergunta e resposta.', 'error'); return; }
  if(!m.deckId || !state.cards[m.deckId]){ showToast('Escolha um baralho.', 'error'); return; }
  const card = makeCard(front, back);
  card.note = (m.card.note||'').trim();
  state.cards[m.deckId].push(card);
  const note = state.notesItems.find(n=>n.id===m.noteId);
  if(note) note.linkedDeckId = m.deckId;
  state.modal = null;
  saveData(); render();
  showToast('Cartão adicionado ao baralho.');
}
async function generateTextCorrection(text){
  const prompt = `Corrija o texto abaixo em português, mudando o MÍNIMO possível: só erros de ortografia, pontuação e gramática. Não reescreva o estilo, não troque palavras por sinônimos, não mude o sentido nem reformule frases que já estão corretas. Se já estiver tudo certo, devolva o texto exatamente igual.\n\nTexto:\n"${text}"\n\nResponda SOMENTE com o texto corrigido, sem aspas e sem nenhum comentário antes ou depois.`;
  const result = (await callGemini(prompt, { maxTokens: Math.max(200, Math.ceil(text.length*1.3)) })).trim();
  return result.replace(/^"|"$/g, '');
}
function requestNoteCorrection(){
  const sel = state.noteSelection;
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!sel || !sel.text || (sel.source !== 'textarea' && sel.source !== 'richtext') || !note) return;
  hideNoteSelectionBar();
  const modalBase = { type:'note-correction', status:'loading', original:sel.text, corrected:'', noteId: note.id, source: sel.source, start: sel.start, end: sel.end };
  rememberNoteScroll(note.id);
  const keepDesktopChat=isDesktopLayout() && state.modal?.type==='note-chat';
  if(keepDesktopChat) state.noteCorrection=modalBase; else state.modal=modalBase;
  render();
  restoreNoteScroll(note.id);
  generateTextCorrection(sel.text).then(corrected => {
    const correction=state.noteCorrection || state.modal;
    if(correction && correction.type === 'note-correction'){
      correction.status = 'review';
      correction.corrected = corrected;
      render();
      restoreNoteScroll(note.id);
    }
  }).catch(err => {
    console.error('Falha ao corrigir texto da nota', err);
    const correction=state.noteCorrection || state.modal;
    if(correction && correction.type === 'note-correction'){
      correction.status = 'error';
      correction.error = friendlyAiErrorMsg(err);
      render();
      restoreNoteScroll(note.id);
    }
  });
}
function confirmNoteCorrection(){
  const m = state.noteCorrection || state.modal;
  if(!m || m.type !== 'note-correction') return;
  const note = state.notesItems.find(n=>n.id===m.noteId);
  if(!note){ if(state.noteCorrection) state.noteCorrection=null; else state.modal=null; render(); return; }
  rememberNoteScroll(note.id);
  const before = getNoteContent(note.id);
  if(m.source === 'richtext'){
    const el = document.getElementById('note-editor-plain');
    // reconstrói o Range agora, do DOM atual — um Range guardado desde o
    // pedido de correção ficaria inválido, porque o render() ao abrir o
    // modal já recriou o contenteditable (e os nós que ele apontava).
    if(el && replaceRichTextRangePreservingFormatting(el, m.start, m.end, m.original, m.corrected)){
      note.updatedAt = Date.now();
      if(state.noteCorrection) state.noteCorrection=null; else state.modal = null;
      const updated = el.innerHTML;
      recordNoteHistory(note.id, before, updated);
      noteContentCache[note.id] = updated;
      saveData(); render(); restoreNoteScroll(note.id);
      saveNoteContentToR2(note.id, updated);
      showToast('Texto corrigido.');
      return;
    }
  }
  const current = getNoteContent(note.id);
  const updated = current.slice(0, m.start) + m.corrected + current.slice(m.end);
  recordNoteHistory(note.id, before, updated);
  noteContentCache[note.id] = updated;
  note.updatedAt = Date.now();
  if(state.noteCorrection) state.noteCorrection=null; else state.modal = null;
  saveData(); render(); restoreNoteScroll(note.id);
  saveNoteContentToR2(note.id, updated);
  showToast('Texto corrigido.');
}
/* --- opinião da IA sobre um trecho: útil pra quem está escrevendo (não só
   estudando) e quer uma reação sincera + sugestões, sem gerar nada pra
   substituir no texto — é só leitura. --- */
async function generateTextOpinion(text){
  const prompt = `Você está lendo um trecho de um texto que uma pessoa está escrevendo ou estudando. Dê uma opinião sincera e útil sobre esse trecho especificamente: o que achou dele (envolvente? confuso? bem escrito? redundante?), e se fizer sentido, 1 ou 2 sugestões concretas de melhoria. Seja direto e específico ao trecho, no máximo um parágrafo curto, sem elogios genéricos nem rodeios.\n\nTrecho:\n"${text}"`;
  return (await callGemini(prompt, { maxTokens: 500 })).trim();
}
function requestNoteOpinion(){
  const sel = state.noteSelection;
  if(!sel || !sel.text) return;
  hideNoteSelectionBar();
  // Opiniões agora usam o chat principal. O trecho selecionado fica pronto na
  // caixa de mensagem para a pessoa complementar exatamente o que quer avaliar.
  openNoteChat(`"${sel.text}"\n\n`);
}
function openNotePasteOpinionModal(){
  if(!state.currentNoteId) return;
  state.modal = { type:'note-paste-opinion', text:'' };
  render();
}
function confirmNotePasteOpinion(){
  const m = state.modal;
  const text = (m.text||'').trim();
  if(!text){ showToast('Cole o texto primeiro.', 'error'); return; }
  openNoteChat(`"${text}"\n\n`);
}
// depois da opinião inicial, o usuário pode continuar conversando — e se pedir uma
// reescrita concreta, a IA marca a versão revisada com essas tags num bloco à parte,
// que a gente detecta e separa da resposta "de chat" antes de mostrar na tela.
const NOTE_OPINION_EDIT_START = '===TEXTO_ATUALIZADO===';
const NOTE_OPINION_EDIT_END = '===FIM===';
function extractProposedEdit(raw){
  const startIdx = raw.indexOf(NOTE_OPINION_EDIT_START);
  const endIdx = raw.indexOf(NOTE_OPINION_EDIT_END, startIdx);
  if(startIdx === -1 || endIdx === -1) return { text: raw, proposedEdit: null };
  const proposedEdit = raw.slice(startIdx + NOTE_OPINION_EDIT_START.length, endIdx).trim();
  const text = raw.slice(0, startIdx).trim() || 'Veja a versão revisada abaixo:';
  return { text, proposedEdit: proposedEdit || null };
}
async function sendNoteOpinionChatMessage(){
  const m = state.modal;
  if(!m || m.type !== 'note-opinion' || m.status !== 'ready') return;
  const question = (m.input||'').trim();
  if(!question || m.sending) return;
  m.messages.push({ role:'user', text: question });
  const note = m.noteId ? state.notesItems.find(n=>n.id===m.noteId) : null;
  const conversation = note && getNoteConversations(note).find(c=>c.id===m.conversationId);
  if(conversation){ conversation.messages = m.messages; saveNoteConversation(note, conversation); }
  m.input = '';
  m.sending = true;
  render();
  scrollChatMessagesToBottom('.note-opinion-messages');

  const canEdit = m.source === 'textarea' || m.source === 'richtext';
  const canOfferCopy = !canEdit; // texto colado ou selecionado só na prévia: sem posição pra aplicar direto
  const history = m.messages.slice(0,-1).map(msg => `${msg.role==='user'?'Usuário':'Assistente'}: ${msg.text}`).join('\n');
  const editInstruction = (canEdit || canOfferCopy)
    ? `Se o usuário pedir pra você reescrever, corrigir ou melhorar o trecho de algum jeito concreto, responda naturalmente E inclua, ao final da resposta, o texto completo revisado do trecho (substituindo ele inteiro, não só a parte que mudou) entre as marcas exatas abaixo, sem nada mais na mesma linha delas:\n${NOTE_OPINION_EDIT_START}\n(texto revisado aqui)\n${NOTE_OPINION_EDIT_END}\nSó inclua esse bloco quando fizer sentido propor uma reescrita concreta do trecho — não inclua se for só conversa, pergunta geral ou elogio.`
    : '';
  const prompt = `Você é um assistente ajudando alguém a escrever. Vocês estão conversando sobre o trecho abaixo, sobre o qual você já deu uma opinião inicial.\n\n--- TRECHO ---\n${m.passage}\n--- FIM DO TRECHO ---\n\nSua opinião inicial sobre ele: ${m.opinion}\n\n${history ? `Conversa até agora:\n${history}\n\n` : ''}Usuário: ${question}\n\n${editInstruction}\n\nResponda de forma direta e natural, como numa conversa de chat. Não repita a pergunta antes de responder.`;

  try{
    const raw = (await callGemini(prompt, { maxTokens: 700 })).trim();
    const { text, proposedEdit } = extractProposedEdit(raw);
    m.messages.push({ role:'assistant', text, proposedEdit });
  }catch(err){
    console.error('Falha no chat sobre a opinião da IA', err);
    m.messages.push({ role:'assistant', text: friendlyAiErrorMsg(err), error:true });
  }
  if(conversation){ conversation.messages = m.messages; saveNoteConversation(note, conversation); }
  m.sending = false;
  render();
  scrollChatMessagesToBottom('.note-opinion-messages');
}
function applyNoteOpinionEdit(msgIndex){
  const m = state.modal;
  if(!m || m.type !== 'note-opinion') return;
  const msg = m.messages[msgIndex];
  if(!msg || !msg.proposedEdit) return;
  const note = m.noteId ? state.notesItems.find(n=>n.id===m.noteId) : null;
  if(!note || (m.source !== 'textarea' && m.source !== 'richtext') || m.start == null || m.end == null) return;
  const before = getNoteContent(note.id);
  if(m.source === 'richtext'){
    const el = document.getElementById('note-editor-plain');
    // reconstrói o Range agora, do DOM atual — guardado desde a seleção original
    // ele ficaria inválido, porque render() já recriou o contenteditable várias vezes.
    if(el && replaceRichTextRange(el, m.start, m.end, msg.proposedEdit)){
      note.updatedAt = Date.now();
      state.modal = null;
      const updated = el.innerHTML;
      recordNoteHistory(note.id, before, updated);
      noteContentCache[note.id] = updated;
      saveData(); render();
      saveNoteContentToR2(note.id, updated);
      showToast('Texto atualizado na nota.');
      return;
    }
    return;
  }
  const current = getNoteContent(note.id);
  const updated = current.slice(0, m.start) + msg.proposedEdit + current.slice(m.end);
  recordNoteHistory(note.id, before, updated);
  noteContentCache[note.id] = updated;
  note.updatedAt = Date.now();
  state.modal = null;
  saveData(); render();
  saveNoteContentToR2(note.id, updated);
  showToast('Texto atualizado na nota.');
}
async function copyNoteOpinionEdit(msgIndex){
  const m = state.modal;
  if(!m || m.type !== 'note-opinion') return;
  const msg = m.messages[msgIndex];
  if(!msg || !msg.proposedEdit) return;
  try{
    await navigator.clipboard.writeText(msg.proposedEdit);
    showToast('Texto revisado copiado! Cole na nota onde precisar.');
  }catch(e){
    showToast('Não consegui copiar automaticamente. Selecione o texto manualmente.', 'error');
  }
}
// diff simples por palavra (LCS) — só pra destacar visualmente o que mudou
// entre o texto original e o corrigido, sem precisar de biblioteca externa.
function diffTextParts(oldText, newText){
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const m = oldWords.length, n = newWords.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for(let i=m-1; i>=0; i--){
    for(let j=n-1; j>=0; j--){
      dp[i][j] = oldWords[i]===newWords[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  let i=0, j=0; const oldParts=[], newParts=[];
  while(i<m && j<n){
    if(oldWords[i]===newWords[j]){ oldParts.push({t:oldWords[i],c:false}); newParts.push({t:newWords[j],c:false}); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ oldParts.push({t:oldWords[i],c:true}); i++; }
    else { newParts.push({t:newWords[j],c:true}); j++; }
  }
  while(i<m){ oldParts.push({t:oldWords[i],c:true}); i++; }
  while(j<n){ newParts.push({t:newWords[j],c:true}); j++; }
  return { oldParts, newParts };
}
/* --- chat com a IA sobre a nota aberta: manda o conteúdo da nota como
   contexto em todo turno (a API do Gemini usada aqui não mantém sessão),
   junto do histórico da conversa formatado como texto. --- */
function ensureNoteChatFor(noteId){
  const note=state.notesItems.find(n=>n.id===noteId && n.type==='note');
  if(!note) return;
  if(state.modal?.type==='note-chat' && state.modal.noteId===noteId) return;
  const conversation=getNoteConversations(note).find(c=>c.type==='chat') || createNoteConversation(note,'chat',{});
  state.modal={ type:'note-chat', noteId, conversationId:conversation.id, messages:conversation.messages||[], input:'', sending:false, conversationSearch:'', conversationLibraryOpen:false };
}
function openNoteChat(initialInput){
  const noteId = state.currentNoteId;
  const note = state.notesItems.find(n=>n.id===noteId);
  if(!note) return;
  const conversation = createNoteConversation(note, 'chat', {});
  if(isDesktopLayout()) state.notesChatHidden=false;
  state.modal = { type:'note-chat', noteId, conversationId:conversation.id, messages:conversation.messages, input:initialInput || '', sending:false, conversationSearch:'', conversationLibraryOpen:false };
  render();
}
function openSavedNoteConversation(noteId, conversationId){
  const note = state.notesItems.find(n=>n.id===noteId);
  const conversation = note && getNoteConversations(note).find(c=>c.id===conversationId);
  if(!note || !conversation) return;
  state.noteConversationManager = null;
  if(conversation.type === 'chat'){
    state.modal = { type:'note-chat', noteId, conversationId:conversation.id, messages:conversation.messages||[], input:'', sending:false, conversationSearch:'', conversationLibraryOpen:false };
  }else openNoteChat(`"${conversation.passage||conversation.opinion||''}"\n\n`);
  render();
}
function openNoteSuggestionLibrary(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  const conversation = note && getNoteConversations(note).filter(c=>c.type==='suggestion').sort((a,b)=>(b.favorite-a.favorite)||(b.updatedAt-a.updatedAt))[0];
  if(!conversation){ showToast('Esta nota ainda não tem conversas de sugestão.', 'error'); return; }
  openSavedNoteConversation(note.id, conversation.id);
}
function toggleActiveNoteConversationFavorite(){
  const m = state.modal;
  const note = m && state.notesItems.find(n=>n.id===m.noteId);
  const conversation = note && getNoteConversations(note).find(c=>c.id===m.conversationId);
  if(!conversation) return;
  conversation.favorite = !conversation.favorite;
  saveNoteConversation(note, conversation);
  render();
}
function deleteActiveNoteConversation(){
  const m = state.modal;
  const note = m && state.notesItems.find(n=>n.id===m.noteId);
  if(!note || !m.conversationId) return;
  const conversations = getNoteConversations(note);
  const index = conversations.findIndex(c=>c.id===m.conversationId);
  if(index < 0) return;
  conversations.splice(index, 1);
  saveData();
  const next = conversations.find(c=>c.type==='chat');
  if(next) state.modal = { type:'note-chat', noteId:note.id, conversationId:next.id, messages:next.messages||[], input:'', sending:false, conversationSearch:'', conversationLibraryOpen:true };
  else openNoteChat();
  render();
  showToast('Conversa excluída.');
}
function convertActiveNoteConversationToNote(){
  const m = state.modal;
  if(m) convertNoteConversationToNote(m.noteId,m.conversationId);
}
function convertNoteConversationToNote(noteId, conversationId){
  const source = state.notesItems.find(n=>n.id===noteId);
  const conversation = source && getNoteConversations(source).find(c=>c.id===conversationId);
  if(!source || !conversation) return;
  const copy = makeNoteItem('note', `Conversa — ${getConversationTitle(conversation).slice(0,36)}`, source.parentId);
  const lines = [getConversationTitle(conversation), ''];
  if(conversation.passage) lines.push(conversation.passage, '');
  if(conversation.opinion) lines.push('Sugestão inicial', conversation.opinion, '');
  (conversation.messages||[]).forEach(msg => lines.push(msg.role==='user' ? 'Você' : 'IA', msg.text, ''));
  noteContentCache[copy.id] = escapeHtml(lines.join('\n')).replace(/\n/g, '<br>');
  state.notesItems.push(copy);
  saveData();
  saveNoteContentToR2(copy.id, noteContentCache[copy.id]);
  state.noteConversationManager=null;
  render();
  showToast('Conversa transformada em nota.');
}
// render() recria a tela inteira do zero, então sem isso a lista de mensagens
// sempre reaparecia rolada pro topo depois de cada resposta da IA.
function scrollChatMessagesToBottom(selector){
  const el = document.querySelector(selector);
  if(el) el.scrollTop = el.scrollHeight;
}
function openNoteConversationManager(type){
  const m=state.modal;
  if(!m || !m.noteId) return;
  state.noteConversationManager={noteId:m.noteId,type:type||'chat',search:''};
  render();
}
function closeNoteConversationManager(){ state.noteConversationManager=null; render(); }
function toggleNoteConversationFavorite(noteId,conversationId){
  const note=state.notesItems.find(n=>n.id===noteId);
  const conversation=note && getNoteConversations(note).find(c=>c.id===conversationId);
  if(!conversation) return;
  conversation.favorite=!conversation.favorite; saveNoteConversation(note,conversation); render();
}
function deleteNoteConversationFromManager(noteId,conversationId){
  const note=state.notesItems.find(n=>n.id===noteId);
  const list=note && getNoteConversations(note);
  if(!note || !list) return;
  const index=list.findIndex(c=>c.id===conversationId);
  if(index<0) return;
  list.splice(index,1); saveData();
  if(state.modal?.type==='note-chat' && state.modal.conversationId===conversationId){
    const next=list.find(c=>c.type==='chat');
    if(next) state.modal={type:'note-chat',noteId,conversationId:next.id,messages:next.messages||[],input:'',sending:false,conversationSearch:'',conversationLibraryOpen:false};
    else { state.noteConversationManager=null; openNoteChat(); return; }
  }
  render(); showToast('Conversa excluída.');
}
function renderNoteConversationLibrary(m, type){
  const note = state.notesItems.find(n=>n.id===m.noteId);
  if(!note) return '';
  const allCount = getNoteConversations(note).filter(c=>c.type===type).length;
  return `<button class="ghost-btn" style="width:100%; justify-content:space-between; padding:7px 9px; font-size:11.5px; margin:0 0 8px;" onclick="openNoteConversationManager('${type}')"><span>☰ Conversas</span><span style="color:var(--text-faint);">${allCount} ›</span></button>`;
}
function renderNoteConversationManager(manager){
  const note=state.notesItems.find(n=>n.id===manager.noteId);
  if(!note) return '';
  const query=(manager.search||'').toLowerCase().trim();
  const conversations=getNoteConversations(note).filter(c=>c.type===manager.type && (!query || `${getConversationTitle(c)} ${(c.messages||[]).map(msg=>msg.text).join(' ')}`.toLowerCase().includes(query))).sort((a,b)=>(Number(!!b.favorite)-Number(!!a.favorite)) || (b.updatedAt-a.updatedAt));
  return `<div class="modal-overlay" onclick="if(event.target===this) closeNoteConversationManager()"><div class="modal" style="width:min(560px,calc(100vw - 32px)); max-height:78vh;"><div style="display:flex; justify-content:space-between; align-items:center; gap:8px;"><h3>☰ Conversas</h3><button class="icon-btn" title="Fechar" onclick="closeNoteConversationManager()">✕</button></div><p style="margin:0; font-size:12px; color:var(--text-faint);">${escapeHtml(note.name)} · gerencie, favorite, transforme em nota ou exclua uma conversa.</p><input id="conversation-manager-search" type="text" autofocus placeholder="Buscar conversas..." value="${escapeHtml(manager.search||'')}" oninput="state.noteConversationManager.search=this.value; render();"><div style="display:flex; flex-direction:column; gap:7px; overflow-y:auto; max-height:48vh;">${conversations.length ? conversations.map(c=>`<div style="display:flex; align-items:center; gap:6px; padding:7px; border:1px solid ${state.modal?.conversationId===c.id?'var(--accent)':'var(--border)'}; border-radius:9px;"><button class="ghost-btn" style="flex:1; min-width:0; justify-content:flex-start; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:6px 7px; font-size:12px;" onclick="openSavedNoteConversation('${note.id}','${c.id}')">${c.favorite?'★ ':''}${escapeHtml(getConversationTitle(c))}</button><button class="icon-btn" title="${c.favorite?'Remover dos favoritos':'Favoritar'}" onclick="toggleNoteConversationFavorite('${note.id}','${c.id}')">${c.favorite?'★':'☆'}</button><button class="icon-btn" title="Transformar em nota" onclick="convertNoteConversationToNote('${note.id}','${c.id}')">📄</button><button class="icon-btn" title="Excluir conversa" onclick="deleteNoteConversationFromManager('${note.id}','${c.id}')">🗑</button></div>`).join('') : `<p style="color:var(--text-faint); font-size:13px; text-align:center;">Nenhuma conversa encontrada.</p>`}</div></div></div>`;
}
function parseNoteAgentReply(rawReply){
  const raw = String(rawReply||'').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  // Além da resposta JSON pura, aceita um objeto JSON envolvido por texto.
  // Isso protege o executor de pequenas quebras do modelo sem transformar
  // texto normal em uma ação por engano.
  const candidates = [candidate];
  const start = candidate.indexOf('{');
  if(start >= 0){
    let depth = 0, quoted = false, escaped = false;
    for(let i=start; i<candidate.length; i++){
      const ch = candidate[i];
      if(quoted){
        if(escaped) escaped = false;
        else if(ch === '\\') escaped = true;
        else if(ch === '"') quoted = false;
      }else if(ch === '"') quoted = true;
      else if(ch === '{') depth++;
      else if(ch === '}' && --depth === 0){ candidates.push(candidate.slice(start, i+1)); break; }
    }
  }
  for(const json of candidates){
    try{
      const data = JSON.parse(json);
      if(data && typeof data === 'object' && !Array.isArray(data)){
        const actions = Array.isArray(data.actions) ? data.actions : ((data.actions && typeof data.actions === 'object') ? [data.actions] : (data.action && typeof data.action === 'object' ? [data.action] : []));
        return { reply: String(data.reply || data.message || '').trim(), actions };
      }
    }catch(e){}
  }
  return { reply: raw, actions: [] };
}
function normalizeNoteAgentAction(rawAction){
  if(!rawAction || typeof rawAction !== 'object') return null;
  const action = { ...rawAction };
  const type = String(action.type || action.action || action.command || '').trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase();
  const aliases = {
    criar_pasta:'create_folder', createfolder:'create_folder', folder:'create_folder',
    criar_nota:'create_note', createnote:'create_note', note:'create_note',
    editar_nota:'edit_note', editnote:'edit_note',
    criar_flashcards:'create_flashcards', criar_cartoes:'create_flashcards', create_cards:'create_flashcards', createflashcards:'create_flashcards',
    criar_baralho:'create_deck', createdeck:'create_deck', deck:'create_deck',
    editar_baralho:'update_deck', updatedeck:'update_deck',
    criar_livro:'create_book', createbook:'create_book', book:'create_book',
    editar_livro:'update_book', updatebook:'update_book',
    navegar:'navigate', open_view:'navigate',
    buscar_imagem:'search_image', searchimage:'search_image',
    criar_evento:'create_agenda_event', criar_evento_agenda:'create_agenda_event', createevent:'create_agenda_event',
    editar_evento:'update_agenda_event', atualizar_evento:'update_agenda_event', updateevent:'update_agenda_event',
    excluir_evento:'delete_agenda_event', deletar_evento:'delete_agenda_event', deleteevent:'delete_agenda_event',
    concluir_evento:'complete_agenda_event', completeevent:'complete_agenda_event',
    reagendar_eventos:'reschedule_agenda_events', redistribuir_tarefas:'reschedule_agenda_events',
    iniciar_rotina:'start_routine', iniciar_atividade:'start_routine', startroutine:'start_routine',
    pausar_rotina:'pause_routine', pausar_atividade:'pause_routine', pauseroutine:'pause_routine',
    concluir_rotina:'stop_routine', parar_rotina:'stop_routine', stoproutine:'stop_routine'
  };
  action.type = aliases[type] || type;
  action.name = action.name || action.nome;
  action.title = action.title || action.titulo;
  action.content = action.content ?? action.conteudo;
  action.parentRef = action.parentRef || action.parent || action.folder || action.pasta;
  action.deckName = action.deckName || action.deck || action.baralho;
  action.eventRef = action.eventRef || action.eventId || action.event || action.eventTitle || action.evento;
  action.routineRef = action.routineRef || action.routineId || action.routine || action.rotina || action.atividade;
  return action;
}
function findAgendaEventForAgent(action){
  const ref=String(action.eventRef||action.eventId||'').trim().toLowerCase();
  if(!ref) return null;
  return state.agendaEvents.find(event=>event.id===ref || String(event.title||'').trim().toLowerCase()===ref) || null;
}
function getAiWorkspaceContext(){
  const agenda=state.agendaEvents.slice(0,120).map(event=>`[id:${event.id}] ${event.title}${event.completedAt?' (concluído)':''}${event.date?` | ${event.date}${event.time?` ${event.time}${event.endTime?`–${event.endTime}`:''}`:''}`:' | sem data'}`).join('\n') || '(sem eventos)';
  const activities=state.activities.slice(0,80).map(activity=>`${new Date(activity.at).toLocaleString('pt-BR')} | ${activity.type} | ${activity.title||''} | ${formatActivityDuration(activity.durationMs||0)}`).join('\n') || '(sem histórico recente)';
  const companionUsage=(state.companionReports||[]).slice(0,14).map(report=>{
    const sessions=(report.sessions||[]).slice(-40).map(session=>`${new Date(Number(session.startedAt)).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}–${new Date(Number(session.endedAt)).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} ${getCompanionAppName(session)}`).join('; ');
    const totals=(report.apps||[]).slice(0,12).map(app=>`${getCompanionAppName(app)} ${Math.round((Number(app.foregroundMs)||0)/60000)} min`).join(', ');
    return `${report.date}: sessões: ${sessions||'(nenhuma)'} | totais: ${totals||'(nenhum)'}`;
  }).join('\n') || '(nenhum relatório do Companion)';
  const actions=getRoutineActions().map(item=>`[id:${item.id}] ${item.icon} ${item.title}`).join(', ');
  const active=state.routineActive ? `${state.routineActive.icon} ${state.routineActive.title}, iniciada às ${routineTimeLabel(state.routineActive.startedAt)}` : 'nenhuma';
  return {agenda,activities,companionUsage,routineActions:actions||'(nenhuma)',routineActive:active};
}
function applyAgentAgendaUpdate(event, action){
  const before={...event};
  if(action.newTitle||action.new_title) event.title=String(action.newTitle||action.new_title).trim().slice(0,140)||event.title;
  if(action.date!==undefined) event.date=String(action.date||'').match(/^\d{4}-\d{2}-\d{2}$/)?String(action.date):null;
  if(action.time!==undefined) event.time=String(action.time||'').match(/^\d{2}:\d{2}$/)?String(action.time):null;
  if(action.endTime!==undefined||action.end_time!==undefined) event.endTime=String(action.endTime||action.end_time||'').match(/^\d{2}:\d{2}$/)?String(action.endTime||action.end_time):null;
  if(event.time&&!event.endTime) event.endTime=addAgendaHour(event.time);
  if(event.time&&event.endTime&&event.endTime<=event.time){ Object.assign(event,before); return false; }
  if(action.notes!==undefined||action.note!==undefined) event.notes=String(action.notes||action.note||'').slice(0,500);
  event.updatedAt=Date.now();
  return true;
}
function noteAgentRequestNeedsAction(question){
  return /\b(crie|criar|adicione|adicionar|faça|faca|gere|gerar|edite|editar|reescreva|reescrever|resuma|resumir|mova|mover|organize|organizar|inclua|incluir)\b/i.test(String(question||''));
}
function resolveNoteAgentParent(parentRef, currentNote, aliases){
  if(!parentRef || parentRef === 'current_parent') return currentNote ? currentNote.parentId : null;
  const key = String(parentRef).replace(/^folder:/, '');
  if(aliases[key]) return aliases[key];
  const folder = state.notesItems.find(item => item.type==='folder' && item.id===parentRef);
  return folder ? folder.id : null;
}
function ensureAgentDeck(action, currentNote){
  let deck = null;
  if(action.deckRef === 'linked' && currentNote && currentNote.linkedDeckId) deck = state.decks.find(d=>d.id===currentNote.linkedDeckId);
  if(!deck && action.deckName){
    const wanted = String(action.deckName).trim().toLowerCase();
    deck = state.decks.find(d=>String(d.name||'').trim().toLowerCase()===wanted);
  }
  if(!deck){
    const name = String(action.deckName||'Flashcards da nota').trim().slice(0,100) || 'Flashcards da nota';
    deck = { id:uid(), name, color:DECK_COLORS[state.decks.length % DECK_COLORS.length], type:'standard', aiEnabled:true, sentenceDifficulty:'intermediate' };
    state.decks.push(deck);
    state.cards[deck.id] = [];
  }
  if(currentNote && !currentNote.linkedDeckId) currentNote.linkedDeckId = deck.id;
  return deck;
}
async function searchCommonsImage(query){
  const term = String(query||'').trim().slice(0,180);
  if(!term) throw new Error('image_search_empty');
  // A Commons expõe imagens públicas e permite consultas CORS. Pedimos uma
  // miniatura para a nota não depender do download do arquivo original enorme.
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(term)}&prop=imageinfo&iiprop=url%7Cmime%7Cthumbmime&iiurlwidth=1200&origin=*`;
  const response = await fetch(url);
  if(!response.ok) throw new Error('image_search_failed');
  const data = await response.json();
  const pages = Object.values((data.query && data.query.pages) || {});
  const result = pages.map(page => {
    const info = page.imageinfo && page.imageinfo[0];
    return info && {
      url: info.thumburl || info.url,
      mime: info.thumbmime || info.mime || '',
      pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title||'')}`,
      title: String(page.title||'').replace(/^File:/i, '')
    };
  }).find(image => image && image.url && /^image\/(jpeg|png|webp|gif|svg\+xml)$/i.test(image.mime));
  if(!result) throw new Error('image_not_found');
  return result;
}
function insertAgentImageInNote(note, image, alt){
  if(!note || !image || !image.url) return false;
  const label = String(alt || image.title || 'Imagem').trim().slice(0,180) || 'Imagem';
  const before = getNoteContent(note.id);
  let addition;
  if(note.format === 'plain'){
    addition = `<figure><img data-note-image-id="${uid()}" src="${escapeHtml(image.url)}" alt="${escapeHtml(label)}"><figcaption>Fonte: <a href="${escapeHtml(image.pageUrl)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption></figure>`;
  }else{
    const markdownAlt = label.replace(/[\[\]]/g, '');
    addition = `![${markdownAlt}](${image.url})\n\n*Fonte: [Wikimedia Commons](${image.pageUrl})*`;
  }
  saveNoteContentUpdate(note, before + (before ? '\n\n' : '') + addition);
  return true;
}
function revealAgentCreatedItem(itemId){
  let item = state.notesItems.find(n=>n.id===itemId);
  const collapsed = state.notesCollapsedFolders || (state.notesCollapsedFolders=[]);
  while(item){
    const hiddenIndex = collapsed.indexOf(item.id);
    if(hiddenIndex >= 0) collapsed.splice(hiddenIndex, 1);
    item = item.parentId ? state.notesItems.find(n=>n.id===item.parentId) : null;
  }
}
async function executeNoteAgentActions(actions, currentNote){
  const results = [];
  let completedActions = 0;
  const aliases = {};
  const createdItemIds = [];
  for(const rawAction of (actions||[])){
    const action = normalizeNoteAgentAction(rawAction);
    if(!action) continue;
    if(action.type === 'create_folder'){
      const name = String(action.name||'').trim().slice(0,120);
      if(!name) continue;
      const folder = makeNoteItem('folder', name, resolveNoteAgentParent(action.parentRef, currentNote, aliases));
      state.notesItems.push(folder);
      if(action.alias) aliases[String(action.alias)] = folder.id;
      createdItemIds.push(folder.id);
      results.push(`Pasta criada: ${folder.name}`);
      completedActions++;
    }else if(action.type === 'create_note'){
      const name = String(action.title||action.name||'').trim().slice(0,120) || 'Nova nota';
      const newNote = makeNoteItem('note', name, resolveNoteAgentParent(action.parentRef, currentNote, aliases));
      noteContentCache[newNote.id] = String(action.content||'');
      state.notesItems.push(newNote);
      createdItemIds.push(newNote.id);
      await saveNoteContentToR2(newNote.id, noteContentCache[newNote.id]);
      results.push(`Nota criada: ${newNote.name}`);
      completedActions++;
    }else if(action.type === 'edit_note'){
      // Por design, o agente pode editar toda a nota aberta sem pedir uma
      // confirmação extra; a alteração entra no histórico de desfazer/refazer.
      const target = action.noteRef === 'current' || !action.noteRef ? currentNote : state.notesItems.find(n=>n.id===action.noteRef && n.type==='note');
      if(!target) continue;
      const before = getNoteContent(target.id);
      let updated = before;
      const mode = action.mode || 'replace';
      if(mode === 'append') updated = before + (before && action.content ? '\n\n' : '') + String(action.content||'');
      else if(mode === 'prepend') updated = String(action.content||'') + (before && action.content ? '\n\n' : '') + before;
      else if(mode === 'replace_text' || mode === 'replace_all'){
        const find = String(action.find||'');
        if(!find || !before.includes(find)){ results.push(`Não encontrei o trecho para alterar em ${target.name}.`); continue; }
        const replacement = String(action.replace||action.content||'');
        updated = mode === 'replace_all' ? before.split(find).join(replacement) : before.replace(find, replacement);
      }else updated = String(action.content||'');
      if(updated === before){ results.push(`A nota ${target.name} já estava assim.`); continue; }
      saveNoteContentUpdate(target, updated);
      results.push(`Nota editada: ${target.name}`);
      completedActions++;
    }else if(action.type === 'create_flashcards'){
      const cards = Array.isArray(action.cards) ? action.cards : [];
      const validCards = cards.filter(card => card && String(card.front||'').trim() && String(card.back||'').trim());
      if(!validCards.length) continue;
      const deck = ensureAgentDeck(action, currentNote);
      validCards.forEach(data => {
        const card = makeCard(String(data.front), String(data.back));
        card.note = String(data.note||'').trim();
        state.cards[deck.id].push(card);
      });
      results.push(`${validCards.length} flashcard${validCards.length===1?'':'s'} criado${validCards.length===1?'':'s'} em ${deck.name}`);
      completedActions++;
    }else if(action.type === 'create_deck'){
      const name = String(action.name || action.title || '').trim().slice(0,100);
      if(!name) continue;
      const deck = { id:uid(), name, color:action.color || DECK_COLORS[state.decks.length % DECK_COLORS.length], type:action.deckType === 'language' ? 'language' : 'standard', aiEnabled:true, sentenceDifficulty:'intermediate' };
      state.decks.push(deck);
      state.cards[deck.id] = [];
      results.push(`Baralho criado: ${deck.name}`);
      completedActions++;
    }else if(action.type === 'update_deck'){
      const wanted = String(action.deckRef || action.deckName || action.name || '').trim().toLowerCase();
      const deck = state.decks.find(d=>d.id===action.deckRef || String(d.name||'').trim().toLowerCase()===wanted);
      if(!deck){ results.push('Não encontrei o baralho para alterar.'); continue; }
      if(action.newName || action.new_name) deck.name = String(action.newName || action.new_name).trim().slice(0,100) || deck.name;
      if(action.color) deck.color = String(action.color);
      if(typeof action.aiEnabled === 'boolean') deck.aiEnabled = action.aiEnabled;
      results.push(`Baralho atualizado: ${deck.name}`);
      completedActions++;
    }else if(action.type === 'create_book'){
      const title = String(action.title || action.name || '').trim().slice(0,180);
      if(!title) continue;
      const book = makeBook(title, String(action.author || action.autor || '').trim());
      if(Array.isArray(action.categories || action.categorias)) book.categories = (action.categories || action.categorias).map(String).filter(Boolean).slice(0,12);
      if(action.status) book.status = String(action.status);
      state.books.push(book);
      results.push(`Livro adicionado: ${book.title}`);
      completedActions++;
    }else if(action.type === 'update_book'){
      const wanted = String(action.bookRef || action.bookTitle || action.title || action.name || '').trim().toLowerCase();
      const book = state.books.find(b=>b.id===action.bookRef || String(b.title||'').trim().toLowerCase()===wanted);
      if(!book){ results.push('Não encontrei o livro para alterar.'); continue; }
      if(action.newTitle || action.new_title) book.title = String(action.newTitle || action.new_title).trim().slice(0,180) || book.title;
      if(action.author || action.autor) book.author = String(action.author || action.autor).trim();
      if(action.status) book.status = String(action.status);
      if(action.rating != null) book.rating = Math.max(0, Math.min(5, Number(action.rating)||0));
      if(action.pagesRead != null) book.pagesRead = Math.max(0, Number(action.pagesRead)||0);
      if(action.totalPages != null) book.totalPages = Math.max(0, Number(action.totalPages)||0);
      results.push(`Livro atualizado: ${book.title}`);
      completedActions++;
    }else if(action.type === 'create_agenda_event'){
      const title=String(action.title||action.name||'').trim().slice(0,140);
      if(!title) continue;
      const time=String(action.time||'').match(/^\d{2}:\d{2}$/) ? String(action.time) : null;
      const endTime=time && String(action.endTime||action.end_time||'').match(/^\d{2}:\d{2}$/) ? String(action.endTime||action.end_time) : (time?addAgendaHour(time):null);
      if(time&&endTime&&endTime<=time){ results.push(`Não criei “${title}”: o término precisa ser depois do início.`); continue; }
      const event={id:uid(),title,date:String(action.date||'').match(/^\d{4}-\d{2}-\d{2}$/)?String(action.date):null,time,endTime,notes:String(action.notes||action.note||'').slice(0,500),createdAt:Date.now(),updatedAt:Date.now()};
      state.agendaEvents.unshift(event);
      results.push(`Evento criado: ${event.title}${event.date?` em ${event.date}`:''}${event.time?` às ${event.time}`:''}`);
      completedActions++;
    }else if(action.type === 'update_agenda_event'){
      const event=findAgendaEventForAgent(action);
      if(!event){ results.push('Não encontrei o evento da Agenda para alterar.'); continue; }
      const before={...event};
      if(action.newTitle||action.new_title) event.title=String(action.newTitle||action.new_title).trim().slice(0,140)||event.title;
      if(action.date!==undefined) event.date=String(action.date||'').match(/^\d{4}-\d{2}-\d{2}$/)?String(action.date):null;
      if(action.time!==undefined) event.time=String(action.time||'').match(/^\d{2}:\d{2}$/)?String(action.time):null;
      if(action.endTime!==undefined||action.end_time!==undefined) event.endTime=String(action.endTime||action.end_time||'').match(/^\d{2}:\d{2}$/)?String(action.endTime||action.end_time):null;
      if(event.time&&!event.endTime) event.endTime=addAgendaHour(event.time);
      if(event.time&&event.endTime&&event.endTime<=event.time){ Object.assign(event,before); results.push(`Não alterei “${event.title}”: o término precisa ser depois do início.`); continue; }
      if(action.notes!==undefined||action.note!==undefined) event.notes=String(action.notes||action.note||'').slice(0,500);
      event.updatedAt=Date.now();
      results.push(`Evento atualizado: ${event.title}`);
      completedActions++;
    }else if(action.type === 'delete_agenda_event'){
      const event=findAgendaEventForAgent(action);
      if(!event){ results.push('Não encontrei o evento da Agenda para excluir.'); continue; }
      state.agendaEvents=state.agendaEvents.filter(item=>item.id!==event.id);
      results.push(`Evento excluído: ${event.title}`);
      completedActions++;
    }else if(action.type === 'complete_agenda_event'){
      const event=findAgendaEventForAgent(action);
      if(!event){ results.push('Não encontrei o evento da Agenda para concluir.'); continue; }
      event.completedAt=Date.now(); event.updatedAt=Date.now();
      results.push(`Evento concluído: ${event.title}`);
      completedActions++;
    }else if(action.type === 'reschedule_agenda_events'){
      const changes=Array.isArray(action.events||action.items||action.changes)?(action.events||action.items||action.changes):[];
      let changed=0;
      changes.slice(0,30).forEach(change=>{ const event=findAgendaEventForAgent(change); if(event&&applyAgentAgendaUpdate(event,change)) changed++; });
      if(!changed){ results.push('Não encontrei eventos válidos para redistribuir.'); continue; }
      results.push(`${changed} evento(s) redistribuído(s) na Agenda.`);
      completedActions++;
    }else if(action.type === 'start_routine'){
      const wanted=String(action.routineRef||action.routineId||action.name||action.title||'').trim().toLowerCase();
      const routine=getRoutineActions().find(item=>item.id===wanted||item.title.toLowerCase()===wanted);
      if(!routine){ results.push('Não encontrei essa atividade de rotina.'); continue; }
      startRoutineActivity(routine.id);
      results.push(`Rotina iniciada: ${routine.title}`);
      completedActions++;
    }else if(action.type === 'pause_routine'){
      if(!pauseRoutineActivity(false)){ results.push('Não há uma rotina em andamento para pausar.'); continue; }
      results.push('Rotina pausada e registrada até este momento.');
      completedActions++;
    }else if(action.type === 'stop_routine'){
      if(!state.routineActive){ results.push('Não há uma rotina em andamento para concluir.'); continue; }
      const title=state.routineActive.title; stopRoutineActivity(false);
      results.push(`Rotina concluída: ${title}`);
      completedActions++;
    }else if(action.type === 'navigate'){
      const view = String(action.view || action.destination || '').toLowerCase();
      const views = { notas:'notes', notes:'notes', agenda:'agenda', leituras:'library', livros:'library', library:'library', inicio:'home', home:'home' };
      if(!views[view]){ results.push('Não reconheci a tela solicitada.'); continue; }
      state.view = views[view];
      results.push(`Aberta a tela: ${view}`);
      completedActions++;
    }else if(action.type === 'search_image'){
      const target = action.noteRef === 'current' || !action.noteRef ? currentNote : state.notesItems.find(n=>n.id===action.noteRef && n.type==='note');
      if(!target) continue;
      try{
        const image = await searchCommonsImage(action.query);
        if(insertAgentImageInNote(target, image, action.alt || action.query)){ results.push(`Imagem encontrada e inserida em ${target.name}: ${image.title}`); completedActions++; }
      }catch(error){
        console.error('Falha ao buscar imagem para o agente', error);
        results.push(`Não encontrei uma imagem pública adequada para “${String(action.query||'').slice(0,80)}”.`);
      }
    }
  }
  if(createdItemIds.length){
    createdItemIds.forEach(revealAgentCreatedItem);
    // Se havia um filtro ativo, a nova nota poderia existir mas ficar invisível
    // na árvore. A criação pelo agente sempre revela o resultado ao usuário.
    if(state.notesSearch && state.notesSearch.query){
      state.notesSearch.query = '';
      state.notesSearch.contentResults = null;
    }
  }
  if(results.length) await saveData();
  results.completedActions = completedActions;
  return results;
}
function openGlobalAiChat(){ state.modal={type:'global-ai-chat',messages:state.globalAiMessages||[],input:'',sending:false}; render(); }
async function sendGlobalAiMessage(){
  const m=state.modal; const question=String(m&&m.input||'').trim();
  if(!m || m.type!=='global-ai-chat' || !question || m.sending) return;
  m.messages.push({role:'user',text:question}); m.input=''; m.sending=true; state.globalAiMessages=m.messages; render();
  const notes=state.notesItems.filter(item=>item.type==='note').map(item=>item.name).join(', ')||'nenhuma';
  const decks=state.decks.map(deck=>deck.name).join(', ')||'nenhum';
  const books=state.books.map(book=>book.title).join(', ')||'nenhum';
  const workspaceContext=getAiWorkspaceContext();
  const agenda=workspaceContext.agenda;
  const history=m.messages.slice(0,-1).map(msg=>`${msg.role==='user'?'Usuário':'IA'}: ${msg.text}`).join('\n');
  const prompt=`Você é o assistente global do aplicativo Letther B. Você conhece as notas (${notes}), baralhos (${decks}), livros (${books}), agenda, rotina e histórico. Pode orientar e executar ações reais. AGENDA:\n${agenda}\n\nROTINA EM ANDAMENTO: ${workspaceContext.routineActive}\nATALHOS DE ROTINA: ${workspaceContext.routineActions}\nHISTÓRICO RECENTE:\n${workspaceContext.activities}\n\nUSO DO APARELHO (relatórios consentidos do Companion):\n${workspaceContext.companionUsage}\n\nResponda exclusivamente em JSON: {"reply":"texto curto","actions":[...]}. Ações: create_folder, create_note, create_flashcards, create_deck, update_deck, create_book, update_book, create_agenda_event {title,date?:'YYYY-MM-DD',time?:'HH:MM',endTime?:'HH:MM',notes?}, update_agenda_event {eventRef:'id ou título atual',newTitle?,date?,time?,endTime?,notes?}, delete_agenda_event {eventRef}, complete_agenda_event {eventRef}, reschedule_agenda_events {events:[{eventRef,date,time,endTime?}]}, start_routine {routineRef|name}, pause_routine, stop_routine, navigate {view:'notes'|'agenda'|'library'|'home'}. Para alterar ou excluir evento, use de preferência o id exibido na agenda. Use reschedule_agenda_events para realocar tarefas em massa. Só declare uma ação se ela estiver na lista.\n\n${history}\nUsuário: ${question}`;
  try{ const response=parseNoteAgentReply(await callGemini(prompt,{maxTokens:1600,responseMimeType:'application/json'})); const executed=await executeNoteAgentActions(response.actions,null); m.messages.push({role:'assistant',text:response.reply||'Pronto.',actions:executed}); }
  catch(error){ m.messages.push({role:'assistant',text:friendlyAiErrorMsg(error),error:true}); }
  m.sending=false; state.globalAiMessages=m.messages; saveData(); render();
}
async function sendNoteChatMessage(){
  const m = state.modal;
  if(!m || m.type !== 'note-chat') return;
  const question = (m.input||'').trim();
  if(!question || m.sending) return;
  const note = state.notesItems.find(n=>n.id===m.noteId);
  m.messages.push({ role:'user', text: question });
  const conversation = note && getNoteConversations(note).find(c=>c.id===m.conversationId);
  if(conversation){ conversation.messages = m.messages; conversation.title = getConversationTitle(conversation); saveNoteConversation(note, conversation); }
  m.input = '';
  m.sending = true;
  render();
  scrollChatMessagesToBottom('.note-chat-messages');

  const history = m.messages.slice(0,-1).map(msg => `${msg.role==='user'?'Usuário':'Assistente'}: ${msg.text}`).join('\n');
  const noteContent = note ? getNoteContent(note.id) : '';
  const aiContext=getAiWorkspaceContext();
  const workspace = (state.notesItems.map(item => `${item.type==='folder'?'Pasta':'Nota'}: ${item.name}`).join('\n') || '(vazio)') + `\n\nAGENDA ATUAL:\n${aiContext.agenda}\n\nROTINA EM ANDAMENTO: ${aiContext.routineActive}\nATALHOS DE ROTINA: ${aiContext.routineActions}\nHISTÓRICO RECENTE:\n${aiContext.activities}\n\nUSO DO APARELHO (relatórios consentidos do Companion):\n${aiContext.companionUsage}`;
  const decks = state.decks.map(deck => deck.name).join(', ') || '(nenhum)';
  // As ações de agenda/rotina ficavam num parágrafo à parte, bem depois da lista
  // principal — o modelo tendia a ignorá-las por não parecerem "a lista oficial".
  // Agora tudo vive numa lista só, então "gerenciar a agenda" pelo chat da nota
  // funciona igual ao chat global da Agenda.
  const prompt = `Você é o agente de IA de um aplicativo pessoal de estudos. Você conversa normalmente e pode executar ações dentro do aplicativo quando o usuário pedir explicitamente. A nota aberta pode ser editada por inteiro ou em partes, sem confirmação adicional. Nunca diga que fez uma ação sem incluí-la em actions: o aplicativo só consegue realizar o que estiver nessa lista. Quando o usuário pedir para procurar/buscar uma imagem na internet e adicioná-la, use search_image: o aplicativo fará a busca real em uma fonte pública e inserirá a imagem com crédito. Você também tem liberdade total pra gerenciar a Agenda (criar, editar, concluir, excluir e redistribuir eventos) e a Rotina sempre que o usuário pedir.\n\nNOTA ABERTA: "${note ? note.name : ''}"\nCONTEÚDO DA NOTA (preserve o formato ao editar):\n---\n${noteContent || '(nota vazia)'}\n---\n\nITENS DO CADERNO:\n${workspace}\n\nBARALHOS DISPONÍVEIS: ${decks}\n\nAções permitidas: create_folder {type,name,parentRef?,alias?}; create_note {type,title,content,parentRef?,format?}; edit_note {type,noteRef:'current',mode:'replace'|'append'|'prepend'|'replace_text'|'replace_all',content?,find?,replace?}; create_flashcards {type,deckRef:'linked'?,deckName?,cards:[{front,back,note?}]}; create_deck {type,name,deckType?}; update_deck {type,deckRef|deckName,newName?,color?,aiEnabled?}; create_book {type,title,author?,categories?,status?}; update_book {type,bookRef|bookTitle,newTitle?,author?,status?,rating?,pagesRead?,totalPages?}; navigate {type,view:'notes'|'agenda'|'library'|'home'}; search_image {type,query,alt?,noteRef:'current'}; create_agenda_event {type,title,date?:'YYYY-MM-DD',time?:'HH:MM',endTime?:'HH:MM',notes?}; update_agenda_event {type,eventRef:'id ou título atual',newTitle?,date?,time?,endTime?,notes?}; delete_agenda_event {type,eventRef}; complete_agenda_event {type,eventRef}; reschedule_agenda_events {type,events:[{eventRef,date,time,endTime?}]}; start_routine {type,routineRef|name}; pause_routine {type}; stop_routine {type}. Para alterar ou excluir um evento da agenda, prefira usar o id mostrado em AGENDA ATUAL. Para criar uma pasta e colocar notas nela, dê um alias à pasta e use o mesmo valor em parentRef. Só inclua ações solicitadas pelo usuário.\n\nResponda EXCLUSIVAMENTE com JSON válido, sem markdown: {"reply":"resposta curta e natural em português","actions":[...]}. Se não houver ação, use actions vazio.\n\n${history ? `Conversa até agora:\n${history}\n\n` : ''}Usuário: ${question}`;

  try{
    const agentResponse = parseNoteAgentReply(await callGemini(prompt, { maxTokens: 1800, responseMimeType:'application/json' }));
    const executed = await executeNoteAgentActions(agentResponse.actions, note);
    // A resposta do modelo pode dizer que criou algo mesmo se ela tiver
    // devolvido JSON inválido ou uma ação desconhecida. Neste caso, nunca
    // confirmamos a ação ao usuário: a confirmação visual só vem de `executed`.
    const requestedAction = noteAgentRequestNeedsAction(question);
    const text = requestedAction && !executed.completedActions
      ? 'Não consegui executar essa ação no caderno. Nenhuma nota, pasta ou cartão foi criado; tente pedir novamente.'
      : (agentResponse.reply || (executed.length ? 'Pronto.' : 'Não consegui montar uma resposta.'));
    m.messages.push({ role:'assistant', text, actions:executed });
  }catch(err){
    console.error('Falha no agente da nota', err);
    m.messages.push({ role:'assistant', text: friendlyAiErrorMsg(err), error:true });
  }
  if(conversation){ conversation.messages = m.messages; conversation.title = getConversationTitle(conversation); saveNoteConversation(note, conversation); }
  m.sending = false;
  render();
  scrollChatMessagesToBottom('.note-chat-messages');
}
// acha todas as ocorrências de um termo num texto (sem diferenciar
// maiúsculas/minúsculas) — usado tanto pra buscar dentro de uma nota quanto
// pra contar ocorrências na busca por conteúdo entre notas.
function findTextMatches(content, query){
  const q = query || '';
  if(!q) return [];
  const lowerContent = (content||'').toLowerCase();
  const lowerQuery = q.toLowerCase();
  const matches = [];
  let idx = 0;
  while(true){
    const found = lowerContent.indexOf(lowerQuery, idx);
    if(found === -1) break;
    matches.push({ start: found, end: found + q.length });
    idx = found + q.length;
  }
  return matches;
}
/* --- buscar e substituir dentro da nota aberta: feito 100% por comparação de
   texto simples (sem IA) — mais preciso e sem risco de trocar a ocorrência
   errada ou reescrever demais. --- */
function currentNoteIsPlain(){
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  return !!(note && note.format === 'plain');
}
// texto visível da nota aberta agora mesmo, pra buscar/substituir — pra "texto
// normal" usa o .textContent do próprio contenteditable (reflete o que está
// na tela, incluindo edições ainda não salvas), pra markdown usa a string crua.
function currentNoteSearchableText(){
  if(currentNoteIsPlain()){
    const el = document.getElementById('note-editor-plain');
    return el ? el.textContent : htmlToText(getNoteContent(state.currentNoteId));
  }
  return getNoteContent(state.currentNoteId);
}
function openNoteFind(){
  state.noteFindReplace = { active:true, query:'', replaceQuery:'', showReplace:false, matches:[], currentIndex:-1 };
  render();
}
function closeNoteFind(){
  state.noteFindReplace = null;
  render();
}
function toggleNoteFindReplace(){
  if(!state.noteFindReplace) return;
  state.noteFindReplace.showReplace = !state.noteFindReplace.showReplace;
  render();
}
function updateNoteFindQuery(value){
  const fr = state.noteFindReplace;
  if(!fr) return;
  fr.query = value;
  const isPlain = currentNoteIsPlain();
  const text = currentNoteSearchableText();
  fr.matches = findTextMatches(text, fr.query);
  fr.currentIndex = fr.matches.length ? 0 : -1;
  // atualiza só o contador, sem recriar o campo de busca nem o editor —
  // um render() cheio aqui perderia o foco/acento composto no meio da
  // digitação, o mesmo problema já corrigido no editor da nota.
  const counterEl = document.querySelector('.notes-find-count');
  if(counterEl) counterEl.textContent = fr.matches.length ? `${fr.currentIndex+1}/${fr.matches.length}` : (fr.query ? '0/0' : '');
  // só destaca "ao vivo" pra textarea (não rouba o foco); pra contenteditable
  // isso só acontece de fato ao clicar em anterior/próximo.
  if(fr.currentIndex >= 0 && !isPlain){
    const match = fr.matches[0];
    const ta = document.getElementById('note-editor-textarea');
    if(ta) ta.setSelectionRange(match.start, match.end);
  }
}
function jumpToNoteFindMatch(index){
  const fr = state.noteFindReplace;
  if(!fr || !fr.matches.length) return;
  const i = ((index % fr.matches.length) + fr.matches.length) % fr.matches.length;
  fr.currentIndex = i;
  render();
  const match = fr.matches[i];
  if(currentNoteIsPlain()){
    const el = document.getElementById('note-editor-plain');
    if(el){
      const range = textOffsetToRange(el, match.start, match.end);
      if(range){
        el.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const container = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
        if(container && container.scrollIntoView) container.scrollIntoView({ block:'nearest' });
      }
    }
  } else {
    const ta = document.getElementById('note-editor-textarea');
    if(ta){ ta.focus(); ta.setSelectionRange(match.start, match.end); }
  }
}
function nextNoteFindMatch(){
  const fr = state.noteFindReplace;
  if(!fr) return;
  jumpToNoteFindMatch((fr.currentIndex < 0 ? -1 : fr.currentIndex) + 1);
}
function prevNoteFindMatch(){
  const fr = state.noteFindReplace;
  if(!fr) return;
  jumpToNoteFindMatch((fr.currentIndex < 0 ? 0 : fr.currentIndex) - 1);
}
function replaceCurrentNoteMatch(){
  const fr = state.noteFindReplace;
  if(!fr || fr.currentIndex < 0 || !fr.matches.length) return;
  const noteId = state.currentNoteId;
  const note = state.notesItems.find(n=>n.id===noteId);
  const replacement = fr.replaceQuery || '';
  if(currentNoteIsPlain()){
    const el = document.getElementById('note-editor-plain');
    if(!el) return;
    const match = fr.matches[fr.currentIndex];
    const range = textOffsetToRange(el, match.start, match.end);
    if(range){
      el.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, replacement);
      onNoteContentInput(noteId, el.innerHTML);
    }
  } else {
    const content = getNoteContent(noteId);
    const match = fr.matches[fr.currentIndex];
    const newContent = content.slice(0, match.start) + replacement + content.slice(match.end);
    recordNoteHistory(noteId, content, newContent);
    noteContentCache[noteId] = newContent;
    if(note) note.updatedAt = Date.now();
    saveData();
    saveNoteContentToR2(noteId, newContent);
  }
  const newText = currentNoteSearchableText();
  fr.matches = findTextMatches(newText, fr.query);
  fr.currentIndex = fr.matches.length ? Math.min(fr.currentIndex, fr.matches.length-1) : -1;
  render();
  if(fr.currentIndex >= 0) jumpToNoteFindMatch(fr.currentIndex);
}
function replaceAllNoteMatches(){
  const fr = state.noteFindReplace;
  if(!fr || !fr.query) return;
  const noteId = state.currentNoteId;
  const note = state.notesItems.find(n=>n.id===noteId);
  const replacement = fr.replaceQuery || '';
  if(currentNoteIsPlain()){
    const el = document.getElementById('note-editor-plain');
    if(!el) return;
    const matches = findTextMatches(el.textContent, fr.query);
    if(!matches.length){ showToast('Nada pra substituir.', 'info'); return; }
    // de trás pra frente, pra não bagunçar os offsets dos que ainda faltam
    for(let idx = matches.length-1; idx>=0; idx--){
      const range = textOffsetToRange(el, matches[idx].start, matches[idx].end);
      if(range){
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, replacement);
      }
    }
    onNoteContentInput(noteId, el.innerHTML);
    fr.matches = [];
    fr.currentIndex = -1;
    render();
    showToast(`${matches.length} substituição(ões) feita(s).`);
    return;
  }
  const content = getNoteContent(noteId);
  const matches = findTextMatches(content, fr.query);
  if(!matches.length){ showToast('Nada pra substituir.', 'info'); return; }
  let newContent = '';
  let lastEnd = 0;
  matches.forEach(m => { newContent += content.slice(lastEnd, m.start) + replacement; lastEnd = m.end; });
  newContent += content.slice(lastEnd);
  recordNoteHistory(noteId, content, newContent);
  noteContentCache[noteId] = newContent;
  if(note) note.updatedAt = Date.now();
  saveData();
  saveNoteContentToR2(noteId, newContent);
  fr.matches = [];
  fr.currentIndex = -1;
  render();
  showToast(`${matches.length} substituição(ões) feita(s).`);
}
/* --- buscar notas no explorador: pelo nome (instantâneo, sem rede) e,
   opcionalmente, pelo conteúdo de todas as notas — como o texto de cada nota
   mora no R2 e só é buscado sob demanda, a busca por conteúdo precisa buscar
   antes o texto de qualquer nota ainda não aberta nessa sessão. --- */
function noteItemMatchesSearch(item, query){
  return item.name.toLowerCase().includes(query.toLowerCase());
}
function noteSubtreeMatchesSearch(itemId, query){
  const item = state.notesItems.find(n=>n.id===itemId);
  if(!item) return false;
  if(noteItemMatchesSearch(item, query)) return true;
  return state.notesItems.some(child => child.parentId === itemId && noteSubtreeMatchesSearch(child.id, query));
}
function updateNotesSearchQuery(value){
  state.notesSearch = state.notesSearch || { query:'', contentResults:null, searching:false };
  state.notesSearch.query = value;
  state.notesSearch.contentResults = null; // busca de conteúdo antiga não vale mais pro termo novo
  // atualiza só a árvore + a área abaixo da busca, sem recriar o campo de
  // busca em si (mesmo cuidado de sempre: não perder foco/acento composto).
  const treeEl = document.querySelector('.notes-tree');
  if(treeEl){
    const hasRootItems = state.notesItems.some(n=>n.parentId===null);
    treeEl.innerHTML = (!hasRootItems ? `<p style="color:var(--text-faint); font-size:12px; padding:8px 4px;">Nenhuma nota ainda. Crie a primeira com os botões acima.</p>` : '') + renderNotesTreeLevel(null, 0);
  }
  const extrasEl = document.querySelector('.notes-search-extras');
  if(extrasEl) extrasEl.innerHTML = renderNotesSearchExtras();
}
function clearNotesSearch(){
  state.notesSearch = { query:'', contentResults:null, searching:false };
  render();
}
async function searchAllNotesContent(){
  state.notesSearch = state.notesSearch || { query:'', contentResults:null, searching:false };
  const query = (state.notesSearch.query||'').trim();
  if(!query) return;
  state.notesSearch.searching = true;
  render();
  const notesToFetch = state.notesItems.filter(n => n.type==='note' && noteContentCache[n.id] === undefined);
  await Promise.all(notesToFetch.map(n =>
    loadNoteContentFromR2(n.id).then(c => { noteContentCache[n.id] = c; }).catch(e => console.error('Falha ao buscar conteúdo pra pesquisa', n.id, e))
  ));

  const results = [];
  state.notesItems.filter(n=>n.type==='note').forEach(n => {
    const raw = getNoteContent(n.id);
    const content = n.format === 'plain' ? htmlToText(raw) : raw;
    const matches = findTextMatches(content, query);
    if(matches.length){
      const idx = matches[0].start;
      const snippetStart = Math.max(0, idx-40);
      const snippetEnd = Math.min(content.length, idx+query.length+40);
      const snippet = (snippetStart>0?'…':'') + content.slice(snippetStart, snippetEnd) + (snippetEnd<content.length?'…':'');
      results.push({ noteId: n.id, noteName: n.name, snippet, matchCount: matches.length });
    }
  });
  state.notesSearch.contentResults = results;
  state.notesSearch.searching = false;
  render();
}
function openNoteSearchResult(noteId){
  const query = (state.notesSearch && state.notesSearch.query) || '';
  openNote(noteId);
  const note = state.notesItems.find(n=>n.id===noteId);
  const isPlain = note && note.format === 'plain';
  if(!isPlain && state.notesEditorMode === 'preview') state.notesEditorMode = 'split';
  const raw = getNoteContent(noteId);
  const content = isPlain ? htmlToText(raw) : raw;
  const matches = findTextMatches(content, query);
  state.noteFindReplace = { active:true, query, replaceQuery:'', showReplace:false, matches, currentIndex: matches.length ? 0 : -1 };
  render();
  if(state.noteFindReplace.currentIndex >= 0) jumpToNoteFindMatch(0);
}
/* --- caminho alternativo pro celular: a seleção nativa de texto do sistema
   toma conta da tela e não dá pra encaixar nossa barra flutuante ali no meio
   (mesma limitação já conhecida do leitor de epub). Em vez de brigar com o
   seletor do sistema, o usuário copia o trecho por fora e cola aqui dentro —
   a IA processa do mesmo jeito. --- */
function openNotePasteCardModal(){
  if(!state.currentNoteId) return;
  state.modal = { type:'note-paste-card', text:'' };
  render();
}
function confirmNotePasteCard(){
  const m = state.modal;
  const text = (m.text||'').trim();
  if(!text){ showToast('Cole o texto primeiro.', 'error'); return; }
  const note = state.notesItems.find(n=>n.id===state.currentNoteId);
  if(!note) return;
  state.modal = { type:'note-passage-card', status:'loading', passage:text, card:{front:'',back:'',note:''}, deckId: note.linkedDeckId || '', noteId: note.id };
  render();
  generateCardFromPassage(text).then(card => {
    if(state.modal && state.modal.type === 'note-passage-card'){
      state.modal.status = 'review';
      state.modal.card = card;
      render();
    }
  }).catch(err => {
    console.error('Falha ao gerar cartão a partir de texto colado', err);
    if(state.modal && state.modal.type === 'note-passage-card'){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
      render();
    }
  });
}
function openNotePasteCorrectionModal(){
  if(!state.currentNoteId) return;
  state.modal = { type:'note-paste-correction', status:'input', text:'' };
  render();
}
function confirmNotePasteCorrection(){
  const m = state.modal;
  if(!m || m.type !== 'note-paste-correction') return;
  const text = (m.text||'').trim();
  if(!text){ showToast('Cole o texto primeiro.', 'error'); return; }
  m.status = 'loading';
  m.original = text;
  render();
  generateTextCorrection(text).then(corrected => {
    if(state.modal && state.modal.type === 'note-paste-correction'){
      state.modal.status = 'review';
      state.modal.corrected = corrected;
      render();
    }
  }).catch(err => {
    console.error('Falha ao corrigir texto colado', err);
    if(state.modal && state.modal.type === 'note-paste-correction'){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
      render();
    }
  });
}
async function copyPasteCorrectionResult(){
  const m = state.modal;
  if(!m || m.type !== 'note-paste-correction') return;
  try{
    await navigator.clipboard.writeText(m.corrected);
    showToast('Texto corrigido copiado! Cole na nota onde precisar.');
  }catch(e){
    showToast('Não consegui copiar automaticamente. Selecione o texto manualmente.', 'error');
  }
}

