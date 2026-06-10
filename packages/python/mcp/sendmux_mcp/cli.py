from __future__ import annotations

import argparse
import os

from sendmux_mcp.config import (
    RetryConfig,
    SURFACES,
    ServerConfig,
    Surface,
    config_from_env,
    normalise_surfaces,
    normalise_transport,
    parse_csv,
    parse_surfaces,
)
from sendmux_mcp.server import run


def main(argv: list[str] | None = None) -> int:
    args = parser(prog="sendmux-mcp").parse_args(argv)
    surfaces = surfaces_from_args(args)
    if surfaces is None:
        raise SystemExit("--surfaces is required when using sendmux-mcp, or set SENDMUX_MCP_SURFACES.")
    run(config_from_args(surfaces, args))
    return 0


def main_mailbox(argv: list[str] | None = None) -> int:
    args = parser(default_surface="mailbox", prog="sendmux-mcp-mailbox").parse_args(argv)
    run(config_from_args(("mailbox",), args))
    return 0


def main_management(argv: list[str] | None = None) -> int:
    args = parser(default_surface="management", prog="sendmux-mcp-management").parse_args(argv)
    run(config_from_args(("management",), args))
    return 0


def main_sending(argv: list[str] | None = None) -> int:
    args = parser(default_surface="sending", prog="sendmux-mcp-sending").parse_args(argv)
    run(config_from_args(("sending",), args))
    return 0


def parser(*, default_surface: Surface | None = None, prog: str) -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(prog=prog)
    if default_surface is None:
        command.add_argument("--surface", choices=["mailbox", "management", "sending"])
        command.add_argument(
            "--surfaces",
            help="Comma-separated product lines to expose: mailbox, management, sending.",
        )
    command.add_argument("--api-key")
    command.add_argument("--mailbox-api-key")
    command.add_argument("--management-api-key")
    command.add_argument("--sending-api-key")
    command.add_argument("--transport", choices=["stdio", "http", "streamable-http"])
    command.add_argument("--host")
    command.add_argument("--port", type=int)
    command.add_argument("--path")
    command.add_argument("--app-base-url")
    command.add_argument("--sending-base-url")
    command.add_argument("--openapi-input-dir")
    command.add_argument("--app-openapi")
    command.add_argument("--sending-openapi")
    command.add_argument("--allowed-origin", action="append", default=[])
    command.add_argument("--http-bearer-token")
    command.add_argument("--allow-unauthenticated-http", action="store_true")
    command.add_argument("--timeout-seconds", type=float)
    command.add_argument("--retry-max-attempts", type=int)
    command.add_argument("--retry-base-delay-seconds", type=float)
    command.add_argument("--retry-max-delay-seconds", type=float)
    command.set_defaults(surface=default_surface)
    return command


def surfaces_from_args(args: argparse.Namespace) -> tuple[Surface, ...] | None:
    if getattr(args, "surfaces", None):
        return parse_surfaces(args.surfaces)
    if getattr(args, "surface", None):
        return normalise_surfaces((args.surface,))
    env_surfaces = parse_surfaces(os.environ.get("SENDMUX_MCP_SURFACES"))
    if env_surfaces:
        return env_surfaces
    return None


def config_from_args(surfaces: tuple[Surface, ...], args: argparse.Namespace) -> ServerConfig:
    base = config_from_env(surfaces, api_key=args.api_key)
    allowed_origins = tuple(args.allowed_origin) or parse_csv(None)
    transport = normalise_transport(args.transport) if args.transport else base.transport
    api_keys = {
        **base.api_keys,
        **surface_api_keys_from_args(args),
    }
    return ServerConfig(
        surfaces=surfaces,
        api_key=base.api_key,
        api_keys=api_keys,
        app_base_url=args.app_base_url or base.app_base_url,
        sending_base_url=args.sending_base_url or base.sending_base_url,
        transport=transport,
        host=args.host or base.host,
        port=args.port or base.port,
        path=args.path or base.path,
        openapi_input_dir=args.openapi_input_dir or base.openapi_input_dir,
        app_openapi=args.app_openapi or base.app_openapi,
        sending_openapi=args.sending_openapi or base.sending_openapi,
        allowed_origins=allowed_origins or base.allowed_origins,
        http_bearer_token=args.http_bearer_token or base.http_bearer_token,
        allow_unauthenticated_http=args.allow_unauthenticated_http or base.allow_unauthenticated_http,
        timeout_seconds=args.timeout_seconds or base.timeout_seconds,
        stateless_http=base.stateless_http,
        retry=RetryConfig(
            max_attempts=args.retry_max_attempts or base.retry.max_attempts,
            base_delay_seconds=args.retry_base_delay_seconds or base.retry.base_delay_seconds,
            max_delay_seconds=args.retry_max_delay_seconds or base.retry.max_delay_seconds,
        ),
    )


def surface_api_keys_from_args(args: argparse.Namespace) -> dict[Surface, str]:
    keys: dict[Surface, str] = {}
    for surface in SURFACES:
        value = getattr(args, f"{surface}_api_key", None)
        if value:
            keys[surface] = value
    return keys
