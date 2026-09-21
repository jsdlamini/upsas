'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Tone = 'confirmed' | 'pending' | 'cancelled';

interface FeedItem {
  id: string;
  tone: Tone;
  title: string;
  body: string;
  actionRequired: boolean;
  createdAt: string;
  openUrl: string;
}

/** Half a minute: quick enough to feel live, cheap enough for a campus link. */
const POLL_MS = 30_000;
/** How long a balloon stays before it tidies itself away. */
const BALLOON_MS = 12_000;
const MAX_BALLOONS = 3;

/**
 * Makes the bell live without making it depend on JavaScript.
 *
 * What it adds on top of the server-rendered bell:
 *   - checks for new events every 30 seconds and whenever the tab regains focus
 *   - a bright balloon in the corner for each new event, clickable
 *   - a desktop alert, if the person has allowed them, so a new booking is
 *     seen even when this tab is behind another window
 *   - the count in the tab title, e.g. "(2) UPSAS", for a tab in the background
 *   - closes the open list on Escape or a click elsewhere
 *
 * When the set of events changes it asks the server to re-render, so the bell,
 * the list and the banners all update together from one source.
 */
export function BellLive({ initialIds }: { initialIds: string[] }) {
  const router = useRouter();
  const known = useRef(new Set(initialIds));
  const baseTitle = useRef<string | null>(null);
  const [balloons, setBalloons] = useState<FeedItem[]>([]);

  const setTitleCount = useCallback((count: number) => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = count > 0 ? `(${count > 9 ? '9+' : count}) ${baseTitle.current}` : baseTitle.current;
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; items: FeedItem[] };
      setTitleCount(data.count);

      const fresh = data.items.filter((item) => !known.current.has(item.id));
      const changed = fresh.length > 0 || data.items.length !== known.current.size;
      known.current = new Set(data.items.map((item) => item.id));
      if (!changed) return;

      if (fresh.length) {
        setBalloons((current) => [...fresh, ...current].slice(0, MAX_BALLOONS));
        for (const item of fresh) desktopAlert(item);
      }
      router.refresh();
    } catch {
      // Offline or the server restarted: the next tick tries again.
    }
  }, [router, setTitleCount]);

  useEffect(() => {
    setTitleCount(initialIds.length);
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [poll, setTitleCount, initialIds.length]);

  // Keep the known set in step with server re-renders (for example after
  // "Got it" on a banner), so a dismissed notice is not announced again.
  useEffect(() => { known.current = new Set(initialIds); setTitleCount(initialIds.length); },
    [initialIds, setTitleCount]);

  // Close the list on Escape or a click outside it.
  useEffect(() => {
    const bell = document.getElementById('bell') as HTMLDetailsElement | null;
    if (!bell) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bell.open) { bell.open = false; bell.querySelector('summary')?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (bell.open && !bell.contains(e.target as Node)) bell.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // Each balloon tidies itself away.
  useEffect(() => {
    if (!balloons.length) return;
    const timer = window.setTimeout(() => setBalloons((b) => b.slice(0, -1)), BALLOON_MS);
    return () => window.clearTimeout(timer);
  }, [balloons]);

  if (!balloons.length) return null;

  return (
    <div className="balloons" aria-live="polite">
      {balloons.map((item) => (
        <div key={item.id} className={`balloon ${item.tone}`}>
          <a href={item.openUrl} className="balloon-link">
            <span className="balloon-kind">
              <span className="mn-dot" aria-hidden="true" />
              {item.actionRequired ? 'Needs you' : 'New'}
            </span>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </a>
          <button type="button" className="balloon-close" aria-label="Close"
                  onClick={() => setBalloons((b) => b.filter((x) => x.id !== item.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function desktopAlert(item: FeedItem): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const alert = new Notification(item.title, { body: item.body, tag: item.id, icon: '/icon.svg' });
    alert.onclick = () => { window.focus(); window.location.assign(item.openUrl); alert.close(); };
  } catch {
    // Some mobile browsers only allow alerts from a service worker.
  }
}

/**
 * The switch for desktop alerts, inside the bell's list. Asking for permission
 * only when someone presses it — never on page load — is both what browsers
 * now require and what people will actually say yes to.
 */
export function AlertsToggle() {
  const [state, setState] = useState<'unsupported' | NotificationPermission | 'loading'>('loading');

  useEffect(() => {
    setState(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  }, []);

  if (state === 'loading' || state === 'unsupported') return <span />;
  if (state === 'granted') return <span className="bell-alerts on">Desktop alerts on</span>;
  if (state === 'denied') {
    return <span className="bell-alerts">Desktop alerts are blocked in this browser&apos;s site settings</span>;
  }
  return (
    <button type="button" className="link bell-alerts"
            onClick={async () => setState(await Notification.requestPermission())}>
      Turn on desktop alerts
    </button>
  );
}
