import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../../config';
import { useSession } from '../../state/session';
import { mockDemoAccounts } from '../../auth/mockDemoAccounts';
import { Icon } from '../../components/Icon';
import { Backdrop } from '../../components/Layout';
import type { Me } from '../../types';

type Method = 'google' | 'email' | 'phone';

export function Welcome() {
  const { switchDemoAccount, signInGoogle, sendEmailLink, signInEmailLink, sendPhoneCode, verifyPhoneCode } = useSession();
  const nav = useNavigate();
  const [method, setMethod] = useState<Method>('google');
  const [intent, setIntent] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [emailLinkReturn, setEmailLinkReturn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoEmail, setDemoEmail] = useState<string>(mockDemoAccounts[0].email);

  useEffect(() => {
    if (config.authMode !== 'firebase') return;
    import('../../auth/firebase').then(({ hasEmailSignInLink, getEmailForSignInLink }) => {
      if (!hasEmailSignInLink()) return;
      setEmail(getEmailForSignInLink());
      setEmailLinkReturn(true);
      setMethod('email');
    }).catch(() => undefined);
  }, []);

  function continueAfterAuth(profile: Me) {
    if (!profile.infantId) nav('/setup/baby');
    else nav('/baby');
  }

  async function go(fn: () => Promise<Me>) {
    setBusy(true); setError(null);
    try {
      continueAfterAuth(await fn());
    } catch (e) { setError((e as Error).message || 'Sign-in did not complete. Try again.'); }
    finally { setBusy(false); }
  }

  async function emailAction() {
    setBusy(true); setError(null);
    try {
      if (emailLinkReturn) await go(() => signInEmailLink(email.trim()));
      else { await sendEmailLink(email.trim()); setEmailSent(true); }
    } catch (e) { setError((e as Error).message || 'Email sign-in did not complete. Try again.'); }
    finally { setBusy(false); }
  }

  async function phoneAction() {
    setBusy(true); setError(null);
    try {
      if (phoneSent) await go(() => verifyPhoneCode(code.trim()));
      else { await sendPhoneCode(`+91${phone}`); setPhoneSent(true); }
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === 'auth/too-many-requests'
        ? 'Firebase has temporarily limited SMS requests after repeated attempts. Wait before trying again, or use Email or Google sign-in.'
        : code === 'auth/invalid-app-credential'
          ? 'Verification did not complete. Open Embrace in Chrome or Edge and try again.'
          : (e as Error).message || 'Phone verification did not complete. Check the number and try again.');
    }
    finally { setBusy(false); }
  }

  return (
    <div className="shell" data-module="baby">
      <Backdrop />
      <main className="welcome" id="main">
        <div className="auth-brand">
          <img className="welcome-brand-mark" src="/embrace-mark.svg" alt="Mother holding her child" width="76" height="76" />
          <div><h1 className="display">Embrace</h1><p className="lede">Care for baby. Space for you.</p></div>
        </div>
        <div className="auth-layout">
          <section className="auth-intro">
            <span className="eyebrow">THE EARLY DAYS, TOGETHER</span>
            <h2 className="title">One place for the care you give.</h2>
            <p className="lede">Keep feeds, sleep and everyday moments together. Notice your baby's rhythm, and make room for your own wellbeing.</p>
            <p className="faint">Embrace supports your care, not a diagnosis. For urgent concerns, contact your care team or local emergency services.</p>
          </section>
          <section className="glass auth-panel">
            {config.apiMode !== 'mock' && <div className="seg auth-intent" role="group" aria-label="Account access">
              <button type="button" aria-pressed={intent === 'create'} onClick={() => setIntent('create')}>Create account</button>
              <button type="button" aria-pressed={intent === 'signin'} onClick={() => setIntent('signin')}>Sign in</button>
            </div>}
            <div className="auth-heading"><h2 className="subtitle">{config.apiMode === 'mock' ? 'Meet a sample family' : intent === 'create' ? 'Start your family space' : 'Welcome back'}</h2><p className="faint">{config.apiMode === 'mock' ? 'Fictional families. Real ways to explore Embrace.' : intent === 'create' ? 'A few details for baby. Your own space whenever you are ready.' : 'Pick up where you left off.'}</p></div>
            {config.authMode === 'firebase' ? (
              <>
                <div className="seg auth-methods" role="group" aria-label="Sign-in method">
                  <button type="button" aria-pressed={method === 'google'} onClick={() => setMethod('google')}>Google</button>
                  <button type="button" aria-pressed={method === 'email'} onClick={() => setMethod('email')}>Email</button>
                  <button type="button" aria-pressed={method === 'phone'} onClick={() => setMethod('phone')}>Phone</button>
                </div>
                {method === 'google' && <button className="btn btn--block" disabled={busy} onClick={() => go(signInGoogle)}><Icon name="person" />Continue with Google</button>}
                {method === 'email' && (
                  <div className="stack">
                    <label className="field"><span className="field__label">Email address</span><input className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
                    <button className="btn btn--block" disabled={busy || !email.trim()} onClick={() => void emailAction()}>{emailLinkReturn ? 'Finish email sign-in' : emailSent ? 'Send link again' : 'Email me a sign-in link'}</button>
                    {emailSent && <p className="callout">Check your inbox and open the sign-in link. You can enter the same email here if you open the link on another device.</p>}
                    {emailLinkReturn && <p className="faint">Confirm the email address that received the sign-in link to finish signing in.</p>}
                    {!emailLinkReturn && <p className="faint">Email uses a one-time sign-in link, not a numeric code. No password or reCAPTCHA.</p>}
                  </div>
                )}
                {method === 'phone' && (
                  <div className="stack">
                    {!phoneSent && <label className="field"><span className="field__label">Mobile number</span><span className="phone-field"><span className="phone-field__prefix" aria-hidden="true">+91</span><input className="input" type="tel" autoComplete="off" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" /></span></label>}
                    {phoneSent && <label className="field"><span className="field__label">Verification code sent to +91 {phone}</span><input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" /></label>}
                    <button className="btn btn--block" disabled={busy || (phoneSent ? code.length !== 6 : phone.length !== 10)} onClick={() => void phoneAction()}>{phoneSent ? 'Verify code' : 'Send verification code'}</button>
                    <div id="recaptcha-container" />
                    <p className="faint">Tap Send verification code, then complete Firebase’s reCAPTCHA checkbox when it appears. SMS may incur carrier charges.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="stack">
                <label className="field"><span className="field__label">Sample family</span><select className="select" value={demoEmail} onChange={(event) => { setDemoEmail(event.target.value); setError(null); }}>
                  {mockDemoAccounts.map((account) => <option key={account.uid} value={account.email}>{account.label}</option>)}
                </select></label>
                <button className="btn btn--block" disabled={busy} onClick={() => go(() => switchDemoAccount(demoEmail))}>{busy ? 'Opening family...' : 'Explore this family'}</button>
                <p className="faint">Test-family care records stay in this browser. Emi processes AI requests after your permission.</p>
              </div>
            )}
            {error && <p className="callout callout--urgent" role="alert">{error}</p>}
            {config.apiMode === 'live' ? <a className="link-btn" href="?demo=1#/signin">Explore a test family</a> : config.hostedDemo && <a className="link-btn" href="./#/signin">Back to real account sign-in</a>}
          </section>
        </div>
      </main>
    </div>
  );
}
