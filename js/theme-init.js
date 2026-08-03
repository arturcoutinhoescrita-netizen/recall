// aplica o tema salvo o quanto antes, antes do resto da página desenhar,
// pra não piscar o tema errado por uma fração de segundo.
(function(){
  try{
    if(localStorage.getItem('recall_theme') === 'light'){
      document.documentElement.setAttribute('data-recall-theme', 'light');
      var tc = document.getElementById('theme-color-meta'); if(tc) tc.content = '#FAF8F5';
      var sb = document.getElementById('status-bar-style-meta'); if(sb) sb.content = 'default';
    }
  }catch(e){}
})();
