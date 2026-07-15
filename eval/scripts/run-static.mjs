import assert from 'node:assert/strict';
import { compileContext } from '../../packages/core/src/index.mjs';
const messages = [
  {role:'user',content:'The user prefers concise answers.',lunumCode:'R prefer user concise_answers',lunumMeta:{eligible:true}},
  {role:'system',content:'The model should not delete files without confirmation.',lunumCode:'T not delete files without confirmation',lunumMeta:{eligible:false}},
  {role:'system',content:'The API returned error 500 after deployment and the agent fixed the route bug.',lunumCode:'T error api 500 after deploy ; fix route_bug',lunumMeta:{eligible:true}}
];
const result = compileContext(messages,{mode:'mixed'});
assert.equal(result.mixedMessages[1].content,messages[1].content);
assert.ok(result.mixedTokens < result.naturalTokens);
console.log(JSON.stringify(result,null,2));
