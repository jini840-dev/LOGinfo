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
 * Log Parser
 */
function parseLogs(content) {
  const jsonBlocks = [];
  const regex = /MessageLogData \[data=([\s\S]*?)\}, encrypt=/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const jsonStr = match[1] + '}';
      jsonBlocks.push(JSON.parse(jsonStr));
    } catch (e) {}
  }
  return jsonBlocks;
}

function getBusinessKey(obj) {
  if (!obj || !obj.payload) return null;
  const p = obj.payload;
  const key = p.polyNo || 
              (p.rltmDpstAplcTrgtInqyInpt && p.rltmDpstAplcTrgtInqyInpt.polyNo) ||
              p.custId ||
              (p.chckSaveInpt && p.chckSaveInpt.custId);
  return key;
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // 정적 에셋으로 복사된 로그 파일 읽기
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

    const results = [];
    const usedDevIndices = new Set();
    const ignoreKeys = [
      'trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 
      'ctfnTokn', 'mciNodeNo', 'tlgrRspnDttm', 'mciSesnId',
      'lastModifiedDate', 'stateStartDateTime', 'id',
      'serverType', 'userTmunIdnfVal'
    ];

    qaBlocks.forEach((qa) => {
      const qaServiceId = qa.header?.rcveSrvcId;
      const qaKey = getBusinessKey(qa);

      let matchIndex = -1;
      for (let i = 0; i < devBlocks.length; i++) {
        if (usedDevIndices.has(i)) continue;

        const dev = devBlocks[i];
        if (qaServiceId === dev.header?.rcveSrvcId) {
          const devKey = getBusinessKey(dev);
          if (qaKey && devKey ? qaKey === devKey : true) {
            matchIndex = i;
            break;
          }
        }
      }

      if (matchIndex !== -1) {
        const dev = devBlocks[matchIndex];
        usedDevIndices.add(matchIndex);
        const diffs = getDiff(qa, dev, ignoreKeys);
        results.push({
          id: results.length + 1,
          serviceId: qaServiceId,
          businessKey: qaKey,
          qa,
          dev,
          diffs,
          status: diffs.length === 0 ? 'MATCH' : 'MISMATCH'
        });
      } else {
        results.push({
          id: results.length + 1,
          serviceId: qaServiceId,
          businessKey: qaKey,
          qa,
          dev: null,
          diffs: [{ path: 'root', type: 'DELETED', oldValue: 'BLOCK_MISSING_IN_DEV' }],
          status: 'MISMATCH'
        });
      }
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
