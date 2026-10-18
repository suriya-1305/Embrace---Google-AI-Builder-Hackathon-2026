// The module library: switch modules on or off. Simple homes for everyone.
import { allModules, ROADMAP, useModules, type Space } from '../../modules/registry';
import { useSession } from '../../state/session';
import { Glass, BackLink } from '../../components/Layout';
import { Switch } from '../../components/Controls';
import { Icon } from '../../components/Icon';

function Section({ space, title }: { space: Space; title: string }) {
  const { enabled, toggle } = useModules();
  return (
    <Glass>
      <h2 className="subtitle">{title}</h2>
      {allModules().filter((m) => m.space === space).map((m) => (
        <div className={`lib-row hue-${m.hue}`} key={m.id}>
          <span className="tile__icon"><Icon name={m.icon} /></span>
          <div className="item__body"><div className="item__title">{m.title}</div><div className="faint">{m.blurb}</div></div>
          <Switch label={m.title} checked={enabled.has(m.id)} onChange={(v) => toggle(m.id, v)} />
        </div>
      ))}
    </Glass>
  );
}

export function Modules() {
  const { session } = useSession();
  return (
    <>
      <BackLink to="/baby" label="Home" />
      <div className="stack"><h1 className="title">Your modules</h1><p className="lede">Turn on only what helps. Your home screens show just these.</p></div>
      <Section space="baby" title="Baby care" />
      {session?.motherId && <Section space="mom" title="My space" />}
      <Glass>
        <div className="stack">
          <h2 className="subtitle">Coming next</h2>
          <p className="faint">Planned features, not available in this build.</p>
          {ROADMAP.map((r) => (
            <div className="next-card" key={r.id}>
              <span className="tile__icon"><Icon name={r.icon} /></span>
              <div><div className="item__title">{r.title}</div><div className="faint">{r.blurb}</div></div>
            </div>
          ))}
        </div>
      </Glass>
    </>
  );
}
