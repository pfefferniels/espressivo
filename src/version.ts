/**
 * The library version (ARCHITECTURE.md RULE M6).
 *
 * Serialization-visible: `Mei2MsmMpmConverter` writes it into the MPM metadata, so changing it
 * changes fixture bytes. It must therefore not be synced to `package.json`'s `version`, which
 * tracks the npm package and is a different number on purpose.
 */
export const VERSION = '0.11.2';
