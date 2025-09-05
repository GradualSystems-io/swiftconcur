use swiftconcur_parser::{run, cli::Cli, cli::OutputFormat};
use tempfile::NamedTempFile;
use std::io::Write;

#[test]
fn test_parse_github_action_log_warning() {
    // This is the exact warning format from the GitHub Action logs
    let raw_log = r#"
/Users/runner/work/ConcurCLIDemo/ConcurCLIDemo/ConcurDemo/Item.swift:37:24: warning: main actor-isolated property 'count' can not be mutated from a Sendable closure; this is an error in the Swift 6 language mode
            self.model.count += 1          // 🟡 warning in "targeted", error in "complete"
/Users/runner/work/ConcurCLIDemo/ConcurCLIDemo/ConcurDemo/Item.swift:22:9: note: mutation of this property is only permitted within the actor
    var count = 0
        ^
"#.trim();

    // Create a temporary file with the raw log content
    let mut temp_file = NamedTempFile::new().unwrap();
    writeln!(temp_file, "{}", raw_log).unwrap();
    let temp_path = temp_file.path().to_str().unwrap();

    // Run the parser with raw log input
    let cli = Cli {
        input: temp_path.to_string(),
        format: OutputFormat::Json,
        baseline: None,
        threshold: None,
        filter: None,
        context: 3,
        verbose: false,
    };

    // Capture output
    let result = run(cli);
    assert!(result.is_ok());
    
    // The function internally uses println!, so we need to test differently
    // Let's verify the parsing works by using the library function directly
    
    use swiftconcur_parser::find_concurrency_warnings;
    let warnings = find_concurrency_warnings(raw_log);
    
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("main actor-isolated property 'count' can not be mutated from a Sendable closure"));
}

#[test]
fn test_parse_multiple_concurrency_warnings_from_log() {
    let raw_log = r#"
Build started...
/project/DataManager.swift:42:15: warning: actor-isolated property 'data' can not be referenced from a non-isolated context
    return self.data.count
              ^
/project/NetworkService.swift:78:22: warning: Type 'NetworkManager' does not conform to the 'Sendable' protocol; this is an error in Swift 6
    let manager = NetworkManager()
                  ^
/project/ConcurrentQueue.swift:95:10: warning: data race condition detected between concurrent accesses to shared mutable state
    queue.append(item)
    ^
Build completed with warnings.
"#.trim();

    use swiftconcur_parser::find_concurrency_warnings;
    let warnings = find_concurrency_warnings(raw_log);
    
    assert_eq!(warnings.len(), 3);
    
    // Verify each warning type is detected
    assert!(warnings[0].contains("actor-isolated property"));
    assert!(warnings[1].contains("does not conform to the 'Sendable' protocol"));
    assert!(warnings[2].contains("data race condition detected"));
}

#[test] 
fn test_ignore_non_swift_concurrency_warnings() {
    let raw_log = r#"
/project/File.swift:10:5: warning: variable 'unused' was never used; consider replacing with '_' or removing it
/project/Deprecated.swift:25:8: warning: 'oldFunction()' is deprecated: Use newFunction() instead
/project/Actor.swift:30:12: warning: main actor-isolated property 'state' can not be mutated from a Sendable closure
/project/Header.h:15:1: warning: some C header warning
"#.trim();

    use swiftconcur_parser::find_concurrency_warnings;
    let warnings = find_concurrency_warnings(raw_log);
    
    // Should only find the actor isolation warning, ignoring others
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("main actor-isolated property"));
}

#[test]
fn test_empty_log_produces_no_warnings() {
    let empty_log = "";
    
    use swiftconcur_parser::find_concurrency_warnings;
    let warnings = find_concurrency_warnings(empty_log);
    
    assert_eq!(warnings.len(), 0);
}

#[test]
fn test_malformed_warning_lines_ignored() {
    let malformed_log = r#"
This is not a warning line
File.swift: incomplete line
/test/File.swift:invalid:25: warning: malformed line number
/test/Valid.swift:30:5: warning: actor-isolated property 'test' cannot be referenced
incomplete warning line without proper format
"#.trim();

    use swiftconcur_parser::find_concurrency_warnings;
    let warnings = find_concurrency_warnings(malformed_log);
    
    // Should only parse the valid warning line
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("actor-isolated property"));
}

#[test]
fn test_mixed_build_output_with_warnings() {
    let mixed_log = r#"
Build settings from command line:
    CODE_SIGNING_ALLOWED = NO
    SWIFT_STRICT_CONCURRENCY = targeted
    
=== BUILD TARGET ConcurDemo OF PROJECT ConcurDemo ===

SwiftCompile normal arm64 /Users/runner/work/ConcurCLIDemo/ConcurCLIDemo/ConcurDemo/Item.swift
    cd /Users/runner/work/ConcurCLIDemo/ConcurCLIDemo
/Users/runner/work/ConcurCLIDemo/ConcurCLIDemo/ConcurDemo/Item.swift:37:24: warning: main actor-isolated property 'count' can not be mutated from a Sendable closure; this is an error in the Swift 6 language mode
            self.model.count += 1

** BUILD SUCCEEDED **
"#.trim();

    use swiftconcur_parser::find_concurrency_warnings;
    let warnings = find_concurrency_warnings(mixed_log);
    
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("main actor-isolated property"));
}