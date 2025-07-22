use serde::{Deserialize, Serialize};
use serde_json;
use std::path::PathBuf;
use crate::models::{Warning, CodeContext};
use crate::parser::patterns::categorize_warning;
use crate::error::Result;
use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    // Parse file path and line number from Xcode URL format
    static ref URL_PARSER: Regex = Regex::new(
        r"file://(?P<path>[^#]+)#.*StartingLineNumber=(?P<line>\d+)"
    ).unwrap();
}

#[derive(Debug, Deserialize, Serialize)]
pub struct XcresultRoot {
    #[serde(rename = "_values")]
    pub values: Vec<IssueSummary>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct IssueSummary {
    #[serde(rename = "documentLocationInCreatingWorkspace")]
    pub document_location: DocumentLocation,
    #[serde(rename = "issueType")]
    pub issue_type: StringValue,
    pub message: StringValue,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DocumentLocation {
    pub url: StringValue,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StringValue {
    #[serde(rename = "_value")]
    pub value: String,
}

pub struct XcresultParser {
    context_lines: usize,
}

impl XcresultParser {
    pub fn new(context_lines: usize) -> Self {
        Self { context_lines }
    }
    
    pub fn parse_json(&self, json_content: &str) -> Result<Vec<Warning>> {
        let root: XcresultRoot = serde_json::from_str(json_content)?;
        let mut warnings = Vec::new();
        
        for issue in root.values {
            // Skip non-warning issues
            if !issue.issue_type.value.contains("Warning") {
                continue;
            }
            
            // Parse file path and line number from URL
            let url = &issue.document_location.url.value;
            if let Some(captures) = URL_PARSER.captures(url) {
                let file_path = captures.name("path").unwrap().as_str();
                let line_number: u32 = captures.name("line").unwrap().as_str().parse().unwrap_or(0);
                
                let message = &issue.message.value;
                let (warning_type, severity) = categorize_warning(message);
                
                // Try to read code context from file
                let code_context = self.extract_code_context(file_path, line_number);
                
                let warning = Warning {
                    id: uuid::Uuid::new_v4().to_string(),
                    warning_type,
                    severity,
                    file_path: PathBuf::from(file_path),
                    line_number: line_number as usize,
                    column_number: None, // Not available in xcresult format
                    message: message.clone(),
                    code_context,
                    suggested_fix: None,
                };
                
                warnings.push(warning);
            }
        }
        
        Ok(warnings)
    }
    
    fn extract_code_context(&self, file_path: &str, line_number: u32) -> CodeContext {
        use std::fs;
        use std::io::{BufReader, BufRead};
        
        let mut context = CodeContext {
            before: Vec::new(),
            line: String::new(),
            after: Vec::new(),
        };
        
        if let Ok(file) = fs::File::open(file_path) {
            let reader = BufReader::new(file);
            let lines: Vec<String> = reader.lines().collect::<std::result::Result<Vec<_>, _>>().unwrap_or_default();
            
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
    use crate::models::WarningType;

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
}