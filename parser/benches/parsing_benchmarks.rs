use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use std::fs;
use std::io::BufReader;
use swiftconcur_parser::parser::{XcodeBuildParser, XcresultParser};

fn load_test_data() -> (String, String, String, String) {
    let small_file = fs::read_to_string("tests/fixtures/xcresult_single_warning.json")
        .expect("Failed to read small test file");

    let medium_file = fs::read_to_string("tests/fixtures/comprehensive_warnings.json")
        .expect("Failed to read medium test file");

    let large_file = fs::read_to_string("tests/fixtures/xcresult_multiple_warnings.json")
        .expect("Failed to read large test file");

    // Create a synthetic very large file for stress testing
    let very_large_file = create_synthetic_large_input(&medium_file, 100);

    (small_file, medium_file, large_file, very_large_file)
}

fn create_synthetic_large_input(base_content: &str, multiplier: usize) -> String {
    let mut large_content = String::new();
    for i in 0..multiplier {
        // Modify line numbers to create unique warnings
        let modified_content = base_content.replace("line\": 42", &format!("line\": {}", 42 + i));
        large_content.push_str(&modified_content);
        large_content.push('\n');
    }
    large_content
}

fn bench_xcresult_parsing(c: &mut Criterion) {
    let (small_file, medium_file, large_file, very_large_file) = load_test_data();

    let mut group = c.benchmark_group("xcresult_parsing");

    // Small file benchmark
    group.bench_function("xcresult_small", |b| {
        b.iter(|| {
            let parser = XcresultParser::new(black_box(3));
            parser.parse_json(black_box(&small_file)).unwrap()
        })
    });

    // Medium file benchmark
    group.bench_function("xcresult_medium", |b| {
        b.iter(|| {
            let parser = XcresultParser::new(black_box(3));
            parser.parse_json(black_box(&medium_file)).unwrap()
        })
    });

    // Large file benchmark
    group.bench_function("xcresult_large", |b| {
        b.iter(|| {
            let parser = XcresultParser::new(black_box(3));
            parser.parse_json(black_box(&large_file)).unwrap()
        })
    });

    // Very large file benchmark (stress test)
    group.bench_function("xcresult_very_large", |b| {
        b.iter(|| {
            let parser = XcresultParser::new(black_box(3));
            parser.parse_json(black_box(&very_large_file)).unwrap()
        })
    });

    group.finish();
}

fn bench_xcodebuild_parsing(c: &mut Criterion) {
    // Create synthetic xcodebuild output for testing
    let small_output = create_xcodebuild_output(10);
    let medium_output = create_xcodebuild_output(100);
    let large_output = create_xcodebuild_output(1000);
    let very_large_output = create_xcodebuild_output(5000);

    let mut group = c.benchmark_group("xcodebuild_parsing");

    group.bench_function("xcodebuild_small", |b| {
        b.iter(|| {
            let parser = XcodeBuildParser::new(black_box(3));
            let cursor = std::io::Cursor::new(black_box(&small_output));
            let reader = BufReader::new(cursor);
            parser.parse_stream(reader).unwrap()
        })
    });

    group.bench_function("xcodebuild_medium", |b| {
        b.iter(|| {
            let parser = XcodeBuildParser::new(black_box(3));
            let cursor = std::io::Cursor::new(black_box(&medium_output));
            let reader = BufReader::new(cursor);
            parser.parse_stream(reader).unwrap()
        })
    });

    group.bench_function("xcodebuild_large", |b| {
        b.iter(|| {
            let parser = XcodeBuildParser::new(black_box(3));
            let cursor = std::io::Cursor::new(black_box(&large_output));
            let reader = BufReader::new(cursor);
            parser.parse_stream(reader).unwrap()
        })
    });

    group.bench_function("xcodebuild_very_large", |b| {
        b.iter(|| {
            let parser = XcodeBuildParser::new(black_box(3));
            let cursor = std::io::Cursor::new(black_box(&very_large_output));
            let reader = BufReader::new(cursor);
            parser.parse_stream(reader).unwrap()
        })
    });

    group.finish();
}

fn create_xcodebuild_output(warning_count: usize) -> String {
    let mut output = String::new();

    // Add some build output noise
    output.push_str("Build settings from configuration file '/path/to/project.xcconfig':\n");
    output.push_str("    CLANG_ANALYZER_NONNULL = YES\n");
    output.push_str("Building targets in dependency order\n");

    for i in 0..warning_count {
        // Add different types of Swift concurrency warnings
        match i % 4 {
            0 => {
                output.push_str(&format!(
                    "/path/to/Sources/MyApp/DataManager{}.swift:{}:15: warning: actor-isolated property 'shared' can not be referenced from a non-isolated context\n",
                    i, 42 + i
                ));
            }
            1 => {
                output.push_str(&format!(
                    "/path/to/Sources/MyApp/MyClass{}.swift:{}:7: warning: Type 'MyClass' does not conform to the 'Sendable' protocol\n",
                    i, 15 + i
                ));
            }
            2 => {
                output.push_str(&format!(
                    "/path/to/Sources/MyApp/RaceCondition{}.swift:{}:20: warning: data race detected in concurrent access to variable\n",
                    i, 55 + i
                ));
            }
            3 => {
                output.push_str(&format!(
                    "/path/to/Sources/MyApp/ViewModel{}.swift:{}:20: warning: Main actor-isolated property 'isLoading' can not be referenced from a nonisolated context\n",
                    i, 156 + i
                ));
            }
            _ => unreachable!(),
        }
    }

    // Add some more build output
    output.push_str("** BUILD SUCCEEDED **\n");
    output
}

fn bench_parsing_with_context_levels(c: &mut Criterion) {
    let test_file = fs::read_to_string("tests/fixtures/comprehensive_warnings.json")
        .expect("Failed to read test file");

    let mut group = c.benchmark_group("context_levels");

    for context_level in [0, 1, 3, 5, 10].iter() {
        group.bench_with_input(
            BenchmarkId::new("xcresult_context", context_level),
            context_level,
            |b, &context_level| {
                b.iter(|| {
                    let parser = XcresultParser::new(black_box(context_level));
                    parser.parse_json(black_box(&test_file)).unwrap()
                })
            },
        );
    }

    group.finish();
}

fn bench_memory_usage(c: &mut Criterion) {
    let large_file = create_synthetic_large_input(
        &fs::read_to_string("tests/fixtures/comprehensive_warnings.json").unwrap(),
        200,
    );

    c.bench_function("memory_stress_test", |b| {
        b.iter(|| {
            let parser = XcresultParser::new(black_box(3));
            let warnings = parser.parse_json(black_box(&large_file)).unwrap();

            // Force allocation and processing of all warnings
            let _count = warnings.len();
            let _serialized = serde_json::to_string(&warnings).unwrap();

            black_box(warnings)
        })
    });
}

fn bench_filtering_performance(c: &mut Criterion) {
    use swiftconcur_parser::cli::WarningTypeFilter;
    use swiftconcur_parser::parser::filter_warnings;

    let test_file = fs::read_to_string("tests/fixtures/comprehensive_warnings.json")
        .expect("Failed to read test file");

    let parser = XcresultParser::new(3);
    let warnings = parser.parse_json(&test_file).unwrap();

    let mut group = c.benchmark_group("filtering");

    group.bench_function("no_filter", |b| {
        b.iter(|| filter_warnings(black_box(warnings.clone()), black_box(None)))
    });

    group.bench_function("sendable_filter", |b| {
        b.iter(|| {
            filter_warnings(
                black_box(warnings.clone()),
                black_box(Some(WarningTypeFilter::Sendable)),
            )
        })
    });

    group.bench_function("actor_filter", |b| {
        b.iter(|| {
            filter_warnings(
                black_box(warnings.clone()),
                black_box(Some(WarningTypeFilter::ActorIsolation)),
            )
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_xcresult_parsing,
    bench_xcodebuild_parsing,
    bench_parsing_with_context_levels,
    bench_memory_usage,
    bench_filtering_performance
);

criterion_main!(benches);
