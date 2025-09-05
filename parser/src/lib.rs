pub mod cli;
pub mod error;
pub mod formatters;
pub mod models;
pub mod parser;

use cli::{Cli, OutputFormat};
use error::Result;
use formatters::{Formatter, JsonFormatter, MarkdownFormatter, SlackFormatter};
use models::WarningRun;
use parser::{check_threshold, filter_warnings, RawLogParser, XcodeBuildParser, XcresultParser};
use std::fs::File;
use std::io::{self, BufReader};

pub fn run(cli: Cli) -> Result<i32> {
    // Parse input - detect format and use appropriate parser with fallbacks
    let warnings = if cli.input == "-" {
        let stdin = io::stdin();
        let reader = BufReader::new(stdin.lock());
        
        // Try XcodeBuildParser first (JSON), fall back to RawLogParser
        let xcodebuild_parser = XcodeBuildParser::new(cli.context);
        match xcodebuild_parser.parse_stream(reader) {
            Ok(warnings) if !warnings.is_empty() => warnings,
            _ => {
                // Fallback: re-read stdin as raw log format
                let stdin = io::stdin();
                let reader = BufReader::new(stdin.lock());
                let rawlog_parser = RawLogParser::new(cli.context);
                rawlog_parser.parse_stream(reader)?
            }
        }
    } else {
        // Read file to detect format
        let content = std::fs::read_to_string(&cli.input)?;

        // Try to detect if it's xcresult JSON format
        if content.trim_start().starts_with('{') && content.contains("_values") {
            // Parse as xcresult JSON
            let parser = XcresultParser::new(cli.context);
            match parser.parse_json(&content) {
                Ok(warnings) if !warnings.is_empty() => warnings,
                _ => {
                    // Fallback to raw log parsing
                    use std::io::Cursor;
                    let cursor = Cursor::new(&content);
                    let rawlog_parser = RawLogParser::new(cli.context);
                    rawlog_parser.parse_stream(cursor)?
                }
            }
        } else {
            // Try XcodeBuildParser first (structured JSON lines), then RawLogParser
            let file = File::open(&cli.input)?;
            let reader = BufReader::new(file);
            let xcodebuild_parser = XcodeBuildParser::new(cli.context);
            
            match xcodebuild_parser.parse_stream(reader) {
                Ok(warnings) if !warnings.is_empty() => warnings,
                _ => {
                    // Fallback to raw log parsing for plain text xcodebuild output
                    use std::io::Cursor;
                    let cursor = Cursor::new(&content);
                    let rawlog_parser = RawLogParser::new(cli.context);
                    rawlog_parser.parse_stream(cursor)?
                }
            }
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
    
    // Try XcodeBuildParser first
    let xcodebuild_parser = XcodeBuildParser::new(3);
    let cursor = Cursor::new(input);
    let reader = BufReader::new(cursor);

    match xcodebuild_parser.parse_stream(reader) {
        Ok(warnings) if !warnings.is_empty() => {
            warnings.into_iter().map(|w| w.message).collect()
        }
        _ => {
            // Fallback to RawLogParser
            let rawlog_parser = RawLogParser::new(3);
            let cursor = Cursor::new(input);
            match rawlog_parser.parse_stream(cursor) {
                Ok(warnings) => warnings.into_iter().map(|w| w.message).collect(),
                Err(_) => Vec::new(),
            }
        }
    }
}
