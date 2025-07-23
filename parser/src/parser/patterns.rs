use crate::models::{Severity, WarningType};
use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    // Actor isolation patterns - covers various forms of actor isolation violations
    pub static ref ACTOR_ISOLATION: Regex = Regex::new(
        r"(?i)(actor-isolated\s+(property|method|function|instance|var|let|subscript).*?(can\s*not|cannot)\s+be\s+(referenced|accessed|called|mutated))|(\w+.*is\s+actor-isolated)"
    ).unwrap();

    // Sendable conformance patterns
    pub static ref SENDABLE_CONFORMANCE: Regex = Regex::new(
        r"(?i)(type\s+'[^']+'\s+does\s+not\s+conform\s+to.*sendable)|(capture.*requires.*sendable)|(.*non-sendable.*)"
    ).unwrap();

    // Data race patterns
    pub static ref DATA_RACE: Regex = Regex::new(
        r"(?i)(data\s+race|race\s+condition|concurrent\s+access|mutation\s+of\s+captured\s+var)"
    ).unwrap();

    // Performance/concurrency overhead patterns
    pub static ref PERFORMANCE: Regex = Regex::new(
        r"(?i)(performance.*concurrency|async.*overhead|potential\s+deadlock|excessive\s+await)"
    ).unwrap();

    // Task-related warnings
    pub static ref TASK_WARNINGS: Regex = Regex::new(
        r"(?i)(task.*cancelled|task.*leaked|detached\s+task)"
    ).unwrap();

    // MainActor related warnings
    pub static ref MAIN_ACTOR: Regex = Regex::new(
        r"(?i)(main\s+actor.*isolation|call\s+to\s+main\s+actor|main\s+actor.*unsafe)"
    ).unwrap();
}

pub fn categorize_warning(message: &str) -> (WarningType, Severity) {
    // Check for data races first (most critical)
    if DATA_RACE.is_match(message) {
        return (WarningType::DataRace, Severity::Critical);
    }

    // Check for actor isolation violations
    if ACTOR_ISOLATION.is_match(message) || MAIN_ACTOR.is_match(message) {
        return (WarningType::ActorIsolation, Severity::High);
    }

    // Check for Sendable conformance issues
    if SENDABLE_CONFORMANCE.is_match(message) {
        return (WarningType::SendableConformance, Severity::High);
    }

    // Check for task-related issues
    if TASK_WARNINGS.is_match(message) {
        return (WarningType::ActorIsolation, Severity::Medium);
    }

    // Check for performance issues
    if PERFORMANCE.is_match(message) {
        return (WarningType::PerformanceRegression, Severity::Medium);
    }

    // Default to unknown
    (WarningType::Unknown, Severity::Low)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_actor_isolation_patterns() {
        let messages = [
            "actor-isolated property 'shared' can not be referenced from a non-isolated context",
            "actor-isolated method 'updateData' cannot be called from non-isolated context",
            "actor-isolated instance method 'process' can not be referenced",
            "Main actor-isolated property cannot be accessed",
        ];

        for (i, message) in messages.iter().enumerate() {
            let (warning_type, severity) = categorize_warning(message);
            println!("Message {i}: {message} -> {warning_type:?}");
            assert_eq!(
                warning_type,
                WarningType::ActorIsolation,
                "Failed for message: {message}"
            );
            assert!(matches!(severity, Severity::High | Severity::Medium));
        }
    }

    #[test]
    fn test_sendable_patterns() {
        let messages = vec![
            "Type 'MyClass' does not conform to the 'Sendable' protocol",
            "capture of 'self' with non-sendable type requires 'Sendable' conformance",
            "passing non-sendable parameter to async function",
        ];

        for message in messages {
            let (warning_type, _) = categorize_warning(message);
            assert_eq!(warning_type, WarningType::SendableConformance);
        }
    }

    #[test]
    fn test_data_race_patterns() {
        let messages = vec![
            "data race detected in concurrent access to variable",
            "race condition in shared mutable state",
            "mutation of captured var in concurrently-executing code",
        ];

        for message in messages {
            let (warning_type, severity) = categorize_warning(message);
            assert_eq!(warning_type, WarningType::DataRace);
            assert_eq!(severity, Severity::Critical);
        }
    }
}
