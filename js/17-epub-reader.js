/* ============ LEITOR DE EPUB (dentro de Leituras) ============ */
// dados "vivos" (zip aberto, caminhos dos capítulos) ficam FORA de state — não são
// serializáveis e não fazem sentido sincronizar; só os metadados leves (book.epub)
// e as citações/cartões criados a partir da leitura sincronizam normalmente.
let epubRuntime = {}; // bookId -> { zip, chapterPaths, paragraphsCache: {index: [parágrafos]} }
let __lastEpubPageKey = null; // guarda qual página foi renderizada por último, pra só animar em virada de página de verdade

async function parseEpubFile(blob){
  const zip = await JSZip.loadAsync(blob);
  const containerFile = zip.file('META-INF/container.xml');
  if(!containerFile) throw new Error('epub_invalido');
  const containerXml = await containerFile.async('text');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
  const opfFile = zip.file(opfPath);
  if(!opfFile) throw new Error('epub_invalido');
  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')+1) : '';

  const titleEl = opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0];
  const authorEl = opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0];
  const title = (titleEl && titleEl.textContent.trim()) || 'Sem título';
  const author = (authorEl && authorEl.textContent.trim()) || '';

  const manifestItems = {};
  const manifestItemEls = Array.from(opfDoc.querySelectorAll('manifest > item'));
  manifestItemEls.forEach(item => {
    manifestItems[item.getAttribute('id')] = item.getAttribute('href');
  });
  const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref')).map(ir => ir.getAttribute('idref'));
  const chapterPaths = spineIds.map(id => manifestItems[id]).filter(Boolean).map(href => opfDir + href);
  if(chapterPaths.length === 0) throw new Error('epub_sem_capitulos');

  // capa: tenta o padrão EPUB3 (properties="cover-image") e cai pro EPUB2
  // (<meta name="cover" content="ID"/> apontando pro item no manifesto).
  let coverHref = null;
  const coverItemEl = manifestItemEls.find(item => (item.getAttribute('properties')||'').split(/\s+/).includes('cover-image'));
  if(coverItemEl) coverHref = coverItemEl.getAttribute('href');
  if(!coverHref){
    const metaCover = opfDoc.querySelector('metadata > meta[name="cover"]');
    if(metaCover) coverHref = manifestItems[metaCover.getAttribute('content')];
  }
  let coverUrl = '';
  if(coverHref){
    const coverFile = zip.file(opfDir + coverHref);
    if(coverFile){
      const base64 = await coverFile.async('base64');
      const ext = coverHref.split('.').pop().toLowerCase();
      const mime = ext==='png' ? 'image/png' : ext==='svg' ? 'image/svg+xml' : ext==='gif' ? 'image/gif' : 'image/jpeg';
      coverUrl = `data:${mime};base64,${base64}`;
    }
  }

  const { toc, chapterTitles } = await parseEpubToc(zip, opfDoc, opfDir, manifestItemEls, manifestItems, chapterPaths);

  return { zip, title, author, chapterPaths, coverUrl, toc, chapterTitles };
}
// resolve um href relativo (do nav/ncx) contra o diretório de onde ele veio —
// usa a API de URL só pra lidar com "../" direito. Mantém a âncora (#p45) à
// parte: em muitos epubs (principalmente convertidos pelo Calibre) vários
// capítulos de verdade ficam num único arquivo grande, diferenciados só pela
// âncora — sem isso o sumário não consegue apontar pro lugar certo.
function resolveEpubHrefParts(baseDir, href){
  if(!href) return { path:'', fragment:'' };
  const [pathPart, fragment] = href.split('#');
  if(!pathPart) return { path:'', fragment: fragment||'' };
  try{
    const resolved = new URL(pathPart, 'file:///' + baseDir).pathname.replace(/^\//, '');
    return { path: decodeURIComponent(resolved), fragment: fragment||'' };
  }catch(e){ return { path: baseDir + pathPart, fragment: fragment||'' }; }
}
// lê o sumário do epub: tenta o nav document do EPUB3 (properties="nav") e,
// se não achar, cai pro NCX do EPUB2 (navMap/navPoint). Cada entrada é casada
// com o índice do capítulo correspondente no spine pelo caminho do arquivo.
async function parseEpubToc(zip, opfDoc, opfDir, manifestItemEls, manifestItems, chapterPaths){
  const entries = [];
  const navItem = manifestItemEls.find(item => (item.getAttribute('properties')||'').split(/\s+/).includes('nav'));
  if(navItem){
    try{
      const navPath = opfDir + navItem.getAttribute('href');
      const navFile = zip.file(navPath);
      if(navFile){
        const navXml = await navFile.async('text');
        let navDoc = new DOMParser().parseFromString(navXml, 'application/xhtml+xml');
        if(navDoc.querySelector('parsererror')) navDoc = new DOMParser().parseFromString(navXml, 'text/html');
        const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/')+1) : '';
        const navEls = Array.from(navDoc.querySelectorAll('nav'));
        const tocNav = navEls.find(n => (n.getAttribute('epub:type')||'').includes('toc')) || navEls[0];
        if(tocNav){
          Array.from(tocNav.querySelectorAll('a[href]')).forEach(a => {
            const title = a.textContent.replace(/\s+/g,' ').trim();
            const href = a.getAttribute('href');
            if(title && href) entries.push({ title, ...resolveEpubHrefParts(navDir, href) });
          });
        }
      }
    }catch(e){ console.warn('Falha ao ler nav (sumário) do epub', e); }
  }
  if(entries.length === 0){
    const spineEl = opfDoc.querySelector('spine');
    const tocId = spineEl && spineEl.getAttribute('toc');
    const ncxHref = tocId ? manifestItems[tocId] : Object.values(manifestItems).find(h => h && h.toLowerCase().endsWith('.ncx'));
    if(ncxHref){
      try{
        const ncxPath = opfDir + ncxHref;
        const ncxFile = zip.file(ncxPath);
        if(ncxFile){
          const ncxXml = await ncxFile.async('text');
          const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
          const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/')+1) : '';
          Array.from(ncxDoc.querySelectorAll('navPoint')).forEach(np => {
            const labelEl = np.querySelector('navLabel > text');
            const contentEl = np.querySelector('content');
            const title = labelEl ? labelEl.textContent.replace(/\s+/g,' ').trim() : '';
            const src = contentEl ? contentEl.getAttribute('src') : '';
            if(title && src) entries.push({ title, ...resolveEpubHrefParts(ncxDir, src) });
          });
        }
      }catch(e){ console.warn('Falha ao ler ncx (sumário) do epub', e); }
    }
  }
  const toc = [];
  const chapterTitles = new Array(chapterPaths.length).fill(null);
  entries.forEach(entry => {
    const idx = chapterPaths.findIndex(p => p === entry.path);
    if(idx === -1) return;
    toc.push({ title: entry.title, chapterIndex: idx, fragment: entry.fragment || null });
    if(!chapterTitles[idx]) chapterTitles[idx] = entry.title;
  });
  return { toc, chapterTitles };
}
// estimativa grosseira de páginas impressas a partir da contagem de palavras
// (só roda no upload, não toda vez que o livro é reaberto).
async function estimateEpubPageCount(zip, chapterPaths){
  const WORDS_PER_PAGE = 260;
  let totalWords = 0;
  for(const path of chapterPaths){
    const file = zip.file(path);
    if(!file) continue;
    try{
      const xhtml = await file.async('text');
      let doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
      if(doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(xhtml, 'text/html');
      const text = (doc.body || doc.documentElement).textContent || '';
      totalWords += (text.match(/\S+/g) || []).length;
    }catch(e){ /* ignora capítulo problemático na estimativa */ }
  }
  return Math.max(1, Math.round(totalWords / WORDS_PER_PAGE));
}
async function loadEpubChapterParagraphs(bookId, index){
  const runtime = epubRuntime[bookId];
  if(!runtime) throw new Error('epub_nao_carregado');
  if(runtime.paragraphsCache[index]) return runtime.paragraphsCache[index];
  const path = runtime.chapterPaths[index];
  const file = runtime.zip.file(path);
  if(!file) throw new Error('capitulo_nao_encontrado');
  const xhtml = await file.async('text');
  let doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  if(doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(xhtml, 'text/html'); // fallback pra epubs com xhtml malformado
  const kept = [];
  Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, li, blockquote')).forEach(el => {
    const text = el.textContent.replace(/\s+/g,' ').trim();
    if(text) kept.push({ el, text });
  });
  const paragraphs = kept.map(k => k.text);
  // mapa âncora->parágrafo: em muitos epubs vários capítulos de verdade ficam
  // no mesmo arquivo, diferenciados só por id="pN" — sem isso o sumário e os
  // marcadores não têm como apontar pro parágrafo certo dentro do arquivo.
  const anchorMap = {};
  Array.from(doc.querySelectorAll('[id]')).forEach(idEl => {
    const id = idEl.getAttribute('id');
    if(!id || anchorMap[id] !== undefined) return;
    let found = kept.length ? kept.length - 1 : 0;
    for(let i=0;i<kept.length;i++){
      const node = kept[i].el;
      if(node === idEl){ found = i; break; }
      const rel = idEl.compareDocumentPosition(node);
      if(rel & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)){ found = i; break; }
    }
    anchorMap[id] = found;
  });
  runtime.paragraphsCache[index] = paragraphs;
  runtime.anchorMaps = runtime.anchorMaps || {};
  runtime.anchorMaps[index] = anchorMap;
  return paragraphs;
}
// divide os parágrafos de um capítulo em "páginas" de tamanho parecido (por
// contagem de palavras) — é o que abandona a rolagem infinita: cada página
// vira um bloco curto, e o Anterior/Próximo passa por elas uma de cada vez.
// Nunca quebra um parágrafo ao meio, então uma página pode ficar um pouco
// maior que o alvo se um único parágrafo já for longo.
const EPUB_WORDS_PER_PAGE = 220;
// "hardBreaks" força o início de página exatamente onde um capítulo de
// verdade começa (âncora do sumário) — sem isso, um pulo pelo sumário podia
// cair numa página que começava com o FINAL do capítulo anterior, e só lá
// embaixo é que aparecia o capítulo que a pessoa realmente escolheu.
function chunkParagraphsIntoPages(paragraphs, hardBreaks){
  hardBreaks = hardBreaks || new Set();
  if(paragraphs.length === 0) return [{ start:0, end:0 }];
  const pages = [];
  let start = 0, count = 0;
  for(let i=0;i<paragraphs.length;i++){
    const words = (paragraphs[i].match(/\S+/g)||[]).length;
    const forceBreak = i > start && hardBreaks.has(i);
    if(forceBreak || (count > 0 && count + words > EPUB_WORDS_PER_PAGE)){
      pages.push({ start, end:i });
      start = i; count = 0;
    }
    count += words;
  }
  pages.push({ start, end:paragraphs.length });
  return pages;
}
// só calcula (e guarda em cache) depois que os parágrafos do capítulo já
// foram carregados — devolve null se ainda não deu tempo.
function getEpubPages(bookId, chapterIndex){
  const runtime = epubRuntime[bookId];
  const paragraphs = runtime && runtime.paragraphsCache[chapterIndex];
  if(!paragraphs) return null;
  runtime.pagesCache = runtime.pagesCache || {};
  if(!runtime.pagesCache[chapterIndex]){
    const book = state.books.find(b=>b.id===bookId);
    const hardBreaks = new Set();
    if(book && book.epub && book.epub.toc){
      book.epub.toc.forEach(entry => {
        if(entry.chapterIndex === chapterIndex && entry.fragment){
          const pIdx = resolveEpubAnchorParagraphIndex(bookId, chapterIndex, entry.fragment);
          if(pIdx > 0) hardBreaks.add(pIdx);
        }
      });
    }
    runtime.pagesCache[chapterIndex] = chunkParagraphsIntoPages(paragraphs, hardBreaks);
  }
  return runtime.pagesCache[chapterIndex];
}
// pra qual parágrafo (já no espaço de índices filtrado, igual paragraphsCache)
// uma âncora "#pN" do sumário aponta — 0 se a âncora não existir ou o
// capítulo ainda não tiver sido carregado (fica pro início dele).
function resolveEpubAnchorParagraphIndex(bookId, chapterIndex, fragment){
  const runtime = epubRuntime[bookId];
  const map = runtime && runtime.anchorMaps && runtime.anchorMaps[chapterIndex];
  if(!fragment || !map || map[fragment] === undefined) return 0;
  return map[fragment];
}
// acha, entre as entradas do sumário que caem dentro do capítulo atual, qual
// delas é a mais próxima (por trás ou igual) do início da página que está
// sendo mostrada — é o que permite um único arquivo grande (comum em epubs
// convertidos pelo Calibre, com vários capítulos de verdade separados só por
// âncora) mudar o título exibido conforme o leitor avança pelas páginas.
function getActiveEpubTocEntry(bookId, book, chapterIndex, pageStartParagraphIdx){
  const entries = (book.epub.toc||[]).filter(e => e.chapterIndex === chapterIndex);
  if(entries.length === 0) return null;
  let best = null, bestPos = -1;
  entries.forEach(e => {
    const pIdx = e.fragment ? resolveEpubAnchorParagraphIndex(bookId, chapterIndex, e.fragment) : 0;
    if(pIdx <= pageStartParagraphIdx && pIdx >= bestPos){ bestPos = pIdx; best = e; }
  });
  return best;
}
function getEpubReadPercent(book){
  if(!book || !book.epub || !book.epub.chapterCount) return 0;
  const idx = book.epub.currentChapterIndex || 0;
  const pageIdx = book.epub.currentPageIndex || 0;
  const pagesInChapter = book.epub.pagesInCurrentChapter || 1;
  const frac = pagesInChapter > 0 ? Math.min(1, pageIdx / pagesInChapter) : 0;
  return Math.max(0, Math.min(100, Math.round(((idx + frac) / book.epub.chapterCount) * 100)));
}
function openEpubUploadPicker(bookId){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.epub,application/epub+zip';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const book = state.books.find(b=>b.id===bookId);
    if(!book) return;
    book.epubStatus = 'uploading';
    render();
    try{
      const parsed = await parseEpubFile(file);
      await uploadEpubForBook(bookId, file);
      epubRuntime[bookId] = { zip: parsed.zip, chapterPaths: parsed.chapterPaths, paragraphsCache: {} };
      book.epub = {
        title: parsed.title, author: parsed.author, fileName: file.name,
        chapterCount: parsed.chapterPaths.length, currentChapterIndex: 0, currentPageIndex: 0, pagesInCurrentChapter: 1, uploadedAt: Date.now(),
        toc: parsed.toc, chapterTitles: parsed.chapterTitles, bookmarks: []
      };
      if(!book.coverUrl && parsed.coverUrl) book.coverUrl = parsed.coverUrl;
      if(!book.totalPages) book.totalPages = await estimateEpubPageCount(parsed.zip, parsed.chapterPaths);
      delete book.epubStatus;
      saveData(); render();
      showToast('Livro carregado!');
    }catch(err){
      console.error('Falha ao carregar epub', err);
      delete book.epubStatus;
      render();
      showToast(epubErrorMessage(err), 'error');
    }
  };
  input.click();
}
/* atalho pra quem já tem o arquivo em mãos: cria o livro na hora, preenchendo
   título/autor/capa a partir do próprio epub, e já abre a leitura. */
function openEpubUploadForNewBook(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.epub,application/epub+zip';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const book = makeBook('Carregando...', '');
    book.epubStatus = 'uploading';
    state.books.push(book);
    render();
    try{
      const parsed = await parseEpubFile(file);
      await uploadEpubForBook(book.id, file);
      epubRuntime[book.id] = { zip: parsed.zip, chapterPaths: parsed.chapterPaths, paragraphsCache: {} };
      book.title = parsed.title;
      book.author = parsed.author;
      book.coverUrl = parsed.coverUrl || '';
      book.epub = {
        title: parsed.title, author: parsed.author, fileName: file.name,
        chapterCount: parsed.chapterPaths.length, currentChapterIndex: 0, currentPageIndex: 0, pagesInCurrentChapter: 1, uploadedAt: Date.now(),
        toc: parsed.toc, chapterTitles: parsed.chapterTitles, bookmarks: []
      };
      book.totalPages = await estimateEpubPageCount(parsed.zip, parsed.chapterPaths);
      delete book.epubStatus;
      saveData();
      showToast('Livro carregado! Confira as propriedades (idioma, baralho) antes de ler.');
      openBook(book.id);
    }catch(err){
      console.error('Falha ao carregar epub', err);
      state.books = state.books.filter(b => b.id !== book.id); // desfaz o placeholder se falhar
      render();
      showToast(epubErrorMessage(err), 'error');
    }
  };
  input.click();
}
async function ensureEpubLoaded(bookId){
  if(epubRuntime[bookId]) return;
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  book.epubStatus = 'downloading';
  render();
  try{
    const blob = await downloadEpubForBook(bookId);
    const parsed = await parseEpubFile(blob);
    epubRuntime[bookId] = { zip: parsed.zip, chapterPaths: parsed.chapterPaths, paragraphsCache: {} };
  }catch(err){
    console.error('Falha ao baixar/abrir epub salvo', err);
    showToast(epubErrorMessage(err), 'error');
  }
  delete book.epubStatus;
  render();
}
function epubErrorMessage(err){
  if(err && err.message === 'not_logged_in') return 'Faça login pra guardar ou abrir livros.';
  if(err && err.message === 'upload_timeout') return 'O envio demorou demais e foi cancelado. Tente de novo.';
  if(err && err.message === 'download_timeout') return 'Demorou demais pra abrir o livro salvo. Tente de novo.';
  if(err && err.message === 'epub_upload_error') return 'Não consegui salvar esse arquivo agora. Tente de novo.';
  return 'Não consegui abrir esse arquivo. Confira se é um .epub válido, sem proteção DRM.';
}
// pula pro início de um capítulo (página 0) — usado pelo sumário, marcadores e
// pelos próprios Anterior/Próximo quando cruzam a fronteira de um capítulo.
function goToEpubChapter(bookId, index){
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  const clamped = Math.max(0, Math.min(book.epub.chapterCount-1, index));
  book.epub.currentChapterIndex = clamped;
  book.epub.currentPageIndex = 0;
  saveData(); render();
  scrollEpubMainToTop();
}
function jumpToEpubTocEntry(bookId, chapterIndex, fragment){
  closeModal();
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  const clamped = Math.max(0, Math.min(book.epub.chapterCount-1, chapterIndex));
  book.epub.currentChapterIndex = clamped;
  if(fragment){
    // a âncora só pode ser resolvida depois que os parágrafos desse capítulo
    // estiverem carregados — renderEpubReaderView termina o trabalho quando chegar lá.
    state._epubPendingPageJump = { fragment };
    render();
  } else {
    book.epub.currentPageIndex = 0;
    saveData(); render();
    scrollEpubMainToTop();
  }
}
function scrollEpubMainToTop(){
  requestAnimationFrame(() => { const m = document.querySelector('.main'); if(m) m.scrollTop = 0; });
}
// avança/volta uma "página" (bloco de parágrafos) por vez, sem rolagem contínua.
// Quando chega no fim/início do capítulo carregado, pula pro capítulo vizinho —
// se esse capítulo ainda não foi carregado, marca uma "página pendente" que o
// renderEpubReaderView resolve assim que os parágrafos chegarem.
function nextEpubPage(bookId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  const idx = book.epub.currentChapterIndex;
  const pages = getEpubPages(bookId, idx);
  const pageIdx = book.epub.currentPageIndex || 0;
  if(pages && pageIdx < pages.length-1){
    book.epub.currentPageIndex = pageIdx + 1;
    book.epub.pagesInCurrentChapter = pages.length;
    saveData(); render();
    scrollEpubMainToTop();
    return;
  }
  if(idx < book.epub.chapterCount-1){
    book.epub.currentChapterIndex = idx + 1;
    book.epub.currentPageIndex = 0;
    saveData(); render();
    scrollEpubMainToTop();
  }
}
function prevEpubPage(bookId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  const idx = book.epub.currentChapterIndex;
  const pageIdx = book.epub.currentPageIndex || 0;
  if(pageIdx > 0){
    book.epub.currentPageIndex = pageIdx - 1;
    saveData(); render();
    scrollEpubMainToTop();
    return;
  }
  if(idx > 0){
    book.epub.currentChapterIndex = idx - 1;
    state._epubPendingPageJump = 'last'; // resolvido no render() quando o capítulo anterior carregar
    render();
  }
}
function addEpubBookmark(bookId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  const idx = book.epub.currentChapterIndex;
  const pageIdx = book.epub.currentPageIndex || 0;
  const paragraphs = epubRuntime[bookId] && epubRuntime[bookId].paragraphsCache[idx];
  const pages = getEpubPages(bookId, idx);
  const pageStart = paragraphs && pages && pages[pageIdx] ? paragraphs[pages[pageIdx].start] : null;
  const excerpt = pageStart ? pageStart.slice(0, 80) : '';
  const label = (book.epub.chapterTitles && book.epub.chapterTitles[idx]) || `Capítulo ${idx+1}`;
  book.epub.bookmarks = book.epub.bookmarks || [];
  book.epub.bookmarks.push({
    id: uid(), chapterIndex: idx, pageIndex: pageIdx,
    label, excerpt, createdAt: Date.now()
  });
  saveData(); render();
  showToast('Marcador adicionado.');
}
function removeEpubBookmark(bookId, bookmarkId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book || !book.epub) return;
  book.epub.bookmarks = (book.epub.bookmarks||[]).filter(bm=>bm.id!==bookmarkId);
  saveData(); render();
}
function goToEpubBookmark(bookId, bookmarkId){
  const book = state.books.find(b=>b.id===bookId);
  const bm = book && book.epub && (book.epub.bookmarks||[]).find(b=>b.id===bookmarkId);
  if(!book || !bm) return;
  book.epub.currentChapterIndex = bm.chapterIndex;
  book.epub.currentPageIndex = bm.pageIndex || 0;
  closeModal();
  saveData(); render();
  scrollEpubMainToTop();
}
function deleteEpubFromBook(bookId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book) return;
  askConfirm('Remover o arquivo (.epub) carregado? As citações e cartões já criados continuam normalmente.', () => {
    delete book.epub;
    delete epubRuntime[bookId];
    if(state.firebaseUser) deleteEpubForBook(bookId);
    if(state.view === 'epub-reader' && state.currentBookId === bookId){ state.view = 'book'; }
    saveData(); render();
    showToast('Arquivo removido.');
  });
}

/* --- página dedicada de leitura --- */
function openEpubReader(bookId){
  const book = state.books.find(b=>b.id===bookId);
  if(!book) return;
  state.currentBookId = bookId;
  state.view = 'epub-reader';
  state._epubPendingPageJump = null;
  finishWritingActivity();
  startReadingActivity(bookId);
  playBookOpen();
  render();
}
function closeEpubReader(){
  finishReadingActivity();
  state._epubPendingPageJump = null;
  state.view = 'library';
  state.currentBookId = null;
  render();
}

/* transforma o texto de um parágrafo em HTML com cada palavra clicável, agrupada
   por frase (guardada num atributo data-sentence) pra dar contexto à tradução —
   usado só em livros marcados como "em inglês". */
function renderEpubParagraphClickable(text, targetDeckId){
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.map(sentence => {
    const wordsHtml = sentence.split(/(\s+)/).map(tok => {
      const m = tok.match(/^([A-Za-zÀ-ÿ']+)(.*)$/);
      if(m && m[1]){
        return `<span class="clickable-word" onclick="lookupWord('${m[1].replace(/'/g,"\\'")}', '${targetDeckId}', this.closest('[data-sentence]').getAttribute('data-sentence'))">${escapeHtml(m[1])}</span>${escapeHtml(m[2])}`;
      }
      return escapeHtml(tok);
    }).join('');
    return `<span data-sentence="${escapeHtml(sentence)}">${wordsHtml}</span>`;
  }).join(' ');
}
/* --- livros que NÃO são em inglês: seleciona um trecho pra guardar como
   citação ou pedir um cartão de flashcard gerado pela IA. A barra só existe
   no DOM pra esses livros (veja renderEpubReaderView), então em livros de
   inglês "bar" já vem null e a função sai sem mexer em nada — não tem como
   brigar com o toque de tradução. --- */
document.addEventListener('mouseup', handleReaderSelection);
document.addEventListener('touchend', handleReaderSelection);
function handleReaderSelection(){
  if(state.view !== 'epub-reader') return;
  const book = state.books.find(b=>b.id===state.currentBookId);
  if(!book) return;
  const bar = document.getElementById('reader-selection-bar');
  if(!bar) return;
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';
  if(text){
    state.readerSelection = text;
    bar.style.display = 'flex';
  } else {
    state.readerSelection = null;
    bar.style.display = 'none';
  }
}
function saveReaderSelectionAsQuote(){
  const text = state.readerSelection;
  const book = state.books.find(b=>b.id===state.currentBookId);
  if(!text || !book) return;
  book.quotes = book.quotes || [];
  book.quotes.push({ id: uid(), text, createdAt: Date.now() });
  state.readerSelection = null;
  window.getSelection().removeAllRanges();
  saveData(); render();
  showToast('Citação guardada.');
}
async function generateCardFromPassage(passageText){
  const prompt = `Trecho de um livro:\n"${passageText}"\n\nCrie 1 flashcard de pergunta e resposta em português sobre o conteúdo principal desse trecho, com pergunta objetiva e resposta curta e direta. Escreva também uma nota breve (1-2 frases) com uma explicação um pouco mais elaborada.\n\nResponda SOMENTE com um JSON válido, exatamente neste formato:\n{"front":"pergunta","back":"resposta objetiva","note":"breve explicação"}`;
  const text = (await callGemini(prompt, { maxTokens: 300 })).trim();
  const clean = text.replace(/```json|```/g,"").trim();
  const obj = JSON.parse(clean);
  return {
    front: String((obj && obj.front) || '').trim(),
    back: String((obj && obj.back) || '').trim(),
    note: String((obj && obj.note) || '').trim()
  };
}
function requestCardFromReaderSelection(){
  const text = state.readerSelection;
  const book = state.books.find(b=>b.id===state.currentBookId);
  if(!text || !book) return;
  window.getSelection().removeAllRanges();
  const bar = document.getElementById('reader-selection-bar');
  if(bar) bar.style.display = 'none';
  state.modal = { type:'passage-card', status:'loading', passage:text, card:{front:'',back:'',note:''}, deckId: book.linkedDeckId || '' };
  render();
  generateCardFromPassage(text).then(card => {
    if(state.modal && state.modal.type === 'passage-card'){
      state.modal.status = 'review';
      state.modal.card = card;
      render();
    }
  }).catch(err => {
    console.error('Falha ao gerar cartão a partir do trecho', err);
    if(state.modal && state.modal.type === 'passage-card'){
      state.modal.status = 'error';
      state.modal.error = friendlyAiErrorMsg(err);
      render();
    }
  });
}
function confirmPassageCard(){
  const m = state.modal;
  if(!m || m.type !== 'passage-card') return;
  const front = (m.card.front||'').trim(), back = (m.card.back||'').trim();
  if(!front || !back){ showToast('Preencha pergunta e resposta.', 'error'); return; }
  if(!m.deckId || !state.cards[m.deckId]){ showToast('Escolha um baralho.', 'error'); return; }
  const card = makeCard(front, back);
  card.note = (m.card.note||'').trim();
  state.cards[m.deckId].push(card);
  state.modal = null;
  saveData(); render();
  showToast('Cartão adicionado ao baralho.');
}

function renderEpubReaderView(){
  const book = state.books.find(b=>b.id===state.currentBookId);
  if(!book) return '';
  if(!book.epub){
    // não deveria acontecer (só se navegar aqui sem epub), volta pro detalhe do livro
    state.view = 'book';
    return '';
  }
  const gearBtn = `<button class="icon-btn" title="Editar propriedades do livro" onclick="state.view='book'; render();">⚙️</button>`;
  if(book.epubStatus === 'downloading' || !epubRuntime[book.id]){
    if(!epubRuntime[book.id] && book.epubStatus !== 'downloading') ensureEpubLoaded(book.id);
    return `
    <button class="ghost-btn mobile-back-btn" onclick="closeEpubReader()">← Leituras</button>
    <div class="loading-line" style="justify-content:center; padding:60px;"><div class="spinner"></div> Abrindo o livro...</div>`;
  }
  const idx = book.epub.currentChapterIndex;
  const runtime = epubRuntime[book.id];
  if(!runtime.paragraphsCache[idx]){
    loadEpubChapterParagraphs(book.id, idx).then(() => render()).catch(err => {
      console.error('Falha ao carregar capítulo', err);
      showToast('Não consegui carregar esse capítulo.', 'error');
    });
    return `
    <button class="ghost-btn mobile-back-btn" onclick="closeEpubReader()">← Leituras</button>
    <div class="loading-line" style="justify-content:center; padding:60px;"><div class="spinner"></div> Carregando capítulo...</div>`;
  }
  const paragraphs = runtime.paragraphsCache[idx];
  const pages = getEpubPages(book.id, idx);
  // "Anterior" cruzando pra um capítulo ainda não carregado, ou um pulo vindo
  // do sumário/marcador com âncora: só dá pra resolver depois que os
  // parágrafos (e o mapa de âncoras) desse capítulo chegarem — é aqui.
  if(state._epubPendingPageJump){
    const pending = state._epubPendingPageJump;
    state._epubPendingPageJump = null;
    if(pending === 'last'){
      book.epub.currentPageIndex = pages.length - 1;
    } else if(pending.fragment){
      const anchorParagraphIdx = resolveEpubAnchorParagraphIndex(book.id, idx, pending.fragment);
      const targetPage = pages.findIndex(p => anchorParagraphIdx >= p.start && anchorParagraphIdx < p.end);
      book.epub.currentPageIndex = targetPage === -1 ? 0 : targetPage;
    }
    book.epub.pagesInCurrentChapter = pages.length;
    saveData();
    scrollEpubMainToTop();
  }
  book.epub.pagesInCurrentChapter = pages.length;
  const pageIdx = Math.min(book.epub.currentPageIndex || 0, pages.length - 1);
  const page = pages[pageIdx];
  const pageParagraphs = paragraphs.slice(page.start, page.end);
  const atFirstPage = idx === 0 && pageIdx === 0;
  const atLastPage = idx >= book.epub.chapterCount-1 && pageIdx >= pages.length-1;
  // o título mostrado em fonte grande reflete o capítulo de VERDADE mais recente
  // até esse ponto — muitos epubs (principalmente convertidos pelo Calibre)
  // empacotam vários capítulos reais dentro do mesmo arquivo, diferenciados só
  // por âncora, então um único título fixo por arquivo mostraria errado.
  const activeToc = getActiveEpubTocEntry(book.id, book, idx, page.start);
  const chapterTitle = (activeToc && activeToc.title) || (book.epub.chapterTitles && book.epub.chapterTitles[idx]) || `Capítulo ${idx+1}`;
  const prevPage = pageIdx > 0 ? pages[pageIdx-1] : null;
  const prevActiveToc = prevPage ? getActiveEpubTocEntry(book.id, book, idx, prevPage.start) : null;
  const prevChapterTitle = prevPage ? ((prevActiveToc && prevActiveToc.title) || (book.epub.chapterTitles && book.epub.chapterTitles[idx]) || `Capítulo ${idx+1}`) : null;
  const showChapterHeading = pageIdx === 0 || chapterTitle !== prevChapterTitle;
  const totalPages = book.totalPages || 0;
  const currentPage = totalPages ? Math.max(1, Math.round((getEpubReadPercent(book)/100) * totalPages)) : 0;
  // a animação de "virar página" só deve tocar quando o capítulo/página muda de
  // verdade — sem isso, QUALQUER render() enquanto lendo (abrir a tradução de
  // uma palavra, o toast sumir sozinho etc.) recriava o bloco de texto do zero
  // e replicava o fade-in, dando a impressão de que a página tinha recarregado.
  const pageKey = `${book.id}:${idx}:${pageIdx}`;
  const isPageTurn = pageKey !== __lastEpubPageKey;
  __lastEpubPageKey = pageKey;
  return `
  <div style="position:sticky; top:0; z-index:20; background:var(--bg); padding:calc(10px + env(safe-area-inset-top, 0px)) 0 8px 0; border-bottom:1px solid var(--border);">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
      <button class="ghost-btn" onclick="closeEpubReader()">← Leituras</button>
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="icon-btn" title="Sumário" onclick="state.modal={type:'epub-toc', bookId:'${book.id}'}; render();">📑</button>
        <button class="icon-btn" title="Marcadores" onclick="state.modal={type:'epub-nav', bookId:'${book.id}'}; render();">🔖</button>
        ${gearBtn}
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <button class="ghost-btn" ${atFirstPage?'disabled':''} onclick="prevEpubPage('${book.id}')">← Anterior</button>
      <span style="font-size:12px; color:var(--text-muted); text-align:center;">Cap. ${idx+1}/${book.epub.chapterCount} · pág. ${pageIdx+1}/${pages.length}${currentPage ? ` · ~${currentPage} de ${totalPages}` : ''}</span>
      <button class="ghost-btn" ${atLastPage?'disabled':''} onclick="nextEpubPage('${book.id}')">Próximo →</button>
    </div>
  </div>
  <div style="margin:14px 0; text-align:center;">
    <h3 style="margin:0;">${escapeHtml(book.epub.title)}</h3>
    ${book.epub.author ? `<p style="color:var(--text-muted); font-size:12.5px; margin:2px 0 0 0;">${escapeHtml(book.epub.author)}</p>` : ''}
  </div>
  <p style="font-size:11px; color:var(--text-faint); text-align:center; margin:0 0 14px 0;">${book.isEnglish ? '💡 Toque numa palavra pra ver a tradução' : '💡 Selecione um trecho pra guardar como citação ou pedir um cartão'}</p>
  <div class="epub-page ${isPageTurn ? 'epub-page-turn' : ''}" style="max-width:640px; margin:0 auto; line-height:1.9; font-size:15.5px;">
    ${showChapterHeading ? `<h2 style="text-align:center; font-size:23px; margin:6px 0 26px 0;">${escapeHtml(chapterTitle)}</h2>` : ''}
    ${pageParagraphs.length===0 ? `<p style="color:var(--text-faint);">(Capítulo sem texto legível)</p>` : pageParagraphs.map(p => `<p>${book.isEnglish ? renderEpubParagraphClickable(p, book.linkedDeckId||'') : escapeHtml(p)}</p>`).join('')}
  </div>
  ${!book.isEnglish ? `
  <div id="reader-selection-bar" style="display:none; position:fixed; left:0; right:0; bottom:0; background:var(--surface); border-top:1px solid var(--border); padding:12px 20px; align-items:center; justify-content:center; gap:10px; box-shadow:0 -4px 16px rgba(0,0,0,0.2); z-index:50;">
    <button class="ghost-btn" onclick="saveReaderSelectionAsQuote()">📌 Guardar como citação</button>
    <button class="primary-btn" onclick="requestCardFromReaderSelection()">🤖 Pedir cartão à IA</button>
  </div>
  ` : ''}
  `;
}

