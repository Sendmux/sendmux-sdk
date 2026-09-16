from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from langchain_sendmux import SendmuxToolkit


def test_send_email_forwards_groups_and_omits_an_absent_hint() -> None:
    captured: list[dict[str, Any]] = []

    def send_email(_api: Any, request: Any, **_kwargs: Any) -> SimpleNamespace:
        captured.append(request.to_dict())
        return SimpleNamespace(data={"message_id": "msg_test", "status": "queued"})

    toolkit = SendmuxToolkit(api_key="smx_mbx_test", default_from="sender@example.test")
    with patch("langchain_sendmux.toolkit.EmailsApi.sending_send_email", new=send_email):
        result = toolkit.get_tools()[0].invoke(
            {
                "to": "reader@example.test",
                "subject": "Test",
                "text": "Hello",
                "delivery_group": ["dgrp_primary", "dgrp_backup"],
            }
        )
        toolkit.get_tools()[0].invoke(
            {
                "to": "reader@example.test",
                "subject": "No routing hint",
                "text": "Hello",
            }
        )

    assert result == {"message_id": "msg_test", "status": "queued"}
    assert captured[0]["delivery_group"] == ["dgrp_primary", "dgrp_backup"]
    assert "delivery_group" not in captured[1]
