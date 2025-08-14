	•	Streaming and Chunked Processing: Ensure the log processing is implemented in a streaming manner to handle large 100MB files efficiently. 
    
    In Rust, this means using streaming readers (like std::io::BufReader) and parsing incrementally rather than slurping the entire file into memory. 
    
    A BufReader reads the underlying file in large blocks and buffers it, reducing system calls and improving speed for large files ￼ ￼. By reading in chunks (e.g., 8MB blocks as one experiment suggests ￼) or line by line through a buffered reader, you avoid memory bloat and keep throughput high.