/* ============ FIREBASE (login + sincronização entre aparelhos) ============
   Só entra em ação fora do Claude.ai (aqui hasClaudeStorage() é sempre falso).
   Cada pessoa loga com a própria conta Google e os dados ficam em
   users/{uid} no Firestore, isolados por login via regra de segurança. */
const firebaseConfig = {
  apiKey: "AIzaSyC7OYBIbfwiomiGipUAAcDnUWVnclaVu0Q",
  authDomain: "recall-flashcards-172ff.firebaseapp.com",
  projectId: "recall-flashcards-172ff",
  storageBucket: "recall-flashcards-172ff.firebasestorage.app",
  messagingSenderId: "272502529779",
  appId: "1:272502529779:web:402568fc9f335a3ae6a186"
};
let auth = null, db = null;
function isStandaloneApp(){
  // true quando o app foi instalado (ícone na tela inicial) e está rodando sem a barra do navegador —
  // nesse modo, o login do Google trava tanto com popup quanto com redirect no Android.
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function openInBrowserForLogin(){
  window.open(location.href, '_blank');
}
function initFirebase(){
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(e => console.error('Persistência offline do Firestore não disponível', e));

  // no celular, signInWithPopup costuma ser bloqueado/travar — usamos redirect lá,
  // e por isso precisamos conferir o resultado do redirect ao carregar a página.
  auth.getRedirectResult().catch(e => console.error('Falha ao concluir login com Google (redirect)', e));

  auth.onAuthStateChanged(user => {
    state.firebaseUser = user;
    state.authReady = true;
    state.fileHandle = null; state.pendingFileHandle = null; // não carrega o arquivo lembrado da conta anterior
    if(user){
      loadData().then(async () => { await loadCompanionReports(); tryReconnectFileHandle(); render(); });
    } else {
      state.decks = []; state.cards = {}; state.stats = { totalPoints: 0 };
      render();
    }
  });
}
function signInWithGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  // signInWithRedirect depende de storage no domínio auxiliar do Firebase (authDomain),
  // que o Safari/iOS (e cada vez mais outros navegadores) bloqueia por padrão fora do site
  // principal — na prática o usuário volta pro app sem erro nenhum e sem estar logado,
  // como se a página só tivesse recarregado. O popup evita essa troca de domínio, então
  // usamos ele sempre, mesmo no celular, e só caímos pro redirect se o popup nem abrir.
  auth.signInWithPopup(provider).catch(e => {
    if(e && e.code === 'auth/popup-closed-by-user') return; // usuário fechou a janela, sem problema
    if(e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/cancelled-popup-request')){
      auth.signInWithRedirect(provider).catch(e2 => {
        console.error('Falha ao iniciar login com Google', e2);
        showToast('Não foi possível iniciar o login. Tente novamente.', 'error');
      });
      return;
    }
    console.error('Falha ao fazer login com Google', e);
    showToast('Não foi possível fazer login. Tente novamente.', 'error');
  });
}
function signOutUser(){
  auth.signOut();
}

