import { useState } from 'react';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Loading } from '../../components/Controls';
import { CareRecordEditor } from './CareRecordEditor';
import { Icon } from '../../components/Icon';
import { useRefresh } from '../../modules/refresh';

const BADGE = { given: ['Given', 'badge--ok'], due_now: ['Due', 'badge--assumed'], upcoming: ['Upcoming', 'badge--quiet'] } as const;

export function Vaccines() {
  const api = useApi(); const { region } = useSession(); const toast = useToast();
  const s = useLoad(() => api.baby.vaccines(region), [api, region]);
  const [editing, setEditing] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const { bump } = useRefresh();
  const fmt = (d: string) => new Date(`${d}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <>
      <BackLink to="/baby" label="Home" />
      <div className="stack"><h1 className="title">Vaccines</h1><p className="lede">Due dates come from the date of birth. Mark each dose when it is given.</p></div>
      <div className="row"><button className="btn btn--soft" disabled={editorBusy} onClick={() => setEditing(!editing)}><Icon name="edit" />{editing ? 'Close editor' : 'Edit vaccine record'}</button></div>
      {editing && <CareRecordEditor purpose="vaccination" onBusyChange={setEditorBusy} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void s.reload(); bump(); toast('Immunization history saved'); }} />}
      {s.data?.note && <p className="callout callout--caution">{s.data.note}</p>}
      <Glass>
        {!s.data ? <Loading /> : s.data.doses.length ? (
          <div className="list">{s.data.doses.map((d) => (
            <div className="item" key={d.id}>
              <div className="item__body"><div className="item__title">{d.name}</div><div className="item__meta">{d.status === 'given' ? `Given ${fmt(d.givenOn!)}` : `Due ${fmt(d.dueDate)}`}</div></div>
              <span className={`badge ${BADGE[d.status][1]}`}>{BADGE[d.status][0]}</span>
            </div>
          ))}</div>
        ) : <p className="empty">{s.data.message}</p>}
      </Glass>
    </>
  );
}
