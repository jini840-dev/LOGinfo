const { parseLogs } = require('./src/log-parser');
const { getDiff } = require('./src/diff-engine');

// 로그 파싱
console.log('Parsing logs...');
const qaBlocks = parseLogs('qa_log');
const devBlocks = parseLogs('dev_log');

console.log(`Found ${qaBlocks.length} JSON blocks in QA log`);
console.log(`Found ${devBlocks.length} JSON blocks in Dev log`);

if (qaBlocks.length > 0 && devBlocks.length > 0) {
  // 첫 번째 블록끼리 비교 (현실적으로는 trnnNo 등으로 매칭해야 함)
  const qaData = qaBlocks[0];
  const devData = devBlocks[0];

  // 무시할 키 설정 (PRD Step 3 반영)
  const ignoreKeys = [
    'trnnNo', 
    'tlgrCretDttm', 
    'rqstDttm', 
    'ipAddr', 
    'rqsrIp', 
    'ctfnTokn',
    'mciNodeNo',
    'Suid'
  ];

  console.log('\n--- Comparing first blocks ---');
  const diffs = getDiff(qaData, devData, ignoreKeys);

  if (diffs.length === 0) {
    console.log('✅ No differences found (considering ignore list)!');
  } else {
    console.log(`❌ Found ${diffs.length} differences:`);
    diffs.forEach(d => {
      console.log(`[${d.path}] (${d.type})`);
      if (d.oldValue !== undefined) console.log(`  QA: ${JSON.stringify(d.oldValue)}`);
      if (d.newValue !== undefined) console.log(`  Dev: ${JSON.stringify(d.newValue)}`);
    });
  }
}