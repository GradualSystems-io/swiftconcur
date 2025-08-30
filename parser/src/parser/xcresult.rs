use crate::error::Result;
use crate::models::{CodeContext, Warning};
use crate::parser::patterns::categorize_warning;
use lazy_static::lazy_static;
use regex::Regex;
use serde_json::{self, Value};
use std::path::PathBuf;

lazy_static! {
    // Parse file path and line number from Xcode URL formats.
    // Supports: StartingLineNumber, EndingLineNumber, or line=.
    static ref URL_PARSER: Regex = Regex::new(
        r"file://(?P<path>[^#]+)#.*?(StartingLineNumber|EndingLineNumber|line)=(?P<line>\d+)"
    ).unwrap();
}

pub struct XcresultParser {
    context_lines: usize,
}

impl XcresultParser {
    pub fn new(context_lines: usize) -> Self {
        Self { context_lines }
    }

    pub fn parse_json(&self, json_content: &str) -> Result<Vec<Warning>> {
        let value: Value = serde_json::from_str(json_content)?;
        let mut warnings = Vec::new();

        let issues: Vec<Value> = if let Some(arr) = value.get("_values").and_then(|v| v.as_array())
        {
            arr.clone()
        } else if value.is_array() {
            value.as_array().cloned().unwrap_or_default()
        } else {
            return Err(crate::error::ParseError::InvalidFormat(
                "xcresult JSON missing _values array".to_string(),
            ));
        };

        for issue in issues {
            let issue_type = issue
                .get("issueType")
                .and_then(|v| v.get("_value"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !issue_type.to_lowercase().contains("warning") {
                continue;
            }

            let message = issue
                .get("message")
                .and_then(|v| v.get("_value"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let (warning_type, severity) = categorize_warning(&message);
            if warning_type == crate::models::WarningType::Unknown {
                continue;
            }

            // Try multiple location keys and normalize to URL string
            let url = issue
                .get("documentLocationInCreatingWorkspace")
                .and_then(|d| d.get("url"))
                .and_then(|u| u.get("_value"))
                .and_then(|s| s.as_str())
                .or_else(|| {
                    issue
                        .get("documentURL")
                        .and_then(|u| u.get("_value"))
                        .and_then(|s| s.as_str())
                })
                .or_else(|| {
                    issue
                        .get("documentLocation")
                        .and_then(|d| d.get("url"))
                        .and_then(|u| u.get("_value"))
                        .and_then(|s| s.as_str())
                })
                .or_else(|| {
                    issue
                        .get("documentLocationInWorkspace")
                        .and_then(|d| d.get("url"))
                        .and_then(|u| u.get("_value"))
                        .and_then(|s| s.as_str())
                });

            if let Some(url) = url {
                if let Some(captures) = URL_PARSER.captures(url) {
                    let file_path = captures.name("path").unwrap().as_str();
                    let line_number: u32 = captures
                        .name("line")
                        .and_then(|m| m.as_str().parse().ok())
                        .unwrap_or(0);

                    let code_context = self.extract_code_context(file_path, line_number);
                    let id = format!("{}:{}:{}", file_path, line_number, message.len());

                    warnings.push(Warning {
                        id,
                        warning_type,
                        severity,
                        file_path: PathBuf::from(file_path),
                        line_number: line_number as usize,
                        column_number: None,
                        message,
                        code_context,
                        suggested_fix: None,
                    });
                }
            }
        }

        Ok(warnings)
    }

    fn extract_code_context(&self, file_path: &str, line_number: u32) -> CodeContext {
        use std::fs;
        use std::io::{BufRead, BufReader};

        let mut context = CodeContext {
            before: Vec::new(),
            line: String::new(),
            after: Vec::new(),
        };

        if let Ok(file) = fs::File::open(file_path) {
            let reader = BufReader::new(file);
            let lines: Vec<String> = reader
                .lines()
                .collect::<std::result::Result<Vec<_>, _>>()
                .unwrap_or_default();

            if line_number > 0 && (line_number as usize) <= lines.len() {
                let target_line = (line_number - 1) as usize;

                // Get before lines
                let start = target_line.saturating_sub(self.context_lines);

                context.before = lines[start..target_line].to_vec();

                // Get target line
                if target_line < lines.len() {
                    context.line = lines[target_line].clone();
                }

                // Get after lines
                let end = std::cmp::min(target_line + 1 + self.context_lines, lines.len());
                context.after = lines[target_line + 1..end].to_vec();
            }
        }

        context
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Severity, WarningType};

    #[test]
    fn test_parse_xcresult_json() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///Users/test/Item.swift#EndingColumnNumber=23&EndingLineNumber=36&StartingColumnNumber=23&StartingLineNumber=36"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "Main actor-isolated property 'count' can not be mutated from a Sendable closure"
                    }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(3);
        let warnings = parser.parse_json(json_content).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];
        assert_eq!(warning.line_number, 36);
        assert!(warning.file_path.to_str().unwrap().ends_with("Item.swift"));
        assert_eq!(warning.warning_type, WarningType::ActorIsolation);
        assert!(warning.message.contains("Main actor-isolated"));
    }

    #[test]
    fn test_parse_sendable_warning() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test/NetworkService.swift#EndingLineNumber=78&StartingLineNumber=78"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "Type 'MyClass' does not conform to the 'Sendable' protocol"
                    }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];
        assert_eq!(warning.warning_type, WarningType::SendableConformance);
        assert_eq!(warning.severity, Severity::High);
        assert_eq!(warning.line_number, 78);
    }

    #[test]
    fn test_parse_data_race_warning() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test/ConcurrentCode.swift#EndingLineNumber=120&StartingLineNumber=120"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "data race detected: concurrent access to shared mutable state"
                    }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        assert_eq!(warnings.len(), 1);
        let warning = &warnings[0];
        assert_eq!(warning.warning_type, WarningType::DataRace);
        assert_eq!(warning.severity, Severity::Critical);
    }

    #[test]
    fn test_skip_non_warning_issues() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test/Error.swift#EndingLineNumber=25&StartingLineNumber=25"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Error"
                    },
                    "message": {
                        "_value": "Use of unresolved identifier 'undefined'"
                    }
                },
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test/Warning.swift#EndingLineNumber=30&StartingLineNumber=30"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "Variable 'unused' was never used"
                    }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        // Should skip both: error and non-concurrency warning
        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_malformed_json() {
        let parser = XcresultParser::new(2);

        let malformed_json = r#"{"invalid": json}"#;
        assert!(parser.parse_json(malformed_json).is_err());

        let missing_values = r#"{"wrong_structure": []}"#;
        assert!(parser.parse_json(missing_values).is_err());
    }

    #[test]
    fn test_url_parsing_edge_cases() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "invalid-url-format"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "actor-isolated property test"
                    }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        // Should skip warnings with unparseable URLs
        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_empty_xcresult() {
        let json_content = r#"{"_values": []}"#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_multiple_warnings() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test/File1.swift#EndingLineNumber=42&StartingLineNumber=42"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "actor-isolated property 'shared' can not be referenced"
                    }
                },
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test/File2.swift#EndingLineNumber=78&StartingLineNumber=78"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "Type 'MyClass' does not conform to the 'Sendable' protocol"
                    }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        assert_eq!(warnings.len(), 2);
        assert_eq!(warnings[0].warning_type, WarningType::ActorIsolation);
        assert_eq!(warnings[1].warning_type, WarningType::SendableConformance);
    }

    #[test]
    fn test_stable_id_generation() {
        let json_content = r#"
        {
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": { "_value": "file:///workspace/Sources/MyApp/File1.swift#EndingLineNumber=42&StartingLineNumber=42" }
                    },
                    "issueType": { "_value": "Swift Compiler Warning" },
                    "message": { "_value": "actor-isolated property 'shared' can not be referenced" }
                }
            ]
        }
        "#;

        let parser = XcresultParser::new(2);
        let warnings = parser.parse_json(json_content).unwrap();

        assert_eq!(warnings.len(), 1);
        let w = &warnings[0];
        let expected = format!(
            "{}:{}:{}",
            "/workspace/Sources/MyApp/File1.swift",
            42,
            "actor-isolated property 'shared' can not be referenced".len()
        );
        assert_eq!(w.id, expected);
    }
}
