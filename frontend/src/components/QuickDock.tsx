// One-handed mode: big thumb-reach buttons just above the tab bar.
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
export function QuickDock() {
  return (
    <nav className="dock" aria-label="Quick log">
      <Link to="/baby?log=feeding" aria-label="Log feeding"><Icon name="bottle" /></Link>
      <Link to="/baby?log=sleep" aria-label="Log sleep"><Icon name="sleep" /></Link>
      <Link to="/baby?log=diaper" aria-label="Log diaper"><Icon name="drop" /></Link>
      <Link to="/baby/sound" aria-label="Baby sound check"><Icon name="wave" /></Link>
    </nav>
  );
}
