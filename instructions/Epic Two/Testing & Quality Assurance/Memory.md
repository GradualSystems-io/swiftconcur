	•	Test for Memory Usage (Streaming): Write a test to ensure the parser doesn’t consume excessive memory for large files. 
    
    This could be an integration test that monitors memory (if possible) or simply a design of the test input such that if the implementation tried to load the whole file, it would exhaust memory. 
    
    Essentially, assert that the code processes data in a streaming fashion (one way is to process the input in chunks and perhaps count that peak memory remains bounded).