export function validateUserPerformance(data: Record<string, unknown>) {
  for (const key of ['dailyEntryGoal', 'dailyClosureGoal']) {
    const value = data[key]
    if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100000)) {
      return 'Las metas deben ser números enteros entre 1 y 100000, o dejarse vacías.'
    }
  }
  if (data.avatar !== undefined && data.avatar !== null && data.avatar !== '' &&
      (typeof data.avatar !== 'string' || !/^\/uploads\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(data.avatar))) {
    return 'Selecciona una foto PNG, JPG o WebP válida.'
  }
  return null
}
