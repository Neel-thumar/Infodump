## Why This Matters

Most nginx performance problems are not caused by nginx being slow. They're caused by incorrect defaults, misconfigured buffers, missing compression, or connection limits that don't match the traffic. Fixing these doesn't require exotic knowledge — it requires understanding what each setting controls and measuring before changing.

Logging is equally critical. nginx can tell you exactly what happened to every request: which backend served it, how long it took, what status code it returned, and whether caching was involved. But the default log format leaves out most of that. Custom logging turns nginx from a black box into an observable system.

