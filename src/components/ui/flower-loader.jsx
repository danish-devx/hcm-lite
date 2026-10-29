"use client";

import { useEffect, useRef, useState } from "react";

// 5 outer petals at 72° steps + a second smaller layer rotated 36°,
// each with its own translateZ so petals overlap with real depth.
const OUTER_PETALS = [
  { angle: 0, z: 6 },
  { angle: 72, z: 0 },
  { angle: 144, z: 14 },
  { angle: 216, z: 4 },
  { angle: 288, z: 10 },
];

const INNER_PETALS = [
  { angle: 36, z: 2 },
  { angle: 108, z: 12 },
  { angle: 180, z: 0 },
  { angle: 252, z: 8 },
  { angle: 324, z: 16 },
];

export default function Flower({ size = 300 }) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const reduceMotion = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduceMotion.current = mq.matches;
      if (mq.matches) setTilt({ rx: 0, ry: 0 });
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function handleMove(event) {
    if (reduceMotion.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    // values are in [-0.5, 0.5] → max ±12deg
    setTilt({
      rx: Number((-y * 24).toFixed(2)),
      ry: Number((x * 24).toFixed(2)),
    });
  }

  function handleLeave() {
    setTilt({ rx: 0, ry: 0 });
  }

  return (
    <div className="flower-scale" style={{ width: size, height: size }} aria-hidden="true">
      <div className="flower-scene" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <div
          className="flower-tilt"
          style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
        >
          <div className="flower-spin">
            {INNER_PETALS.map(({ angle, z }) => (
              <span
                key={`inner-${angle}`}
                className="flower-petal flower-petal--inner"
                style={{ transform: `rotate(${angle}deg) translateZ(${z}px)` }}
              />
            ))}
            {OUTER_PETALS.map(({ angle, z }) => (
              <span
                key={`outer-${angle}`}
                className="flower-petal"
                style={{ transform: `rotate(${angle}deg) translateZ(${z}px)` }}
              />
            ))}
            <span className="flower-center" />
          </div>
        </div>
      </div>
    </div>
  );
}