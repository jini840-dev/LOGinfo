const _ = require('lodash');

/**
 * Deep Diff Engine
 * @param {Object} obj1 - 비교 대상 1 (예: QA)
 * @param {Object} obj2 - 비교 대상 2 (예: Dev)
 * @param {string[]} ignoreKeys - 무시할 키 목록 (예: ['trnnNo', 'tlgrCretDttm'])
 * @param {string} path - 현재 탐색 중인 경로 (내부용)
 */
function getDiff(obj1, obj2, ignoreKeys = [], path = '') {
  let diffs = [];

  // 현재 키가 무시 목록에 포함되어 있는지 확인
  const currentKey = path.split('.').pop();
  if (ignoreKeys.includes(currentKey)) {
    return [];
  }

  // 두 값이 모두 객체인 경우 (배열 포함)
  if (_.isObject(obj1) && _.isObject(obj2)) {
    const keys = _.union(Object.keys(obj1), Object.keys(obj2));

    for (const key of keys) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!_.has(obj1, key)) {
        if (!ignoreKeys.includes(key)) {
          diffs.push({ path: currentPath, type: 'ADDED', newValue: obj2[key] });
        }
      } else if (!_.has(obj2, key)) {
        if (!ignoreKeys.includes(key)) {
          diffs.push({ path: currentPath, type: 'REMOVED', oldValue: obj1[key] });
        }
      } else {
        diffs = diffs.concat(getDiff(obj1[key], obj2[key], ignoreKeys, currentPath));
      }
    }
  } 
  // 원시 값 비교
  else if (obj1 !== obj2) {
    diffs.push({
      path,
      type: 'CHANGED',
      oldValue: obj1,
      newValue: obj2
    });
  }

  return diffs;
}

module.exports = { getDiff };
