import { HashRouter, Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './state/session';
import { ThemeProvider } from './state/theme';
import { PrefsProvider } from './state/prefs';
import './modules/defs';
import { ModulesProvider } from './modules/registry';
import { RefreshProvider } from './modules/refresh';
import { Modules } from './features/shared/Modules';
import { SharedView } from './features/shared/SharedView';
import { SharedBabyView } from './features/shared/SharedBabyView';
import { GroupCommunity } from './features/shared/GroupCommunity';
import { Growth } from './features/baby/Growth';
import { Vaccines } from './features/baby/Vaccines';
import { Milestones } from './features/baby/Milestones';
import { Soothe } from './features/baby/Soothe';
import { VisitPrep } from './features/baby/VisitPrep';
import { Appointments } from './features/mother/Appointments';
import { Letter } from './features/mother/Letter';
import { ToastProvider } from './state/toast';
import { Backdrop, Shell } from './components/Layout';
import { Welcome } from './features/onboarding/Welcome';
import { PublicHome } from './features/onboarding/PublicHome';
import { Permissions } from './features/onboarding/Permissions';
import { BabySetup, MotherIntro, MotherSetup } from './features/onboarding/ProfileSetup';
import { BabyHome } from './features/baby/BabyHome';
import { VoiceLog } from './features/baby/VoiceLog';
import { BabySoundCheck } from './features/baby/BabySoundCheck';
import { Insights } from './features/baby/Insights';
import { Timeline } from './features/baby/Timeline';
import { PrivateGate } from './features/mother/PrivateGate';
import { MotherHome } from './features/mother/MotherHome';
import { CheckIn } from './features/mother/CheckIn';
import { Journal } from './features/mother/Journal';
import { EmiPage } from './features/mother/SupportConversation';
import { Recovery } from './features/mother/Recovery';
import { Medicines } from './features/mother/Medicines';
import { Questionnaire } from './features/mother/Questionnaire';
import { ShareSummary } from './features/mother/ShareSummary';
import { LactationSupport, PostpartumNutrition } from './features/mother/MotherSupport';
import { Help } from './features/shared/Help';
import { Settings } from './features/shared/Settings';
import { useEffect, type ReactNode } from 'react';

const Private = ({ children }: { children: ReactNode }) => <PrivateGate>{children}</PrivateGate>;

function Routed() {
  const { session, ready } = useSession();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname, ready]);
  if (!ready) return null;
  if (!session) {
    return (
      <Routes>
        <Route path="/" element={new URLSearchParams(window.location.search).get('mode') === 'signIn' ? <Welcome /> : <PublicHome />} />
        <Route path="/signin" element={<Welcome />} />
        <Route path="/help" element={
          <><Backdrop /><div className="shell" data-module="baby"><main className="screen" style={{ paddingBottom: 32 }}><Link to="/" className="link-btn">Back to sign in</Link><Help /></main></div></>
        } />
        <Route path="/shared/:token" element={<SharedView />} />
        <Route path="/shared-baby/:token" element={<SharedBabyView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  if (location.pathname.startsWith('/shared/')) return <Routes><Route path="/shared/:token" element={<SharedView />} /></Routes>;
  if (location.pathname.startsWith('/shared-baby/')) return <Routes><Route path="/shared-baby/:token" element={<SharedBabyView />} /></Routes>;
  if (!session.infantId && !['/setup/baby', '/help'].includes(location.pathname)) return <Navigate to="/setup/baby" replace />;
  return (
    <>
      <Backdrop />
      <Shell key={session.uid}>
        <Routes>
          <Route path="/welcome/permissions" element={<Permissions />} />
          <Route path="/setup/baby" element={<BabySetup />} />
          <Route path="/welcome/mother" element={<MotherIntro />} />
          <Route path="/setup/mother" element={<MotherSetup />} />
          <Route path="/baby" element={<BabyHome />} />
          <Route path="/baby/today" element={<Timeline todayOnly />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/community" element={<GroupCommunity />} />
          <Route path="/baby/voice" element={<VoiceLog />} />
          <Route path="/baby/cry" element={<Navigate to="/baby/sound" replace />} />
          <Route path="/baby/sound" element={<BabySoundCheck key={session.infantId} />} />
          <Route path="/baby/timeline" element={<Navigate to="/insights" replace />} />
          <Route path="/baby/patterns" element={<Navigate to="/insights?view=patterns" replace />} />
          <Route path="/baby/growth" element={<Growth />} />
          <Route path="/baby/vaccines" element={<Vaccines />} />
          <Route path="/baby/milestones" element={<Milestones />} />
          <Route path="/baby/soothe" element={<Soothe />} />
          <Route path="/baby/visit" element={<VisitPrep />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/me/appointments" element={<Private><Appointments /></Private>} />
          <Route path="/me/letter" element={<Private><Letter /></Private>} />
          <Route path="/me" element={<Private><MotherHome /></Private>} />
          <Route path="/me/checkin" element={<Private><CheckIn /></Private>} />
          <Route path="/me/journal" element={<Private><Journal /></Private>} />
          <Route path="/me/emi" element={<Private><EmiPage /></Private>} />
          <Route path="/me/recovery" element={<Private><Recovery /></Private>} />
          <Route path="/me/medicines" element={<Private><Medicines /></Private>} />
          <Route path="/me/questionnaire" element={<Private><Questionnaire /></Private>} />
          <Route path="/me/share" element={<Private><ShareSummary /></Private>} />
                    <Route path="/me/lactation" element={<Private><LactationSupport /></Private>} />
                    <Route path="/me/nutrition" element={<Private><PostpartumNutrition /></Private>} />
          <Route path="/help" element={<Help />} />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          <Route path="/profile" element={<Settings />} />
          <Route path="*" element={<Navigate to="/baby" replace />} />
        </Routes>
      </Shell>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PrefsProvider>
        <ModulesProvider>
          <RefreshProvider>
            <ToastProvider>
              <SessionProvider>
                <HashRouter>
                  <Routed />
                </HashRouter>
              </SessionProvider>
            </ToastProvider>
          </RefreshProvider>
        </ModulesProvider>
      </PrefsProvider>
    </ThemeProvider>
  );
}
