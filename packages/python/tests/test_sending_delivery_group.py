from __future__ import annotations

import json

import pytest

from sendmux_sending import EmailSendRequestDeliveryGroup


def delivery_group_from_supported_value(
    value: str | list[str],
) -> EmailSendRequestDeliveryGroup:
    return EmailSendRequestDeliveryGroup.from_dict(value)


@pytest.mark.parametrize(
    "delivery_group",
    ["dgrp_transactional", ["dgrp_transactional", "dgrp_marketing"]],
)
def test_delivery_group_from_dict_round_trips_supported_values(
    delivery_group: str | list[str],
) -> None:
    model = delivery_group_from_supported_value(delivery_group)

    assert model.actual_instance == delivery_group
    assert model.to_dict() == delivery_group
    assert json.loads(model.to_json()) == delivery_group
