// Minimal remark plugin: convert `==text==` in text nodes into <mark> elements.
// Avoids extra deps by walking the mdast tree manually.

type MdNode = {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string }
}

const MARK_RE = /==([^=\n][^=\n]*?)==/g

export default function remarkMark() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children || node.children.length === 0) return
      // Skip code/inlineCode — marks inside code should stay literal
      if (node.type === 'code' || node.type === 'inlineCode') return

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('==')) {
          const value = child.value
          const parts: MdNode[] = []
          let last = 0
          MARK_RE.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = MARK_RE.exec(value)) !== null) {
            if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) })
            parts.push({
              type: 'mark',
              data: { hName: 'mark' },
              children: [{ type: 'text', value: m[1] }],
            })
            last = MARK_RE.lastIndex
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
