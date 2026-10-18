import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { config } from '../../config';
import { createLiveApi } from '../../api/live';
import { createMockApi } from '../../api/mock/mockApi';
import { Backdrop } from '../../components/Layout';
import type { SharedBabyView as SharedBabyViewData } from '../../types';

export function SharedBabyView() {
  const { token = '' } = useParams();
  const [data, setData] = useState<SharedBabyViewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = config.apiMode === 'mock'
      ? createMockApi('viewer')
      : createLiveApi({ token: '', uid: 'shared-viewer', infantId: null, motherId: null });
    api.viewSharedBaby(token).then(setData).catch((reason: Error) => setError(reason.message));
  }, [token]);

  return (
    <>
      <Backdrop />
      <div className="shell" data-module="baby">
        <main className="screen" style={{ paddingBottom: 32 }}>
          <span className="eyebrow">READ-ONLY FAMILY VIEW</span>
          <h1 className="title">{data?.infantName ?? 'Care timeline'}</h1>
          {error && <p className="callout callout--caution">{error}</p>}
          {data && <section className="glass"><div className="stack stack--lg">
            <p className="faint">Recent care logs. This link closes at {new Date(data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
            {data.events.length ? <div className="list">{[...data.events].reverse().map((event, index) => <div className="item" key={`${event.startedAt}-${index}`}>
              <div className="item__body"><div className="item__title">{event.type === 'feeding' ? 'Feed' : event.type === 'sleep' ? 'Sleep' : 'Diaper'}</div><div className="faint">{new Date(event.startedAt).toLocaleString()}</div>
                <div className="small">{Object.entries(event.details).map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${String(value)}`).join(' · ')}</div>
              </div>
            </div>)}</div> : <p className="empty">No care logs in the shared period.</p>}
            <p className="faint">Viewing only. This link does not allow changes and does not include private notes.</p>
          </div></section>}
        </main>
      </div>
    </>
  );
}