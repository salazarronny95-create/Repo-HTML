import { useEffect, useState } from 'react';
import './CursorLight.css';

export default function CursorLight() {
  const [pos, setPos] = useState({ x: -200, y: -200 });

  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return;

    let rafId = null;
    const handleMove = (e) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setPos({ x: e.clientX, y: e.clientY });
      });
    };
    const handleLeave = () => setPos({ x: -200, y: -200 });
    const handleEnter = () => setPos({ x: -200, y: -200 });

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseleave', handleLeave);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseleave', handleLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      <div className="cursor-light__halo" style={{ left: pos.x, top: pos.y }} aria-hidden="true" />
      <div className="cursor-light__core" style={{ left: pos.x, top: pos.y }} aria-hidden="true" />
    </>
  );
}