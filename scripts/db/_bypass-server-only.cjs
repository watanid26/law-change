// Node CLI 에서 "server-only" import 가 throw 하지 않도록 우회.
// require("path") 로 실체를 갈아끼운다 (side effect 없음).
// 사용: node --require scripts/db/_bypass-server-only.cjs ... (혹은 tsx 와 함께)

const Module = require("node:module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === "server-only" || request === "client-only") {
    return originalResolve.call(this, "path", parent, ...rest);
  }
  return originalResolve.call(this, request, parent, ...rest);
};
