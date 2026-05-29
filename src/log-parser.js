const fs = require('fs');

/**
 * Log Parser
 * 로그 파일에서 JSON 블록을 추출합니다.
 */
function parseLogs(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  const jsonBlocks = [];
  // "data={" 로 시작해서 "}, encrypt=false]" 로 끝나는 구간 추출
  // JSON의 마지막 중괄호와 마커의 중괄호가 겹치므로 주의해서 매칭
  const regex = /\[data=({[\s\S]*?}),\s*encrypt=false\]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const jsonStr = match[1];
      jsonBlocks.push(JSON.parse(jsonStr));
    } catch (e) {
      // console.error('Failed to parse JSON block', e);
    }
  }

  return jsonBlocks;
}

module.exports = { parseLogs };
