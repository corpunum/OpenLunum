//! Protocol 0.6 vocabulary/aliases and frame registry 0.8, loaded from JSON that
//! `scripts/generate-lfp21-golden.mjs` exports from the TypeScript source (never hand-copied).

use crate::value::{js, parse_json, JStr, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

pub const PROTOCOL_JSON: &str = include_str!("../data/protocol-registry.json");
pub const FRAME_JSON: &str = include_str!("../data/frame-registry.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Field {
    World,
    Kind,
    Predicate,
    Role,
    TermType,
    Modality,
}

pub struct Protocol {
    pub version: String,
    pub predicates: Vec<JStr>,
    lists: HashMap<Field, Vec<JStr>>,
    aliases: HashMap<Field, HashMap<JStr, JStr>>,
}

impl Protocol {
    pub fn values(&self, f: Field) -> &[JStr] {
        &self.lists[&f]
    }
    pub fn alias(&self, f: Field, basic: &JStr) -> Option<&JStr> {
        self.aliases[&f].get(basic)
    }
    pub fn is_predicate(&self, p: &JStr) -> bool {
        self.predicates.contains(p)
    }
}

fn str_list(v: &Value) -> Vec<JStr> {
    match v {
        Value::Arr(a) => a.iter().map(|x| x.as_str().expect("string").clone()).collect(),
        _ => panic!("expected array"),
    }
}

pub fn protocol() -> &'static Protocol {
    static P: OnceLock<Protocol> = OnceLock::new();
    P.get_or_init(|| {
        let v = parse_json(PROTOCOL_JSON).expect("protocol registry json");
        let o = v.as_obj().unwrap();
        let mut lists = HashMap::new();
        let mut aliases = HashMap::new();
        for (f, lk, ak) in [
            (Field::World, "worlds", "world"),
            (Field::Kind, "kinds", "kind"),
            (Field::Predicate, "predicates", "predicate"),
            (Field::Role, "roles", "role"),
            (Field::TermType, "termTypes", "term_type"),
            (Field::Modality, "modalities", "modality"),
        ] {
            lists.insert(f, str_list(o.get_own(lk).unwrap()));
            let mut m = HashMap::new();
            for (k, val) in &o.get_own("aliases").unwrap().as_obj().unwrap().get_own(ak).unwrap().as_obj().unwrap().entries {
                m.insert(k.clone(), val.as_str().unwrap().clone());
            }
            aliases.insert(f, m);
        }
        Protocol {
            version: String::from_utf16(o.get_own("version").unwrap().as_str().unwrap()).unwrap(),
            predicates: lists[&Field::Predicate].clone(),
            lists,
            aliases,
        }
    })
}

pub struct FrameRole {
    pub name: JStr,
    pub required: bool,
    pub allowed_term_types: Option<Vec<JStr>>,
    pub vocabulary_predicate: bool,
    pub list: bool,
    pub lexical_verb: bool,
}

pub struct Frame {
    pub roles: Vec<FrameRole>,
    pub at_least_one_of: Vec<JStr>,
    pub exclusive_groups: Vec<Vec<JStr>>,
    pub required_with: Vec<(JStr, Vec<JStr>)>,
    pub distinct_roles: Vec<(JStr, JStr)>,
}

pub struct Frames {
    pub version: String,
    pub by_predicate: HashMap<JStr, Frame>,
}

fn flag(o: &crate::value::Obj, k: &str) -> bool {
    matches!(o.get_own(k), Some(Value::Bool(true)))
}

pub fn frames() -> &'static Frames {
    static F: OnceLock<Frames> = OnceLock::new();
    F.get_or_init(|| {
        let v = parse_json(FRAME_JSON).expect("frame registry json");
        let o = v.as_obj().unwrap();
        let mut by_predicate = HashMap::new();
        for (name, fv) in &o.get_own("frames").unwrap().as_obj().unwrap().entries {
            let fo = fv.as_obj().unwrap();
            let roles = match fo.get_own("roles").unwrap() {
                Value::Arr(a) => a
                    .iter()
                    .map(|r| {
                        let ro = r.as_obj().unwrap();
                        FrameRole {
                            name: ro.get_own("name").unwrap().as_str().unwrap().clone(),
                            required: flag(ro, "required"),
                            allowed_term_types: ro.get_own("allowedTermTypes").map(str_list),
                            vocabulary_predicate: ro.get_own("vocabulary").map_or(false, |x| x.str_eq("predicate")),
                            list: flag(ro, "list"),
                            lexical_verb: flag(ro, "lexicalVerb"),
                        }
                    })
                    .collect(),
                _ => panic!("roles"),
            };
            let at_least_one_of = fo.get_own("atLeastOneOf").map(str_list).unwrap_or_default();
            let exclusive_groups = match fo.get_own("exclusiveGroups") {
                Some(Value::Arr(a)) => a.iter().map(str_list).collect(),
                _ => vec![],
            };
            let required_with = match fo.get_own("requiredWith") {
                Some(Value::Obj(r)) => r.entries.iter().map(|(k, v)| (k.clone(), str_list(v))).collect(),
                _ => vec![],
            };
            let distinct_roles = match fo.get_own("distinctRoles") {
                Some(Value::Arr(a)) => a
                    .iter()
                    .map(|p| {
                        let l = str_list(p);
                        (l[0].clone(), l[1].clone())
                    })
                    .collect(),
                _ => vec![],
            };
            by_predicate.insert(js(&String::from_utf16(name).unwrap()), Frame { roles, at_least_one_of, exclusive_groups, required_with, distinct_roles });
        }
        Frames { version: String::from_utf16(o.get_own("version").unwrap().as_str().unwrap()).unwrap(), by_predicate }
    })
}
