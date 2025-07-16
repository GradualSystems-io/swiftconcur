use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use super::CodeContext;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WarningType {
    ActorIsolation,
    SendableConformance,
    DataRace,
    PerformanceRegression,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
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