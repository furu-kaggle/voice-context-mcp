'use client';

import { useState, useEffect, useRef } from 'react';
import { getCardStyle, getCardLabel, QUICK_CHOICES } from '@/lib/cards';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const getSessionEndpoint = (token) =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}${BASE_PATH}/api/session/${token}`;

export default function CompactPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pendingCard, setPendingCard] = useState(null);
  const [sessionToken, setSessionToken] = useState('');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedClaude, setCopiedClaude] = useState(false);
  const channelRef = useRef(null);

  useEffect(() => {
    const ch = new BroadcastChannel('koekei-session');
    channelRef.current = ch;

    ch.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'state') {
        setIsRecording(msg.isRecording);
        setElapsedSec(msg.elapsedSec);
        setSessionToken(msg.sessionToken ?? '');
        const pending = msg.cards?.find((c) => c.confirmed === null && c.visible);
        setPendingCard(pending ?? null);
      } else if (msg.type === 'tick') {
        setElapsedSec(msg.elapsedSec);
      }
    };

    ch.postMessage({ type: 'request-state' });
    return () => ch.close();
  }, []);

  const copy = (text, setCopied) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bc = (msg) => channelRef.current?.postMessage(msg);

  const handleConfirm = (id, text, yes) => {
    bc({ type: 'confirm', id, text, yes });
    setPendingCard(null);
  };
  const handleResponse = (cardText, reply) => bc({ type: 'response', cardText, reply });
  const handleDismiss = (id) => {
    bc({ type: 'dismiss', id });
    setPendingCard(null);
  };

  const style = pendingCard ? getCardStyle(pendingCard.card.type) : null;
  const isConfirmation = pendingCard?.card.type === 'confirmation';
  const isTopicGuess = pendingCard?.card.type === 'topic_guess';
  const typeLabel = pendingCard ? getCardLabel(pendingCard.card.type) : '';
  const endpoint = sessionToken ? getSessionEndpoint(sessionToken) : '';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm font-bold text-gray-800">koekei</span>
        {isRecording && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono text-gray-500">{fmt(elapsedSec)}</span>
          </div>
        )}
        {sessionToken && (
          <div className="ml-auto flex items-center gap-1.5 mr-2">
            <button
              onClick={() => copy(`curl ${endpoint}`, setCopiedCurl)}
              className={`text-xs font-semibold px-2 py-1 rounded-lg transition-all ${
                copiedCurl ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >{copiedCurl ? '✓' : 'curl'}</button>
            <button
              onClick={() => copy(`claude "$(curl -s ${endpoint})"`, setCopiedClaude)}
              className={`text-xs font-semibold px-2 py-1 rounded-lg transition-all ${
                copiedClaude ? 'bg-green-100 text-green-600' : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >{copiedClaude ? '✓' : 'claude'}</button>
          </div>
        )}
        <button
          onClick={() => bc({ type: 'toggle-recording' })}
          className={`${!sessionToken ? 'ml-auto' : ''} flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none ${
            isRecording ? 'w-8 h-8 bg-red-500 shadow-md shadow-red-200' : 'w-8 h-8 bg-gray-900 hover:bg-gray-700'
          }`}
        >
          {isRecording ? (
            <span className="w-2.5 h-2.5 bg-white rounded-sm" />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0014 0" />
              <line x1="12" y1="21" x2="12" y2="17" />
              <line x1="8" y1="21" x2="16" y2="21" />
            </svg>
          )}
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-3 py-3">
        {pendingCard && style ? (
          <div className="w-full rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                {pendingCard.card.emoji} {typeLabel}
              </span>
            </div>
            <p className="text-gray-800 text-sm leading-relaxed font-medium mb-3">{pendingCard.card.text}</p>

            {isTopicGuess && (
              <div className="grid grid-cols-2 gap-1.5">
                {pendingCard.card.choices?.map((choice, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      handleResponse(pendingCard.card.text, choice);
                      handleConfirm(pendingCard.id, choice, true);
                    }}
                    className="text-xs font-medium py-1.5 px-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-100 hover:bg-amber-100 transition-colors text-left leading-snug"
                  >{choice}</button>
                ))}
              </div>
            )}

            {isConfirmation && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleConfirm(pendingCard.id, pendingCard.card.text, true)}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                >Yes</button>
                <button
                  onClick={() => handleConfirm(pendingCard.id, pendingCard.card.text, false)}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >No</button>
              </div>
            )}

            {!isConfirmation && !isTopicGuess && (
              <div className="flex gap-1.5">
                {QUICK_CHOICES.map(({ label, signal }) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (signal) handleResponse(pendingCard.card.text, label);
                      handleDismiss(pendingCard.id);
                    }}
                    className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                  >{label}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-300">カード待機中...</p>
        )}
      </div>
    </div>
  );
}
