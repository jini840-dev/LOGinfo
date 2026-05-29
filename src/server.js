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

  const ignoreKeys = [
    'trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 
    'ctfnTokn', 'mciNodeNo', 'tlgrRspnDttm', 'mciSesnId',
    'lastModifiedDate', 'stateStartDateTime', 'id',
    'serverType', 'userTmunIdnfVal', 'ctfnTokn', 'ipAddr',
    'tlgrCretDttm', 'rqstDttm', 'tlgrRspnDttm', 'mciNodeNo'
  ];

  const results = qaBlocks.map((qa, idx) => {
    const dev = devBlocks[idx] || null;
    const diffs = dev ? getDiff(qa, dev, ignoreKeys) : [{ path: 'root', type: 'DELETED', oldValue: 'BLOCK_MISSING_IN_DEV' }];
    
    return {
      id: idx + 1,
      serviceId: qa.header?.rcveSrvcId || 'Unknown',
      qa,
      dev,
      diffs,
      status: (dev && diffs.length === 0) ? 'MATCH' : 'MISMATCH'
    };
  });

  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
