use clap::{Parser, arg};
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
