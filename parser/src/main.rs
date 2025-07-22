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
            eprintln!("Error: {e}");
            process::exit(2);
        }
    }
}