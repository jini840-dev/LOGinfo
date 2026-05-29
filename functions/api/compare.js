// Cloudflare Pages Function: /functions/api/compare.js

/**
 * 객체인지 확인하는 유틸리티
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep Diff Engine (Pure JS - No dependencies)
 */
function getDiff(obj1, obj2, ignoreKeys = [], path = '') {
  const diffs = [];
  
  // 기본 값 비교 (문자열, 숫자 등)
  if (obj1 === obj2) return diffs;

  // 타입이 다르거나 하나가 객체가 아닌 경우
  if (!isObject(obj1) || !isObject(obj2)) {
    diffs.push({ path, type: 'CHANGED', oldValue: obj1, newValue: obj2 });
    return diffs;
  }

  // 모든 키 합집합
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  const allKeys = Array.from(new Set([...keys1, ...keys2]));

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    
    // 무시할 키 체크 (단순 키 이름 또는 전체 경로)
    if (ignoreKeys.includes(key) || ignoreKeys.includes(currentPath)) continue;

    if (!(key in obj1)) {
      diffs.push({ path: currentPath, type: 'CREATED', oldValue: undefined, newValue: obj2[key] });
    } else if (!(key in obj2)) {
      diffs.push({ path: currentPath, type: 'DELETED', oldValue: obj1[key], newValue: undefined });
    } else {
      // 재귀적으로 깊은 비교
      const val1 = obj1[key];
      const val2 = obj2[key];
      
      if (isObject(val1) && isObject(val2)) {
        const deepDiffs = getDiff(val1, val2, ignoreKeys, currentPath);
        diffs.push(...deepDiffs);
      } else if (Array.isArray(val1) && Array.isArray(val2)) {
        // 배열 비교 (단순화를 위해 JSON 문자열 비교 후 다르면 전체 표시)
        if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          diffs.push({ path: currentPath, type: 'CHANGED', oldValue: val1, newValue: val2 });
        }
      } else if (val1 !== val2) {
        diffs.push({ path: currentPath, type: 'CHANGED', oldValue: val1, newValue: val2 });
      }
    }
  }

  return diffs;
}

/**
 * Log Parser (Advanced)
 */
function parseLogs(content) {
  const jsonBlocks = [];
  
  // 패턴 1: 기존 표준 DTO 패턴
  const standardRegex = /\[data=({[\s\S]*?}),\s*encrypt=false\]/g;
  let match;
  while ((match = standardRegex.exec(content)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const label = data.header?.rcveSrvcId || 'Standard DTO';
      jsonBlocks.push({ label, data, type: 'STANDARD' });
    } catch (e) {}
  }

  // 패턴 2: 신규 [BAC...] 커스텀 로그 패턴
  const bacRegex = /\[(BAC[a-zA-Z0-9]+)\]\s*([^\{]*)\s*(?=\{)/g;
  while ((match = bacRegex.exec(content)) !== null) {
    const identifier = match[1];
    const rawTitle = match[2].trim();
    const startIndex = match.index + match[0].length;
    
    const jsonBody = extractMatchedBraces(content, startIndex);
    
    if (jsonBody) {
      try {
        const data = JSON.parse(jsonBody);
        const label = rawTitle || identifier;
        jsonBlocks.push({ label, data, type: 'CUSTOM' });
      } catch (e) {}
    }
  }

  return jsonBlocks;
}

/**
 * 중괄호 매칭 추출 유틸리티
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

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const [qaRes, devRes] = await Promise.all([
      fetch(`${baseUrl}/data/qa_log.txt`),
      fetch(`${baseUrl}/data/dev_log.txt`)
    ]);

    if (!qaRes.ok || !devRes.ok) {
      return new Response(JSON.stringify({ 
        error: '로그 파일을 찾을 수 없습니다.',
        details: `QA: ${qaRes.status}, Dev: ${devRes.status}`
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const qaText = await qaRes.text();
    const devText = await devRes.text();

    const qaBlocks = parseLogs(qaText);
    const devBlocks = parseLogs(devText);

    const ignoreKeys = [
      'trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 
      'ctfnTokn', 'mciNodeNo', 'tlgrRspnDttm', 'mciSesnId',
      'lastModifiedDate', 'stateStartDateTime', 'id',
      'serverType', 'userTmunIdnfVal'
    ];

    const results = qaBlocks.map((qaBlock, idx) => {
      const devBlock = devBlocks[idx] || null;
      const qa = qaBlock.data;
      const dev = devBlock ? devBlock.data : null;
      
      const diffs = dev ? getDiff(qa, dev, ignoreKeys) : [{ path: 'root', type: 'DELETED', oldValue: 'BLOCK_MISSING_IN_DEV' }];
      
      return {
        id: idx + 1,
        label: qaBlock.label,
        serviceId: qa.header?.rcveSrvcId || 'Unknown',
        qa,
        dev,
        diffs,
        status: (dev && diffs.length === 0) ? 'MATCH' : 'MISMATCH'
      };
    });

    return new Response(JSON.stringify(results), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
