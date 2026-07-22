"""LangChain toolkit for the Sendmux email API for AI agents."""

from __future__ import annotations

from typing import Any, Optional

from langchain_core.tools import BaseTool, BaseToolkit, tool
from pydantic import Field

from sendmux_mailbox import MailboxAPIApi, create_mailbox_client
from sendmux_mailbox.models.mailbox_address import MailboxAddress
from sendmux_mailbox.models.send_mailbox_message_body import SendMailboxMessageBody
from sendmux_sending import (
    Address,
    EmailSendRequest,
    EmailsApi,
    create_sending_client,
)


def _html_from_text(text: str) -> str:
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"<p>{escaped}</p>"


class SendmuxToolkit(BaseToolkit):
    """LangChain toolkit exposing Sendmux tools to an agent.

    ``get_tools()`` returns three tools: ``send_email``, ``list_messages`` and
    ``reply``.

    Example:
        >>> from langchain.agents import create_agent
        >>> from langchain_sendmux import SendmuxToolkit
        >>> smx = SendmuxToolkit(api_key="smx_mbx_...")
        >>> agent = create_agent(model="gpt-4o", tools=smx.get_tools())
    """

    api_key: str = Field(
        description=(
            "A send + receive capable mailbox API key (smx_mbx_*) or a scoped "
            "agent token. Read it from your environment; never hard-code it."
        ),
    )
    default_from: Optional[str] = Field(
        default=None,
        description=(
            "Default From address for send_email when a call omits `from`. "
            "If unset, the model must supply a sender per call."
        ),
    )

    def get_tools(self) -> list[BaseTool]:
        sending_client = create_sending_client(api_key=self.api_key)
        mailbox_client = create_mailbox_client(api_key=self.api_key)
        emails = EmailsApi(sending_client)
        mailbox = MailboxAPIApi(mailbox_client)
        default_from = self.default_from

        @tool
        def send_email(
            to: str,
            subject: str,
            text: str,
            html: Optional[str] = None,
            var_from: Optional[str] = None,
        ) -> Any:
            """Send an email through Sendmux to any recipient.

            Args:
                to: Recipient email address.
                subject: Email subject line.
                text: Plain-text body of the email.
                html: Optional HTML body.
                var_from: Sender email address; defaults to the configured sender.
            """
            sender = var_from if var_from is not None else default_from
            if sender is None:
                raise ValueError(
                    "No sender address: pass `var_from` in the tool call, or set "
                    "default_from on SendmuxToolkit."
                )
            response = emails.sending_send_email(
                EmailSendRequest(
                    var_from=Address(email=sender),
                    to=Address(email=to),
                    subject=subject,
                    text_body=text,
                    html_body=html if html is not None else _html_from_text(text),
                )
            )
            return response.data

        @tool
        def list_messages(limit: int = 25) -> Any:
            """List recent messages in the agent's mailbox, newest first.

            Args:
                limit: Maximum number of messages to return (1-100).
            """
            response = mailbox.mailbox_list_messages(limit=limit)
            return response.data

        @tool
        def reply(
            to: str,
            subject: str,
            text: str,
            html: Optional[str] = None,
        ) -> Any:
            """Send a message from the agent's own mailbox, e.g. to reply to a sender.

            Args:
                to: Recipient email address.
                subject: Subject line.
                text: Plain-text body.
                html: Optional HTML body.
            """
            response = mailbox.mailbox_send_message(
                send_mailbox_message_body=SendMailboxMessageBody(
                    to=[MailboxAddress(email=to, name=None)],
                    subject=subject,
                    text_body=text,
                    html_body=html if html is not None else _html_from_text(text),
                )
            )
            return response.data

        return [send_email, list_messages, reply]
