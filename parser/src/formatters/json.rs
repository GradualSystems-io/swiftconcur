use crate::error::Result;
use crate::formatters::Formatter;
use crate::models::WarningRun;

#[derive(Default)]
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
