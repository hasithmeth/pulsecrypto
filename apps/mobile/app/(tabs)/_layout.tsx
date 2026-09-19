import { Tabs } from 'expo-router';
import { TabBar } from '@/ui/tab-bar';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      // Unfocused tabs stay mounted but frozen: a hidden watchlist must not spend
      // the JS thread re-rendering rows for ticks nobody can see.
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Markets' }} />
      <Tabs.Screen name="terminal" options={{ title: 'Terminal' }} />
      <Tabs.Screen name="telemetry" options={{ title: 'Telemetry' }} />
    </Tabs>
  );
}
