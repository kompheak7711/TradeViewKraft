import { useEffect, useRef, useState } from 'react';
import type { SymbolId, Timeframe } from '@tvk/shared-types';
import { ChartFeed, type ChartFeedSnapshot } from './chart-feed';

const EMPTY: ChartFeedSnapshot = { key: '', candles: [], feed: { status: 'idle', provider: 'mock' }, loading: true, loadingMore: false, error: null, info: null, session: null, exhausted: false, historyVersion: 0, lastUpdate: null };

/** React binding for ChartFeed. A new feed is created when symbol or timeframe changes. */
export function useChartFeed(symbol: SymbolId, timeframe: Timeframe): { snapshot: ChartFeedSnapshot; feed: ChartFeed | null } {
  const [snapshot, setSnapshot] = useState<ChartFeedSnapshot>(EMPTY);
  const feedRef = useRef<ChartFeed | null>(null);
  useEffect(() => {
    const feed = new ChartFeed(symbol, timeframe);
    feedRef.current = feed;
    setSnapshot(EMPTY);
    const unsub = feed.subscribe(setSnapshot);
    return () => {
      unsub();
      feed.dispose();
      feedRef.current = null;
    };
  }, [symbol, timeframe]);
  return { snapshot, feed: feedRef.current };
}
