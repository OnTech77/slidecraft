import { useEffect, useRef, useState } from 'react';

export const SLIDE_WIDTH = 1280;

/**
 * Render one slide at its design size (1280x720) and scale it to fit the container width.
 * Slide HTML is sanitized by the server before it reaches the client.
 */
export default function ScaledSlide({ slide, theme, number, className = '' }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / SLIDE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`scaled-slide ${className}`}>
      <div className={`scaled-slide-inner sc-theme-${theme}`} style={{ transform: `scale(${scale})` }}>
        <div className={`sc-slide sc-slide--${slide.layout}`}>
          <div className="sc-slide-content" dangerouslySetInnerHTML={{ __html: slide.html }} />
          {number != null && <div className="sc-slide-number">{number}</div>}
        </div>
      </div>
    </div>
  );
}
