//! lfp:2.1 pipeline, mirroring `semanticFingerprint` in packages/core/src/fingerprint.ts:
//! validateSem -> normalizeSemanticCandidate(strict) -> canonicalizeSem -> validateSemFrames
//! -> semanticIdentityProjection -> stableStringify -> sha256 -> first N hex.
//!
//! Normalization and canonicalization are fused (the TypeScript runs them back to back and
//! the intermediate `basic` canonicalization is discarded). In strict mode any normalization
//! issue other than an applied alias makes the Sem non-canonical, which `semanticFingerprint`
//! rejects, so every "issue" below is simply a rejection.

use crate::jsstr::*;
use crate::registry::{frames, protocol, Field, Frame};
use crate::value::{js, JStr, Obj, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq)]
pub struct Reject(pub String);

type R<T> = Result<T, Reject>;

fn rej<T>(m: impl Into<String>) -> R<T> {
    Err(Reject(m.into()))
}

pub const SEM_SCHEMA: &str = "lunum-sem/0.1-draft";
/// Frozen identity-projection tag (fingerprint.ts:79). Not the registry version.
pub const PROJECTION_PROTOCOL: &str = "lunum-protocol/0.1";

// ---------------------------------------------------------------- canonical model

#[derive(Debug, Clone)]
pub struct Clause {
    pub predicate: JStr,
    /// Sorted by key.
    pub roles: Vec<(JStr, Value)>,
    pub negated: bool,
    pub modality: Option<JStr>,
    pub time: Option<Value>,
    pub conditions: Vec<Clause>,
    pub consequences: Vec<Clause>,
}

#[derive(Debug, Clone)]
pub struct Sem {
    pub world: JStr,
    pub kind: JStr,
    pub clauses: Vec<Clause>,
    pub references: Vec<Value>,
}

// ---------------------------------------------------------------- validateSem

fn is_object(v: &Value) -> bool {
    matches!(v, Value::Obj(_))
}

fn truthy_string_of(v: Option<&Value>) -> bool {
    !trim(&to_js_string_or_empty(v)).is_empty()
}

fn has_forbidden_key(v: &Value) -> bool {
    match v {
        Value::Arr(a) => a.iter().any(has_forbidden_key),
        Value::Obj(o) => o.entries.iter().any(|(k, val)| {
            [js("__proto__"), js("constructor"), js("prototype")].contains(k) || has_forbidden_key(val)
        }),
        _ => false,
    }
}

fn validate_sem(v: &Value) -> R<&Obj> {
    let o = match v {
        Value::Obj(o) => o,
        _ => return rej("sem must be an object"),
    };
    if has_forbidden_key(v) {
        return rej("forbidden key: __proto__, constructor and prototype are not allowed at any depth");
    }
    if !matches!(o.get("schema"), Some(Value::Str(s)) if *s == js(SEM_SCHEMA)) {
        return rej("schema must equal lunum-sem/0.1-draft");
    }
    if !truthy_string_of(o.get("world")) {
        return rej("world is required");
    }
    if !truthy_string_of(o.get("kind")) {
        return rej("kind is required");
    }
    match o.get("clauses") {
        Some(Value::Arr(c)) if !c.is_empty() => {
            for clause in c {
                match clause {
                    Value::Obj(co) => {
                        if !truthy_string_of(co.get("predicate")) {
                            return rej("clause predicate is required");
                        }
                        if !matches!(co.get("roles"), Some(Value::Obj(_))) {
                            return rej("clause roles must be an object");
                        }
                    }
                    _ => return rej("clause must be an object"),
                }
            }
        }
        _ => return rej("clauses must be a non-empty array"),
    }
    match o.get("references") {
        None => {}
        Some(Value::Arr(items)) => {
            if !items.iter().all(is_object) {
                return rej("references[] must be objects");
            }
        }
        Some(_) => return rej("references must be an array"),
    }
    Ok(o)
}

// ---------------------------------------------------------------- canonical value forms

fn normalize_identifier_value(v: Option<&Value>) -> JStr {
    basic_identifier(&to_js_string_or_empty(v))
}

/// canonicalize.ts `canonicalUnknown`.
fn canonical_unknown(v: &Value) -> Value {
    match v {
        Value::Null | Value::Bool(_) | Value::Num(_) => v.clone(),
        Value::Str(s) => Value::Str(normalize_text_str(s)),
        Value::Arr(a) => Value::Arr(a.iter().map(canonical_unknown).collect()),
        Value::Obj(o) => {
            let mut out = Obj::new();
            for (k, item) in o.sorted_entries().into_iter().map(|e| (&e.0, &e.1)) {
                let id_like = [js("id"), js("type"), js("ref"), js("language")];
                if id_like.contains(k) {
                    out.assign(k.clone(), Value::Str(normalize_identifier_value(Some(item))));
                } else {
                    out.assign(k.clone(), canonical_unknown(item));
                }
            }
            Value::Obj(out)
        }
    }
}

// ---------------------------------------------------------------- normalization

fn map_symbol(value: &Value, field: Field) -> R<JStr> {
    let s = match value {
        Value::Str(s) => s,
        _ => return rej("protocol field must be a string"),
    };
    let p = protocol();
    let basic = basic_identifier(s);
    let normalized = p.alias(field, &basic).cloned().unwrap_or(basic);
    if !p.values(field).contains(&normalized) {
        // unknown_protocol_symbol or x- extension_symbol: non-canonical either way.
        return rej(format!("{:?} symbol '{}' is not a registered protocol symbol", field, String::from_utf16_lossy(&normalized)));
    }
    Ok(normalized)
}

fn normalize_term(term: &Value) -> R<Value> {
    match term {
        Value::Arr(items) => Ok(Value::Arr(items.iter().map(normalize_term).collect::<R<Vec<_>>>()?)),
        Value::Obj(o) => {
            let mut out = o.clone();
            if let Some(Value::Str(_)) = o.get_own("type") {
                let t = map_symbol(o.get_own("type").unwrap(), Field::TermType)?;
                out.insert_own(js("type"), Value::Str(t));
            }
            if let Some(Value::Str(id)) = o.get_own("id") {
                if trim(id).is_empty() {
                    return rej("empty instance identifier cannot establish identity");
                }
            }
            if let Some(Value::Arr(items)) = o.get_own("value") {
                let n = items.iter().map(normalize_term).collect::<R<Vec<_>>>()?;
                out.insert_own(js("value"), Value::Arr(n));
            }
            Ok(Value::Obj(out))
        }
        other => Ok(other.clone()),
    }
}

fn is_falsy(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Bool(b) => !b,
        Value::Num(n) => *n == 0.0 || n.is_nan(),
        Value::Str(s) => s.is_empty(),
        _ => false,
    }
}

fn nested_clauses(clause: &Obj, key: &str) -> R<Vec<Clause>> {
    match clause.get_own(key) {
        None => Ok(vec![]),
        Some(Value::Arr(items)) => items.iter().map(normalize_clause).collect(),
        Some(v) if is_falsy(v) => Ok(vec![]),
        Some(_) => rej(format!("{key}.map is not a function")),
    }
}

/// `Object.entries(clause.roles ?? {})`
fn role_entries(roles: Option<&Value>) -> Vec<(JStr, Value)> {
    match roles {
        Some(Value::Obj(o)) => o.entries.clone(),
        Some(Value::Arr(a)) => a.iter().enumerate().map(|(i, v)| (js(&i.to_string()), v.clone())).collect(),
        Some(Value::Str(s)) => char::decode_utf16(s.iter().copied())
            .enumerate()
            .map(|(i, _)| (js(&i.to_string()), Value::Null))
            .collect(),
        _ => vec![],
    }
}

fn normalize_clause(clause: &Value) -> R<Clause> {
    let c = match clause {
        Value::Obj(o) => o,
        _ => return rej("clause must be an object (predicate.normalize is not a function)"),
    };
    let mut roles: Vec<(JStr, Value)> = Vec::new();
    for (raw_role, term) in role_entries(c.get_own("roles")) {
        let role = map_symbol(&Value::Str(raw_role), Field::Role)?;
        if roles.iter().any(|(k, _)| *k == role) {
            return rej("role collides with another role after protocol normalization");
        }
        let v = if role == js("action") && matches!(term, Value::Str(_)) {
            Value::Str(map_symbol(&term, Field::Predicate)?)
        } else {
            normalize_term(&term)?
        };
        roles.push((role, v));
    }
    let raw_pred = match c.get_own("predicate") {
        Some(Value::Str(s)) => s,
        _ => return rej("predicate must be a string"),
    };
    let raw_basic = basic_identifier(raw_pred);
    let predicate = map_symbol(&Value::Str(raw_pred.clone()), Field::Predicate)?;
    if raw_basic == js("keep_private") {
        match roles.iter().find(|(k, _)| *k == js("visibility")) {
            Some((_, v)) if !v.str_eq("private") => return rej("keep_private conflicts with an explicit non-private visibility"),
            Some(_) => {}
            None => roles.push((js("visibility"), Value::Str(js("private")))),
        }
    }
    let modality = match c.get_own("modality") {
        None | Some(Value::Null) => None,
        Some(v) => Some(map_symbol(v, Field::Modality)?),
    };
    let negative_deontic = matches!(c.get_own("modality"), Some(Value::Str(s)) if ["must_not", "shall_not", "prohibited", "forbidden"].iter().any(|x| basic_identifier(s) == js(x)));
    let raw_negated = matches!(c.get_own("negated"), Some(Value::Bool(true)));
    if negative_deontic && raw_negated {
        return rej("negative modality and negated=true duplicate the prohibition encoding");
    }
    let time = match c.get_own("time") {
        None | Some(Value::Null) => None,
        Some(t) => Some(canonical_unknown(&normalize_term(t)?)),
    };
    let conditions = nested_clauses(c, "conditions")?;
    let consequences = nested_clauses(c, "consequences")?;

    // canonicalClause
    let mut canon_roles: Vec<(JStr, Value)> = roles
        .into_iter()
        .map(|(k, v)| (basic_identifier(&k), canonical_unknown(&v)))
        .collect();
    canon_roles.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(Clause {
        predicate: basic_identifier(&predicate),
        roles: canon_roles,
        negated: negative_deontic || raw_negated,
        modality: modality.map(|m| basic_identifier(&m)),
        time,
        conditions,
        consequences,
    })
}

fn is_safe_integer(v: &Value) -> bool {
    matches!(v, Value::Num(n) if n.is_finite() && n.fract() == 0.0 && n.abs() <= 9007199254740991.0)
}

fn normalize_references(list: &[Value]) -> R<Vec<Value>> {
    let mut out = Vec::new();
    for r in list {
        let o = r.as_obj().unwrap();
        let mut copy = o.clone();
        match o.get_own("referenceKind") {
            None => {}
            Some(k) if k.str_eq("semantic") || k.str_eq("surface-evidence") => {}
            Some(_) => return rej("referenceKind must be semantic or surface-evidence"),
        }
        if matches!(o.get_own("referenceKind"), Some(k) if k.str_eq("surface-evidence")) {
            match o.get_own("sourceRef") {
                Some(Value::Str(s)) if !trim(s).is_empty() => {}
                _ => return rej("surface-evidence requires sourceRef"),
            }
            if !matches!(o.get_own("surface"), Some(Value::Str(_))) {
                return rej("surface-evidence requires surface text");
            }
            let ok = match o.get_own("span") {
                Some(Value::Obj(sp)) => match (sp.get_own("start"), sp.get_own("end")) {
                    (Some(s), Some(e)) if is_safe_integer(s) && is_safe_integer(e) => {
                        let (Value::Num(s), Value::Num(e)) = (s, e) else { unreachable!() };
                        *s >= 0.0 && *e > *s
                    }
                    _ => false,
                },
                _ => false,
            };
            if !ok {
                return rej("surface-evidence requires a valid half-open span");
            }
            out.push(Value::Obj(copy));
            continue;
        }
        let grounded = match (o.get_own("ref"), o.get_own("id")) {
            (Some(Value::Str(r)), _) => r.clone(),
            (_, Some(Value::Str(i))) => i.clone(),
            _ => Vec::new(),
        };
        if trim(&grounded).is_empty() {
            return rej("reference has no grounded ref or id and cannot establish exact identity");
        }
        if let Some(Value::Str(r)) = o.get_own("ref") {
            copy.insert_own(js("ref"), Value::Str(basic_identifier(r)));
        }
        if let Some(Value::Str(i)) = o.get_own("id") {
            copy.insert_own(js("id"), Value::Str(basic_identifier(i)));
        }
        out.push(Value::Obj(copy));
    }
    Ok(out)
}

/// validateSem + normalizeSemanticCandidate(strict) + canonicalizeSem.
pub fn canonical_sem(v: &Value) -> R<Sem> {
    let o = validate_sem(v)?;
    let world = map_symbol(o.get("world").unwrap(), Field::World)?;
    let kind = map_symbol(o.get("kind").unwrap(), Field::Kind)?;
    let clauses = match o.get("clauses") {
        Some(Value::Arr(c)) => c.iter().map(normalize_clause).collect::<R<Vec<_>>>()?,
        _ => unreachable!(),
    };
    let references = match o.get("references") {
        Some(Value::Arr(items)) => normalize_references(items)?.iter().map(canonical_unknown).collect(),
        _ => vec![],
    };
    Ok(Sem { world: basic_identifier(&world), kind: basic_identifier(&kind), clauses, references })
}

// ---------------------------------------------------------------- frame validation

fn get_term_type(term: &Value) -> Option<JStr> {
    match term {
        Value::Obj(o) => match o.get("type") {
            Some(Value::Str(s)) => Some(basic_identifier(s)),
            _ => None,
        },
        _ => None,
    }
}

fn identity_key(term: Option<&Value>) -> JStr {
    match term {
        Some(Value::Obj(o)) => {
            let pick = ["id", "ref", "value"].iter().find_map(|k| match o.get(k) {
                None | Some(Value::Null) => None,
                Some(v) => Some(v),
            });
            basic_identifier(&to_js_string_or_empty(pick))
        }
        other => basic_identifier(&to_js_string_or_empty(other)),
    }
}

fn is_placeholder_term(term: &Value, predicate: &JStr) -> bool {
    match term {
        Value::Str(s) => basic_identifier(s) == *predicate,
        Value::Obj(o) => {
            match o.get("id") {
                None | Some(Value::Null) => {}
                Some(Value::Str(s)) if s.is_empty() => {}
                Some(_) => return false,
            }
            let all_empty = o.entries.iter().all(|(k, v)| *k == js("type") || matches!(v, Value::Null) || matches!(v, Value::Str(s) if s.is_empty()));
            if all_empty {
                return true;
            }
            let value = match o.get("value") {
                Some(Value::Str(s)) => basic_identifier(s),
                _ => return false,
            };
            value == *predicate || matches!(o.get("type"), Some(Value::Str(t)) if value == basic_identifier(t))
        }
        _ => false,
    }
}

const COPULA_WORDS: &[&str] = &["is", "are", "was", "were", "be", "been", "being", "am", "is_a", "is_an"];

fn is_word_char(c: u32) -> bool {
    c == 0x5f || (0x30..=0x39).contains(&c) || (0x41..=0x5a).contains(&c) || (0x61..=0x7a).contains(&c)
}

fn is_boundary(c: &[u32], i: usize) -> bool {
    let a = i > 0 && is_word_char(c[i - 1]);
    let b = i < c.len() && is_word_char(c[i]);
    a != b
}

fn replace_lit(c: &[u32], lead_b: bool, alts: &[&str], trail_b: bool, repl: &str) -> Vec<u32> {
    let alts: Vec<Vec<u32>> = alts.iter().map(|a| a.chars().map(|x| x as u32).collect()).collect();
    let repl: Vec<u32> = repl.chars().map(|x| x as u32).collect();
    let mut out = Vec::with_capacity(c.len());
    let mut i = 0;
    while i < c.len() {
        let mut hit = None;
        if !lead_b || is_boundary(c, i) {
            for a in &alts {
                if c.len() >= i + a.len() && c[i..i + a.len()] == a[..] && (!trail_b || is_boundary(c, i + a.len())) {
                    hit = Some(a.len());
                    break;
                }
            }
        }
        match hit {
            Some(n) => {
                out.extend_from_slice(&repl);
                i += n;
            }
            None => {
                out.push(c[i]);
                i += 1;
            }
        }
    }
    out
}

fn code_points(s: &[u16]) -> Vec<u32> {
    char::decode_utf16(s.iter().copied()).map(|r| match r {
        Ok(c) => c as u32,
        Err(e) => e.unpaired_surrogate() as u32,
    }).collect()
}

/// source-bound.ts `wordTokens`.
fn word_tokens(text: &[u16]) -> Vec<Vec<u32>> {
    let mut c = code_points(&lower(&nfkc(text)));
    c = replace_lit(&c, true, &["can't", "can\u{2019}t"], true, "cannot");
    c = replace_lit(&c, true, &["won't", "won\u{2019}t"], true, "will not");
    c = replace_lit(&c, false, &["n't", "n\u{2019}t"], true, " not");
    c = replace_lit(&c, false, &["'ll", "\u{2019}ll"], true, " will");
    c = replace_lit(&c, false, &["'d", "\u{2019}d"], true, " would");
    c = replace_lit(&c, false, &["'s", "'m", "'re", "'ve", "\u{2019}s", "\u{2019}m", "\u{2019}re", "\u{2019}ve"], true, " ");
    let mut tokens = Vec::new();
    let mut cur = Vec::new();
    for &cp in &c {
        if in_letter_number(cp) {
            cur.push(cp);
        } else if !cur.is_empty() {
            tokens.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        tokens.push(cur);
    }
    tokens
}

fn is_copula_only(text: &[u16]) -> bool {
    let words = word_tokens(text);
    !words.is_empty()
        && words.iter().all(|w| {
            let s: Option<String> = w.iter().map(|&x| char::from_u32(x)).collect();
            matches!(s, Some(s) if COPULA_WORDS.contains(&s.as_str()))
        })
}

fn clause_frame_valid(clause: &Clause) -> bool {
    let reg = protocol();
    let predicate = basic_identifier(&clause.predicate);
    let frame: &Frame = match frames().by_predicate.get(&predicate) {
        Some(f) => f,
        None => return !reg.is_predicate(&predicate), // unframed_predicate
    };
    let role_map: Vec<(JStr, &Value)> = clause.roles.iter().map(|(k, v)| (basic_identifier(k), v)).collect();
    let has = |name: &JStr| role_map.iter().any(|(k, _)| k == name);
    let get = |name: &JStr| role_map.iter().find(|(k, _)| k == name).map(|(_, v)| *v);

    if clause.modality.as_ref() == Some(&js("permission")) && clause.negated {
        return false;
    }
    for group in &frame.exclusive_groups {
        if group.iter().filter(|r| has(r)).count() > 1 {
            return false;
        }
    }
    if clause.time.is_some() && has(&js("time")) {
        return false;
    }
    if predicate == js("delete") && !["theme", "object", "target"].iter().any(|r| has(&js(r))) {
        return false;
    }
    let registered_roles = reg.values(Field::Role);
    for (role, _) in &role_map {
        if !registered_roles.contains(role) {
            return false;
        }
        if !frame.roles.iter().any(|r| r.name == *role) {
            return false;
        }
    }
    for (_, term) in &role_map {
        if is_placeholder_term(term, &predicate) {
            return false;
        }
    }
    for req in &frame.roles {
        if req.required && !has(&req.name) {
            return false;
        }
        if let Some(value) = get(&req.name) {
            if req.vocabulary_predicate {
                let ok = matches!(value, Value::Str(s) if *s == basic_identifier(s) && reg.is_predicate(s));
                if !ok {
                    return false;
                }
            }
            if req.list {
                let ok = matches!(value, Value::Arr(items) if items.len() >= 2 && !items.iter().any(|i| is_placeholder_term(i, &predicate)));
                if !ok {
                    return false;
                }
            }
            if req.lexical_verb {
                let text: JStr = match value {
                    Value::Str(s) => s.clone(),
                    Value::Obj(o) => match o.get("value") {
                        Some(Value::Str(s)) => s.clone(),
                        _ => Vec::new(),
                    },
                    _ => Vec::new(),
                };
                if trim(&text).is_empty() || is_copula_only(&text) {
                    return false;
                }
            }
            if let Some(allowed) = &req.allowed_term_types {
                match get_term_type(value) {
                    Some(t) if allowed.contains(&t) => {}
                    _ => return false,
                }
            }
        }
    }
    for (trigger, dependents) in &frame.required_with {
        if has(trigger) && dependents.iter().any(|d| !has(d)) {
            return false;
        }
    }
    for (l, r) in &frame.distinct_roles {
        if has(l) && has(r) && identity_key(get(l)) == identity_key(get(r)) {
            return false;
        }
    }
    if !frame.at_least_one_of.is_empty() && !frame.at_least_one_of.iter().any(|r| has(r)) {
        return false;
    }
    true
}

fn clauses_frame_valid(clauses: &[Clause]) -> bool {
    clauses.iter().all(|c| clause_frame_valid(c) & clauses_frame_valid(&c.conditions) & clauses_frame_valid(&c.consequences))
}

// ---------------------------------------------------------------- identity projection

const IDENTITY_TERM_FIELDS: &[&str] = &["type", "id", "ref", "value", "unit", "min", "max", "format"];
const EVIDENCE_TERM_FIELDS: &[&str] = &["language", "token", "surface", "span", "sourceSpan", "provenance", "provider", "metadata"];

fn identity_term(term: &Value) -> R<Value> {
    match term {
        Value::Arr(items) => Ok(Value::Arr(items.iter().map(identity_term).collect::<R<Vec<_>>>()?)),
        Value::Obj(o) => {
            for k in o.own_keys() {
                let known = IDENTITY_TERM_FIELDS.iter().chain(EVIDENCE_TERM_FIELDS.iter()).any(|f| *k == js(f));
                if !known {
                    return rej("Cannot compute semantic identity: unclassified term field");
                }
            }
            let mut out = Obj::new();
            for key in ["type", "id", "ref", "unit", "min", "max", "format", "value"] {
                if let Some(val) = o.get(key) {
                    let v = if key == "value" {
                        identity_term(val)?
                    } else if ["type", "id", "ref", "unit", "format"].contains(&key) {
                        match val {
                            Value::Str(s) => Value::Str(basic_identifier(s)),
                            other => other.clone(),
                        }
                    } else {
                        val.clone()
                    };
                    out.insert_own(js(key), v);
                }
            }
            Ok(Value::Obj(out))
        }
        other => Ok(other.clone()),
    }
}

fn identity_clause(clause: &Clause) -> R<Value> {
    let mut roles = Obj::new();
    for (k, v) in &clause.roles {
        roles.insert_own(k.clone(), identity_term(v)?);
    }
    let mut out = Obj::new();
    out.insert_own(js("predicate"), Value::Str(clause.predicate.clone()));
    out.insert_own(js("roles"), Value::Obj(roles));
    out.insert_own(js("negated"), Value::Bool(clause.negated));
    if let Some(m) = &clause.modality {
        out.insert_own(js("modality"), Value::Str(m.clone()));
    }
    if let Some(t) = &clause.time {
        out.insert_own(js("time"), identity_term(t)?);
    }
    if !clause.conditions.is_empty() {
        out.insert_own(js("conditions"), Value::Arr(clause.conditions.iter().map(identity_clause).collect::<R<Vec<_>>>()?));
    }
    if !clause.consequences.is_empty() {
        out.insert_own(js("consequences"), Value::Arr(clause.consequences.iter().map(identity_clause).collect::<R<Vec<_>>>()?));
    }
    Ok(Value::Obj(out))
}

/// `semanticIdentityProjection` for a canonical Sem.
pub fn identity_projection(sem: &Sem) -> R<Value> {
    let mut refs: BTreeSet<JStr> = BTreeSet::new();
    for r in &sem.references {
        let o = match r {
            Value::Obj(o) => o,
            _ => continue,
        };
        if matches!(o.get("referenceKind"), Some(k) if k.str_eq("surface-evidence")) {
            continue;
        }
        let pick = |k: &str| match o.get(k) {
            Some(Value::Str(s)) => trim(s),
            _ => Vec::new(),
        };
        let ref_ = pick("ref");
        let grounded = if !ref_.is_empty() { ref_ } else { pick("id") };
        if !grounded.is_empty() {
            refs.insert(lower(&replace_ws_runs(&nfkc(&grounded), b'_' as u16)));
        }
    }
    let mut out = Obj::new();
    out.insert_own(js("protocol"), Value::Str(js(PROJECTION_PROTOCOL)));
    out.insert_own(js("schema"), Value::Str(js(SEM_SCHEMA)));
    out.insert_own(js("world"), Value::Str(sem.world.clone()));
    out.insert_own(js("kind"), Value::Str(sem.kind.clone()));
    out.insert_own(js("clauses"), Value::Arr(sem.clauses.iter().map(identity_clause).collect::<R<Vec<_>>>()?));
    if !refs.is_empty() {
        out.insert_own(
            js("references"),
            Value::Arr(refs.into_iter().map(|r| {
                let mut o = Obj::new();
                o.insert_own(js("ref"), Value::Str(r));
                Value::Obj(o)
            }).collect()),
        );
    }
    Ok(Value::Obj(out))
}

/// The exact string that gets hashed (`stableStringify(semanticIdentityProjection(canonical))`), or the rejection.
pub fn projection_bytes(sem: &Value) -> R<String> {
    let canonical = canonical_sem(sem)?;
    if !clauses_frame_valid(&canonical.clauses) {
        return rej("Cannot compute semantic identity for frame-invalid Sem");
    }
    let projection = identity_projection(&canonical)?;
    let mut s = String::new();
    stable_stringify(&projection, &mut s);
    Ok(s)
}

fn bounded_length(length: f64) -> Option<usize> {
    // Math.max(16, Math.min(64, Math.trunc(length))); NaN propagates and slice(0, NaN) is empty.
    if length.is_nan() {
        return Some(0);
    }
    Some(length.trunc().min(64.0).max(16.0) as usize)
}

/// `semanticFingerprint(sem, { length })`; `None` = default 32.
pub fn semantic_fingerprint(sem: &Value, length: Option<f64>) -> R<String> {
    let bytes = projection_bytes(sem)?;
    let digest = Sha256::digest(bytes.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    let n = bounded_length(length.unwrap_or(32.0)).unwrap();
    Ok(format!("lfp:2.1:sha256:{}", &hex[..n.min(hex.len())]))
}
