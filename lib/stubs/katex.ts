/**
 * Browser-side stub for `katex`.
 * We don’t need the heavy JS bundle in the client preview,
 * we only need the types (supplied by @types/katex) and a few
 * no-op exports so import statements compile.
 */
export function renderToString(): string {
  /* noop – server does the real rendering */
  return ""
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export const render: any = () => {}
export const version = "0.0.0"
