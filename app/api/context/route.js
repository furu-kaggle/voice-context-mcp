import { NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/gemini';

const formatList = (items, toLine) =>
  items.length > 0 ? items.map(toLine).join('\n') : '（まだなし）';

export async function POST(request) {
  try {
    const { confirmed, rejected, responses } = await request.json();

    const confirmedText = formatList(confirmed, (s) => `- ${s}`);
    const rejectedText = formatList(rejected, (s) => `- ${s}`);
    const responsesText = formatList(responses, (r) => `- 提案「${r.card}」→ 「${r.reply}」`);

    const model = getGeminiModel();
    const result = await model.generateContent(`
以下はユーザーとAIカードのインタラクションログです。
これを元に、次のカード生成AIが参照する「思考の現在地」ドキュメントを日本語で作成してください。

## 確認済みの認識（Yes）
${confirmedText}

## 否定された仮説（No）
${rejectedText}

## 提案へのユーザーの反応・補足
${responsesText}

---

上記を統合して、簡潔で構造化されたMarkdownドキュメントを作成してください。
- 箇条書きで現在の思考の状態をまとめること
- 既に議論済みの角度・確認済みの内容を明示すること
- 次の会話で避けるべきトピックと、まだ掘り下げていない方向性を示すこと
- 200字以内で簡潔に
`);

    return NextResponse.json({ prompt: result.response.text().trim() });
  } catch (error) {
    console.error('Context API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
