// Help is bundled with the app (no network, no sign-in needed), so it works
// even when everything else fails.
import { Glass } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { ContactList } from '../../components/SafetyPanel';
import { babyQuestions, motherQuestions, supportContent } from '../../api/mock/logic';

const BABY_NOW = ['breathingDifficulty', 'blueOrGreyColour', 'floppyOrHardToWake', 'seizure'];
const MOM_NOW = ['heavyBleeding', 'chestPainOrBreathless', 'severeHeadacheOrVision', 'calfPainSwelling'];

export function Help() {
  const s = supportContent('IN');
  const emergencyNumber = s.emergency[0]?.number;
  return (
    <>
      <div className="stack">
        <h1 className="title">Get help</h1>
        <p className="lede">If you think your baby or you need help now, call. You never need a recording or an app result to ask for help.</p>
      </div>
      <Glass variant="glass--urgent">
        <div className="stack stack--lg">
          <h2 className="subtitle">Emergency</h2>
          {emergencyNumber && <a className="btn btn--urgent btn--block" href={`tel:${emergencyNumber.replace(/[^\d#+]/g, '')}`}><Icon name="phone" />Call {emergencyNumber}</a>}
          <ContactList support={s} which="emergency" />
        </div>
      </Glass>

      <Glass>
        <div className="stack stack--lg">
          <h2 className="subtitle">Someone to talk to</h2>
          <ContactList support={s} which="support" />
        </div>
      </Glass>

      <Glass variant="glass--tint">
        <div className="stack">
          <h2 className="subtitle">If the crying is too much</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>{s.overwhelmedGuidance.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      </Glass>

      <Glass>
        <div className="stack">
          <h2 className="subtitle">Call emergency services if your baby has</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{babyQuestions.filter((q) => BABY_NOW.includes(q.field)).map((q) => <li key={q.field}>{q.label}</li>)}</ul>
          <h2 className="subtitle" style={{ marginTop: 12 }}>Get help quickly if you have</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{motherQuestions.filter((q) => MOM_NOW.includes(q.field)).map((q) => <li key={q.field}>{q.label}</li>)}</ul>
        </div>
      </Glass>
    </>
  );
}
