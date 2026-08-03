/* ============ PONTUAÇÃO / GAMIFICAÇÃO ============ */
function awardPoints(card, correct, exType, grade){
  const s = state.session;
  s.streak = s.streak || 0;
  s.points = s.points || 0;
  state.stats = state.stats || { totalPoints: 0 };
  let earned = 0;
  let bonusMsg = '';
  let streakBonus = false;
  if(correct){
    earned = grade === 'easy' ? 15 : grade === 'medium' ? 8 : 10;
    s.streak++;
    if(exType === 'translate' && s.userInput){
      const norm = normalizeAnswer(s.userInput.trim());
      card.usedTranslateAnswers = card.usedTranslateAnswers || [];
      if(card.usedTranslateAnswers.length > 0 && !card.usedTranslateAnswers.includes(norm)){
        earned += 5;
        bonusMsg = 'Nova tradução usada! +5';
      }
      if(!card.usedTranslateAnswers.includes(norm)) card.usedTranslateAnswers.push(norm);
    }
    if(s.streak % 5 === 0){
      earned += 20;
      streakBonus = true;
      bonusMsg = (bonusMsg ? bonusMsg + ' · ' : '') + `Sequência de ${s.streak}! +20`;
    }
  } else {
    earned = grade === 'hard' ? 2 : 0;
    s.streak = 0;
  }
  s.points += earned;
  state.stats.totalPoints = (state.stats.totalPoints||0) + earned;
  s.lastEarned = earned;
  s.lastBonusMsg = bonusMsg;
  if(streakBonus) playStreakBonus();
  else if(correct) playCorrect();
  else playWrong();
  saveData();
  return earned;
}

