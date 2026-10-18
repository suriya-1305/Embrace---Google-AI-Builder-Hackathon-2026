// What a doctor sees after scanning the QR: only the fields she chose, until it expires.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { config } from '../../config';
import { createLiveApi } from '../../api/live';
import { createMockApi } from '../../api/mock/mockApi';
import { Backdrop } from '../../components/Layout';
import type { CareSummaryPreview } from '../../types';

export function SharedView() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<{ summary: CareSummaryPreview; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const api = config.apiMode === 'mock' || token === 'inline' ? createMockApi('viewer') : createLiveApi({ token: '', uid: 'shared-viewer', infantId: null, motherId: null });
    api.viewShared(token, params.get('d') ?? undefined).then(setData).catch((e) => setError(e.message));
  }, [token, params]);
  return (
    <>
      <Backdrop />
      <div className="shell" data-module="mom">
        <main className="screen" style={{ paddingBottom: 32 }}>
          <h1 className="title">Shared care summary</h1>
          {error && <p className="callout callout--caution">{error}</p>}
          {data && (
            <section className="glass">
              <div className="stack stack--lg">
                <p className="faint">For {data.summary.recipientName}. Last {data.summary.periodDays} days. This view closes at {new Date(data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
                {data.summary.sections.map((s) => (
                  <div key={s.field} className="stack" style={{ gap: 4 }}><strong>{s.title}</strong><ul style={{ margin: 0, paddingLeft: 18 }} className="small">{s.lines.map((l) => <li key={l}>{l}</li>)}</ul></div>
                ))}
                <p className="faint">{data.summary.disclaimer}</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
