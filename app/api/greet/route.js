import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request) {
  try {
    const { sessionPrompt } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });

    const context = sessionPrompt
      ? `前回のセッションの文脈:\n${sessionPrompt}\n\n前回の続きとして、`
      : '';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
    const result = await model.generateContent(
      `${context}あなたは発散思考のサポーターです。ユーザーがこれから話し始めます。会話のきっかけとなる最初の問いかけを1〜2枚のカードとして生成してください。JSONのみ返してください（コードブロックなし）。

形式:
{"cards": [{"type": "suggestion", "text": "問いかけ文"}]}

ルール:
- suggestionカードを1〜2枚
- 話しやすい、オープンな問いかけ
- JSONのみ返すこと`
    );

    const jsonText = result.response.text().replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim();
    const parsed = JSON.parse(jsonText);
    const cards = (parsed.cards || []).map(c => ({ ...c, emoji: '💡' }));
    return NextResponse.json({ cards });
  } catch (error) {
    console.error('Greet API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
