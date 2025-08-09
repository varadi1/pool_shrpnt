#!/bin/bash

# Generate TypeScript client from OpenAPI specification

set -e

echo "Generating TypeScript client from OpenAPI spec..."

# Check if openapi-generator is installed
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js"
    exit 1
fi

# Generate the client using openapi-generator
npx @openapitools/openapi-generator-cli generate \
  -i ../openapi.json \
  -g typescript-fetch \
  -o ./api-client \
  --additional-properties=supportsES6=true,npmName=pooldrv-api-client,npmVersion=0.1.0,withInterfaces=true

echo "TypeScript client generated in libs/api-client/"

# Create additional type exports for better DX
cat > ./api-client/types.ts << 'EOF'
// Convenience type exports for poolDRV API

export type {
    Contract,
    ContractCreate,
    ContractUpdate,
    ContractList,
} from './models/Contract';

export type {
    OrderEm,
    OrderEmCreate,
    OrderEmUpdate,
    OrderEmList,
    ProvisionRequest,
    ProvisionResponse,
} from './models/Order';

export type {
    JobStatus,
    JobResult,
} from './models/Job';

export type {
    ErrorResponse,
    ValidationErrorResponse,
    RateLimitErrorResponse,
    GraphAPIErrorResponse,
} from './models/Error';

// API Configuration type
export interface PoolDRVApiConfig {
    basePath: string;
    accessToken?: string;
    correlationId?: string;
    headers?: Record<string, string>;
}
EOF

echo "Type exports created"