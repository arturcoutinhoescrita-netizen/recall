let selectionText='';
let activeTab=null;

async function readSelection(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  activeTab=tab||null;
  if(!tab?.id) return '';
  const result=await chrome.scripting.executeScript({
    target:{tabId:tab.id},
    func:()=>String(window.getSelection?.()?.toString?.()||'').trim()
  });
  return String(result?.[0]?.result||'').trim();
}
async function init(){
  const status=document.getElementById('status');
  const selection=document.getElementById('selection');
  const create=document.getElementById('create');
  try{
    selectionText=await readSelection();
    if(selectionText){
      const clipped=selectionText.slice(0,16000);
      selectionText=clipped;
      selection.hidden=false;
      selection.textContent=clipped;
      status.textContent=`${clipped.length.toLocaleString('pt-BR')} caracteres selecionados.`;
      create.disabled=false;
    }else{
      status.textContent='Selecione um trecho de texto na página e abra a extensão novamente.';
    }
  }catch(error){
    status.textContent='Não consegui ler a seleção nesta página. Tente usar o botão direito sobre o texto selecionado.';
  }
}
document.getElementById('create').addEventListener('click',async()=>{
  if(!selectionText) return;
  const count=Math.max(1,Math.min(10,parseInt(document.getElementById('count').value,10)||3));
  await chrome.runtime.sendMessage({type:'OPEN_LETTHER_IMPORT',payload:{text:selectionText,title:activeTab?.title||'',url:activeTab?.url||'',count}});
  window.close();
});
document.getElementById('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
init();
