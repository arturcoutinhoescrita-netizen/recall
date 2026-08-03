/* ============ SOUND ============ */
let audioCtx = null;
function getCtx(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function beep(freq, dur, delay, vol){
  const ctx = getCtx();
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.value = freq;
  osc.connect(gain); gain.connect(ctx.destination);
  const t = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol||0.28, t+0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  osc.start(t); osc.stop(t+dur+0.03);
}
function playCorrect(){ beep(784,0.09,0); beep(988,0.09,0.09); beep(1318,0.16,0.18); }
function playWrong(){ beep(220,0.14,0); beep(160,0.22,0.09,0.22); }
function playStreakBonus(){
  beep(784,0.08,0); beep(988,0.08,0.08); beep(1318,0.08,0.16); beep(1568,0.08,0.24); beep(2093,0.22,0.32);
}
function playBookOpen(){ beep(520,0.09,0,0.18); beep(660,0.14,0.07,0.16); }

