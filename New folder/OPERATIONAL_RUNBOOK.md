# Operational Runbook: 10-Project Ecosystem

## Daily Operations

### Morning Checklist (09:00)
```
1. Finance Agent: Verify overnight revenue collected
2. ARIA Stack: Check all agents online
3. VELA Stack: Check all agents online
4. Message Bus: Confirm event throughput >100/hour
5. Project 1 Dashboard: Verify data freshness
6. Projects 9-10: Check API response times
```

### Incident Response

**High-severity alerts**:
- Agent offline >5 min → Restart stack + notify
- Revenue drop >20% → Investigate agent logs
- Message Bus lag >1 min → Check queue depth + restart
- API errors >5% → Rollback recent changes

**Low-severity alerts**:
- Response time >500ms → Optimize query
- Data sync delay 1-5 min → Monitor & continue

### Weekly Tasks
- [ ] Review revenue trends (Projects 1, 10)
- [ ] Archive daily logs (7-day retention)
- [ ] Test failover procedures
- [ ] Update documentation

### Monthly Tasks
- [ ] Finance Agent: Monthly reconciliation
- [ ] Stack performance review
- [ ] Capacity planning (prep for scale)
- [ ] Security audit (Project 1 credentials)

## Monitoring Dashboard
- **Real-time**: Project 1 (Maillard AI)
- **Historical**: Project 10 (SaaS Metrics)
- **API health**: Project 9 endpoints
- **Logs**: Centralized error aggregation

## Maintenance Windows
- **Schedule**: Sundays 02:00–04:00 UTC
- **Duration**: 2 hours max
- **Stacks affected**: All (graceful shutdown)
- **Fallback**: Manual mode enabled

## Escalation Path
1. **Agent Issue**: Check logs → Restart → Alert squad
2. **Finance Agent**: Recalculate manually → Investigate
3. **Message Bus**: Isolate → Drain queue → Restart
4. **Full outage**: Execute rollback plan → Incident report

## Access & Credentials
- **Project 1 admin**: admin@empire.ai / empire2024
- **API endpoints**: /api/* (rate limit 1000/hour)
- **Logs location**: ./logs/ (daily rotation)
- **Backup location**: ./backups/ (hourly snapshots)

**All systems operational. Ready for Phase 1 launch.**
