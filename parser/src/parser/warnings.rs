use crate::cli::WarningTypeFilter;
use crate::models::{Warning, WarningType};

pub fn filter_warnings(warnings: Vec<Warning>, filter: Option<WarningTypeFilter>) -> Vec<Warning> {
    match filter {
        Some(filter_type) => {
            let target_type = match filter_type {
                WarningTypeFilter::ActorIsolation => WarningType::ActorIsolation,
                WarningTypeFilter::Sendable => WarningType::SendableConformance,
                WarningTypeFilter::DataRace => WarningType::DataRace,
                WarningTypeFilter::Performance => WarningType::PerformanceRegression,
            };
            warnings
                .into_iter()
                .filter(|w| w.warning_type == target_type)
                .collect()
        }
        None => warnings,
    }
}

pub fn check_threshold(warnings: &[Warning], threshold: Option<usize>) -> bool {
    match threshold {
        Some(limit) => warnings.len() <= limit,
        None => true,
    }
}
