use lunum_sem::jsstr::{basic_identifier, normalize_text_str, to_js_string, to_js_string_or_empty, trim};
use lunum_sem::value::{js, JStr, Obj, Value};

pub const RENDERER: &str = "generic-en-pivot/0.2";

const ROLE_ORDER: &[&str] = &[
    "agent", "experiencer", "subject", "actor", "recipient", "object", "theme", "patient", "target", "source", "destination", "location", "time",
    "manner", "value", "reason", "evidence", "definition", "relation", "attribute", "items", "connective",
];

/// `class` is "validation" (canonicalizeSem's `Invalid Lunum-Sem: ...` TypeError) or "js-TypeError" (a JS runtime TypeError).
#[derive(Debug, Clone, PartialEq)]
pub struct RenderError {
    pub class: &'static str,
    pub message: JStr,
}

fn type_error() -> RenderError {
    RenderError { class: "js-TypeError", message: js("TypeError") }
}

// ---- JS object model helpers ----

fn is_array_index(k: &[u16]) -> Option<u64> {
    if k.is_empty() || k.len() > 10 || (k.len() > 1 && k[0] == b'0' as u16) || !k.iter().all(|&u| (b'0' as u16..=b'9' as u16).contains(&u)) {
        return None;
    }
    let n: u64 = k.iter().fold(0, |a, &u| a * 10 + (u - b'0' as u16) as u64);
    (n < 4294967295).then_some(n)
}

/// Own enumerable string keys in JS order: array indices ascending, then the rest in insertion order.
fn ordered<'a, T>(entries: &'a [(JStr, T)]) -> Vec<&'a (JStr, T)> {
    let mut idx: Vec<(u64, &(JStr, T))> = Vec::new();
    let mut rest = Vec::new();
    for e in entries {
        match is_array_index(&e.0) {
            Some(n) => idx.push((n, e)),
            None => rest.push(e),
        }
    }
    idx.sort_by_key(|x| x.0);
    idx.into_iter().map(|x| x.1).chain(rest).collect()
}

fn prop<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    match v {
        Value::Obj(o) => o.get_own(k),
        _ => None,
    }
}

fn is_object(v: &Value) -> bool {
    matches!(v, Value::Obj(_))
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Num(n) => *n != 0.0 && !n.is_nan(),
        Value::Str(s) => !s.is_empty(),
        _ => true,
    }
}

fn nonnull(v: Option<&Value>) -> Option<&Value> {
    v.filter(|x| !matches!(x, Value::Null))
}

fn ident(v: Option<&Value>) -> JStr {
    basic_identifier(&to_js_string_or_empty(v))
}

// ---- validateSem ----

fn find_forbidden(v: &Value, path: &JStr) -> Option<JStr> {
    match v {
        Value::Arr(items) => {
            for (i, it) in items.iter().enumerate() {
                let mut p = path.clone();
                p.extend(js(&format!("[{i}]")));
                if let Some(h) = find_forbidden(it, &p) {
                    return Some(h);
                }
            }
            None
        }
        Value::Obj(o) => {
            for (k, val) in ordered(&o.entries) {
                let mut p = path.clone();
                p.push(b'.' as u16);
                p.extend(k);
                if k == &js("__proto__") || k == &js("constructor") || k == &js("prototype") {
                    return Some(p);
                }
                if let Some(h) = find_forbidden(val, &p) {
                    return Some(h);
                }
            }
            None
        }
        _ => None,
    }
}

fn validate(v: &Value) -> Result<&Obj, RenderError> {
    let fail = |errors: Vec<JStr>| {
        let mut m = js("Invalid Lunum-Sem: ");
        for (i, e) in errors.iter().enumerate() {
            if i > 0 {
                m.extend(js("; "));
            }
            m.extend(e);
        }
        RenderError { class: "validation", message: m }
    };
    let o = match v {
        Value::Obj(o) => o,
        _ => return Err(fail(vec![js("sem must be an object")])),
    };
    if let Some(mut p) = find_forbidden(v, &js("sem")) {
        let mut m = js("forbidden key ");
        m.append(&mut p);
        m.extend(js(": __proto__, constructor and prototype are not allowed at any depth"));
        return Err(fail(vec![m]));
    }
    let mut errors: Vec<JStr> = Vec::new();
    if !o.get_own("schema").is_some_and(|s| s.str_eq("lunum-sem/0.1-draft")) {
        errors.push(js("schema must equal lunum-sem/0.1-draft"));
    }
    if trim(&to_js_string_or_empty(o.get_own("world"))).is_empty() {
        errors.push(js("world is required"));
    }
    if trim(&to_js_string_or_empty(o.get_own("kind"))).is_empty() {
        errors.push(js("kind is required"));
    }
    let clauses = match o.get_own("clauses") {
        Some(Value::Arr(a)) if !a.is_empty() => Some(a),
        Some(Value::Arr(_)) => {
            errors.push(js("clauses must be a non-empty array"));
            None
        }
        _ => {
            errors.push(js("clauses must be a non-empty array"));
            None
        }
    };
    if let Some(r) = o.get_own("references") {
        match r {
            Value::Arr(items) => {
                for (i, it) in items.iter().enumerate() {
                    if !is_object(it) {
                        errors.push(js(&format!("references[{i}] must be an object")));
                    }
                }
            }
            _ => errors.push(js("references must be an array")),
        }
    }
    if let Some(Value::Arr(items)) = o.get_own("clauses") {
        for (i, c) in items.iter().enumerate() {
            let co = match c {
                Value::Obj(co) => co,
                _ => {
                    errors.push(js(&format!("clauses[{i}] must be an object")));
                    continue;
                }
            };
            if trim(&to_js_string_or_empty(co.get_own("predicate"))).is_empty() {
                errors.push(js(&format!("clauses[{i}].predicate is required")));
            }
            if !co.get_own("roles").is_some_and(is_object) {
                errors.push(js(&format!("clauses[{i}].roles must be an object")));
            }
        }
    }
    let _ = clauses;
    if errors.is_empty() {
        Ok(o)
    } else {
        Err(fail(errors))
    }
}

// ---- canonicalizeSem (the parts the renderer reads) ----

fn canonical_unknown(v: &Value) -> Value {
    match v {
        Value::Str(s) => Value::Str(normalize_text_str(s)),
        Value::Arr(a) => Value::Arr(a.iter().map(canonical_unknown).collect()),
        Value::Obj(o) => {
            let mut keys: Vec<&(JStr, Value)> = o.entries.iter().collect();
            keys.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = Obj::new();
            for (k, item) in keys {
                let val = if k == &js("id") || k == &js("type") || k == &js("ref") || k == &js("language") {
                    Value::Str(ident(Some(item)))
                } else if let (true, Value::Str(s)) = (k == &js("value"), item) {
                    Value::Str(normalize_text_str(s))
                } else {
                    canonical_unknown(item)
                };
                out.insert_own(k.clone(), val);
            }
            Value::Obj(out)
        }
        other => other.clone(),
    }
}

struct CClause {
    predicate: JStr,
    roles: Vec<(JStr, Value)>,
    negated: bool,
    modality: Option<JStr>,
    time: Option<Value>,
    conditions: Vec<CClause>,
    consequences: Vec<CClause>,
}

/// `Object.keys(x ?? {}).sort()` paired with `x[key]`.
fn role_items(roles: Option<&Value>) -> Vec<(JStr, Value)> {
    let mut items: Vec<(JStr, Value)> = match nonnull(roles) {
        Some(Value::Obj(o)) => ordered(&o.entries).into_iter().map(|e| (e.0.clone(), e.1.clone())).collect(),
        Some(Value::Arr(a)) => a.iter().enumerate().map(|(i, v)| (js(&i.to_string()), v.clone())).collect(),
        Some(Value::Str(s)) => s.iter().enumerate().map(|(i, &u)| (js(&i.to_string()), Value::Str(vec![u]))).collect(),
        _ => Vec::new(),
    };
    items.sort_by(|a, b| a.0.cmp(&b.0));
    items
}

/// `clause.conditions?.length` truthy then `.map(canonicalClause)`.
fn nested(v: Option<&Value>) -> Result<Vec<CClause>, RenderError> {
    match v {
        Some(Value::Arr(a)) => a.iter().map(canonical_clause).collect(),
        Some(Value::Str(s)) if !s.is_empty() => Err(type_error()),
        Some(Value::Obj(o)) if o.get_own("length").is_some_and(truthy) => Err(type_error()),
        _ => Ok(Vec::new()),
    }
}

fn canonical_clause(clause: &Value) -> Result<CClause, RenderError> {
    if matches!(clause, Value::Null) {
        return Err(type_error());
    }
    // roles[normalizeIdentifier(key)] = canonicalTerm(item); `__proto__` adds no own key; first insertion fixes position
    let mut roles: Vec<(JStr, Value)> = Vec::new();
    for (key, item) in role_items(prop(clause, "roles")) {
        let nk = basic_identifier(&key);
        if nk == js("__proto__") {
            continue;
        }
        let val = canonical_unknown(&item);
        match roles.iter_mut().find(|(k, _)| *k == nk) {
            Some(slot) => slot.1 = val,
            None => roles.push((nk, val)),
        }
    }
    let roles: Vec<(JStr, Value)> = ordered(&roles).into_iter().cloned().collect();
    let predicate = ident(prop(clause, "predicate"));
    let negated = matches!(prop(clause, "negated"), Some(Value::Bool(true)));
    let modality = nonnull(prop(clause, "modality")).map(|m| ident(Some(m)));
    let time = nonnull(prop(clause, "time")).map(canonical_unknown);
    let conditions = nested(prop(clause, "conditions"))?;
    let consequences = nested(prop(clause, "consequences"))?;
    Ok(CClause { predicate, roles, negated, modality, time, conditions, consequences })
}

// ---- renderer ----

fn term_text(term: Option<&Value>) -> JStr {
    let t = match term {
        None | Some(Value::Null) => return Vec::new(),
        Some(t) => t,
    };
    match t {
        Value::Null => Vec::new(),
        Value::Str(_) | Value::Num(_) | Value::Bool(_) => to_js_string(t),
        Value::Arr(items) => {
            let mut out = js("[");
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    out.extend(js(", "));
                }
                out.extend(term_text(Some(it)));
            }
            out.push(b']' as u16);
            out
        }
        Value::Obj(o) => {
            let pick = ["id", "ref", "value"].iter().find_map(|k| nonnull(o.get_own(k)));
            let head = trim(&to_js_string_or_empty(pick));
            if head.is_empty() {
                return to_js_string_or_empty(o.get_own("type"));
            }
            let mut out = head;
            if let (Some(Value::Str(u)), None) = (o.get_own("unit"), o.get_own("id")) {
                out.push(b' ' as u16);
                out.extend(u);
            }
            out
        }
    }
}

fn role_rank(r: &JStr) -> i64 {
    ROLE_ORDER.iter().position(|x| js(x) == *r).map_or(999, |i| i as i64)
}

fn render_clause(c: &CClause) -> JStr {
    let modality: JStr = match &c.modality {
        Some(m) if !m.is_empty() => {
            if *m == js("obligation") {
                js("must")
            } else if *m == js("permission") {
                js("may")
            } else {
                m.clone()
            }
        }
        _ => Vec::new(),
    };
    let mut sorted: Vec<&(JStr, Value)> = c.roles.iter().collect();
    sorted.sort_by(|a, b| {
        let d = role_rank(&a.0) - role_rank(&b.0);
        if d != 0 {
            return d.cmp(&0);
        }
        a.0.cmp(&b.0)
    });
    let mut roles = Vec::new();
    for (i, (name, value)) in sorted.iter().enumerate() {
        if i > 0 {
            roles.extend(js(", "));
        }
        roles.extend(name);
        roles.push(b'=' as u16);
        roles.extend(term_text(Some(value)));
    }
    let mut call = c.predicate.clone();
    call.push(b'(' as u16);
    call.extend(roles);
    call.push(b')' as u16);
    if let Some(t) = &c.time {
        call.extend(js(" @"));
        call.extend(term_text(Some(t)));
    }
    let mut parts: Vec<JStr> = Vec::new();
    if c.negated {
        parts.push(js("not"));
    }
    if !modality.is_empty() {
        parts.push(modality);
    }
    parts.push(call);
    let core = parts.join(&(b' ' as u16));
    let mut seq: Vec<JStr> = vec![core];
    seq.extend(c.consequences.iter().map(render_clause));
    let tail = seq.join(&js(" ; ")[..]);
    if c.conditions.is_empty() {
        return tail;
    }
    let conds: Vec<JStr> = c.conditions.iter().map(render_clause).collect();
    let mut out = js("if ");
    out.extend(conds.join(&js(" and ")[..]));
    out.extend(js(" then "));
    out.extend(tail);
    out
}

fn marker(world: &JStr) -> JStr {
    for (w, m) in [("real", "R"), ("fiction", "F"), ("tool", "T"), ("dream", "D"), ("belief", "B"), ("metaphor", "M")] {
        if *world == js(w) {
            return js(m);
        }
    }
    // world.slice(0, 1).toUpperCase()
    let first = world[0];
    match char::decode_utf16([first]).next() {
        Some(Ok(c)) => c.to_uppercase().collect::<String>().encode_utf16().collect(),
        _ => vec![first],
    }
}

/// `renderSem(sem, { profile: 'generic-en-pivot/0.2' }).code` as UTF-16 code units.
pub fn render_sem(sem: &Value) -> Result<JStr, RenderError> {
    let o = validate(sem)?;
    let world = ident(o.get_own("world"));
    let clauses = match o.get_own("clauses") {
        Some(Value::Arr(a)) => a,
        _ => unreachable!("validated"),
    };
    let mut rendered = Vec::new();
    for c in clauses {
        rendered.push(render_clause(&canonical_clause(c)?));
    }
    let mut code = marker(&world);
    code.push(b' ' as u16);
    code.extend(rendered.join(&js(" ; ")[..]));
    Ok(trim(&code))
}

