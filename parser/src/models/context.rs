use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeContext {
    pub before: Vec<String>,
    pub line: String,
    pub after: Vec<String>,
}

impl CodeContext {
    pub fn new(before: Vec<String>, line: String, after: Vec<String>) -> Self {
        Self { before, line, after }
    }
    
    pub fn empty(line: String) -> Self {
        Self {
            before: Vec::new(),
            line,
            after: Vec::new(),
        }
    }
}