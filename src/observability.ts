type ClientTelemetryEvent =
  | { kind: 'client-error' | 'unhandled-rejection' }
  | { kind: 'web-vital'; metric: 'CLS' | 'INP' | 'LCP'; value: number };

function sendClientTelemetry(event: ClientTelemetryEvent) {
  const body = JSON.stringify(event);

  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/client-telemetry',
      new Blob([body], { type: 'application/json' })
    );
    return;
  }

  void fetch('/api/client-telemetry', {
    body,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);
}

export function startPrivacySafeObservability() {
  window.addEventListener('error', () => {
    sendClientTelemetry({ kind: 'client-error' });
  });
  window.addEventListener('unhandledrejection', () => {
    sendClientTelemetry({ kind: 'unhandled-rejection' });
  });

  if (!('PerformanceObserver' in window)) {
    return;
  }

  let cumulativeLayoutShift = 0;
  let interactionLatency = 0;
  let largestContentfulPaint = 0;
  const observe = (
    type: string,
    callback: (entry: PerformanceEntry) => void
  ) => {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(callback);
      });
      observer.observe({ buffered: true, type });
    } catch {
      // Older WebViews can omit individual performance entry types.
    }
  };

  observe('largest-contentful-paint', (entry) => {
    largestContentfulPaint = Math.max(largestContentfulPaint, entry.startTime);
  });
  observe('event', (entry) => {
    const duration = Number((entry as PerformanceEventTiming).duration ?? 0);
    interactionLatency = Math.max(interactionLatency, duration);
  });
  observe('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & {
      hadRecentInput?: boolean;
      value?: number;
    };
    if (!shift.hadRecentInput) {
      cumulativeLayoutShift += Number(shift.value ?? 0);
    }
  });

  window.addEventListener(
    'pagehide',
    () => {
      ([
        ['CLS', cumulativeLayoutShift],
        ['INP', interactionLatency],
        ['LCP', largestContentfulPaint],
      ] as const).forEach(([metric, value]) => {
        sendClientTelemetry({ kind: 'web-vital', metric, value });
      });
    },
    { once: true }
  );
}
