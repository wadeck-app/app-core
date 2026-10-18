import { useEffect, useState } from 'react';
import { EVENTS_URL, parseTickEvent } from '../commons/items.js';

// Shows the tick counter pushed by the module's SSE route.
export function LiveTicks() {
  const [tick, setTick] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(EVENTS_URL);
    source.onmessage = (event) => {
      setTick(parseTickEvent(event.data).tick);
      setConnected(true);
    };
    // EventSource reconnects by itself, also after the module was updated; only say so.
    source.onerror = () => setConnected(false);
    // Without this the browser keeps the connection (and the module's stream) open after the unmount.
    return () => source.close();
  }, []);

  return (
    <span className="example-ticks">
      {tick === null ? 'ticks: waiting' : `ticks: ${tick}`}
      {connected ? '' : ' (reconnecting)'}
    </span>
  );
}
