from __future__ import annotations

import pytest
from pydantic import ValidationError

from sendmux_management import ManagementCreateMailboxRequest


@pytest.mark.parametrize("email", ["agent@example.com\n", "agent@example.com\r", "agent@example.com\r\n"])
def test_management_mailbox_email_rejects_line_breaks(email: str) -> None:
    with pytest.raises(ValidationError):
        ManagementCreateMailboxRequest(email=email)


def test_management_mailbox_email_accepts_a_valid_full_value() -> None:
    request = ManagementCreateMailboxRequest(email="agent@example.com")

    assert request.email == "agent@example.com"
