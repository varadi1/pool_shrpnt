from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="POOLDRV_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "poolDRV API"
    app_version: str = "0.1.0"
    debug: bool = False
    environment: str = "development"

    api_prefix: str = "/api/v1"
    allowed_hosts: list[str] = ["*"]
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ]

    database_url: str = "postgresql://pooldrv:pooldrv@localhost:5432/pooldrv"
    database_echo: bool = False
    database_pool_size: int = 5
    database_max_overflow: int = 10

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "RS256"
    jwt_issuer: str | None = None
    jwt_audience: str | None = None

    # Azure AD Configuration
    azure_tenant_id: str | None = None
    azure_client_id: str | None = None
    azure_client_secret: str | None = None
    azure_service_account_email: str = "noreply@contoso.onmicrosoft.com"

    # Compatibility aliases for existing code
    @property
    def tenant_id(self) -> str | None:
        return self.azure_tenant_id

    @property
    def client_id(self) -> str | None:
        return self.azure_client_id

    @property
    def client_secret(self) -> str | None:
        return self.azure_client_secret

    @property
    def AZURE_TENANT_ID(self) -> str | None:
        return self.azure_tenant_id

    @property
    def AZURE_CLIENT_ID(self) -> str | None:
        return self.azure_client_id

    @property
    def AZURE_CLIENT_SECRET(self) -> str | None:
        return self.azure_client_secret

    @property
    def AZURE_SERVICE_ACCOUNT_EMAIL(self) -> str:
        return self.azure_service_account_email

    # SharePoint Configuration
    sharepoint_site_url: str | None = None
    sharepoint_tenant_name: str | None = None

    graph_base_url: str = "https://graph.microsoft.com/v1.0"
    graph_timeout: int = 30
    graph_max_retries: int = 3
    graph_batch_size: int = 20
    max_concurrent_graph_requests: int = 5

    # Compatibility aliases
    @property
    def GRAPH_API_BASE(self) -> str:
        return self.graph_base_url

    @property
    def GRAPH_BATCH_SIZE(self) -> int:
        return self.graph_batch_size

    @property
    def MAX_CONCURRENT_GRAPH_REQUESTS(self) -> int:
        return self.max_concurrent_graph_requests

    log_level: str = "INFO"
    log_format: str = "json"

    idempotency_window_seconds: int = 86400

    # Lock Management Configuration
    lock_cleanup_interval_seconds: int = 3600  # 1 hour
    lock_cleanup_batch_size: int = 50
    lock_default_expiration_hours: int = 24
    lock_max_extension_hours: int = 168  # 7 days

    # Permission Sync Configuration
    permission_sync_batch_size: int = 100
    permission_sync_retry_max_attempts: int = 3
    permission_sync_retry_base_delay: float = 1.0
    permission_sync_retry_max_delay: float = 30.0

    # Cache Configuration
    redis_job_ttl_seconds: int = 86400  # 24 hours
    token_cache_buffer_seconds: int = 300  # 5 minutes before expiry
    default_token_expiry_seconds: int = 3600  # 1 hour

    # Monitoring Configuration
    lock_health_check_minutes: int = 30
    lock_warning_threshold_minutes: int = 20
    metrics_history_hours: int = 24

    # Compatibility aliases
    @property
    def LOCK_CLEANUP_INTERVAL_SECONDS(self) -> int:
        return self.lock_cleanup_interval_seconds

    @property
    def LOCK_CLEANUP_BATCH_SIZE(self) -> int:
        return self.lock_cleanup_batch_size

    enable_openapi: bool = True
    openapi_url: str = "/openapi.json"
    docs_url: str = "/docs"
    redoc_url: str = "/redoc"


settings = Settings()
