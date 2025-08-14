Fitness Functions & Continuous Improvement: 

Adopting the idea of evolutionary architecture, define some “fitness functions” or metrics that the system should always satisfy ￼. 

For instance, a fitness function can be “can process a 100MB log < 5s”, another could be “all routes respond with 99.9% uptime”, or “the system can be deployed with zero downtime”. 

Automate checks for these where feasible (some via tests, some via monitoring). This approach ensures the architecture supports guided, incremental change without regressing on key qualities.