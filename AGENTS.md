# Iroha 2 Block Explorer – Agent Brief

This repository hosts the web front-end for the Iroha 2 Block Explorer. It must evolve alongside the upstream Iroha stack located in the sibling repo `../iroha` (Torii, Norito RPC, telemetry, governance, SoraFS, etc.). Every change here should reflect the capabilities exposed there.

## Operating Rules

1. **Task Source of Truth**  
   - All work items live in `ROADMAP.md`.  
   - Always consult that file before starting work.  
   - Update the roadmap entry (status, notes) as soon as a task moves forward or completes.

2. **Testing Discipline**  
   - Whenever you add a new function (frontend or backend helper), add accompanying tests.  
   - For any logic that is non-trivial (branching, transformations, aggregations), write more than one test to cover different paths/edge cases.

3. **Upstream Awareness**  
   - Study `../iroha` frequently to stay aligned with Torii APIs and Norito codecs.  
   - Use the current Torii/Norito API contracts directly, including the expected transport and payload formats.

4. **Serialization Rules**  
   - Torii and the Explorer must rely on Norito for payloads; avoid serde/non-Norito codecs at the API layer.  
   - If an existing handler or DTO still uses serde, schedule work in `ROADMAP.md` to replace it with Norito equivalents.

5. **No Fallbacks or Hacks**  
   - Do not add fallback paths, compatibility shims, mock payloads, or quick hacks to make broken flows appear to work.  
   - Call the authoritative APIs correctly with their required routes, transports, codecs, and data formats; fix the contract mismatch or schedule upstream/frontend work in `ROADMAP.md` when something is missing.

6. **Large Requests Handling**  
   - When a request or task is large or multi-faceted, break it down into smaller actionable subtasks automatically.  
   - Tackle the subtasks with proper software engineering practices instead of rejecting the work.

Keep this file up to date if our process changes.
