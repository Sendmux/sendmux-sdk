import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputRoot = join(root, ".tmp", "python-codegen");
const templateDir = join(root, "codegen", "templates", "python");

const surfaces = [
  {
    name: "sending",
    projectName: "sendmux-sending",
    packageName: "sendmux_sending",
    spec: ".codegen/openapi-sending.openapi-generator.codegen.json",
    tags: ["Attachments", "Emails", "Meta"],
  },
  {
    name: "mailbox",
    projectName: "sendmux-mailbox",
    packageName: "sendmux_mailbox",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: ["Mailbox API"],
  },
  {
    name: "management",
    projectName: "sendmux-management",
    packageName: "sendmux_management",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: [
      "Billing",
      "Domain Filters",
      "Domains",
      "Emails",
      "Inboxes",
      "Mailbox Filters",
      "Mailboxes",
      "Sending accounts",
      "Webhooks",
    ],
  },
];

run("pnpm", ["normalize:codegen"]);
rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

for (const surface of surfaces) {
  const packageDir = join(root, "packages", "python", surface.name);
  const generatedRoot = join(outputRoot, surface.name);
  const inputSpec = surface.tags ? writeFilteredSpec(surface) : join(root, surface.spec);
  const packageVersion = readProjectVersion(packageDir);

  run("pnpm", [
    "openapi-generator-cli",
    "generate",
    "-g",
    "python",
    "-i",
    inputSpec,
    "-o",
    generatedRoot,
    "-t",
    templateDir,
    `--additional-properties=packageName=${surface.packageName},projectName=${surface.projectName},packageVersion=${packageVersion},generateSourceCodeOnly=true,hideGenerationTimestamp=true`,
    "--global-property=models,supportingFiles,apis,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false",
  ]);

  rmSync(join(packageDir, surface.packageName), { force: true, recursive: true });
  cpSync(join(generatedRoot, surface.packageName), join(packageDir, surface.packageName), { recursive: true });
  writeSurfaceClient(surface);
  linkGeneratedRuntimeVersion(surface, packageDir);
  normalizePythonFiles(join(packageDir, surface.packageName));
}

console.log("Generated Python SDK packages");

function readProjectVersion(packageDir) {
  const pyprojectPath = join(packageDir, "pyproject.toml");
  const pyproject = readFileSync(pyprojectPath, "utf8");
  const match = pyproject.match(/^version = "([^"]+)"$/m);
  if (!match) {
    throw new Error(`Could not read project version from ${pyprojectPath}`);
  }
  return match[1];
}

function writeFilteredSpec(surface) {
  const source = JSON.parse(readFileSync(join(root, surface.spec), "utf8"));
  const allowed = new Set(surface.tags);
  const paths = {};

  for (const [path, pathItem] of Object.entries(source.paths ?? {})) {
    const nextPathItem = {};
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        nextPathItem[method] = operation;
        continue;
      }

      if ((operation.tags ?? []).some((tag) => allowed.has(tag))) {
        nextPathItem[method] = operation;
      }
    }

    if (Object.keys(nextPathItem).some((key) => key !== "parameters")) {
      paths[path] = nextPathItem;
    }
  }

  const outputPath = join(outputRoot, `${surface.name}.openapi-generator.codegen.json`);
  writeFileSync(outputPath, `${JSON.stringify(markTrailingSdkParams(pruneComponents({ ...source, paths })), null, 2)}\n`);
  return outputPath;
}

function markTrailingSdkParams(document) {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        continue;
      }
      if (!operation?.requestBody) {
        continue;
      }
      for (const parameter of operation.parameters ?? []) {
        if (parameter?.name === "mailbox_id" && parameter.in === "query") {
          parameter["x-sendmux-trailing-sdk-param"] = true;
        }
      }
    }
  }
  return document;
}

function pruneComponents(document) {
  const refs = new Set();
  collectRefs(document.paths, refs);

  for (const ref of refs) {
    collectTransitiveRefs(document, ref, refs);
  }

  const components = {};
  for (const ref of refs) {
    const parts = ref.split("/");
    if (parts.length !== 4 || parts[0] !== "#" || parts[1] !== "components") {
      continue;
    }

    const [, , section, encodedName] = parts;
    const name = decodeURIComponent(encodedName);
    const value = document.components?.[section]?.[name];
    if (value === undefined) {
      throw new Error(`Missing component referenced by filtered spec: ${ref}`);
    }

    components[section] ??= {};
    components[section][name] = value;
  }

  if (document.components?.securitySchemes) {
    components.securitySchemes = document.components.securitySchemes;
  }

  return { ...document, components };
}

function collectTransitiveRefs(document, ref, refs) {
  const parts = ref.split("/");
  if (parts.length !== 4 || parts[0] !== "#" || parts[1] !== "components") {
    return;
  }

  const [, , section, encodedName] = parts;
  const name = decodeURIComponent(encodedName);
  const value = document.components?.[section]?.[name];
  if (value === undefined) {
    throw new Error(`Missing component referenced by filtered spec: ${ref}`);
  }

  const before = refs.size;
  collectRefs(value, refs);
  if (refs.size !== before) {
    for (const nextRef of refs) {
      collectTransitiveRefs(document, nextRef, refs);
    }
  }
}

function collectRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectRefs(child, refs);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (typeof value.$ref === "string") {
    refs.add(value.$ref);
  }

  for (const child of Object.values(value)) {
    collectRefs(child, refs);
  }
}

function normalizePythonFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      normalizePythonFiles(path);
      continue;
    }

    if (!path.endsWith(".py")) {
      continue;
    }

    const current = readFileSync(path, "utf8");
    const next = `${current.replace(/[ \t\r\n]*$/u, "")}\n`;
    if (next !== current) {
      writeFileSync(path, next);
    }
  }
}

function writeSurfaceClient(surface) {
  const packageDir = join(root, "packages", "python", surface.name, surface.packageName);
  const className = toPascal(surface.name);
  const keySurface = surface.name === "management" ? "root" : surface.name === "sending" ? "sending" : "mailbox";
  const defaultBaseUrl =
    surface.name === "sending" ? "https://smtp.sendmux.ai/api/v1" : "https://app.sendmux.ai/api/v1";

  writeFileSync(
    join(packageDir, "client.py"),
    `from __future__ import annotations

import certifi

from typing import Any, cast

from sendmux_core import RetryOptions, configure_auth, validate_api_key
from sendmux_core.errors import map_api_exception
from sendmux_core.retry import RetryingRestClient

from ${surface.packageName}.api_client import ApiClient
from ${surface.packageName}.configuration import Configuration
from ${surface.packageName}.exceptions import ApiException

DEFAULT_BASE_URL = "${defaultBaseUrl}"


class Sendmux${className}ApiClient(ApiClient):
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


def create_${surface.name}_client(
    *,
    api_key: str,
    base_url: str | None = None,
    retry_options: RetryOptions | None = None,
) -> Sendmux${className}ApiClient:
    validate_api_key(api_key, surface="${keySurface}")
    configuration = Configuration(host=base_url or DEFAULT_BASE_URL, ssl_ca_cert=certifi.where())
    configure_auth(configuration, api_key=api_key)
    return Sendmux${className}ApiClient(configuration, retry_options=retry_options)


configure_${surface.name} = create_${surface.name}_client
`,
  );

  const initPath = join(packageDir, "__init__.py");
  const existing = readFileSync(initPath, "utf8");
  writeFileSync(
    initPath,
    `${existing}
from ${surface.packageName}.client import (
    DEFAULT_BASE_URL,
    Sendmux${className}ApiClient,
    configure_${surface.name},
    create_${surface.name}_client,
)
`,
  );

  if (surface.name === "mailbox") {
    writeMailboxEventsHelper(surface.packageName, packageDir);
    writeMailboxAttachmentHelpers(surface.packageName, packageDir);
    writeFileSync(
      initPath,
      `${readFileSync(initPath, "utf8")}
from ${surface.packageName}.events import iter_mailbox_events
from ${surface.packageName}.attachments import (
    create_mailbox_attachment_upload_from_file,
    download_mailbox_attachment,
    read_mailbox_text_attachment,
    send_mailbox_message_with_files,
    upload_mailbox_attachment_from_file,
    upload_mailbox_attachment_via_presigned_file,
)
`,
    );
  }

  if (surface.name === "sending") {
    writeSendingAttachmentHelpers(surface.packageName, packageDir);
    writeFileSync(
      initPath,
      `${readFileSync(initPath, "utf8")}
from ${surface.packageName}.attachments import (
    attachment_from_file,
    send_email_with_files,
    upload_attachment_from_file,
)
`,
    );
  }
}

function writeMailboxEventsHelper(packageName, packageDir) {
  writeFileSync(
    join(packageDir, "events.py"),
    `from __future__ import annotations

import json
import codecs

from collections.abc import Iterator
from typing import Any

from ${packageName}.api.mailbox_api_api import MailboxAPIApi
from ${packageName}.api_client import ApiClient
from ${packageName}.models.mailbox_realtime_event import MailboxRealtimeEvent


def iter_mailbox_events(
    api_client: ApiClient,
    *,
    event_types: str | None = None,
    last_event_id: str | None = None,
    ping: int | None = None,
    close_after: int | None = None,
    last_event_id_header: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> Iterator[MailboxRealtimeEvent]:
    """Yield typed mailbox SSE events from the generated mailbox API client.

    Pass close_after for bounded streams, or close the iterator/response from the caller when following continuously.
    """

    api = MailboxAPIApi(api_client)
    response = api.mailbox_stream_events_without_preload_content(
        event_types=event_types,
        last_event_id=last_event_id,
        ping=ping,
        close_after=close_after,
        last_event_id2=last_event_id_header,
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )
    try:
        yield from _iter_sse_response(response)
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            close()
        release_conn = getattr(response, "release_conn", None)
        if callable(release_conn):
            release_conn()


def _iter_sse_response(response: Any) -> Iterator[MailboxRealtimeEvent]:
    buffer = ""
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    for chunk in response.stream(decode_content=True):
        if chunk is None:
            continue
        buffer += decoder.decode(chunk) if isinstance(chunk, bytes) else str(chunk)
        buffer = buffer.replace("\\r\\n", "\\n").replace("\\r", "\\n")
        blocks = buffer.split("\\n\\n")
        buffer = blocks.pop() or ""
        for block in blocks:
            event = _event_from_block(block)
            if event is not None:
                yield event


def _event_from_block(block: str) -> MailboxRealtimeEvent | None:
    data_lines: list[str] = []
    for line in block.split("\\n"):
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip(" "))

    if not data_lines:
        return None

    decoded = json.loads("\\n".join(data_lines))
    if not isinstance(decoded, dict):
        raise ValueError("Mailbox SSE event data must be a JSON object.")

    event = MailboxRealtimeEvent.from_dict(decoded)
    if event is None:
        raise ValueError("Mailbox SSE event data was empty.")
    return event
`,
  );
}

function writeMailboxAttachmentHelpers(packageName, packageDir) {
  writeFileSync(
    join(packageDir, "attachments.py"),
    `from __future__ import annotations

import json
import mimetypes

from os import PathLike
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from ${packageName}.api.mailbox_api_api import MailboxAPIApi
from ${packageName}.api_client import ApiClient
from ${packageName}.models.mailbox_attachment_upload_intent_body import MailboxAttachmentUploadIntentBody
from ${packageName}.models.mailbox_attachment_upload_intent_result_response import (
    MailboxAttachmentUploadIntentResultResponse,
)
from ${packageName}.models.mailbox_attachment_upload_result_response import MailboxAttachmentUploadResultResponse
from ${packageName}.models.mailbox_send_result_response import MailboxSendResultResponse
from ${packageName}.models.send_mailbox_message_body import SendMailboxMessageBody

PathInput = str | PathLike[str]
FileInput = PathInput | dict[str, Any]


def upload_mailbox_attachment_from_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> MailboxAttachmentUploadResultResponse:
    """Upload a local file and return a blob ID for mailbox send attachments."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = MailboxAPIApi(api_client)
    return api.mailbox_upload_attachment(
        filename=file["filename"],
        body=file["bytes"],
        mailbox_id=mailbox_id,
        _headers={"Content-Type": file["content_type"]},
        _request_timeout=request_timeout,
    )


def create_mailbox_attachment_upload_from_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> MailboxAttachmentUploadIntentResultResponse:
    """Create a short-lived signed PUT URL for a local file."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = MailboxAPIApi(api_client)
    return api.mailbox_create_attachment_upload(
        mailbox_attachment_upload_intent_body=_attachment_upload_intent_body(file),
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )


def upload_mailbox_attachment_via_presigned_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    mailbox_id: str | None = None,
    request_timeout: float | None = None,
) -> MailboxAttachmentUploadResultResponse:
    """Create a signed upload URL, PUT the file without an API key, and return the blob ID."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = MailboxAPIApi(api_client)
    intent = api.mailbox_create_attachment_upload(
        mailbox_attachment_upload_intent_body=_attachment_upload_intent_body(file),
        mailbox_id=mailbox_id,
    )
    request = Request(
        intent.data.upload_url,
        data=file["bytes"],
        headers={
            "Content-Length": intent.data.headers.content_length,
            "Content-Type": intent.data.headers.content_type,
        },
        method=intent.data.method,
    )
    try:
        with urlopen(request, timeout=request_timeout) as response:
            payload = _parse_upload_result_response(response.read())
    except HTTPError as exc:
        raise RuntimeError(f"Presigned attachment upload failed with HTTP {exc.code}.") from exc

    result = MailboxAttachmentUploadResultResponse.from_dict(payload)
    if result is None:
        raise ValueError("Presigned upload response was empty.")
    return result


def download_mailbox_attachment(
    api_client: ApiClient,
    *,
    message_id: str,
    attachment_id: str,
    mailbox_id: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> bytes:
    """Download one mailbox attachment as bytes."""

    api = MailboxAPIApi(api_client)
    raw_download = getattr(api, "mailbox_get_message_attachment_without_preload_content", None)
    if callable(raw_download):
        response = raw_download(
            message_id=message_id,
            attachment_id=attachment_id,
            mailbox_id=mailbox_id,
            _request_timeout=request_timeout,
        )
        try:
            return _read_binary_response(response)
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()
            release_conn = getattr(response, "release_conn", None)
            if callable(release_conn):
                release_conn()

    result = api.mailbox_get_message_attachment(
        message_id=message_id,
        attachment_id=attachment_id,
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )
    return _coerce_bytes(result)


def read_mailbox_text_attachment(
    api_client: ApiClient,
    *,
    message_id: str,
    attachment_id: str,
    mailbox_id: str | None = None,
    encoding: str = "utf-8",
    request_timeout: float | tuple[float, float] | None = None,
) -> str:
    """Download one mailbox attachment and decode it as text."""

    return download_mailbox_attachment(
        api_client,
        message_id=message_id,
        attachment_id=attachment_id,
        mailbox_id=mailbox_id,
        request_timeout=request_timeout,
    ).decode(encoding)


def send_mailbox_message_with_files(
    api_client: ApiClient,
    *,
    body: dict[str, Any],
    files: list[FileInput],
    mailbox_id: str | None = None,
    idempotency_key: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> MailboxSendResultResponse:
    """Upload local files, attach their blob IDs, and send one mailbox message."""

    attachments = list(body.get("attachments") or [])
    for file_input in files:
        file = _file_input(file_input)
        uploaded = upload_mailbox_attachment_from_file(
            api_client,
            file_path=file["path"],
            filename=file.get("filename"),
            content_type=file.get("content_type"),
            mailbox_id=mailbox_id,
            request_timeout=request_timeout,
        )
        attachments.append(
            {
                "blob_id": uploaded.data.blob_id,
                "content_type": uploaded.data.content_type,
                "filename": uploaded.data.filename,
            }
        )

    next_body = {**body, "attachments": attachments}
    api = MailboxAPIApi(api_client)
    return api.mailbox_send_message(
        idempotency_key=idempotency_key,
        send_mailbox_message_body=_send_mailbox_message_body(next_body),
        mailbox_id=mailbox_id,
        _request_timeout=request_timeout,
    )


def _file_input(value: FileInput) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"path": value}


def _attachment_upload_intent_body(file: dict[str, Any]) -> MailboxAttachmentUploadIntentBody:
    body = MailboxAttachmentUploadIntentBody.from_dict(
        {
            "content_type": file["content_type"],
            "filename": file["filename"],
            "size_bytes": len(file["bytes"]),
        }
    )
    if body is None:
        raise ValueError("Attachment upload intent body was empty.")
    return body


def _send_mailbox_message_body(body: dict[str, Any]) -> SendMailboxMessageBody:
    request_body = SendMailboxMessageBody.from_dict(body)
    if request_body is None:
        raise ValueError("Mailbox send message body was empty.")
    return request_body


def _parse_upload_result_response(body: bytes) -> dict[str, Any]:
    if not body.strip():
        raise ValueError("Presigned attachment upload succeeded but did not return attachment metadata.")
    try:
        decoded = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Presigned attachment upload returned invalid JSON metadata.") from exc
    if not isinstance(decoded, dict):
        raise ValueError("Presigned attachment upload metadata must be a JSON object.")
    return decoded


def _read_binary_response(response: Any) -> bytes:
    read = getattr(response, "read", None)
    if not callable(read):
        return _coerce_bytes(response)

    try:
        return _coerce_bytes(read(decode_content=True))
    except TypeError:
        return _coerce_bytes(read())


def _coerce_bytes(value: Any) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, str):
        return value.encode("utf-8")
    raise TypeError(f"Expected attachment bytes, got {type(value).__name__}.")


def _read_attachment_file(
    file_path: PathInput,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    path = Path(file_path)
    if not path.is_file():
        raise ValueError(f"Attachment path is not a regular file: {path}")
    data = path.read_bytes()
    if not data:
        raise ValueError(f"Attachment file is empty: {path}")

    guessed_type, _encoding = mimetypes.guess_type(path.name)
    return {
        "bytes": data,
        "content_type": content_type or guessed_type or "application/octet-stream",
        "filename": filename or path.name,
        "path": path,
    }
`,
  );
}

function writeSendingAttachmentHelpers(packageName, packageDir) {
  writeFileSync(
    join(packageDir, "attachments.py"),
    `from __future__ import annotations

import base64
import mimetypes

from os import PathLike
from pathlib import Path
from typing import Any

from ${packageName}.api.attachments_api import AttachmentsApi
from ${packageName}.api.emails_api import EmailsApi
from ${packageName}.api_client import ApiClient
from ${packageName}.models.attachment_upload_response import AttachmentUploadResponse
from ${packageName}.models.email_send_request import EmailSendRequest
from ${packageName}.models.send_success_response import SendSuccessResponse

PathInput = str | PathLike[str]
FileInput = PathInput | dict[str, Any]


def attachment_from_file(
    file_path: PathInput,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, str]:
    """Return a Sending API attachment object from a local file path."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    return {
        "content": base64.b64encode(file["bytes"]).decode("ascii"),
        "encoding": "base64",
        "filename": file["filename"],
        "type": file["content_type"],
    }


def upload_attachment_from_file(
    api_client: ApiClient,
    *,
    file_path: PathInput,
    filename: str | None = None,
    content_type: str | None = None,
    idempotency_key: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> AttachmentUploadResponse:
    """Upload a local file and return an attachment ID for Sending attachments."""

    file = _read_attachment_file(file_path, filename=filename, content_type=content_type)
    api = AttachmentsApi(api_client)
    return api.sending_upload_attachment(
        filename=file["filename"],
        body=file["bytes"],
        idempotency_key=idempotency_key,
        content_type=file["content_type"],
        _headers={"Content-Type": file["content_type"]},
        _request_timeout=request_timeout,
    )


def send_email_with_files(
    api_client: ApiClient,
    *,
    body: dict[str, Any],
    files: list[FileInput],
    idempotency_key: str | None = None,
    request_timeout: float | tuple[float, float] | None = None,
) -> SendSuccessResponse:
    """Upload local files, attach their attachment IDs, and send one email."""

    attachments = list(body.get("attachments") or [])
    for file_input in files:
        file = _file_input(file_input)
        uploaded = upload_attachment_from_file(
            api_client,
            file_path=file["path"],
            filename=file.get("filename"),
            content_type=file.get("content_type"),
            idempotency_key=file.get("idempotency_key"),
            request_timeout=request_timeout,
        )
        attachments.append({"attachment_id": uploaded.data.attachment_id})

    api = EmailsApi(api_client)
    return api.sending_send_email(
        email_send_request=_email_send_request({**body, "attachments": attachments}),
        idempotency_key=idempotency_key,
        _request_timeout=request_timeout,
    )


def _file_input(value: FileInput) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"path": value}


def _email_send_request(body: dict[str, Any]) -> EmailSendRequest:
    request_body = EmailSendRequest.from_dict(body)
    if request_body is None:
        raise ValueError("Sending email request body was empty.")
    return request_body


def _read_attachment_file(
    file_path: PathInput,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    path = Path(file_path)
    if not path.is_file():
        raise ValueError(f"Attachment path is not a regular file: {path}")
    data = path.read_bytes()
    if not data:
        raise ValueError(f"Attachment file is empty: {path}")

    guessed_type, _encoding = mimetypes.guess_type(path.name)
    return {
        "bytes": data,
        "content_type": content_type or guessed_type or "application/octet-stream",
        "filename": filename or path.name,
        "path": path,
    }
`,
  );
}

function linkGeneratedRuntimeVersion(surface, packageDir) {
  const packageRoot = join(packageDir, surface.packageName);
  const apiClientPath = join(packageRoot, "api_client.py");
  const configurationPath = join(packageRoot, "configuration.py");

  let apiClient = readFileSync(apiClientPath, "utf8");
  apiClient = replaceOnce({
    source: apiClient,
    filePath: apiClientPath,
    from: "from pydantic import SecretStr\n\n",
    to: "from pydantic import SecretStr\n\nfrom importlib.metadata import PackageNotFoundError, version as _distribution_version\nfrom pathlib import Path\n\n",
  });
  apiClient = replaceOnce({
    source: apiClient,
    filePath: apiClientPath,
    from: "RequestSerialized = Tuple[str, str, Dict[str, str], Optional[str], List[str]]\n\nclass ApiClient:",
    to: `RequestSerialized = Tuple[str, str, Dict[str, str], Optional[str], List[str]]\n\n\ndef _sdk_package_version() -> str:\n    init_path = Path(__file__).with_name("__init__.py")\n    version_prefix = '__version__ = "'\n    if init_path.exists():\n        for line in init_path.read_text(encoding="utf-8").splitlines():\n            if line.startswith(version_prefix) and line.endswith('"'):\n                return line[len(version_prefix) : -1]\n\n    try:\n        return _distribution_version("${surface.projectName}")\n    except PackageNotFoundError:\n        raise RuntimeError("Could not read ${surface.projectName} package version") from None\n\n\nclass ApiClient:`,
  });
  apiClient = replacePatternOnce({
    source: apiClient,
    filePath: apiClientPath,
    pattern: /self\.user_agent = ['"]OpenAPI-Generator\/[^/'"]+\/python['"]/,
    to:
    "self.user_agent = f'OpenAPI-Generator/{_sdk_package_version()}/python'",
  });
  writeFileSync(apiClientPath, apiClient);

  let configuration = readFileSync(configurationPath, "utf8");
  configuration = replaceOnce({
    source: configuration,
    filePath: configurationPath,
    from: "import copy\n",
    to: "import copy\nfrom importlib.metadata import PackageNotFoundError, version as _distribution_version\nfrom pathlib import Path\n",
  });
  configuration = replaceOnce({
    source: configuration,
    filePath: configurationPath,
    from: "ServerVariablesT = Dict[str, str]\n\nGenericAuthSetting",
    to: `ServerVariablesT = Dict[str, str]\n\n\ndef _sdk_package_version() -> str:\n    init_path = Path(__file__).with_name("__init__.py")\n    version_prefix = '__version__ = "'\n    if init_path.exists():\n        for line in init_path.read_text(encoding="utf-8").splitlines():\n            if line.startswith(version_prefix) and line.endswith('"'):\n                return line[len(version_prefix) : -1]\n\n    try:\n        return _distribution_version("${surface.projectName}")\n    except PackageNotFoundError:\n        raise RuntimeError("Could not read ${surface.projectName} package version") from None\n\n\nGenericAuthSetting`,
  });
  configuration = replacePatternOnce({
    source: configuration,
    filePath: configurationPath,
    pattern: /"SDK Package Version: [^"]+"\.\\/,
    to: '"SDK Package Version: {sdk_package_version}".\\',
  });
  configuration = replaceOnce({
    source: configuration,
    filePath: configurationPath,
    from: "format(env=sys.platform, pyversion=sys.version)",
    to: "format(env=sys.platform, pyversion=sys.version, sdk_package_version=_sdk_package_version())",
  });
  writeFileSync(configurationPath, configuration);
}

function replaceOnce({ source, filePath, from, to }) {
  if (!source.includes(from)) {
    throw new Error(`Could not find expected generated snippet in ${filePath}`);
  }
  return source.replace(from, to);
}

function replacePatternOnce({ source, filePath, pattern, to }) {
  const next = source.replace(pattern, to);
  if (next === source) {
    throw new Error(`Could not find expected generated pattern ${pattern} in ${filePath}`);
  }
  return next;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function toPascal(value) {
  return value
    .split(/[-_]/g)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}
