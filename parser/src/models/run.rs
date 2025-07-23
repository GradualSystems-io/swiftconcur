use super::Warning;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarningRun {
    pub id: String,
    pub commit_sha: Option<String>,
    pub branch: Option<String>,
    pub pull_request: Option<u32>,
    pub total_warnings: usize,
    pub warnings: Vec<Warning>,
    pub created_at: DateTime<Utc>,
}

impl WarningRun {
    pub fn new(warnings: Vec<Warning>) -> Self {
        let total_warnings = warnings.len();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            commit_sha: None,
            branch: None,
            pull_request: None,
            total_warnings,
            warnings,
            created_at: Utc::now(),
        }
    }
}
