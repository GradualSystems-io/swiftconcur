use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::BufRead;
use std::fs::File;
use std::io::BufReader;
use crate::models::{Warning, CodeContext};
use crate::error::Result;
use crate::parser::patterns::categorize_warning;
use std::path::PathBuf;

// XcodeBuild diagnostic structure based on actual xcodebuild JSON output
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct XcodeBuildDiagnostic {
    #[serde(rename = "type")]
    pub diagnostic_type: String,
    pub message: String,
    pub file: Option<String>,
    pub line: Option<u64>,
    pub column: Option<u64>,
    pub severity: Option<String>,
    #[serde(rename = "characterRangeStart")]
    pub character_range_start: Option<u64>,
    #[serde(rename = "characterRangeEnd")]
    pub character_range_end: Option<u64>,
    #[serde(rename = "categoryIdent")]
    pub category_ident: Option<String>,
}

// Alternative structure for older xcodebuild formats
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct XcodeBuildMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub message: String,
    #[serde(rename = "filePath")]
    pub file_path: Option<String>,
    #[serde(rename = "lineNumber")]
    pub line_number: Option<u64>,
    #[serde(rename = "columnNumber")]
    pub column_number: Option<u64>,
}

pub struct XcodeBuildParser {
    context_lines: usize,
}

impl XcodeBuildParser {
    pub fn new(context_lines: usize) -> Self {
        Self { context_lines }
    }
    
    pub fn parse_stream<R: BufRead>(&self, reader: R) -> Result<Vec<Warning>> {
        let mut warnings = Vec::new();
        
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            
            // Try to parse each line as JSON
            if let Some(warning) = self.parse_line(&line) {
                warnings.push(warning);
            }
        }
        
        Ok(warnings)
    }
    
    fn parse_line(&self, line: &str) -> Option<Warning> {
        // Try parsing as XcodeBuildDiagnostic first
        if let Ok(diagnostic) = serde_json::from_str::<XcodeBuildDiagnostic>(line) {
            return self.extract_warning_from_diagnostic(&diagnostic);
        }
        
        // Try parsing as XcodeBuildMessage
        if let Ok(message) = serde_json::from_str::<XcodeBuildMessage>(line) {
            return self.extract_warning_from_message(&message);
        }
        
        // Try parsing as generic JSON and extract common fields
        if let Ok(json) = serde_json::from_str::<Value>(line) {
            return self.extract_warning_from_value(&json);
        }
        
        None
    }
    
    fn extract_warning_from_diagnostic(&self, diagnostic: &XcodeBuildDiagnostic) -> Option<Warning> {
        // Only process warnings, not errors or notes
        if diagnostic.diagnostic_type != "warning" {
            return None;
        }
        
        let message = &diagnostic.message;
        let (warning_type, severity) = categorize_warning(message);
        
        // Only process Swift concurrency warnings
        if warning_type == crate::models::WarningType::Unknown {
            return None;
        }
        
        let file_path = diagnostic.file.as_deref().unwrap_or("unknown");
        let line_number = diagnostic.line.unwrap_or(0) as usize;
        let column_number = diagnostic.column.map(|c| c as usize);
        
        let id = format!("{}:{}:{}", file_path, line_number, message.len());
        
        let code_context = self.extract_code_context(file_path, line_number);
        
        Some(Warning {
            id,
            warning_type,
            severity,
            file_path: PathBuf::from(file_path),
            line_number,
            column_number,
            message: message.clone(),
            code_context,
            suggested_fix: self.suggest_fix(&warning_type, message),
        })
    }
    
    fn extract_warning_from_message(&self, message: &XcodeBuildMessage) -> Option<Warning> {
        if message.message_type != "warning" {
            return None;
        }
        
        let msg = &message.message;
        let (warning_type, severity) = categorize_warning(msg);
        
        if warning_type == crate::models::WarningType::Unknown {
            return None;
        }
        
        let file_path = message.file_path.as_deref().unwrap_or("unknown");
        let line_number = message.line_number.unwrap_or(0) as usize;
        let column_number = message.column_number.map(|c| c as usize);
        
        let id = format!("{}:{}:{}", file_path, line_number, msg.len());
        
        let code_context = self.extract_code_context(file_path, line_number);
        
        Some(Warning {
            id,
            warning_type,
            severity,
            file_path: PathBuf::from(file_path),
            line_number,
            column_number,
            message: msg.clone(),
            code_context,
            suggested_fix: self.suggest_fix(&warning_type, msg),
        })
    }
    
    fn extract_warning_from_value(&self, json: &Value) -> Option<Warning> {
        // Check if it's a warning type
        let msg_type = json.get("type")?.as_str()?;
        if msg_type != "warning" {
            return None;
        }
        
        let message = json.get("message")?.as_str()?;
        let (warning_type, severity) = categorize_warning(message);
        
        if warning_type == crate::models::WarningType::Unknown {
            return None;
        }
        
        let file_path = json.get("file")
            .or_else(|| json.get("filePath"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
            
        let line_number = json.get("line")
            .or_else(|| json.get("lineNumber"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
            
        let column_number = json.get("column")
            .or_else(|| json.get("columnNumber"))
            .and_then(|v| v.as_u64())
            .map(|v| v as usize);
        
        let id = format!("{}:{}:{}", file_path, line_number, message.len());
        
        let code_context = self.extract_code_context(file_path, line_number);
        
        Some(Warning {
            id,
            warning_type,
            severity,
            file_path: PathBuf::from(file_path),
            line_number,
            column_number,
            message: message.to_string(),
            code_context,
            suggested_fix: self.suggest_fix(&warning_type, message),
        })
    }
    
    fn extract_code_context(&self, file_path: &str, line_number: usize) -> CodeContext {
        // Try to read the actual file and extract context
        if let Ok(file) = File::open(file_path) {
            let reader = BufReader::new(file);
            let lines: Vec<String> = reader.lines().map(|l| l.unwrap_or_default()).collect();
            
            if line_number > 0 && line_number <= lines.len() {
                let target_line_idx = line_number - 1; // Convert to 0-based index
                
                let start_idx = target_line_idx.saturating_sub(self.context_lines);
                let end_idx = std::cmp::min(target_line_idx + self.context_lines + 1, lines.len());
                
                let before: Vec<String> = lines[start_idx..target_line_idx].to_vec();
                let line = lines.get(target_line_idx).cloned().unwrap_or_default();
                let after: Vec<String> = lines[target_line_idx + 1..end_idx].to_vec();
                
                return CodeContext { before, line, after };
            }
        }
        
        // Fallback to empty context
        CodeContext {
            before: Vec::new(),
            line: String::new(),
            after: Vec::new(),
        }
    }
    
    fn suggest_fix(&self, warning_type: &crate::models::WarningType, message: &str) -> Option<String> {
        use crate::models::WarningType;
        
        match warning_type {
            WarningType::ActorIsolation => {
                if message.contains("can not be referenced") || message.contains("cannot be referenced") {
                    Some("Consider using 'await' to access the actor-isolated member, or move this code into an actor context.".to_string())
                } else if message.contains("Main actor") {
                    Some("Consider using '@MainActor' annotation or dispatching to the main queue.".to_string())
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
                Some("Protect shared mutable state with proper synchronization (locks, actors, or atomic operations).".to_string())
            }
            WarningType::PerformanceRegression => {
                Some("Review async/await usage patterns and consider optimizing concurrency structure.".to_string())
            }
            WarningType::Unknown => None,
        }
    }
}