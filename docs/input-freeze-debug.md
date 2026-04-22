# 텍스트 입력 먹통 버그 진단 체크리스트

## 현재 가설

**Windows + Electron `window.confirm()` + 커스텀 titleBarOverlay** 조합으로 인해 네이티브 대화상자 닫힌 뒤 BrowserWindow가 OS 레벨에서 "비활성" 상태로 고착되는 이슈.

트리거로 의심되는 코드 경로:
- `GitPanel.tsx` — 파일 변경사항 취소 (우클릭 → 취소)
- `FileTree.tsx` / `ProjectTree.tsx` — 파일·폴더 삭제, 변경 취소
- `FileHistoryModal.tsx` — 이전 커밋으로 복원
- `WorkflowBar.tsx` / `WorkflowDocPanel.tsx` — 워크플로우 승인 요청
- `App.tsx` — 저장 안 된 문서 있을 때 닫기 시도
- `exportImport.ts` — PDF/DOCX 내보낸 뒤 "탐색기에서 열까요?"

공통점: 모두 `window.confirm` 또는 `window.prompt` 호출.

## 다음 발생 시 체크리스트 — 재시작하기 전 순서대로

### 1. 가설 확증 (가장 중요)

재시작 없이 다음을 시도하고 어느 것에서 복구되는지 기록:

- [ ] **Alt+Tab으로 다른 창 갔다가 돌아오기**
- [ ] **Win+D로 바탕화면 토글했다가 앱 복귀**
- [ ] **창을 최소화했다가 복원**
- [ ] **창을 마우스로 드래그해 살짝 움직이기**
- [ ] **창 가장자리 살짝 리사이즈**

위 중 하나라도 복구되면 → **BrowserWindow focus state 고착 가설 확정** → `window.confirm` 교체 작업 시작.

### 2. 범위 확인

- [ ] **본문 편집기 커서 블링크**가 보이는가? (안 보이면 native focus 이탈 확정)
- [ ] **영문**은 입력되는가? 한글만 안 되는가? (영문도 안 되면 IME 아님)
- [ ] **체크박스·토글 스위치** 같은 비-input UI는 정상 동작하는가?
- [ ] **Ctrl+Shift+R 렌더러 리로드**로 고쳐지는가? (안 고쳐지면 네이티브 창 문제)

### 3. 직전 행동 기록

먹통 직전 **5분간의 조작**을 기억나는 대로 기록:

- 어떤 대화상자를 봤는가? (삭제 확인, 되돌리기 확인, 내보내기 완료 등)
- 대화상자에서 확인을 눌렀는가, 취소를 눌렀는가, 아니면 X로 닫았는가?
- 대화상자 직후 앱이 잠깐이라도 멈춘 것 같았는가?
- Git 관련 에러 메시지가 떴다면 정확히 어떤 메시지였는가?

### 4. DevTools 확인 (선택)

개발자 도구를 열 수 있는 상태면:

```js
document.activeElement              // <body>면 focus 자체가 안 들어간 것
document.hasFocus()                 // false면 native window 비활성 확정
document.visibilityState            // "visible"이어야 정상
```

## 수정 계획 (가설 확정 시)

### A. 즉시 (작은 변경)

`main.ts`에 강제 포커스 복귀 IPC 추가, 모든 `window.confirm` 직후 호출:

```ts
// main.ts
ipcMain.handle('app:refocus', () => {
  mainWindow?.blur()
  mainWindow?.focus()
})
```

### B. 근본 해결 (권장)

`window.confirm` / `window.prompt` / `window.alert`를 **모두 React 커스텀 모달로 교체**. 교체 대상 ~15곳:

- `GitPanel.tsx` (2곳)
- `FileTree.tsx` (4곳)
- `ProjectTree.tsx` (3곳)
- `FileHistoryModal.tsx` (1곳)
- `WorkflowBar.tsx` (1곳)
- `WorkflowDocPanel.tsx` (1곳, `window.prompt`)
- `App.tsx` (1곳, beforeClose)
- `utils/exportImport.ts` (3곳)

공통 `ConfirmDialog` 컴포넌트 하나 만들어서 Promise 반환 API로 교체.

## 참고 Electron 이슈

- [electron/electron#20400](https://github.com/electron/electron/issues/20400) — window.confirm focus issue
- [electron/electron#10078](https://github.com/electron/electron/issues/10078) — titleBarStyle 'hidden' focus bug
