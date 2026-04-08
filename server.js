'use strict';

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, port });
const handle = app.getRequestHandler();

const EL_WS_URL =
  'wss://api.elevenlabs.io/v1/speech-to-text/realtime' +
  '?model_id=scribe_v2_realtime' +
  '&audio_format=pcm_16000' +
  '&language_code=ja' +
  '&commit_strategy=vad';

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  const upgradeHandler = app.getUpgradeHandler?.();

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (pathname === '/ws/transcribe') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (upgradeHandler) {
      upgradeHandler(req, socket, head);
    }
  });

  wss.on('connection', (clientWs) => {
    console.log('[scribe] client connected');

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'ELEVENLABS_API_KEY not set' }));
      clientWs.close();
      return;
    }

    const elWs = new WebSocket(EL_WS_URL, {
      headers: { 'xi-api-key': apiKey },
    });

    elWs.on('open', () => {
      console.log('[scribe] ElevenLabs connected');
    });

    elWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.message_type) {
          case 'session_started':
            console.log('[scribe] session started:', msg.session_id);
            break;
          case 'partial_transcript':
            if (msg.text && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'partial', text: msg.text }));
            }
            break;
          case 'committed_transcript':
            if (msg.text && clientWs.readyState === WebSocket.OPEN) {
              console.log('[scribe] committed:', msg.text);
              clientWs.send(JSON.stringify({ type: 'final', text: msg.text }));
            }
            break;
          default:
            if (msg.error) console.error('[scribe] EL error:', msg.message_type, msg.error);
        }
      } catch (e) {
        console.error('[scribe] parse error:', e);
      }
    });

    elWs.on('close', () => {
      console.log('[scribe] ElevenLabs disconnected');
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    elWs.on('error', (err) => {
      console.error('[scribe] ElevenLabs WS error:', err.message);
    });

    // Receive float32 PCM binary from browser → convert to int16 → base64 → ElevenLabs
    clientWs.on('message', (data) => {
      if (elWs.readyState !== WebSocket.OPEN) return;

      // data is a Buffer of float32 PCM at 16kHz mono
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

      // float32 → int16
      const int16 = new Int16Array(floats.length);
      for (let i = 0; i < floats.length; i++) {
        const s = Math.max(-1, Math.min(1, floats[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const audio_base_64 = Buffer.from(int16.buffer).toString('base64');

      elWs.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64,
        commit: false,
        sample_rate: 16000,
      }));
    });

    clientWs.on('close', () => {
      console.log('[scribe] client disconnected');
      if (elWs.readyState === WebSocket.OPEN) elWs.close();
    });

    clientWs.on('error', (err) => {
      console.error('[scribe] client WS error:', err.message);
    });
  });

  server.listen(port, () => {
    console.log(`[voice-context-mcp] ready on http://localhost:${port}`);
  });
});
