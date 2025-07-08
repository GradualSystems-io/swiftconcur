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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_concurrency_warnings_with_actor_isolated() {
        let input = r#"{"type": "warning", "message": "actor-isolated property 'shared' cannot be referenced from a non-isolated context"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("actor-isolated"));
    }

    #[test]
    fn test_find_concurrency_warnings_with_sendable() {
        let input = r#"{"type": "warning", "message": "capture of 'self' with non-sendable type requires 'Sendable' conformance"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("requires 'Sendable'"));
    }

    #[test]
    fn test_find_concurrency_warnings_multiple_lines() {
        let input = r#"{"type": "warning", "message": "actor-isolated property cannot be used"}
{"type": "warning", "message": "capture requires 'Sendable' conformance"}
{"type": "error", "message": "some error message"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn test_find_concurrency_warnings_no_matches() {
        let input = r#"{"type": "warning", "message": "unused variable warning"}
{"type": "error", "message": "compilation error"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_find_concurrency_warnings_invalid_json() {
        let input = r#"invalid json line
{"type": "warning", "message": "actor-isolated property issue"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn test_find_concurrency_warnings_empty_input() {
        let warnings = find_concurrency_warnings("");
        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_find_concurrency_warnings_non_warning_types() {
        let input = r#"{"type": "error", "message": "actor-isolated property cannot be used"}
{"type": "note", "message": "requires 'Sendable' conformance"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 0);
    }
}