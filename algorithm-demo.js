const STAGE_EXPLANATIONS = [
  {
    step: '1단계',
    title: '입력 정규화',
    question: 'AI는 무엇을 같은 환자 상태로 묶는가',
    nurseView: '흩어진 기록을 날짜 또는 근무조 기준의 한 장짜리 인계 상태로 정리합니다.',
    developerView: '소스 어댑터가 원천 데이터를 정규화 스냅샷으로 변환하고, 이후 로직은 이 공통 객체만 사용합니다.',
    logic: [
      '관찰값, 오더, 검사, 간호업무 기록을 현재상태, 오더, 활력징후, 검사결과, 간호수행 상태로 분류합니다.',
      '중복 텍스트와 같은 의미의 항목은 합치고, 비어 있는 값은 보수적으로 처리합니다.',
      '모든 핵심 항목에는 원본 근거 참조를 함께 남겨 이후 설명 가능성을 보장합니다.'
    ],
    output: ['정규화 스냅샷', '근거 참조 목록']
  },
  {
    step: '2단계',
    title: '종단 환자 핵심요약',
    question: 'AI는 n일치 데이터에서 무엇을 먼저 압축하는가',
    nurseView: '이 환자가 어떤 환자이고, 지금 무엇을 특히 봐야 하는지를 한 번에 이해할 수 있는 요약을 만듭니다.',
    developerView: '여러 날짜의 정규화 스냅샷을 종합해 핵심 배경 객체를 만들고, 이후 변화 감지와 우선순위화의 기준 문맥으로 사용합니다.',
    logic: [
      '환자 정체성, 현재 관리 틀, 지속 중인 핵심 문제, 꼭 봐야 할 배경, 지속 인계 책임을 분리해 압축합니다.',
      '한 번만 나온 정보보다 반복되고 지속되며 현재 간호행동을 바꾸는 정보를 더 높게 평가합니다.',
      '이 단계의 목표는 최근 변화보다 먼저 환자 전체 맥락을 잡는 것입니다.'
    ],
    output: ['핵심 환자요약', '지속 배경 요약', '지속 인계 배경']
  },
  {
    step: '3단계',
    title: '변화 감지',
    question: 'AI는 무엇이 새로 달라졌다고 판단하는가',
    nurseView: '인계에 영향을 주는 변화만 찾고, 단순 반복 정보는 올리지 않습니다.',
    developerView: '직전 스냅샷과 현재 스냅샷을 비교하되, 2단계 핵심요약을 기준 맥락으로 함께 참조합니다.',
    logic: [
      '상태 변화, 신규 오더, 중단 오더, 활력징후 변화, 검사 변화, 간호수행 상태 변화를 분리해서 감지합니다.',
      '추가, 삭제, 값 변화, 정상에서 이상으로의 전환, 완료에서 미완료로의 전환을 핵심 신호로 사용합니다.',
      '변화 이벤트는 항상 이 환자의 핵심 배경 위에서 해석되며, 배경 없는 숫자 변화로 처리하지 않습니다.'
    ],
    output: ['감지 이벤트 목록', '이벤트별 근거']
  },
  {
    step: '4단계',
    title: '의미화와 우선순위화',
    question: 'AI는 왜 이 변화가 인계에 중요한지, 무엇이 먼저인지 어떻게 정하는가',
    nurseView: '즉시 위험부터, 그다음은 시간 민감 행동, 이후는 후속 확인, 마지막은 배경 정보 순으로 정리합니다.',
    developerView: '이벤트마다 위험도, 긴급도, 행동 필요도, 지속 책임, 고위험 맥락, 보고 필요 플래그를 붙인 뒤 단계와 점수를 계산합니다.',
    logic: [
      '단계 승격 규칙이 먼저 적용됩니다. 즉시 안전 위험이나 미보고 중요 결과는 점수보다 먼저 상위 단계로 올라갑니다.',
      '그다음 기본분류점수와 가산·감산점을 합산해 같은 단계 안에서 정렬합니다.',
      '최종 결과에는 단계, 점수, 점수 근거, 승격 이유가 함께 남습니다.'
    ],
    output: ['우선순위 단계', '점수 내역']
  },
  {
    step: '5단계',
    title: '인계 출력',
    question: 'AI는 어떤 형태로 결과를 내보내는가',
    nurseView: '핵심 환자요약, 행동 필요 항목, 지속 인계 항목, 배경 요약, 상황·배경·사정·권고 연결 힌트로 나눠 보여줍니다.',
    developerView: '구조화된 인계 출력 객체를 만들고, 화면과 요약 생성기는 이 객체를 소비합니다.',
    logic: [
      '자유 문장보다 먼저 핵심 환자요약, 우선순위 이벤트, 행동 항목, 지속 인계, 배경 묶음, 설명 인덱스를 생성합니다.',
      '상황·배경·사정·권고 연결은 나중 단계에서 붙일 수 있도록 힌트 구조만 제공합니다.',
      '같은 출력 구조를 유지하면 FHIR에서 실제 병원 데이터로 옮겨도 핵심 인계 로직을 바꿀 필요가 줄어듭니다.'
    ],
    output: ['핵심 환자요약', '구조화된 인계 결과', '상황·배경·사정·권고 힌트']
  },
  {
    step: '6단계',
    title: '근거 검증과 환각 차단',
    question: 'AI는 출력 전에 어떻게 스스로 재검토하는가',
    nurseView: '근거가 약한 문장은 내보내지 않고, 확인이 필요한 항목은 명시적으로 보류합니다.',
    developerView: '사실 문장 단위 검증, 근거 연결, 재검색, 구조화 출력 제한, 근거 부족 시 생성 보류 규칙을 적용합니다.',
    logic: [
      '출력 문장을 사실 단위로 분해하고 각 문장마다 근거 연결 여부를 확인합니다.',
      '근거가 약하면 재검색 또는 재평가를 수행하고, 끝까지 근거가 부족하면 생성하지 않습니다.',
      '상위 우선순위 항목은 근거 연결률 100%를 요구해 환각 위험을 최소화합니다.'
    ],
    output: ['검증 통과 출력', '보류 항목', '근거 연결 정보']
  }
];

const SUMMARY_CORE_BLOCKS = [
  {
    title: '환자 정체성',
    items: [
      '입원 이유, 주진단, 중요한 과거력',
      '이 환자가 왜 여기 있는지 한 문단 안에 설명할 수 있어야 합니다.'
    ]
  },
  {
    title: '현재 관리 틀',
    items: [
      '산소치료, line 또는 tube 또는 drain, 격리, 활동 수준, 식이, 낙상·욕창 위험',
      '현재 간호의 틀을 바꾸는 관리 조건을 먼저 남깁니다.'
    ]
  },
  {
    title: '지속 중인 핵심 문제',
    items: [
      'n일 동안 반복되거나 아직 해결되지 않은 통증, 감염, 호흡, 순환, 배설, 정신상태 문제',
      '단기 변화보다 더 중요한 배경 문제를 추려냅니다.'
    ]
  },
  {
    title: '꼭 봐야 할 배경',
    items: [
      '반복 비정상 활력징후, 반복 이상 검사, 자주 쓰는 PRN, 경과상 중요한 처치 흐름',
      '오늘 변화가 없어도 다음 근무조가 놓치면 안 되는 맥락을 남깁니다.'
    ]
  },
  {
    title: '지속 인계 책임',
    items: [
      '미완료, 보류, 재확인 필요, 추적 관찰 중인 업무',
      '인계의 핵심은 남은 책임을 정확히 넘기는 데 있습니다.'
    ]
  }
];

const SUMMARY_WEIGHTS = [
  { item: '분류 기본점수', score: '0~10점', note: '환자 정체성, 현재 관리 조건, 지속 문제처럼 요약 안에 반드시 들어갈 유형일수록 높습니다.' },
  { item: '지속성', score: '0~6점', note: '여러 날 반복되거나 해결되지 않은 정보일수록 가산합니다.' },
  { item: '현재 행동 필요도', score: '0~6점', note: '현재 간호사가 행동을 바꿔야 하면 가산합니다.' },
  { item: '안전 위험도', score: '0~6점', note: '낙상, 호흡, 순환, 감염 악화, 보고 필요성 등 안전과 연결되면 가산합니다.' },
  { item: '간호 의존도', score: '0~4점', note: '간호 감시나 수행 의존성이 높을수록 가산합니다.' },
  { item: '반복성', score: '0~3점', note: 'n일 동안 반복해서 나타나면 우연한 정보보다 앞에 둡니다.' },
  { item: '해결 감점', score: '-6~0점', note: '이미 해결되었거나 현재 행동과 무관하면 감점합니다.' }
];

const SUMMARY_THRESHOLDS = [
  {
    title: '26점 이상: 핵심 배경',
    description: '요약 첫 부분에 반드시 포함해 이 환자가 어떤 환자인지 파악하게 만드는 항목입니다.'
  },
  {
    title: '18~25점: 집중 모니터링 배경',
    description: '상단 요약에는 포함하되 핵심 배경 다음 줄에서 집중 관찰 항목으로 보여줍니다.'
  },
  {
    title: '10~17점: 보조 배경',
    description: '상세 배경이나 추가 정보 영역으로 내리되 필요 시 확인할 수 있게 둡니다.'
  },
  {
    title: '9점 이하: 상단 인계 제외',
    description: '현재 인계 집중도를 해치므로 상단 요약에서는 제외하고 필요 시만 조회합니다.'
  }
];

const CHANGE_CATEGORIES = [
  {
    title: '상태 변화',
    watch: '산소치료, 호흡보조, 활동 수준, 격리, line 또는 tube 또는 drain, 주요 상태',
    detect: '직전 스냅샷과 상태 값이 다르면 변화 이벤트를 생성합니다.',
    meaning: '다음 근무조의 준비, 주의, 보고 방식이 달라집니다.'
  },
  {
    title: '신규 오더',
    watch: '현재 활성 오더 가운데 직전에는 없던 항목',
    detect: '새로 시작된 약물, 검사, 처치, 관찰 계획을 신규 업무로 인식합니다.',
    meaning: '다음 근무조가 새로 수행하거나 확인해야 할 일이 생깁니다.'
  },
  {
    title: '중단 오더',
    watch: '직전에는 있었지만 현재는 활성 목록에서 빠진 항목',
    detect: '중지, 종료, 제거, 중단된 오더를 별도 이벤트로 생성합니다.',
    meaning: '멈춰야 하는 업무와 정리해야 하는 책임을 구분합니다.'
  },
  {
    title: '활력징후 변화',
    watch: '절대 임계치, 급격한 상승 또는 하강, 악화 추세',
    detect: '정책 기준을 넘거나 직전 대비 의미 있는 차이가 나면 이상 이벤트를 생성합니다.',
    meaning: '모니터링 빈도, 보고 필요성, 즉시 대응 여부가 달라집니다.'
  },
  {
    title: '검사 결과 변화',
    watch: '정상에서 이상으로 전환, 이상 악화 또는 호전, 중요 결과',
    detect: '결과 상태와 변화 방향을 함께 기록하고 미확인 중요 결과를 별도 표시합니다.',
    meaning: '보고, 재검, 후속 확인이 필요한지를 판단하는 근거가 됩니다.'
  },
  {
    title: '간호수행 상태 변화',
    watch: '완료, 미완료, 보류, 재확인 필요, 미확인 수행',
    detect: '해야 할 일이 남았는지와 이미 끝난 일인지 구분합니다.',
    meaning: '다음 근무조로 넘어가는 지속 인계 책임을 명확히 합니다.'
  }
];

const RECOGNITION_SIGNALS = [
  {
    title: '추가와 삭제 신호',
    description: '어제는 없고 오늘은 있으면 신규, 어제는 있고 오늘은 없으면 중단으로 읽습니다.'
  },
  {
    title: '값 차이 신호',
    description: '직전 값 대비 증가, 감소, 급격한 변동, 추세 변화가 있으면 변화로 표시합니다.'
  },
  {
    title: '정상에서 이상으로의 전환',
    description: '정책 기준 범위를 벗어나거나 중요 기준에 걸리면 단순 숫자가 아니라 임상 이벤트로 승격합니다.'
  },
  {
    title: '미완료와 보류 상태',
    description: '완료되지 않았거나 보류된 업무는 다음 근무조 행동 필요 신호로 인식합니다.'
  },
  {
    title: '고위험 맥락 매칭',
    description: '고위험 약물, 고위험 처치, 보고 필요 결과 목록과 일치하면 우선순위를 올리는 맥락 신호가 붙습니다.'
  },
  {
    title: '해결 여부와 중복 여부',
    description: '이미 해결되었거나 단순 배경 설명에 가까운 항목은 감산하거나 묶음 배경으로 내립니다.'
  }
];

const BASE_WEIGHTS = [
  { item: '상태 변화', score: '18점', note: '현재 환자 상태와 인계 주의사항을 직접 바꿀 가능성이 큽니다.' },
  { item: '활력징후 변화', score: '16점', note: '즉시 안전 위험과 연결될 가능성이 높아 기본점수를 높게 둡니다.' },
  { item: '신규 오더', score: '15점', note: '새로 해야 할 업무가 생기므로 행동 중심 점수를 가집니다.' },
  { item: '검사 결과 변화', score: '14점', note: '보고, 재확인, 후속 관찰이 필요한 경우가 많습니다.' },
  { item: '중단 오더', score: '14점', note: '멈춰야 할 업무를 명확히 해야 하므로 별도 기본점수를 둡니다.' },
  { item: '간호수행 상태 변화', score: '10점', note: '완료, 보류, 미완료 여부는 지속 인계 책임 판단에 중요합니다.' }
];

const DRIVER_WEIGHTS = [
  { item: '즉시 안전 위험', score: '+25점', note: '저산소, 급격한 활력 악화, 중대한 상태 변화 등' },
  { item: '시간 민감 행동', score: '+18점', note: '다음 근무조가 바로 해야 하는 약물, 검사, 처치' },
  { item: '다음 근무조 직접 행동 필요', score: '+15점', note: '확인, 준비, 보고, 재측정, 수행 필요' },
  { item: '미완료 또는 보류 또는 지속 책임', score: '+12점', note: '지속 인계 성격이 강할수록 가산' },
  { item: '보고 또는 에스컬레이션 필요', score: '+10점', note: '중요 결과 미보고, 보고 필요 상태' },
  { item: '고위험 약물 또는 처치', score: '+10점', note: '시작, 중단, 보류, 변경이 위험과 연결되는 경우' },
  { item: '현재 근무조에서 새로 발생', score: '+6점', note: '최신성이 높을수록 우선순위 정렬에서 앞섬' },
  { item: '이상 지속 중', score: '+4점', note: '행동이 아직 남아 있는 지속 문제만 가산' },
  { item: '해결됨 또는 정보성만 있음', score: '-15점', note: '행동 필요가 사라진 항목은 아래로 내림' },
  { item: '중복 배경 정보', score: '-10점', note: '상위 이슈를 덮지 않도록 묶음 배경으로 이동' }
];

const GATE_RULES = [
  {
    tier: '0단계',
    title: '즉시 안전 위험 또는 긴급 대응',
    description: '급격한 활력 악화, 산소 요구량의 중대한 증가, 미보고 중요 결과, 즉시 보고가 필요한 상태는 점수와 무관하게 가장 위로 올립니다.'
  },
  {
    tier: '1단계',
    title: '다음 근무조의 시간 민감 행동',
    description: '고위험 약물 시작 또는 중단 또는 보류, 시간 맞춰 확인해야 하는 신규 오더, 곧바로 이어받아야 하는 업무를 올립니다.'
  },
  {
    tier: '2단계',
    title: '후속 확인이 필요한 문제',
    description: '지속 관찰, 재확인, 후속 확인이 남아 있는 이상 소견이나 지속 인계 책임을 올립니다.'
  },
  {
    tier: '3단계',
    title: '묶어서 전달할 수 있는 배경 정보',
    description: '당장 행동을 바꾸지 않는 정보성 변화나 해결된 맥락은 묶음 배경으로 내려 정리합니다.'
  }
];

const SORTING_RULES = [
  {
    title: '같은 단계 안에서는 점수가 높은 항목이 먼저 옵니다',
    description: '기본분류점수와 가산·감산점을 합산한 우선순위 지수로 정렬합니다.'
  },
  {
    title: '점수가 같으면 최신 항목이 앞섭니다',
    description: '현재 근무조에서 새로 발생했거나 최근 업데이트된 이벤트를 먼저 보여줍니다.'
  },
  {
    title: '행동이 남아 있는 항목이 배경 정보보다 앞섭니다',
    description: '같은 점수라도 미완료, 보류, 재확인 필요 항목을 먼저 올립니다.'
  },
  {
    title: '근거가 복수인 항목을 우선합니다',
    description: '여러 근거가 교차로 있는 이벤트는 신뢰도가 높아 상단 배치에 유리합니다.'
  }
];

const OUTPUT_OBJECTS = [
  {
    title: '핵심 환자요약',
    description: '이 요약만 봐도 환자 정체성, 현재 관리 틀, 지속 문제, 꼭 볼 배경, 지속 인계 책임을 이해할 수 있어야 합니다.'
  },
  {
    title: '우선순위 이벤트 목록',
    description: '상위 단계 이벤트를 제한된 개수로 보여주어 인계 집중도를 유지합니다.'
  },
  {
    title: '행동 필요 항목',
    description: '다음 근무조가 바로 수행, 확인, 보고, 준비해야 하는 항목을 분리합니다.'
  },
  {
    title: '지속 인계 항목',
    description: '미완료, 보류, 재확인이 필요한 책임을 지속 인계 목록으로 남깁니다.'
  },
  {
    title: '묶음 배경 정보',
    description: '해결되었거나 낮은 우선순위인 변화는 한데 모아 과잉 경보를 줄입니다.'
  },
  {
    title: '설명 인덱스',
    description: '각 이벤트에 대해 감지 이유, 우선순위 이유, 근거를 추적할 수 있게 합니다.'
  },
  {
    title: '상황·배경·사정·권고 힌트',
    description: '나중에 간호 인계 문장으로 연결하기 쉽게 상황·배경·사정·권고용 힌트를 남깁니다.'
  }
];

const EXPLAIN_FIELDS = [
  {
    title: '감지된 사실',
    description: '무엇이 변했다고 읽었는지를 한 문장으로 남깁니다.'
  },
  {
    title: '원본 근거',
    description: '어떤 데이터에서 읽어온 정보인지 참조를 남겨 신뢰성을 확보합니다.'
  },
  {
    title: '감지 이유',
    description: '왜 이 항목이 변화 이벤트가 되었는지 비교 규칙을 기록합니다.'
  },
  {
    title: '우선순위 이유',
    description: '어떤 가산점, 감산점, 승격 규칙이 적용되었는지 보이게 합니다.'
  },
  {
    title: '행동 연관성',
    description: '다음 근무조가 무엇을 해야 하는지 또는 무엇을 멈춰야 하는지 연결합니다.'
  },
  {
    title: '정책 발동 조건',
    description: '활력 기준, 중요 검사 기준, 고위험 약물 목록 등 어떤 정책이 발동했는지 남깁니다.'
  },
  {
    title: '플래그',
    description: '즉시 위험, 시간 민감, 보고 필요, 미완료, 고위험 맥락 같은 플래그를 붙입니다.'
  },
  {
    title: '점수 내역',
    description: '기본점수와 가산·감산점 내역을 남겨 왜 상위에 올랐는지 설명할 수 있게 합니다.'
  }
];

const AUDIENCE_BRIDGE = [
  {
    title: '간호사에게는 이렇게 설명합니다',
    items: [
      '이 엔진은 환자 정보를 다 보여주지 않고, 인계에 영향을 주는 변화만 골라냅니다.',
      '우선순위는 즉시 위험, 다음 근무조 행동 필요, 후속 확인, 배경 정보 순서로 나뉩니다.',
      '중요한 것은 무엇이 새로 생겼는지, 무엇을 멈춰야 하는지, 무엇이 아직 끝나지 않았는지입니다.'
    ]
  },
  {
    title: '개발자에게는 이렇게 설명합니다',
    items: [
      '입력 어댑터는 원천 데이터 의존 영역이고, 이후 단계는 입력 독립형 정규화 객체를 사용합니다.',
      '핵심 엔진은 정규화 스냅샷, 변화 이벤트, 우선순위 엔진, 구조화 출력 객체로 나뉩니다.',
      '정책 값은 코드 깊숙이 박지 않고 설정 레이어로 분리해야 병원 이식성이 생깁니다.'
    ]
  },
  {
    title: '둘이 함께 이해해야 하는 공통 메시지',
    items: [
      '이 프로그램은 진단이나 처방 추천을 하지 않고, 안전한 인계와 연속 간호를 돕습니다.',
      '알고리즘은 추측이 아니라 변화 감지와 설명 가능한 우선순위 규칙에 기반합니다.',
      '데이터 소스가 FHIR에서 실제 병원 전자의무기록으로 바뀌어도 핵심 인계 로직은 유지되어야 합니다.'
    ]
  }
];

const VERIFICATION_CARDS = [
  {
    title: '근거 잠금 검색',
    items: [
      '출력에 사용할 근거를 n일치 환자 데이터 저장소에서 먼저 찾습니다.',
      '근거 없는 문장은 생성 단계로 넘기지 않습니다.'
    ]
  },
  {
    title: '사실 문장 단위 분해',
    items: [
      '생성된 요약을 사실 단위 문장으로 나눕니다.',
      '예: 산소치료 중, 헤모글로빈 하락, 미완료 수혈 확인 필요'
    ]
  },
  {
    title: '사실 문장과 근거 연결',
    items: [
      '각 사실 문장에 어떤 근거가 붙는지 강제로 연결합니다.',
      '상위 우선순위 항목은 근거 연결 없이는 출력하지 않습니다.'
    ]
  },
  {
    title: '재검토 루프',
    items: [
      '모순, 과장, 근거 부족을 다시 검사합니다.',
      '필요하면 보정 검색이나 규칙 기반 재검토를 수행합니다.'
    ]
  },
  {
    title: '구조화 출력 제한',
    items: [
      '정해진 스키마 밖의 자유 서술을 줄입니다.',
      '출력 형식을 고정해 환각이 끼어들 여지를 줄입니다.'
    ]
  },
  {
    title: '생성 보류 규칙',
    items: [
      '근거가 부족하면 생성하지 않고 근거 부족 또는 인간 검토 필요로 표시합니다.',
      '모르면 말하지 않는 것이 안전한 인계의 원칙입니다.'
    ]
  }
];

const VERIFICATION_RULES = [
  {
    title: '상위 우선순위 항목은 근거 연결률 100%',
    description: '0단계와 1단계 항목은 근거가 완전히 연결될 때만 출력합니다.'
  },
  {
    title: '전체 핵심 사실 문장은 근거 연결률 95% 이상',
    description: '핵심 환자요약과 행동 항목은 거의 모든 사실 문장이 근거와 연결되어야 합니다.'
  },
  {
    title: '모순 0개',
    description: '같은 출력 안에서 시작과 중단, 정상과 이상처럼 상충된 진술이 동시에 남으면 안 됩니다.'
  },
  {
    title: '구조화 필드 우선 출력',
    description: '자유 문장보다 구조화된 요약, 이벤트, 행동 항목을 먼저 출력합니다.'
  }
];

const FAILURE_RULES = [
  {
    title: '근거 없는 상위 항목 발견',
    description: '근거가 없는 0단계 또는 1단계 항목은 출력에서 제거하고 검토 대상으로 돌립니다.'
  },
  {
    title: '재검토 후에도 근거 부족',
    description: '보정 검색 이후에도 불확실하면 생성하지 않고 보류합니다.'
  },
  {
    title: '핵심 배경 요약 모순',
    description: '환자 정체성, 현재 관리 틀, 지속 문제에서 모순이 나면 요약 전체를 재구성합니다.'
  },
  {
    title: '요약이 환자 파악에 실패',
    description: '핵심 배경만 읽고도 환자를 설명할 수 없으면 요약 엔진 점수와 포함 기준을 다시 조정합니다.'
  }
];

const PROTOTYPE_ASSUMPTION = '가정: 별도 meeting notes 파일이 없어 docs/PROJECT_BRIEF.md와 docs/product-spec.md를 회의 노트로 간주했다. 가장 단순한 해석은 환자/기간 선택 -> 변화 검토 -> SBAR 초안 확인 흐름이다.';

const PROTOTYPE_FLOW = [
  '환자와 기준 기간을 선택한다.',
  '변화 감지 결과를 우선순위 순서대로 검토한다.',
  'SBAR 초안과 다음 근무조 추천 액션을 확인한다.'
];

const PROTOTYPE_ACCEPTANCE = [
  '상태 변화, 신규 오더, 중단 오더, 활력징후 이상, 주요 검사 변화, 간호수행이 분리되어 보여야 한다.',
  'Recommendation은 행동 중심 문장으로 제한되어야 한다.',
  '근거가 부족한 항목은 상위 우선순위에 올리지 않아야 한다.',
  '변화가 거의 없을 때는 배경과 지속 관찰만 강조해야 한다.'
];

const PROTOTYPE_STEPS = [
  {
    id: 'scope',
    label: '1. 범위 선택',
    tag: 'Happy path',
    state: '입력 확정',
    title: '환자와 인계 기간을 선택한다',
    body: '간호사는 환자 1명과 최근 n일 기간을 선택한다. 시스템은 해당 기간의 요약 대상 데이터를 고정하고 이후 단계에서 같은 기준으로 변화와 SBAR 초안을 만든다.',
    highlights: [
      '기본 입력은 환자, 기준 날짜, 비교 기간 3개다.',
      '선택 즉시 분석 기준이 고정되어 이후 단계와 일관되게 연결된다.',
      '노이즈를 줄이기 위해 원문 FHIR 목록 대신 간호 인계용 범위만 노출한다.'
    ],
    screenParts: ['환자 선택', '기준 날짜', '기간 선택', '분석 시작 버튼', '요약 가정 표시'],
    interactions: [
      { title: '환자 선택', description: '다른 환자를 선택하면 이후 검토 패널이 해당 환자 기준으로 갱신된다.' },
      { title: '기간 변경', description: '기간을 바꾸면 변화 감지와 SBAR 초안의 비교 기준이 다시 계산된다.' }
    ],
    primaryAction: '변화 검토로 이동',
    secondaryAction: '변화 적음 상태 보기'
  },
  {
    id: 'triage',
    label: '2. 변화 검토',
    tag: 'Happy path',
    state: '우선순위 판별',
    title: '핵심 변화만 우선순위 순으로 검토한다',
    body: '시스템은 회의 노트 우선순위 규칙에 따라 상태 변화, 신규 오더, 중단 오더, 활력징후 이상, 주요 검사 변화, 간호수행을 정렬해서 보여준다.',
    highlights: [
      '상단에는 즉시 전달해야 할 변화만 남긴다.',
      '각 항목은 분류, 우선순위 이유, 근거 연결을 함께 표시한다.',
      '배경 정보는 하단으로 내려 중복 전달을 줄인다.'
    ],
    screenParts: ['우선순위 이벤트 목록', '근거 연결', '배경 정보 접힘 영역', '보류 항목 영역'],
    interactions: [
      { title: '이벤트 클릭', description: '항목을 누르면 감지 이유와 연결된 근거를 열어 확인한다.' },
      { title: '보류 보기', description: '근거가 부족한 항목은 별도 영역에서 추가 확인 필요로 분리된다.' }
    ],
    primaryAction: 'SBAR 초안 보기',
    secondaryAction: '근거 부족 상태 보기'
  },
  {
    id: 'draft',
    label: '3. SBAR 초안',
    tag: 'Happy path',
    state: '전달 준비',
    title: '구조화된 SBAR 초안과 액션을 확인한다',
    body: '최종 화면은 Situation, Background, Assessment, Recommendation 순서로 초안을 보여준다. Recommendation은 다음 근무조가 바로 확인하거나 수행해야 할 액션 중심으로 제한된다.',
    highlights: [
      'Situation에는 현재 가장 중요한 변화와 신규/중단 오더가 우선 노출된다.',
      'Background에는 반복되거나 지속되는 문제만 남긴다.',
      'Recommendation에는 확인, 보고, 준비, 모니터링 액션만 유지한다.'
    ],
    screenParts: ['SBAR 미리보기', '상위 우선순위 카드', '다음 근무조 액션', '보류/추가 확인 필요'],
    interactions: [
      { title: '섹션 검토', description: '각 SBAR 섹션에서 어떤 변화가 문장에 반영됐는지 역추적한다.' },
      { title: '초안 확정', description: '사용자는 구조화된 인계 초안을 검토한 뒤 전달 준비 상태로 넘긴다.' }
    ],
    primaryAction: '처음 단계로 돌아가기',
    secondaryAction: '변화 적음 상태 보기'
  }
];

const PROTOTYPE_EDGE_STATES = [
  {
    id: 'stable',
    label: '변화 적음',
    title: '변화가 거의 없는 경우',
    description: '중요 변화 점수가 임계값 아래면 상단 인계는 짧아지고, 지속 관찰과 배경만 남긴다.',
    items: [
      '상위 이벤트 목록 대신 안정 유지와 지속 관찰만 표시한다.',
      'Recommendation은 신규 액션 대신 정규 모니터링 지속으로 축소한다.',
      '중복 배경은 접어서 전달 분량을 줄인다.'
    ]
  },
  {
    id: 'insufficient-evidence',
    label: '근거 부족',
    title: '근거 연결이 부족한 경우',
    description: '감지 후보는 있으나 근거 연결이 충분하지 않으면 상단 우선순위에서 제외하고 보류한다.',
    items: [
      '상위 우선순위 카드에 올리지 않는다.',
      '보류/추가 확인 필요 영역으로 분리한다.',
      'SBAR 본문에는 확정된 사실만 남기고 추가 확인 필요 문구로 대체한다.'
    ]
  }
];

let activePrototypeStepIndex = 0;
let activePrototypeEdgeIndex = 0;

document.addEventListener('DOMContentLoaded', initializeAlgorithmExplainer);

function initializeAlgorithmExplainer() {
  renderStageCards();
  renderAudienceGroupCards('summaryCoreBlocks', SUMMARY_CORE_BLOCKS);
  renderSummaryFormula();
  renderWeightTable('summaryWeightTable', SUMMARY_WEIGHTS);
  renderGateList('summaryThresholdList', SUMMARY_THRESHOLDS);
  renderLogicCards('changeCategoryCards', CHANGE_CATEGORIES, 'watch', 'detect', 'meaning');
  renderSignalCards();
  renderPriorityFormula();
  renderWeightTable('baseWeightTable', BASE_WEIGHTS);
  renderWeightTable('driverWeightTable', DRIVER_WEIGHTS);
  renderGateList('gateRuleList', GATE_RULES, 'tier');
  renderGateList('sortingRuleList', SORTING_RULES);
  renderSimpleCards('outputCards', OUTPUT_OBJECTS);
  renderSimpleCards('explainFieldList', EXPLAIN_FIELDS);
  renderVerificationFormula();
  renderAudienceGroupCards('verificationCards', VERIFICATION_CARDS);
  renderGateList('verificationRuleList', VERIFICATION_RULES);
  renderGateList('failureRuleList', FAILURE_RULES);
  renderAudienceBridge();
  renderPrototypeSection();
}

function renderPrototypeSection() {
  const assumptionRoot = document.getElementById('prototypeAssumption');
  const flowRoot = document.getElementById('prototypeFlowList');
  const criteriaRoot = document.getElementById('prototypeCriteriaList');
  if (!assumptionRoot || !flowRoot || !criteriaRoot) return;

  assumptionRoot.textContent = PROTOTYPE_ASSUMPTION;
  flowRoot.innerHTML = PROTOTYPE_FLOW.map((item) => renderPrototypeCheckItem(item)).join('');
  criteriaRoot.innerHTML = PROTOTYPE_ACCEPTANCE.map((item) => renderPrototypeCheckItem(item)).join('');
  renderPrototypeStepTabs();
  renderPrototypeEdgeTabs();
  renderPrototypeStepContent();
  renderPrototypeEdgeContent();
}

function renderPrototypeStepTabs() {
  const root = document.getElementById('prototypeStepTabs');
  if (!root) return;

  root.innerHTML = PROTOTYPE_STEPS.map((step, index) => `
    <button
      type="button"
      class="prototype-tab-btn ${index === activePrototypeStepIndex ? 'is-active' : ''}"
      data-prototype-step="${index}"
    >${escapeHtml(step.label)}</button>
  `).join('');

  root.querySelectorAll('[data-prototype-step]').forEach((button) => {
    button.addEventListener('click', () => {
      activePrototypeStepIndex = Number(button.getAttribute('data-prototype-step'));
      renderPrototypeStepTabs();
      renderPrototypeStepContent();
    });
  });
}

function renderPrototypeStepContent() {
  const step = PROTOTYPE_STEPS[activePrototypeStepIndex];
  if (!step) return;

  const tagRoot = document.getElementById('prototypeScreenTag');
  const stateRoot = document.getElementById('prototypeScreenState');
  const titleRoot = document.getElementById('prototypeScreenTitle');
  const bodyRoot = document.getElementById('prototypeScreenBody');
  const highlightRoot = document.getElementById('prototypeScreenHighlights');
  const partsRoot = document.getElementById('prototypeScreenParts');
  const interactionsRoot = document.getElementById('prototypeInteractions');
  const primaryButton = document.getElementById('prototypePrimaryAction');
  const secondaryButton = document.getElementById('prototypeSecondaryAction');
  if (!tagRoot || !stateRoot || !titleRoot || !bodyRoot || !highlightRoot || !partsRoot || !interactionsRoot || !primaryButton || !secondaryButton) return;

  tagRoot.textContent = step.tag;
  stateRoot.textContent = step.state;
  titleRoot.textContent = step.title;
  bodyRoot.textContent = step.body;
  highlightRoot.innerHTML = step.highlights.map((item) => `<div class="prototype-highlight-item">${escapeHtml(item)}</div>`).join('');
  partsRoot.innerHTML = step.screenParts.map((item) => `<span class="prototype-token">${escapeHtml(item)}</span>`).join('');
  interactionsRoot.innerHTML = step.interactions.map((item) => `
    <div class="prototype-check-item">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.description)}</span>
    </div>
  `).join('');

  primaryButton.textContent = step.primaryAction;
  primaryButton.onclick = () => {
    activePrototypeStepIndex = (activePrototypeStepIndex + 1) % PROTOTYPE_STEPS.length;
    renderPrototypeStepTabs();
    renderPrototypeStepContent();
  };

  secondaryButton.textContent = step.secondaryAction;
  secondaryButton.onclick = () => {
    activePrototypeEdgeIndex = activePrototypeStepIndex === 1 ? 1 : 0;
    renderPrototypeEdgeTabs();
    renderPrototypeEdgeContent();
  };
}

function renderPrototypeEdgeTabs() {
  const root = document.getElementById('prototypeEdgeTabs');
  if (!root) return;

  root.innerHTML = PROTOTYPE_EDGE_STATES.map((state, index) => `
    <button
      type="button"
      class="prototype-tab-btn ${index === activePrototypeEdgeIndex ? 'is-active' : ''}"
      data-prototype-edge="${index}"
    >${escapeHtml(state.label)}</button>
  `).join('');

  root.querySelectorAll('[data-prototype-edge]').forEach((button) => {
    button.addEventListener('click', () => {
      activePrototypeEdgeIndex = Number(button.getAttribute('data-prototype-edge'));
      renderPrototypeEdgeTabs();
      renderPrototypeEdgeContent();
    });
  });
}

function renderPrototypeEdgeContent() {
  const state = PROTOTYPE_EDGE_STATES[activePrototypeEdgeIndex];
  const root = document.getElementById('prototypeEdgeBody');
  if (!state || !root) return;

  root.innerHTML = `
    <article class="prototype-edge-card">
      <strong>${escapeHtml(state.title)}</strong>
      <div>${escapeHtml(state.description)}</div>
    </article>
    ${state.items.map((item) => renderPrototypeCheckItem(item)).join('')}
  `;
}

function renderPrototypeCheckItem(text) {
  return `
    <div class="prototype-check-item">
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderStageCards() {
  const root = document.getElementById('stageCards');
  root.innerHTML = STAGE_EXPLANATIONS.map((stage) => `
    <article class="stage-card">
      <div class="stage-card-header">
        <span class="stage-badge">${escapeHtml(stage.step)}</span>
        <h3>${escapeHtml(stage.title)}</h3>
      </div>
      <p class="stage-question">${escapeHtml(stage.question)}</p>
      <div class="audience-line">
        <strong>간호 관점</strong>
        <span>${escapeHtml(stage.nurseView)}</span>
      </div>
      <div class="audience-line">
        <strong>구현 관점</strong>
        <span>${escapeHtml(stage.developerView)}</span>
      </div>
      <div class="stage-subtitle">AI가 이 단계에서 하는 일</div>
      <ul class="detail-list">
        ${stage.logic.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <div class="stage-subtitle">이 단계의 출력</div>
      <div class="chip-row">
        ${stage.output.map((item) => `<span class="mini-chip">${escapeHtml(item)}</span>`).join('')}
      </div>
    </article>
  `).join('');
}

function renderLogicCards(rootId, items, firstKey, secondKey, thirdKey) {
  const root = document.getElementById(rootId);
  root.innerHTML = items.map((item) => `
    <article class="logic-card">
      <h3>${escapeHtml(item.title)}</h3>
      <div class="logic-line"><strong>무엇을 본다</strong><span>${escapeHtml(item[firstKey])}</span></div>
      <div class="logic-line"><strong>어떻게 감지한다</strong><span>${escapeHtml(item[secondKey])}</span></div>
      <div class="logic-line"><strong>인계 의미</strong><span>${escapeHtml(item[thirdKey])}</span></div>
    </article>
  `).join('');
}

function renderSignalCards() {
  const root = document.getElementById('recognitionSignals');
  root.innerHTML = RECOGNITION_SIGNALS.map((item) => `
    <article class="logic-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
    </article>
  `).join('');
}

function renderPriorityFormula() {
  const root = document.getElementById('priorityFormula');
  root.innerHTML = `
    <div class="formula-title">기본 원리</div>
    <p>이 엔진은 먼저 <strong>단계 승격 규칙</strong>으로 즉시 위험인지 아닌지를 가르고, 그 다음 <strong>우선순위 지수</strong>로 같은 단계 안 순서를 정합니다.</p>
    <div class="formula-expression">우선순위 지수 = 기본분류점수 + 위험도 + 긴급도 + 행동필요도 + 지속책임 + 고위험맥락 + 최신성 - 해결또는중복감산</div>
    <p class="formula-note">점수는 기본적으로 0점에서 100점 범위로 관리하고, 실제 병원 적용 시 기준값은 정책 레이어에서 조정합니다.</p>
  `;
}

function renderSummaryFormula() {
  const root = document.getElementById('summaryFormula');
  root.innerHTML = `
    <div class="formula-title">요약 엔진 기본 원리</div>
    <p>핵심요약 엔진은 최근 변화만 보는 것이 아니라, 여러 날짜의 기록을 모아 현재도 중요한 배경을 위로 끌어올립니다.</p>
    <div class="formula-expression">요약 중요도 점수 = 분류기본점수 + 지속성 + 현재행동필요도 + 안전위험도 + 간호의존도 + 반복성 - 해결감점</div>
    <p class="formula-note">이 점수는 사람이 인계 전에 머릿속으로 정리하던 과정을 수치화한 것으로, 결국 목표는 요약만 봐도 환자를 이해하게 만드는 것입니다.</p>
  `;
}

function renderVerificationFormula() {
  const root = document.getElementById('verificationFormula');
  root.innerHTML = `
    <div class="formula-title">권장 환각 차단 구조</div>
    <p>단순 RAG 단독보다, 근거 검색과 사실 문장 검증과 출력 제한을 함께 두는 구조가 더 안전합니다.</p>
    <div class="formula-expression">근거 검색 + 사실 문장 분해 + 사실 문장과 근거 연결 + 재검토 루프 + 구조화 출력 + 근거 부족 시 생성 보류</div>
    <p class="formula-note">즉, 많이 찾는 것보다 정확히 연결하고, 끝까지 증명되지 않으면 말하지 않는 구조가 필요합니다.</p>
  `;
}

function renderWeightTable(rootId, items) {
  const root = document.getElementById(rootId);
  root.innerHTML = items.map((item) => `
    <div class="weight-row">
      <div class="weight-main">
        <strong>${escapeHtml(item.item)}</strong>
        <span>${escapeHtml(item.note)}</span>
      </div>
      <div class="weight-score">${escapeHtml(item.score)}</div>
    </div>
  `).join('');
}

function renderGateList(rootId, items, labelKey = null) {
  const root = document.getElementById(rootId);
  root.innerHTML = items.map((item) => `
    <article class="gate-item">
      ${labelKey ? `<span class="mini-chip">${escapeHtml(item[labelKey])}</span>` : ''}
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.description)}</p>
    </article>
  `).join('');
}

function renderAudienceGroupCards(rootId, groups) {
  const root = document.getElementById(rootId);
  root.innerHTML = groups.map((group) => `
    <article class="bridge-card">
      <h3>${escapeHtml(group.title)}</h3>
      <ul class="detail-list">
        ${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </article>
  `).join('');
}

function renderSimpleCards(rootId, items) {
  const root = document.getElementById(rootId);
  root.innerHTML = items.map((item) => `
    <article class="logic-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
    </article>
  `).join('');
}

function renderAudienceBridge() {
  renderAudienceGroupCards('audienceBridge', AUDIENCE_BRIDGE);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
