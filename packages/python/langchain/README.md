# langchain-sendmux

[LangChain](https://docs.langchain.com) toolkit for [Sendmux](https://sendmux.ai), the email API for AI agents.

Gives an agent its own mailbox: it can send email, read what arrives, and reply from its own address.

## Requirements

- Python 3.10 or newer
- `langchain-core` v1

## Installation

```sh
pip install langchain-sendmux
```

## Getting an API key

The toolkit needs a key that can both send and receive. Two ways to get one:

- **Dashboard** — create a mailbox and a mailbox-scoped key (`smx_mbx_*`). See [API keys](https://sendmux.ai/docs/guides/api-keys).
- **Agent self-registration** — the agent claims its own `@myagent.mx` mailbox and gets an `smx_agent_*` token, with no human signup first. See [email for AI agents](https://sendmux.ai/solutions/for-ai-agents/).

Note on agent tokens: a freshly self-registered `smx_agent_*` token can read and receive, but **cannot send** until a human owner has been invited and has approved it. Until then `send_email` and `reply` will fail. A dashboard `smx_mbx_*` key with send permission works immediately.

Read the key from the environment. Never hard-code it.

## Quick start

```python
import os

from langchain.agents import create_agent

from langchain_sendmux import SendmuxToolkit

smx = SendmuxToolkit(
    api_key=os.environ["SENDMUX_API_KEY"],
    default_from="agent@yourdomain.dev",
)

agent = create_agent(
    model="gpt-4o",
    tools=smx.get_tools(),
    system_prompt="You triage the support inbox.",
)

agent.invoke(
    {"messages": [{"role": "user", "content": "Reply to anyone asking about pricing."}]}
)
```

## Tools

`SendmuxToolkit(...).get_tools()` returns three tools.

### `send_email`

Sends through your configured sending providers, to any recipient.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | str | yes | Recipient email address |
| `subject` | str | yes | Subject line |
| `text` | str | yes | Plain-text body |
| `html` | str | no | HTML body. Generated from `text` if omitted |
| `var_from` | str | no | Sender address. Falls back to `default_from` |
| `idempotency_key` | str | no | Makes a retried send idempotent for 24 hours |

`var_from` is spelt that way because `from` is a reserved word in Python.

### `list_messages`

Lists messages in the agent's own mailbox, newest first.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `limit` | int | no | How many to return, 1 to 100. Defaults to 25 |

### `reply`

Sends from the agent's own mailbox address, rather than through a sending provider. Use this to answer someone who wrote in.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `to` | str | yes | Recipient email address |
| `subject` | str | yes | Subject line |
| `text` | str | yes | Plain-text body |
| `html` | str | no | HTML body. Generated from `text` if omitted |
| `idempotency_key` | str | no | Makes a retried send idempotent for 24 hours |

## Configuration

```python
SendmuxToolkit(api_key=..., default_from=...)
```

| Option | Required | Purpose |
| --- | --- | --- |
| `api_key` | yes | A send + receive mailbox key (`smx_mbx_*`) or a scoped agent token (`smx_agent_*`) |
| `default_from` | no | Default sender for `send_email`. Without it, the model has to supply `var_from` on every call |

## Retries and duplicate sends

Agents retry. Pass `idempotency_key` on `send_email` and `reply` and Sendmux will send once, even if the same call arrives several times inside 24 hours. Any stable string works — a task id, a thread id, a hash of the message.

Details: [idempotency](https://sendmux.ai/docs/guides/idempotency).

## Common errors

| What you see | Why | Fix |
| --- | --- | --- |
| `ValueError: No sender address` | No `var_from` on the call and no `default_from` set | Set `default_from`, or have the model pass `var_from` |
| Send rejected on an agent token | The token is self-registered and not yet owner-approved | Complete the owner invite and approval |
| Auth failure | Key lacks send or receive permission | Check the key's scope in the dashboard |

## Related

- [Quickstart](https://sendmux.ai/docs/guides/quickstart)
- [Mailboxes](https://sendmux.ai/docs/guides/mailboxes)
- [All Sendmux SDKs](https://sendmux.ai/docs/sdks)
- [Pricing](https://sendmux.ai/pricing/) — usage-based, no per-seat or per-mailbox fees

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
