import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini';

const formatList = (items, toLine) =>
  items.length > 0 ? items.map(toLine).join('\n') : '（なし）';

export async function POST(request) {
  try {
    const {
      previousCorrection = '',
      newTranscriptions = [],
      confirmed = [],
      rejected = [],
      responses = [],
    } = await request.json();

    const newTranscriptText =
      newTranscriptions.length > 0
        ? newTranscriptions.map((t) => `[${t.timestamp}] ${t.text}`).join('\n')
        : '（なし）';

    const confirmedText = formatList(confirmed, (s) => `- ${s}`);
    const rejectedText = formatList(rejected, (s) => `- ${s}`);
    const responsesText = formatList(responses, (r) => `- 「${r.card}」→「${r.reply}」`);

    const prompt = `
あなたは会話の文字起こしを構造化・補正するエディタです。
以下の「前回までの補正文」に、新しい文字起こしを統合して累積更新してください。

## 前回までの補正文
${previousCorrection || '（まだなし）'}

## 新しい文字起こし（誤認識を含む生のテキスト）
${newTranscriptText}

## ユーザーが確認した事実（補正のヒント）
${confirmedText}

## ユーザーが否定した仮説（補正のヒント）
${rejectedText}

## 話題候補へのユーザーの反応
${responsesText}

---

ルール:
- 話題ごとに見出し（## トピック名）＋箇条書きで構造化
- 「ユーザーが確認した事実」を正とみなし、生の文字起こしの誤認識を補正すること（例: 「データバス」→「データベース」）
- 「否定された仮説」に該当する内容は除外または明示的に訂正
- フィラー（えーと、あのー、あー等）は除去
- 同じ内容の重複はまとめる
- 話題が進展した場合は既存トピックの箇条書きを更新・追記
- 1000字以内
- Markdownのみを返すこと（前置き・コードブロックなし）
`;

    const responseText = await generateContent(prompt);
    return NextResponse.json({ correction: responseText.trim() });
  } catch (error) {
    console.error('Context API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
