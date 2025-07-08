use regex::Regex;
use serde::Deserialize;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Deserialize)]
struct XCMessage {
    #[serde(rename = "type")] kind: String,
    message: String,
}

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),
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

pub fn find_concurrency_warnings_streaming<R: Read>(reader: R) -> Result<Vec<String>, ParseError> {
    static WARN_RE: once_cell::sync::Lazy<Regex> = once_cell::sync::Lazy::new(|| {
        Regex::new(r"(actor-isolated|requires 'Sendable')").unwrap()
    });

    let mut warnings = Vec::new();
    let buf_reader = BufReader::with_capacity(8192, reader);
    
    for line in buf_reader.lines() {
        let line = line?;
        
        if let Ok(message) = serde_json::from_str::<XCMessage>(&line) {
            if message.kind == "warning" && WARN_RE.is_match(&message.message) {
                warnings.push(message.message);
            }
        }
    }
    
    Ok(warnings)
}

pub fn find_concurrency_warnings_from_file<P: AsRef<Path>>(path: P) -> Result<Vec<String>, ParseError> {
    let file = File::open(path)?;
    find_concurrency_warnings_streaming(file)
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

    #[test]
    fn test_streaming_parser_basic() {
        let input = r#"{"type": "warning", "message": "actor-isolated property 'shared' cannot be referenced from a non-isolated context"}
{"type": "warning", "message": "capture requires 'Sendable' conformance"}"#;
        let cursor = std::io::Cursor::new(input);
        let warnings = find_concurrency_warnings_streaming(cursor).unwrap();
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn test_streaming_parser_large_input() {
        let mut large_input = String::new();
        for i in 0..10000 {
            large_input.push_str(&format!(
                "{{\"type\": \"warning\", \"message\": \"actor-isolated property {i} cannot be used\"}}\n"
            ));
        }
        let cursor = std::io::Cursor::new(large_input);
        let warnings = find_concurrency_warnings_streaming(cursor).unwrap();
        assert_eq!(warnings.len(), 10000);
    }

    #[test]
    fn test_streaming_parser_memory_efficiency() {
        use std::io::Cursor;
        
        let input = r#"{"type": "warning", "message": "actor-isolated property issue"}
{"type": "error", "message": "some error"}
{"type": "warning", "message": "requires 'Sendable' conformance"}"#;
        
        let cursor = Cursor::new(input);
        let warnings = find_concurrency_warnings_streaming(cursor).unwrap();
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn test_file_based_parsing() {
        use std::fs;
        use std::io::Write;
        
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("test_xcodebuild.log");
        
        let content = r#"{"type": "warning", "message": "actor-isolated property 'shared' cannot be referenced"}
{"type": "warning", "message": "capture requires 'Sendable' conformance"}
{"type": "error", "message": "compilation failed"}"#;
        
        {
            let mut file = fs::File::create(&temp_file).unwrap();
            file.write_all(content.as_bytes()).unwrap();
        }
        
        let warnings = find_concurrency_warnings_from_file(&temp_file).unwrap();
        assert_eq!(warnings.len(), 2);
        
        fs::remove_file(&temp_file).unwrap();
    }

    // Error handling tests
    #[test]
    fn test_file_not_found_error() {
        let result = find_concurrency_warnings_from_file("/nonexistent/path/file.log");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ParseError::Io(_)));
    }

    #[test]
    fn test_streaming_with_io_error() {
        struct FailingReader;
        impl Read for FailingReader {
            fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("simulated IO error"))
            }
        }
        
        let result = find_concurrency_warnings_streaming(FailingReader);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ParseError::Io(_)));
    }

    #[test]
    fn test_empty_file() {
        use std::fs;
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("empty_test.log");
        
        {
            let _file = fs::File::create(&temp_file).unwrap();
        }
        
        let warnings = find_concurrency_warnings_from_file(&temp_file).unwrap();
        assert_eq!(warnings.len(), 0);
        
        fs::remove_file(&temp_file).unwrap();
    }

    // Regex pattern edge cases
    #[test]
    fn test_regex_case_sensitivity() {
        let input = r#"{"type": "warning", "message": "ACTOR-ISOLATED property issue"}
{"type": "warning", "message": "requires 'sendable' conformance"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 0); // Should be case sensitive
    }

    #[test]
    fn test_regex_partial_matches() {
        let input = r#"{"type": "warning", "message": "non-actor-isolated property issue"}
{"type": "warning", "message": "requires 'Sendable' conformance but something else"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 2); // Both should match as regex finds partial matches
    }

    #[test]
    fn test_regex_boundary_conditions() {
        let input = r#"{"type": "warning", "message": "actor-isolated"}
{"type": "warning", "message": "requires 'Sendable'"}
{"type": "warning", "message": "actor-isolatedproperty"}
{"type": "warning", "message": "requires'Sendable'conformance"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 3); // First 3 should match, last one doesn't have space before 'Sendable'
    }

    // JSON structure variations
    #[test]
    fn test_json_with_extra_fields() {
        let input = r#"{"type": "warning", "message": "actor-isolated property issue", "level": "error", "file": "test.swift"}
{"type": "warning", "message": "requires 'Sendable' conformance", "timestamp": "2024-01-01"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn test_json_with_missing_fields() {
        let input = r#"{"type": "warning"}
{"message": "actor-isolated property issue"}
{"type": "warning", "message": "requires 'Sendable' conformance"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 1); // Only the complete message should be processed
    }

    #[test]
    fn test_json_with_different_type_values() {
        let input = r#"{"type": "WARNING", "message": "actor-isolated property issue"}
{"type": "warn", "message": "requires 'Sendable' conformance"}
{"type": "warning", "message": "actor-isolated property issue"}
{"type": "error", "message": "actor-isolated property issue"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 1); // Only exact "warning" type should match
    }

    #[test]
    fn test_json_with_unicode_and_escape_sequences() {
        let input = r#"{"type": "warning", "message": "actor-isolated property 'café' cannot be used"}
{"type": "warning", "message": "capture requires 'Sendable' conformance in \"MyClass\""}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn test_mixed_valid_invalid_json_lines() {
        let input = r#"{"type": "warning", "message": "actor-isolated property issue"}
not valid json
{"type": "warning", "message": "requires 'Sendable' conformance"}
{"type": "warning", "message": "actor-isolated property issue", "extra": }
{"type": "warning", "message": "another actor-isolated issue"}"#;
        let warnings = find_concurrency_warnings(input);
        assert_eq!(warnings.len(), 3); // Should skip invalid lines
    }

    // Performance and stress tests
    #[test]
    fn test_very_long_message() {
        let long_message = "a".repeat(10000) + "actor-isolated property issue";
        let input = format!(r#"{{"type": "warning", "message": "{long_message}"}}"#);
        let warnings = find_concurrency_warnings(&input);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].len() > 10000);
    }

    #[test]
    fn test_many_non_matching_lines() {
        let mut input = String::new();
        for i in 0..1000 {
            input.push_str(&format!(
                "{{\"type\": \"warning\", \"message\": \"unrelated warning {i}\"}}\n"
            ));
        }
        input.push_str(r#"{"type": "warning", "message": "actor-isolated property issue"}"#);
        
        let warnings = find_concurrency_warnings(&input);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn test_streaming_consistency() {
        let input = r#"{"type": "warning", "message": "actor-isolated property 'shared' cannot be referenced"}
{"type": "warning", "message": "capture requires 'Sendable' conformance"}
{"type": "error", "message": "compilation failed"}"#;
        
        let string_warnings = find_concurrency_warnings(input);
        let cursor = std::io::Cursor::new(input);
        let streaming_warnings = find_concurrency_warnings_streaming(cursor).unwrap();
        
        assert_eq!(string_warnings.len(), streaming_warnings.len());
        assert_eq!(string_warnings, streaming_warnings);
    }

    #[test]
    fn test_parse_error_display() {
        let io_error = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let parse_error = ParseError::Io(io_error);
        let error_string = format!("{parse_error}");
        assert!(error_string.contains("IO error"));
        assert!(error_string.contains("file not found"));
    }

    #[test]
    fn test_xcmessage_debug_format() {
        let msg = XCMessage {
            kind: "warning".to_string(),
            message: "test message".to_string(),
        };
        let debug_string = format!("{msg:?}");
        assert!(debug_string.contains("warning"));
        assert!(debug_string.contains("test message"));
    }
}