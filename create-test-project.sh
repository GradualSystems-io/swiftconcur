#!/bin/bash

echo "🏗️ Creating test Swift project with concurrency warnings..."

mkdir -p TestSwiftConcur
cd TestSwiftConcur

# Create Package.swift
cat > Package.swift << 'EOF'
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TestSwiftConcur",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "TestSwiftConcur", targets: ["TestSwiftConcur"]),
    ],
    targets: [
        .target(name: "TestSwiftConcur"),
        .testTarget(name: "TestSwiftConcurTests", dependencies: ["TestSwiftConcur"]),
    ]
)
EOF

# Create source directory
mkdir -p Sources/TestSwiftConcur

# Create Swift file with concurrency warnings
cat > Sources/TestSwiftConcur/ActorIsolationExample.swift << 'EOF'
import Foundation

@MainActor
class DataManager: ObservableObject {
    @Published var data: String = ""
    private var cache: [String: String] = [:]
    
    func updateData(newData: String) {
        self.data = newData
        self.cache[newData] = newData
    }
}

class NetworkService {
    let dataManager = DataManager()
    
    func fetchData() async {
        let result = await performNetworkCall()
        
        // This will generate actor isolation warnings
        dataManager.data = result  // ❌ Main actor-isolated property
        dataManager.cache["key"] = result  // ❌ Main actor-isolated property
        dataManager.updateData(newData: result)  // ❌ Main actor-isolated method
    }
    
    private func performNetworkCall() async -> String {
        return "Sample data"
    }
}
EOF

# Create file with Sendable issues
cat > Sources/TestSwiftConcur/SendableExample.swift << 'EOF'
import Foundation

// Non-Sendable class
class NonSendableClass {
    var value: String = ""
}

// This will generate Sendable conformance warnings
class ConcurrencyManager {
    func processData() async {
        let nonSendable = NonSendableClass()
        
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                // ❌ Capture of non-sendable type
                print(nonSendable.value)  
            }
        }
        
        Task {
            // ❌ Capture of non-sendable type
            nonSendable.value = "updated"
        }
    }
}
EOF

# Create file with data race potential
cat > Sources/TestSwiftConcur/DataRaceExample.swift << 'EOF'
import Foundation

actor CounterActor {
    private var count = 0
    
    func increment() {
        count += 1
    }
    
    func getCount() -> Int {
        return count
    }
}

class UnsafeCounter {
    private var count = 0
    
    func increment() {
        // Potential data race in concurrent access
        count += 1
    }
    
    func concurrentAccess() {
        Task {
            for _ in 0..<1000 {
                increment()  // ❌ Potential data race
            }
        }
        
        Task {
            for _ in 0..<1000 {
                increment()  // ❌ Potential data race
            }
        }
    }
}
EOF

# Create test file
mkdir -p Tests/TestSwiftConcurTests
cat > Tests/TestSwiftConcurTests/TestSwiftConcurTests.swift << 'EOF'
import XCTest
@testable import TestSwiftConcur

final class TestSwiftConcurTests: XCTestCase {
    func testExample() throws {
        // Basic test to ensure compilation
        let counter = UnsafeCounter()
        counter.concurrentAccess()
    }
}
EOF

echo "✅ Test project created in TestSwiftConcur/"
echo
echo "To test with our parser:"
echo "1. cd TestSwiftConcur"
echo "2. swift build 2>&1 | tee build.log"
echo "3. cat build.log | ../parser/target/release/swiftconcur-parser --format markdown"