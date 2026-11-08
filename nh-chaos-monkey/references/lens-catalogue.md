# Lens catalogue

A lens is a short brief that tells one breaker where to look. The loop runs one breaker per lens each round, at most six lenses. A reproducer must fail on the current tree, exit non-zero, and run through one of the allowed runners, whatever the lens. Pass your own list in the lenses argument to replace the defaults; a brief is trimmed to 600 characters, so put any rule that must not be lost near the start.

## Default lenses

| Key | Looks for |
| --- | --- |
| boundaries | Inputs at the edges: empty, zero, one, maximum, negative, duplicated, unsorted, unicode, very large, null or undefined |
| state-order | Repeated calls, idempotency, re-entrancy, concurrency, resource cleanup, mutation of shared inputs |
| error-paths | Swallowed errors, partial completion, wrong error type, missing validation, timeouts |
| contract | Behaviour that contradicts the documented contract: docs, comments, types, naming, or what the existing tests imply |
| faults | Failures of dependencies and the environment, injected with test doubles or stubs and never real services: timeouts, thrown errors, malformed or partial responses, slow calls, clock jumps, exhausted limits. The reproducer counts how often its fault fired and exits 0 printing NOT-FIRED if it never did |

The fifth lens is what separates this skill from an ordinary adversarial test run, and it makes each round about a fifth more expensive. Drop it with a lenses list that omits it when the code has no dependencies to fail.

## Optional lenses

Paste the JSON into the lenses argument alongside or instead of the defaults.

```json
[
  { "key": "variants", "brief": "Variants of bugs this project already fixed: read the last 20 commits with git log -p, skip docs-only and trivial ones, and look for the same class of mistake in code the fix did not touch" },
  { "key": "oracle", "brief": "Differential testing against a known-good oracle: a reference implementation, a standard library function or a documented table of expected outputs; compare results on generated inputs and report the first disagreement" },
  { "key": "invariants", "brief": "Metamorphic and round-trip properties: encode then decode returns the input, sorting twice equals sorting once, a permuted input gives the same total; report an input that breaks one" },
  { "key": "hostile-input", "brief": "Hostile input: path traversal, injection into commands or queries, catastrophic regular expressions, unbounded allocation, deeply nested or huge values; the reproducer stays inside the scratch directory and must not touch the network" }
]
```

The variants lens follows the variant-analysis approach reported by Project Zero for its Big Sleep work (2024): start from recent fixes and ask where else the same mistake lives. That report is a single anecdote on one bug, so treat the lens as a reasonable hypothesis, not a measured gain.

## Lenses the loop does not support yet

- Mutation-guided testing in the style of Meta's ACH (2025) asks for tests that fail on a deliberately faulty copy and pass on the original. The loop's confirmation rule needs a reproducer that fails on the current tree, so a mutation lens needs different confirmation semantics. It also needs a policy for equivalent mutants; Meta reports that cheap preprocessing before an equivalence check helped a lot. Not implemented.
- Property-based and coverage-guided fuzzing tools can be named in a lens brief when the project already depends on one, because the reproducer may use any dependency the project already has. The loop does not install tools.
- A held-out set of reproducers that the fixer never sees would measure overfitting. Not implemented.
