const functions = require('firebase-functions/v1');
const express = require('express');
const path = require('path');
const { parseLogs } = require('./src/log-parser');
const { getDiff } = require('./src/diff-engine');

const app = express();

app.get('/api/compare', (req, res) => {
  try {
    const qaBlocks = parseLogs(path.join(__dirname, 'qa_log'));
    const devBlocks = parseLogs(path.join(__dirname, 'dev_log'));

    const results = [];
    const limit = Math.min(qaBlocks.length, devBlocks.length);

    const ignoreKeys = ['trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 'ctfnTokn', 'mciNodeNo'];

    for (let i = 0; i < limit; i++) {
      const qa = qaBlocks[i];
      const dev = devBlocks[i];
      const diffs = getDiff(qa, dev, ignoreKeys);
      
      results.push({
        id: i + 1,
        serviceId: qa.header?.rcveSrvcId || 'Unknown',
        qa,
        dev,
        diffs,
        status: diffs.length === 0 ? 'MATCH' : 'MISMATCH'
      });
    }

    res.json(results);
  } catch (error) {
    console.error("Error comparing logs:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Express 앱을 Cloud Function으로 내보냅니다.
exports.api = functions.https.onRequest(app);
