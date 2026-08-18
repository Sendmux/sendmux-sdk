from __future__ import annotations

import asyncio
import json

import httpx
from a2a.client import ClientConfig, ClientFactory
from a2a.client.card_resolver import A2ACardResolver
from a2a.helpers import get_data_parts, new_data_message
from a2a.server.request_handlers.response_helpers import agent_card_to_dict
from a2a.types import Role, SendMessageRequest
from fastmcp.server.auth import AccessToken

from sendmux_mcp.a2a import (
    A2A_RESOURCE_URL,
    A2AHostedProxy,
    A2AOperationCatalog,
    A2AOperationRequest,
    build_a2a_agent_card,
)
from sendmux_mcp.config import ServerConfig
from sendmux_mcp.curation import HOSTED_BACKING_TOOLS_BY_SURFACE, OPENAPI_TOOLS_BY_SURFACE
from sendmux_mcp.hosted import (
    HOSTED_MCP_DISCOVERY_SCOPES,
    HostedServerRuntimeConfig,
    create_hosted_http_app,
)
from sendmux_mcp.hosted_proxy import HostedProxyConfig, build_hosted_operation_manifest
from sendmux_mcp.specs import load_spec, prepare_for_fastmcp


def test_agent_card_advertises_a2a_1_0_http_json_and_oauth() -> None:
    card = agent_card_to_dict(build_a2a_agent_card())

    assert card["name"] == "Sendmux A2A"
    assert card["version"] == "1.5.1"
    assert card["description"]
    assert card["supportedInterfaces"] == [
        {
            "url": A2A_RESOURCE_URL,
            "protocolBinding": "HTTP+JSON",
            "protocolVersion": "1.0",
        }
    ]
    assert card["capabilities"] == {
        "streaming": False,
        "pushNotifications": False,
        "extendedAgentCard": False,
    }
    assert card["defaultInputModes"] == ["application/json"]
    assert card["defaultOutputModes"] == ["application/json"]
    assert [skill["id"] for skill in card["skills"]] == ["mailbox", "management", "sending"]
    assert all(skill["name"] and skill["description"] and skill["tags"] for skill in card["skills"])

    oauth = card["securitySchemes"]["oauth2"]["oauth2SecurityScheme"]
    assert oauth["oauth2MetadataUrl"] == "https://app.sendmux.ai/.well-known/oauth-authorization-server"
    assert oauth["flows"]["authorizationCode"]["authorizationUrl"] == (
        "https://app.sendmux.ai/mcp/oauth/authorize"
    )
    assert oauth["flows"]["authorizationCode"]["tokenUrl"] == "https://app.sendmux.ai/mcp/oauth/token"
    assert oauth["flows"]["authorizationCode"]["pkceRequired"] is True
    assert set(oauth["flows"]["authorizationCode"]["scopes"]) == set(HOSTED_MCP_DISCOVERY_SCOPES)
    assert card["securityRequirements"] == [{"schemes": {"oauth2": {}}}]


def test_a2a_operation_catalog_has_full_hosted_operation_parity() -> None:
    manifests = []
    expected: set[str] = set()
    for surface in ("mailbox", "management", "sending"):
        config = ServerConfig(surfaces=(surface,), api_key=None)
        spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
        manifests.append(build_hosted_operation_manifest(spec, surface))
        expected.update(tool.operation_id for tool in OPENAPI_TOOLS_BY_SURFACE[surface])
        expected.update(tool.operation_id for tool in HOSTED_BACKING_TOOLS_BY_SURFACE[surface])

    catalog = A2AOperationCatalog(tuple(manifests))

    assert set(catalog.operation_ids) == expected
    assert {catalog.require("mailboxListMessages").surface, catalog.require("managementListDomains").surface} == {
        "mailbox",
        "management",
    }
    assert catalog.require("sendingSendEmail").surface == "sending"


def test_a2a_proxy_builds_exact_audience_bound_internal_envelope() -> None:
    async def run() -> None:
        captured: list[httpx.Request] = []

        async def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(200, json={"ok": True, "data": []}, request=request)

        config = ServerConfig(surfaces=("management",), api_key=None)
        spec = prepare_for_fastmcp(load_spec(config), base_url=config.api_base_url)
        catalog = A2AOperationCatalog((build_hosted_operation_manifest(spec, "management"),))
        proxy = A2AHostedProxy(
            HostedProxyConfig(
                proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy",
                upstream_base_url=config.api_base_url,
                internal_bearer_token="internal-service-token",
                resource=A2A_RESOURCE_URL,
                protocol="a2a",
            ),
            catalog=catalog,
            inner=httpx.MockTransport(handler),
        )

        response = await proxy.execute(
            A2AOperationRequest.model_validate(
                {
                    "operationId": "managementGetDomain",
                    "pathParameters": {"public_id": "dom_123"},
                    "query": {"include": ["dns", "status"]},
                    "headers": {"If-None-Match": '"etag"'},
                }
            ),
            grant_id="a2a_grant_public",
        )

        assert response.status_code == 200
        assert len(captured) == 1
        assert captured[0].headers["authorization"] == "Bearer internal-service-token"
        envelope = json.loads((await captured[0].aread()).decode())
        assert envelope == {
            "grant_id": "a2a_grant_public",
            "resource": A2A_RESOURCE_URL,
            "protocol": "a2a",
            "operation_id": "managementGetDomain",
            "tool_name": "management_get_domain",
            "surface": "management",
            "method": "GET",
            "path": "/domains/dom_123",
            "query": "include=dns&include=status",
            "headers": {"if-none-match": '"etag"'},
            "body_base64": None,
        }

        await proxy.aclose()

    asyncio.run(run())


def test_official_a2a_client_discovers_and_executes_without_task_routes() -> None:
    class StaticVerifier:
        async def verify_token(self, token: str) -> AccessToken | None:
            if token != "a2a_access_token":
                return None
            return AccessToken(
                token=token,
                client_id="a2a_client_public",
                scopes=["domain.read"],
                claims={
                    "grant_id": "a2a_grant_public",
                    "permissions": ["domain.read"],
                    "surface": ["management"],
                },
            )

    async def run() -> None:
        captured: list[httpx.Request] = []

        async def proxy_handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(
                200,
                json={"ok": True, "data": [{"id": "dom_123"}]},
                headers={"content-type": "application/json", "x-request-id": "req_a2a"},
                request=request,
            )

        app = create_hosted_http_app(
            hosted_runtime(),
            a2a_token_verifier=StaticVerifier(),
            a2a_proxy_transport=httpx.MockTransport(proxy_handler),
        )
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="https://a2a.sendmux.ai",
            headers={"Authorization": "Bearer a2a_access_token"},
        ) as http_client:
            card_response = await http_client.get("/.well-known/agent-card.json")
            assert card_response.status_code == 200

            resource_response = await http_client.get("/.well-known/oauth-protected-resource")
            assert resource_response.status_code == 200
            assert resource_response.json()["resource"] == A2A_RESOURCE_URL

            missing_auth = await http_client.post(
                "/a2a/v1/message:send",
                headers={"Authorization": ""},
                json={},
            )
            assert missing_auth.status_code == 401
            assert missing_auth.headers["www-authenticate"].startswith("Bearer resource_metadata=")

            assert (await http_client.post("/a2a/v1/message:stream", json={})).status_code == 404
            assert (await http_client.get("/a2a/v1/tasks/task_123")).status_code == 404

            card = await A2ACardResolver(http_client, "https://a2a.sendmux.ai").get_agent_card()
            client = ClientFactory(
                ClientConfig(
                    streaming=False,
                    httpx_client=http_client,
                    supported_protocol_bindings=["HTTP+JSON"],
                    accepted_output_modes=["application/json"],
                )
            ).create(card)
            request = SendMessageRequest(
                message=new_data_message(
                    {
                        "operationId": "managementListDomains",
                        "query": {"limit": 10},
                    },
                    media_type="application/json",
                    role=Role.ROLE_USER,
                )
            )
            responses = [response async for response in client.send_message(request)]

            assert len(responses) == 1
            assert responses[0].HasField("message")
            result = get_data_parts(responses[0].message.parts)
            assert result == [
                {
                    "ok": True,
                    "status": 200,
                    "headers": {"content-type": "application/json", "x-request-id": "req_a2a"},
                    "body": {"ok": True, "data": [{"id": "dom_123"}]},
                }
            ]

        assert len(captured) == 1
        envelope = json.loads((await captured[0].aread()).decode())
        assert envelope["grant_id"] == "a2a_grant_public"
        assert envelope["resource"] == A2A_RESOURCE_URL
        assert envelope["protocol"] == "a2a"
        assert envelope["operation_id"] == "managementListDomains"

    asyncio.run(run())


def hosted_runtime() -> HostedServerRuntimeConfig:
    return HostedServerRuntimeConfig(
        issuer="https://app.sendmux.ai",
        authorization_servers=("https://app.sendmux.ai",),
        jwks_uri="https://app.sendmux.ai/.well-known/jwks.json",
        resource_base_url="https://mcp.sendmux.ai",
        proxy_url="https://app.sendmux.ai/api/internal/mcp/proxy",
        internal_bearer_token="internal-service-token",
        mcp_path="/mcp",
        host="127.0.0.1",
        port=8765,
        stateless_http=True,
        scopes_supported=HOSTED_MCP_DISCOVERY_SCOPES,
        allowed_origins=("https://app.sendmux.ai",),
    )
