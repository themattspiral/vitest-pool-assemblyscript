export function positiveSum<T>(items: T[], getSummableValue: (_next: T) => number | undefined): number {
  return items.reduce((total, next) => {
    return total + Math.max(getSummableValue(next) || 0, 0)
  }, 0);
}
