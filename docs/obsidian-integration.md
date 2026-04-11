# Docuflow ↔ Obsidian 같이 쓰기 가이드

Docuflow와 Obsidian은 둘 다 **파일 기반(.md) + YAML frontmatter** 를 사용하므로 같은 폴더를 공유해 서로 보완하며 쓸 수 있습니다. 이 문서는 권장 설정, 사용 패턴, 피해야 할 함정을 정리한 가이드입니다.

> **한 줄 요약**: Docuflow는 "워크플로우/결재 관리", Obsidian은 "본문 집중 편집" 용으로 역할을 나누고, 같은 파일을 동시에 열지 마세요.

---

## 1. 호환 관계 요약

| 항목 | 상태 | 비고 |
|---|---|---|
| 마크다운 표준(헤딩·리스트·코드·표) | ✅ 완전 호환 | |
| YAML frontmatter | ✅ 상호 호환 | Docuflow가 블록 단위로 보존 |
| 태그(frontmatter `tags:`) | ✅ 호환 | 양쪽 모두 읽고 씀 |
| 본문 인라인 `#태그` | ✅ 호환 | Docuflow가 수집해 태그 패널에 표시 |
| Wikilinks `[[...]]` | ⚠️ 부분 호환 | 파일명 기반 해석, 경로 규칙 약간 다름 |
| `.obsidian/` / `.docuflow/` 설정 폴더 | ✅ 충돌 없음 | 서로의 설정 폴더를 무시 |
| 동시 편집 | ❌ 비추 | "나중에 저장한 쪽이 이긴다" |
| 승인자 nested list(`approvers:`) | ⚠️ 주의 | Obsidian Properties 패널에서 편집 금지 |

---

## 2. 초기 설정

### 2-1. 프로젝트 폴더를 vault로 등록 (Obsidian)

Docuflow 프로젝트 폴더는 Obsidian에서 vault로 등록되어 있어야 `Obsidian에서 열기` 메뉴가 동작합니다.

1. Obsidian 실행
2. 좌측 하단 **vault 스위치 아이콘** 클릭 → `Open folder as vault`
3. Docuflow 프로젝트 폴더 선택
4. Obsidian이 자동으로 `.obsidian/` 설정 폴더를 생성

이미 Obsidian vault 안에 Docuflow 프로젝트가 들어 있다면 추가 설정 불필요.

### 2-2. Obsidian 권장 설정

Obsidian → **Settings** 에서 다음을 조정하면 안전합니다:

#### Editor → Properties in document
- 기본값: `Visible`
- **권장값: `Hidden` 또는 `Source`**
- 이유: Properties 패널이 워크플로우 frontmatter(승인자 nested list 등)를 잘못 편집할 수 있음

#### Editor → Strict line breaks
- 이 옵션을 **켜 둘 것** (기본은 꺼짐)
- 이유: Docuflow는 표준 Markdown으로 렌더링(빈 줄 = 단락 분리)하므로 Obsidian 단독의 "줄바꿈도 줄바꿈"과 차이가 남

#### Community plugins → 린터/자동 포맷 계열 비활성화
다음 플러그인은 frontmatter를 자동 수정해 Docuflow의 nested 구조를 망가뜨릴 수 있습니다:
- **Linter** — 키 순서 정렬, 태그 포맷 변경
- **Front Matter Title** — `title:` 자동 추가/수정
- **Templater** — frontmatter 자동 생성

워크플로우 문서를 다룰 때는 꺼 두거나 "워크플로우 폴더 제외" 규칙을 설정하세요.

### 2-3. `.gitignore` (Git 쓰는 경우)

```gitignore
# Obsidian 개인 상태 — 사용자마다 다르므로 공유하지 말 것
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache

# Docuflow 개인 캐시 (필요시)
# .docuflow/kanban.json   ← 팀 공유하려면 커밋
```

`.obsidian/app.json`, `.obsidian/hotkeys.json`, `.obsidian/plugins/*/data.json` 같은 팀 공통 설정은 **커밋해도 무방**합니다.

---

## 3. 권장 사용 패턴

### 패턴 A — 역할 분담 (권장)

```
Docuflow가 담당                  Obsidian이 담당
───────────────────             ────────────────
• 승인 워크플로우 관리           • 본문 집중 편집
• 대시보드/받은 요청 조회        • 그래프 뷰
• Kanban/Calendar               • Canvas
• 파일 이력 되돌리기             • Dataview 쿼리
• frontmatter 자동 작성          • 개인 지식 관리
```

**작업 흐름**:
1. Docuflow 사이드바에서 문서 확인 → 상태, 리뷰어, 대시보드 파악
2. 본문 편집이 필요 → **Docuflow에서 해당 탭을 닫고** 우클릭 → `📝 Obsidian에서 열기`
3. Obsidian에서 편집 → Ctrl+S 저장 → Obsidian 탭 닫기
4. Docuflow로 돌아와 다시 열기 → 리뷰 요청, 승인/반려 등 워크플로우 액션

### 패턴 B — 완전 분리

폴더 자체를 분리해 충돌 자체를 원천 차단:

```
D:\Personal\my-notes\       ← Obsidian vault (일일 저널·지식관리)
D:\Work\team-docs\          ← Docuflow 프로젝트 (결재 문서)
```

Obsidian과 Docuflow가 완전히 다른 폴더를 보므로 간섭 제로.

---

## 4. Docuflow 주요 기능과 Obsidian 연동

### 4-1. `📝 Obsidian에서 열기` (Docuflow → Obsidian)

**위치**: 파일 우클릭 메뉴 → `기본 앱으로 열기` 아래

**동작**:
- `obsidian://open?path=<absolute-path>` URI를 실행
- Obsidian이 실행 중이면 해당 vault에서 파일이 바로 열림
- Obsidian이 꺼져 있으면 실행 후 열림

**제약**:
- 해당 파일이 등록된 vault 안에 있어야 함 (vault가 아니면 조용히 무시됨)
- `.md` / `.markdown` 파일에만 메뉴가 표시됨

### 4-2. 인라인 `#태그` 수집 (Obsidian → Docuflow)

Obsidian 사용자는 본문에 자유롭게 `#태그` 를 써서 분류합니다. Docuflow는 이 태그들을 자동으로 인식합니다.

**인식 규칙**:

| 예시 | 인식 |
|---|---|
| `회의 #기획 후속작업` | ✅ `기획` |
| `#project/alpha` (중첩) | ✅ `project/alpha` |
| `#한글태그` | ✅ `한글태그` |
| `## 제목` (헤딩) | ❌ 헤딩 스킵 |
| `` `#code` `` (인라인 코드) | ❌ 코드 스킵 |
| 펜스드 코드블록 안의 `#foo` | ❌ 코드 스킵 |
| `#123` (숫자만) | ❌ 이슈 번호 오인 방지 |

**표시 위치**:
- 사이드바 🏷️ 태그 패널 — frontmatter 태그 + 인라인 태그 통합 표시
- RightPanel 관련 문서 — 두 종류 태그 기반 관련성 판정

**편집 위치**:
- frontmatter 태그: Docuflow의 TagBar 또는 Obsidian Properties
- 인라인 태그: Obsidian 본문에서 직접 작성 (Docuflow는 읽기만)

### 4-3. 워크플로우 frontmatter (Docuflow 전용)

Docuflow가 관리하는 필드는 **Obsidian에서 직접 편집하지 마세요**:
- `status`, `author`, `created`, `dueDate`, `requestNote`
- `approvers:` (nested list)
- `history:` (nested list)

Obsidian Properties 패널에서 이들 필드가 보이긴 하지만, **Docuflow UI(상단 워크플로우 바 또는 우측 "승인" 탭)에서만 수정**하세요. Obsidian에서 실수로 건드리면 nested 구조가 망가질 수 있습니다.

### 4-4. Dataview 활용 (Obsidian → Docuflow 문서 조회)

Obsidian의 **Dataview** 플러그인을 설치하면 Docuflow가 쓴 frontmatter를 쿼리할 수 있어 매우 유용합니다.

#### 예시 1: 검토 중인 모든 문서
```dataview
TABLE status, author, dueDate
FROM ""
WHERE status = "review"
SORT dueDate ASC
```

#### 예시 2: 내가 승인자인 문서
```dataview
LIST
FROM ""
WHERE contains(flat(approvers.name), "박재범") AND status = "review"
```

#### 예시 3: 최근 7일간 승인된 문서
```dataview
TABLE author, dateformat(created, "yyyy-MM-dd") as 작성일
FROM ""
WHERE status = "approved" AND date(dateformat(created, "yyyy-MM-dd")) >= date(today) - dur(7 days)
```

> Dataview는 nested list를 `flat()` 으로 풀어서 쿼리합니다. Docuflow는 이 구조에 친화적인 YAML을 작성합니다.

---

## 5. 동시 편집 피하기

### 왜 위험한가

- Docuflow 탭 열림 → 사용자 수정 → 저장 안 함
- 동시에 Obsidian에서 같은 파일 열어 편집 → 저장
- Docuflow 탭은 자기 메모리 버전을 유지 → 사용자가 Ctrl+S 누르면 Obsidian의 변경분이 덮어씌워짐

### 안전한 규칙

1. **Obsidian에서 편집하기 전**: Docuflow에서 해당 파일 탭을 닫기
2. **Obsidian 저장 후**: Docuflow에서 다시 열기 (파일 watcher가 자동 감지해 M 표시)
3. 급한 경우 Docuflow에 **"파일이 외부에서 변경되었습니다"** 배너가 뜨면 **반드시 새로고침** 클릭

### 추가 보호 장치

Docuflow는 다음을 자동 처리합니다:
- 파일 감시기가 외부 변경을 즉시 감지 → 상단 배너 표시
- 자체 쓰기 이벤트는 필터링 → 자신이 저장한 파일에는 배너 안 나옴
- 워크플로우 액션 후 탭 내용 자동 동기화

그래도 **사용자 규율**이 가장 확실합니다: 한 파일은 한 번에 한 앱에서만 편집.

---

## 6. Wikilinks 호환성

두 앱 모두 `[[문서제목]]` 형태의 위키링크를 지원하지만 경로 해석이 약간 다릅니다.

| 형식 | Obsidian | Docuflow |
|---|---|---|
| `[[파일명]]` | vault 안에서 파일명으로 검색 | 프로젝트 안에서 파일명으로 검색 |
| `[[폴더/파일명]]` | vault 상대 경로 | 프로젝트 상대 경로 |
| `[[파일명\|표시텍스트]]` | ✅ 지원 | ✅ 지원 |
| `[[파일명#헤딩]]` (앵커) | ✅ 지원 | ❌ 무시 (파일만 열림) |
| `[[파일명^블록ID]]` (Obsidian 전용) | ✅ 지원 | ❌ 무시 |

**권장**: 팀 공유 문서에서는 단순한 `[[파일명]]` 또는 표준 마크다운 링크 `[텍스트](./상대경로.md)` 를 사용하세요. Obsidian 고유 기능(앵커/블록 ID)은 Docuflow에서 작동하지 않습니다.

---

## 7. Git과 함께 쓰기

### 워크플로우 액션의 Git 노이즈

Docuflow의 워크플로우 액션은 frontmatter를 자주 업데이트합니다:
- 리뷰 요청 → `status: review` + `history` 추가
- 승인/반려 → `approvers[].status` + `history` 추가
- 사용자 정보 편집 → 여러 필드 변경

→ 하루에 한 파일당 5~10개 커밋이 쌓일 수 있습니다.

### 권장 설정

1. **Obsidian Git 플러그인 auto-commit 간격을 넉넉하게** (예: 30분 이상)
2. **수동 커밋 선호** — 워크플로우 작업이 끝난 후 한 번에 커밋
3. Docuflow의 **파일 이력 되돌리기** 기능(`📜 이 파일의 이력`)을 활용해 실수를 복구

### Git 충돌 해결

두 사람이 같은 문서의 워크플로우를 수정하고 push 하면 frontmatter 충돌이 발생할 수 있습니다:

```
<<<<<<< HEAD
approvers:
  - name: 김승인
    status: approved
=======
approvers:
  - name: 김승인
    status: rejected
>>>>>>> origin/master
```

**해결**:
1. 수동으로 한쪽을 선택
2. 또는 **Docuflow에서 이력 보기**로 원하는 시점 확인 후 해당 시점으로 되돌리기
3. 병합 후 Docuflow에서 다시 열어 구조가 정상인지 확인

---

## 8. 문제 해결 FAQ

### Q1. `📝 Obsidian에서 열기` 눌러도 반응이 없어요
- Obsidian이 설치되어 있나요? (공식 사이트에서 설치)
- 해당 파일이 **등록된 vault 안**에 있나요? Obsidian에서 `Open folder as vault` 로 프로젝트 폴더를 먼저 등록하세요
- Windows에서 `obsidian://` 프로토콜이 등록되어 있나요? Obsidian을 한 번 실행하면 자동 등록됨

### Q2. Docuflow에서 태그 패널에 안 보이던 `#태그` 가 갑자기 나왔어요
- 맞는 동작입니다. Docuflow 최신 버전은 본문 인라인 `#태그` 도 수집합니다
- Obsidian에서 본문에 `#기획` 이라고 쓰면 Docuflow 태그 패널에 자동 등장

### Q3. Obsidian에서 편집 후 Docuflow로 돌아왔는데 워크플로우 바가 사라졌어요
- Obsidian의 Linter 계열 플러그인이 frontmatter 구조를 망가뜨렸을 가능성
- Docuflow에서 우클릭 → `📜 이 파일의 이력` → 이전 시점으로 되돌리기
- 또는 Git에서 복원
- 이후 Obsidian Linter 설정에서 해당 폴더 제외

### Q4. 같은 파일을 두 앱에 열었더니 내용이 뒤섞였어요
- 피할 수 없는 동시 편집 충돌입니다
- Git 사용 중이면 이전 커밋에서 복원
- 향후에는 한 파일은 한 앱에서만 편집하는 규칙을 지켜 주세요

### Q5. Obsidian Properties 패널에서 `approvers` 를 편집하면 안 되나요?
- **하지 마세요**. Obsidian의 Properties UI는 단순 key-value는 잘 다루지만 nested object list 편집이 허술해 구조를 깨트릴 수 있습니다
- 대신 Docuflow의 상단 워크플로우 바 또는 우측 "승인" 탭에서 편집

### Q6. Docuflow의 태그 패널이 Obsidian에서 쓴 인라인 태그를 안 보여요
- 프로젝트를 다시 추가하거나, Docuflow 재시작 후 사이드바 🏷️ 탭을 다시 열어 보세요 (스캔 재실행)

### Q7. Obsidian 그래프 뷰에 Docuflow 워크플로우가 표시되나요?
- 표시되지 않습니다. 그래프 뷰는 `[[wikilink]]` 기반 연결만 그립니다
- 워크플로우 대시보드는 Docuflow 고유 기능이며 Obsidian에서는 Dataview 쿼리로 비슷한 뷰를 만들 수 있습니다

---

## 9. 체크리스트

### 초기 설정
- [ ] 프로젝트 폴더를 Obsidian vault로 등록
- [ ] Obsidian Properties 패널 설정 → `Hidden` 또는 `Source`
- [ ] Linter 계열 플러그인 비활성화 또는 폴더 제외
- [ ] Strict line breaks 켜기
- [ ] `.gitignore`에 Obsidian 개인 상태 파일 추가

### 일상 사용
- [ ] 한 파일은 한 번에 한 앱에서만 편집
- [ ] Docuflow에서 편집하던 탭을 닫고 Obsidian으로 전환
- [ ] Obsidian 저장 후 Docuflow에서 새로고침 배너가 뜨면 새로고침 클릭
- [ ] 워크플로우 필드는 Docuflow UI로만 수정
- [ ] 태그는 frontmatter 또는 본문 인라인 모두 사용 가능

### 문제 발생 시
- [ ] 먼저 Docuflow의 `📜 이 파일의 이력` 으로 복구 시도
- [ ] Git에서 이전 커밋 확인
- [ ] Obsidian 플러그인을 의심하고 비활성화 후 재현 테스트

---

## 10. 요약

**Docuflow + Obsidian = 강력한 조합**
- Docuflow가 워크플로우/결재/팀 협업의 뼈대를 제공
- Obsidian이 편집·지식관리·시각화의 확장성을 보태줌
- 둘의 교집합은 **공통 .md 파일과 YAML frontmatter**

**핵심 규칙 3가지**
1. 동시 편집 금지
2. 워크플로우 필드는 Docuflow에서만 편집
3. Obsidian 자동 포맷 플러그인 비활성화

이 규칙만 지키면 두 도구가 매끄럽게 공존합니다.
