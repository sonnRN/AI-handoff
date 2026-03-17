# Synthea MCP Data Source

## 목적

브라우저 앱은 계속 `patients-mcp`만 호출하고, MCP 뒤에서 데이터 소스를 바꿔 끼우기 위한 구조입니다.

즉:

- 앱
- MCP API
- 데이터 소스 선택
- `SMART public synthetic FHIR` 또는 `Synthea local files`

형태로 동작합니다.

## 현재 지원 소스

- `smart-fhir`
  - 공개 합성 FHIR 샌드박스
- `synthea-local`
  - 로컬 또는 서버 디스크의 Synthea FHIR JSON

## 설정

환경변수:

- `AI_HANDOFF_PATIENT_SOURCE`
  - 기본값: `smart-fhir`
  - Synthea 사용 시: `synthea-local`
- `AI_HANDOFF_SYNTHEA_DIR`
  - Synthea JSON 폴더 경로
  - 기본값: `data/synthea/fhir`

## API 사용

기본 목록:

- `/api/patients-mcp?count=20`

Synthea 목록:

- `/api/patients-mcp?count=20&source=synthea`

Synthea 상세:

- `/api/patients-mcp?id={patientId}&source=synthea`

## 저장 방식

Synthea 데이터는 코드 파일 안에 넣지 않습니다.

권장 저장 위치:

- 로컬 개발: `data/synthea/fhir`
- 서버 배포: 서버 디스크 또는 별도 스토리지 마운트

## 공개 저장소 원칙

- 실환자 데이터 금지
- 합성 데이터만 허용
- 런타임에서 `source` 메타데이터 유지
- 공개 데모에서는 안전한 공개 합성 데이터만 사용
