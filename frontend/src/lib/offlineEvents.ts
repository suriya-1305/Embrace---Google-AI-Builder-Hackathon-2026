import type { EventInput } from '../types';

const DB_NAME = 'crysense-offline.v1';
const KEY_STORE = 'keys';
const EVENT_STORE = 'events';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface KeyRecord { uid: string; key: CryptoKey }
interface EventRecord { id: string; uid: string; infantId: string; queuedAt: string; iv: Uint8Array; ciphertext: ArrayBuffer }
export interface QueuedEvent { id: string; infantId: string; queuedAt: string; input: EventInput }

function openDb(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) return Promise.reject(new Error('Encrypted offline storage is unavailable in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: 'uid' });
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const events = db.createObjectStore(EVENT_STORE, { keyPath: 'id' });
        events.createIndex('uid', 'uid', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage.'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline storage request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Offline storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Offline storage transaction was interrupted.'));
  });
}

async function userKey(uid: string): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await requestValue(db.transaction(KEY_STORE).objectStore(KEY_STORE).get(uid)) as KeyRecord | undefined;
  if (existing) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const transaction = db.transaction(KEY_STORE, 'readwrite');
  transaction.objectStore(KEY_STORE).add({ uid, key } satisfies KeyRecord);
  try {
    await transactionDone(transaction);
    return key;
  } catch {
    const winner = await requestValue(db.transaction(KEY_STORE).objectStore(KEY_STORE).get(uid)) as KeyRecord | undefined;
    if (winner) return winner.key;
    throw new Error('Could not initialize encrypted offline storage.');
  }
}

export async function queueOfflineEvent(uid: string, infantId: string, input: EventInput): Promise<string> {
  const id = input.clientRequestId ?? crypto.randomUUID();
  const queueInput = { ...input, clientRequestId: id };
  const key = await userKey(uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(uid) },
    key,
    encoder.encode(JSON.stringify(queueInput)),
  );
  const db = await openDb();
  const transaction = db.transaction(EVENT_STORE, 'readwrite');
  transaction.objectStore(EVENT_STORE).put({ id, uid, infantId, queuedAt: new Date().toISOString(), iv, ciphertext } satisfies EventRecord);
  await transactionDone(transaction);
  return id;
}

export async function listOfflineEvents(uid: string, infantId?: string): Promise<QueuedEvent[]> {
  const db = await openDb();
  const records = await requestValue(db.transaction(EVENT_STORE).objectStore(EVENT_STORE).index('uid').getAll(uid)) as EventRecord[];
  const key = await userKey(uid);
  const pending: QueuedEvent[] = [];
  for (const record of records) {
    if (infantId && record.infantId !== infantId) continue;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv, additionalData: encoder.encode(uid) },
      key,
      record.ciphertext,
    );
    pending.push({ id: record.id, infantId: record.infantId, queuedAt: record.queuedAt, input: JSON.parse(decoder.decode(plaintext)) as EventInput });
  }
  return pending.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeOfflineEvent(id: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(EVENT_STORE, 'readwrite');
  transaction.objectStore(EVENT_STORE).delete(id);
  await transactionDone(transaction);
}