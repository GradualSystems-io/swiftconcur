use regex::Regex;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct XCMessage {
    #[serde(rename = "type")] kind: String,
    message: String,
}

pub fn find_concurrency_warnings(input: &str) -> Vec<String> {
    // compile once - lazy_static not needed on 1.63+
    static WARN_RE: once_cell::sync::Lazy<Regex> = once_cell::sync::Lazy::new(|| {
        Regex::new(r"(actor-isolated|requires 'Sendable')").unwrap()
    });

    input
        .lines()
        .filter_map(|line| serde_json::from_str::<XCMessage>(line).ok())
        .filter(|m| m.kind == "warning" && WARN_RE.is_match(&m.message))
        .map(|m| m.message)
        .collect()
}