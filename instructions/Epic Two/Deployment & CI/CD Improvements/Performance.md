	•	CI for Performance Budgets: Given the speed targets, incorporate performance checks into CI. 
    
    For example, use Rust’s benchmark tests (or the criterion crate) to measure parsing speed. 
    
    Although CI machines may vary, tracking performance trends or at least running a lightweight benchmark can alert if a change makes parsing slower than expected.