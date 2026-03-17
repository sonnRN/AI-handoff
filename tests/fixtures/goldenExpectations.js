module.exports = {
  synthetic: {
    allowedLines: ["Peripheral IV"],
    removedCarryoverNoise: ["Sepsis 경과 관찰", "CT abdomen and pelvis with contrast"],
    keepCarryover: ["식이 확인", "드레싱 상태 재평가"]
  },
  selectedRange: {
    requiredCareFramePattern: /walker|Assist ambulation|보행기 보조 보행/i,
    excludedCareFramePattern: /Absolute bed rest/i
  }
};
