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