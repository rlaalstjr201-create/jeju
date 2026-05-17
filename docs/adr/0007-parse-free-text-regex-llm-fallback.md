# ADR 0007: Natural Language Date Parsing — Regex Pre-filter with LLM Fallback

Status: Accepted (2026-05-17)

## Context

`POST /api/v1/trips` accepts a free-text string (e.g., "3박4일 제주 가요", "이번 주말에 여행", "5월 말에 2박"). This text must be converted to a `{ startDate: CalendarDate, endDate: CalendarDate }` pair to create a Trip (ADR-0002: dateRange required).

Parsing options include: pure regex, pure LLM structured output, or a tiered approach. The primary user context is Korean Tagalong travellers, whose input patterns are predictable ("N박N일" accounts for an estimated ~60% of real inputs).

Design principle B3 (Immediate) sets a target of <5 seconds for the full flow. LLM calls introduce ~600ms latency. Auth verification (~200ms) is on the critical path; parse latency adds to it.

## Decision

Three-tier parsing pipeline, implemented entirely in the infrastructure layer (`ParseFreeTextPort ↔ LLMParseFreeTextAdapter`):

| Tier | Trigger | Latency | Handler |
|------|---------|---------|---------|
| Regex | `\d박\d일` pattern | < 5ms | Direct extraction |
| LLM | All other inputs | ~600ms | Claude API structured output `{ startDate, nights }` |
| D2 Default | LLM also fails | 0ms | Next weekend, 1박2일 (KST); `dateInferred: true` |

Auth verification and text parsing run in parallel (`Promise.all`) — LLM path latency is absorbed into the auth round trip.

The port interface is `ParseFreeTextPort.parse(text): Promise<ParsedDateRange>`. The domain and application layers see only the port; the tier logic is an infrastructure implementation detail.

## Consequences

**Positive:**
- B3 (Immediate): regex path ~400ms total (auth parallel); LLM path ~850ms — both well within 5s.
- A2 (Smart): LLM understands "이번 주말", "5월 말에" — not just rigid formats.
- B1 (Trustworthy): D2 default is always shown with `dateInferred: true`; no silent black-box failure.
- Clean seam: the tier logic can be changed without touching use cases.

**Negative:**
- Two external dependencies (regex: none; LLM: Claude API). LLM path has API cost.
- LLM structured output can still return invalid dates (e.g., Feb 30). The adapter must validate before returning.

**Risk:**
- Claude API outage cascades to LLM parse failures, pushing all non-regex inputs to the D2 default. Users whose input was parseable by LLM will see an inferred date unexpectedly. This is acceptable (D2 default is always correctable) but should be monitored.

## Alternatives Considered

**Pure LLM only:** Rejected.
- Every request incurs ~600ms parse latency. Combined with auth (~200ms), the critical path exceeds 800ms before any DB write. This was deemed unnecessary for the ~60% of inputs that match the simple regex pattern.
- API cost scales with every Trip creation, not just complex inputs.

**Pure regex only:** Rejected.
- Cannot handle "이번 주말", "5월 말에", date references without an explicit "N박N일" pattern. These are common Tagalong inputs. Falling back to D2 default for all ambiguous inputs degrades A2 (Smart).

**Client-side date picker (no parsing):** Rejected.
- Contradicts the "한 줄 입력" UX goal. Adds an extra interaction step, violating B2 (Lightweight) and the partner-like feel (A4).
