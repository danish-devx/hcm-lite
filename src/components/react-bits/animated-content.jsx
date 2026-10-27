"use client";

import { motion } from "motion/react";

/**
 * React Bits style — AnimatedContent
 * Page/section enter animation (fade + rise).
 */
export function AnimatedContent({
  children,
  delay = 0,
  duration = 0.5,
  y = 18,
  className,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
