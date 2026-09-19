import { Tabs } from 'expo-router';
import { TabBar } from '@/ui/tab-bar';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Markets' }} />
      <Tabs.Screen name="terminal" options={{ title: 'Terminal' }} />
      <Tabs.Screen name="telemetry" options={{ title: 'Telemetry' }} />
    </Tabs>
  );
}
