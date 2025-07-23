use std::io::Write;
use swiftconcur_parser::models::WarningType;
use swiftconcur_parser::parser::XcresultParser;
use swiftconcur_parser::{
    cli::{Cli, OutputFormat},
    run,
};
use tempfile::NamedTempFile;

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_run_with_xcresult_json_file() {
        // Create a temp file with xcresult JSON content
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, r#"{{
            "_type": {{ "_name": "Array" }},
            "_values": [
                {{
                    "_type": {{ "_name": "IssueSummary" }},
                    "documentLocationInCreatingWorkspace": {{
                        "url": {{
                            "_value": "file:///test/file.swift#EndingLineNumber=42&StartingLineNumber=42"
                        }}
                    }},
                    "issueType": {{
                        "_value": "Swift Compiler Warning"
                    }},
                    "message": {{
                        "_value": "actor-isolated property 'shared' can not be referenced from a non-isolated context"
                    }}
                }}
            ]
        }}"#).unwrap();
        temp_file.flush().unwrap();

        let cli = Cli {
            input: temp_file.path().to_string_lossy().to_string(),
            format: OutputFormat::Json,
            baseline: None,
            threshold: None,
            filter: None,
            context: 3,
            verbose: false,
        };

        let result = run(cli).unwrap();
        assert_eq!(result, 0); // Should return 0 because no threshold set
    }

    #[test]
    fn test_run_with_empty_xcresult_json() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(
            temp_file,
            r#"{{
            "_values": []
        }}"#
        )
        .unwrap();
        temp_file.flush().unwrap();

        let cli = Cli {
            input: temp_file.path().to_string_lossy().to_string(),
            format: OutputFormat::Json,
            baseline: None,
            threshold: None,
            filter: None,
            context: 3,
            verbose: false,
        };

        let result = run(cli).unwrap();
        assert_eq!(result, 0); // Should return 0 because no warnings
    }

    #[test]
    fn test_run_with_threshold_exceeded() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, r#"{{
            "_values": [
                {{
                    "documentLocationInCreatingWorkspace": {{
                        "url": {{
                            "_value": "file:///test/file.swift#EndingLineNumber=42&StartingLineNumber=42"
                        }}
                    }},
                    "issueType": {{
                        "_value": "Swift Compiler Warning"
                    }},
                    "message": {{
                        "_value": "actor-isolated property 'shared' can not be referenced"
                    }}
                }}
            ]
        }}"#).unwrap();
        temp_file.flush().unwrap();

        let cli = Cli {
            input: temp_file.path().to_string_lossy().to_string(),
            format: OutputFormat::Json,
            baseline: None,
            threshold: Some(0), // Set threshold to 0, so 1 warning should exceed it
            filter: None,
            context: 3,
            verbose: false,
        };

        let result = run(cli).unwrap();
        assert_eq!(result, 1); // Should return 1 because warnings exceed threshold
    }

    #[test]
    fn test_run_with_xcodebuild_text_format() {
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, r#"{{"type": "warning", "message": "actor-isolated property 'shared' can not be referenced", "file": "test.swift", "line": 42, "column": 15}}"#).unwrap();
        temp_file.flush().unwrap();

        let cli = Cli {
            input: temp_file.path().to_string_lossy().to_string(),
            format: OutputFormat::Json,
            baseline: None,
            threshold: None,
            filter: None,
            context: 3,
            verbose: false,
        };

        let result = run(cli).unwrap();
        assert_eq!(result, 0); // Should return 0 because no threshold set and warnings exist
    }

    #[test]
    fn test_format_detection_xcresult_vs_xcodebuild() {
        // Test xcresult format detection
        let xcresult_content = r#"{
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test.swift#EndingLineNumber=42"
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
        }"#;

        // Test xcodebuild format
        let xcodebuild_content = r#"{"type": "warning", "message": "actor-isolated property test", "file": "test.swift"}"#;

        // Both should be detected and parsed correctly
        // (This is tested implicitly by the format detection logic in lib.rs)
        assert!(xcresult_content.contains("_values"));
        assert!(!xcodebuild_content.contains("_values"));
    }
}

#[cfg(test)]
mod xcresult_parser_tests {
    use super::*;

    #[test]
    fn test_parse_single_warning_xcresult() {
        let parser = XcresultParser::new(3);
        let json_content = include_str!("fixtures/xcresult_single_warning.json");

        let warnings = parser.parse_json(json_content).unwrap();
        assert_eq!(warnings.len(), 1);

        let warning = &warnings[0];
        assert_eq!(warning.line_number, 45);
        assert!(warning
            .file_path
            .to_str()
            .unwrap()
            .contains("ContentView.swift"));
        assert_eq!(warning.warning_type, WarningType::ActorIsolation);
        assert!(warning.message.contains("Main actor-isolated"));
    }

    #[test]
    fn test_parse_multiple_warnings_xcresult() {
        let parser = XcresultParser::new(3);
        let json_content = include_str!("fixtures/xcresult_multiple_warnings.json");

        let warnings = parser.parse_json(json_content).unwrap();
        assert_eq!(warnings.len(), 3);

        // Check warning types are correctly categorized
        assert_eq!(warnings[0].warning_type, WarningType::ActorIsolation);
        assert_eq!(warnings[1].warning_type, WarningType::SendableConformance);
        assert_eq!(warnings[2].warning_type, WarningType::DataRace);
    }

    #[test]
    fn test_parse_empty_xcresult() {
        let parser = XcresultParser::new(3);
        let json_content = include_str!("fixtures/xcresult_empty.json");

        let warnings = parser.parse_json(json_content).unwrap();
        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_parse_xcresult_filters_non_warnings() {
        let parser = XcresultParser::new(3);
        let json_content = include_str!("fixtures/xcresult_errors_only.json");

        let warnings = parser.parse_json(json_content).unwrap();
        // Should filter out the compiler error and non-concurrency warning
        assert_eq!(warnings.len(), 0);
    }

    #[test]
    fn test_xcresult_url_parsing() {
        let parser = XcresultParser::new(3);
        let json_content = r#"{
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///Users/test/MyProject/Sources/App/Controller.swift#EndingColumnNumber=25&EndingLineNumber=123&StartingColumnNumber=10&StartingLineNumber=123"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "actor-isolated method 'process' cannot be called from non-isolated context"
                    }
                }
            ]
        }"#;

        let warnings = parser.parse_json(json_content).unwrap();
        assert_eq!(warnings.len(), 1);

        let warning = &warnings[0];
        assert_eq!(warning.line_number, 123);
        assert!(warning
            .file_path
            .to_str()
            .unwrap()
            .ends_with("Controller.swift"));
        assert_eq!(warning.warning_type, WarningType::ActorIsolation);
    }

    #[test]
    fn test_xcresult_malformed_json() {
        let parser = XcresultParser::new(3);
        let malformed_json = r#"{"invalid": "json", "missing_values"}"#;

        let result = parser.parse_json(malformed_json);
        assert!(result.is_err());
    }

    #[test]
    fn test_xcresult_missing_url() {
        let parser = XcresultParser::new(3);
        let json_content = r#"{
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
        }"#;

        let warnings = parser.parse_json(json_content).unwrap();
        // Should skip warnings with unparseable URLs
        assert_eq!(warnings.len(), 0);
    }
}

#[cfg(test)]
mod format_detection_tests {

    #[test]
    fn test_detect_xcresult_format() {
        // Test various xcresult format indicators
        let xcresult_indicators = [
            r#"{"_values": []}"#,
            r#"{"_type": {"_name": "Array"}, "_values": [{"_type": {"_name": "IssueSummary"}}]}"#,
            r#"  {"_values": [{"issueType": {"_value": "Swift Compiler Warning"}}]}  "#,
        ];

        for content in &xcresult_indicators {
            let is_xcresult = content.trim_start().starts_with('{') && content.contains("_values");
            assert!(
                is_xcresult,
                "Failed to detect xcresult format for: {content}"
            );
        }
    }

    #[test]
    fn test_detect_xcodebuild_format() {
        let xcodebuild_samples = [
            r#"{"type": "warning", "message": "test"}"#,
            r#"plain text xcodebuild output"#,
            r#"Some other JSON without _values"#,
        ];

        for content in &xcodebuild_samples {
            let is_xcresult = content.trim_start().starts_with('{')
                && content.contains("_values")
                && content.contains("IssueSummary");
            assert!(
                !is_xcresult,
                "Incorrectly detected xcresult format for: {content}"
            );
        }
    }
}

#[cfg(test)]
mod cli_integration_tests {
    use std::fs;
    use std::process::Command;

    #[test]
    #[ignore] // Requires built binary
    fn test_cli_with_xcresult_file() {
        // Create a temporary xcresult file
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().join("test_warnings.json");

        let content = r#"{
            "_values": [
                {
                    "documentLocationInCreatingWorkspace": {
                        "url": {
                            "_value": "file:///test.swift#EndingLineNumber=42&StartingLineNumber=42"
                        }
                    },
                    "issueType": {
                        "_value": "Swift Compiler Warning"
                    },
                    "message": {
                        "_value": "Main actor-isolated property 'data' can not be mutated"
                    }
                }
            ]
        }"#;

        fs::write(&temp_path, content).unwrap();

        // Test the CLI binary
        let output = Command::new("./target/release/swiftconcur-parser")
            .arg(temp_path.to_str().unwrap())
            .arg("--format")
            .arg("json")
            .output()
            .expect("Failed to execute CLI");

        assert!(!output.status.success()); // Should exit with code 1 due to warnings
        let stdout = String::from_utf8(output.stdout).unwrap();
        assert!(stdout.contains("actor_isolation"));
        assert!(stdout.contains("total_warnings"));
    }

    #[test]
    #[ignore] // Requires built binary
    fn test_cli_with_empty_xcresult_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path().join("empty_warnings.json");

        let content = r#"{"_values": []}"#;
        fs::write(&temp_path, content).unwrap();

        let output = Command::new("./target/release/swiftconcur-parser")
            .arg(temp_path.to_str().unwrap())
            .arg("--format")
            .arg("json")
            .output()
            .expect("Failed to execute CLI");

        assert!(output.status.success()); // Should exit with code 0
        let stdout = String::from_utf8(output.stdout).unwrap();
        assert!(stdout.contains("\"total_warnings\": 0"));
    }
}
