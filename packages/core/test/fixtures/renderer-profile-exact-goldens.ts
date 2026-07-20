// Approved exact renderer outputs. Review every changed code string and hash.
export const approvedRendererCodes = {
  "simple": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"negated\":false,\"predicate\":\"like\",\"roles\":{\"experiencer\":\"user\",\"theme\":\"coffee\"}}],\"kind\":\"fact\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "2d519cacd7bea9806c6abfaae95d87ee179cb405b4ed385d76ca354acdee7c62",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"p\":\"like\",\"r\":{\"experiencer\":\"user\",\"theme\":\"coffee\"}}],\"k\":\"fact\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "e3f89e38f93f20f4c8ff3885c6e8f278a4766e3ed975a653c0e9a6ee0340d69f",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"fact\",[[\"like\",{\"experiencer\":\"user\",\"theme\":\"coffee\"},0,null,null,null,null,null]],null,null,null]",
      sha256: "5ee5677914300a0b5cb1e45487b0bd60ffe45338fac7a5c5a75c744a08300bb3",
    },
  },
  "negated": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"negated\":true,\"predicate\":\"accept\",\"roles\":{\"agent\":\"system\",\"theme\":\"token\"}}],\"kind\":\"fact\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "e7c030f648b15b318c59ff6a652d1221a473939f8200b3e63d6efba5d6cce5b8",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"n\":true,\"p\":\"accept\",\"r\":{\"agent\":\"system\",\"theme\":\"token\"}}],\"k\":\"fact\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "829b297f813344f2de676f26418212d5609c2182e3f1d6f543c7502a97868de8",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"fact\",[[\"accept\",{\"agent\":\"system\",\"theme\":\"token\"},1,null,null,null,null,null]],null,null,null]",
      sha256: "0f7f6bca265b1f7dbe7f34ded46d9615cc159e34f02aeed5778a2bad113d7a32",
    },
  },
  "conditions": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"conditions\":[{\"negated\":false,\"predicate\":\"authenticate\",\"roles\":{\"agent\":\"user\"}},{\"negated\":false,\"predicate\":\"validate\",\"roles\":{\"subject\":\"token\"}}],\"negated\":false,\"predicate\":\"grant\",\"roles\":{\"agent\":\"system\",\"target\":\"access\"}}],\"kind\":\"instruction\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"tool\"}",
      sha256: "48717043ac6e5a8f7ccb3f5b9c3c5441c1eda933371a31f217a011c2fa6b622b",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"i\":[{\"p\":\"authenticate\",\"r\":{\"agent\":\"user\"}},{\"p\":\"validate\",\"r\":{\"subject\":\"token\"}}],\"p\":\"grant\",\"r\":{\"agent\":\"system\",\"target\":\"access\"}}],\"k\":\"instruction\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"tool\"}",
      sha256: "8ed96778c5b2093482223643ec493325a6f745d77b1bfa3dc765044499fbe139",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"tool\",\"instruction\",[[\"grant\",{\"agent\":\"system\",\"target\":\"access\"},0,null,null,[[\"authenticate\",{\"agent\":\"user\"},0,null,null,null,null,null],[\"validate\",{\"subject\":\"token\"},0,null,null,null,null,null]],null,null]],null,null,null]",
      sha256: "75122571f0b9ce3b8572b501996e6b3dee5121709aa2f31e0ba0f0f5007719d6",
    },
  },
  "modality": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"modality\":\"possibility\",\"negated\":false,\"predicate\":\"rain\",\"roles\":{}}],\"kind\":\"prediction\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "5323500d583c3ad60a299f7321587d4d6cb70c1b691c9c36628cd4e3674ed431",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"m\":\"possibility\",\"p\":\"rain\",\"r\":{}}],\"k\":\"prediction\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "b7c7e803dd5a7a2c57b55bf0035d6e8e58010a49ae08aab56f80942679814979",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"prediction\",[[\"rain\",{},0,\"possibility\",null,null,null,null]],null,null,null]",
      sha256: "0b4fc75bb742fb6a390ac2e1d2df75bf1ff71bb0b2d15aead8f3afd18088b687",
    },
  },
  "annotations": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"annotations\":{\"confidence\":0.95,\"tags\":[\"ui\"]},\"clauses\":[{\"negated\":false,\"predicate\":\"prefer\",\"roles\":{\"experiencer\":\"user\",\"theme\":\"dark_mode\"}}],\"kind\":\"preference\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "88c9a2439f23a2b3fa80a7aea260a72bf18f2df32ce230cb6941771eee6083e6",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"a\":{\"confidence\":0.95,\"tags\":[\"ui\"]},\"c\":[{\"p\":\"prefer\",\"r\":{\"experiencer\":\"user\",\"theme\":\"dark_mode\"}}],\"k\":\"preference\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "afe73698ba43bf8eda922b052c79428521cdce8d3ace5656ec38f1cf993404cd",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"preference\",[[\"prefer\",{\"experiencer\":\"user\",\"theme\":\"dark_mode\"},0,null,null,null,null,null]],null,null,{\"confidence\":0.95,\"tags\":[\"ui\"]}]",
      sha256: "1582a9e7495e5ea131000c938ac720827f17e43dc1f9f38c1ed7be44c2bf0deb",
    },
  },
  "provenance": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"negated\":false,\"predicate\":\"state\",\"roles\":{\"source\":\"document\",\"theme\":\"fact\"}}],\"kind\":\"fact\",\"provenance\":{\"author\":\"alice\",\"source\":\"manual\"},\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "004606a653c1136254088b841d487b5d24a7ca7c8e3b1d9e7fb72f3182267088",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"p\":\"state\",\"r\":{\"source\":\"document\",\"theme\":\"fact\"}}],\"k\":\"fact\",\"p\":{\"author\":\"alice\",\"source\":\"manual\"},\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "6e64c33c6339162ebe3a46b9d7b09181fee3dbff8aea78797be7d133b9dbf436",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"fact\",[[\"state\",{\"source\":\"document\",\"theme\":\"fact\"},0,null,null,null,null,null]],null,{\"author\":\"alice\",\"source\":\"manual\"},null]",
      sha256: "6fe9711b344489df88fe1ee3a25317bf02726219ff38e284d9d27c8ad0a2e2da",
    },
  },
  "metadata-rendering": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"annotations\":{\"confidence\":0.8},\"clauses\":[{\"negated\":false,\"predicate\":\"access\",\"roles\":{\"agent\":\"user\",\"theme\":\"resource\"}}],\"kind\":\"rule\",\"provenance\":{\"source\":\"spec\"},\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"tool\"}",
      sha256: "4a634ad7cf606abcbf8b9893e20e619b500acfdb0cae4a2410a602cdbf0e76cf",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"a\":{\"confidence\":0.8},\"c\":[{\"p\":\"access\",\"r\":{\"agent\":\"user\",\"theme\":\"resource\"}}],\"k\":\"rule\",\"p\":{\"source\":\"spec\"},\"s\":\"lunum-sem/0.1-draft\",\"w\":\"tool\"}",
      sha256: "116e7fddc69ef8ae06de8e1765e80840acc4c391a01c5231606fc59dd8b06443",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"tool\",\"rule\",[[\"access\",{\"agent\":\"user\",\"theme\":\"resource\"},0,null,null,null,null,null]],null,{\"source\":\"spec\"},{\"confidence\":0.8}]",
      sha256: "f3a8a19a09b670ed72e37deb3a4501a2d450c86f00afa63695db7e47da700b26",
    },
  },
  "long-role": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"negated\":false,\"predicate\":\"process\",\"roles\":{\"agent\":\"system\",\"subject\":\"An extremely long descriptive text that exceeds fifty characters and must be snapshotted\"}}],\"kind\":\"fact\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "29c8fca2daff567c041e7d53d5d8e3b4f9282afdbc9b73e5002c235fabadf7aa",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"p\":\"process\",\"r\":{\"agent\":\"system\",\"subject\":\"An extremely long descriptive text that exceeds fifty characters and must be snapshotted\"}}],\"k\":\"fact\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "62f50b5c93c644921b4c4f656190b8627515894cfa1992b01f83d09c31637b8f",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"fact\",[[\"process\",{\"agent\":\"system\",\"subject\":\"An extremely long descriptive text that exceeds fifty characters and must be snapshotted\"},0,null,null,null,null,null]],null,null,null]",
      sha256: "fab74b7c59f2574787320e311a0563607a8dd4ff87dc59aa2548b4a705ddab6e",
    },
  },
  "references": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"negated\":false,\"predicate\":\"see\",\"roles\":{\"agent\":\"reader\",\"theme\":\"doc\"}}],\"kind\":\"instruction\",\"references\":[{\"ref\":\"docs\",\"type\":\"source\",\"value\":\"Manual\"}],\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"tool\"}",
      sha256: "cb4af3ceacf745122cb52bd26b736be8100222273760e64952bcd1d5ceda6fa9",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"p\":\"see\",\"r\":{\"agent\":\"reader\",\"theme\":\"doc\"}}],\"k\":\"instruction\",\"r\":[{\"ref\":\"docs\",\"type\":\"source\",\"value\":\"Manual\"}],\"s\":\"lunum-sem/0.1-draft\",\"w\":\"tool\"}",
      sha256: "291e77458f95fa84a90e21da4d2c828ef404481c91330b6a810be75f8e9faa8c",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"tool\",\"instruction\",[[\"see\",{\"agent\":\"reader\",\"theme\":\"doc\"},0,null,null,null,null,null]],[{\"ref\":\"docs\",\"type\":\"source\",\"value\":\"Manual\"}],null,null]",
      sha256: "8c1ffc53f3ff02d33643fd24d39f41d41f806c4a6d960cd3b7df412e67ac3948",
    },
  },
  "multiple-clauses": {
    safe: {
      code: "LUNUM-SAFE/0.1:{\"clauses\":[{\"negated\":false,\"predicate\":\"like\",\"roles\":{\"experiencer\":\"alice\",\"theme\":\"coffee\"}},{\"negated\":false,\"predicate\":\"prefer\",\"roles\":{\"experiencer\":\"bob\",\"theme\":\"tea\"}}],\"kind\":\"statement\",\"schema\":\"lunum-sem/0.1-draft\",\"world\":\"real\"}",
      sha256: "516ba17d9d35c9aa489ed251584311e5c8a045a154d1f9dc07cdcb18bec3e5db",
    },
    short: {
      code: "LUNUM-SHORT/0.1:{\"c\":[{\"p\":\"like\",\"r\":{\"experiencer\":\"alice\",\"theme\":\"coffee\"}},{\"p\":\"prefer\",\"r\":{\"experiencer\":\"bob\",\"theme\":\"tea\"}}],\"k\":\"statement\",\"s\":\"lunum-sem/0.1-draft\",\"w\":\"real\"}",
      sha256: "e9243edb2bdfe38d2bb95ab00384ba377775a35a80d685dbf6a889bfc84951fd",
    },
    tight: {
      code: "LUNUM-TIGHT/0.1:[\"lunum-sem/0.1-draft\",\"real\",\"statement\",[[\"like\",{\"experiencer\":\"alice\",\"theme\":\"coffee\"},0,null,null,null,null,null],[\"prefer\",{\"experiencer\":\"bob\",\"theme\":\"tea\"},0,null,null,null,null,null]],null,null,null]",
      sha256: "dd64cccb50435ac8c61a59f7e3eea87b5da6070ad4dcda2fd2d752453b5c3e19",
    },
  },
} as const;
