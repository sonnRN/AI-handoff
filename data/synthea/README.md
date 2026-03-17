# Synthea Data Folder

이 폴더는 `Synthea`로 생성한 합성 FHIR 데이터를 MCP 서버 뒤에서 읽기 위한 위치입니다.

권장 구조:

- `data/synthea/fhir/`
  - 환자별 FHIR `Bundle` JSON 파일
  - 또는 재귀적으로 탐색 가능한 하위 폴더의 JSON 파일

현재 로더가 기대하는 입력:

- `Bundle.entry[].resource` 형태의 FHIR JSON
- 또는 단일 FHIR resource JSON

권장 방식:

1. Synthea로 합성 환자를 생성합니다.
2. 환자별 FHIR Bundle JSON을 `data/synthea/fhir/` 아래에 둡니다.
3. `AI_HANDOFF_PATIENT_SOURCE=synthea-local`로 MCP 런타임을 실행합니다.

주의:

- 이 저장소에는 대용량 Synthea 데이터를 기본 포함하지 않습니다.
- 공개 배포 시에도 실데이터나 PHI는 절대 넣지 않습니다.
- 이 폴더에는 합성 데이터만 두어야 합니다.
