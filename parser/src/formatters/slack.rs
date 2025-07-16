use crate::formatters::Formatter;
use crate::models::{WarningRun, WarningType, Severity};
use crate::error::Result;
use serde_json::json;

pub struct SlackFormatter;

impl SlackFormatter {
    pub fn new() -> Self {
        Self
    }
    
    fn severity_color(&self, severity: &Severity) -> &str {
        match severity {
            Severity::Critical => "danger",
            Severity::High => "warning",
            Severity::Medium => "#ff9500",
            Severity::Low => "good",
        }
    }
    
    fn warning_type_label(&self, warning_type: &WarningType) -> &str {
        match warning_type {
            WarningType::ActorIsolation => "Actor Isolation",
            WarningType::SendableConformance => "Sendable Conformance", 
            WarningType::DataRace => "Data Race",
            WarningType::PerformanceRegression => "Performance Regression",
            WarningType::Unknown => "Unknown",
        }
    }
}

impl Formatter for SlackFormatter {
    fn format(&self, run: &WarningRun) -> Result<String> {
        let mut blocks = Vec::new();
        
        // Header block
        blocks.push(json!({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "Swift Concurrency Warnings Report"
            }
        }));
        
        // Summary block
        let summary_text = if run.total_warnings == 0 {
            "✅ No Swift concurrency warnings found!".to_string()
        } else {
            format!("⚠️ Found {} Swift concurrency warning{}", 
                run.total_warnings,
                if run.total_warnings == 1 { "" } else { "s" }
            )
        };
        
        blocks.push(json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": summary_text
            }
        }));
        
        // Add warning details if any exist
        if !run.warnings.is_empty() {
            blocks.push(json!({
                "type": "divider"
            }));
            
            for (i, warning) in run.warnings.iter().enumerate() {
                if i >= 10 { // Limit to first 10 warnings for Slack
                    blocks.push(json!({
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": format!("_... and {} more warnings_", run.warnings.len() - 10)
                        }
                    }));
                    break;
                }
                
                blocks.push(json!({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!(
                            "*{}* in `{}`\nLine {}: {}",
                            self.warning_type_label(&warning.warning_type),
                            warning.file_path.display(),
                            warning.line_number,
                            warning.message
                        )
                    },
                    "accessory": {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View"
                        },
                        "value": warning.id.clone()
                    }
                }));
            }
        }
        
        let slack_message = json!({
            "blocks": blocks
        });
        
        Ok(serde_json::to_string_pretty(&slack_message)?)
    }
}