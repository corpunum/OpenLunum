//! A JSON value model that behaves like the JavaScript values the TypeScript
//! implementation sees: strings are UTF-16 code-unit vectors (lone surrogates
//! survive), numbers are f64, and objects model the one prototype quirk that
//! reaches the fingerprint (`out["__proto__"] = obj` sets the prototype).

pub type JStr = Vec<u16>;

pub fn js(s: &str) -> JStr {
    s.encode_utf16().collect()
}

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(JStr),
    Arr(Vec<Value>),
    Obj(Obj),
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Obj {
    pub entries: Vec<(JStr, Value)>,
    /// Prototype installed through `obj.__proto__ = value` (objects and arrays only).
    pub proto: Option<Box<Value>>,
}

impl Obj {
    pub fn new() -> Self {
        Obj::default()
    }

    /// CreateDataProperty / JSON.parse semantics: `__proto__` is an ordinary own key. Later duplicates win.
    pub fn insert_own(&mut self, key: JStr, value: Value) {
        if let Some(slot) = self.entries.iter_mut().find(|(k, _)| *k == key) {
            slot.1 = value;
        } else {
            self.entries.push((key, value));
        }
    }

    /// Assignment semantics `obj[key] = value`: the `__proto__` setter changes the prototype and adds no key.
    pub fn assign(&mut self, key: JStr, value: Value) {
        if key == js("__proto__") {
            match value {
                Value::Obj(_) | Value::Arr(_) => self.proto = Some(Box::new(value)),
                Value::Null => self.proto = None,
                _ => {}
            }
        } else {
            self.insert_own(key, value);
        }
    }

    pub fn get_own(&self, key: &str) -> Option<&Value> {
        let k = js(key);
        self.entries.iter().find(|(kk, _)| *kk == k).map(|(_, v)| v)
    }

    /// Property read along the prototype chain.
    pub fn get(&self, key: &str) -> Option<&Value> {
        if let Some(v) = self.get_own(key) {
            return Some(v);
        }
        match self.proto.as_deref() {
            Some(Value::Obj(p)) => p.get(key),
            _ => None,
        }
    }

    /// `key in obj`.
    pub fn has(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    pub fn own_keys(&self) -> Vec<&JStr> {
        self.entries.iter().map(|(k, _)| k).collect()
    }

    pub fn sorted_entries(&self) -> Vec<&(JStr, Value)> {
        let mut v: Vec<&(JStr, Value)> = self.entries.iter().collect();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    }
}

impl Value {
    pub fn as_obj(&self) -> Option<&Obj> {
        if let Value::Obj(o) = self {
            Some(o)
        } else {
            None
        }
    }
    pub fn is_object_like(&self) -> bool {
        matches!(self, Value::Obj(_))
    }
    pub fn as_str(&self) -> Option<&JStr> {
        if let Value::Str(s) = self {
            Some(s)
        } else {
            None
        }
    }
    pub fn str_eq(&self, s: &str) -> bool {
        matches!(self, Value::Str(x) if *x == js(s))
    }
}

/// Parse JSON text with `JSON.parse` semantics.
pub fn parse_json(text: &str) -> Result<Value, String> {
    let chars: Vec<char> = text.chars().collect();
    let mut p = Parser { c: &chars, i: 0 };
    p.ws();
    let v = p.value()?;
    p.ws();
    if p.i != chars.len() {
        return Err(format!("trailing characters at {}", p.i));
    }
    Ok(v)
}

struct Parser<'a> {
    c: &'a [char],
    i: usize,
}

impl<'a> Parser<'a> {
    fn ws(&mut self) {
        while self.i < self.c.len() && matches!(self.c[self.i], ' ' | '\t' | '\n' | '\r') {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<char> {
        self.c.get(self.i).copied()
    }
    fn lit(&mut self, s: &str, v: Value) -> Result<Value, String> {
        for ch in s.chars() {
            if self.peek() != Some(ch) {
                return Err(format!("bad literal at {}", self.i));
            }
            self.i += 1;
        }
        Ok(v)
    }
    fn value(&mut self) -> Result<Value, String> {
        match self.peek() {
            Some('n') => self.lit("null", Value::Null),
            Some('t') => self.lit("true", Value::Bool(true)),
            Some('f') => self.lit("false", Value::Bool(false)),
            Some('"') => Ok(Value::Str(self.string()?)),
            Some('[') => {
                self.i += 1;
                let mut out = Vec::new();
                self.ws();
                if self.peek() == Some(']') {
                    self.i += 1;
                    return Ok(Value::Arr(out));
                }
                loop {
                    self.ws();
                    out.push(self.value()?);
                    self.ws();
                    match self.peek() {
                        Some(',') => self.i += 1,
                        Some(']') => {
                            self.i += 1;
                            return Ok(Value::Arr(out));
                        }
                        _ => return Err(format!("bad array at {}", self.i)),
                    }
                }
            }
            Some('{') => {
                self.i += 1;
                let mut o = Obj::new();
                self.ws();
                if self.peek() == Some('}') {
                    self.i += 1;
                    return Ok(Value::Obj(o));
                }
                loop {
                    self.ws();
                    if self.peek() != Some('"') {
                        return Err(format!("bad key at {}", self.i));
                    }
                    let k = self.string()?;
                    self.ws();
                    if self.peek() != Some(':') {
                        return Err(format!("missing colon at {}", self.i));
                    }
                    self.i += 1;
                    self.ws();
                    let v = self.value()?;
                    o.insert_own(k, v);
                    self.ws();
                    match self.peek() {
                        Some(',') => self.i += 1,
                        Some('}') => {
                            self.i += 1;
                            return Ok(Value::Obj(o));
                        }
                        _ => return Err(format!("bad object at {}", self.i)),
                    }
                }
            }
            Some(c) if c == '-' || c.is_ascii_digit() => self.number(),
            _ => Err(format!("unexpected token at {}", self.i)),
        }
    }
    fn number(&mut self) -> Result<Value, String> {
        let start = self.i;
        if self.peek() == Some('-') {
            self.i += 1;
        }
        match self.peek() {
            Some('0') => self.i += 1,
            Some(c) if c.is_ascii_digit() => {
                while self.peek().map_or(false, |c| c.is_ascii_digit()) {
                    self.i += 1;
                }
            }
            _ => return Err("bad number".into()),
        }
        if self.peek() == Some('.') {
            self.i += 1;
            if !self.peek().map_or(false, |c| c.is_ascii_digit()) {
                return Err("bad fraction".into());
            }
            while self.peek().map_or(false, |c| c.is_ascii_digit()) {
                self.i += 1;
            }
        }
        if matches!(self.peek(), Some('e') | Some('E')) {
            self.i += 1;
            if matches!(self.peek(), Some('+') | Some('-')) {
                self.i += 1;
            }
            if !self.peek().map_or(false, |c| c.is_ascii_digit()) {
                return Err("bad exponent".into());
            }
            while self.peek().map_or(false, |c| c.is_ascii_digit()) {
                self.i += 1;
            }
        }
        let s: String = self.c[start..self.i].iter().collect();
        s.parse::<f64>().map(Value::Num).map_err(|e| e.to_string())
    }
    fn string(&mut self) -> Result<JStr, String> {
        self.i += 1; // opening quote
        let mut out: JStr = Vec::new();
        loop {
            let c = self.peek().ok_or("unterminated string")?;
            self.i += 1;
            match c {
                '"' => return Ok(out),
                '\\' => {
                    let e = self.peek().ok_or("bad escape")?;
                    self.i += 1;
                    match e {
                        '"' => out.push(0x22),
                        '\\' => out.push(0x5c),
                        '/' => out.push(0x2f),
                        'b' => out.push(8),
                        'f' => out.push(12),
                        'n' => out.push(10),
                        'r' => out.push(13),
                        't' => out.push(9),
                        'u' => {
                            let mut n: u16 = 0;
                            for _ in 0..4 {
                                let d = self.peek().and_then(|c| c.to_digit(16)).ok_or("bad \\u escape")?;
                                self.i += 1;
                                n = n * 16 + d as u16;
                            }
                            out.push(n);
                        }
                        _ => return Err("bad escape".into()),
                    }
                }
                c if (c as u32) < 0x20 => return Err("control character in string".into()),
                c => {
                    let mut buf = [0u16; 2];
                    out.extend_from_slice(c.encode_utf16(&mut buf));
                }
            }
        }
    }
}
