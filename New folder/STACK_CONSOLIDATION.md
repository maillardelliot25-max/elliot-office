# Stack Consolidation & Cross-Stack Communication

## Architecture Overview
```
[ARIA Manager] ─────┐
[VELA Manager] ─────├─→ [Message Bus] ─→ [Finance Agent] ─→ [Maillard Dashboard]
[TEMPA Manager] ────┘                          ↓
                                    [Data Aggregator] ─→ [Project 9 API]
                                                          [Project 10 Charts]
```

## Message Bus Specification
**Technology**: Event-driven (in-memory queue for local, webhooks for distributed)

**Event Types**:
```
{
  "type": "revenue_update",
  "stack": "ARIA",
  "agent": "linkedin_agent",
  "amount": 250,
  "timestamp": "2026-04-03T14:23:45Z"
}

{
  "type": "task_completed",
  "stack": "VELA",
  "agent": "ai_dev_agent",
  "tasks": 5,
  "timestamp": "2026-04-03T14:23:45Z"
}
```

## Data Aggregator Functions
1. **Collect** → Consume events from all 3 stacks
2. **Validate** → Verify amounts, timestamps, agent IDs
3. **Deduplicate** → Prevent double-counting
4. **Aggregate** → Sum by hour/day/month
5. **Broadcast** → Emit to Finance Agent + Projects 9-10

## Stack Reporting Requirements
| Stack | Report Interval | Metrics |
|-------|-----------------|---------|
| ARIA | Hourly | Revenue, task count, agent status |
| VELA | Hourly | Revenue, task count, agent status |
| TEMPA | TBD | [Pending configuration] |

## Communication Endpoints
```
POST /api/events/revenue          ← Agents push updates
POST /api/events/task_complete    ← Task completion logs
GET /api/finance/summary          ← Finance Agent query
GET /api/stacks/health            ← Cross-stack status check
```

## Failure Handling
- **Missed heartbeat** (>5 min): Mark stack as degraded
- **Invalid event**: Log + skip
- **Network timeout**: Queue + retry with exponential backoff
- **Data mismatch**: Alert Finance Agent for manual review

## Deployment Checklist
- [ ] Message bus initialized
- [ ] All 3 stacks report heartbeat
- [ ] Finance Agent receives events
- [ ] Projects 9-10 display aggregated data
- [ ] Error logging active

**Status: Ready for implementation**
**Dependency: ARIA/VELA stack confirmation**
