import fs from 'fs';
import path from 'path';

const STORE_PATH = path.join(process.cwd(), '.koekei-sessions.json');
const TMP_PATH = `${STORE_PATH}.tmp`;
const TTL_MS = 2 * 60 * 60 * 1000;

const readStore = () => {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
};

// 書き込みを直列化し、プロセス内の並行更新で失われないようにする
let writeQueue = Promise.resolve();
const writeStore = (store) => {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve) => {
        try {
          fs.writeFileSync(TMP_PATH, JSON.stringify(store));
          fs.renameSync(TMP_PATH, STORE_PATH);
        } catch (e) {
          console.error('[koekei] sessionStore write error:', e);
        }
        resolve();
      })
  );
  return writeQueue;
};

export const setSession = (token, data) => {
  const store = readStore();
  store[token] = { ...data, updatedAt: Date.now() };
  return writeStore(store);
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
