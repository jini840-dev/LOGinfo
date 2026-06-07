const functions = require('firebase-functions/v1');
const express = require('express');
const path = require('path');
const cors = require('cors');
const { parseLogs } = require('./src/log-parser');
const { getDiff } = require('./src/diff-engine');

const app = express();
app.use(cors({ origin: true }));

app.get('/api/compare', (req, res) => {
  try {
    const qaBlocks = parseLogs(path.join(__dirname, 'qa_log'));
    const devBlocks = parseLogs(path.join(__dirname, 'dev_log'));

    const ignoreKeys = [
      'trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 
      'ctfnTokn', 'mciNodeNo', 'tlgrRspnDttm', 'mciSesnId',
      'lastModifiedDate', 'stateStartDateTime', 'id',
      'serverType', 'userTmunIdnfVal', 'ctfnTokn', 'ipAddr',
      'tlgrCretDttm', 'rqstDttm', 'tlgrRspnDttm', 'mciNodeNo',
      'Suid'
    ];

    // 단순 인덱스 기반 매칭 대신 스마트 매칭이 필요할 수 있으나, 
    // 현재 src/server.js 로직에 맞춰 인덱스 기반으로 유지하되 최신 엔진을 적용합니다.
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

    res.json(results);
  } catch (error) {
    console.error("Error comparing logs:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

exports.api = functions.https.onRequest(app);
