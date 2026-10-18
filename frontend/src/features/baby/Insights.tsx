import { useSearchParams } from 'react-router-dom';
import { Timeline } from './Timeline';
import { Patterns } from './Patterns';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';

export function Insights() {
  const [params, setParams] = useSearchParams();
  const patterns = params.get('view') === 'patterns';
  const api = useApi();
  const { session, setActiveInfant } = useSession();
  const infants = useLoad(() => api.baby.listInfants(), [api]);
  const selectedBaby = infants.data?.find((infant) => infant.id === session?.infantId);
  return <>
    <div className="page-heading"><span className="eyebrow">{selectedBaby ? `${selectedBaby.name.toUpperCase()}'S RHYTHM` : "YOUR BABY'S RHYTHM"}</span><h1 className="title">{selectedBaby ? `${selectedBaby.name}'s insights` : 'Baby insights'}</h1><p className="muted">Feeds, sleep, and little changes over time.</p></div>
    <div className="seg view-tabs" role="group" aria-label="Insights view">
      <button aria-pressed={!patterns} onClick={() => setParams({})}>Family timeline</button>
      <button aria-pressed={patterns} onClick={() => setParams({ view: 'patterns' })}>Weekly patterns</button>
    </div>
    {patterns && (infants.data?.length ?? 0) > 1 && <label className="field"><span className="field__label">Baby</span><select className="select" value={session?.infantId ?? ''} onChange={(event) => setActiveInfant(event.target.value)}>{infants.data?.map((infant) => <option value={infant.id} key={infant.id}>{infant.name}</option>)}</select></label>}
    {patterns ? <Patterns embedded /> : <Timeline embedded />}
  </>;
}