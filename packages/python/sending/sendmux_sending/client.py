from __future__ import annotations

from typing import Any, cast

from sendmux_core import RetryOptions, configure_auth, validate_api_key
from sendmux_core.errors import map_api_exception
from sendmux_core.retry import RetryingRestClient

from sendmux_sending.api_client import ApiClient
from sendmux_sending.configuration import Configuration
from sendmux_sending.exceptions import ApiException

DEFAULT_BASE_URL = "https://smtp.sendmux.ai/api/v1"


class SendmuxSendingApiClient(ApiClient):
    def __init__(self, configuration: Configuration, *, retry_options: RetryOptions | None = None) -> None:
        super().__init__(configuration=configuration)
        self.rest_client = cast(Any, RetryingRestClient(self.rest_client, retry_options=retry_options))

    def call_api(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return super().call_api(*args, **kwargs)
        except ApiException as exc:
            raise map_api_exception(exc) from exc

    def response_deserialize(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return super().response_deserialize(*args, **kwargs)
        except ApiException as exc:
            raise map_api_exception(exc) from exc


def create_sending_client(
    *,
    api_key: str,
    base_url: str | None = None,
    retry_options: RetryOptions | None = None,
) -> SendmuxSendingApiClient:
    validate_api_key(api_key, surface="root")
    configuration = Configuration(host=base_url or DEFAULT_BASE_URL)
    configure_auth(configuration, api_key=api_key)
    return SendmuxSendingApiClient(configuration, retry_options=retry_options)


configure_sending = create_sending_client
