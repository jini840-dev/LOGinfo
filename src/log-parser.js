const fs = require('fs');

/**
 * Log Parser
 * 로그 파일에서 JSON 블록을 추출합니다.
 * 기존 [data={...}] 패턴과 신규 [BAC...] 패턴을 모두 지원합니다.
 */
function parseLogs(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return extractJsonFromContent(content);
}

/**
 * 문자열 컨텐츠에서 다중 패턴을 검색하여 JSON 블록을 추출하는 핵심 로직
 */
function extractJsonFromContent(content) {
  const jsonBlocks = [];
  
  // 패턴 1: 기존 표준 DTO 패턴
  const standardRegex = /\[data=({[\s\S]*?}),\s*encrypt=false\]/g;
  let match;
  while ((match = standardRegex.exec(content)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // 표준 패턴의 경우 서비스 ID 등을 라벨로 활용 시도
      const label = data.header?.rcveSrvcId || 'Standard DTO';
      jsonBlocks.push({ label, data, type: 'STANDARD' });
    } catch (e) {}
  }

  // 패턴 2: 신규 [BAC...] 커스텀 로그 패턴
  // [BAC...] 식별자와 그 뒤의 선택적 타이틀을 캡처
  const bacRegex = /\[(BAC[a-zA-Z0-9]+)\]\s*([^\{]*)\s*(?=\{)/g;
  while ((match = bacRegex.exec(content)) !== null) {
    const identifier = match[1];
    const rawTitle = match[2].trim();
    const startIndex = match.index + match[0].length;
    
    // 중첩된 중괄호를 고려한 JSON 본문 추출 (Brace Matching)
    const jsonBody = extractMatchedBraces(content, startIndex);
    
    if (jsonBody) {
      try {
        const data = JSON.parse(jsonBody);
        const label = rawTitle || identifier; // 타이틀이 없으면 식별자 사용
        jsonBlocks.push({ label, data, type: 'CUSTOM' });
      } catch (e) {}
    }
  }

  // 로그에 나타난 순서대로 정렬하고 싶다면 index 기반 정렬이 필요할 수 있으나
  // 현재는 요구사항에 맞춰 기능 구현에 집중합니다.
  return jsonBlocks;
}

/**
 * 특정 시작 위치부터 매칭되는 닫는 중괄호 '}'까지의 문자열을 추출합니다.
 */
function extractMatchedBraces(content, startIndex) {
  let braceCount = 0;
  let foundStart = false;
  let result = '';

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (char === '{') {
      braceCount++;
      foundStart = true;
    } else if (char === '}') {
      braceCount--;
    }

    if (foundStart) {
      result += char;
      if (braceCount === 0) {
        return result;
      }
    }
  }
  return null;
}

module.exports = { parseLogs, extractJsonFromContent };
