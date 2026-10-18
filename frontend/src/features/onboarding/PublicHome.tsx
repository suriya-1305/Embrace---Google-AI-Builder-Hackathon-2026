import { Icon, type IconName } from '../../components/Icon';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'bottle', title: 'Everyday care, together', text: 'Feeds, sleep and diaper changes in a clear daily record, for one baby or more.' },
  { icon: 'chart', title: 'A rhythm worth noticing', text: 'A calm view of recent care, growth and immunization history.' },
  { icon: 'heart', title: 'A little space for you', text: 'A private journal, recovery notes and Emi, your gentle AI companion.' },
];

export function PublicHome() {
  return <div className="public-home">
    <header className="public-nav"><a href="./" className="brand"><img src="/embrace-mark.svg" alt="" width="40" height="40" />Embrace</a><a className="btn btn--small" href="./#/signin">Sign in</a></header>
    <main id="main">
      <section className="public-hero" aria-labelledby="public-title">
        <img className="public-hero__image" src="/embrace-newborn.jpg" alt="A young baby looking curiously at the world" fetchPriority="high" />
        <div className="public-hero__shade" />
        <div className="public-hero__content"><span className="eyebrow">THE EARLY DAYS, TOGETHER</span><h1 id="public-title">Embrace</h1><p className="public-tagline">Care for baby.<br />Space for you.</p><p className="public-intro">Keep the little details together, notice your baby's rhythm, and make room for your own wellbeing.</p><div className="row wrap"><a className="btn" href="./#/signin">Start your family space</a><a className="public-demo-link" href="?demo=1#/signin">Explore test families <span aria-hidden="true">→</span></a></div></div>
      </section>
      <section className="public-features"><div className="page-heading"><span className="eyebrow">CARE THAT FITS THE DAY</span><h2 className="title">One less thing to hold in your head.</h2></div><div className="public-feature-grid">{FEATURES.map((feature) => <article className="public-feature" key={feature.title}><Icon name={feature.icon} /><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div></section>
      <section className="public-privacy"><Icon name="shield" /><div><h2 className="subtitle">Your family's space, thoughtfully kept.</h2><p>Private care records and permissions you control. Embrace supports everyday care, not a diagnosis.</p></div></section>
    </main>
    <footer className="public-footer"><span>Embrace · Care for baby. Space for you.</span><a href="./#/signin">Sign in</a></footer>
  </div>;
}