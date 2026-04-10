# TabGist — PRD

> 이름은 `TabGist`로 가정하고 작성. 바꾸려면 전역 치환만 하면 됨.

## 1. 개요
현재 활성 탭의 웹페이지를 LLM으로 요약해서 **새 탭**에 보여주는 Chrome 익스텐션. 브라우저 툴바의 익스텐션 아이콘을 클릭하는 순간 요약이 시작되고, 결과는 새 탭에서 스트리밍으로 렌더링된다.

## 2. 목표 / 비목표
**목표**
- 원클릭으로 현재 탭 요약
- 요약 결과를 별도 탭에 깔끔하게 표시 (원문 링크, 제목, 요약, 핵심 포인트)
- 사용자가 API 키와 모델을 설정할 수 있는 옵션 페이지
- Manifest V3 기반, 최신 Chrome 호환

**비목표 (v1 제외)**
- 다국어 UI (영/한만 지원)
- 요약 히스토리 저장
- PDF, 유튜브, 로그인 필요 페이지 특수 처리
- 멀티탭 일괄 요약

## 3. 사용자 플로우
1. 사용자가 웹페이지에서 툴바의 TabGist 아이콘 클릭
2. 익스텐션이 현재 탭의 본문 텍스트를 추출
3. 새 탭이 즉시 열리며 "요약 중..." 상태 표시
4. LLM API 호출 → 응답을 스트리밍으로 새 탭에 렌더링
5. 사용자는 원문 링크로 돌아가거나, 요약을 복사/재생성 가능

## 4. 기능 요구사항

### 4.1 콘텐츠 추출
- content script에서 `Readability.js` (Mozilla) 사용해 본문 추출
- 실패 시 fallback: `document.body.innerText`
- 최대 길이: 제목 + 본문 합쳐 약 20,000자로 트렁케이트
- 메타데이터 수집: `title`, `url`, `description` (og:description 우선)

### 4.2 요약 탭 UI
`summary.html` — 새 탭으로 열리는 결과 페이지.
- **헤더**: 원문 제목 + 원문 URL (클릭 시 원본으로 이동)
- **요약 섹션**: 3~5문장 TL;DR
- **핵심 포인트**: 불릿 5~8개
- **액션 버튼**: 재생성, 복사, 원문 열기
- 다크모드 지원 (시스템 설정 따라감)
- 스트리밍 표시 (타이핑 효과)

### 4.3 백그라운드 / 서비스 워커
- `chrome.action.onClicked` 리스너
- 현재 탭 정보 취득 → content script에 메시지 보내 본문 추출
- `chrome.tabs.create`로 `summary.html?tabId=...` 열기
- 추출된 본문은 `chrome.storage.session`에 임시 저장 후 summary 페이지에서 읽음

### 4.4 LLM 호출
**두 가지 프로바이더 타입을 지원**. 옵션 페이지에서 선택하며, 내부적으로 공통 인터페이스(`summarize(text, opts) → AsyncIterable<string>`)로 추상화한다.

#### A. Anthropic
- 엔드포인트: `{baseUrl}/v1/messages` (기본 `https://api.anthropic.com`)
- 헤더: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`
- 바디: `{ model, max_tokens, system, messages, stream: true }`
- 스트리밍: SSE, `content_block_delta` 이벤트의 `delta.text` 누적
- 기본 모델: `claude-sonnet-4-6`

#### B. OpenAI 호환
OpenAI 공식뿐 아니라 **동일 스키마를 따르는 모든 엔드포인트** 지원 — LM Studio, llama.cpp server, Ollama(`/v1`), OpenRouter, Groq, vLLM 등.
- 엔드포인트: `{baseUrl}/chat/completions` (예: `https://api.openai.com/v1`, `http://localhost:1234/v1`, `http://localhost:8080/v1`)
- 헤더: `Authorization: Bearer {apiKey}` (로컬 서버는 키 없어도 통과하도록 빈 값 허용)
- 바디: `{ model, messages, stream: true }`
- 스트리밍: SSE, `choices[0].delta.content` 누적, `[DONE]` 종료
- 기본 모델: `gpt-4o-mini` (편집 가능)

#### 공통
- 시스템 프롬프트는 **요약 언어 설정값에 따라 동적으로 생성**한다:
  - `auto`: `"You summarize web pages concisely. Output format: 1) 3-5 sentence TL;DR, 2) 5-8 bullet key points. Write the summary in the same language as the source page."`
  - 특정 언어 지정 시 (예: `ko`): `"You summarize web pages concisely. Output format: 1) 3-5 sentence TL;DR, 2) 5-8 bullet key points. Write the summary in Korean regardless of the source language."`
  - 즉, 언어 설정이 **Auto면 페이지 언어 따라감**, **특정 언어면 원문과 무관하게 무조건 해당 언어로 번역 요약**
- User 메시지: `"Title: {title}\nURL: {url}\n\n{body}"`
- `max_tokens` 기본 1024, 옵션에서 조정 가능

#### 옵션 페이지에서 설정 가능한 항목
- **Provider**: `anthropic` | `openai-compatible` (라디오 또는 드롭다운)
- **API Key** (provider별로 독립 저장 — 둘 다 넣어두고 전환 가능)
- **Base URL** (provider별 기본값 프리필, 사용자 수정 가능)
- **Model** (provider별 기본값 프리필)
- **Max tokens** (기본 1024)
- **요약 언어**:
  - `Auto` (기본) — 원문 페이지 언어 그대로 요약
  - `한국어` / `English` / `日本語` / `中文` / `Español` / `Français` / `Deutsch` — 원문 언어와 무관하게 선택한 언어로 번역 요약
  - 드롭다운으로 선택, 내부적으로는 ISO 639-1 코드(`auto`, `ko`, `en`, `ja`, `zh`, `es`, `fr`, `de`)로 저장
- 저장 위치: `chrome.storage.sync` (단, API 키는 `chrome.storage.local` 권장)
- **Test Connection** 버튼: 현재 설정으로 짧은 핑 요청을 보내 성공/실패 표시

#### 프리셋 (옵션 페이지 "Load preset" 드롭다운)
원클릭으로 Base URL + 모델을 채워주는 프리셋 제공:
- Anthropic (claude-sonnet-4-6)
- OpenAI (gpt-4o-mini)
- LM Studio (http://localhost:1234/v1)
- llama.cpp server (http://localhost:8080/v1)
- Ollama (http://localhost:11434/v1)
- OpenRouter (https://openrouter.ai/api/v1)

### 4.5 옵션 페이지
`options.html` — 심플한 폼. 저장 시 토스트 알림. API 키는 `type="password"`.

### 4.6 에러 처리
- API 키 미설정 → 새 탭에 "옵션에서 API 키를 설정하세요" + 옵션 페이지 버튼
- 본문 추출 실패 → "이 페이지는 요약할 수 없습니다" 메시지
- API 에러 → 상태 코드 + 메시지 표시, 재시도 버튼
- `chrome://`, `file://` 등 제한된 URL → 클릭 시 알림 표시 후 동작 안 함

## 5. 파일 구조
```
TabGist/
├── manifest.json
├── background.js          # service worker
├── content.js             # Readability 기반 본문 추출
├── providers/
│   ├── index.js           # getProvider(config) → {summarize(text, opts)}
│   ├── anthropic.js       # Anthropic Messages API + SSE
│   └── openai.js          # OpenAI 호환 /chat/completions + SSE
├── lib/
│   └── Readability.js     # Mozilla Readability (vendored)
├── summary/
│   ├── summary.html
│   ├── summary.js
│   └── summary.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 6. manifest.json (초안)
```json
{
  "manifest_version": 3,
  "name": "TabGist",
  "version": "0.1.0",
  "description": "Summarize the current tab in a new tab with one click.",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_icon": "icons/icon48.png", "default_title": "Summarize this page" },
  "options_page": "options/options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## 7. 기술 스택
- Vanilla JS (빌드 스텝 없음, 프레임워크 없음)
- Mozilla Readability.js (본문 추출)
- CSS 직접 작성 (다크모드 포함)
- 테스트: 수동 QA 위주, v1은 자동화 테스트 미포함

## 8. 수용 기준 (Acceptance Criteria)
- [ ] 임의의 뉴스 기사, 블로그 글, 위키 페이지에서 아이콘 클릭 시 3초 내에 새 탭이 열린다
- [ ] 새 탭에서 스트리밍으로 요약이 나타난다
- [ ] 옵션 페이지에서 API 키 저장/로드가 된다
- [ ] Provider를 Anthropic ↔ OpenAI 호환으로 전환해도 동일하게 요약이 작동한다
- [ ] LM Studio 로컬 엔드포인트(`http://localhost:1234/v1`)로 설정해도 스트리밍 요약이 나온다
- [ ] Test Connection 버튼이 성공/실패를 정확히 표시한다
- [ ] API 키 없이 실행하면 안내 메시지가 나온다
- [ ] 언어 설정이 `Auto`일 때: 한국어 페이지는 한국어로, 영문 페이지는 영어로 요약된다
- [ ] 언어 설정이 `한국어`일 때: 영문 원문이어도 한국어로 번역 요약된다
- [ ] 언어 설정이 `English`일 때: 한국어 원문이어도 영어로 번역 요약된다
- [ ] 다크모드에서 가독성 문제 없음
- [ ] `chrome://` 페이지에서 실행 시 크래시 없음

## 9. 추후 고려사항 (v2+)
- 요약 히스토리 및 검색
- 선택 영역만 요약
- 단축키 지정
- 유튜브 트랜스크립트 요약
- 로컬 LLM 프리셋 (Ollama, LM Studio, llama.cpp) 프로파일
- Chrome Web Store 배포
