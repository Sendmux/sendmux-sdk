from __future__ import annotations

from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from typing import Generic, Protocol, TypeVar

T = TypeVar("T")


class PaginationMeta(Protocol):
    has_more: bool
    next_cursor: str | None


class CursorResponse(Protocol[T]):
    data: Sequence[T]
    pagination: PaginationMeta


@dataclass(frozen=True)
class CursorPage(Generic[T]):
    data: Sequence[T]
    has_more: bool
    next_cursor: str | None


def iter_cursor_pages(fetch_page: Callable[[str | None], CursorResponse[T]]) -> Iterator[T]:
    cursor: str | None = None

    while True:
        response = fetch_page(cursor)
        for item in response.data:
            yield item

        if not response.pagination.has_more:
            return

        next_cursor = response.pagination.next_cursor
        if not next_cursor or next_cursor == cursor:
            raise RuntimeError("Sendmux cursor pagination did not return a new next_cursor")
        cursor = next_cursor
