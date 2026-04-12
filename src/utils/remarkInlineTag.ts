// Remark plugin: convert inline `#tag` in text nodes into styled <span> elements.
// Skips line-start `#` (headings) and code blocks.

type MdNode = {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, string> }
}

// Match #tag that is preceded by whitespace/start or certain punctuation, NOT a heading
const TAG_RE = /(?:^|(?<=[\s,;:(]))#([A-Za-z0-9가-힣_\-/]+)/g

export default function remarkInlineTag() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children || node.children.length === 0) return
      if (node.type === 'code' || node.type === 'inlineCode') return
      // Skip headings — `#` at start of heading text is part of content, not a tag
      if (node.type === 'heading') return

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('#')) {
          const value = child.value
          const parts: MdNode[] = []
          let last = 0
          TAG_RE.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = TAG_RE.exec(value)) !== null) {
            if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) })
            parts.push({
              type: 'inlineTag',
              data: { hName: 'span', hProperties: { className: 'inline-tag' } },
              children: [{ type: 'text', value: `#${m[1]}` }],
            })
            last = TAG_RE.lastIndex
          }
          if (parts.length > 0) {
            if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
            node.children.splice(i, 1, ...parts)
            i += parts.length - 1
          }
        } else if (child.children) {
          walk(child)
        }
      }
    }
    walk(tree)
  }
}
