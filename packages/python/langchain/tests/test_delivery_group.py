import json
from typing import Any

import urllib3

from langchain_sendmux import SendmuxToolkit


def test_send_email_serializes_scalar_list_and_omitted_delivery_group(
    monkeypatch: Any,
) -> None:
    captured: list[dict[str, Any]] = []

    def request(
        _pool: Any, _method: str, _url: str, **kwargs: Any,
    ) -> urllib3.HTTPResponse:
        captured.append(json.loads(kwargs["body"]))
        return urllib3.HTTPResponse(
            status=200,
            body=json.dumps({
                "ok": True,
                "meta": {"request_id": "req_aaaaaaaaaaaaaaaaaaaaaaaa"},
                "data": {
                    "message_id": "eml_aaaaaaaaaaaaaaaaaaaaaaaa",
                    "status": "queued",
                },
            }).encode(),
            headers={"Content-Type": "application/json"},
        )

    monkeypatch.setattr(urllib3.PoolManager, "request", request)
    toolkit = SendmuxToolkit(api_key="smx_mbx_test", default_from="sender@example.test")
    send_email = toolkit.get_tools()[0]
    for subject, delivery_group in [
        ("Scalar routing hint", "dgrp_primary"),
        ("List routing hint", ["dgrp_primary", "dgrp_backup"]),
        ("No routing hint", None),
    ]:
        arguments: dict[str, Any] = {
            "to": "reader@example.test",
            "subject": subject,
            "text": "Hello",
        }
        if delivery_group is not None:
            arguments["delivery_group"] = delivery_group
        assert send_email.invoke(arguments).status == "queued"

    assert captured[0]["delivery_group"] == "dgrp_primary"
    assert captured[1]["delivery_group"] == ["dgrp_primary", "dgrp_backup"]
    assert "delivery_group" not in captured[2]
