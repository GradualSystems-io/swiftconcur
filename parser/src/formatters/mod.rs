pub mod json;
pub mod markdown;
pub mod slack;

use crate::error::Result;
use crate::models::WarningRun;

pub trait Formatter {
    fn format(&self, run: &WarningRun) -> Result<String>;
}

pub use json::JsonFormatter;
pub use markdown::MarkdownFormatter;
pub use slack::SlackFormatter;
