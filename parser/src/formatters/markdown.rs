use crate::error::Result;
use crate::formatters::Formatter;
use crate::models::{Severity, WarningRun, WarningType};

#[derive(Default)]
pub struct MarkdownFormatter;

impl MarkdownFormatter {
    pub fn new() -> Self {
        Self
    }

    fn severity_emoji(&self, severity: &Severity) -> &str {
        match severity {
            Severity::Critical => "🚨",
            Severity::High => "⚠️",
            Severity::Medium => "⚡",
            Severity::Low => "ℹ️",
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

impl Formatter for MarkdownFormatter {
    fn format(&self, run: &WarningRun) -> Result<String> {
        let mut output = String::new();

        output.push_str("# Swift Concurrency Warnings Report\n\n");
        output.push_str(&format!("**Total Warnings:** {}\n", run.total_warnings));
        output.push_str(&format!(
            "**Generated:** {}\n\n",
            run.created_at.format("%Y-%m-%d %H:%M:%S UTC")
        ));

        if let Some(commit) = &run.commit_sha {
            output.push_str(&format!("**Commit:** `{commit}`\n"));
        }

        if let Some(branch) = &run.branch {
            output.push_str(&format!("**Branch:** `{branch}`\n"));
        }

        output.push_str("\n## Warnings\n\n");

        for warning in &run.warnings {
            output.push_str(&format!(
                "### {} {} - {}\n\n",
                self.severity_emoji(&warning.severity),
                self.warning_type_label(&warning.warning_type),
                warning.file_path.display()
            ));

            output.push_str(&format!("**Line:** {}\n", warning.line_number));
            output.push_str(&format!("**Message:** {}\n\n", warning.message));

            if !warning.code_context.line.is_empty() {
                output.push_str("```swift\n");
                for line in &warning.code_context.before {
                    output.push_str(&format!("  {line}\n"));
                }
                output.push_str(&format!("> {}\n", warning.code_context.line));
                for line in &warning.code_context.after {
                    output.push_str(&format!("  {line}\n"));
                }
                output.push_str("```\n\n");
            }

            output.push_str("---\n\n");
        }

        Ok(output)
    }
}
