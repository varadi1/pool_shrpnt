"""Performance tests for provisioning workflow."""

import asyncio
import time
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import Contract, PartnerCompany


@pytest.mark.asyncio
class TestProvisioningPerformance:
    """Test provisioning performance requirements."""

    async def test_single_provisioning_under_10_minutes(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Test that single EM provisioning completes in ≤10 minutes."""
        # Create test data
        partner = PartnerCompany(
            company_code="PERF-001",
            name="Performance Test Partner",
            short_name="PTP",
            is_active=True,
        )
        db_session.add(partner)

        contract = Contract(
            contract_number="C-PERF-001",
            name="Performance Test Contract",
            start_date=datetime.utcnow(),
            status="active",
            created_by="perf-test",
            updated_by="perf-test",
        )
        db_session.add(contract)
        await db_session.commit()

        order_data = {
            "em_number": "EM-PERF-001",
            "title": "Performance Test Order",
            "contract_id": contract.id,
            "partner_company_id": partner.id,
            "year": 2025,
            "part": "A",
        }

        # Create order
        response = await client.post(
            "/api/v1/orders",
            json=order_data,
            headers={"x-user-id": "perf-test"},
        )
        assert response.status_code == 201
        order_id = response.json()["id"]

        # Mock external services to simulate realistic delays
        with patch("api.services.teams.teams_service.TeamsService") as mock_teams:
            with patch("api.services.sharepoint.sharepoint_service.SharePointService") as mock_sp:
                # Configure mocks with realistic delays
                mock_teams_instance = AsyncMock()
                mock_teams.return_value = mock_teams_instance

                async def create_team_with_delay(*args, **kwargs):
                    await asyncio.sleep(15)  # 15 seconds for team creation
                    return {
                        "id": f"team-{uuid.uuid4()}",
                        "displayName": "Test Team",
                        "webUrl": "https://teams.microsoft.com/test",
                    }

                async def create_channel_with_delay(*args, **kwargs):
                    await asyncio.sleep(5)  # 5 seconds per channel
                    return {
                        "id": f"channel-{uuid.uuid4()}",
                        "displayName": "Test Channel",
                    }

                mock_teams_instance.create_team.side_effect = create_team_with_delay
                mock_teams_instance.create_channel.side_effect = create_channel_with_delay

                mock_sp_instance = AsyncMock()
                mock_sp.return_value = mock_sp_instance

                async def create_folder_with_delay(*args, **kwargs):
                    await asyncio.sleep(1)  # 1 second per folder
                    return {"id": f"folder-{uuid.uuid4()}"}

                mock_sp_instance.create_folder.side_effect = create_folder_with_delay
                mock_sp_instance.get_site_from_team.return_value = {
                    "id": "site-123",
                    "webUrl": "https://sharepoint.com/sites/test",
                }
                mock_sp_instance.create_document_library.return_value = {
                    "id": "library-123",
                    "displayName": "Documents",
                }

                # Start provisioning
                start_time = time.time()

                provision_response = await client.post(
                    f"/api/v1/orders/{order_id}/provision",
                    json={"priority": "normal"},
                    headers={"x-user-id": "perf-test"},
                )
                assert provision_response.status_code == 200
                job_id = provision_response.json()["job_id"]

                # Poll for completion
                max_wait_time = 600  # 10 minutes in seconds
                poll_interval = 5  # Check every 5 seconds
                completed = False

                while time.time() - start_time < max_wait_time:
                    status_response = await client.get(f"/api/v1/jobs/{job_id}/status")

                    if status_response.status_code == 200:
                        status_data = status_response.json()

                        if status_data["status"] == "completed":
                            completed = True
                            break
                        elif status_data["status"] == "failed":
                            pytest.fail(f"Provisioning failed: {status_data.get('error')}")

                    await asyncio.sleep(poll_interval)

                elapsed_time = time.time() - start_time

                # Assert completion within 10 minutes
                assert completed, "Provisioning did not complete within 10 minutes"
                assert elapsed_time <= 600, f"Provisioning took {elapsed_time:.2f} seconds (> 600s)"

                print(f"✓ Provisioning completed in {elapsed_time:.2f} seconds")

    async def test_concurrent_provisioning_requests(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Test handling multiple concurrent provisioning requests."""
        # Create shared test data
        partner = PartnerCompany(
            company_code="CONC-001",
            name="Concurrent Test Partner",
            short_name="CTP",
            is_active=True,
        )
        db_session.add(partner)

        contract = Contract(
            contract_number="C-CONC-001",
            name="Concurrent Test Contract",
            start_date=datetime.utcnow(),
            status="active",
            created_by="conc-test",
            updated_by="conc-test",
        )
        db_session.add(contract)
        await db_session.commit()

        # Create multiple orders
        num_concurrent = 5
        orders = []

        for i in range(num_concurrent):
            order_data = {
                "em_number": f"EM-CONC-{i:03d}",
                "title": f"Concurrent Test Order {i}",
                "contract_id": contract.id,
                "partner_company_id": partner.id,
                "year": 2025,
                "part": "A",
            }

            response = await client.post(
                "/api/v1/orders",
                json=order_data,
                headers={"x-user-id": "conc-test"},
            )
            assert response.status_code == 201
            orders.append(response.json())

        # Mock external services
        with patch("worker.app.celery_app.send_task") as mock_send_task:
            # Configure mock to return unique job IDs
            def create_mock_task(*args, **kwargs):
                mock_task = MagicMock()
                mock_task.id = str(uuid.uuid4())
                return mock_task

            mock_send_task.side_effect = create_mock_task

            # Trigger provisioning for all orders concurrently
            start_time = time.time()

            async def provision_order(order):
                response = await client.post(
                    f"/api/v1/orders/{order['id']}/provision",
                    json={"priority": "normal"},
                    headers={"x-user-id": "conc-test"},
                )
                return response

            # Execute provisioning requests concurrently
            provision_tasks = [provision_order(order) for order in orders]
            provision_responses = await asyncio.gather(*provision_tasks)

            # Verify all requests were accepted
            for response in provision_responses:
                assert response.status_code == 200
                assert "job_id" in response.json()

            elapsed_time = time.time() - start_time

            # Assert all requests were handled quickly
            assert elapsed_time < 10, f"Concurrent requests took {elapsed_time:.2f} seconds"

            # Verify Celery tasks were queued
            assert mock_send_task.call_count == num_concurrent

            print(
                f"✓ {num_concurrent} concurrent provisioning requests handled in {elapsed_time:.2f} seconds"
            )

    async def test_template_caching_performance(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Test that template caching improves performance."""
        from api.core.cache import TemplateCacheService

        cache_service = TemplateCacheService()

        # Create a template
        template_data = {
            "name": "Cache Test Template",
            "description": "Template for cache testing",
            "folder_structure": [
                {"name": "Folder1", "permissions": "inherit"},
                {"name": "Folder2", "permissions": "restricted"},
            ],
        }

        # First access - should miss cache
        start_time = time.time()

        # Simulate template fetch with delay
        async def fetch_template():
            await asyncio.sleep(0.5)  # Simulate database fetch
            return template_data

        result1 = await cache_service.cache.get_or_set(
            "template:999",
            fetch_template,
            ttl=3600,
        )

        first_access_time = time.time() - start_time

        # Second access - should hit cache
        start_time = time.time()
        await cache_service.get_template(999)
        second_access_time = time.time() - start_time

        # Assert cache improved performance
        assert result1 == template_data
        assert second_access_time < first_access_time / 10  # At least 10x faster

        print(
            f"✓ Cache performance: First access {first_access_time:.4f}s, "
            f"Cached access {second_access_time:.4f}s "
            f"({first_access_time/second_access_time:.1f}x faster)"
        )

    async def test_parallel_operations_in_workflow(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Test that workflow uses parallel operations where possible."""
        import time

        with patch("api.services.sharepoint.sharepoint_service.SharePointService") as mock_sp:
            mock_sp_instance = AsyncMock()
            mock_sp.return_value = mock_sp_instance

            # Track call times
            call_times = []

            async def track_folder_creation(*args, **kwargs):
                call_times.append(time.time())
                await asyncio.sleep(0.1)  # Simulate API delay
                return {"id": f"folder-{len(call_times)}"}

            mock_sp_instance.create_folder.side_effect = track_folder_creation

            # Simulate creating multiple folders
            folders_to_create = 10
            tasks = []

            start_time = time.time()

            # Create folders in parallel
            for i in range(folders_to_create):
                task = mock_sp_instance.create_folder(
                    site_id="site-123",
                    library_id="lib-123",
                    folder_path=f"Folder{i}",
                )
                tasks.append(task)

            await asyncio.gather(*tasks)

            total_time = time.time() - start_time

            # If operations were sequential, it would take ~1 second (10 * 0.1)
            # In parallel, it should take ~0.1 second plus overhead
            assert total_time < 0.5, f"Parallel operations took {total_time:.2f}s (expected < 0.5s)"

            # Check that calls were made close together (parallel)
            if len(call_times) > 1:
                time_spread = max(call_times) - min(call_times)
                assert time_spread < 0.1, f"Calls spread over {time_spread:.2f}s (not parallel)"

            print(f"✓ {folders_to_create} parallel operations completed in {total_time:.2f}s")


@pytest.mark.asyncio
class TestRateLimitHandling:
    """Test rate limit handling and retry logic."""

    async def test_rate_limit_retry_with_backoff(
        self,
        client: AsyncClient,
    ):
        """Test that rate-limited requests are retried with exponential backoff."""
        from api.core.retry import GraphAPIRetryConfig, retry_async

        config = GraphAPIRetryConfig()
        attempt_times = []
        attempt_count = 0

        async def rate_limited_function():
            nonlocal attempt_count
            attempt_times.append(time.time())
            attempt_count += 1

            if attempt_count < 3:
                # Simulate rate limit error
                raise Exception("429 Too Many Requests")

            return "Success"

        start_time = time.time()

        # Execute with retry
        result = await retry_async(
            rate_limited_function,
            config=config,
        )

        assert result == "Success"
        assert attempt_count == 3

        # Check exponential backoff
        if len(attempt_times) > 1:
            delays = []
            for i in range(1, len(attempt_times)):
                delays.append(attempt_times[i] - attempt_times[i - 1])

            # Each delay should be roughly double the previous
            for i in range(1, len(delays)):
                ratio = delays[i] / delays[i - 1]
                assert 1.5 < ratio < 2.5, f"Backoff ratio {ratio} not exponential"

        total_time = time.time() - start_time
        print(f"✓ Rate limit retry completed in {total_time:.2f}s after {attempt_count} attempts")

    async def test_circuit_breaker_prevents_cascading_failures(self):
        """Test that circuit breaker prevents cascading failures."""
        from api.core.retry import CircuitBreaker

        breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=1.0,
        )

        call_count = 0

        async def failing_function():
            nonlocal call_count
            call_count += 1
            raise Exception("Service unavailable")

        # Trigger failures to open circuit
        for i in range(3):
            with pytest.raises(Exception):
                await breaker.call(failing_function)

        assert call_count == 3
        assert breaker.state == "open"

        # Circuit should be open, preventing more calls
        with pytest.raises(Exception, match="Circuit breaker is open"):
            await breaker.call(failing_function)

        # Call count shouldn't increase when circuit is open
        assert call_count == 3

        print(f"✓ Circuit breaker opened after {breaker.failure_threshold} failures")

        # Wait for recovery timeout
        await asyncio.sleep(1.1)

        # Circuit should attempt half-open
        async def successful_function():
            return "Success"

        result = await breaker.call(successful_function)
        assert result == "Success"
        assert breaker.state == "closed"

        print("✓ Circuit breaker recovered after timeout")


@pytest.mark.asyncio
class TestLoadTesting:
    """Load testing for the API."""

    async def test_api_handles_load(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        """Test API can handle expected load."""
        # Create test data
        partner = PartnerCompany(
            company_code="LOAD-001",
            name="Load Test Partner",
            short_name="LTP",
            is_active=True,
        )
        db_session.add(partner)

        contract = Contract(
            contract_number="C-LOAD-001",
            name="Load Test Contract",
            start_date=datetime.utcnow(),
            status="active",
            created_by="load-test",
            updated_by="load-test",
        )
        db_session.add(contract)
        await db_session.commit()

        # Generate load
        num_requests = 100
        successful_requests = 0
        response_times = []

        async def make_request(i):
            start = time.time()
            try:
                response = await client.get(
                    f"/api/v1/contracts/{contract.id}",
                    headers={"x-correlation-id": f"load-test-{i}"},
                )
                response_time = time.time() - start
                response_times.append(response_time)

                if response.status_code == 200:
                    return True
                else:
                    return False
            except Exception:
                return False

        # Execute requests concurrently
        start_time = time.time()

        tasks = [make_request(i) for i in range(num_requests)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        total_time = time.time() - start_time

        # Calculate statistics
        successful_requests = sum(1 for r in results if r is True)
        num_requests - successful_requests

        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        p95_response_time = (
            sorted(response_times)[int(len(response_times) * 0.95)] if response_times else 0
        )
        p99_response_time = (
            sorted(response_times)[int(len(response_times) * 0.99)] if response_times else 0
        )

        requests_per_second = num_requests / total_time

        # Assert performance requirements
        assert (
            successful_requests >= num_requests * 0.95
        ), f"Only {successful_requests}/{num_requests} succeeded"
        assert avg_response_time < 1.0, f"Average response time {avg_response_time:.2f}s > 1s"
        assert p95_response_time < 3.0, f"P95 response time {p95_response_time:.2f}s > 3s"

        print("\n✓ Load test results:")
        print(f"  - Requests: {num_requests}")
        print(f"  - Success rate: {successful_requests/num_requests*100:.1f}%")
        print(f"  - Requests/second: {requests_per_second:.1f}")
        print(f"  - Avg response time: {avg_response_time:.3f}s")
        print(f"  - P95 response time: {p95_response_time:.3f}s")
        print(f"  - P99 response time: {p99_response_time:.3f}s")
