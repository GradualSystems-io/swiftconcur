pub mod cli;
pub mod error;
pub mod formatters;
pub mod models;
pub mod parser;

use cli::{Cli, OutputFormat};
use error::Result;
use formatters::{Formatter, JsonFormatter, MarkdownFormatter, SlackFormatter};
use models::WarningRun;
use parser::{check_threshold, filter_warnings, XcodeBuildParser, XcresultParser};
use std::fs::File;
use std::io::{self, BufReader};

pub fn run(cli: Cli) -> Result<i32> {
    // Parse input - detect format and use appropriate parser
    let warnings = if cli.input == "-" {
        let stdin = io::stdin();
        let reader = BufReader::new(stdin.lock());
        let parser = XcodeBuildParser::new(cli.context);
        parser.parse_stream(reader)?
    } else {
        // Read file to detect format
        let content = std::fs::read_to_string(&cli.input)?;

        // Try to detect if it's xcresult JSON format
        if content.trim_start().starts_with('{') && content.contains("_values") {
            // Parse as xcresult JSON
            let parser = XcresultParser::new(cli.context);
            parser.parse_json(&content)?
        } else {
            // Parse as xcodebuild text output
            let file = File::open(&cli.input)?;
            let reader = BufReader::new(file);
            let parser = XcodeBuildParser::new(cli.context);
            parser.parse_stream(reader)?
        }
    };

    // Filter warnings if requested
    let filtered_warnings = filter_warnings(warnings, cli.filter);

    // Create warning run
    let run = WarningRun::new(filtered_warnings);

    // Format output
    let formatter: Box<dyn Formatter> = match cli.format {
        OutputFormat::Json => Box::new(JsonFormatter::new()),
        OutputFormat::Markdown => Box::new(MarkdownFormatter::new()),
        OutputFormat::Slack => Box::new(SlackFormatter::new()),
    };

    let output = formatter.format(&run)?;
    println!("{output}");

    // Check threshold and return appropriate exit code
    let threshold_passed = check_threshold(&run.warnings, cli.threshold);

    if threshold_passed {
        Ok(0) // Success
    } else {
        Ok(1) // Warnings exceed threshold
    }
}

// Legacy compatibility function for existing CLI
pub fn find_concurrency_warnings(input: &str) -> Vec<String> {
    use std::io::Cursor;
    let parser = XcodeBuildParser::new(3);
    let cursor = Cursor::new(input);
    let reader = BufReader::new(cursor);

    match parser.parse_stream(reader) {
        Ok(warnings) => warnings.into_iter().map(|w| w.message).collect(),
        Err(_) => Vec::new(),
    }
}
