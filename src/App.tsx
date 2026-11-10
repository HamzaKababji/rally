import { Route, Routes } from 'react-router-dom';
import { IdentityGate } from './components/IdentityGate';
import { TabLayout } from './components/Layout';
import { useRealtimeSync } from './data/realtime';
import { isConfigured } from './lib/supabase';
import { HeadToHeadScreen } from './screens/HeadToHead';
import { HomeScreen } from './screens/Home';
import { LeaderboardScreen } from './screens/Leaderboard';
import { LiveScoringScreen } from './screens/LiveScoring';
import { MatchDetailScreen } from './screens/MatchDetail';
import { NewMatchScreen } from './screens/NewMatch';
import { NotFound } from './screens/NotFound';
import { PlayersScreen } from './screens/Players';
import { SetupNeeded } from './screens/SetupNeeded';

function ConfiguredApp() {
  useRealtimeSync();
  return (
    <>
      <Routes>
        <Route element={<TabLayout />}>
          <Route index element={<HomeScreen />} />
          <Route path="leaderboard" element={<LeaderboardScreen />} />
          <Route path="h2h" element={<HeadToHeadScreen />} />
          <Route path="players" element={<PlayersScreen />} />
          <Route path="m/:id/details" element={<MatchDetailScreen />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="new" element={<NewMatchScreen />} />
        <Route path="m/:id" element={<LiveScoringScreen />} />
      </Routes>
      <IdentityGate />
    </>
  );
}

export default function App() {
  return isConfigured ? <ConfiguredApp /> : <SetupNeeded />;
}
