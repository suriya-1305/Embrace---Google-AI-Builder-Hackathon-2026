import { Link } from 'react-router-dom';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { Glass } from '../../components/Layout';
import { Loading } from '../../components/Controls';
import { allModules, useModules } from '../../modules/registry';

export function MotherHome() {
  const api = useApi();
  const { enabled } = useModules();
  const mother = useLoad(() => api.mother.getMother(), [api]);
  if (mother.error) return <Glass><p>{mother.error.message}</p></Glass>;
  if (!mother.data) return <Loading />;
  const mods = allModules().filter((m) => m.space === 'mom' && enabled.has(m.id) && m.Widget);
  const widgets = (ids: string[]) => ids.map((id) => mods.find((module) => module.id === id)).filter((module) => !!module).map((module) => { const Widget = module!.Widget!; return <Widget key={module!.id} />; });
  return (
    <>
      <div className="hero">
        <div>
          <span className="muted small">Day {mother.data.daysSinceBirth} since birth</span>
          <h1 className="hero__name">Your space, {mother.data.name}</h1>
          <span className="muted small">A moment for you. Private by default.</span>
        </div>
      </div>
      <section className="home-section"><h2 className="subtitle">How you feel</h2><div className="bento">{widgets(['checkin', 'journal', 'supportchat'])}</div></section>
      <section className="home-section"><h2 className="subtitle">Recovery & follow-ups</h2><div className="bento">{widgets(['recovery', 'medicines', 'appointments'])}</div></section>
      <section className="home-section"><h2 className="subtitle">Feeding & nourishment</h2><div className="bento">{widgets(['lactation', 'nutrition', 'hydration'])}</div></section>
      <section className="home-section"><h2 className="subtitle">Small moments & support</h2><div className="bento">{widgets(['wins', 'letter', 'questionnaire', 'partner', 'share'])}</div></section>
      <Link to="/help" className="link-btn">Find support</Link>
    </>
  );
}
