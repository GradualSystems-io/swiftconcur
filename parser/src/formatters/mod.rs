pub mod json;
pub mod markdown;
pub mod slack;

use crate::models::WarningRun;
use crate::error::Result;

pub trait Formatter {
    fn format(&self, run: &WarningRun) -> Result<String>;
}

pub use json::JsonFormatter;
pub use markdown::MarkdownFormatter;
pub use slack::SlackFormatter;