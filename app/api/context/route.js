import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini';

const formatList = (items, toLine) =>
  items.length > 0 ? items.map(toLine).join('\n') : '（なし）';

export async function POST(request) {
  try {
    const {
      transcriptionWindow = [],
      confirmed = [],
      rejected = [],
      responses = [],
    } = await request.json();

    if (transcriptionWindow.length === 0) {
      return NextResponse.json({ fragment: '' });
    }

    const windowText = transcriptionWindow
      .map((t) => `[${t.timestamp}] ${t.text}`)
      .join('\n');

    const confirmedText = formatList(confirmed, (s) => `- ${s}`);
    const rejectedText = formatList(rejected, (s) => `- ${s}`);
    const responsesText = formatList(responses, (r) => `- 「${r.card}」→「${r.reply}」`);

    const prompt = `
あなたは会話の文字起こしを構造化・補正するエディタです。
以下の「文字起こし窓（前後のコンテキスト込み）」を補正・整理した Markdown 断片を返してください。
この出力は既存の補正文末尾にそのまま追記されます（過去との重複があっても構いません）。

## 文字起こし窓
${windowText}

## ユーザーが確認した事実（補正のヒント）
${confirmedText}

## ユーザーが否定した仮説（補正のヒント）
${rejectedText}

## 話題候補へのユーザーの反応
${responsesText}

---

ルール:
- 話題ごとに見出し（## トピック名）＋箇条書き
- 「ユーザーが確認した事実」を正として誤認識を補正（例: 「データバス」→「データベース」）
- フィラー（えーと、あのー、あー等）は除去
- 前後のコンテキストを踏まえた上で、この窓で話された内容を整理
- 窓に内容が乏しければ短くて良い
- Markdown のみを返すこと（前置き・コードブロックなし）
`;

    const responseText = await generateContent(prompt);
    return NextResponse.json({ fragment: responseText.trim() });
  } catch (error) {
    console.error('Context API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
