const fs = require('fs');

/**
 * Log Parser
 * 로그 파일에서 JSON 블록을 추출합니다.
 */
function parseLogs(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // JSON 블록을 찾기 위한 정규식 (대략적인 구조)
  // "data={" 로 시작해서 "}, encrypt=" 로 끝나는 구간 추출
  const jsonBlocks = [];
  const regex = /MessageLogData \[data=([\s\S]*?)\}, encrypt=/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      // 닫는 중괄호 하나를 더 붙여서 완성된 JSON 문자열을 만듦
      const jsonStr = match[1] + '}';
      jsonBlocks.push(JSON.parse(jsonStr));
    } catch (e) {
      // 파싱 실패 시 건너뜀
      // console.error('Failed to parse JSON block', e);
    }
  }

  return jsonBlocks;
}

module.exports = { parseLogs };
