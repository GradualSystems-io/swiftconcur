pub mod cli;
pub mod error;
pub mod models;
pub mod parser;
pub mod formatters;

use cli::{Cli, OutputFormat};
use error::Result;
use models::WarningRun;
use parser::{XcodeBuildParser, filter_warnings, check_threshold};
use formatters::{Formatter, JsonFormatter, MarkdownFormatter, SlackFormatter};
use std::io::{self, BufReader};
use std::fs::File;

pub fn run(cli: Cli) -> Result<i32> {
    // Create parser
    let parser = XcodeBuildParser::new(cli.context);
    
    // Parse input
    let warnings = if cli.input == "-" {
        let stdin = io::stdin();
        let reader = BufReader::new(stdin.lock());
        parser.parse_stream(reader)?
    } else {
        let file = File::open(&cli.input)?;
        let reader = BufReader::new(file);
        parser.parse_stream(reader)?
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