// Make markdown inside <details>...</details> render like Obsidian:
// CommonMark would treat the whole tag as one opaque HTML block, so
// `**bold**` / `- list` / `# heading` written inside stays as literal text.
// We rewrite each pair so that blank lines bracket the inner body — that
// splits it into separate blocks (HTML open, markdown body, HTML close)
// which `rehype-raw` later stitches back into a real <details> element.
//
// Nesting is handled by walking the string with a depth counter; recursion
// processes the inner content first so deepest blocks are normalized before
// their parents.
export function expandDetailsBlocks(src: string): string {
  let result = ''
  let i = 0
  while (i < src.length) {
    const remaining = src.slice(i)
    const openMatch = /<details(\s[^>]*)?>/i.exec(remaining)
    if (!openMatch) {
      result += remaining
      break
    }
    const openStart = i + openMatch.index
    const openEnd = openStart + openMatch[0].length
    result += src.slice(i, openEnd)

    // Find the matching </details>, accounting for nested <details>.
    const tagRe = /<details(?:\s[^>]*)?>|<\/details>/gi
    tagRe.lastIndex = openEnd
    let depth = 1
    let closeStart = -1
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(src)) !== null) {
      if (m[0][1] === '/') {
        depth--
        if (depth === 0) { closeStart = m.index; break }
      } else {
        depth++
      }
    }
    if (closeStart === -1) {
      result += src.slice(openEnd)
      break
    }

    let inner = expandDetailsBlocks(src.slice(openEnd, closeStart))
    // Keep an opening <summary>...</summary> right after <details> (no blank
    // line between them — CommonMark's HTML-block rule needs them in the
    // same block for the start tag to "stick"). The body after the summary
    // gets the blank-line treatment.
    const sm = inner.match(/^(\s*<summary[^>]*>[\s\S]*?<\/summary>)/i)
    const prefix = sm ? sm[1] : ''
    const body = (sm ? inner.slice(sm[0].length) : inner)
      .replace(/^\s*\n+/, '')
      .replace(/\n+\s*$/, '')

    result += body
      ? `${prefix}\n\n${body}\n\n</details>`
      : `${prefix}</details>`
    i = closeStart + '</details>'.length
  }
  return result
}
