import { vi, type MockInstance } from 'vitest';

/**
 * Spy on `console.error` and swallow what it is handed, for the length of one test.
 *
 * Several paths in the port *warn and repair* rather than fail — a `lateStart` below zero is
 * clamped and reported, a `styleDef` with no name is skipped and reported — so a test that
 * exercises one legitimately produces output. Spying on it is how those tests keep the
 * suite's own output readable, and it is also how a test can assert that the reason WAS
 * reported.
 *
 * The idiom was `vi.spyOn(console, 'error').mockImplementation(() => {})` in five places,
 * which is an empty function literal and therefore a `no-empty-function` finding each time.
 * `mockReturnValue(undefined)` is the same spy with no function literal at all: `vi.spyOn`
 * calls through by default, and setting a return value is what replaces that implementation.
 * Restoring is the caller's job, exactly as it was — `spy.mockRestore()`.
 */
export function silenceConsoleError(): MockInstance<typeof console.error> {
  return vi.spyOn(console, 'error').mockReturnValue(undefined);
}
