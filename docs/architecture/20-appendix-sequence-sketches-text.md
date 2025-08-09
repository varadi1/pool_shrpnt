# 20) Appendix — Sequence Sketches (text)

**New EM Provision**

1. PM fills wizard → `POST /api/orders` → queue `provision.em`
2. Worker creates Team/Channel (opt), SP library folders, applies ACLs
3. Audit emitted; UI polls status; success toast

**T+0,1..8 Auto‑lock**

1. Scheduler scans EMs → compute state transitions
2. Queue `locks.apply` → SP permission changes → audit + notifications
3. CR expiry tasks re‑lock when due

*End of v0.1*

