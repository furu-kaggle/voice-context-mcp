import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const EMOJI_MAP = {
  深掘り: "🔍",
  逆張り: "↩️",
  具体化: "✨",
  ズラし: "↗️",
  問いかけ: "❓",
  confirmation: "✅",
  suggestion: "💡",
  topic_guess: "🎯",
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const sessionPrompt = formData.get('sessionPrompt') || '';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const audioPart = { inlineData: { mimeType: 'audio/wav', data: base64 } };

    const contextSection = sessionPrompt
      ? `## セッションの現在地\n${sessionPrompt}`
      : '## セッションの現在地\nなし（会話開始直後）';

    const multiSpeakerNote = `注意: 音声に複数の話者が含まれる場合は、各話者の立場・意見の違いも考慮してカードを生成してください。`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
    const result = await model.generateContent([
      audioPart,
      `あなたは発散思考のサポーターです。
音声を聞いて、以下のJSONのみを返してください（コードブロックなし、前置きなし）。

${contextSection}

${multiSpeakerNote}

返すJSON形式:
{
  "cards": [
    {"type": "topic_guess", "text": "今どんな話題について話してますか？", "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"]},
    {"type": "confirmation", "text": "〇〇ってこういう理解であってる？"},
    {"type": "suggestion", "text": "〇〇についても話してみたらどう？"}
  ]
}

ルール:
- topic_guessカード: 音声から推測される話題の候補を4つ提示するもの（毎回1枚。choicesは必ず4つ。話題は短く端的に）
- confirmationカード: confirmedStatesにまだない重要な認識をyes/noで確認するもの（0〜1枚）
- suggestionカード: まだ話していない角度・新しい視点の提案（0〜1枚）
- 音声が完全に無音・無内容の場合のみcardsを空配列にする
- 必ずJSONのみ返すこと`,
    ]);

    const jsonText = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonText);

    if (parsed.cards) {
      parsed.cards = parsed.cards.map(c => ({
        ...c,
        emoji: EMOJI_MAP[c.type] ?? '💭',
      }));
    }

    return NextResponse.json({ cards: parsed.cards ?? [] });
  } catch (error) {
    console.error('Cards API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
