// aplica o tema salvo o quanto antes, antes do resto da página desenhar,
// pra não piscar o tema errado por uma fração de segundo.
(function(){
  try{
    var saved = localStorage.getItem('recall_theme');
    var theme = saved === 'light' || saved === 'dark' || saved === 'aurora' ? saved : 'aurora';
    var colors = { light:'#FAF8F5', dark:'#14162B', aurora:'#080B16' };
    document.documentElement.setAttribute('data-recall-theme', theme);
    var tc = document.getElementById('theme-color-meta'); if(tc) tc.content = colors[theme];
    var sb = document.getElementById('status-bar-style-meta'); if(sb) sb.content = theme === 'light' ? 'default' : 'black-translucent';
  }catch(e){}
})();
