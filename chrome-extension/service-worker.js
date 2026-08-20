const MENU_ID='letther-b-flashcards';
const DEFAULT_APP_URL='https://recall-flashcards-172ff.web.app';
const MAX_SELECTION_CHARS=16000;

function encodePayload(payload){
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  let binary='';
  bytes.forEach(byte=>binary+=String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function normalizeAppUrl(value){
  const url=String(value||'').trim()||DEFAULT_APP_URL;
  try{
    const parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol)) return DEFAULT_APP_URL;
    parsed.hash=''; parsed.search='';
    return parsed.href.replace(/\/$/,'');
  }catch(error){ return DEFAULT_APP_URL; }
}
async function openInLetther(payload){
  const stored=await chrome.storage.sync.get({appUrl:DEFAULT_APP_URL});
  const appUrl=normalizeAppUrl(stored.appUrl);
  const clean={
    text:String(payload.text||'').trim().slice(0,MAX_SELECTION_CHARS),
    title:String(payload.title||'').trim().slice(0,300),
    url:String(payload.url||'').trim().slice(0,2000),
    count:Math.max(1,Math.min(10,parseInt(payload.count,10)||3))
  };
  if(!clean.text) return;
  await chrome.tabs.create({url:`${appUrl}/#letther-import=${encodePayload(clean)}`});
}
function installContextMenu(){
  chrome.contextMenus.removeAll(()=>{
    chrome.contextMenus.create({
      id:MENU_ID,
      title:'Criar flashcards no Letther B',
      contexts:['selection']
    });
  });
}
chrome.runtime.onInstalled.addListener(installContextMenu);
chrome.runtime.onStartup.addListener(installContextMenu);
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if(info.menuItemId!==MENU_ID||!info.selectionText) return;
  openInLetther({text:info.selectionText,title:tab?.title||'',url:info.pageUrl||tab?.url||'',count:3});
});
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type!=='OPEN_LETTHER_IMPORT') return;
  openInLetther(message.payload||{}).then(()=>sendResponse({ok:true})).catch(error=>sendResponse({ok:false,error:String(error?.message||error)}));
  return true;
});
