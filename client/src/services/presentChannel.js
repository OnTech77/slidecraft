import { useEffect, useRef } from 'react';

/**
 * The editor and the presenter tab talk over a BroadcastChannel (same origin only):
 * - presenter -> editor: { type: 'request' } when it opens
 * - editor -> presenter: { type: 'deck', deck, start? } in reply, and again whenever the deck changes
 * This keeps the presenter in sync while you edit, without a server round trip.
 */
export const PRESENT_CHANNEL = 'slidecraft-present';

export const TRANSITIONS = [
  { id: 'slide', label: 'Slide', description: 'Slides move in from the side.' },
  { id: 'fade', label: 'Fade', description: 'Slides cross-fade.' },
  { id: 'zoom', label: 'Zoom', description: 'Slides zoom gently into place.' },
  { id: 'none', label: 'None', description: 'Switch instantly.' },
];

/** URL of the presenter view, opened in a new tab. Slide numbers in the hash are 1-based. */
export const presenterUrl = (slideIndex) => `${window.location.pathname}?present#${slideIndex + 1}`;

export const isPresenterView = () => new URLSearchParams(window.location.search).has('present');

/**
 * Editor side: answer presenter requests and broadcast every deck change.
 * @param {{ title: string, slides: object[], theme: string, transition: string }} deck
 * @param {number} currentSlide where a newly opened presenter should start
 */
export function useDeckBroadcast(deck, currentSlide) {
  const latest = useRef({ deck, currentSlide });
  latest.current = { deck, currentSlide };
  const channelRef = useRef(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(PRESENT_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === 'request') {
        channel.postMessage({ type: 'deck', deck: latest.current.deck, start: latest.current.currentSlide });
      }
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  useEffect(() => {
    channelRef.current?.postMessage({ type: 'deck', deck });
  }, [deck]);
}
