// Seven-day observed baseline. Missing days are drawn as missing, never as zero.
import { useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { BackLink, Glass } from '../../components/Layout';
import { Loading, Segmented } from '../../components/Controls';
import { shortDay } from '../../lib/time';

type Metric = 'feeds' | 'sleep' | 'wet';

export function Patterns({ embedded = false }: { embedded?: boolean }) {
  const api = useApi();
  const b = useLoad(() => api.baby.baseline(7), [api]);
  const [metric, setMetric] = useState<Metric>('feeds');
  if (!b.data) return b.error ? <Glass><p>{b.error.message}</p></Glass> : <Loading />;
  const { days, coverage, metrics, note } = b.data;
  const value = (d: (typeof days)[number]) => (metric === 'feeds' ? d.feeds : metric === 'sleep' ? Math.round((d.sleepMin / 60) * 10) / 10 : d.wet);
  const max = Math.max(1, ...days.filter((d) => d.hasData).map(value));
  const fmt = (v: number | null, unit = '') => (v == null ? 'Not enough data' : `${v}${unit}`);

  return (
    <>
      {!embedded && <BackLink to="/insights" label="Insights" />}
      <div className="stack"><h2 className="subtitle">Last 7 days</h2><p className="muted">From your logs, with gaps shown honestly.</p></div>

      <Glass variant="glass--tint">
        <div className="row">
          <div className="ring" style={{ ['--p' as string]: coverage.percent }} role="img" aria-label={`${coverage.daysWithData} of ${coverage.totalDays} days logged`}>
            <div className="ring__inner"><span><span className="ring__value">{coverage.daysWithData}/{coverage.totalDays}</span><br /><span className="faint">days</span></span></div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <strong>{coverage.percent}% of days have logs</strong>
            <span className="muted small">Averages below use only the {metrics.averagedOverDays} complete days with logs. Days without logs are shown as gaps, not zeros.</span>
          </div>
        </div>
      </Glass>

      <Glass>
        <div className="stack stack--lg">
          <Segmented label="Show" value={metric} onChange={setMetric} options={[{ value: 'feeds', label: 'Feeds' }, { value: 'sleep', label: 'Sleep' }, { value: 'wet', label: 'Diapers' }]} />
          <span className="faint">{metric === 'feeds' ? 'Feeds per day' : metric === 'sleep' ? 'Hours of sleep logged per day' : 'Wet diapers per day'}. Striped bars are days with no logs.</span>
          <div className="bars" role="img" aria-label={`Daily ${metric} for the last 7 days`}>
            {days.map((d) => (
              <div className="bar-col" key={d.date}>
                {d.hasData ? <span className="bar-num">{value(d)}</span> : <span className="bar-num faint">none</span>}
                <div className={`bar ${d.hasData ? '' : 'bar--missing'}`} style={{ height: d.hasData ? `${Math.max(6, (value(d) / max) * 100)}%` : undefined }} title={d.hasData ? `${d.date}: ${value(d)}` : `${d.date}: no logs`} />
                <span className="bar-label">{shortDay(d.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </Glass>

      <div className="metrics">
        <div className="metric"><div className="metric__v">{fmt(metrics.feedsPerDay)}</div><div className="metric__k">feeds a day</div></div>
        <div className="metric"><div className="metric__v">{fmt(metrics.sleepHoursPerDay, ' h')}</div><div className="metric__k">sleep logged a day</div></div>
        <div className="metric"><div className="metric__v">{fmt(metrics.wetDiapersPerDay)}</div><div className="metric__k">wet diapers a day</div></div>
        <div className="metric"><div className="metric__v">{metrics.typicalFeedGapMin == null ? 'Not enough data' : `${Math.floor(metrics.typicalFeedGapMin / 60)} h ${metrics.typicalFeedGapMin % 60} m`}</div><div className="metric__k">typical gap between feeds</div></div>
      </div>
      <p className="callout">{note}</p>
    </>
  );
}
