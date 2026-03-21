const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Parse tags from YAML frontmatter */
export function parseFrontmatterTags(content: string): string[] {
  const match = content.match(FM_REGEX)
  if (!match) return []
  const yaml = match[1]
  // Match tags: [a, b, c] or tags:\n  - a\n  - b
  const inlineMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m)
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  const listMatch = yaml.match(/^tags:\s*\n((?:\s*-\s*.+\n?)*)/m)
  if (listMatch) {
    return listMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return []
}

/** Get content without frontmatter (for rendering) */
export function stripFrontmatter(content: string): string {
  return content.replace(FM_REGEX, '')
}

/** Update or insert tags in frontmatter */
export function updateFrontmatterTags(content: string, tags: string[]): string {
  const tagLine = tags.length > 0 ? `tags: [${tags.join(', ')}]` : ''
  const match = content.match(FM_REGEX)

  if (match) {
    const yaml = match[1]
    const lines = yaml.split('\n')
    // Remove existing tags lines (inline or list)
    const filtered: string[] = []
    let skipList = false
    for (const line of lines) {
      if (/^tags:\s*\[/.test(line) || /^tags:\s*$/.test(line)) {
        skipList = /^tags:\s*$/.test(line)
        continue
      }
      if (skipList && /^\s+-\s/.test(line)) continue
      skipList = false
      filtered.push(line)
    }
    if (tagLine) filtered.push(tagLine)
    const newYaml = filtered.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n')
    if (!newYaml.trim()) {
      // No other frontmatter fields, remove entire block
      return content.replace(FM_REGEX, '')
    }
    return content.replace(FM_REGEX, `---\n${newYaml}\n---\n`)
  }

  // No frontmatter exists — create one
  if (!tagLine) return content
  return `---\n${tagLine}\n---\n${content}`
}
