# Chaos principles and honest claims

What the name nh-chaos-monkey may and may not promise, and the experiment record every finding should carry. Written from a research pass on 2026-11-08. Statements that are the skill's own design or inference say so, and the evidence table at the end lists each source with its date and caveats; one study (marked below) was fetched but not independently verified.

## Contents

- What the name means here
- The experiment card
- Baseline gate
- Stop conditions
- The fault lens
- What this skill must not claim
- Evidence and its limits

## What the name means here

Chaos engineering, as the [Principles of Chaos Engineering](https://principlesofchaos.org/) define it, builds confidence in a production system, and the page says plainly that it prefers experimenting on production traffic (page last updated March 2019). This skill is not meant to touch production, and its instructions forbid it. It runs adversarial reproducers, and fault-injecting reproducers, against code the user owns in a throwaway git worktree. That makes it hypothesis-driven fault finding for code, and its honest scope is finding code-level defects such as missing fallbacks, bad retry logic and unhandled errors before they reach production. It says nothing about how a deployed system behaves.

## The experiment card

Every finding in the report should read as one small experiment. The fields come from the AWS Well-Architected control [REL12-BP04](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_testing_resiliency_failure_injection_resiliency.html) and the AWS Architecture Blog post [Verify the resilience of your workloads using Chaos Engineering](https://aws.amazon.com/blogs/architecture/verify-the-resilience-of-your-workloads-using-chaos-engineering/) (2022-10-26); mapping them onto code is this skill's design, not a quote.

| Field | In this skill |
| --- | --- |
| Steady state | The judge is green and runs a counted number of tests. This is the measurable output that says "normal" |
| Hypothesis | AWS template: "If a specific fault occurs, the workload will use its mitigating controls to maintain the metric." Here: "If X happens at Y, the module should Z, as its contract says" |
| Fault or input | The reproducer, with its kind (bad input, ordering, injected dependency failure) and where it strikes |
| Fired proof | For a fault, evidence in the output that the fault really fired. See the fault lens below |
| Observation | The command, both exit statuses, the first run's output tail |
| Verdict | Confirmed, lead or invalid, by the rules in the judge protocol |
| Stop conditions | The caps and halts listed below |
| Restore | Discard the worktree and branch; rejected attempts stay under refs/chaos/rejected |

## Baseline gate

AWS says an experiment should be fail-safe and tolerated by the workload by default, and that if you know the workload will fail you should not run the experiment, because a broken workload yields no insight. The Chaos Toolkit experiment specification goes further: when the steady state is not met, the method is not applied and the run must bail out. The loop applies this literally. It refuses to start unless the judge is green with at least one counted test, and it never reports a resilience finding from a red baseline.

A flaky judge is a case the sources do not settle. The skill's own inference is to run the judge a few times first and ask the user before proceeding if the results disagree.

## Stop conditions

The Principles ask the engineer to keep fallout minimized and contained but give no concrete abort criteria, and AWS describes stop conditions as thresholds on guardrail metrics, including a synthetic check that stands in for the user. The skill defines its own, in code:

- round, finding, attempt and token caps, and a plateau stop;
- a protected file changed (the attempt is rejected and the next attempt starts clean; the rejudge halts the run if the manifest check still fails), any worktree left dirty, any head that moved during confirmation;
- any disagreement between the independent rejudge and the verifier;
- a round in which every breaker was silent. Silence is never a clean result.

Netflix's ChAP paper (2019) reports having to raise its automatic stop threshold on error counts substantially because the metric was noisy, and calls that stop a cruder test than its canary statistics. The lesson taken here: stop on counts and exact checks that the loop can compute, not on a noisy signal.

## The fault lens

The default lenses include one that injects failures of dependencies and the environment through test doubles: timeouts, thrown errors, malformed or partial responses, slow calls, clock jumps, exhausted limits. Its instructions say to use stubs and never a real service; only a sandbox enforces that. Code-level fault injectors give the design: gofail and fail-rs use named injection points and a small term syntax of action plus a probability or count, and Toxiproxy describes a fault by type, direction, probability and attributes.

Proof that a fault fired is the rule that matters most. With fail-rs, when the failpoints feature is off, a configured fault does nothing and nothing errors. A reproducer that never exercised its fault proves nothing, so a fault-lens reproducer must count how often its fault fired and exit 0 with NOT-FIRED printed when the count is zero, and the confirmer accepts a fault-based break only when the output shows the fault fired. A study of faults injected into MCP tool calls (MCP-Injector, arXiv 2610.32555, 2026) reports faulted runs where no fault was delivered at all, which is why the count is recorded rather than assumed. That paper was fetched during research and not independently verified.

## What this skill must not claim

- That the code, or a service built from it, is resilient, robust, secure or production-ready.
- That a fault class is handled. A run that finds nothing says only that no break was found within the caps, by these lenses, with this judge.
- Anything about behaviour under load or saturation. A single-process run resembles Netflix's "diffuse" class, which can check the logic of a fallback but not what happens at scale (ChAP blog, 2017).
- That a fault fired when no fire count or output shows it.
- That the worktree undoes every effect. It reverts tracked source files. External side effects, and the git directory a linked worktree shares with the primary checkout, are not restored by discarding it.
- That a result is reproducible by someone else without a determinism control. Reproducers are ordinary scripts, so say how they were run.
- That agent output is proof. It is evidence until the main session has re-run the checks.

## Evidence and its limits

| Source | Date | Used for | Caveat |
| --- | --- | --- | --- |
| Principles of Chaos Engineering | 2019-03 | Production preference, blast radius duty | Older than 2024, stable |
| Netflix ChAP blog and ICSE-SEIP paper | 2017, 2019 | Safety envelope, noisy abort, diffuse experiments | One company's self-report about production traffic; applied here by analogy |
| AWS REL12-BP04 and Architecture Blog | live page checked 2026-11-08; post 2022-10-26 | Spec fields, baseline gate, stop conditions | Vendor best practice; the field list is this skill's inference |
| gofail, fail-rs, Toxiproxy | repositories checked 2026-11-08 | Fault syntax, fired proof | Network-level or build-level tools, not agent loops |
| [Chaos Toolkit experiment specification](https://chaostoolkit.org/reference/api/experiment/) | page read 2026-11-08 | Bail out when the steady state is not met | A verifier's aside during research, not a voted claim |
| MCP-Injector, arXiv 2610.32555 | 2026 | Faults that never fire | Fetched, not independently verified |

Not established by the research, so not relied on: what the 2025-2026 papers on chaos for LLM agents and MCP calls (MCP-Injector, AgentChaos, MAS-FIRE, ReliabilityBench) prescribe, the Simian Army lessons, and a defensible baseline-repeat count for flaky judges.
