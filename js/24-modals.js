/* ============ MODALS ============ */
function openNewDeckModal(){ state.modal = { type:'new-deck', name:'', color: DECK_COLORS[state.decks.length % DECK_COLORS.length], deckType:'standard' }; render(); }
function openApiKeyModal(){ state.modal = { type:'api-key', key: getApiKey(), key2: getApiKey2(), booksKey: getBooksApiKey() }; render(); }
function openAppOptionsModal(){ state.modal={type:'app-options'}; render(); }
function closeModal(){
  if(state.noteCorrection){ state.noteCorrection=null; render(); return; }
  const closingQuickCommand = state.modal?.type==='quick-command';
  state.modal = closingQuickCommand && suspendedEmbeddedNoteChat ? suspendedEmbeddedNoteChat : null;
  suspendedEmbeddedNoteChat = null;
  render();
}
function renderAgendaEventModal(m){
  const event=m.eventId&&state.agendaEvents.find(item=>item.id===m.eventId);
  const completionDisabled=event?.source==='companion';
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:440px;"><h3>${m.eventId?'Editar evento':'Novo evento'}</h3><div class="field"><label>TÍTULO</label><input type="text" autofocus placeholder="Ex.: Revisar capítulo 2" value="${escapeHtml(m.title||'')}" oninput="state.modal.title=this.value"></div><div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;"><div class="field"><label>DATA</label><input type="date" value="${escapeHtml(m.date||'')}" oninput="state.modal.date=this.value"></div><div class="field"><label>INÍCIO</label><input type="time" value="${escapeHtml(m.time||'')}" oninput="state.modal.time=this.value"></div><div class="field"><label>TÉRMINO</label><input type="time" value="${escapeHtml(m.endTime||'')}" oninput="state.modal.endTime=this.value"></div></div><div class="field"><label>OBSERVAÇÃO</label><textarea rows="3" placeholder="Detalhes opcionais" oninput="state.modal.notes=this.value">${escapeHtml(m.notes||'')}</textarea></div><label style="display:flex; align-items:center; gap:8px; padding:9px 10px; border:1px solid var(--border); border-radius:8px; font-size:12px; cursor:${completionDisabled?'default':'pointer'}; opacity:${completionDisabled?'.65':'1'};"><input type="checkbox" ${m.completed?'checked':''} ${completionDisabled?'disabled':''} onchange="state.modal.completed=this.checked"> Marcar este evento como concluído${completionDisabled?' (registrado automaticamente pelo Companion)':''}</label><p style="font-size:11.5px; color:var(--text-faint); margin:0;">Ao informar o início, o término padrão é uma hora depois. Sem data e hora, o item fica em “A fazer”.</p><div class="modal-actions">${m.eventId?`<button class="ghost-btn" style="color:var(--error); margin-right:auto;" onclick="deleteAgendaEvent('${m.eventId}'); closeModal();">Excluir</button>`:''}<button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmAgendaEvent()">Salvar</button></div></div></div>`;
}
function renderAgendaSuggestionsModal(m){
  const rows=(m.suggestions||[]).map(s=>{ const event=state.agendaEvents.find(item=>item.id===s.eventId); if(!event) return ''; const when=s.slot?`${agendaDateFromKey(s.slot.date).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'short'})} às ${s.slot.time}`:'Nenhum horário livre nesta semana'; return `<div style="display:flex; gap:8px; align-items:center; padding:9px; border:1px solid var(--border); border-radius:9px;"><div style="flex:1; min-width:0;"><strong style="font-size:13px;">${escapeHtml(event.title)}</strong><div style="font-size:11px; color:var(--text-faint); margin-top:2px;">Sugestão: ${when}</div></div>${s.slot?`<button class="primary-btn" style="padding:6px 9px; font-size:11px;" onclick="applyAgendaSuggestion('${event.id}','${s.slot.date}','${s.slot.time}')">Agendar</button>`:''}</div>`; }).join('');
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:480px;"><h3>✨ Sugestões de horário</h3><p style="margin:0; font-size:12px; color:var(--text-faint);">Usei os próximos horários livres (9h, 14h e 19h) desta semana. Você continua no controle: nada é agendado sem tocar em “Agendar”.</p><div style="display:flex; flex-direction:column; gap:7px; max-height:48vh; overflow-y:auto;">${rows||`<p style="color:var(--text-faint); font-size:13px;">Não há tarefas sem dia para sugerir nesta semana.</p>`}</div><div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Fechar</button></div></div></div>`;
}
function renderRoutineActionModal(m){
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:390px;"><h3>Nova atividade de rotina</h3><p style="margin:0; color:var(--text-faint); font-size:12px;">Ela aparecerá como um atalho para iniciar e concluir com um toque.</p><div class="field"><label>NOME</label><input type="text" autofocus placeholder="Ex.: Passear com o cachorro" value="${escapeHtml(m.title||'')}" oninput="state.modal.title=this.value"></div><div class="field"><label>ÍCONE</label><input type="text" maxlength="4" placeholder="🐶" value="${escapeHtml(m.icon||'')}" oninput="state.modal.icon=this.value"></div><div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmRoutineAction()">Criar</button></div></div></div>`;
}
function renderRoutineCatchupModal(m){
  const from=new Date(m.from).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}), to=new Date(m.to).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  return `<div class="modal-overlay"><div class="modal" style="width:min(520px,calc(100vw - 24px));"><h3>✨ Como foi seu tempo?</h3><p style="margin:0; color:var(--text-faint); font-size:12.5px; line-height:1.5;">Faz mais de duas horas desde o último registro. Conte o que fez entre ${from} e ${to}; a IA organizará isso como atividades concluídas na Agenda.</p><textarea rows="6" autofocus placeholder="Ex.: trabalhei até 12h, almocei e fiz uma caminhada de 20 minutos." oninput="state.modal.input=this.value">${escapeHtml(m.input||'')}</textarea><div class="modal-actions"><button class="ghost-btn" onclick="skipRoutineCatchup()">Pular por agora</button><button class="primary-btn" onclick="submitRoutineCatchup()" ${m.sending?'disabled':''}>${m.sending?'Organizando...':'Registrar com IA'}</button></div></div></div>`;
}
function renderOutlineColumnModal(m){
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:390px;"><h3>${m.columnId?'Editar ato':'Novo ato'}</h3><div class="field"><label>NOME DO ATO / COLUNA</label><input type="text" autofocus placeholder="Ex.: Ato II — Confronto" value="${escapeHtml(m.name||'')}" oninput="state.modal.name=this.value" onkeydown="if(event.key==='Enter') confirmOutlineColumn()"></div><div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmOutlineColumn()">Salvar</button></div></div></div>`;
}
function renderOutlineCardModal(m){
  const notes=state.notesItems.filter(item=>item.type==='note');
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:min(620px,calc(100vw - 24px)); max-height:86vh; overflow-y:auto;"><h3>${m.cardId?'Editar capítulo':'Novo capítulo'}</h3><div class="field"><label>TÍTULO DO CAPÍTULO</label><input type="text" autofocus placeholder="Ex.: A chegada à cidade" value="${escapeHtml(m.title||'')}" oninput="state.modal.title=this.value"></div><div class="field"><label>RESUMO</label><textarea rows="3" placeholder="O que acontece neste capítulo?" oninput="state.modal.summary=this.value">${escapeHtml(m.summary||'')}</textarea></div><div class="field"><label>IDEIAS / OBSERVAÇÕES</label><textarea rows="3" placeholder="Cenas, diálogos, conflitos, referências…" oninput="state.modal.ideas=this.value">${escapeHtml(m.ideas||'')}</textarea></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;"><div class="field"><label>STATUS</label><select onchange="state.modal.status=this.value"><option value="todo" ${m.status==='todo'?'selected':''}>Para escrever</option><option value="writing" ${m.status==='writing'?'selected':''}>Escrevendo</option><option value="ready" ${m.status==='ready'?'selected':''}>Pronto</option></select></div><div class="field"><label>ATO</label><select onchange="state.modal.columnId=this.value">${(state.notesItems.find(item=>item.id===m.outlineId)?.outline?.columns||[]).map(column=>`<option value="${column.id}" ${m.columnId===column.id?'selected':''}>${escapeHtml(column.name)}</option>`).join('')}</select></div></div><div style="padding:10px; border:1px solid var(--border); border-radius:10px;"><div style="font-size:11px; font-weight:700; color:var(--text-faint); margin-bottom:8px;">VÍNCULO COM A NOTA</div><div class="field"><label>NOTA EM QUE O CAPÍTULO ESTÁ SENDO ESCRITO</label><select onchange="state.modal.linkedNoteId=this.value"><option value="">Não vincular agora</option>${notes.map(note=>`<option value="${note.id}" ${m.linkedNoteId===note.id?'selected':''}>${escapeHtml(note.name)}</option>`).join('')}</select></div><div class="field" style="margin-bottom:0;"><label>TEXTO INICIAL DO CAPÍTULO</label><input type="text" placeholder="Ex.: Capítulo 4 — A chegada" value="${escapeHtml(m.anchor||'')}" oninput="state.modal.anchor=this.value"><div style="font-size:10.5px; color:var(--text-faint); margin-top:4px;">Ao abrir pelo card, o Letther B buscará este texto e levará ao ponto exato.</div></div></div><div class="field"><label>TÓPICOS / CHECKLIST</label><textarea rows="5" placeholder="Um tópico por linha&#10;Apresentar a personagem&#10;Revelar o conflito" oninput="state.modal.checklistText=this.value">${escapeHtml(m.checklistText||'')}</textarea></div><div class="modal-actions">${m.cardId?`<button class="ghost-btn" style="color:var(--error); margin-right:auto;" onclick="deleteOutlineCard('${m.outlineId}','${m.cardId}'); closeModal();">Excluir</button>`:''}<button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmOutlineCard()">Salvar capítulo</button></div></div></div>`;
}
function renderGlobalAiChatModal(m){
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:min(560px,calc(100vw - 24px)); max-height:86vh; display:flex; flex-direction:column;"><div style="display:flex; justify-content:space-between; align-items:center;"><h3>✨ Chat IA</h3><button class="icon-btn" onclick="closeModal()">✕</button></div><p style="font-size:12px; color:var(--text-faint); margin:0;">Posso ajudar com notas, agenda, leituras e baralhos.</p><div style="flex:1; min-height:220px; max-height:52vh; overflow-y:auto; display:flex; flex-direction:column; gap:9px; padding:6px 2px;">${m.messages.length?m.messages.map(msg=>`<div style="align-self:${msg.role==='user'?'flex-end':'flex-start'}; max-width:88%; padding:9px 12px; border-radius:11px; background:${msg.role==='user'?'var(--accent-soft)':'var(--surface-2)'}; color:${msg.error?'var(--error)':'var(--text)'}; white-space:pre-wrap; font-size:13px; line-height:1.45;">${escapeHtml(msg.text)}${msg.actions&&msg.actions.length?`<div style="margin-top:6px; font-size:11px; color:var(--text-muted);">${msg.actions.map(a=>`✓ ${escapeHtml(a)}`).join('<br>')}</div>`:''}</div>`).join(''):`<p style="color:var(--text-faint); text-align:center; font-size:13px;">Peça para criar uma nota, organizar sua agenda ou abrir uma área do app.</p>`}</div><div style="display:flex; gap:7px;"><textarea id="global-ai-input" rows="3" style="flex:1; resize:none; min-height:72px;" placeholder="O que você quer fazer?" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendGlobalAiMessage()}" oninput="state.modal.input=this.value">${escapeHtml(m.input||'')}</textarea><button class="primary-btn" onclick="sendGlobalAiMessage()" ${m.sending?'disabled':''}>Enviar</button></div></div></div>`;
}
function renderAppOptionsModal(){
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:420px;">
    <h3>Opções do Letther B</h3>
    <p style="margin:0 0 14px; font-size:12px; color:var(--text-faint);">Backup, aparência e conexões da sua conta.</p>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <button class="ghost-btn" onclick="exportAllBackup(); closeModal();">⇩ Exportar backup completo</button>
      <button class="ghost-btn" onclick="triggerImportBackup(); closeModal();">⇧ Importar backup</button>
      ${(!hasClaudeStorage() && hasFileSystemAccess()) ? `<button class="ghost-btn" onclick="saveToFileSystem(); closeModal();">💾 ${state.fileHandle?'Sincronizar arquivo local':'Salvar em arquivo local'}</button><button class="ghost-btn" onclick="openFromFileSystem(); closeModal();">📂 Abrir arquivo local</button>` : ''}
      <button class="ghost-btn" onclick="openApiKeyModal()">🔑 ${getApiKey()?'Gerenciar chaves de API':'Configurar chaves de API'}</button>
      <button class="ghost-btn" onclick="requestPwaInstall()">📲 ${state.pwaInstallAvailable?'Instalar o Letther B':'Como instalar no celular'}</button>
      <button class="ghost-btn" onclick="toggleTheme(); closeModal();">${getTheme()==='light'?'🌙 Usar tema escuro':'☀️ Usar tema claro'}</button>
      ${hasFirebaseUser() ? `<button class="ghost-btn" style="color:var(--error);" onclick="signOutUser(); closeModal();">Sair da conta</button>` : ''}
    </div>
    <div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Fechar</button></div>
  </div></div>`;
}
function renderModal(overrideModal){
  const m = overrideModal || state.modal;
  if(m.type === 'spaced-repetition') return renderSpacedRepetitionModal(m);
  if(m.type === 'active-outline-view') return renderActiveOutlineViewModal(m);
  if(m.type === 'agenda-event') return renderAgendaEventModal(m);
  if(m.type === 'agenda-suggestions') return renderAgendaSuggestionsModal(m);
  if(m.type === 'routine-action') return renderRoutineActionModal(m);
  if(m.type === 'routine-catchup') return renderRoutineCatchupModal(m);
  if(m.type === 'outline-column') return renderOutlineColumnModal(m);
  if(m.type === 'outline-card') return renderOutlineCardModal(m);
  if(m.type === 'global-ai-chat') return renderGlobalAiChatModal(m);
  if(m.type === 'api-key') return renderApiKeyModal(m);
  if(m.type === 'app-options') return renderAppOptionsModal();
  if(m.type === 'photo-crop') return renderPhotoCropModal(m);
  if(m.type === 'photo-import') return renderPhotoImportModal(m);
  if(m.type === 'web-flashcards') return renderWebFlashcardsModal(m);
  if(m.type === 'add-book') return renderAddBookModal(m);
  if(m.type === 'quote-capture') return renderQuoteCaptureModal(m);
  if(m.type === 'word-lookup') return renderWordLookupModal(m);
  if(m.type === 'passage-card') return renderPassageCardModal(m);
  if(m.type === 'create-deck-for-book') return renderCreateDeckForBookModal(m);
  if(m.type === 'epub-toc') return renderEpubTocModal(m);
  if(m.type === 'epub-nav') return renderEpubNavModal(m);
  if(m.type === 'confirm') return renderConfirmModal(m);
  if(m.type === 'new-note-item') return renderNewNoteItemModal(m);
  if(m.type === 'note-page-settings') return renderNotePageSettingsModal(m);
  if(m.type === 'quick-command') return renderQuickCommandModal(m);
  if(m.type === 'rename-note-item') return renderRenameNoteItemModal(m);
  if(m.type === 'insert-note-image') return renderInsertNoteImageModal(m);
  if(m.type === 'note-passage-card') return renderNotePassageCardModal(m);
  if(m.type === 'note-correction') return renderNoteCorrectionModal(m);
  if(m.type === 'note-comment-create') return renderNoteCommentCreateModal(m);
  if(m.type === 'note-toc') return renderNoteTocModal(m);
  if(m.type === 'note-chat') return renderNoteChatModal(m);
  if(m.type === 'note-paste-card') return renderNotePasteCardModal(m);
  if(m.type === 'note-paste-correction') return renderNotePasteCorrectionModal(m);
  if(m.type === 'note-opinion') return renderNoteOpinionModal(m);
  if(m.type === 'note-paste-opinion') return renderNotePasteOpinionModal(m);
  if(m.type === 'insert-rich-link') return renderInsertRichLinkModal(m);
  if(m.type === 'insert-wiki-link-rich') return renderInsertWikiLinkRichModal(m);
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Novo baralho</h3>
      <div class="field">
        <label>NOME DO BARALHO</label>
        <input type="text" id="deck-name-input" placeholder="Ex: Vocabulário de Espanhol" value="${escapeHtml(m.name)}" onkeyup="state.modal.name=this.value">
      </div>
      <div class="field">
        <label>TIPO DE BARALHO</label>
        <div style="display:flex; gap:8px;">
          <button type="button" class="ghost-btn" style="flex:1; ${m.deckType==='standard' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.deckType='standard'; render();">Padrão<br><span style="font-weight:400; font-size:11px; opacity:0.8;">pergunta e resposta</span></button>
          <button type="button" class="ghost-btn" style="flex:1; ${m.deckType==='language' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.deckType='language'; render();">Idioma<br><span style="font-weight:400; font-size:11px; opacity:0.8;">só o termo</span></button>
        </div>
      </div>
      <div class="field">
        <label>COR</label>
        <div class="color-picker">
          ${DECK_COLORS.map(c=>`<div class="color-dot ${m.color===c?'selected':''}" style="background:${c}" onclick="state.modal.color='${c}'; render();"></div>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmNewDeck()">Criar baralho</button>
      </div>
    </div>
  </div>`;
}
function renderConfirmModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) cancelPendingAction()">
    <div class="modal" style="width:380px;">
      <h3>Confirmar</h3>
      <p style="font-size:13.5px; color:var(--text-muted); line-height:1.5; margin:0;">${escapeHtml(m.message)}</p>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="cancelPendingAction()">Cancelar</button>
        <button class="primary-btn" style="background:var(--error); border-color:var(--error);" onclick="confirmPendingAction()">${escapeHtml(m.confirmLabel)}</button>
      </div>
    </div>
  </div>`;
}
function renderNewNoteItemModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>${m.kind==='folder' ? 'Nova pasta' : (m.kind==='outline' ? 'Nova escaleta' : 'Nova nota')}</h3>
      <div class="field">
        <label>TIPO</label>
        <div style="display:flex; gap:8px;">
          <button type="button" class="ghost-btn" style="flex:1; ${m.kind==='note' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.kind='note'; render();">📄 Nota</button>
          <button type="button" class="ghost-btn" style="flex:1; ${m.kind==='outline' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.kind='outline'; render();">🧩 Escaleta</button>
          <button type="button" class="ghost-btn" style="flex:1; ${m.kind==='folder' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.kind='folder'; render();">📁 Pasta</button>
        </div>
      </div>
      <div class="field">
        <label>NOME</label>
        <input type="text" autofocus placeholder="${m.kind==='folder' ? 'Ex: Anotações de espanhol' : (m.kind==='outline' ? 'Ex: Romance — escaleta' : 'Ex: Verbos irregulares')}" value="${escapeHtml(m.name)}" onkeyup="state.modal.name=this.value; if(event.key==='Enter') confirmCreateNoteItem();">
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmCreateNoteItem()">Criar</button>
      </div>
    </div>
  </div>`;
}
function renderNotePageSettingsModal(m){
  const s = m.settings;
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:440px;">
    <h3>Configuração de página</h3>
    <div class="card-form page-settings" style="padding:0; border:0; background:none;">
    <div class="field"><label>FORMATO DA PÁGINA</label><select onchange="const p=NOTE_PAGE_PRESETS[this.value]||NOTE_PAGE_PRESETS.book; Object.assign(state.modal.settings,{preset:p.key,width:p.width,height:p.height,unit:'cm'});"><option value="book" ${s.preset==='book'?'selected':''}>Livro — 15 × 21 cm</option><option value="a4" ${s.preset==='a4'?'selected':''}>A4 — 21 × 29,7 cm</option><option value="a3" ${s.preset==='a3'?'selected':''}>A3 — 29,7 × 42 cm</option></select></div>
    <div class="field"><label>MARGEM DE SEGURANÇA (cm)</label><input type="text" inputmode="decimal" value="${s.margin}" oninput="state.modal.settings.margin=this.value"></div>
    <div class="field" style="margin-top:10px;"><label><input type="checkbox" ${s.pageNumbers?'checked':''} onchange="state.modal.settings.pageNumbers=this.checked"> Mostrar número de página</label><select style="margin-top:7px;" onchange="state.modal.settings.pageNumberPosition=this.value"><option value="left" ${s.pageNumberPosition==='left'?'selected':''}>Inferior esquerdo</option><option value="center" ${s.pageNumberPosition==='center'?'selected':''}>Inferior central</option><option value="right" ${s.pageNumberPosition==='right'?'selected':''}>Inferior direito</option><option value="book" ${s.pageNumberPosition==='book'?'selected':''}>Alternado como livro</option></select></div>
    <div class="field" style="margin-top:10px;"><label>PÁGINAS SEM NÚMERO</label><input type="text" placeholder="Ex.: 1, 3, 8-10" value="${escapeHtml(s.hiddenPages)}" oninput="state.modal.settings.hiddenPages=this.value"></div></div>
    <div class="modal-actions"><button class="ghost-btn" onclick="closeModal()">Cancelar</button><button class="primary-btn" onclick="confirmNotePageSettings()">Salvar</button></div>
  </div></div>`;
}
function renderQuickCommandModal(m){
  const q=(m.query||'').trim().toLowerCase();
  const matches=q ? state.notesItems.filter(n=>n.type==='note' && n.name.toLowerCase().includes(q)).slice(0,6) : [];
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:620px; padding:14px; margin-top:10vh;"><input id="quick-command-input" type="text" autofocus placeholder="Digite: chat, nota ou o nome de uma nota…" value="${escapeHtml(m.query)}" style="width:100%; font-size:17px; padding:13px 15px;" oninput="state.modal.query=this.value; render();" onkeydown="if(event.key==='Enter'){runQuickCommand(state.modal.query)}">
  <div style="font-size:11px; color:var(--text-faint); padding:9px 4px 5px;">⌥ Alt + Espaço · comandos rápidos</div>
  ${!q ? `<div style="display:flex; gap:7px;"><button class="ghost-btn" onclick="runQuickCommand('chat')">💬 Chat</button><button class="ghost-btn" onclick="runQuickCommand('nota')">📄 Nova nota</button></div>` : ''}
  ${matches.map(n=>`<button class="ghost-btn" style="display:block; width:100%; text-align:left; margin-top:5px;" onclick="runQuickCommand('${escapeHtml(n.name).replace(/'/g,'&#39;')}')"><span class="note-color-dot" style="display:inline-block; background:${escapeHtml(n.iconColor||'#F5A623')};"></span> ${escapeHtml(n.name)}</button>`).join('')}
  ${q && !matches.length && q!=='chat' && q!=='nota' ? `<div style="font-size:12px; color:var(--text-faint); padding:8px 4px;">Nenhuma nota encontrada.</div>`:''}</div></div>`;
}
function renderRenameNoteItemModal(m){
  const item = state.notesItems.find(n=>n.id===m.id);
  const icons = ['📁','📚','🗂️','💼','⭐','🏷️'];
  const colors = ['#F5A623','#FB7185','#A78BFA','#60A5FA','#34D399','#F472B6','#FACC15','#94A3B8'];
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Renomear</h3>
      <div class="field">
        <label>NOME</label>
        <input type="text" autofocus value="${escapeHtml(m.name)}" onkeyup="state.modal.name=this.value; if(event.key==='Enter') confirmRenameNoteItem();">
      </div>
      <div class="field" style="margin-top:10px;">
        <label>${item&&item.type==='folder' ? 'ÍCONE' : 'COR DA NOTA'}</label>
        <div style="display:flex; gap:7px; flex-wrap:wrap;">
          ${item&&item.type==='folder'
            ? icons.map(icon=>`<button type="button" class="ghost-btn" style="padding:6px 9px; font-size:17px; ${item.icon===icon?'border-color:var(--accent); background:var(--accent-soft);':''}" onclick="setNoteItemIcon('${m.id}','${icon}')">${icon}</button>`).join('')
            : colors.map(color=>`<button type="button" class="ghost-btn" title="${color}" style="width:30px; height:30px; padding:0; border-radius:50%; background:${color}; border:${item&&item.iconColor===color?'3px solid var(--text)':'2px solid transparent'};" onclick="setNoteItemColor('${m.id}','${color}')"></button>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmRenameNoteItem()">Salvar</button>
      </div>
    </div>
  </div>`;
}
function renderInsertNoteImageModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Imagem por link</h3>
      <div class="field">
        <label>URL DA IMAGEM</label>
        <input type="text" autofocus placeholder="https://..." value="${escapeHtml(m.url)}" onkeyup="state.modal.url=this.value">
      </div>
      <div class="field">
        <label>TEXTO ALTERNATIVO (OPCIONAL)</label>
        <input type="text" placeholder="Ex: diagrama do capítulo 3" value="${escapeHtml(m.alt)}" onkeyup="state.modal.alt=this.value">
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmInsertNoteImage()">Inserir</button>
      </div>
    </div>
  </div>`;
}
function renderNotePassageCardModal(m){
  if(m.status === 'loading'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:420px;">
        <h3>Gerando cartão…</h3>
        <p style="font-size:11.5px; color:var(--text-faint);">"${escapeHtml(m.passage.length>200 ? m.passage.slice(0,200)+'…' : m.passage)}"</p>
        <div class="loading-line"><div class="spinner"></div> A IA está lendo o trecho...</div>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:420px;">
        <h3>Não deu pra gerar o cartão</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  const standardDecks = state.decks.filter(d => d.type !== 'language');
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px; max-height:86vh; overflow-y:auto;">
      <h3>Revisar cartão</h3>
      <p style="font-size:11.5px; color:var(--text-faint); margin:0 0 10px 0;">Trecho: "${escapeHtml(m.passage.length>200 ? m.passage.slice(0,200)+'…' : m.passage)}"</p>
      <div class="field">
        <label>PERGUNTA</label>
        <textarea rows="2" onkeyup="state.modal.card.front=this.value">${escapeHtml(m.card.front)}</textarea>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>RESPOSTA</label>
        <textarea rows="2" onkeyup="state.modal.card.back=this.value">${escapeHtml(m.card.back)}</textarea>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>NOTA</label>
        <textarea rows="2" onkeyup="state.modal.card.note=this.value">${escapeHtml(m.card.note)}</textarea>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>ADICIONAR AO BARALHO</label>
        <select onchange="selectNotePassageCardDeck(this.value)">
          <option value="" ${!m.deckId?'selected':''}>Escolher baralho...</option>
          ${standardDecks.map(d=>`<option value="${d.id}" ${m.deckId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}
          <option value="__new__">＋ Novo baralho...</option>
        </select>
      </div>
      ${m.creatingNewDeck ? `
      <div class="field" style="margin-top:10px;">
        <label>NOME DO NOVO BARALHO</label>
        <div style="display:flex; gap:8px;">
          <input type="text" style="flex:1;" value="${escapeHtml(m.newDeckName)}" onkeyup="state.modal.newDeckName=this.value" placeholder="Ex: nome do caderno">
          <button type="button" class="ghost-btn" onclick="confirmCreateDeckInlineForNote()">Criar</button>
        </div>
      </div>
      ` : ''}
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmNotePassageCard()" ${!m.deckId?'disabled':''}>Adicionar cartão</button>
      </div>
    </div>
  </div>`;
}
function renderNoteCorrectionModal(m){
  if(m.status === 'loading'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:480px;">
        <h3>Corrigindo…</h3>
        <div class="loading-line"><div class="spinner"></div> A IA está revisando o texto...</div>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:480px;">
        <h3>Não deu pra corrigir</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  const noChange = m.original.trim() === m.corrected.trim();
  const diff = diffTextParts(m.original, m.corrected);
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:520px; max-height:86vh; overflow-y:auto;">
      <h3>Revisar correção</h3>
      ${noChange ? `<p style="font-size:12.5px; color:var(--text-faint); margin:0 0 8px 0;">A IA não encontrou nada pra corrigir nesse trecho.</p>` : ''}
      <div class="field">
        <label>ANTES</label>
        <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.6; white-space:pre-wrap;">${diff.oldParts.map(p=>p.c?`<span style="background:var(--error-soft); color:var(--error); text-decoration:line-through;">${escapeHtml(p.t)}</span>`:escapeHtml(p.t)).join('')}</div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>DEPOIS</label>
        <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.6; white-space:pre-wrap;">${diff.newParts.map(p=>p.c?`<span style="background:var(--success-soft); color:var(--success); font-weight:600;">${escapeHtml(p.t)}</span>`:escapeHtml(p.t)).join('')}</div>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Descartar</button>
        <button class="primary-btn" onclick="confirmNoteCorrection()" ${noChange?'disabled':''}>Aceitar correção</button>
      </div>
    </div>
  </div>`;
}
function renderNoteCommentCreateModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px;">
      <h3>📝 Comentário — testar uma mudança</h3>
      <div class="field">
        <label>TRECHO ORIGINAL</label>
        <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-size:13.5px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(m.original)}</div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>TEXTO NOVO (provisório — não altera a nota ainda)</label>
        <textarea rows="3" autofocus onkeyup="state.modal.proposed=this.value">${escapeHtml(m.proposed)}</textarea>
      </div>
      <p style="font-size:11.5px; color:var(--text-faint); margin:8px 0 0 0;">O trecho fica destacado em verde na nota. Você decide depois, no menu de comentários, se aplica ou descarta.</p>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmCreateNoteComment()">Criar comentário</button>
      </div>
    </div>
  </div>`;
}
function renderNoteTocModal(m){
  const note = state.notesItems.find(n=>n.id===m.noteId);
  const headings = note ? getNoteHeadings(note) : [];
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="max-width:440px; max-height:80vh; overflow-y:auto;">
      <h3>📑 Sumário</h3>
      ${headings.length ? `
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:10px;">
          ${headings.map((h, i) => `
            <button type="button" class="ghost-btn" style="text-align:left; justify-content:flex-start; width:100%; padding-left:${10 + (h.level-1)*16}px; font-size:${h.level===1?'14px':h.level===2?'13px':'12.5px'}; ${h.level===1?'font-weight:600;':''}" onclick="jumpToNoteHeadingFromModal(${i})">${escapeHtml(h.text)}</button>
          `).join('')}
        </div>
      ` : `<p style="color:var(--text-faint); font-size:13px; margin-top:10px;">Essa nota ainda não tem nenhum título (H1, H2 ou H3) — adicione um pra ele aparecer aqui.</p>`}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="ghost-btn" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  </div>`;
}
function renderNoteChatModal(m, embedded){
  const note = state.notesItems.find(n=>n.id===m.noteId);
  return `
  ${embedded ? `<aside class="desktop-note-chat" style="width:${state.notesChatWidth||340}px;">` : `<div class="modal-overlay" onclick="if(event.target===this) closeModal()"><div class="modal" style="width:520px; max-height:80vh; display:flex; flex-direction:column;">`}
      <h3>✨ Agente da nota — "${escapeHtml(note ? note.name : '')}"</h3>
      <p style="font-size:11.5px; color:var(--text-faint); margin:-4px 0 9px;">Pode criar notas, pastas e flashcards, além de editar livremente esta nota. Toda edição pode ser desfeita no editor.</p>
      ${renderNoteConversationLibrary(m, 'chat')}
      <div class="note-chat-messages" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding:6px 2px; min-height:200px; max-height:50vh;">
        ${m.messages.length === 0 ? `<p style="color:var(--text-faint); font-size:12.5px; text-align:center; margin-top:20px;">Peça algo como “resuma esta conversa em uma nova nota”, “crie flashcards deste texto” ou “reescreva a introdução”.</p>` : ''}
        ${m.messages.map(msg => `
        <div style="align-self:${msg.role==='user'?'flex-end':'flex-start'}; max-width:85%; background:${msg.role==='user'?'var(--accent-soft)':'var(--surface-2)'}; color:${msg.error?'var(--error)':'var(--text)'}; border-radius:12px; padding:9px 13px; font-size:13.5px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(msg.text)}${msg.actions&&msg.actions.length ? `<div style="margin-top:8px; padding-top:7px; border-top:1px solid var(--border); font-size:11.5px; color:var(--text-muted); white-space:normal;">${msg.actions.map(action=>`✓ ${escapeHtml(action)}`).join('<br>')}</div>` : ''}</div>
        `).join('')}
        ${m.sending ? `<div class="loading-line" style="align-self:flex-start;"><div class="spinner"></div> Pensando...</div>` : ''}
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <textarea id="note-chat-input" rows="${embedded ? 4 : 3}" placeholder="Peça uma ação ou faça uma pergunta..." style="flex:1; resize:none; min-height:${embedded ? '92px' : '72px'};" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendNoteChatMessage(); }" onkeyup="state.modal.input=this.value">${escapeHtml(m.input)}</textarea>
        <button class="primary-btn" onclick="sendNoteChatMessage()" ${m.sending?'disabled':''}>Enviar</button>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">${embedded?'Ocultar chat':'Fechar'}</button>
      </div>
  ${embedded ? `</aside>` : `</div></div>`}`;
}
function renderNotePasteCardModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px;">
      <h3>📌 Criar cartão a partir de um texto colado</h3>
      <p style="font-size:12px; color:var(--text-faint); margin:0 0 6px 0;">Cole abaixo o trecho que você copiou (por exemplo, selecionado no celular) e a IA monta a pergunta e resposta.</p>
      <div class="field">
        <textarea rows="6" autofocus placeholder="Cole o texto aqui..." onkeyup="state.modal.text=this.value">${escapeHtml(m.text)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmNotePasteCard()">Gerar cartão</button>
      </div>
    </div>
  </div>`;
}
function renderNotePasteCorrectionModal(m){
  if(m.status === 'loading'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:480px;">
        <h3>Corrigindo…</h3>
        <div class="loading-line"><div class="spinner"></div> A IA está revisando o texto...</div>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:480px;">
        <h3>Não deu pra corrigir</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  if(m.status === 'review'){
    const noChange = m.original.trim() === m.corrected.trim();
    const diff = diffTextParts(m.original, m.corrected);
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:520px; max-height:86vh; overflow-y:auto;">
        <h3>Revisar correção</h3>
        ${noChange ? `<p style="font-size:12.5px; color:var(--text-faint); margin:0 0 8px 0;">A IA não encontrou nada pra corrigir nesse trecho.</p>` : ''}
        <div class="field">
          <label>ANTES</label>
          <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.6; white-space:pre-wrap;">${diff.oldParts.map(p=>p.c?`<span style="background:var(--error-soft); color:var(--error); text-decoration:line-through;">${escapeHtml(p.t)}</span>`:escapeHtml(p.t)).join('')}</div>
        </div>
        <div class="field" style="margin-top:10px;">
          <label>DEPOIS</label>
          <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.6; white-space:pre-wrap;">${diff.newParts.map(p=>p.c?`<span style="background:var(--success-soft); color:var(--success); font-weight:600;">${escapeHtml(p.t)}</span>`:escapeHtml(p.t)).join('')}</div>
        </div>
        <p style="font-size:11.5px; color:var(--text-faint); margin:8px 0 0 0;">Copie o texto corrigido e cole na nota, no lugar do trecho original.</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
          <button class="primary-btn" onclick="copyPasteCorrectionResult()">📋 Copiar corrigido</button>
        </div>
      </div>
    </div>`;
  }
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px;">
      <h3>✏️ Corrigir um texto colado</h3>
      <p style="font-size:12px; color:var(--text-faint); margin:0 0 6px 0;">Cole abaixo o trecho que você copiou e a IA corrige só ortografia, pontuação e gramática.</p>
      <div class="field">
        <textarea rows="6" autofocus placeholder="Cole o texto aqui..." onkeyup="state.modal.text=this.value">${escapeHtml(m.text)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmNotePasteCorrection()">Corrigir</button>
      </div>
    </div>
  </div>`;
}
function renderNoteOpinionModal(m){
  if(m.status === 'loading'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:480px;">
        <h3>Lendo o trecho…</h3>
        <div class="loading-line"><div class="spinner"></div> A IA está formando uma opinião...</div>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:480px;">
        <h3>Não deu pra opinar</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  const canEdit = m.source === 'textarea' || m.source === 'richtext';
  const editActionBtn = idx => canEdit
    ? `<button class="ghost-btn" style="padding:6px 10px; font-size:11.5px;" onclick="applyNoteOpinionEdit(${idx})">✅ Aplicar na nota</button>`
    : `<button class="ghost-btn" style="padding:6px 10px; font-size:11.5px;" onclick="copyNoteOpinionEdit(${idx})">📋 Copiar texto revisado</button>`;
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:520px; max-height:80vh; display:flex; flex-direction:column;">
      <h3>💭 O que a IA achou</h3>
      <p style="font-size:11.5px; color:var(--text-faint); margin:0 0 10px 0;">Trecho: "${escapeHtml(m.passage.length>200 ? m.passage.slice(0,200)+'…' : m.passage)}"</p>
      ${m.noteId ? renderNoteConversationLibrary(m, 'suggestion') : ''}
      <div class="note-opinion-messages" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding:2px; min-height:120px; max-height:46vh;">
        <div style="align-self:flex-start; max-width:92%; background:var(--surface-2); border-radius:12px; padding:9px 13px; font-size:13.5px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(m.opinion)}</div>
        ${m.messages.map((msg, idx) => `
        <div style="align-self:${msg.role==='user'?'flex-end':'flex-start'}; max-width:92%; display:flex; flex-direction:column; gap:6px;">
          <div style="background:${msg.role==='user'?'var(--accent-soft)':'var(--surface-2)'}; color:${msg.error?'var(--error)':'var(--text)'}; border-radius:12px; padding:9px 13px; font-size:13.5px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(msg.text)}</div>
          ${msg.proposedEdit ? `
          <div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-size:13px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(msg.proposedEdit)}</div>
          <div>${editActionBtn(idx)}</div>
          ` : ''}
        </div>
        `).join('')}
        ${m.sending ? `<div class="loading-line" style="align-self:flex-start;"><div class="spinner"></div> Pensando...</div>` : ''}
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <textarea id="note-opinion-chat-input" rows="1" placeholder="Converse sobre isso, ou peça pra reescrever..." style="flex:1; resize:none;" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendNoteOpinionChatMessage(); }" onkeyup="state.modal.input=this.value">${escapeHtml(m.input)}</textarea>
        <button class="primary-btn" onclick="sendNoteOpinionChatMessage()" ${m.sending?'disabled':''}>Enviar</button>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  </div>`;
}
function renderNotePasteOpinionModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px;">
      <h3>💭 Pedir a opinião da IA sobre um texto colado</h3>
      <p style="font-size:12px; color:var(--text-faint); margin:0 0 6px 0;">Cole abaixo o trecho e a IA dá uma opinião sincera, com sugestões se tiver.</p>
      <div class="field">
        <textarea rows="6" autofocus placeholder="Cole o texto aqui..." onkeyup="state.modal.text=this.value">${escapeHtml(m.text)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmNotePasteOpinion()">Pedir opinião</button>
      </div>
    </div>
  </div>`;
}
function renderInsertRichLinkModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Inserir link</h3>
      <div class="field">
        <label>URL</label>
        <input type="text" autofocus placeholder="https://..." value="${escapeHtml(m.url)}" onkeyup="state.modal.url=this.value">
      </div>
      <div class="field">
        <label>TEXTO DO LINK</label>
        <input type="text" placeholder="Ex: veja mais aqui" value="${escapeHtml(m.text)}" onkeyup="state.modal.text=this.value">
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmInsertRichLink()">Inserir</button>
      </div>
    </div>
  </div>`;
}
function renderInsertWikiLinkRichModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Link pra outra nota</h3>
      <div class="field">
        <label>NOME DA NOTA</label>
        <input type="text" autofocus placeholder="Ex: Capítulo 2" value="${escapeHtml(m.name)}" onkeyup="state.modal.name=this.value; if(event.key==='Enter') confirmInsertWikiLinkRich();">
      </div>
      <p style="font-size:11.5px; color:var(--text-faint); margin:0;">Se a nota ainda não existir, ela é criada ao clicar no link.</p>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmInsertWikiLinkRich()">Inserir</button>
      </div>
    </div>
  </div>`;
}
function renderApiKeyModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Chaves de API</h3>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:0;">
        Os recursos de IA (gerar frases, alternativas, verificar respostas, cartões a partir de foto) usam o Google Gemini e precisam de uma chave sua pra funcionar. Ela é enviada só à API do Google e fica salva junto com seus baralhos, sincronizada automaticamente com qualquer aparelho onde você fizer login com esta mesma conta. Crie a sua grátis em <strong>aistudio.google.com</strong> (Get API key).
      </p>
      <div class="field">
        <label>CHAVE DO GEMINI</label>
        <input type="text" id="api-key-input" placeholder="Cole sua chave aqui" value="${escapeHtml(m.key||'')}" onkeyup="state.modal.key=this.value">
      </div>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:14px 0 0 0;">
        <strong>Opcional</strong> — chave de uma SEGUNDA conta Google, usada automaticamente como reforço quando a chave principal estourar a cota (soma o limite gratuito das duas contas). Cada chamada também tenta um modelo alternativo antes de trocar de chave.
      </p>
      <div class="field">
        <label>CHAVE ALTERNATIVA DO GEMINI (opcional)</label>
        <input type="text" id="api-key-2-input" placeholder="Cole a chave da segunda conta aqui" value="${escapeHtml(m.key2||'')}" onkeyup="state.modal.key2=this.value">
      </div>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:14px 0 0 0;">
        <strong>Opcional</strong> — a busca de livros em "Leituras" usa a API do Google Books sem chave por padrão, que tem uma cota compartilhada e pode falhar em horários de pico. Configurar sua própria chave (grátis, em <strong>console.cloud.google.com</strong>) garante uma cota só sua.
      </p>
      <div class="field">
        <label>CHAVE DO GOOGLE BOOKS (opcional)</label>
        <input type="text" id="books-api-key-input" placeholder="Cole sua chave aqui" value="${escapeHtml(m.booksKey||'')}" onkeyup="state.modal.booksKey=this.value">
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmApiKey()">Salvar</button>
      </div>
    </div>
  </div>`;
}
function confirmApiKey(){
  const key = document.getElementById('api-key-input').value;
  const key2 = document.getElementById('api-key-2-input').value;
  const booksKey = document.getElementById('books-api-key-input').value;
  setApiKey(key);
  setApiKey2(key2);
  setBooksApiKey(booksKey);
  state.modal = null;
  render();
  saveData(); // sincroniza as chaves via Firestore pros outros aparelhos logados na mesma conta
}
function renderPhotoCropModal(m){
  const box = m.box;
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:520px; max-height:90vh; overflow-y:auto;">
      <h3>Selecionar o trecho da foto</h3>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:0;">
        Arraste os cantos até cobrir só o texto que quer que a IA leia — o resto da página fica de fora.
      </p>
      <div id="crop-container" style="position:relative; margin:12px 0; touch-action:none; user-select:none; border-radius:8px; overflow:hidden; background:#000; line-height:0;" onpointerdown="startCropDrag(event)">
        <img id="crop-img" src="${m.rawDataUrl}" style="display:block; width:100%; pointer-events:none;" draggable="false">
        <div id="crop-box" style="position:absolute; left:${box.x}%; top:${box.y}%; width:${box.w}%; height:${box.h}%; border:2px solid var(--accent); box-sizing:border-box;">
          <div class="crop-handle" data-handle="nw" style="position:absolute; left:-10px; top:-10px; width:20px; height:20px; background:var(--accent); border-radius:50%;"></div>
          <div class="crop-handle" data-handle="ne" style="position:absolute; right:-10px; top:-10px; width:20px; height:20px; background:var(--accent); border-radius:50%;"></div>
          <div class="crop-handle" data-handle="sw" style="position:absolute; left:-10px; bottom:-10px; width:20px; height:20px; background:var(--accent); border-radius:50%;"></div>
          <div class="crop-handle" data-handle="se" style="position:absolute; right:-10px; bottom:-10px; width:20px; height:20px; background:var(--accent); border-radius:50%;"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="ghost-btn" onclick="skipCropAndUseFull()">Usar a imagem inteira</button>
        <button class="primary-btn" onclick="confirmCrop()">Cortar e continuar</button>
      </div>
    </div>
  </div>`;
}
function renderPhotoImportModal(m){
  if(m.status === 'processing'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:420px; text-align:center;">
        <h3>Lendo a foto…</h3>
        <img src="${m.imageDataUrl}" style="max-width:100%; max-height:220px; border-radius:10px; margin:10px 0; object-fit:contain;">
        <p style="font-size:12.5px; color:var(--text-muted);">A IA está lendo o texto da página e montando 3 cartões. Isso leva alguns segundos…</p>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:420px;">
        <h3>Não deu pra gerar os cartões</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  const standardDecks = state.decks.filter(d => d.type !== 'language');
  const includedCount = m.cards.filter(c => c.include).length;
  const uncheckedCount = m.cards.length - includedCount;
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:520px; max-height:86vh; overflow-y:auto;">
      <h3>Revisar cartões da foto</h3>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:0;">
        A IA sugeriu estes cartões a partir da foto. Desmarque os que não gostou e clique em "Gerar novamente" pra trocá-los por outros — os marcados ficam como estão. Edite o texto à vontade e escolha o baralho antes de adicionar.
      </p>
      <div style="display:flex; flex-direction:column; gap:10px; margin:8px 0;">
        ${m.cards.map((c,i) => `
          <div style="display:flex; gap:10px; padding:12px; background:var(--bg-2); border:1px solid var(--border); border-radius:10px; ${!c.include ? 'opacity:0.5;' : ''}">
            <input type="checkbox" style="margin-top:4px;" ${c.include?'checked':''} ${m.regenerating?'disabled':''} onchange="state.modal.cards[${i}].include=this.checked; render();">
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
              <div class="field" style="gap:4px;">
                <label style="font-size:10px;">PERGUNTA</label>
                <textarea rows="2" style="padding:7px 9px; font-size:13px;" onkeyup="state.modal.cards[${i}].front=this.value">${escapeHtml(c.front)}</textarea>
              </div>
              <div class="field" style="gap:4px;">
                <label style="font-size:10px;">RESPOSTA</label>
                <textarea rows="2" style="padding:7px 9px; font-size:13px;" onkeyup="state.modal.cards[${i}].back=this.value">${escapeHtml(c.back)}</textarea>
              </div>
              <div class="field" style="gap:4px;">
                <label style="font-size:10px;">NOTA (opcional)</label>
                <textarea rows="2" style="padding:7px 9px; font-size:13px;" onkeyup="state.modal.cards[${i}].note=this.value">${escapeHtml(c.note)}</textarea>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <button type="button" class="ghost-btn" style="width:100%;" onclick="regenerateUncheckedCards()" ${(uncheckedCount===0||m.regenerating)?'disabled':''}>
        ${m.regenerating ? '⏳ Gerando novos cartões…' : `🔄 Gerar novamente (${uncheckedCount} ${uncheckedCount===1?'desmarcado':'desmarcados'})`}
      </button>
      <div class="field" style="margin-top:10px;">
        <label>ADICIONAR AO BARALHO</label>
        <select id="photo-import-deck-select" onchange="state.modal.deckId=this.value; render();">
          <option value="" ${!m.deckId?'selected':''}>Escolher baralho...</option>
          ${standardDecks.map(d=>`<option value="${d.id}" ${m.deckId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}
          <option value="__new__" ${m.deckId==='__new__'?'selected':''}>+ Criar novo baralho</option>
        </select>
        ${m.deckId==='__new__' ? `<input type="text" id="photo-import-new-deck-name" style="margin-top:6px;" placeholder="Nome do novo baralho" value="${escapeHtml(m.newDeckName||'')}" onkeyup="state.modal.newDeckName=this.value">` : ''}
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmPhotoImport()" ${includedCount===0?'disabled':''}>Adicionar ${includedCount} cartão(ões)</button>
      </div>
    </div>
  </div>`;
}
function renderAddBookModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px; max-height:88vh; overflow-y:auto;">
      <h3>Adicionar livro</h3>
      <div class="field">
        <label>BUSCAR NA INTERNET (opcional)</label>
        <div style="display:flex; gap:8px;">
          <input type="text" placeholder="Nome do livro" value="${escapeHtml(m.query)}" onkeyup="state.modal.query=this.value; if(event.key==='Enter') searchBookModal();" style="flex:1;">
          <button type="button" class="ghost-btn" onclick="searchBookModal()" ${m.searching?'disabled':''}>${m.searching?'Buscando…':'🔍 Buscar'}</button>
        </div>
      </div>
      ${m.results.length>0 ? `
      <div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto; margin:10px 0;">
        ${m.results.map((r,i) => `
          <div style="display:flex; gap:10px; align-items:center; padding:8px 10px; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="pickBookResult(${i})">
            <div style="width:34px; height:48px; background:var(--surface); border-radius:4px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:16px;">
              ${r.coverUrl ? `<img src="${escapeHtml(r.coverUrl)}" style="width:100%; height:100%; object-fit:cover;">` : '📖'}
            </div>
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.title)}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(r.author)}</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}
      <p style="font-size:11.5px; color:var(--text-faint); margin:12px 0 4px 0;">Escolha um resultado pra preencher automaticamente, ou edite os campos abaixo à mão:</p>
      <div class="field">
        <label>TÍTULO</label>
        <input type="text" value="${escapeHtml(m.manual.title)}" onkeyup="state.modal.manual.title=this.value">
      </div>
      <div class="field" style="margin-top:12px;">
        <label>AUTOR</label>
        <input type="text" value="${escapeHtml(m.manual.author)}" onkeyup="state.modal.manual.author=this.value">
      </div>
      <div class="field" style="margin-top:12px;">
        <label>CATEGORIAS (tags)</label>
        <div style="display:flex; flex-wrap:wrap; gap:6px; ${(m.manual.categories||[]).length ? 'margin-bottom:8px;' : ''}">
          ${renderTagChips(m.manual.categories, 'removeManualCategory', '')}
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="manual-category-input" placeholder="Ex: ficção, terror..." style="flex:1;" onkeydown="if(event.key==='Enter'){ event.preventDefault(); addManualCategory(); }">
          <button type="button" class="ghost-btn" onclick="addManualCategory()">+ Add</button>
        </div>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>URL DA CAPA</label>
        <input type="text" value="${escapeHtml(m.manual.coverUrl)}" placeholder="https://..." onkeyup="state.modal.manual.coverUrl=this.value">
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmAddBook()">Adicionar à estante</button>
      </div>
    </div>
  </div>`;
}
function renderQuoteCaptureModal(m){
  if(m.status === 'processing'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:420px; text-align:center;">
        <h3>Lendo o texto…</h3>
        <img src="${m.imageDataUrl}" style="max-width:100%; max-height:220px; border-radius:10px; margin:10px 0; object-fit:contain;">
        <p style="font-size:12.5px; color:var(--text-muted);">A IA está transcrevendo o texto da foto…</p>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:420px;">
        <h3>Não deu pra ler o texto</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px; max-height:86vh; overflow-y:auto;">
      <h3>Revisar citação</h3>
      <p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:0;">Confira e edite o texto transcrito antes de guardar.</p>
      <div class="field" style="margin-top:10px;">
        <textarea rows="8" onkeyup="state.modal.text=this.value">${escapeHtml(m.text)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmQuoteCapture()">Guardar citação</button>
      </div>
    </div>
  </div>`;
}
function renderWordLookupModal(m){
  let doneSection = '';
  if(m.status === 'done'){
    // não repete a mesma tradução nas duas seções se a direta já bater com uma das contextuais
    const directNorm = m.direct ? normalizeAnswer(m.direct) : null;
    const contextualFiltered = (m.contextual||[]).filter(t => !directNorm || normalizeAnswer(t) !== directNorm);
    doneSection = `
      ${m.direct ? `
      <div style="margin:6px 0 0 0;">
        <div style="font-size:10.5px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px;">Tradução direta</div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:19px; font-weight:700; color:var(--accent);">${escapeHtml(m.direct)}</span>
          ${m.category ? `<span style="font-size:10.5px; font-weight:600; color:var(--text-muted); background:var(--bg-2); border:1px solid var(--border); border-radius:6px; padding:2px 8px;">${escapeHtml(m.category)}</span>` : ''}
        </div>
      </div>
      ` : ''}
      ${contextualFiltered.length ? `
      <div style="margin-top:${m.direct?'12px':'6px'};">
        <div style="font-size:10.5px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px;">Nesse contexto</div>
        <div style="font-size:15px; font-weight:600; color:var(--text);">${contextualFiltered.map(t=>escapeHtml(t)).join(' / ')}</div>
      </div>
      ` : ''}
      ${m.note ? `<p style="font-size:12.5px; color:var(--text-muted); line-height:1.5; margin:10px 0 0 0;">${escapeHtml(m.note)}</p>` : ''}
    `;
  }
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:380px;">
      <h3 style="margin-bottom:2px;">${escapeHtml(m.word)}</h3>
      <p style="font-size:11.5px; color:var(--text-faint); margin:0 0 10px 0;">"${escapeHtml(m.sentence)}"</p>
      ${m.status === 'loading' ? `<div class="loading-line"><div class="spinner"></div> Traduzindo...</div>` : ''}
      ${m.status === 'error' ? `<p style="font-size:13px; color:var(--error);">${escapeHtml(m.error)}</p>` : ''}
      ${doneSection}
      ${(m.status==='done' && !m.deckId) ? `<p style="font-size:11.5px; color:var(--text-faint); margin:8px 0 0 0;">Vincule um baralho a este livro (⚙️ nas propriedades) pra poder criar cartões por aqui.</p>` : ''}
      <div class="modal-actions" style="flex-wrap:wrap;">
        <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        ${(m.status==='done' && m.deckId) ? `
        <button class="ghost-btn" onclick="addLookupWordToDeck()">+ Adicionar ao baralho</button>
        <button class="primary-btn" onclick="memorizeLookupWord()">🧠 Adicionar e memorizar</button>
        ` : ''}
      </div>
    </div>
  </div>`;
}
function renderPassageCardModal(m){
  if(m.status === 'loading'){
    return `
    <div class="modal-overlay">
      <div class="modal" style="width:420px;">
        <h3>Gerando cartão…</h3>
        <p style="font-size:11.5px; color:var(--text-faint);">"${escapeHtml(m.passage.length>200 ? m.passage.slice(0,200)+'…' : m.passage)}"</p>
        <div class="loading-line"><div class="spinner"></div> A IA está lendo o trecho...</div>
      </div>
    </div>`;
  }
  if(m.status === 'error'){
    return `
    <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal" style="width:420px;">
        <h3>Não deu pra gerar o cartão</h3>
        <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${escapeHtml(m.error)}</p>
        <div class="modal-actions">
          <button class="ghost-btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  }
  const standardDecks = state.decks.filter(d => d.type !== 'language');
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="width:480px; max-height:86vh; overflow-y:auto;">
      <h3>Revisar cartão</h3>
      <p style="font-size:11.5px; color:var(--text-faint); margin:0 0 10px 0;">Trecho: "${escapeHtml(m.passage.length>200 ? m.passage.slice(0,200)+'…' : m.passage)}"</p>
      <div class="field">
        <label>PERGUNTA</label>
        <textarea rows="2" onkeyup="state.modal.card.front=this.value">${escapeHtml(m.card.front)}</textarea>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>RESPOSTA</label>
        <textarea rows="2" onkeyup="state.modal.card.back=this.value">${escapeHtml(m.card.back)}</textarea>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>NOTA</label>
        <textarea rows="2" onkeyup="state.modal.card.note=this.value">${escapeHtml(m.card.note)}</textarea>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>ADICIONAR AO BARALHO</label>
        <select onchange="state.modal.deckId=this.value; render();">
          <option value="" ${!m.deckId?'selected':''}>Escolher baralho...</option>
          ${standardDecks.map(d=>`<option value="${d.id}" ${m.deckId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmPassageCard()" ${!m.deckId?'disabled':''}>Adicionar cartão</button>
      </div>
    </div>
  </div>`;
}
function renderCreateDeckForBookModal(m){
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <h3>Criar baralho pra este livro</h3>
      <div class="field">
        <label>NOME DO BARALHO</label>
        <input type="text" id="create-deck-for-book-name" value="${escapeHtml(m.name)}" onkeyup="state.modal.name=this.value" placeholder="Ex: Vocabulário do livro">
      </div>
      <div class="field" style="margin-top:12px;">
        <label>TIPO</label>
        <div style="display:flex; gap:8px;">
          <button type="button" class="ghost-btn" style="flex:1; ${m.deckType==='standard' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.deckType='standard'; render();">Padrão<br><span style="font-weight:400; font-size:11px; opacity:0.8;">pergunta e resposta</span></button>
          <button type="button" class="ghost-btn" style="flex:1; ${m.deckType==='language' ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="state.modal.deckType='language'; render();">Idioma<br><span style="font-weight:400; font-size:11px; opacity:0.8;">só o termo</span></button>
        </div>
        <p style="font-size:11px; color:var(--text-faint); margin:6px 0 0 0;">Sugerido com base no idioma marcado nas propriedades do livro — pode trocar se quiser.</p>
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" onclick="closeModal()">Cancelar</button>
        <button class="primary-btn" onclick="confirmCreateDeckForBook()">Criar e vincular</button>
      </div>
    </div>
  </div>`;
}
/* Sumário fica num modal separado, fora do texto corrido de leitura, de propósito:
   assim clicar num capítulo pra pular direto nunca conflita com o toque numa
   palavra pra traduzir (são duas telas/gestos diferentes, nunca o mesmo elemento). */
function renderEpubTocModal(m){
  const book = state.books.find(b=>b.id===m.bookId);
  const toc = (book && book.epub && book.epub.toc) || [];
  const idx = book ? book.epub.currentChapterIndex : -1;
  const pages = book ? getEpubPages(book.id, idx) : null;
  const pageIdx = book ? Math.min(book.epub.currentPageIndex||0, pages ? pages.length-1 : 0) : -1;
  const pageStart = pages && pages[pageIdx] ? pages[pageIdx].start : 0;
  const activeEntry = book ? getActiveEpubTocEntry(book.id, book, idx, pageStart) : null;
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="max-width:440px; max-height:80vh; overflow-y:auto;">
      <h3>Sumário</h3>
      ${toc.length ? `
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:10px;">
          ${toc.map(entry => `
            <button type="button" class="ghost-btn" style="text-align:left; justify-content:flex-start; width:100%; ${entry===activeEntry ? 'border-color:var(--accent); color:var(--accent);' : ''}" onclick="jumpToEpubTocEntry('${book.id}', ${entry.chapterIndex}, ${entry.fragment ? `'${entry.fragment.replace(/'/g,"\\'")}'` : 'null'})">${escapeHtml(entry.title)}</button>
          `).join('')}
        </div>
      ` : `<p style="color:var(--text-faint); font-size:13px; margin-top:10px;">Não consegui identificar os capítulos deste arquivo — use os botões Anterior/Próximo pra navegar.</p>`}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="ghost-btn" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  </div>`;
}
function renderEpubNavModal(m){
  const book = state.books.find(b=>b.id===m.bookId);
  if(!book || !book.epub) return `<div class="modal-overlay" onclick="closeModal()"><div class="modal"><p>Livro não encontrado.</p></div></div>`;
  const bookmarks = (book.epub.bookmarks||[]).slice().sort((a,b)=> a.chapterIndex-b.chapterIndex || a.pageIndex-b.pageIndex);
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal" style="max-width:460px; max-height:80vh; overflow-y:auto;">
      <h3>Marcadores</h3>
      <button class="primary-btn" style="width:100%; margin:12px 0 18px 0;" onclick="addEpubBookmark('${book.id}')">🔖 Adicionar marcador nesta página</button>
      ${bookmarks.length ? `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${bookmarks.map(bm => `
            <div style="display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px;">
              <div style="flex:1; cursor:pointer; min-width:0;" onclick="goToEpubBookmark('${book.id}','${bm.id}')">
                <div style="font-size:13px; font-weight:600;">${escapeHtml(bm.label)}</div>
                ${bm.excerpt ? `<div style="font-size:11.5px; color:var(--text-muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(bm.excerpt)}…</div>` : ''}
              </div>
              <button class="icon-btn" title="Remover marcador" onclick="removeEpubBookmark('${book.id}','${bm.id}')">✕</button>
            </div>
          `).join('')}
        </div>
      ` : `<p style="color:var(--text-faint); font-size:12.5px;">Nenhum marcador ainda.</p>`}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="ghost-btn" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  </div>`;
}
function confirmNewDeck(){
  const name = document.getElementById('deck-name-input').value;
  if(!name.trim()){ showToast('Dê um nome ao baralho.', 'error'); return; }
  const color = state.modal.color;
  const deckType = state.modal.deckType;
  state.modal = null;
  createDeck(name, color, deckType);
}

