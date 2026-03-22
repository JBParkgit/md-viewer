export interface MdTemplate {
  id: string
  name: string
  category: string
  icon: string  // emoji
  filePath?: string  // path to template file (for editing)
  generate: (title: string) => string
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Default template file contents (used to initialize .docuflow/templates/)
interface DefaultTemplate {
  fileName: string
  name: string
  category: string
  icon: string
  body: string
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    fileName: '빈문서.md',
    name: '빈 문서',
    category: '기본',
    icon: '📄',
    body: `# {{title}}\n\n`,
  },
  {
    fileName: '회의록.md',
    name: '회의록',
    category: '업무/프로젝트',
    icon: '📋',
    body: `---
tags: [회의록]
---

# {{title}}

## 회의 정보
- **일시**: {{date}}
- **장소**:
- **참석자**:

## 안건
1.

## 논의 내용


## 결정사항
- [ ]

## 액션아이템
| 담당자 | 내용 | 기한 |
|--------|------|------|
|        |      |      |
`,
  },
  {
    fileName: '주간보고.md',
    name: '주간 보고',
    category: '업무/프로젝트',
    icon: '📊',
    body: `---
tags: [주간보고]
---

# {{title}}

**보고 기간**: {{date}} ~
**작성자**:

## 이번 주 실적
-

## 다음 주 계획
-

## 주요 이슈 / 리스크
| 이슈 | 상태 | 대응방안 |
|------|------|----------|
|      |      |          |

## 기타 특이사항

`,
  },
  {
    fileName: '프로젝트기획서.md',
    name: '프로젝트 기획서',
    category: '업무/프로젝트',
    icon: '🎯',
    body: `---
tags: [기획서]
---

# {{title}}

## 프로젝트 개요
- **목적**:
- **기간**: {{date}} ~
- **PM**:

## 배경 및 목표


## 범위
### 포함
-

### 제외
-

## 일정
| 단계 | 내용 | 시작일 | 종료일 | 담당자 |
|------|------|--------|--------|--------|
| 1    |      |        |        |        |

## 담당자 및 역할
| 이름 | 역할 | 담당 영역 |
|------|------|-----------|
|      |      |           |

## 예상 리스크

## 성공 기준

`,
  },
  {
    fileName: '업무요청서.md',
    name: '업무 요청서',
    category: '업무/프로젝트',
    icon: '📨',
    body: `---
tags: [업무요청]
---

# {{title}}

## 요청 정보
- **요청자**:
- **요청일**: {{date}}
- **희망 기한**:
- **우선순위**: 🔴높음 / 🟡보통 / 🟢낮음

## 요구사항


## 상세 설명


## 참고 자료
-

## 승인
- [ ] 검토 완료
- [ ] 승인 완료

`,
  },
  {
    fileName: '블로그포스트.md',
    name: '블로그 포스트',
    category: '콘텐츠/마케팅',
    icon: '✍️',
    body: `---
tags: [블로그]
category:
author:
date: {{date}}
---

# {{title}}

## 핵심 메시지
>

## 도입


## 본문

### 소제목 1


### 소제목 2


### 소제목 3


## 결론


## SEO
- **키워드**:
- **메타 설명**:

`,
  },
  {
    fileName: 'SNS콘텐츠기획.md',
    name: 'SNS 콘텐츠 기획',
    category: '콘텐츠/마케팅',
    icon: '📱',
    body: `---
tags: [SNS]
---

# {{title}}

## 콘텐츠 정보
- **채널**: Instagram / Facebook / Twitter / LinkedIn / TikTok
- **게시 예정일**: {{date}}
- **게시 시간**:
- **콘텐츠 유형**: 이미지 / 카드뉴스 / 릴스 / 스토리

## 카피
### 메인 카피


### 해시태그
#

## 이미지/영상 메모
- **컨셉**:
- **사이즈**:
- **참고 이미지**:

## CTA (Call to Action)


## 성과 목표
| 지표 | 목표 |
|------|------|
| 도달 |      |
| 참여  |      |
| 클릭 |      |

`,
  },
  {
    fileName: '보도자료.md',
    name: '보도자료',
    category: '콘텐츠/마케팅',
    icon: '📰',
    body: `---
tags: [보도자료]
date: {{date}}
---

# {{title}}

## 부제


## 본문

**[{{date}}]** —


### 배경


### 주요 내용


### 향후 계획


## 인용문
> ""
> — 이름, 직책

## 회사 소개


## 문의처
- **담당자**:
- **이메일**:
- **전화**:

`,
  },
  {
    fileName: '캠페인브리프.md',
    name: '캠페인 브리프',
    category: '콘텐츠/마케팅',
    icon: '🚀',
    body: `---
tags: [캠페인]
---

# {{title}}

## 캠페인 개요
- **캠페인명**: {{title}}
- **기간**: {{date}} ~
- **담당자**:

## 목표
- **비즈니스 목표**:
- **마케팅 목표**:
- **KPI**:

## 타겟
- **주요 타겟**:
- **연령/성별**:
- **관심사**:
- **페인 포인트**:

## 핵심 메시지
### 메인 메시지


### 서브 메시지
1.
2.
3.

## 채널 전략
| 채널 | 역할 | 예산 비중 |
|------|------|-----------|
|      |      |           |

## 예산
| 항목 | 금액 | 비고 |
|------|------|------|
|      |      |      |
| **합계** | | |

## 일정
| 단계 | 기간 | 내용 |
|------|------|------|
| 기획 |      |      |
| 제작 |      |      |
| 집행 |      |      |
| 분석 |      |      |

## 성과 측정

`,
  },
]

/** Initialize default templates in .docuflow/templates/ if folder doesn't exist */
export async function initProjectTemplates(projectPath: string): Promise<void> {
  const dir = projectPath.replace(/\\/g, '/') + '/.docuflow/templates'
  // Check if templates folder already exists by trying to read it
  const existing = await window.electronAPI.readDir(dir).catch(() => null)
  if (existing && existing.length > 0) return // already initialized

  await window.electronAPI.createDir(dir).catch(() => {})
  for (const t of DEFAULT_TEMPLATES) {
    const content = `---\nname: ${t.name}\ncategory: ${t.category}\nicon: ${t.icon}\n---\n${t.body}`
    const filePath = dir + '/' + t.fileName
    await window.electronAPI.createFile(filePath, content).catch(() => {})
  }
}

// Keep old export for backward compat during transition, but it won't be used in picker
export const MD_TEMPLATES: MdTemplate[] = [
  // ── 빈 문서 ──
  {
    id: 'blank',
    name: '빈 문서',
    category: '기본',
    icon: '📄',
    generate: (title) => `# ${title}\n\n`,
  },

  // ── 업무/프로젝트 ──
  {
    id: 'meeting',
    name: '회의록',
    category: '업무/프로젝트',
    icon: '📋',
    generate: (title) => `---
tags: [회의록]
---

# ${title}

## 회의 정보
- **일시**: ${today()}
- **장소**:
- **참석자**:

## 안건
1.

## 논의 내용


## 결정사항
- [ ]

## 액션아이템
| 담당자 | 내용 | 기한 |
|--------|------|------|
|        |      |      |
`,
  },
  {
    id: 'weekly-report',
    name: '주간 보고',
    category: '업무/프로젝트',
    icon: '📊',
    generate: (title) => `---
tags: [주간보고]
---

# ${title}

**보고 기간**: ${today()} ~
**작성자**:

## 이번 주 실적
-

## 다음 주 계획
-

## 주요 이슈 / 리스크
| 이슈 | 상태 | 대응방안 |
|------|------|----------|
|      |      |          |

## 기타 특이사항

`,
  },
  {
    id: 'project-plan',
    name: '프로젝트 기획서',
    category: '업무/프로젝트',
    icon: '🎯',
    generate: (title) => `---
tags: [기획서]
---

# ${title}

## 프로젝트 개요
- **목적**:
- **기간**: ${today()} ~
- **PM**:

## 배경 및 목표


## 범위
### 포함
-

### 제외
-

## 일정
| 단계 | 내용 | 시작일 | 종료일 | 담당자 |
|------|------|--------|--------|--------|
| 1    |      |        |        |        |
| 2    |      |        |        |        |
| 3    |      |        |        |        |

## 담당자 및 역할
| 이름 | 역할 | 담당 영역 |
|------|------|-----------|
|      |      |           |

## 예상 리스크

## 성공 기준

`,
  },
  {
    id: 'work-request',
    name: '업무 요청서',
    category: '업무/프로젝트',
    icon: '📨',
    generate: (title) => `---
tags: [업무요청]
---

# ${title}

## 요청 정보
- **요청자**:
- **요청일**: ${today()}
- **희망 기한**:
- **우선순위**: 🔴높음 / 🟡보통 / 🟢낮음

## 요구사항


## 상세 설명


## 참고 자료
-

## 승인
- [ ] 검토 완료
- [ ] 승인 완료

`,
  },

  // ── 콘텐츠/마케팅 ──
  {
    id: 'blog-post',
    name: '블로그 포스트',
    category: '콘텐츠/마케팅',
    icon: '✍️',
    generate: (title) => `---
tags: [블로그]
category:
author:
date: ${today()}
---

# ${title}

## 핵심 메시지
>

## 도입


## 본문

### 소제목 1


### 소제목 2


### 소제목 3


## 결론


## SEO
- **키워드**:
- **메타 설명**:

`,
  },
  {
    id: 'sns-content',
    name: 'SNS 콘텐츠 기획',
    category: '콘텐츠/마케팅',
    icon: '📱',
    generate: (title) => `---
tags: [SNS]
---

# ${title}

## 콘텐츠 정보
- **채널**: Instagram / Facebook / Twitter / LinkedIn / TikTok
- **게시 예정일**: ${today()}
- **게시 시간**:
- **콘텐츠 유형**: 이미지 / 카드뉴스 / 릴스 / 스토리

## 카피
### 메인 카피


### 해시태그
#

## 이미지/영상 메모
- **컨셉**:
- **사이즈**:
- **참고 이미지**:

## CTA (Call to Action)


## 성과 목표
| 지표 | 목표 |
|------|------|
| 도달 |      |
| 참여  |      |
| 클릭 |      |

`,
  },
  {
    id: 'press-release',
    name: '보도자료',
    category: '콘텐츠/마케팅',
    icon: '📰',
    generate: (title) => `---
tags: [보도자료]
date: ${today()}
---

# ${title}

## 부제


## 본문

**[${today()}]** —


### 배경


### 주요 내용


### 향후 계획


## 인용문
> ""
> — 이름, 직책

## 회사 소개


## 문의처
- **담당자**:
- **이메일**:
- **전화**:

`,
  },
  {
    id: 'campaign-brief',
    name: '캠페인 브리프',
    category: '콘텐츠/마케팅',
    icon: '🚀',
    generate: (title) => `---
tags: [캠페인]
---

# ${title}

## 캠페인 개요
- **캠페인명**: ${title}
- **기간**: ${today()} ~
- **담당자**:

## 목표
- **비즈니스 목표**:
- **마케팅 목표**:
- **KPI**:

## 타겟
- **주요 타겟**:
- **연령/성별**:
- **관심사**:
- **페인 포인트**:

## 핵심 메시지
### 메인 메시지


### 서브 메시지
1.
2.
3.

## 채널 전략
| 채널 | 역할 | 예산 비중 |
|------|------|-----------|
|      |      |           |

## 예산
| 항목 | 금액 | 비고 |
|------|------|------|
|      |      |      |
| **합계** | | |

## 일정
| 단계 | 기간 | 내용 |
|------|------|------|
| 기획 |      |      |
| 제작 |      |      |
| 집행 |      |      |
| 분석 |      |      |

## 성과 측정

`,
  },
]

export const TEMPLATE_CATEGORIES = [...new Set(MD_TEMPLATES.map(t => t.category))]

// ── Custom templates from .docuflow/templates/*.md ─────────────────────────

const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(FM_REGEX)
  if (!match) return { meta: {}, body: content }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return { meta, body: match[2] }
}

export async function loadCustomTemplates(projectPath: string): Promise<MdTemplate[]> {
  const templatesDir = projectPath.replace(/\\/g, '/') + '/.docuflow/templates'
  try {
    const nodes = await window.electronAPI.readDir(templatesDir)
    const templates: MdTemplate[] = []
    for (const node of nodes) {
      if (node.type !== 'file' || !node.name.endsWith('.md')) continue
      const result = await window.electronAPI.readFile(node.path)
      if (!result.success || !result.content) continue

      const { meta, body } = parseFrontmatter(result.content)
      const name = meta.name || node.name.replace(/\.md$/, '')
      const category = meta.category || '사용자 템플릿'
      const icon = meta.icon || '📝'

      templates.push({
        id: `custom-${node.name}`,
        name,
        category,
        icon,
        filePath: node.path,
        generate: (title: string) => {
          return body
            .replace(/\{\{title\}\}/g, title)
            .replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 10))
        },
      })
    }
    return templates
  } catch {
    return []
  }
}

export async function saveAsTemplate(
  projectPath: string,
  name: string,
  content: string,
  category = '사용자 템플릿',
  icon = '📝',
): Promise<{ success: boolean; error?: string }> {
  const dir = projectPath.replace(/\\/g, '/') + '/.docuflow/templates'
  await window.electronAPI.createDir(dir).catch(() => {})
  const fileName = name.replace(/[\\/:*?"<>|]/g, '_') + '.md'
  const filePath = dir + '/' + fileName
  const templateContent = `---
name: ${name}
category: ${category}
icon: ${icon}
---
${content}`
  return window.electronAPI.writeFile(filePath, templateContent)
}

export function getCategories(templates: MdTemplate[]): string[] {
  return [...new Set(templates.map(t => t.category))]
}
