/** Parse one JSON object and reject duplicate keys at every object depth. */
export function parseStrictJsonObject(text: string): unknown {
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected one JSON object');
  let index = 0;
  const skip = (): void => { while (/\s/u.test(text[index] ?? '')) index += 1; };
  const stringEnd = (): number => {
    if (text[index] !== '"') throw new Error('Expected JSON string');
    index += 1;
    while (index < text.length) {
      const char = text[index++];
      if (char === '\\') { index += 1; continue; }
      if (char === '"') return index;
    }
    throw new Error('Unterminated JSON string');
  };
  const parseValue = (): void => {
    skip();
    const char = text[index];
    if (char === '{') {
      index += 1;
      const keys = new Set<string>();
      skip();
      if (text[index] === '}') { index += 1; return; }
      while (index < text.length) {
        const start = index;
        const end = stringEnd();
        const key = JSON.parse(text.slice(start, end)) as string;
        if (keys.has(key)) throw new Error(`Duplicate JSON object key: ${key}`);
        keys.add(key);
        skip();
        if (text[index++] !== ':') throw new Error('Expected JSON object colon');
        parseValue();
        skip();
        const separator = text[index++];
        if (separator === '}') return;
        if (separator !== ',') throw new Error('Expected JSON object separator');
        skip();
      }
      throw new Error('Unterminated JSON object');
    }
    if (char === '[') {
      index += 1;
      skip();
      if (text[index] === ']') { index += 1; return; }
      while (index < text.length) {
        parseValue();
        skip();
        const separator = text[index++];
        if (separator === ']') return;
        if (separator !== ',') throw new Error('Expected JSON array separator');
        skip();
      }
      throw new Error('Unterminated JSON array');
    }
    if (char === '"') { stringEnd(); return; }
    const start = index;
    while (index < text.length && !/[\s,\]}]/u.test(text[index]!)) index += 1;
    if (start === index) throw new Error('Expected JSON value');
  };
  parseValue();
  skip();
  if (index !== text.length) throw new Error('Trailing JSON content');
  return value;
}
