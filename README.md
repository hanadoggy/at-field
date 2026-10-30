# A.T.Field

YouTube 영상 내부에 하드코딩된 채팅창(burnt-in chat overlay)이나 특정 영역을 **채널별로 가려주는(블러/단색 마스크)** Firefox Manifest V3 확장 프로그램입니다.

---

## 주요 기능

- **채널별 자동 프리셋 적용**: YouTube `/watch` 페이지 진입 및 SPA 이동 시 채널 ID(`UC...`)를 감지하여 저장된 마스크 프리셋을 자동으로 표시합니다.
- **비디오 렌더 영역 기준 상대 좌표계**: 레터박스(상하 여백)와 필러박스(좌우 여백)를 제외한 실제 영상 렌더링 박스 기준 비율(`0.0 ~ 1.0`)로 좌표를 계산하여 기본 뷰, 극장 모드, 전체화면, 창 리사이즈 시에도 정확한 위치를 유지합니다.
- **인터랙티브 마스크 편집기**:
  - 단축키(`Command+Shift+M` / `Ctrl+Shift+M`) 또는 팝업 버튼으로 즉시 편집 모드 진입/종료 (프리셋 없는 채널에서도 단축키 입력 시 기본 마스크 자동 생성)
  - 마우스 드래그 이동 및 8방향 리사이즈 핸들 지원
  - 방향키 미세 조정 (`0.2%` 단위, `Shift` + 방향키 `1.0%` 단위)
  - 편집 중 YouTube 단축키(`k`, `j`, `l`, `f`, `t`, `m`, `c`, `Space`, `0~9`) 오작동 차단 및 `Enter` 저장 / `Esc` 롤백
- **마스크 스타일 커스터마이징**:
  - **블러(Blur)**: `backdrop-filter: blur()` + 반투명 색상 틴트 오버레이
  - **단색(Solid Color)**: 불투명도 및 색상 지정
- **설정 백업 및 복원**: 옵션 페이지에서 JSON 포맷(`atfield-backup`) 내보내기 및 가져오기(최신 우선 병합 / 전체 덮어쓰기)를 지원합니다.
- **자동 제외 감지**: 광고 재생 중(`ad-showing`), 미니플레이어 활성화, YouTube Shorts(`/shorts`)에서는 마스크를 자동으로 숨깁니다.
- **다국어 지원**: 한국어(`ko`), 영어(`en`) 지원

---

## 기술 스택 및 프로젝트 구조

- **프레임워크 / 번들러**: [WXT](https://wxt.dev/) `0.21.4` (Firefox MV3 타겟, `minify: false`)
- **언어**: TypeScript `~5.9` (`strict: true`, `noUncheckedIndexedAccess: true`)
- **테스트**: Vitest `^5.0`

```text
at-field/
├── wxt.config.ts                  # WXT 빌드 및 Firefox MV3 manifest 설정
├── tsconfig.json                  # TypeScript Strict 설정
├── vitest.config.ts               # Vitest 단위 테스트 설정
├── src/
│   ├── entrypoints/
│   │   ├── background.ts          # 단축키(commands) 이벤트 수신 Background 스크립트
│   │   ├── content/               # YouTube Content Script 엔트리 (index.ts, style.css)
│   │   ├── popup/                 # 확장 팝업 UI (index.html, main.ts, style.css)
│   │   └── options/               # 전체 채널 관리, 기본 스타일, 백업/복원 설정 페이지
│   ├── content/                   # Content Script 전용 모듈
│   │   ├── geometry.ts            # 비디오 렌더 영역 계산 및 비율↔픽셀 변환
│   │   ├── channel.ts             # 3단계 YouTube 채널 ID/이름 감지
│   │   ├── exclusion.ts           # 광고 / 미니플레이어 / Shorts 제외 판정
│   │   ├── mask.ts                # 마스크 DOM 생성·스타일·위치 반영
│   │   └── editor.ts              # 드래그 / 8방향 리사이즈 / 키보드 편집기
│   ├── shared/                    # 공용 모듈 (constants, storage, messages, i18n, browser-api, dom)
│   ├── types/                     # 스키마, 메시지, YouTube/Firefox X-ray 타입 정의
│   └── public/                    # 정적 파일 (_locales/{en,ko}, icons/icon.svg)
├── test/                          # 단위 테스트 및 v0.1.1 호환성 픽스처
└── docs/                          # 설계, 마이그레이션, 테스트 및 향후 개선 문서
```

---

## 빌드 및 실행 방법 (Build Instructions for Reviewers & Developers)

> **AMO Reviewers**: Below are the exact environment requirements and steps to reproduce the extension build from the source archive.

### 1. 요구 환경 (Prerequisites)
- **OS**: macOS, Linux, or Windows
- **Node.js**: `>= 20.x` (권장 및 검증 버전: `v24.x` / npm `11.x`)
- **Firefox**: `>= 142.0` (`strict_min_version: 142.0`)

### 2. 의존성 설치 및 빌드 (Install & Build)

```bash
# 1. package-lock.json 기준 의존성 설치 (postinstall로 wxt prepare 자동 실행)
npm ci

# 2. 타입 검사 + 단위 테스트 + Firefox MV3 프로덕션 빌드 일괄 실행
npm run check
```

개별 스크립트는 다음과 같습니다:

| 명령어 | 설명 |
|---|---|
| `npm run typecheck` | `tsc --noEmit`으로 TypeScript 타입 검사 |
| `npm test` | `vitest run`으로 단위 테스트 실행 |
| `npm run build` | `dist/firefox-mv3/` 경로에 Firefox MV3 확장 빌드 생성 (`minify: false`) |
| `npm run zip` | `dist/at-field-<version>-firefox.zip` 및 `*-sources.zip` 생성 |
| `npm run lint:amo` | `npx -y web-ext@latest lint -s dist/firefox-mv3`로 AMO 정적 검증 |
| `npm run sign` | `dist/firefox-mv3`를 대상으로 개인용 Unlisted 서명 실행 |

### 3. Firefox에 임시 부가 기능으로 로드하기

1. `npm run build`를 실행하여 `dist/firefox-mv3/` 디렉터리를 생성합니다.
2. Firefox 주소창에 `about:debugging#/runtime/this-firefox`를 입력합니다.
3. **임시 부가 기능 로드... (Load Temporary Add-on...)** 버튼을 클릭합니다.
4. `dist/firefox-mv3/manifest.json` 파일을 선택합니다.

---

## 관련 문서

- [docs/TESTING.md](file:///Users/hanayor/personal-project/at-field/docs/TESTING.md): 수동 기능 검증 체크리스트 및 Unlisted 서명 가이드
- [docs/PHASE2.md](file:///Users/hanayor/personal-project/at-field/docs/PHASE2.md): Phase 2 기능 명세 (단축키, 이미지 마스크, 백업/복원, 다중 마스크)
- [docs/type-script-migration-plan.md](file:///Users/hanayor/personal-project/at-field/docs/type-script-migration-plan.md): TypeScript + WXT 마이그레이션 설계 및 완료 기록
- [docs/IMPROVEMENT_PLAN.md](file:///Users/hanayor/personal-project/at-field/docs/IMPROVEMENT_PLAN.md): 마이그레이션 이후 개선 과제 및 우선순위 로드맵
