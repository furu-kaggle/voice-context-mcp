import { NextResponse } from 'next/server';
import { getGeminiModel, extractJson } from '@/lib/gemini';
import { CARD_EMOJI } from '@/lib/cards';

export async function POST(request) {
  try {
    const { sessionPrompt } = await request.json();

    const context = sessionPrompt
      ? `前回のセッションの文脈:\n${sessionPrompt}\n\n前回の続きとして、`
      : '';

    const model = getGeminiModel();
    const result = await model.generateContent(
      `${context}あなたは発散思考のサポーターです。ユーザーがこれから話し始めます。会話のきっかけとなる最初の問いかけを1〜2枚のカードとして生成してください。JSONのみ返してください（コードブロックなし）。

形式:
{"cards": [{"type": "suggestion", "text": "問いかけ文"}]}

ルール:
- suggestionカードを1〜2枚
- 話しやすい、オープンな問いかけ
- JSONのみ返すこと`
    );

    const parsed = JSON.parse(extractJson(result.response.text()));
    const cards = (parsed.cards ?? []).map((c) => ({
      ...c,
      emoji: CARD_EMOJI[c.type] ?? '💡',
    }));

    return NextResponse.json({ cards });
  } catch (error) {
    console.error('Greet API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
