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
  const currentKey = path.split('.').pop();
  const isIgnored = ignoreKeys.includes(currentKey) || (path && ignoreKeys.includes(path));

  // 두 값이 모두 객체인 경우 (배열 포함)
  if (_.isObject(obj1) && _.isObject(obj2)) {
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
  // 원시 값 또는 타입이 다른 경우 비교
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
