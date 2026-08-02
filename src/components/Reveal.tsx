import { useEffect, useRef, useState, type ReactNode } from 'react';

// Scroll reveal without a library. The CSS (.reveal in index.css) starts the
// element at opacity 0, so the one unacceptable outcome is a reveal that never
// fires — that hides real content. Three guards against it:
//   1. if the element is already inside the viewport when it mounts, show it
//      straight away instead of waiting for an intersection callback;
//   2. re-check on resize, because a viewport change can leave an element
//      on screen without ever producing a callback;
//   3. no IntersectionObserver at all → show immediately.
// Once shown, the observer is disconnected and nothing keeps watching.
// Movement is disabled entirely under prefers-reduced-motion (see index.css).
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;

    const inViewport = () => {
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || document.documentElement.clientHeight;
      return r.top < h && r.bottom > 0;
    };

    if (inViewport() || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);

    const onResize = () => {
      if (inViewport()) {
        setShown(true);
        io.disconnect();
      }
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-shown={shown ? 'true' : 'false'}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
