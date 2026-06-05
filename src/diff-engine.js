const _ = require('lodash');

/**
 * Deep Diff Engine
 * @param {Object} obj1 - 비교 대상 1 (예: QA)
 * @param {Object} obj2 - 비교 대상 2 (예: Dev)
 * @param {string[]} ignoreKeys - 무시할 키 목록
 * @param {string} path - 현재 탐색 중인 경로
 */
function getDiff(obj1, obj2, ignoreKeys = [], path = '') {
  let diffs = [];
  const currentKey = path.split('.').pop();
  const isIgnored = ignoreKeys.includes(currentKey) || (path && ignoreKeys.includes(path));

  // 1. 배열 비교 (Order-Agnostic)
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    const matchingKeys = ['polyNo', 'id', 'contractNo', 'trnnNo', 'key'];
    
    // 두 배열의 모든 요소를 복사하여 처리 상태 추적
    let remainingObj2 = [...obj2];
    
    obj1.forEach((item1, index) => {
      const currentPath = `${path}[${index}]`;
      
      // 매칭되는 키 찾기
      let matchIdx = -1;
      if (_.isObject(item1)) {
        const idKey = matchingKeys.find(k => _.has(item1, k));
        if (idKey) {
          matchIdx = remainingObj2.findIndex(item2 => item2[idKey] === item1[idKey]);
        }
      }

      // 키 매칭 실패 시 단순 인덱스 매칭 또는 값 매칭 시도
      if (matchIdx === -1) {
        matchIdx = remainingObj2.findIndex(item2 => _.isEqual(item1, item2));
      }

      if (matchIdx !== -1) {
        const item2 = remainingObj2.splice(matchIdx, 1)[0];
        diffs = diffs.concat(getDiff(item1, item2, ignoreKeys, currentPath));
      } else {
        diffs.push({ path: currentPath, type: 'REMOVED', oldValue: item1 });
      }
    });

    remainingObj2.forEach((item2, index) => {
      diffs.push({ path: `${path}[+${index}]`, type: 'ADDED', newValue: item2 });
    });
  } 
  // 2. 객체 비교
  else if (_.isObject(obj1) && _.isObject(obj2)) {
    const keys = _.union(_.keys(obj1), _.keys(obj2));

    for (const key of keys) {
      const currentPath = path ? `${path}.${key}` : key;
      const keyIgnored = ignoreKeys.includes(key);
      
      if (!_.has(obj1, key)) {
        diffs.push({ path: currentPath, type: keyIgnored ? 'IGNORED' : 'ADDED', newValue: obj2[key] });
      } else if (!_.has(obj2, key)) {
        diffs.push({ path: currentPath, type: keyIgnored ? 'IGNORED' : 'REMOVED', oldValue: obj1[key] });
      } else {
        diffs = diffs.concat(getDiff(obj1[key], obj2[key], ignoreKeys, currentPath));
      }
    }
  } 
  // 3. 원시 값 비교
  else if (!_.isEqual(obj1, obj2)) {
    diffs.push({
      path,
      type: isIgnored ? 'IGNORED' : 'CHANGED',
      oldValue: obj1,
      newValue: obj2
    });
  }

  return diffs;
}

module.exports = { getDiff };
