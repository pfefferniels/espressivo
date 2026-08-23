/**
 * The library version (ARCHITECTURE.md RULE M6).
 *
 * It was serialization-visible until PARITY.md §9 — the converter wrote it into the MPM
 * metadata it no longer produces — and nothing writes it into a document today. It is still not
 * synced to `package.json`'s `version`: that tracks the npm package, this names the meico
 * release whose behaviour is reproduced, and they are different numbers on purpose.
 */
export const VERSION = '0.11.2';
