# 15) CI/CD (GitHub Actions)

- **Pipelines**: lint/test → build images → push to ACR → deploy (SSH or runner on VM) → run DB migrations → warmup health checks.
- **Quality gates**: unit/integration tests; OpenAPI drift check; dependency audit; container scan.

---
