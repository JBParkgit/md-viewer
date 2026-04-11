# Changelog

## 2.0.0 — 2026-04-12

주요 주제: **문서 승인 워크플로우**, **Obsidian 연동**, **저장·Git UX 개선**

### 추가 — 승인 워크플로우

- frontmatter 기반 결재 시스템 도입 (`status`, `author`, `created`, `dueDate`, `requestNote`, `history`, `approvers`)
- 에디터 상단에 인라인 **워크플로우 바** — 상태 표시, 상태 칩 드롭다운(직접 변경), `🚀 리뷰 요청`, `✅ 승인` / `❌ 반려`, `← 초안으로`, `🗑️ 워크플로우 제거`
- 내 액션이 필요한 문서에서 자동 펼침 + 빨간 배경·좌측 테두리
- 승인자 추가/삭제, 작성자·기한 인라인 편집 (frontmatter 직접 수정 불필요)
- 리뷰 요청 시 **승인자에게 보낼 메시지** 입력(인라인 composer) → `requestNote` 필드로 저장
- 리뷰 요청 / 승인 / 반려 / 초안 되돌림이 일어날 때마다 **자동으로 `history` 누적** (1차/2차 등 사이클 번호 포함)
- 우측 RightPanel에 **"승인" 탭** — 같은 동작을 우측 패널에서도 수행 가능

### 추가 — 대시보드 & 탐색

- **사이드바 ✓ 승인 워크플로우 탭** — 현재 사용자 설정, 받은 요청, 내 초안, 내가 요청한 리뷰, 상태 카운트
- **워크플로우 대시보드** — 4칸 칸반(초안/검토중/승인됨/반려됨), 프로젝트·파일명 검색, 필터(전체/받은 요청/내 문서)
- 승인됨 칼럼은 기본 최근 10개만 표시, `+ 더보기` 로 확장
- 카드 진행률 바(`approved/total`), 빨간 테두리(내 액션 필요)
- 사이드바 활동바 아이콘에 **빨간 배지** (받은 요청 개수)
- FileTree에 **워크플로우 상태 아이콘** + 내 액션 필요 시 빨간 점

### 추가 — 샘플 & 문서

- `samples/workflow/` — 초안/검토중/승인됨/반려됨 4가지 상태 샘플 문서
- `docs/frontmatter-guide.md` — Frontmatter 작성 가이드 (태그, 워크플로우 필드, 실수 방지)
- `docs/obsidian-integration.md` — Obsidian 공존 가이드 (설정, 패턴, FAQ, 체크리스트)

### 추가 — Obsidian 연동

- 파일 우클릭 → **`📝 Obsidian에서 열기`** — `obsidian://open` URI로 vault 안의 파일을 Obsidian에서 엶
- 경로 정규화: 백슬래시를 포워드 슬래시로 변환, 세그먼트별 URI 인코딩 (Windows 한글 경로 지원)
- **인라인 `#태그`** 자동 수집 — 본문의 `#기획` 같은 Obsidian 스타일 태그가 사이드바 🏷️ 태그 패널에 자동 표시
  - 헤딩 라인 / 펜스드 코드블록 / 인라인 코드 스팬 / 순수 숫자 태그 제외
  - 한글, 중첩(`#project/alpha`), 유니코드 문자 지원
- `parseAllTags()` — frontmatter 태그 + 인라인 태그 합쳐 RightPanel 관련 문서 로직에 사용

### 추가 — Git & 파일 이력

- 파일 우클릭 → **`📜 이 파일의 이력`** — 좌측 커밋 목록 / 우측 시점별 내용 미리보기 / `↩️ 이 시점으로 되돌리기`
- 새 IPC: `git:fileLog`, `git:fileShow`, `git:checkoutFileAtCommit`
- `gitExec`에 **UTF-8 강제 옵션** (`-c i18n.logOutputEncoding=UTF-8 -c i18n.commitEncoding=UTF-8` + `LC_ALL=C.UTF-8`) → 한글 작성자명·커밋 메시지·파일 내용 mojibake 해결
- 파일 로그 포맷 구분자를 `|` → `\t`로 변경 (Windows cmd.exe가 `|`를 파이프로 해석하는 문제 회피)

### 추가 — 저장 & UX 피드백

- 저장 완료 시 **`저장됨 ✓`** 초록 토스트, 변경 없을 때 Ctrl+S는 **`이미 저장됨 ✓`** 회색 토스트로 구분
- `file-saved` 글로벌 이벤트 → ProjectTree가 자동으로 git status 갱신 (M/A/D 표시 즉시 반영, 수동 새로고침 불필요)
- 에디터 하단 **상태 바** — 단어 수 / 문자 수 / 공백 제외 수 + 파일명. CJK(한·중·일) 문자는 1단어 단위로 집계
- 폴더 펼침 상태(`openDirs`)를 electron-store에 영속화 — 사이드바 탭 전환이나 앱 재시작 후에도 유지
- 워크플로우 시작이나 태그 추가 시 "파일이 외부에서 변경됨" 배너가 뜨는 문제 해결 (메인 프로세스에서 self-write 추적으로 억제)

### 변경

- **단순화**: `reviewers`/`approvers` 2단계 결재 → **`approvers` 단일 목록**으로 병합 (순차 진행 로직 제거, 모든 승인자 병렬 처리)
- 레거시 `reviewers:` 필드는 파서가 자동으로 `approvers`에 병합해 읽고, 저장 시 사라짐 (마이그레이션)
- frontmatter 파서를 **YAML 블록 단위**로 재작성 — 태그 업데이트와 워크플로우 업데이트가 서로의 중첩 구조를 훼손하지 않음 (`parseYamlBlocks`/`serializeYamlBlocks`/`replaceBlocks`)
- `워크플로우 초안` 기본 템플릿 추가 + `{{author}}` 치환 변수 지원

### 제거

- **파일 우클릭 → 태그 관리 메뉴** 삭제 — electron-store 기반의 로컬 `fileTags` 시스템이 frontmatter 태그와 혼동을 일으켜 제거 (표시도 삭제)
- **오래된 Docuflow 가이드 문서 2개** 삭제

### 수정

- **Ctrl+B 충돌 해결**: 사이드바 토글 단축키(Ctrl+B)가 에디터의 굵게(`**bold**`)와 겹치던 문제 → 사이드바 단축키 제거
- **변경 취소(discard) 후 M 표시 지속** 문제 해결 → 액션 후 자동으로 git status 재로드 + 열린 탭 내용 자동 갱신
- Stage / Unstage 액션 후에도 git 상태 자동 갱신 이벤트 발행
- **승인자 추가 버튼** — 점선 placeholder 방식이 버튼으로 오인되는 UX 문제 → 입력란 + `+ 추가` 명시 버튼으로 변경

---

## 1.0.0 — 이전 릴리스

Markdown 문서 뷰어/에디터 기반 기능 (탭, 프로젝트 폴더, 프리뷰, Kanban, Calendar, Git, 태그, 즐겨찾기 등).
