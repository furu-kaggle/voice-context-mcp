import { NextResponse } from 'next/server';
import { generateContent, extractJson } from '@/lib/gemini';
import { CARD_EMOJI } from '@/lib/cards';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const sessionPrompt = formData.get('sessionPrompt') || '';

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const contextSection = sessionPrompt
      ? `## セッションの現在地\n${sessionPrompt}`
      : '## セッションの現在地\nなし（会話開始直後）';

    const prompt = `あなたは発散思考のサポーターです。
音声を聞いて、以下のJSONのみを返してください（コードブロックなし、前置きなし）。

${contextSection}

注意: 音声に複数の話者が含まれる場合は、各話者の立場・意見の違いも考慮してカードを生成してください。

返すJSON形式:
{
  "cards": [
    {"type": "topic_guess", "text": "今どんな話題について話してますか？", "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"]},
    {"type": "confirmation", "text": "〇〇ってこういう理解であってる？"}
  ]
}

ルール:
- topic_guessカード: 音声から推測される話題の候補を4つ提示するもの（毎回1枚。choicesは必ず4つ。話題は短く端的に）
- confirmationカード: confirmedStatesにまだない重要な認識をyes/noで確認するもの（0〜1枚）
- 音声が完全に無音・無内容の場合のみcardsを空配列にする
- 必ずJSONのみ返すこと`;

    const responseText = await generateContent([
      { inlineData: { mimeType: 'audio/wav', data: base64 } },
      { text: prompt },
    ]);

    const parsed = JSON.parse(extractJson(responseText));
    const cards = (parsed.cards ?? []).map((c) => ({
      ...c,
      emoji: CARD_EMOJI[c.type] ?? '💭',
    }));

    return NextResponse.json({ cards });
  } catch (error) {
    console.error('Cards API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
