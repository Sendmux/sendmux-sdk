from __future__ import annotations

import base64
import json
import re
from binascii import Error as Base64DecodeError
from dataclasses import dataclass
from importlib.metadata import version
from typing import Any, Protocol
from urllib.parse import quote, urlencode

import httpx
from a2a.helpers import get_data_parts, new_data_message
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.context import ServerCallContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import DefaultServerCallContextBuilder, create_agent_card_routes, create_rest_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentSkill,
    AuthorizationCodeOAuthFlow,
    OAuth2SecurityScheme,
    OAuthFlows,
    SecurityRequirement,
    SecurityScheme,
    StringList,
)
from fastmcp.server.auth import AccessToken
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

from sendmux_mcp.hosted_auth import HOSTED_MCP_DISCOVERY_SCOPES
from sendmux_mcp.hosted_proxy import (
    HostedOperationManifest,
    HostedOperationRoute,
    HostedProxyConfig,
    build_hosted_proxy_request,
)
from sendmux_mcp.permissions import api_key_has_permission

A2A_RESOURCE_URL = "https://a2a.sendmux.ai/a2a/v1"
A2A_AGENT_CARD_URL = "https://a2a.sendmux.ai/.well-known/agent-card.json"
OAUTH_METADATA_URL = "https://app.sendmux.ai/.well-known/oauth-authorization-server"
OAUTH_AUTHORIZE_URL = "https://app.sendmux.ai/mcp/oauth/authorize"
OAUTH_TOKEN_URL = "https://app.sendmux.ai/mcp/oauth/token"
OAUTH_PROTECTED_RESOURCE_METADATA_URL = "https://a2a.sendmux.ai/.well-known/oauth-protected-resource"
A2A_PATH_PREFIX = "/a2a/v1"
A2A_RESPONSE_HEADERS = {
    "cache-control",
    "content-type",
    "etag",
    "location",
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "x-request-id",
}

QueryScalar = str | int | float | bool


class A2AOperationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    operation_id: str = Field(alias="operationId", min_length=1, max_length=128)
    path_parameters: dict[str, str] = Field(default_factory=dict, alias="pathParameters")
    query: dict[str, QueryScalar | list[QueryScalar]] = Field(default_factory=dict)
    headers: dict[str, str] = Field(default_factory=dict)
    body: Any | None = None
    body_base64: str | None = Field(default=None, alias="bodyBase64")
    mailbox_id: str | None = Field(default=None, alias="mailboxId")

    @model_validator(mode="after")
    def validate_body_mode(self) -> A2AOperationRequest:
        if self.body is not None and self.body_base64 is not None:
            raise ValueError("body and bodyBase64 are mutually exclusive")
        return self


class A2AOperationCatalog:
    def __init__(self, manifests: tuple[HostedOperationManifest, ...]) -> None:
        routes: dict[str, HostedOperationRoute] = {}
        for manifest in manifests:
            for route in manifest.routes:
                existing = routes.get(route.operation_id)
                if existing is not None and existing != route:
                    raise ValueError(f"conflicting hosted operation: {route.operation_id}")
                routes[route.operation_id] = route
        self._routes = routes

    @property
    def operation_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._routes))

    def require(self, operation_id: str) -> HostedOperationRoute:
        route = self._routes.get(operation_id)
        if route is None:
            raise ValueError(f"unknown hosted operation: {operation_id}")
        return route


class A2AHostedProxy:
    def __init__(
        self,
        config: HostedProxyConfig,
        *,
        catalog: A2AOperationCatalog,
        inner: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.config = config
        self.catalog = catalog
        self.inner = inner or httpx.AsyncHTTPTransport()

    async def execute(self, operation: A2AOperationRequest, *, grant_id: str) -> httpx.Response:
        route = self.catalog.require(operation.operation_id)
        body = operation_body(operation)
        request = build_hosted_proxy_request(
            config=self.config,
            route=route,
            grant_id=grant_id,
            relative_path=render_operation_path(route.path_template, operation.path_parameters),
            query=encode_operation_query(operation.query),
            headers=operation_headers(operation, body),
            body=body,
            mailbox_id=operation.mailbox_id,
        )
        return await self.inner.handle_async_request(request)

    async def aclose(self) -> None:
        await self.inner.aclose()


class A2ATokenVerifier(Protocol):
    async def verify_token(self, token: str) -> AccessToken | None: ...


class A2AServerCallContextBuilder(DefaultServerCallContextBuilder):
    def build(self, request: Request) -> ServerCallContext:
        context = super().build(request)
        access_token = request.scope.get("a2a_access_token")
        if access_token is not None:
            context.state["a2a_access_token"] = access_token
        return context


class SendmuxA2AExecutor(AgentExecutor):
    def __init__(self, proxy: A2AHostedProxy) -> None:
        self.proxy = proxy

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        result = await self._execute(context)
        await event_queue.enqueue_event(
            new_data_message(
                result,
                media_type="application/json",
                context_id=context.context_id,
            )
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("Sendmux A2A does not create cancellable tasks.")

    async def _execute(self, context: RequestContext) -> dict[str, Any]:
        try:
            message = context.message
            data_parts = get_data_parts(message.parts) if message is not None else []
            if len(data_parts) != 1 or not isinstance(data_parts[0], dict):
                raise ValueError("one application/json DataPart is required")
            operation = A2AOperationRequest.model_validate(data_parts[0])
            route = self.proxy.catalog.require(operation.operation_id)
            access_token = context.call_context.state.get("a2a_access_token")
            if not isinstance(access_token, AccessToken):
                return a2a_error(401, "authentication_required")
            claims = access_token.claims or {}
            grant_id = claims.get("grant_id")
            permissions = claims.get("permissions")
            surfaces = claims.get("surface")
            if not isinstance(grant_id, str) or not grant_id:
                return a2a_error(401, "authentication_required")
            if not isinstance(permissions, list) or not all(isinstance(item, str) for item in permissions):
                return a2a_error(403, "insufficient_permissions")
            if not isinstance(surfaces, list) or route.surface not in surfaces:
                return a2a_error(403, "insufficient_permissions")
            if not all(api_key_has_permission(required, tuple(permissions)) for required in route.permissions):
                return a2a_error(403, "insufficient_permissions")

            response = await self.proxy.execute(operation, grant_id=grant_id)
            body = await response.aread()
            return a2a_proxy_result(response, body)
        except (Base64DecodeError, ValidationError, ValueError):
            return a2a_error(400, "invalid_request")
        except Exception:
            return a2a_error(503, "service_unavailable")


@dataclass(frozen=True)
class A2AHttpComponents:
    routes: list[BaseRoute]
    request_handler: DefaultRequestHandler
    proxy: A2AHostedProxy


def build_a2a_http_components(
    *,
    manifests: tuple[HostedOperationManifest, ...],
    token_verifier: A2ATokenVerifier,
    proxy_config: HostedProxyConfig,
    proxy_transport: httpx.AsyncBaseTransport | None = None,
) -> A2AHttpComponents:
    card = build_a2a_agent_card()
    proxy = A2AHostedProxy(proxy_config, catalog=A2AOperationCatalog(manifests), inner=proxy_transport)
    request_handler = DefaultRequestHandler(
        agent_executor=SendmuxA2AExecutor(proxy),
        task_store=InMemoryTaskStore(),
        agent_card=card,
    )
    rest_routes = create_rest_routes(
        request_handler,
        context_builder=A2AServerCallContextBuilder(),
        path_prefix=A2A_PATH_PREFIX,
    )
    message_route = next(
        route for route in rest_routes if isinstance(route, Route) and route.path == f"{A2A_PATH_PREFIX}/message:send"
    )
    routes: list[BaseRoute] = [
        *create_agent_card_routes(card),
        Route(
            "/.well-known/oauth-protected-resource",
            endpoint=a2a_protected_resource_metadata,
            methods=["GET"],
        ),
        protected_a2a_route(message_route, token_verifier),
    ]
    return A2AHttpComponents(routes=routes, request_handler=request_handler, proxy=proxy)


def protected_a2a_route(route: Route, token_verifier: A2ATokenVerifier) -> Route:
    async def endpoint(request: Request) -> Response:
        authorization = request.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        access_token = await token_verifier.verify_token(token) if scheme == "Bearer" and token else None
        if access_token is None:
            return JSONResponse(
                {"error": "invalid_token"},
                status_code=401,
                headers={
                    "WWW-Authenticate": f'Bearer resource_metadata="{OAUTH_PROTECTED_RESOURCE_METADATA_URL}"'
                },
            )
        request.scope["a2a_access_token"] = access_token
        return await route.endpoint(request)

    return Route(route.path, endpoint=endpoint, methods=["POST"])


async def a2a_protected_resource_metadata(_request: Request) -> JSONResponse:
    return JSONResponse(
        {
            "resource": A2A_RESOURCE_URL,
            "authorization_servers": ["https://app.sendmux.ai"],
            "scopes_supported": list(HOSTED_MCP_DISCOVERY_SCOPES),
            "bearer_methods_supported": ["header"],
            "resource_name": "Sendmux A2A",
        },
        headers={"Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*"},
    )


def a2a_proxy_result(response: httpx.Response, body: bytes) -> dict[str, Any]:
    headers = {name.lower(): value for name, value in response.headers.items() if name.lower() in A2A_RESPONSE_HEADERS}
    result: dict[str, Any] = {
        "ok": 200 <= response.status_code < 300,
        "status": response.status_code,
        "headers": headers,
    }
    if response.headers.get("content-type", "").lower().startswith("application/json"):
        try:
            result["body"] = json.loads(body)
            return result
        except json.JSONDecodeError:
            pass
    result["bodyBase64"] = base64.b64encode(body).decode("ascii")
    return result


def a2a_error(status: int, code: str) -> dict[str, Any]:
    return {"ok": False, "status": status, "error": {"code": code}}


def render_operation_path(path_template: str, parameters: dict[str, str]) -> str:
    names = re.findall(r"\{([^/{}]+)\}", path_template)
    if set(parameters) != set(names):
        raise ValueError("pathParameters must match the selected operation")
    path = path_template
    for name in names:
        path = path.replace("{" + name + "}", quote(parameters[name], safe=""))
    return path


def encode_operation_query(query: dict[str, QueryScalar | list[QueryScalar]]) -> str:
    return urlencode(query, doseq=True)


def operation_body(operation: A2AOperationRequest) -> bytes:
    if operation.body_base64 is not None:
        return base64.b64decode(operation.body_base64, validate=True)
    if operation.body is not None:
        return json.dumps(operation.body, separators=(",", ":")).encode("utf8")
    return b""


def operation_headers(operation: A2AOperationRequest, body: bytes) -> dict[str, str]:
    headers = {name.lower(): value for name, value in operation.headers.items()}
    if body and operation.body is not None:
        headers.setdefault("content-type", "application/json")
    return headers


def build_a2a_agent_card() -> AgentCard:
    oauth_flow = AuthorizationCodeOAuthFlow(
        authorization_url=OAUTH_AUTHORIZE_URL,
        token_url=OAUTH_TOKEN_URL,
        refresh_url=OAUTH_TOKEN_URL,
        scopes={scope: f"Sendmux permission: {scope}" for scope in HOSTED_MCP_DISCOVERY_SCOPES},
        pkce_required=True,
    )
    oauth_scheme = SecurityScheme(
        oauth2_security_scheme=OAuth2SecurityScheme(
            description="OAuth 2.0 authorization-code flow with PKCE.",
            flows=OAuthFlows(authorization_code=oauth_flow),
            oauth2_metadata_url=OAUTH_METADATA_URL,
        )
    )

    return AgentCard(
        name="Sendmux A2A",
        version=version("sendmux-mcp"),
        description="Deterministic agent access to Sendmux mailbox, management, and sending operations.",
        supported_interfaces=[
            AgentInterface(
                url=A2A_RESOURCE_URL,
                protocol_binding="HTTP+JSON",
                protocol_version="1.0",
            )
        ],
        capabilities=AgentCapabilities(
            streaming=False,
            push_notifications=False,
            extended_agent_card=False,
        ),
        security_schemes={"oauth2": oauth_scheme},
        security_requirements=[SecurityRequirement(schemes={"oauth2": StringList(list=[])})],
        default_input_modes=["application/json"],
        default_output_modes=["application/json"],
        skills=[
            AgentSkill(
                id="mailbox",
                name="Mailbox",
                description="Read, search, organise, and send mail through granted Sendmux mailboxes.",
                tags=["email", "mailbox"],
            ),
            AgentSkill(
                id="management",
                name="Management",
                description="Manage Sendmux domains, mailboxes, logs, metrics, billing, and webhooks.",
                tags=["email", "management"],
            ),
            AgentSkill(
                id="sending",
                name="Sending",
                description="Send email and manage outbound attachments through Sendmux sending routes.",
                tags=["email", "sending"],
            ),
        ],
    )
