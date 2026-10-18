import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Glass, BackLink } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { useApi, useSession } from '../../state/session';

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function BabySetup() {
  const api = useApi();
  const { session, refreshProfile, signOut } = useSession();
  const nav = useNavigate();
  const [babies, setBabies] = useState([{ name: '', birthDate: '' }]);
  const [caregiverName, setCaregiverName] = useState(session?.displayName ?? '');
  const [caregiverRole, setCaregiverRole] = useState<'mother' | 'caregiver'>('mother');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const profiles = babies.map((baby) => ({ name: baby.name.trim(), birthDate: baby.birthDate }));
      if (profiles.length === 1) {
        await api.baby.createProfile({ ...profiles[0], caregiverName: caregiverName.trim(), caregiverRole });
      } else {
        await api.baby.createProfiles({ babies: profiles, caregiverName: caregiverName.trim(), caregiverRole });
      }
      const profile = await refreshProfile();
      nav(profile.role === 'mother' && !profile.motherId ? '/welcome/mother' : '/baby', { replace: true });
    } catch (e) { setError((e as Error).message || 'Could not save baby profile. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button className="link-btn" disabled={busy} onClick={async () => { await signOut(); nav('/', { replace: true }); }}>Switch account</button>
      <div className="stack"><span className="eyebrow">FIRST, YOUR LITTLE ONE(S)</span><h1 className="title">Let’s set up baby care</h1><p className="lede">Add one baby, twins, or more children. They’ll share a private household while keeping their care logs separate.</p></div>
      <Glass>
        <form className="stack stack--lg" onSubmit={submit}>
          {babies.map((baby, index) => (
            <fieldset className="field" key={index}>
              <legend className="field__label">{babies.length > 1 ? `Baby ${index + 1}` : 'Baby'}</legend>
              <div className="stack">
                <label className="field"><span className="field__label">Name</span><input className="input" autoComplete="off" required maxLength={60} value={baby.name} onChange={(e) => setBabies((current) => current.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} placeholder="Baby’s name" /></label>
                <label className="field"><span className="field__label">Date of birth</span><input className="input" type="date" required max={localToday()} value={baby.birthDate} onChange={(e) => setBabies((current) => current.map((item, i) => i === index ? { ...item, birthDate: e.target.value } : item))} /></label>
              </div>
            </fieldset>
          ))}
          <div className="row wrap">
            <button type="button" className="btn btn--soft" disabled={babies.length >= 6} onClick={() => setBabies((current) => [...current, { name: '', birthDate: current[0]?.birthDate ?? '' }])}><Icon name="plus" />Add another baby</button>
            {babies.length > 1 && <button type="button" className="btn btn--ghost btn--small" onClick={() => setBabies((current) => current.slice(0, -1))}>Remove last baby</button>}
          </div>
          <label className="field"><span className="field__label">Your name</span><input className="input" autoComplete="name" required maxLength={80} value={caregiverName} onChange={(e) => setCaregiverName(e.target.value)} placeholder="Your name" /></label>
          <fieldset className="field role-choice"><legend className="field__label">I’m setting this up as</legend>
            <label className="check"><input type="radio" name="caregiver-role" checked={caregiverRole === 'mother'} onChange={() => setCaregiverRole('mother')} /><span><strong>Baby’s mother</strong><br /><span className="faint">I’d like the option to set up a private My space next.</span></span></label>
            <label className="check"><input type="radio" name="caregiver-role" checked={caregiverRole === 'caregiver'} onChange={() => setCaregiverRole('caregiver')} /><span><strong>Family caregiver</strong><br /><span className="faint">I’m setting up baby care for our household.</span></span></label>
          </fieldset>
          <p className="faint">Your baby's records belong to your family. Embrace supports care, not a diagnosis.</p>
          {error && <p className="callout callout--urgent" role="alert">{error}</p>}
          <button className="btn btn--block" disabled={busy}>{busy ? 'Saving baby profile…' : 'Continue'}</button>
        </form>
      </Glass>
    </>
  );
}

export function MotherIntro() {
  const nav = useNavigate();
  const { session } = useSession();
  if (session?.role !== 'mother') {
    return <Glass><div className="stack"><h1 className="title">My space is for the mother</h1><p className="lede">You can continue with baby care. The mother can create her private space from this device after signing in.</p><button className="btn btn--soft" onClick={() => nav('/baby')}>Go to Baby care</button></div></Glass>;
  }
  function skip() {
    try { if (session) window.localStorage.setItem(`crysense.mother-offer-skipped.v1.${session.uid}`, 'yes'); } catch { /* ignore */ }
    nav('/baby', { replace: true });
  }
  return (
    <>
      <div className="stack"><span className="eyebrow">AND CARE FOR YOU, TOO</span><h1 className="title">Your wellbeing belongs here</h1><p className="lede">Baby care is set up. You can also create a private My space that only you can open.</p></div>
      <Glass>
        <div className="stack stack--lg">
          <div className="list">
            {[['Check-ins', 'Track how you feel, your energy, rest and support.'], ['Recovery', 'Keep notes on how your body is healing and see warning signs.'], ['Journal', 'Write or dictate private thoughts and review every word.'], ['Medicines and follow-ups', 'Keep reminders based on your clinician’s instructions.']].map(([title, blurb]) => <div className="item" key={title}><div className="item__body"><div className="item__title">{title}</div><div className="faint">{blurb}</div></div></div>)}
          </div>
          <p className="callout">My space is private. Nothing is shared unless you choose to share it. These tools do not diagnose.</p>
          <button className="btn btn--block" onClick={() => nav('/setup/mother')}>Set up My space</button>
          <button className="btn btn--ghost btn--block" onClick={skip}>Maybe later</button>
        </div>
      </Glass>
    </>
  );
}

export function MotherSetup() {
  const api = useApi();
  const { session, refreshProfile } = useSession();
  const nav = useNavigate();
  const [name, setName] = useState(session?.displayName ?? '');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (session?.role !== 'mother') {
    return <Glass><div className="stack"><h1 className="title">My space is for the mother</h1><p className="lede">Only the mother can create this private profile.</p><button className="btn btn--soft" onClick={() => nav('/baby')}>Go to Baby care</button></div></Glass>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api.mother.createProfile({ name: name.trim(), ...(deliveryDate ? { deliveryDate } : {}) });
      await refreshProfile();
      nav('/me', { replace: true });
    } catch (e) { setError((e as Error).message || 'Could not create your private space. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <BackLink to="/welcome/mother" label="My space" />
      <div className="stack"><span className="eyebrow">YOUR PRIVATE SPACE</span><h1 className="title">A little room for you</h1><p className="lede">Add your name and, if you’d like, your delivery date. You can skip the date.</p></div>
      <Glass>
        <form className="stack stack--lg" onSubmit={submit}>
          <label className="field"><span className="field__label">Your name</span><input className="input" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
          <label className="field"><span className="field__label">Delivery date <span className="faint">optional</span></span><input className="input" type="date" max={localToday()} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label>
          <p className="faint">Only you can open this space. You choose if anything is shared.</p>
          {error && <p className="callout callout--urgent" role="alert">{error}</p>}
          <button className="btn btn--block" disabled={busy}>{busy ? 'Creating your space…' : 'Create My space'}</button>
        </form>
      </Glass>
    </>
  );
}