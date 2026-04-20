/**
 * Generate SVG polyline points for a sparkline from answer history.
 * Converts boolean history to cumulative accuracy, maps to SVG coordinates.
 */
export function sparklinePoints(history: boolean[], width = 80, height = 24): string {
  if (history.length === 0) return ''

  const points: string[] = []
  let correct = 0

  for (let i = 0; i < history.length; i++) {
    if (history[i]) correct++
    const accuracy = correct / (i + 1)
    const x = (i / Math.max(history.length - 1, 1)) * width
    const y = height - accuracy * height
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }

  return points.join(' ')
}
