# koekei

声から問いが生まれる — 音声を聞いて、発散思考を助けるカードを自動生成するWebアプリ。

## 概要

マイクまたはタブ音声をリアルタイムで録音し、30秒ごとに Gemini でカードを生成する。生成されるカードは2種類：

| タイプ | 内容 |
|---|---|
| `topic_guess` | 「今どんな話題？」の4択推測 |
| `confirmation` | 重要な認識の Yes/No 確認 |

文字起こしは ElevenLabs Scribe（WebSocket）でリアルタイム表示。  
セッション状態は `/api/session/:token` から取得でき、Claude Code などの外部ツールと連携できる。

## セットアップ

```bash
cp .env.example .env.local
# .env.local に API キーを記入
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## 環境変数

| 変数 | 説明 |
|---|---|
| `GEMINI_API_KEY` | カード生成・コンテキスト要約に使用 |
| `ELEVENLABS_API_KEY` | リアルタイム文字起こし（Scribe v2）に使用 |
| `NEXT_PUBLIC_BASE_PATH` | サブパスにデプロイする場合のみ設定（通常は空） |

### APIキーの取得

**Gemini (Google AI Studio)**
1. https://aistudio.google.com/apikey を開く
2. 「APIキーを作成」→ キーをコピーして `GEMINI_API_KEY` に設定

**ElevenLabs**
1. https://elevenlabs.io にサインアップ
2. 右上のアイコン → Profile → API Keys → 「Generate」でキーを作成
3. コピーして `ELEVENLABS_API_KEY` に設定

## 構成

```
app/
  page.jsx                  # メインUI
  layout.tsx
  globals.css
  api/
    cards/route.js          # 音声→カード生成（Gemini）
    context/route.js        # セッションコンテキスト要約（Gemini）
    session/[token]/route.js # セッション状態の読み書き（外部連携用）
lib/
  sessionStore.js           # ファイルベースのセッションストア
public/
  pcm-recorder-processor.js # AudioWorklet（PCM録音）
server.js                   # Next.js + WebSocket サーバー（ElevenLabs Scribe中継）
```

## Claude Code との連携

録音開始後、画面上にトークン付きの curl コマンドが表示される。  
そのコマンドを Claude Code に貼り付けると、文字起こしとカード状態を読み込める。

```bash
curl http://localhost:3000/api/session/<token>
```
