const DEFAULT_APP_URL='https://recall-flashcards-172ff.web.app';
async function load(){
  const stored=await chrome.storage.sync.get({appUrl:DEFAULT_APP_URL});
  document.getElementById('appUrl').value=stored.appUrl||DEFAULT_APP_URL;
}
document.getElementById('save').addEventListener('click',async()=>{
  const field=document.getElementById('appUrl');
  const saved=document.getElementById('saved');
  try{
    const parsed=new URL(field.value.trim());
    if(!['http:','https:'].includes(parsed.protocol)) throw new Error();
    parsed.hash=''; parsed.search='';
    const clean=parsed.href.replace(/\/$/,'');
    await chrome.storage.sync.set({appUrl:clean});
    field.value=clean;
    saved.textContent='Salvo.';
    setTimeout(()=>saved.textContent='',1800);
  }catch(error){
    saved.textContent='Endereço inválido.';
  }
});
load();
