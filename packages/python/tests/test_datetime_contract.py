from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from urllib3 import HTTPResponse

from sendmux_management import ApiClient, Configuration, MailboxesApi


@pytest.fixture
def cost_client(monkeypatch: Any) -> Any:
    requests: list[str] = []
    with ApiClient(Configuration(host="https://sdk.example.invalid/api/v1")) as client:
        def request(method: str, url: str, **kwargs: Any) -> HTTPResponse:
            requests.append(url)
            return HTTPResponse(status=200, body=b"{}")

        monkeypatch.setattr(client.rest_client.pool_manager, "request", request)
        yield MailboxesApi(client), requests


@pytest.mark.parametrize("offset,expected_start,expected_end", [
    (timezone.utc, "2026-10-05T12:00:00.123Z", "2026-10-05T12:00:01.123Z"),
    (timezone(timedelta(hours=9, minutes=30)), "2026-10-05T02:30:00.123Z", "2026-10-05T02:30:01.123Z"),
])
def test_cost_bounds_preserve_milliseconds_in_timezone_qualified_query(
    cost_client: Any, offset: Any, expected_start: str, expected_end: str,
) -> None:
    api, requests = cost_client
    start = datetime(2026, 10, 5, 12, 0, 0, 123000, tzinfo=offset)
    end = start + timedelta(seconds=1)

    response = api.management_get_mailbox_cost_usage_without_preload_content("mbx_test", start, end)
    response.close()

    assert parse_qs(urlsplit(requests[0]).query) == {
        "start": [expected_start],
        "end": [expected_end],
    }


def test_cost_bounds_accept_valid_date_time_strings_without_losing_milliseconds(cost_client: Any) -> None:
    api, requests = cost_client
    response = api.management_get_mailbox_cost_usage_without_preload_content(
        "mbx_test", "2026-10-05T12:00:00.123+09:30", "2026-10-05T12:00:01.123+09:30",
    )
    response.close()

    assert parse_qs(urlsplit(requests[0]).query) == {
        "start": ["2026-10-05T02:30:00.123Z"],
        "end": ["2026-10-05T02:30:01.123Z"],
    }


@pytest.mark.parametrize("bound", ["start", "end"])
@pytest.mark.parametrize("invalid", [
    datetime(2026, 10, 5, 12),
    datetime(2026, 10, 5, 12, microsecond=123001, tzinfo=timezone.utc),
    datetime(2026, 10, 5, 12, tzinfo=timezone(timedelta(microseconds=1))),
    "2026-10-05T12:00:00.1230Z",
    "2026-10-05T12:00:00.123000001Z",
])
def test_cost_bounds_reject_missing_timezone_or_submillisecond_precision(
    cost_client: Any, bound: str, invalid: datetime | str,
) -> None:
    api, requests = cost_client
    bounds: dict[str, datetime | str] = {
        "start": datetime(2026, 10, 5, 12, tzinfo=timezone.utc),
        "end": datetime(2026, 10, 5, 13, tzinfo=timezone.utc),
    }
    bounds[bound] = invalid

    with pytest.raises(ValueError):
        api.management_get_mailbox_cost_usage_without_preload_content("mbx_test", **bounds)

    assert requests == []
