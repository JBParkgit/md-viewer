const recentlySavedPaths = new Set<string>()

export function markRecentlySaved(filePath: string) {
  recentlySavedPaths.add(filePath)
  setTimeout(() => recentlySavedPaths.delete(filePath), 5000)
}

export function isRecentlySaved(filePath: string) {
  return recentlySavedPaths.has(filePath)
}
