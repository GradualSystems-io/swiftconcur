use clap::{Parser, ValueEnum};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "swiftconcur")]
#[command(about = "Parse Swift concurrency warnings from xcodebuild output")]
pub struct Cli {
    /// Input file (use - for stdin)
    #[arg(short = 'f', long = "file", default_value = "-")]
    pub input: String,
    
    /// Output format
    #[arg(long = "format", value_enum, default_value = "json")]
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