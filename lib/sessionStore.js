import fs from 'fs';
import path from 'path';

// ファイルベースのセッションストア: Next.js マルチワーカー環境でも全ワーカーから参照可能
const STORE_PATH = path.join(process.cwd(), '.koekei-sessions.json');
const TTL_MS = 2 * 60 * 60 * 1000; // 2時間

const readStore = () => {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store));
  } catch (e) {
    console.error('[koekei] sessionStore write error:', e);
  }
};

export const setSession = (token, data) => {
  const store = readStore();
  store[token] = { ...data, updatedAt: Date.now() };
  writeStore(store);
};

export const getSession = (token) => {
  const store = readStore();
  const s = store[token];
  if (!s) return null;
  if (Date.now() - s.updatedAt > TTL_MS) {
    delete store[token];
    writeStore(store);
    return null;
  }
  return s;
};
