# Phase 1: Rust CLI Parser - Detailed Implementation Guide

## Project Setup

### 1. Initialize Rust Project
```bash
cd parser
cargo init --name swiftconcur-parser
```

### 2. Update Cargo.toml
```toml
[package]
name = "swiftconcur-parser"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = { version = "4.5", features = ["derive", "env"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
rayon = "1.10"
regex = "1.10"
chrono = { version = "0.4", features = ["serde"] }
colored = "2.1"
anyhow = "1.0"

[dev-dependencies]
tempfile = "3.10"
assert_cmd = "2.0"
predicates = "3.1"
pretty_assertions = "1.4"
```

### 3. Create Module Structure
```
parser/src/
├── main.rs
├── lib.rs
├── cli.rs           # CLI argument parsing
├── parser/
│   ├── mod.rs
│   ├── xcodebuild.rs
│   ├── warnings.rs
│   └── patterns.rs  # Regex patterns for warnings
├── models/
│   ├── mod.rs
│   ├── warning.rs
│   ├── run.rs
│   └── context.rs
├── formatters/
│   ├── mod.rs
│   ├── json.rs
│   ├── markdown.rs
│   └── slack.rs
└── error.rs
```

## Core Implementation

### 1. Error Types (src/error.rs)
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ParseError {
    #[error("Failed to read input: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Failed to parse JSON: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("No warnings found in input")]
    NoWarnings,
    
    #[error("Invalid format: {0}")]
    InvalidFormat(String),
    
    #[error("Baseline comparison failed: {0}")]
    BaselineError(String),
}

pub type Result<T> = std::result::Result<T, ParseError>;
```

### 2. Warning Models (src/models/warning.rs)
```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WarningType {
    ActorIsolation,
    SendableConformance,
    DataRace,
    PerformanceRegression,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Warning {
    pub id: String,
    pub warning_type: WarningType,
    pub severity: Severity,
    pub file_path: PathBuf,
    pub line_number: usize,
    pub column_number: Option<usize>,
    pub message: String,
    pub code_context: CodeContext,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeContext {
    pub before: Vec<String>,
    pub line: String,
    pub after: Vec<String>,
}
```

### 3. Pattern Matching (src/parser/patterns.rs)
```rust
use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    pub static ref ACTOR_ISOLATION: Regex = Regex::new(
        r"(?i)actor-isolated\s+\w+.*can\s*not\s+be\s+referenced"
    ).unwrap();
    
    pub static ref SENDABLE_CONFORMANCE: Regex = Regex::new(
        r"(?i)type\s+'([^']+)'\s+does\s+not\s+conform\s+to.*sendable"
    ).unwrap();
    
    pub static ref DATA_RACE: Regex = Regex::new(
        r"(?i)(data\s+race|race\s+condition|concurrent\s+access)"
    ).unwrap();
    
    pub static ref PERFORMANCE: Regex = Regex::new(
        r"(?i)performance.*concurrency|async.*overhead"
    ).unwrap();
}

pub fn categorize_warning(message: &str) -> (WarningType, Severity) {
    if ACTOR_ISOLATION.is_match(message) {
        (WarningType::ActorIsolation, Severity::High)
    } else if SENDABLE_CONFORMANCE.is_match(message) {
        (WarningType::SendableConformance, Severity::High)
    } else if DATA_RACE.is_match(message) {
        (WarningType::DataRace, Severity::Critical)
    } else if PERFORMANCE.is_match(message) {
        (WarningType::PerformanceRegression, Severity::Medium)
    } else {
        (WarningType::Unknown, Severity::Low)
    }
}
```

### 4. XcodeBuild Parser (src/parser/xcodebuild.rs)
```rust
use serde_json::Value;
use std::io::BufRead;
use rayon::prelude::*;

pub struct XcodeBuildParser {
    context_lines: usize,
}

impl XcodeBuildParser {
    pub fn new(context_lines: usize) -> Self {
        Self { context_lines }
    }
    
    pub fn parse_stream<R: BufRead>(&self, reader: R) -> Result<Vec<Warning>> {
        let mut warnings = Vec::new();
        let mut buffer = String::new();
        
        // Stream line by line for memory efficiency
        for line in reader.lines() {
            let line = line?;
            buffer.push_str(&line);
            
            // Try to parse as JSON
            if let Ok(json) = serde_json::from_str::<Value>(&buffer) {
                if let Some(warning) = self.extract_warning(&json) {
                    warnings.push(warning);
                }
                buffer.clear();
            }
        }
        
        Ok(warnings)
    }
    
    fn extract_warning(&self, json: &Value) -> Option<Warning> {
        // Extract warning from xcodebuild JSON structure
        // This will need to be adapted based on actual xcodebuild output
        todo!()
    }
}
```

### 5. CLI Interface (src/cli.rs)
```rust
use clap::{Parser, ValueEnum};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "swiftconcur")]
#[command(about = "Parse Swift concurrency warnings from xcodebuild output")]
pub struct Cli {
    /// Input file (use - for stdin)
    #[arg(default_value = "-")]
    pub input: String,
    
    /// Output format
    #[arg(short, long, value_enum, default_value = "json")]
    pub format: OutputFormat,
    
    /// Baseline file for comparison
    #[arg(short, long)]
    pub baseline: Option<PathBuf>,
    
    /// Fail if warnings exceed threshold
    #[arg(short, long)]
    pub threshold: Option<usize>,
    
    /// Filter by warning type
    #[arg(short = 'F', long)]
    pub filter: Option<WarningTypeFilter>,
    
    /// Lines of context to show
    #[arg(short, long, default_value = "3")]
    pub context: usize,
    
    /// Enable verbose logging
    #[arg(short, long)]
    pub verbose: bool,
}

#[derive(Debug, Clone, ValueEnum)]
pub enum OutputFormat {
    Json,
    Markdown,
    Slack,
}

#[derive(Debug, Clone, ValueEnum)]
pub enum WarningTypeFilter {
    ActorIsolation,
    Sendable,
    DataRace,
    Performance,
}
```

### 6. Main Entry Point (src/main.rs)
```rust
use clap::Parser;
use swiftconcur_parser::{cli::Cli, run};
use std::process;

fn main() {
    let cli = Cli::parse();
    
    // Initialize tracing
    if cli.verbose {
        tracing_subscriber::fmt()
            .with_env_filter("debug")
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter("warn")
            .init();
    }
    
    match run(cli) {
        Ok(exit_code) => process::exit(exit_code),
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(2);
        }
    }
}
```

## Testing Strategy

### 1. Unit Tests Structure
```
parser/tests/
├── fixtures/
│   ├── actor_isolation.json
│   ├── sendable_warnings.json
│   ├── mixed_warnings.json
│   └── clean_build.json
├── parser_tests.rs
├── formatter_tests.rs
└── cli_tests.rs
```

### 2. Example Test (tests/parser_tests.rs)
```rust
use swiftconcur_parser::parser::XcodeBuildParser;
use std::fs::File;
use std::io::BufReader;

#[test]
fn test_parse_actor_isolation_warnings() {
    let file = File::open("tests/fixtures/actor_isolation.json").unwrap();
    let reader = BufReader::new(file);
    let parser = XcodeBuildParser::new(3);
    
    let warnings = parser.parse_stream(reader).unwrap();
    
    assert!(!warnings.is_empty());
    assert_eq!(warnings[0].warning_type, WarningType::ActorIsolation);
}

#[test]
fn test_threshold_exit_code() {
    // Test that exceeding threshold returns exit code 1
}

#[test]
fn test_baseline_comparison() {
    // Test comparing against baseline
}
```

### 3. Integration Test (tests/cli_tests.rs)
```rust
use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn test_cli_json_output() {
    let mut cmd = Command::cargo_bin("swiftconcur").unwrap();
    cmd.arg("--format").arg("json")
       .arg("tests/fixtures/mixed_warnings.json");
    
    cmd.assert()
       .success()
       .stdout(predicate::str::contains("\"warning_type\":"));
}
```

## Performance Optimization

### 1. Streaming Parser
- Process line-by-line instead of loading entire file
- Use `BufReader` with appropriate buffer size
- Parse JSON incrementally

### 2. Parallel Processing
```rust
use rayon::prelude::*;

pub fn process_warnings_parallel(warnings: Vec<RawWarning>) -> Vec<Warning> {
    warnings.par_iter()
        .map(|raw| parse_warning(raw))
        .collect()
}
```

### 3. Memory Efficiency
- Use `&str` instead of `String` where possible
- Stream output instead of building in memory
- Clear buffers after processing

## Deliverables Checklist

- [ ] Complete Rust project structure
- [ ] Working JSON parser for xcodebuild output
- [ ] Warning categorization with regex patterns
- [ ] CLI with all specified flags
- [ ] JSON output formatter
- [ ] Markdown output formatter
- [ ] Slack output formatter
- [ ] Baseline comparison feature
- [ ] Threshold checking with proper exit codes
- [ ] Context extraction (before/after lines)
- [ ] Comprehensive unit tests
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] README with usage examples
- [ ] CI workflow for testing

## Next Steps
After completing the parser, move to Phase 2 (GitHub Action) which will package this parser into a Docker container and integrate it with GitHub's PR workflow.