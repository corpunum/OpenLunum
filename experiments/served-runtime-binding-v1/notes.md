# Observations before implementation

Baseline `a4aa081b675532855bf4360bcb790dcc9275a881` served
`lunum-agent/0.13`, `lunum-protocol/0.4` and `lunum-frame/0.5` through a new
owned stdio MCP child. The existing preflight reported artifactBinding=true
and servedContract=true, with providerCalls=0. The child closed normally;
no existing server or model was restarted.

However, v14 predates changes to `derive.js` and `fallback-policy.js`, neither
of which is checked by its selected-file list. A passing v14 receipt is not a
complete binding of the current repository-owned served runtime. Additive
v15 metadata will bind the full core and MCP JavaScript trees and reject drift.
Keep v14 byte-for-byte intact and do not reinterpret prior developmental calls
as newly qualified protected evidence.
