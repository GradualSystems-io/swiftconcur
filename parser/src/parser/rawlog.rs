use crate::error::Result;
use crate::models::{CodeContext, Warning};
use crate::parser::patterns::categorize_warning;
use lazy_static::lazy_static;
use regex::Regex;
use std::io::BufRead;
use std::path::PathBuf;

lazy_static! {
    // Regex to match Swift compiler warnings in xcodebuild output
    // Matches formats like:
    // /path/to/file.swift:37:24: warning: main actor-isolated property 'count' can not be mutated from a Sendable closure
    // /path/to/File.swift:120:15: warning: Type 'MyClass' does not conform to the 'Sendable' protocol
    static ref WARNING_PATTERN: Regex = Regex::new(
        r"^(?P<file_path>[^:]+\.swift):(?P<line>\d+):(?P<column>\d+):\s*warning:\s*(?P<message>.+)$"
    ).unwrap();
}

pub struct RawLogParser {
    context_lines: usize,
}

impl RawLogParser {
    pub fn new(context_lines: usize) -> Self {
        Self { context_lines }
    }

    /// Parse warnings from raw xcodebuild log text
    pub fn parse_stream<R: BufRead>(&self, reader: R) -> Result<Vec<Warning>> {
        let mut warnings = Vec::new();

        for line_result in reader.lines() {
            let line = line_result?;
            if let Some(warning) = self.parse_warning_line(&line) {
                warnings.push(warning);
            }
        }

        Ok(warnings)
    }

    /// Parse a single line for Swift compiler warnings
    fn parse_warning_line(&self, line: &str) -> Option<Warning> {
        if let Some(captures) = WARNING_PATTERN.captures(line.trim()) {
            let file_path = captures.name("file_path")?.as_str();
            let line_number: usize = captures.name("line")?.as_str().parse().ok()?;
            let column_number: usize = captures.name("column")?.as_str().parse().ok()?;
            let message = captures.name("message")?.as_str().trim();

            // Only process Swift concurrency warnings
            let (warning_type, severity) = categorize_warning(message);
            if warning_type == crate::models::WarningType::Unknown {
                return None;
            }

            // Generate stable warning ID
            let id = format!("{}:{}:{}", file_path, line_number, message.len());

            // Extract code context from file
            let code_context = self.extract_code_context(file_path, line_number);

            Some(Warning {
                id,
                warning_type,
                severity,
                file_path: PathBuf::from(file_path),
                line_number,
                column_number: Some(column_number),
                message: message.to_string(),
                code_context,
                suggested_fix: self.suggest_fix(&warning_type, message),
            })
        } else {
            None
        }
    }

    /// Extract code context around the warning line
    fn extract_code_context(&self, file_path: &str, line_number: usize) -> CodeContext {
        use std::fs::File;
        use std::io::BufReader;

        let mut context = CodeContext {
            before: Vec::new(),
            line: String::new(),
            after: Vec::new(),
        };

        if let Ok(file) = File::open(file_path) {
            let reader = BufReader::new(file);
            let lines: Vec<String> = reader
                .lines()
                .collect::<std::result::Result<Vec<_>, _>>()
                .unwrap_or_default();

            if line_number > 0 && line_number <= lines.len() {
                let target_idx = line_number - 1; // Convert to 0-based

                // Extract before lines
                let start_idx = target_idx.saturating_sub(self.context_lines);
                context.before = lines[start_idx..target_idx].to_vec();

                // Extract target line
                context.line = lines.get(target_idx).cloned().unwrap_or_default();

                // Extract after lines
                let end_idx = std::cmp::min(target_idx + 1 + self.context_lines, lines.len());
                context.after = lines[target_idx + 1..end_idx].to_vec();
            }
        }

        context
    }

    /// Suggest fixes for different warning types
    fn suggest_fix(
        &self,
        warning_type: &crate::models::WarningType,
        message: &str,
    ) -> Option<String> {
        use crate::models::WarningType;

        match warning_type {
            WarningType::ActorIsolation => {
                if message.contains("can not be mutated") || message.contains("cannot be mutated") {
                    Some("Consider using 'await' or @MainActor to safely mutate the actor-isolated property.".to_string())
                } else if message.contains("can not be referenced") || message.contains("cannot be referenced") {
                    Some("Use 'await' to access the actor-isolated member, or move this code into an actor context.".to_string())
                } else if message.contains("Main actor") {
                    Some("Use '@MainActor' annotation or dispatch to the main queue with 'await MainActor.run'.".to_string())
                } else {
                    Some("Ensure proper actor isolation by using 'await' or moving code to appropriate actor context.".to_string())
                }
            }
            WarningType::SendableConformance => {
                if message.contains("does not conform") {
                    Some("Add 'Sendable' conformance to the type or use '@unchecked Sendable' if thread-safe.".to_string())
                } else if message.contains("capture") {
                    Some("Ensure captured values conform to 'Sendable' or restructure to avoid capture.".to_string())
                } else {
                    Some("Review Sendable conformance requirements for concurrent contexts.".to_string())
                }
            }
            WarningType::DataRace => {
                Some("Protect shared mutable state with proper synchronization (actors, locks, or atomic operations).".to_string())
            }
            WarningType::PerformanceRegression => {
                Some("Review async/await usage patterns and consider optimizing concurrency structure.".to_string())
            }
            WarningType::Unknown => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Severity, WarningType};
    use std::io::Cursor;

    #[test]
    fn test_parse_actor_isolation_warning() {
        let log_content = r#"
/Users/runner/work/ConcurCLIDemo/ConcurCLIDemo/ConcurDemo/Item.swift:37:24: warning: main actor-isolated property 'count' can not be mutated from a Sendable closure; this is an error in the Swift 6 language mode
        "#.trim();

        let parser = RawLogParser::new(3);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];

        assert_eq!(warning.warning_type, WarningType::ActorIsolation);
        assert_eq!(warning.severity, Severity::High);
        assert_eq!(warning.line_number, 37);
        assert_eq!(warning.column_number, Some(24));
        assert!(warning.file_path.to_str().unwrap().ends_with("Item.swift"));
        assert!(warning.message.contains("main actor-isolated"));
        assert!(warning.suggested_fix.is_some());
    }

    #[test]
    fn test_parse_sendable_conformance_warning() {
        let log_content = r#"
/test/NetworkService.swift:78:15: warning: Type 'MyClass' does not conform to the 'Sendable' protocol
        "#.trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];

        assert_eq!(warning.warning_type, WarningType::SendableConformance);
        assert_eq!(warning.severity, Severity::High);
        assert_eq!(warning.line_number, 78);
        assert_eq!(warning.column_number, Some(15));
        assert!(warning
            .message
            .contains("does not conform to the 'Sendable'"));
    }

    #[test]
    fn test_parse_data_race_warning() {
        let log_content = r#"
/workspace/src/ConcurrentCode.swift:120:8: warning: data race detected between concurrent accesses to shared mutable state
        "#.trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];

        assert_eq!(warning.warning_type, WarningType::DataRace);
        assert_eq!(warning.severity, Severity::Critical);
        assert_eq!(warning.line_number, 120);
        assert_eq!(warning.column_number, Some(8));
        assert!(warning.message.contains("data race"));
    }

    #[test]
    fn test_ignore_non_swift_files() {
        let log_content = r#"
/test/SomeClass.m:45:12: warning: some objective-c warning
/test/Main.swift:30:5: warning: main actor-isolated property cannot be referenced
/test/header.h:10:1: warning: deprecated function
        "#
        .trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        // Should only find the Swift concurrency warning
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0]
            .file_path
            .to_str()
            .unwrap()
            .contains("Main.swift"));
        assert_eq!(warnings[0].warning_type, WarningType::ActorIsolation);
    }

    #[test]
    fn test_ignore_non_concurrency_warnings() {
        let log_content = r#"
/test/File.swift:25:10: warning: variable 'unused' was never used; consider replacing with '_' or removing it
/test/File.swift:30:5: warning: actor-isolated property 'shared' can not be referenced from a Sendable closure
/test/File.swift:35:8: warning: function 'deprecated()' is deprecated
        "#.trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        // Should only find the actor isolation warning
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].line_number, 30);
        assert_eq!(warnings[0].warning_type, WarningType::ActorIsolation);
    }

    #[test]
    fn test_multiple_warnings() {
        let log_content = r#"
Build started
/project/Actor.swift:42:15: warning: actor-isolated property 'data' can not be referenced from a non-isolated context
Some build output
/project/Service.swift:78:22: warning: Type 'NetworkManager' does not conform to the 'Sendable' protocol
More output
/project/Concurrent.swift:95:10: warning: data race condition detected in shared memory access
Build completed
        "#.trim();

        let parser = RawLogParser::new(1);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 3);

        // Verify all warnings are correctly parsed
        assert_eq!(warnings[0].warning_type, WarningType::ActorIsolation);
        assert_eq!(warnings[0].line_number, 42);

        assert_eq!(warnings[1].warning_type, WarningType::SendableConformance);
        assert_eq!(warnings[1].line_number, 78);

        assert_eq!(warnings[2].warning_type, WarningType::DataRace);
        assert_eq!(warnings[2].line_number, 95);
    }

    #[test]
    fn test_stable_id_generation() {
        let log_content = r#"
/workspace/Sources/MyApp/File.swift:42:15: warning: actor-isolated property 'shared' can not be referenced
        "#.trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];
        let expected_id = format!(
            "{}:{}:{}",
            "/workspace/Sources/MyApp/File.swift",
            42,
            "actor-isolated property 'shared' can not be referenced".len()
        );
        assert_eq!(warning.id, expected_id);
    }

    #[test]
    fn test_malformed_lines() {
        let log_content = r#"
This is not a warning line
File.swift: some incomplete line
/test/File.swift:invalid:25: warning: bad line format
/test/Valid.swift:30:5: warning: actor-isolated property cannot be referenced
        "#
        .trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        // Should only parse the valid warning
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].line_number, 30);
        assert!(warnings[0]
            .file_path
            .to_str()
            .unwrap()
            .contains("Valid.swift"));
    }

    #[test]
    fn test_empty_input() {
        let log_content = "";

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_context_extraction_with_missing_file() {
        let log_content = r#"
/nonexistent/File.swift:42:15: warning: actor-isolated property 'test' can not be referenced
        "#
        .trim();

        let parser = RawLogParser::new(2);
        let cursor = Cursor::new(log_content);
        let warnings = parser.parse_stream(cursor).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];

        // Should handle missing file gracefully
        assert!(warning.code_context.before.is_empty());
        assert!(warning.code_context.line.is_empty());
        assert!(warning.code_context.after.is_empty());
    }

    #[test]
    fn test_suggested_fixes() {
        let test_cases = vec![
            (
                "/test/File.swift:30:5: warning: main actor-isolated property 'count' can not be mutated from a Sendable closure",
                "Consider using 'await' or @MainActor to safely mutate the actor-isolated property."
            ),
            (
                "/test/File.swift:42:8: warning: actor-isolated property 'data' can not be referenced from a non-isolated context", 
                "Use 'await' to access the actor-isolated member, or move this code into an actor context."
            ),
            (
                "/test/File.swift:55:12: warning: Type 'MyClass' does not conform to the 'Sendable' protocol",
                "Add 'Sendable' conformance to the type or use '@unchecked Sendable' if thread-safe."
            ),
            (
                "/test/File.swift:70:20: warning: data race condition detected in concurrent memory access",
                "Protect shared mutable state with proper synchronization (actors, locks, or atomic operations)."
            ),
        ];

        let parser = RawLogParser::new(1);

        for (log_line, expected_fix_snippet) in test_cases {
            let cursor = Cursor::new(log_line);
            let warnings = parser.parse_stream(cursor).unwrap();

            assert_eq!(warnings.len(), 1);
            let fix = warnings[0].suggested_fix.as_ref().unwrap();
            assert!(
                fix.contains(expected_fix_snippet),
                "Expected fix to contain '{}', but got '{}'",
                expected_fix_snippet,
                fix
            );
        }
    }
}
