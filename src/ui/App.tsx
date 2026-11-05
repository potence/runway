import { AppShell } from './components/AppShell';
import { StartScreen } from './screens/StartScreen';
import { DataReviewScreen } from './screens/DataReviewScreen';
import { FloorPlanScreen } from './screens/FloorPlanScreen';
import { ScenariosScreen } from './screens/ScenariosScreen';
import { CompareScreen } from './screens/CompareScreen';
import { ReplayScreen } from './screens/ReplayScreen';
import { RushRadarScreen } from './screens/RushRadarScreen';
import { MethodLimitsScreen } from './screens/MethodLimitsScreen';
import { LandingScreen } from './screens/LandingScreen';
import { useAppStore } from './store/useAppStore';
import { GuidedTour } from './components/GuidedTour';

export function App() {
  const view = useAppStore((s) => s.view);
  const activeScreen = useAppStore((s) => s.activeScreen);

  if (view === 'landing') return (<><LandingScreen /><GuidedTour /></>);

  return (
    <>
    <GuidedTour />
    <AppShell>
      {/* keyed so each screen change replays the fade-in */}
      <div key={activeScreen} className="fade-in">
        {activeScreen === 'start' && <StartScreen />}
        {activeScreen === 'review' && <DataReviewScreen />}
        {activeScreen === 'floorplan' && <FloorPlanScreen />}
        {activeScreen === 'scenarios' && <ScenariosScreen />}
        {activeScreen === 'compare' && <CompareScreen />}
        {activeScreen === 'replay' && <ReplayScreen />}
        {activeScreen === 'radar' && <RushRadarScreen />}
        {activeScreen === 'method' && <MethodLimitsScreen />}
      </div>
    </AppShell>
    </>
  );
}
