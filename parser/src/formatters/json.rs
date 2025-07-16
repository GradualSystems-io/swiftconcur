use crate::formatters::Formatter;
use crate::models::WarningRun;
use crate::error::Result;

pub struct JsonFormatter;

impl JsonFormatter {
    pub fn new() -> Self {
        Self
    }
}

impl Formatter for JsonFormatter {
    fn format(&self, run: &WarningRun) -> Result<String> {
        Ok(serde_json::to_string_pretty(run)?)
    }
}