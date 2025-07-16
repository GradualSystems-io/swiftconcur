import Foundation

actor DataStore {
    private var data: [String: Any] = [:]
    
    func store(key: String, value: Any) {
        data[key] = value
    }
    
    func retrieve(key: String) -> Any? {
        return data[key]
    }
}

class DataManager {
    private let store = DataStore()
    
    func loadData() {
        // This line will trigger an actor isolation warning
        let count = store.data.count // Line 42 - actor-isolated property access
        print("Data count: \(count)")
    }
    
    func saveData(key: String, value: Any) async {
        await store.store(key: key, value: value)
    }
}