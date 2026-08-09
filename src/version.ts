/**
 * The library version, moved out of the static-only `Meico` class by T14
 * (ARCHITECTURE.md RULE M6).
 *
 * **This string is serialization-visible**: `Mei2MsmMpmConverter` writes it into the MPM
 * metadata, so changing it changes fixture bytes. It must therefore **not** be synced to
 * `package.json`'s `version`, which tracks the npm package and is a different number on
 * purpose.
 */
export const VERSION = '0.11.2';
