import type { SafetyResult, SupportContent } from '../types';
import { Glass } from './Layout';

const HEAD: Record<string, { title: string; variant: string }> = {
  emergency: { title: 'Get emergency help now', variant: 'glass--urgent' },
  support_now: { title: 'Please reach out for support now', variant: 'glass--urgent' },
  urgent: { title: 'Get medical help today', variant: 'glass--urgent' },
  seek_advice: { title: 'Worth a call for advice', variant: 'glass--caution' },
};

export function ContactList({ support, which }: { support: SupportContent; which: 'emergency' | 'support' | 'both' }) {
  const items = which === 'both' ? [...support.emergency, ...support.support] : support[which];
  return (
    <div className="stack">
      {items.map((c) => (
        <a key={c.number} className="phone" href={`tel:${c.number.replace(/[^\d#+]/g, '')}`}>
          <span><strong>{c.label}</strong><br /><span className="faint">{c.detail}</span></span>
          <span className="phone__num">{c.number}</span>
        </a>
      ))}
    </div>
  );
}

export function SafetyPanel({ result }: { result: SafetyResult }) {
  if (result.level === 'none') return null;
  const head = HEAD[result.level];
  return (
    <Glass variant={head.variant} role="alert">
      <div className="stack stack--lg">
        <h2 className="title">{head.title}</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {result.messages.map((m) => <li key={m.ruleId}>{m.text}</li>)}
        </ul>
        {result.support && (
          <ContactList support={result.support} which={result.level === 'support_now' ? 'both' : result.level === 'seek_advice' ? 'support' : 'emergency'} />
        )}
        <p className="faint">Rules {result.rulesetId} v{result.rulesetVersion}. Clinical review: {result.clinicalReview}. These checks never depend on AI.</p>
      </div>
    </Glass>
  );
}
