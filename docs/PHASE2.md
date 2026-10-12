# A.T.Field — Phase 2 구현 목표

Phase 1(MVP) 이후 구현할 항목. Phase 1의 스키마/구조는 아래 항목을 마이그레이션 없이 수용할 수 있도록 설계되어 있다.

---

## 1. 키보드 단축키 (편집 모드 토글)

- 기본 키: `Command+Shift+M` (macOS), 그 외 `Ctrl+Shift+M`
  - manifest `commands.toggle-edit-mode.suggested_key`에 `"mac": "Command+Shift+M"`, `"default": "Ctrl+Shift+M"` 지정
  - 충돌 시 `about:addons` → 단축키 관리에서 변경 가능
- **백그라운드 스크립트 추가**: `background/background.js` (Firefox MV3 이벤트 페이지, `"background": { "scripts": [...] }`)
  - `browser.commands.onCommand` 수신 → 활성 탭에 `tabs.sendMessage({ type: "TOGGLE_EDIT_MODE" })`
  - 메시지 타입은 Phase 1 팝업이 사용하는 프로토콜(`shared/messages.js`)을 그대로 재사용
- 프리셋이 없는 채널에서 단축키 입력 시 동작 정의 필요 (무시 / 기본 마스크 생성 후 편집 모드 진입)

## 2. 커스텀 이미지 / 애니메이션 GIF 마스크

- `style.type = "image"` 추가, `style.imageId`로 이미지 참조 (Phase 1 스키마에 필드 예약됨)
- 이미지 저장소는 프리셋과 분리
  - `img:<sha256>` 키(`storage.local`) 또는 확장 origin IndexedDB
  - 같은 이미지를 여러 채널에서 공유 시 중복 저장 방지 (해시 기반 dedupe)
  - 참조 카운트 또는 옵션 페이지에서 "미사용 이미지 정리" 제공
- 렌더링: `background-image`, `background-size: cover | contain`, `background-position: center`
- **사전 검증 필요**: YouTube CSP가 content script에서 지정한 `data:` URL 배경을 차단하는지 확인. 차단 시 `URL.createObjectURL(blob)` 방식으로 전환
- 업로드 용량 제한(예: 5MB) 및 MIME 검사

## 3. 백업 / 복원

- 옵션 페이지에 JSON 내보내기 / 가져오기
- 포맷: `{ "format": "atfield-backup", "schemaVersion": N, "exportedAt": ..., "data": { ... } }`
- 가져오기 시 `schemaVersion` 확인 → `shared/storage.js`의 마이그레이션 경로 통과
- 충돌 정책 선택: 덮어쓰기 / 병합(updatedAt 최신 우선)
- 이미지(Phase 2-2) 포함 여부 옵션

## 4. 다중 마스크 / 다중 프로필 UI

- 스키마는 Phase 1부터 `profiles[].masks[]` 배열 구조 (UI만 1개로 제한)
- 마스크 추가/삭제, 선택 상태 표시, 마스크별 스타일
- 채널 내 프로필 전환 (예: "게임 방송", "토크 방송") — 팝업 드롭다운

## 5. 기타 후보 (우선순위 미정)

- 모자이크(픽셀화) 스타일 — canvas 기반, 성능 측정 후 결정
- 미니플레이어 / Shorts 지원 여부 재검토
- 추가 언어 (`_locales/ja` 등)
- "A.T.Field" 테마 스타일 (육각형 패턴 오버레이)
