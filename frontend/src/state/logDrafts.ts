import type { EventInput, EventType } from '../types';

const drafts = new Map<string, EventInput>();
export const logDraftKey = (uid: string, infantId: string, type: EventType) => `${uid}:${infantId}:${type}`;
export const readLogDraft = (key: string) => drafts.get(key);
export const saveLogDraft = (key: string, input: EventInput) => { drafts.set(key, input); };
export const removeLogDraft = (key: string) => { drafts.delete(key); };
export const clearLogDrafts = () => { drafts.clear(); };