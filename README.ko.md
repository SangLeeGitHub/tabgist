# TabGist

> 원클릭으로 웹페이지 요약 — LLM 기반, 새 탭에 스트리밍.

TabGist는 현재 탭의 콘텐츠를 추출해 선택한 LLM으로 간결한 요약을 생성하는 Chrome 확장 프로그램(Manifest V3)입니다. 툴바 아이콘을 클릭하면 새 탭이 열리며 실시간으로 요약이 스트리밍됩니다.

[English](README.md)

## 기능

- **원클릭 요약** — 어떤 웹페이지에서든 툴바 아이콘 클릭
- **실시간 스트리밍** — LLM이 생성하는 대로 토큰 단위로 요약이 표시됨
- **듀얼 프로바이더 지원**
  - **Anthropic** — Claude 모델 (Messages API)
  - **OpenAI 호환** — OpenAI, LM Studio, Ollama, llama.cpp, OpenRouter, Groq, vLLM 등 `/v1/chat/completions` 엔드포인트
- **6개 빌트인 프리셋** — 인기 프로바이더 원클릭 설정
- **8개 출력 언어** — 자동(페이지 언어 따라감), 한국어, English, 日本語, 中文, Español, Français, Deutsch
- **다크 모드** — 시스템 설정에 자동 연동
- **연결 테스트** — API 설정 저장 전 작동 여부 확인
- **통계 표시** — 요약 완료 후 Thinking time, 전체 시간, t/s 표시
- **액션 버튼** — 재생성, 복사, 원문 열기, 닫기

## 설치

1. 이 저장소를 클론
2. Chrome에서 `chrome://extensions` 열기
3. 우측 상단 **개발자 모드** 활성화
4. **압축해제된 확장 프로그램을 로드합니다** 클릭 → `TabGist` 폴더 선택
5. 툴바의 TabGist 아이콘 클릭하여 시작

## 설정

1. TabGist 아이콘 우클릭 → **옵션** (또는 `chrome://extensions` → TabGist → 세부정보 → 확장 프로그램 옵션)
2. **Provider** 선택 (Anthropic 또는 OpenAI Compatible)
3. **API Key** 입력 (LM Studio / Ollama 등 로컬 서버는 비워두기)
4. 필요에 따라 **Base URL**, **Model**, **Max Tokens** 조정 — 프리셋 드롭다운 활용 가능
5. **Test Connection** 클릭하여 확인
6. **Save** 클릭

## 사용법

1. 아무 웹페이지로 이동 (기사, 블로그, 위키 등)
2. 툴바의 TabGist 아이콘 클릭
3. 새 탭이 열리며 다음과 같이 진행:
   - 콘텐츠 추출 중 **"Analyzing page..."** 표시
   - 첫 토큰 대기 중 **"Generating summary..."** 표시
   - 타이핑 커서와 함께 스트리밍 요약
   - 완료 후 하단에 통계 표시
4. 액션 버튼으로 재생성, 복사, 원문 열기, 닫기 가능

### 지원 프리셋

| 프리셋 | Base URL | 기본 모델 |
|--------|----------|-----------|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| LM Studio | `http://localhost:1234/v1` | — |
| llama.cpp server | `http://localhost:8080/v1` | — |
| Ollama | `http://localhost:11434/v1` | — |
| OpenRouter | `https://openrouter.ai/api/v1` | — |

### 언어 설정

| 설정 | 동작 |
|------|------|
| Auto | 원문 페이지와 같은 언어로 요약 |
| 특정 언어 | 원문 언어와 무관하게 선택한 언어로 번역 요약 |

## 프로젝트 구조

```
TabGist/
├── manifest.json           # Manifest V3 설정
├── background.js           # 서비스 워커 (오케스트레이션)
├── content.js              # Readability 기반 콘텐츠 추출
├── providers/
│   ├── index.js            # 공통 인터페이스 + 언어별 프롬프트
│   ├── anthropic.js        # Anthropic Messages API + SSE
│   └── openai.js           # OpenAI 호환 /chat/completions + SSE
├── lib/
│   └── Readability.js      # Mozilla Readability (vendored)
├── summary/
│   ├── summary.html        # 요약 결과 페이지
│   ├── summary.js          # 스트리밍 렌더러 + 통계
│   └── summary.css         # 다크 모드 포함 스타일
├── options/
│   ├── options.html        # 설정 페이지
│   ├── options.js          # 설정 로직 + 프리셋 + 테스트
│   └── options.css         # 설정 페이지 스타일
└── icons/                  # 16/48/128 PNG 아이콘
```

## 기술 스택

- Vanilla JavaScript (빌드 스텝 없음, 프레임워크 없음)
- Mozilla Readability.js (콘텐츠 추출)
- CSS custom properties (다크 모드 `prefers-color-scheme` 연동)
- Chrome Extension Manifest V3

## 참고사항

- `chrome://`, `file://` 등 제한된 페이지는 요약 불가
- 텍스트 콘텐츠가 50자 미만인 페이지는 에러 표시
- API 키는 `chrome.storage.local`, 나머지 설정은 `chrome.storage.sync`에 저장
- Max Tokens 기본값은 2048 — 요약이 잘리면 설정에서 증가

## 라이선스

MIT
