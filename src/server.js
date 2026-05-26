const express = require('express');
const path = require('path');
const { parseLogs } = require('./log-parser');
const { getDiff } = require('./diff-engine');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/api/compare', (req, res) => {
  const qaBlocks = parseLogs(path.join(__dirname, '../qa_log'));
  const devBlocks = parseLogs(path.join(__dirname, '../dev_log'));

  const results = [];
  const limit = Math.min(qaBlocks.length, devBlocks.length);

  const ignoreKeys = ['trnnNo', 'tlgrCretDttm', 'rqstDttm', 'ipAddr', 'rqsrIp', 'ctfnTokn', 'mciNodeNo'];

  for (let i = 0; i < limit; i++) {
    const qa = qaBlocks[i];
    const dev = devBlocks[i];
    const diffs = getDiff(qa, dev, ignoreKeys);
    
    results.push({
      id: i + 1,
      serviceId: qa.header.rcveSrvcId,
      qa,
      dev,
      diffs,
      status: diffs.length === 0 ? 'MATCH' : 'MISMATCH'
    });
  }

  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
