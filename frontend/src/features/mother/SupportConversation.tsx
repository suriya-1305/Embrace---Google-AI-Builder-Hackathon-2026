import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../state/session';
import { usePrefs } from '../../state/prefs';
import { MoonRecorder } from '../../components/MoonRecorder';
import { ConsentPrompt } from '../../components/ConsentPrompt';
import { Icon } from '../../components/Icon';
import { BackLink } from '../../components/Layout';
import { ApiError, type ConsentPurpose, type SupportChatMessage, type SupportChatReply } from '../../types';

export function EmiPage() {
  return <><BackLink to="/me" label="My space" /><SupportConversation initiallyOpen /></>;
}

export function SupportConversation({ journalText = '', initiallyOpen = false }: { journalText?: string; initiallyOpen?: boolean }) {
  const api = useApi();
  const { prefs } = usePrefs();
  const [open, setOpen] = useState(initiallyOpen);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [includeJournal, setIncludeJournal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastReply, setLastReply] = useState<SupportChatReply | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [consent, setConsent] = useState<{ purposes: ConsentPurpose[]; retry: () => void } | null>(null);
  const mounted = useRef(true);
  const lastMessage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { if (!journalText) setIncludeJournal(false); }, [journalText]);
  useEffect(() => { if (messages.length) lastMessage.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function requirePermissions(purposes: ConsentPurpose[]) {
    const state = await api.mother.consents();
    const missing = purposes.filter((purpose) => !state[purpose]?.granted);
    if (missing.length) throw new ApiError(403, 'Allow AI processing to continue.', 'consent_required', missing);
  }

  async function perform(action: () => Promise<void>, retry: () => void) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); }
    catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.code === 'consent_required') setConsent({ purposes: failure.purposes ?? ['ai_processing'], retry });
      else setError((failure as Error).message);
    } finally { if (mounted.current) setBusy(false); }
  }

  const send = () => {
    const text = draft.trim();
    if (!text || lastReply?.supportNow) return;
    void perform(async () => {
      await requirePermissions(['ai_processing']);
      const result = await api.mother.supportChat({ message: text, history: messages.slice(-6), journalContext: includeJournal ? journalText.slice(0, 3000) : '' });
      if (!mounted.current) return;
      setMessages((previous) => [...previous, { role: 'user', text } as SupportChatMessage, { role: 'assistant', text: result.reply } as SupportChatMessage].slice(-20));
      setLastReply(result); setDraft('');
    }, send);
  };

  const transcribe = (audio: Blob) => {
    void perform(async () => {
      await requirePermissions(['audio_capture', 'transcription', 'ai_processing']);
      const result = await api.mother.transcribeJournal({ audio, language: prefs.voiceLanguage });
      if (mounted.current) setDraft(result.transcript.slice(0, 1000));
    }, () => transcribe(audio));
  };

  function readReply() {
    if (!lastReply || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const speech = new SpeechSynthesisUtterance(lastReply.reply);
    speech.rate = 0.9;
    speech.onend = speech.onerror = () => { if (mounted.current) setSpeaking(false); };
    setSpeaking(true); window.speechSynthesis.speak(speech);
  }

  return <section className="support-conversation" aria-label="Talk with Emi">
    <div className="support-conversation__heading"><Icon name="leaf" /><div><h1 className="title">Emi</h1><p className="faint">A little room to breathe.</p></div></div>
    <p className="faint">Your Embrace AI companion, not a therapist. This conversation is not saved to your journal.</p>
    {!open ? <button className="btn btn--soft" onClick={() => setOpen(true)}><Icon name="mic" />Talk for a moment</button> : <>
      <div className="support-messages" role="log" aria-label="Conversation with Emi" aria-live="polite" aria-relevant="additions">
        {!messages.length && <p className="muted">What is on your mind right now?</p>}
        {messages.map((message, index) => <div className={`support-message support-message--${message.role}`} key={index}><span className="faint">{message.role === 'user' ? 'You' : 'Emi'}</span><p>{message.text}</p></div>)}
        {busy && <p className="faint" role="status">Working on your message...</p>}
        <div ref={lastMessage} />
      </div>
      {lastReply?.supportNow && <div className="callout" role="alert"><strong>Connect with someone who can help now</strong><div className="stack">{lastReply.support?.emergency.map((contact) => <a key={contact.number} href={`tel:${contact.number}`}>{contact.label}: {contact.number}</a>)}</div></div>}
      {lastReply && typeof window.speechSynthesis !== 'undefined' && <button className="link-btn" onClick={readReply}><Icon name="wave" />{speaking ? 'Stop reading' : 'Read reply aloud'}</button>}
      {!lastReply?.supportNow && <>
        {journalText && <label className="check"><input type="checkbox" checked={includeJournal} disabled={busy} onChange={(event) => setIncludeJournal(event.target.checked)} /><span>Include the journal text I reviewed</span></label>}
        <details className="support-voice"><summary>Speak instead</summary><MoonRecorder maxSec={30} idleLabel="Record a message" purpose="this conversation with Emi" busy={busy} onRecorded={(audio) => transcribe(audio)} /></details>
        <form className="stack" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <label className="field"><span className="field__label">Your message</span><textarea className="textarea" rows={3} maxLength={1000} disabled={busy} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="You can say as much or as little as you like." /></label>
          <button className="btn" type="submit" disabled={busy || !draft.trim()}><Icon name="share" />{busy ? 'Please wait...' : 'Send to Emi'}</button>
        </form>
      </>}
      {error && <p className="callout" role="alert">{error}</p>}
      <button className="link-btn" disabled={busy} onClick={() => { window.speechSynthesis?.cancel(); setSpeaking(false); setMessages([]); setDraft(''); setIncludeJournal(false); setLastReply(null); setError(''); setOpen(false); }}>End conversation</button>
    </>}
    {consent && <ConsentPrompt purposes={consent.purposes} onCancel={() => setConsent(null)} onGrant={async () => {
      try { for (const purpose of consent.purposes) await api.mother.setConsent(purpose, true); const retry = consent.retry; setConsent(null); retry(); }
      catch (failure) { setError((failure as Error).message); }
    }} />}
    <Link to="/help" className="faint">Find human support</Link>
  </section>;
}