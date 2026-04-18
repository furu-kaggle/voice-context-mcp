'use client';

import { useState, useEffect, useRef } from 'react';
import { getCardStyle, getCardLabel } from '@/lib/cards';

const CHUNK_SEC = 30;
const MICRO_CHUNK_SEC = 0.08; // 80ms chunks for realtime transcription
const TARGET_SAMPLE_RATE = 16000;
const RECENT_CONTEXT_WINDOW = 6;
const CORRECTION_OVERLAP_BEFORE = 3; // 前チャンクとのオーバーラップ件数（コンテクスト用）
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const getScribeWsUrl = () => {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${BASE_PATH}/ws/transcribe`;
};

const getSessionEndpoint = (token) =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}${BASE_PATH}/api/session/${token}`;

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// float32 PCM をリサンプリングして WAV に包む（30秒チャンク用）
const float32ToWav = (samples, inputSampleRate) => {
  const resampled = resampleToFloat32(samples, inputSampleRate);
  const dataSize = resampled.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

// 線形補間で TARGET_SAMPLE_RATE にリサンプリング
const resampleToFloat32 = (samples, inputSampleRate) => {
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = idx + 1 < samples.length
      ? samples[idx] * (1 - frac) + samples[idx + 1] * frac
      : samples[idx];
  }
  return out;
};

function SessionBanner({ token }) {
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedClaude, setCopiedClaude] = useState(false);
  const endpoint = getSessionEndpoint(token);
  const curlCmd = `curl ${endpoint}`;
  const claudeCmd = `claude "$(curl -s ${endpoint})"`;

  const copy = (text, setCopied) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
      <p className="text-xs font-semibold text-indigo-500 mb-1">Claude Code と連携する</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono bg-white border border-indigo-100 rounded-lg px-3 py-2 text-gray-600 truncate">
          {curlCmd}
        </code>
        <button
          onClick={() => copy(curlCmd, setCopiedCurl)}
          className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            copiedCurl
              ? 'bg-green-100 text-green-600'
              : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
          }`}
        >
          {copiedCurl ? '✓' : 'curl'}
        </button>
        <button
          onClick={() => copy(claudeCmd, setCopiedClaude)}
          className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            copiedClaude
              ? 'bg-green-100 text-green-600'
              : 'bg-gray-900 text-white hover:bg-gray-700'
          }`}
        >
          {copiedClaude ? '✓' : 'claude'}
        </button>
      </div>
    </div>
  );
}

function CardItem({ item, onConfirm, onResponse }) {
  const style = getCardStyle(item.card.type);
  const typeLabel = getCardLabel(item.card.type);
  const isConfirmation = item.card.type === 'confirmation';
  const isTopicGuess = item.card.type === 'topic_guess';

  return (
    <div
      className="w-full rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-4 transition-all duration-500"
      style={{ opacity: item.visible ? 1 : 0, transform: item.visible ? 'translateY(0)' : 'translateY(12px)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
          {item.card.emoji} {typeLabel}
        </span>
        <span className="text-xs text-gray-300">{item.timestamp}</span>
      </div>
      <p className="text-gray-800 text-sm leading-relaxed font-medium mb-3">{item.card.text}</p>

      {isTopicGuess && item.card.choices?.length > 0 && item.confirmed === null && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {item.card.choices.map((choice, i) => (
              <button
                key={i}
                onClick={() => {
                  onResponse(item.card.text, choice);
                  onConfirm(item.id, choice, true);
                }}
                className="text-xs font-medium py-2 px-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-100 hover:bg-amber-100 active:bg-amber-200 transition-colors text-left leading-snug"
              >{choice}</button>
            ))}
          </div>
          <button
            onClick={() => {
              onResponse(item.card.text, 'どれも違う');
              onConfirm(
                item.id,
                `「${item.card.text}」の選択肢（${item.card.choices.join(' / ')}）はどれも違う`,
                false
              );
            }}
            className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 py-1.5 transition-colors"
          >どれも違う</button>
        </>
      )}
      {isTopicGuess && item.confirmed === true && (
        <p className="text-xs text-amber-600 font-medium">🎯 {item.confirmedText ?? '選択済み'}</p>
      )}
      {isTopicGuess && item.confirmed === false && (
        <p className="text-xs text-gray-400 font-medium">どれも違う</p>
      )}

      {isConfirmation && item.confirmed === null && (
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(item.id, item.card.text, true)}
            className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
          >Yes</button>
          <button
            onClick={() => onConfirm(item.id, item.card.text, false)}
            className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >No</button>
        </div>
      )}
      {isConfirmation && item.confirmed === true && (
        <p className="text-xs text-green-600 font-medium">✓ 確認済み</p>
      )}
      {isConfirmation && item.confirmed === false && (
        <p className="text-xs text-gray-400 font-medium">✗ 違う</p>
      )}
    </div>
  );
}

export default function KoekeiPrototype() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioSource, setAudioSource] = useState('mic');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [cards, setCards] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]);
  const [partialText, setPartialText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('cards');
  const [sessionToken, setSessionToken] = useState('');
  const [correctionText, setCorrectionText] = useState('');
  const [isUpdatingContext, setIsUpdatingContext] = useState(false);

  const sessionContextRef = useRef({ confirmed: [], rejected: [], responses: [] });
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const workletNodeRef = useRef(null);
  const timerRef = useRef(null);
  const chunkCountRef = useRef(0);
  const sendChunkRef = useRef(null);
  const sendTranscribeRef = useRef(null);
  const wsRef = useRef(null);
  const elapsedSecRef = useRef(0);
  const correctionTextRef = useRef('');
  const cardsRef = useRef([]);
  const transcriptionsRef = useRef([]);
  const sessionTokenRef = useRef('');
  const broadcastRef = useRef(null);
  const isRecordingRef = useRef(false);
  const contextRequestIdRef = useRef(0);
  const lastCorrectedIndexRef = useRef(0);

  useEffect(() => { correctionTextRef.current = correctionText; }, [correctionText]);
  useEffect(() => { elapsedSecRef.current = elapsedSec; }, [elapsedSec]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { transcriptionsRef.current = transcriptions; }, [transcriptions]);
  useEffect(() => { sessionTokenRef.current = sessionToken; }, [sessionToken]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  const syncSession = (overrides = {}) => {
    const token = sessionTokenRef.current;
    if (!token) return;
    const body = {
      transcriptions: transcriptionsRef.current,
      cards: cardsRef.current,
      correctionText: correctionTextRef.current,
      ...overrides,
    };
    fetch(`${BASE_PATH}/api/session/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  // 30s チャンクのたびに呼ばれる。トリガー位置の前後（オーバーラップ込み）の
  // 文字起こしを窓として渡し、Gemini に補正フラグメントを生成させる。
  // 出力はそのまま correctionText の末尾に append される（重複 OK）。
  const updateCorrection = async () => {
    const totalCount = transcriptionsRef.current.length;
    if (totalCount <= lastCorrectedIndexRef.current) return; // 新規なし

    const windowStart = Math.max(0, lastCorrectedIndexRef.current - CORRECTION_OVERLAP_BEFORE);
    const transcriptionWindow = transcriptionsRef.current.slice(windowStart, totalCount);

    const requestId = ++contextRequestIdRef.current;
    setIsUpdatingContext(true);
    const ctx = sessionContextRef.current;
    const body = {
      transcriptionWindow,
      confirmed: ctx.confirmed.slice(-RECENT_CONTEXT_WINDOW),
      rejected: ctx.rejected.slice(-RECENT_CONTEXT_WINDOW),
      responses: ctx.responses.slice(-RECENT_CONTEXT_WINDOW),
    };

    try {
      const res = await fetch(`${BASE_PATH}/api/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (requestId !== contextRequestIdRef.current) return;
      if (res.ok && data.fragment) {
        setCorrectionText((prev) => {
          const next = prev ? `${prev}\n\n${data.fragment}` : data.fragment;
          correctionTextRef.current = next;
          syncSession({ correctionText: next });
          return next;
        });
        lastCorrectedIndexRef.current = totalCount;
      }
    } catch (e) {
      console.error('[koekei] correction更新エラー:', e);
    } finally {
      if (requestId === contextRequestIdRef.current) setIsUpdatingContext(false);
    }
  };

  // 80ms ごとに float32 PCM を WebSocket で送信
  useEffect(() => {
    sendTranscribeRef.current = (pcmFloat32, nativeSampleRate) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const resampled = resampleToFloat32(pcmFloat32, nativeSampleRate);
      ws.send(resampled.buffer);
    };
  });

  // 30 秒ごとにカード生成
  useEffect(() => {
    sendChunkRef.current = async (audioBlob) => {
      const capturedToken = sessionTokenRef.current;
      const no = ++chunkCountRef.current;
      console.log(`[koekei] sendChunk #${no} size=${audioBlob.size} bytes`);

      try {
        setIsProcessing(true);
        const timestamp = fmt(elapsedSecRef.current);

        const cardsForm = new FormData();
        cardsForm.append('audio', audioBlob, 'audio.wav');
        cardsForm.append('correctionText', correctionTextRef.current);

        const [cardsRes] = await Promise.all([
          fetch(`${BASE_PATH}/api/cards`, { method: 'POST', body: cardsForm }),
          updateCorrection(),
        ]);
        if (sessionTokenRef.current !== capturedToken) return;

        const cardsData = await cardsRes.json();
        if (sessionTokenRef.current !== capturedToken) return;

        if (!cardsRes.ok) {
          setErrorMsg(`カードエラー: ${cardsData.error}`);
        } else if (cardsData.cards?.length > 0) {
          showNewCards(cardsData.cards, timestamp, `${Date.now()}`);
        }
      } catch (e) {
        console.error(`[koekei] #${no} エラー:`, e);
        setErrorMsg(`エラー: ${e.message}`);
      } finally {
        setIsProcessing(false);
      }
    };
  });

  const showNewCards = (rawCards, timestamp, idPrefix) => {
    const newItems = rawCards.map((card, i) => ({
      id: `${idPrefix}-${i}`,
      card,
      timestamp,
      visible: false,
      confirmed: null,
    }));
    setCards((prev) => {
      const next = [...newItems, ...prev];
      syncSession({ cards: next });
      return next;
    });
    newItems.forEach(({ id }, i) => {
      setTimeout(() => {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, visible: true } : c)));
      }, 50 + i * 200);
    });
  };

  const resetSession = () => {
    setErrorMsg('');
    setCards([]);
    setTranscriptions([]);
    sessionContextRef.current = { confirmed: [], rejected: [], responses: [] };
    setCorrectionText('');
    correctionTextRef.current = '';
    lastCorrectedIndexRef.current = 0;
    chunkCountRef.current = 0;
    setElapsedSec(0);
  };

  const startRecording = async () => {
    resetSession();
    const token = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    setSessionToken(token);
    sessionTokenRef.current = token;

    try {
      console.log(`[koekei] 音声取得開始 source=${audioSource}`);
      let stream;
      if (audioSource === 'tab') {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        stream.getVideoTracks().forEach((t) => t.stop());
        if (stream.getAudioTracks().length === 0) {
          throw new Error('タブのオーディオ共有が選択されませんでした。「オーディオを共有」にチェックしてください。');
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      await audioCtx.audioWorklet.addModule(`${BASE_PATH}/pcm-recorder-processor.js`);

      const source = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-recorder');
      workletNodeRef.current = workletNode;

      workletNode.port.postMessage({
        type: 'configure',
        targetSamples: Math.floor(audioCtx.sampleRate * CHUNK_SEC),
        microTargetSamples: Math.floor(audioCtx.sampleRate * MICRO_CHUNK_SEC),
      });

      workletNode.port.onmessage = (e) => {
        if (e.data.type === 'micro-segment') {
          sendTranscribeRef.current(e.data.pcm, audioCtx.sampleRate);
        } else if (e.data.type === 'segment') {
          const wavBlob = float32ToWav(e.data.pcm, audioCtx.sampleRate);
          sendChunkRef.current(wavBlob);
        }
      };

      source.connect(workletNode);
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
      setIsRecording(true);

      connectTranscribeSocket(token);
    } catch (e) {
      console.error('[koekei] 音声取得失敗:', e);
      if (e.name === 'NotAllowedError') {
        setErrorMsg(
          audioSource === 'tab'
            ? 'タブの共有がキャンセルされました。'
            : 'マイクの許可が必要です。ブラウザの設定で許可してください。'
        );
      } else {
        setErrorMsg(`音声取得失敗: ${e.message}`);
      }
    }
  };

  const connectTranscribeSocket = (token) => {
    const ws = new WebSocket(getScribeWsUrl());
    wsRef.current = ws;
    ws.onmessage = (e) => {
      if (sessionTokenRef.current !== token) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'final' && msg.text?.trim()) {
          const timestamp = fmt(elapsedSecRef.current);
          setTranscriptions((prev) => {
            const next = [...prev, { text: msg.text.trim(), timestamp }];
            syncSession({ transcriptions: next });
            return next;
          });
          setPartialText('');
        } else if (msg.type === 'partial' && msg.text?.trim()) {
          setPartialText(msg.text.trim());
        }
      } catch {
        const text = typeof e.data === 'string' ? e.data : '';
        if (text.trim()) {
          const timestamp = fmt(elapsedSecRef.current);
          setTranscriptions((prev) => {
            const next = [...prev, { text: text.trim(), timestamp }];
            syncSession({ transcriptions: next });
            return next;
          });
        }
      }
    };
    ws.onerror = () =>
      setErrorMsg('WebSocket に接続できません。サーバーが起動しているか確認してください。');
    ws.onclose = () => console.log('[koekei] Scribe WS closed');
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    setIsRecording(false);
    const workletNode = workletNodeRef.current;
    const audioCtx = audioCtxRef.current;
    const stream = streamRef.current;
    workletNode?.port.postMessage({ type: 'flush' });
    setTimeout(() => {
      workletNode?.disconnect();
      audioCtx?.close();
      stream?.getTracks().forEach((t) => t.stop());
    }, 300);
    wsRef.current?.close();
    wsRef.current = null;
    setPartialText('');
  };

  const dismissCard = (id) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, visible: false } : c)));
    setTimeout(() => {
      setCards((prev) => {
        const next = prev.filter((c) => c.id !== id);
        syncSession({ cards: next });
        return next;
      });
    }, 500);
  };

  // カード操作は反応ログに蓄えるだけ。補正文の更新は 30s チャンクの
  // updateCorrection で一括してまとめて反映される。
  const handleConfirm = (id, text, yes) => {
    setCards((prev) => {
      const next = prev.map((c) =>
        c.id === id
          ? { ...c, confirmed: yes, confirmedText: typeof yes === 'boolean' && yes ? text : undefined }
          : c
      );
      syncSession({ cards: next });
      return next;
    });
    setTimeout(() => dismissCard(id), 900);
    const ctx = sessionContextRef.current;
    sessionContextRef.current = yes
      ? { ...ctx, confirmed: [...ctx.confirmed, text] }
      : { ...ctx, rejected: [...ctx.rejected, text] };
  };

  const handleResponse = (cardText, reply) => {
    const ctx = sessionContextRef.current;
    sessionContextRef.current = { ...ctx, responses: [...ctx.responses, { card: cardText, reply }] };
  };

  // BroadcastChannel: compact popup と双方向同期
  useEffect(() => {
    const ch = new BroadcastChannel('koekei-session');
    broadcastRef.current = ch;
    ch.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'request-state') {
        ch.postMessage({
          type: 'state',
          cards: cardsRef.current,
          isRecording: isRecordingRef.current,
          elapsedSec: elapsedSecRef.current,
          sessionToken: sessionTokenRef.current,
        });
      } else if (msg.type === 'tick') {
        /* elapsedSec専用チャンネル */
      } else if (msg.type === 'confirm') {
        handleConfirm(msg.id, msg.text, msg.yes);
      } else if (msg.type === 'response') {
        handleResponse(msg.cardText, msg.reply);
      } else if (msg.type === 'dismiss') {
        dismissCard(msg.id);
      } else if (msg.type === 'toggle-recording') {
        if (isRecordingRef.current) stopRecording();
        else startRecording();
      }
    };
    return () => ch.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 重い state は変化時のみ送る（毎秒の elapsedSec 変化で送らない）
  useEffect(() => {
    broadcastRef.current?.postMessage({
      type: 'state',
      cards,
      isRecording,
      elapsedSec: elapsedSecRef.current,
      sessionToken,
    });
  }, [cards, isRecording, sessionToken]);

  // elapsedSec は軽量 tick だけ送る
  useEffect(() => {
    if (!isRecording) return;
    broadcastRef.current?.postMessage({ type: 'tick', elapsedSec });
  }, [elapsedSec, isRecording]);

  const hasCards = cards.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">koekei</h1>
          <p className="text-xs text-gray-400">声から問いが生まれる</p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isRecording && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {fmt(elapsedSec)}
            </div>
          )}
          {(isProcessing || isUpdatingContext) && (
            <span className="text-xs text-blue-400">処理中</span>
          )}
          <button
            onClick={() => window.open('/compact', 'koekei-compact', 'width=380,height=260,resizable=yes,scrollbars=no')}
            title="コンパクト表示を開く"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M3 9h6" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {sessionToken && <SessionBanner token={sessionToken} />}
        {errorMsg && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className={`flex flex-col items-center ${hasCards ? 'mb-6' : 'mt-16 mb-16'}`}>
          {!isRecording && (
            <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-full">
              {[['mic', 'マイク'], ['tab', 'タブ音声']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setAudioSource(val)}
                  className={`text-xs font-medium px-4 py-1.5 rounded-full transition-all ${
                    audioSource === val ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                  }`}
                >{label}</button>
              ))}
            </div>
          )}
          {!isRecording && !hasCards && (
            <p className="text-sm text-gray-400 text-center mb-8 leading-relaxed">
              {audioSource === 'tab'
                ? <>タブを選んで、<br />アイデアのカードが届きます</>
                : <>話し始めると、<br />アイデアのカードが届きます</>}
            </p>
          )}

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`relative flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none ${
              isRecording
                ? 'w-16 h-16 bg-red-500 shadow-lg shadow-red-200'
                : 'w-20 h-20 bg-gray-900 shadow-xl hover:bg-gray-700'
            }`}
          >
            {isRecording ? (
              <span className="w-5 h-5 bg-white rounded-sm" />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0014 0" />
                <line x1="12" y1="21" x2="12" y2="17" />
                <line x1="8" y1="21" x2="16" y2="21" />
              </svg>
            )}
            {isRecording && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-400 opacity-40" style={{ animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span className="absolute inset-0 rounded-full bg-red-300 opacity-20" style={{ animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.4s' }} />
              </>
            )}
          </button>

          {!isRecording && !hasCards && (
            <button onClick={startRecording} className="mt-4 text-xs text-gray-400 underline underline-offset-2">
              タップして開始
            </button>
          )}
        </div>

        {(transcriptions.length > 0 || (isRecording && partialText)) && (
          <div className="mb-4 px-4 py-3 bg-white border border-gray-100 rounded-xl">
            <p className="text-xs text-gray-400 mb-2">文字起こし</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {transcriptions.map((t) => t.text).join(' ')}
              {isRecording && partialText && (
                <span className="text-gray-400 italic animate-pulse"> {partialText}</span>
              )}
            </p>
          </div>
        )}

        {hasCards && (
          <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-full">
            {[['cards', 'カード'], ['context', '文字起こし補正文']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setActiveTab(val)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-full transition-all ${
                  activeTab === val ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                }`}
              >{label}</button>
            ))}
          </div>
        )}

        {activeTab === 'cards' && hasCards && (
          <div className="flex flex-col gap-3">
            {cards.map((item) => (
              <CardItem
                key={item.id}
                item={item}
                onConfirm={handleConfirm}
                onResponse={handleResponse}
              />
            ))}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="px-4 py-4 bg-white border border-gray-100 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500">文字起こし補正文</p>
              {isUpdatingContext && (
                <span className="text-xs text-blue-400 animate-pulse">更新中...</span>
              )}
            </div>
            {correctionText ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{correctionText}</p>
            ) : (
              <p className="text-sm text-gray-300">30秒ごとに文字起こしが補正・整理されて累積表示されます</p>
            )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
