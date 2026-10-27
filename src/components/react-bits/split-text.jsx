"use client";

import { motion } from "motion/react";

/**
 * React Bits style — SplitText
 * Heading characters staggered animation ke saath aate hain.
 */
export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 0.028,
  once = true,
}) {
  const words = text.split(" ");
  let charIndex = 0;

  return (
    <span className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} className="inline-block whitespace-nowrap">
          {word.split("").map((char, ci) => {
            const i = charIndex++;
            return (
              <motion.span
                key={ci}
                aria-hidden="true"
                className="inline-block"
                initial={{ opacity: 0, y: 14, rotateX: -45, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
                viewport={{ once }}
                transition={{
                  duration: 0.5,
                  delay: delay + i * stagger,
                  ease: "easeOut",
                }}
              >
                {char}
              </motion.span>
            );
          })}
          {wi < words.length - 1 ? (
            <span aria-hidden="true" className="inline-block">
              &nbsp;
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
