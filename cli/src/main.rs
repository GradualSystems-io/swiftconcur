//! SwiftConcur CLI - A command-line tool for analyzing Swift concurrency warnings
//! 
//! This tool parses Xcode build output to identify and extract concurrency-related warnings,
//! helping developers identify potential issues with Swift's async/await, actors, and Sendable types.

use clap::{arg, Parser};
use color_eyre::eyre::Result;
use std::{fs, path::PathBuf};
use swiftconcur_parser::find_concurrency_warnings;

#[derive(Parser)]
#[command(author, version, about)]
struct Cli {
    /// xcodebuild JSON log file (use - for stdin)
    #[arg(value_name = "FILE")]
    file: PathBuf,
}

fn main() -> Result<()> {
    color_eyre::install()?;
    let cli = Cli::parse();
    let data = if cli.file.to_string_lossy() == "-" {
        use std::io::Read;
        let mut buf = String::new();
        std::io::stdin().read_to_string(&mut buf)?;
        buf
    } else {
        fs::read_to_string(cli.file)?
    };
    for w in find_concurrency_warnings(&data) {
        println!("{w}");
    }
    Ok(())
}
