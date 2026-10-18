// Deterministic questionnaire workflow. Ships with a clearly labelled placeholder;
// an approved, validated instrument drops in as JSON after rights review.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../state/session';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Loading } from '../../components/Controls';
import { ContactList } from '../../components/SafetyPanel';
import type { Instrument, ScreeningResult } from '../../types';

export function Questionnaire() {
  const api = useApi();
  const toast = useToast();
  const [inst, setInst] = useState<Instrument | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<ScreeningResult | null>(null);
  useEffect(() => { api.mother.instruments().then((l) => setInst(l[0])).catch((e) => toast(e.message)); }, [api, toast]);
  if (!inst) return <Loading />;

  const item = inst.items[i];
  const answer = async (score: number | null) => {
    const next = { ...answers, [item.id]: score };
    setAnswers(next);
    if (i < inst.items.length - 1) { setI(i + 1); return; }
    try { setResult(await api.mother.submitScreening(inst.instrumentId, next)); } catch (e) { toast((e as Error).message); }
  };

  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">{inst.title}</h1><p className="callout callout--caution">{inst.notice}</p></div>
      {!result ? (
        <Glass>
          <div className="stack stack--lg">
            <div className="steps" aria-label={`Question ${i + 1} of ${inst.items.length}`}>{inst.items.map((it, k) => <span key={it.id} data-done={k <= i} />)}</div>
            <span className="faint">Thinking about {inst.recallPeriod}</span>
            <h2 className="subtitle">{item.text}</h2>
            <div className="stack">
              {item.options.map((o) => <button key={o.label} className="btn btn--ghost btn--block" style={{ justifyContent: 'flex-start' }} onClick={() => answer(o.score)}>{o.label}</button>)}
              <button className="link-btn" onClick={() => answer(null)}>Prefer not to answer</button>
            </div>
            {i > 0 && <button className="link-btn" onClick={() => setI(i - 1)}>Previous question</button>}
          </div>
        </Glass>
      ) : (
        <>
          {result.safetyTriggered && result.support && (
            <Glass variant="glass--urgent" role="alert">
              <div className="stack stack--lg">
                <h2 className="title">You don't have to carry this alone</h2>
                <p>Talking to someone today can really help. These lines are free and confidential.</p>
                <ContactList support={result.support} which="support" />
                <p className="faint">Embrace has not contacted anyone. You choose who to reach out to.</p>
              </div>
            </Glass>
          )}
          <Glass variant="glass--tint">
            <div className="stack">
              {result.total != null && <p className="faint">Total {result.total}. {result.band?.label}.</p>}
              <p style={{ fontSize: 'var(--t-lg)' }}>{result.followUp}</p>
              {result.bandNote && <p className="faint">{result.bandNote} Instrument {result.instrumentId} v{result.instrumentVersion} ({result.instrumentStatus}).</p>}
              <div className="row wrap"><Link className="btn" to="/me">Back to my space</Link><Link className="btn btn--ghost" to="/help">See support options</Link></div>
            </div>
          </Glass>
        </>
      )}
    </>
  );
}
