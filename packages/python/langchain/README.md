# langchain-sendmux

[LangChain](https://docs.langchain.com) toolkit for [Sendmux](https://sendmux.ai), the email API for AI agents. Give a LangChain agent tools to send email and read its own inbox.

## Installation

```sh
pip install langchain-sendmux
```

## Usage

```python
import os

from langchain.agents import create_agent
from langchain_sendmux import SendmuxToolkit

smx = SendmuxToolkit(api_key=os.environ["SENDMUX_API_KEY"])

agent = create_agent(
    model="gpt-4o",
    tools=smx.get_tools(),
    system_prompt="You triage the support inbox.",
)

agent.invoke({"messages": [{"role": "user", "content": "Reply to Sarah."}]})
```

## Tools

`SendmuxToolkit(api_key=...).get_tools()` returns three tools:

- `send_email` - send an email to any recipient through Sendmux.
- `list_messages` - list recent messages in the agent's mailbox.
- `reply` - send a message from the agent's own mailbox.

## Configuration

- `api_key` (required) - a send + receive capable mailbox API key (`smx_mbx_*`) or a scoped agent token.
- `default_from` (optional) - default From address for `send_email` when a call omits `var_from`.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
