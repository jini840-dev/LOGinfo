// Cloudflare Pages Function: /functions/api/compare.js

/**
 * Deep Diff Engine (Pure JS - logic synced with src/diff-engine.js)
 */
function getDiff(obj1, obj2, ignoreKeys = [], path = '') {
  const diffs = [];
  const currentKey = path.split('.').pop();
  const isIgnored = ignoreKeys.includes(currentKey) || (path && ignoreKeys.includes(path));

  // lodash-like object check
  const isObject = (val) => val != null && typeof val === 'object';
  const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b); // Simplified for browser/worker environment
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // 1. 배열 비교 (Order-Agnostic)
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    const matchingKeys = ['polyNo', 'id', 'contractNo', 'trnnNo', 'key'];
    let remainingObj2 = [...obj2];
    
    obj1.forEach((item1, index) => {
      const currentPath = `${path}[${index}]`;
      let matchIdx = -1;
      
      if (isObject(item1)) {
        const idKey = matchingKeys.find(k => has(item1, k));
        if (idKey) {
          matchIdx = remainingObj2.findIndex(item2 => item2[idKey] === item1[idKey]);
        }
      }

      if (matchIdx === -1) {
        matchIdx = remainingObj2.findIndex(item2 => isEqual(item1, item2));
      }

      if (matchIdx !== -1) {
        const item2 = remainingObj2.splice(matchIdx, 1)[0];
        diffs.push(...getDiff(item1, item2, ignoreKeys, currentPath));
      } else {
        diffs.push({ path: currentPath, type: 'REMOVED', oldValue: item1 });
      }
    });

    remainingObj2.forEach((item2, index) => {
      diffs.push({ path: `${path}[+${index}]`, type: 'ADDED', newValue: item2 });
    });
  } 
  // 2. 객체 비교
  else if (isObject(obj1) && isObject(obj2)) {
    const keys = Array.from(new Set([...Object.keys(obj1), ...Object.keys(obj2)]));

    for (const key of keys) {
      const currentPath = path ? `${path}.${key}` : key;
      const keyIgnored = ignoreKeys.includes(key);
      
      if (!has(obj1, key)) {
        diffs.push({ path: currentPath, type: keyIgnored ? 'IGNORED' : 'ADDED', newValue: obj2[key] });
      } else if (!has(obj2, key)) {
        diffs.push({ path: currentPath, type: keyIgnored ? 'IGNORED' : 'REMOVED', oldValue: obj1[key] });
      } else {
        diffs.push(...getDiff(obj1[key], obj2[key], ignoreKeys, currentPath));
      }
    }
  } 
  // 3. 원시 값 비교
  else if (!isEqual(obj1, obj2)) {
    diffs.push({
      path,
      type: isIgnored ? 'IGNORED' : 'CHANGED',
      oldValue: obj1,
      newValue: obj2
    });
  }

  return diffs;
}

/**
 * Log Parser (Advanced - logic synced with src/log-parser.js)
 */
function parseLogs(content) {
  const jsonBlocks = [];
  const matchedRanges = [];

  const isOverlapping = (start, end) => {
    return matchedRanges.some(range => (start >= range.start && start < range.end) || (end > range.start && end <= range.end));
  };

  // Pattern 1: Standard
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

  // Pattern 2: BAC
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

  // Pattern 3: Raw
  let rawBlockCount = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if ((char === '{' || char === '[') && !isOverlapping(i, i + 1)) {
      const block = extractMatchedBlock(content, i);
      if (block && block.length > 10) {
        const sanitized = sanitizeJson(block);
        try {
          const data = JSON.parse(sanitized);
          rawBlockCount++;
          const fallbackLabel = `JSON Block #${rawBlockCount}`;
          const label = getSmartLabel(data, fallbackLabel);
          jsonBlocks.push({ label, data, type: 'RAW' });
          matchedRanges.push({ start: i, end: i + block.length });
          i += block.length - 1;
        } catch (e) {}
      }
    }
  }
  return jsonBlocks;
}

function sanitizeJson(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    const inner = cleaned.substring(1, cleaned.length - 1).trim();
    if (inner.startsWith('[') && inner.endsWith(']')) {
      return `{"data": ${inner}}`;
    }
  }
  return cleaned;
}

function getSmartLabel(data, fallback) {
  if (!data) return fallback;
  const target = Array.isArray(data) ? data[0] : (data.data && Array.isArray(data.data) ? data.data[0] : data);
  if (!target || typeof target !== 'object') return fallback;
  const priorityKeys = ['polyNo', 'trnnNo', 'id', 'rcveSrvcId', 'emnb', 'srvcId'];
  for (const key of priorityKeys) {
    if (target[key]) return `${key}: ${target[key]}`;
    if (target.header && target.header[key]) return `${key}: ${target.header[key]}`;
  }
  return fallback;
}

function extractMatchedBlock(content, startIndex) {
  const startChar = content[startIndex];
  const endChar = startChar === '{' ? '}' : (startChar === '[' ? ']' : null);
  if (!endChar) return null;
  let count = 0, foundStart = false, result = '';
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (char === startChar) { count++; foundStart = true; }
    else if (char === endChar) count--;
    if (foundStart) {
      result += char;
      if (count === 0) return result;
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
        status: (dev && diffs.filter(d => d.type !== 'IGNORED').length === 0) ? 'MATCH' : 'MISMATCH'
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
