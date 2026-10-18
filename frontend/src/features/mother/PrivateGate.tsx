import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../state/session';
import { Glass } from '../../components/Layout';
import { Icon } from '../../components/Icon';

export function PrivateGate({ children }: { children: ReactNode }) {
  const { session, motherUnlocked, unlockMother } = useSession();
  useEffect(() => {
    if (session?.motherId && !motherUnlocked) unlockMother();
  }, [session?.motherId, motherUnlocked, unlockMother]);

  if (!session?.motherId) {
    return (
      <Glass variant="glass--tint">
        <div className="gate">
          <span className="gate__lock"><Icon name="lock" /></span>
          <h1 className="title">This space is private</h1>
          <p className="lede">{session?.role === 'mother' ? 'Baby care is set up. When you’re ready, create a private space for your wellbeing, recovery, and journal.' : 'This private space belongs to the baby’s mother. Household caregivers can help with baby care, but cannot open it.'}</p>
          {session?.role === 'mother' && <Link className="btn btn--soft" to="/welcome/mother">Set up My space</Link>}
        </div>
      </Glass>
    );
  }
  return <>{children}</>;
}
