import test from 'node:test';
import assert from 'node:assert/strict';

// lfp:2.1 = Unicode 17.0 casefold/NFKC (docs/SEMANTIC_CONTRACT.md). Identifiers go through
// normalize('NFKC') and toLocaleLowerCase('und'), so the Unicode data of the runtime is part of the identity.
// The Rust crate lunum-sem asserts the same marker from the golden file meta.
test('runtime Unicode version is the one lfp:2.1 is pinned to', () => {
  assert.equal(process.versions.unicode, '17.0');
});

// Code points whose lowercase differs between Unicode 17.0 and the older tables in the Rust toolchain
// (Rust 1.75, Unicode 15.1); lunum-sem patches exactly these. A runtime with different data would fail here first.
const PATCHED_LOWERCASE: ReadonlyArray<readonly [number, readonly number[]]> = [
  [0x1c89, [0x1c8a]],
  [0xa7cb, [0x264]],
  [0xa7cc, [0xa7cd]],
  [0xa7ce, [0xa7cf]],
  [0xa7d2, [0xa7d3]],
  [0xa7d4, [0xa7d5]],
  [0xa7da, [0xa7db]],
  [0xa7dc, [0x19b]],
  [0x10d50, [0x10d70]],
  [0x10d51, [0x10d71]],
  [0x10d52, [0x10d72]],
  [0x10d53, [0x10d73]],
  [0x10d54, [0x10d74]],
  [0x10d55, [0x10d75]],
  [0x10d56, [0x10d76]],
  [0x10d57, [0x10d77]],
  [0x10d58, [0x10d78]],
  [0x10d59, [0x10d79]],
  [0x10d5a, [0x10d7a]],
  [0x10d5b, [0x10d7b]],
  [0x10d5c, [0x10d7c]],
  [0x10d5d, [0x10d7d]],
  [0x10d5e, [0x10d7e]],
  [0x10d5f, [0x10d7f]],
  [0x10d60, [0x10d80]],
  [0x10d61, [0x10d81]],
  [0x10d62, [0x10d82]],
  [0x10d63, [0x10d83]],
  [0x10d64, [0x10d84]],
  [0x10d65, [0x10d85]],
  [0x16ea0, [0x16ebb]],
  [0x16ea1, [0x16ebc]],
  [0x16ea2, [0x16ebd]],
  [0x16ea3, [0x16ebe]],
  [0x16ea4, [0x16ebf]],
  [0x16ea5, [0x16ec0]],
  [0x16ea6, [0x16ec1]],
  [0x16ea7, [0x16ec2]],
  [0x16ea8, [0x16ec3]],
  [0x16ea9, [0x16ec4]],
  [0x16eaa, [0x16ec5]],
  [0x16eab, [0x16ec6]],
  [0x16eac, [0x16ec7]],
  [0x16ead, [0x16ec8]],
  [0x16eae, [0x16ec9]],
  [0x16eaf, [0x16eca]],
  [0x16eb0, [0x16ecb]],
  [0x16eb1, [0x16ecc]],
  [0x16eb2, [0x16ecd]],
  [0x16eb3, [0x16ece]],
  [0x16eb4, [0x16ecf]],
  [0x16eb5, [0x16ed0]],
  [0x16eb6, [0x16ed1]],
  [0x16eb7, [0x16ed2]],
  [0x16eb8, [0x16ed3]]
];

test('canary: the 55 patched lowercase code points lowercase as pinned', () => {
  assert.equal(PATCHED_LOWERCASE.length, 55);
  for (const [cp, lower] of PATCHED_LOWERCASE) {
    const got = [...String.fromCodePoint(cp).toLocaleLowerCase('und')].map((c) => c.codePointAt(0));
    assert.deepEqual(got, [...lower], `U+${cp.toString(16)}`);
  }
});
