export const CARD_EMOJI = {
  confirmation: '✅',
  topic_guess: '🎯',
};

export const CARD_TYPE_LABEL = {
  confirmation: '確認',
  topic_guess: '話題の推測',
};

export const CARD_TYPE_STYLE = {
  confirmation: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100' },
  topic_guess:  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
};

export const getCardStyle = (type) => CARD_TYPE_STYLE[type] ?? CARD_TYPE_STYLE.confirmation;
export const getCardLabel = (type) => CARD_TYPE_LABEL[type] ?? type;
