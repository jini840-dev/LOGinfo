const fs = require('fs');

/**
 * Log Parser
 * 로그 파일에서 JSON 블록을 추출합니다.
 * 1. 표준 DTO 패턴: [data={...}, encrypt=false]
 * 2. [BAC...] 패턴: [BAC...] 타이틀 { ... }
 * 3. Raw JSON 패턴: 식별자 없는 순수 JSON { ... } 또는 [ ... ]
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
  const matchedRanges = []; // 이미 처리된 텍스트 범위를 추적

  /**
   * 범위가 겹치는지 확인하는 헬퍼
   */
  const isOverlapping = (start, end) => {
    return matchedRanges.some(range => (start >= range.start && start < range.end) || (end > range.start && end <= range.end));
  };

  // 패턴 1: 기존 표준 DTO 패턴
  const standardRegex = /\[data=({[\s\S]*?}),\s*encrypt=false\]/g;
  let match;
  while ((match = standardRegex.exec(content)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const label = data.header?.rcveSrvcId || 'Standard DTO';
      jsonBlocks.push({ label, data, type: 'STANDARD' });
      matchedRanges.push({ start: match.index, end: standardRegex.lastIndex });
    } catch (e) {}
  }

  // 패턴 2: [BAC...] 커스텀 로그 패턴 (기존 로직 유지/복구)
  const bacRegex = /\[(BAC[a-zA-Z0-9]+)\]\s*([^\{]*)\s*(?=\{)/g;
  while ((match = bacRegex.exec(content)) !== null) {
    const identifier = match[1];
    const rawTitle = match[2].trim();
    const startIndex = match.index + match[0].length;
    
    const jsonBody = extractMatchedBlock(content, startIndex);
    if (jsonBody) {
      const fullMatchEnd = startIndex + jsonBody.length;
      if (!isOverlapping(match.index, fullMatchEnd)) {
        try {
          const data = JSON.parse(jsonBody);
          const label = rawTitle || identifier;
          jsonBlocks.push({ label, data, type: 'CUSTOM' });
          matchedRanges.push({ start: match.index, end: fullMatchEnd });
        } catch (e) {}
      }
    }
  }

  // 패턴 3: Raw JSON 패턴 (식별자 없음)
  let rawBlockCount = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if ((char === '{' || char === '[') && !isOverlapping(i, i + 1)) {
      const block = extractMatchedBlock(content, i);
      if (block && block.length > 10) { // 너무 짧은 블록({} 등) 제외
        const sanitized = sanitizeJson(block);
        try {
          const data = JSON.parse(sanitized);
          rawBlockCount++;
          const fallbackLabel = `JSON Block #${rawBlockCount}`;
          const label = getSmartLabel(data, fallbackLabel);
          
          jsonBlocks.push({ label, data, type: 'RAW' });
          matchedRanges.push({ start: i, end: i + block.length });
          i += block.length - 1; // 스캔 위치 건너뛰기
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
    }
  }

  return jsonBlocks;
}

/**
 * JSON 문자열을 정제합니다. 
 * 특히 { [ ... ] } 형태를 {"data": [ ... ]} 로 변환합니다.
 */
function sanitizeJson(raw) {
  let cleaned = raw.trim();
  
  // { [ ... ] } 패턴 감지 및 수정
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    const inner = cleaned.substring(1, cleaned.length - 1).trim();
    if (inner.startsWith('[') && inner.endsWith(']')) {
      return `{"data": ${inner}}`;
    }
  }
  return cleaned;
}

/**
 * 데이터 내부의 주요 키를 찾아 스마트한 라벨을 생성합니다.
 */
function getSmartLabel(data, fallback) {
  if (!data) return fallback;
  
  // 배열인 경우 첫 번째 요소를 기준으로 탐색
  const target = Array.isArray(data) ? data[0] : (data.data && Array.isArray(data.data) ? data.data[0] : data);
  if (!target || typeof target !== 'object') return fallback;

  const priorityKeys = ['polyNo', 'trnnNo', 'id', 'rcveSrvcId', 'emnb', 'srvcId'];
  for (const key of priorityKeys) {
    if (target[key]) return `${key}: ${target[key]}`;
    if (target.header && target.header[key]) return `${key}: ${target.header[key]}`;
  }
  
  return fallback;
}

/**
 * 특정 시작 위치부터 매칭되는 닫는 괄호(} 또는 ])까지의 블록을 추출합니다.
 */
function extractMatchedBlock(content, startIndex) {
  const startChar = content[startIndex];
  const endChar = startChar === '{' ? '}' : (startChar === '[' ? ']' : null);
  if (!endChar) return null;

  let count = 0;
  let foundStart = false;
  let result = '';

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (char === startChar) {
      count++;
      foundStart = true;
    } else if (char === endChar) {
      count--;
    }

    if (foundStart) {
      result += char;
      if (count === 0) {
        return result;
      }
    }
  }
  return null;
}

module.exports = { parseLogs, extractJsonFromContent };
