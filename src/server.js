const express = require('express');
const path = require('path');
const { parseLogs } = require('./log-parser');
const { getDiff } = require('./diff-engine');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

/**
 * 객체에서 비즈니스 키를 추출하는 유틸리티
 */
function getBusinessKey(obj) {
  if (!obj || !obj.payload) return null;
  const p = obj.payload;
  
  // 다양한 경로에서 주요 키 탐색
  const key = p.polyNo || 
              (p.rltmDpstAplcTrgtInqyInpt && p.rltmDpstAplcTrgtInqyInpt.polyNo) ||
              p.custId ||
              (p.chckSaveInpt && p.chckSaveInpt.custId);
              
  return key;
}

app.get('/api/compare', (req, res) => {
  const qaBlocks = parseLogs(path.join(__dirname, '../qa_log'));
  const devBlocks = parseLogs(path.join(__dirname, '../dev_log'));

  const results = [];
  const usedDevIndices = new Set();

  const ignoreKeys = [
    'trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 
    'ctfnTokn', 'mciNodeNo', 'tlgrRspnDttm', 'mciSesnId',
    'lastModifiedDate', 'stateStartDateTime', 'id',
    'serverType', 'userTmunIdnfVal', 'ctfnTokn', 'ipAddr',
    'tlgrCretDttm', 'rqstDttm', 'tlgrRspnDttm', 'mciNodeNo'
  ];

  qaBlocks.forEach((qa, idx) => {
    const qaServiceId = qa.header.rcveSrvcId;
    const qaKey = getBusinessKey(qa);

    // Dev 블록에서 매칭되는 대상 찾기
    let matchIndex = -1;
    for (let i = 0; i < devBlocks.length; i++) {
      if (usedDevIndices.has(i)) continue;

      const dev = devBlocks[i];
      const devServiceId = dev.header.rcveSrvcId;
      const devKey = getBusinessKey(dev);

      // 서비스 ID가 같고, 비즈니스 키가 있으면 키까지 비교
      if (qaServiceId === devServiceId) {
        if (qaKey && devKey) {
          if (qaKey === devKey) {
            matchIndex = i;
            break;
          }
        } else {
          // 키가 없는 경우 가장 먼저 발견된 동일 서비스 ID 매칭 (기존 방식 보완)
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
      // 매칭되는 Dev 블록이 없는 경우
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

  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
