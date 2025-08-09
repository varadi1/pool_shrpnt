# 14) Infrastructure & Environments (Azure)

- **Containerization**: `api`, `worker`, `scheduler`, `web` (static build served by reverse proxy), `db` (Postgres 15), `redis`.
- **Runtime (MVP)**: Azure **Linux VM** running **Docker Compose** (staging/prod), behind Azure Application Gateway (TLS). Alternative later: Azure Container Apps/AKS (unchanged app images).
- **Networking**: VNet + NSG; outbound to Graph/SharePoint; restricted inbound (HTTPs only via gateway).
- **Storage/DB**: Azure‑managed Postgres Flexible Server; backups + PITR enabled.
- **Artifacts**: Azure Container Registry (ACR); images built by GitHub Actions.
- **DNS**: custom domain; managed TLS certificates.

**Environments**: `dev` (sandbox tenant) · `staging` · `pilot` · `prod`. Feature flags via env.

---
