// CommonMark's emphasis open/close decision uses "left/right-flanking"
// delimiter-run rules that classify every neighbor as Unicode whitespace,
// Unicode punctuation, or "other". CJK letters (한글/かな/漢字) fall into
// "other" (like ASCII letters), so when a `**` sits directly between a CJK
// letter and an inner punctuation char — e.g. `녕**"내용"**` or
// `**"내용"**입니다` — the run is neither left- nor right-flanking and the
// bold is dropped, rendering literal asterisks.
//
// Fix: when a `**…**` run is directly adjacent to a CJK character on the
// outside, rewrite just the delimiters to <strong></strong>. The inner text
// is left untouched so remark still parses nested markdown between the
// inline-HTML tag pair, and rehype-raw stitches the element back together.
// Pure-ASCII contexts are left for remark to handle so existing behavior is
// unchanged there.

// Hangul (syllables + jamo + compat jamo), kana, CJK ideographs (incl. Ext A
// + compat), and CJK symbols/fullwidth forms.
const CJK =
  '\\uAC00-\\uD7A3\\u1100-\\u11FF\\u3130-\\u318F' +
  '\\u3040-\\u30FF\\u31F0-\\u31FF' +
  '\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF' +
  '\\u3000-\\u303F\\uFF00-\\uFFEF'
const isCjk = new RegExp(`[${CJK}]`)

// `**` not preceded by `\` or `*` (avoid escapes and `***`), inner has no
// leading/trailing space and no newline, closing `**` not followed by `*`.
const STRONG = /(?<![\\*])\*\*(?!\s)([^\n]+?)(?<!\s)\*\*(?!\*)/g

export function fixCjkEmphasis(src: string): string {
  return src.replace(STRONG, (match, inner: string, offset: number) => {
    const prev = offset > 0 ? src[offset - 1] : ''
    const next = src[offset + match.length] ?? ''
    if (isCjk.test(prev) || isCjk.test(next)) {
      return `<strong>${inner}</strong>`
    }
    return match
  })
}
