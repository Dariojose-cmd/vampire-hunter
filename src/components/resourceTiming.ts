/** Raise the Resource Timing buffer so early requests are not dropped. Never throws. */
export function raiseResourceTimingBuffer(): void {
  try {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.setResourceTimingBufferSize === 'function'
    ) {
      performance.setResourceTimingBufferSize(1000)
    }
  } catch {
    // Not measurable is handled by usePrivacySeal.
  }
}
