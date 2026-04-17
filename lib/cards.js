export const CARD_EMOJI = {
  confirmation: '✅',
  suggestion: '💡',
  topic_guess: '🎯',
};

export const CARD_TYPE_LABEL = {
  confirmation: '確認',
  suggestion: '提案',
  topic_guess: '話題の推測',
};

export const CARD_TYPE_STYLE = {
  confirmation: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100' },
  suggestion:   { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-100'  },
  topic_guess:  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
};

export const QUICK_CHOICES = [
  { label: 'いいね', signal: 'positive' },
  { label: 'スキップ', signal: null },
];

export const getCardStyle = (type) => CARD_TYPE_STYLE[type] ?? CARD_TYPE_STYLE.suggestion;
export const getCardLabel = (type) => CARD_TYPE_LABEL[type] ?? type;
