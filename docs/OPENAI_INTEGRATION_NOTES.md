# OpenAI 연동 메모

## 1. 연동 가능한가?

가능하다.

권장 방식은 두 가지다.

- 문서/예시를 ChatGPT에 직접 업로드해서 연구용으로 사용
- OpenAI API에 프로젝트 문서와 예시 데이터를 연결해서 앱 안에서 반복 사용

## 2. 가장 현실적인 순서

### 1단계. 문서화

아래 파일을 먼저 고정한다.

- `docs/PROJECT_BRIEF.md`
- `docs/CHATGPT_RESEARCH_PROMPT.md`
- 예시 입력/출력 JSON

### 2단계. ChatGPT 연구

위 파일들을 ChatGPT에 넣고 알고리즘 개선안을 받는다.

### 3단계. 코드 반영

연구 결과를 다시 이 프로젝트에 반영한다.

### 4단계. OpenAI API 연동

앱에서 OpenAI를 직접 호출할 경우 다음 흐름을 권장한다.

1. `instructions`에 프로젝트 고정 규칙을 넣는다.
2. `input`에 환자별 날짜 범위 요약 JSON을 넣는다.
3. 필요하면 `file_search`로 프로젝트 문서와 예시를 검색하게 한다.
4. 응답은 자유 텍스트보다 구조화 JSON으로 먼저 받는다.
5. 프론트가 JSON을 SBAR UI로 렌더링한다.

## 3. 왜 파일 검색이 중요한가?

프로젝트 설명, 출력 규칙, 예시 데이터를 매번 긴 프롬프트로 복사하지 않아도 되기 때문이다.

특히 아래 같은 자료를 넣어두면 좋다.

- 알고리즘 설명 문서
- SBAR 작성 규칙
- FHIR 필드 해설
- 좋은 출력 예시
- 나쁜 출력 예시

## 4. 추천 입력 구조

모델에는 원본 FHIR 전체보다 "정규화된 날짜별 요약 JSON"을 보내는 편이 안정적이다.

예시 구조:

```json
{
  "patient": {
    "id": "123",
    "diagnosis": "Septic shock"
  },
  "date_range": ["2025-11-30", "2025-12-02"],
  "daily_snapshots": [
    {
      "date": "2025-11-30",
      "clinical_status": {},
      "orders": {},
      "vitals": {},
      "labs": {},
      "nursing_actions": {}
    }
  ],
  "output_format": "SBAR_JSON"
}
```

## 5. 추천 응답 구조

모델이 바로 문장만 쓰게 하기보다 아래처럼 구조화 응답을 먼저 받는 편이 좋다.

```json
{
  "situation": [],
  "background": [],
  "assessment": [],
  "recommendation": [],
  "evidence": []
}
```

그 다음 프론트에서 문장화한다.

## 6. 공식 문서 기준으로 기억할 점

- 재사용 프롬프트를 버전 관리할 수 있다.
- `file_search`로 문서를 검색하게 할 수 있다.
- 상위 규칙은 `instructions`로 두고, 매 요청 데이터는 `input`으로 보내는 구조가 안정적이다.

## 7. 지금 프로젝트에 추천하는 다음 단계

1. 현재 로컬 알고리즘을 한 번 더 다듬는다.
2. 예시 입력/출력 JSON 5개를 만든다.
3. ChatGPT 연구 결과로 이벤트 스키마를 고정한다.
4. 그 뒤 OpenAI API 연동 여부를 결정한다.

## 8. 공식 참고 링크

- Prompting: https://platform.openai.com/docs/guides/prompting
- Prompt engineering: https://platform.openai.com/docs/guides/prompt-engineering/strategies-to-improve-reliability
- File search: https://platform.openai.com/docs/guides/tools-file-search
- Prompt optimizer: https://platform.openai.com/docs/guides/prompt-optimizer/
