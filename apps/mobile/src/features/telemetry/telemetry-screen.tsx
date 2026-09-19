import { MicroCards } from './micro-cards';
import { PerformanceCard } from './performance-card';
import { ScreenShell } from './screen-shell';
import { useTelemetry } from './use-telemetry';

/** The design has no Telemetry screen of its own, so this tab is composed only of the Settings design's telemetry blocks. */
export function TelemetryScreen() {
  const { sample, reset } = useTelemetry();

  return (
    <ScreenShell>
      <PerformanceCard sample={sample} onReset={reset} />
      <MicroCards sample={sample} />
    </ScreenShell>
  );
}
