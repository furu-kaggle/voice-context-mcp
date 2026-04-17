import { NextResponse } from 'next/server';
import { getSession, setSession } from '@/lib/sessionStore';

// GET: 外部ツール（Claude Code等）からセッション状態を読む
// 認証: token自体がベアラートークンとして機能する（crypto.randomUUID由来）
// トークンを知らない第三者はアクセス不可。本番では追加認証レイヤーを検討。
export async function GET(request, { params }) {
  const { token } = await params;
  const session = getSession(token);
  if (!session) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }
  return NextResponse.json(session);
}

// POST: フロントエンドからセッション状態を更新
export async function POST(request, { params }) {
  const { token } = await params;
  const body = await request.json();
  await setSession(token, {
    transcriptions: body.transcriptions ?? [],
    cards: body.cards ?? [],
    sessionPrompt: body.sessionPrompt ?? '',
  });
  return NextResponse.json({ ok: true });
}
