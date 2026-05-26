const axios = require('axios');

/**
 * Cross-Environment Injector
 * 두 개의 다른 환경(URL)으로 동일한 페이로드를 전송하고 결과를 수집합니다.
 */
async function inject(payload, devUrl, qaUrl) {
  console.log('Sending payload to Dev and QA environments...');
  
  const devRequest = axios.post(devUrl, payload).catch(err => ({ error: err.message, env: 'DEV' }));
  const qaRequest = axios.post(qaUrl, payload).catch(err => ({ error: err.message, env: 'QA' }));

  const [devResponse, qaResponse] = await Promise.all([devRequest, qaRequest]);

  return {
    dev: devResponse.data || devResponse,
    qa: qaResponse.data || qaResponse
  };
}

module.exports = { inject };
