const recentlySavedPaths = new Set<string>()

export function markRecentlySaved(filePath: string) {
  recentlySavedPaths.add(filePath)
  setTimeout(() => recentlySavedPaths.delete(filePath), 1500)
}

export function isRecentlySaved(filePath: string) {
  return recentlySavedPaths.has(filePath)
}
