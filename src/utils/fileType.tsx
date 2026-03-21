// 파일 타입 판별 및 아이콘 공유 유틸리티

export type FileGroup =
  | 'md' | 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'ppt'
  | 'code' | 'text' | 'zip' | 'other'

const EXT_MAP: Record<string, FileGroup> = {
  // markdown
  md: 'md', mdx: 'md', markdown: 'md',
  // image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', svg: 'image', ico: 'image', bmp: 'image',
  // video
  mp4: 'video', webm: 'video', ogg: 'video', mov: 'video', avi: 'video', mkv: 'video',
  // document
  pdf: 'pdf',
  doc: 'word', docx: 'word',
  xls: 'excel', xlsx: 'excel', csv: 'excel',
  ppt: 'ppt', pptx: 'ppt',
  // code
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code',
  cs: 'code', go: 'code', rs: 'code', html: 'code',
  css: 'code', json: 'code', yaml: 'code', yml: 'code',
  xml: 'code', sh: 'code', bat: 'code', ps1: 'code',
  // text
  txt: 'text', log: 'text', ini: 'text', env: 'text', toml: 'text',
  // zip
  zip: 'zip', tar: 'zip', gz: 'zip', '7z': 'zip', rar: 'zip',
}

export function getFileGroup(name: string): FileGroup {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MAP[ext] ?? 'other'
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp']

// 파일 그룹별 색상 클래스
export const FILE_GROUP_COLOR: Record<FileGroup, string> = {
  md:    'text-blue-500',
  image: 'text-green-500',
  video: 'text-pink-500',
  pdf:   'text-red-500',
  word:  'text-blue-600',
  excel: 'text-green-600',
  ppt:   'text-orange-500',
  code:  'text-purple-500',
  text:  'text-gray-400',
  zip:   'text-yellow-600',
  other: 'text-gray-400',
}

interface IconProps {
  name: string
  className?: string
}

export function FileTypeIcon({ name, className = 'w-3.5 h-3.5' }: IconProps) {
  const group = getFileGroup(name)
  const color = FILE_GROUP_COLOR[group]
  const cls = `${className} ${color} flex-shrink-0`

  switch (group) {
    case 'md':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    case 'image':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    case 'video':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'pdf':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    case 'word':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17l1.5-5 1.5 3.5 1.5-3.5L14 17h-1l-1-3-1 3H8z" />
        </svg>
      )
    case 'excel':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 11h2l2 3 2-3h2l-3 4.5L16 20h-2l-2-3-2 3H8l3-4.5L8 11z" />
        </svg>
      )
    case 'ppt':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 12h3a2 2 0 010 4h-1v2H9v-6zm2 1v2h1a1 1 0 000-2h-1z" />
        </svg>
      )
    case 'code':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      )
    case 'zip':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      )
    default:
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
  }
}
