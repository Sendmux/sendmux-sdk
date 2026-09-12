from __future__ import annotations

from collections.abc import AsyncIterator

import anyio
import httpx

RESPONSE_CLOSE_TIMEOUT_SECONDS = 5


class ShieldedResponseStream(httpx.AsyncByteStream):
    def __init__(self, inner: httpx.AsyncByteStream) -> None:
        self.inner = inner

    async def __aiter__(self) -> AsyncIterator[bytes]:
        async for chunk in self.inner:
            yield chunk

    async def aclose(self) -> None:
        with anyio.move_on_after(RESPONSE_CLOSE_TIMEOUT_SECONDS, shield=True) as cancel_scope:
            await self.inner.aclose()
        if cancel_scope.cancel_called:
            raise TimeoutError("Timed out while closing the upstream response stream.")
        await anyio.lowlevel.checkpoint_if_cancelled()


def own_response(response: httpx.Response) -> None:
    if isinstance(response.stream, httpx.AsyncByteStream) and not isinstance(response.stream, ShieldedResponseStream):
        response.stream = ShieldedResponseStream(response.stream)


async def close_response(response: httpx.Response) -> None:
    with anyio.move_on_after(RESPONSE_CLOSE_TIMEOUT_SECONDS, shield=True) as cancel_scope:
        await response.aclose()
    if cancel_scope.cancel_called:
        raise TimeoutError("Timed out while closing the upstream response.")
