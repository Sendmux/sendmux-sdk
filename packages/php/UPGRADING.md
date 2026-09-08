# Upgrading the PHP SDK to 2.0

Version 2.0 adds connection checks for all three API surfaces and updates the generated models to the current API schemas. Some existing PHP return and parameter types change, so this is a major release. Composer constraints such as `^1.0` will continue to select 1.x.

## Update Composer constraints

For the umbrella package:

```bash
composer require sendmux/sdk:^2.0 --with-all-dependencies
```

If you install individual packages, update your direct `sendmux/core`, `sendmux/sending`, `sendmux/mailbox`, and `sendmux/management` constraints to `^2.0` together. The 2.0 API clients require core 2.0.

## Sending attachment forms

`Sendmux\Sending\Model\Attachment` accepts either an inline attachment (`content` and `filename`) or an uploaded attachment reference (`attachment_id`). Do not mix the two forms. `listInvalidProperties()` validates each form against its own schema.

`getContent()` and `getFilename()` now return `?string`; their setters also accept `?string` because these fields are absent from uploaded references. The new `getAttachmentId()` is likewise nullable for inline attachments. Update typed wrappers or method overrides accordingly.

The union model no longer supplies `encoding` by default, so an uploaded reference does not receive an inline-only field. The API defaults inline encoding to `base64`; set `encoding` explicitly if your code needs it present in the serialized request or getter result.

## Mailbox attachment lists

`Sendmux\Mailbox\Model\MailboxMessage` and `MailboxRealtimeMessage` now expose nullable attachment arrays: `getAttachments()` returns `?array`, and `setAttachments()` accepts `?array`. The schema makes this field optional; an absent field can remain null in the PHP model.

Code that iterates over attachments can explicitly use an empty list when the field is absent:

```php
foreach ($message->getAttachments() ?? [] as $attachment) {
    // Process the attachment metadata.
}
```

Keep a null check if your application distinguishes an absent field from an empty array. Update any subclasses or typed wrappers that override these methods.

## Management model types

All types below are in `Sendmux\Management\Model`.

| Model and methods | 1.x type | 2.0 type |
| --- | --- | --- |
| `DeliveryLogItemResponse::getData()` / `setData()` | `DeliveryLogItem` | `DeliveryLogDetail` |
| `UpdateMailboxBody::getSendScope()` / `setSendScope()` | `?ManagementCreateMailboxRequestSendScope` | `?UpdateMailboxBodySendScope` |

Update imports, type declarations, constructors, and method overrides that refer to the previous types. List delivery-log items still use `DeliveryLogItem`; use `DeliveryLogDetail` for a single delivery-log detail response. Use `UpdateMailboxBodySendScope` when constructing an update body; the create request keeps its own scope model.

## Connection checks

Use `sendingGetConnection()`, `mailboxGetConnection()`, or `managementGetConnection()` to validate credentials and retrieve team and credential details. The Mailbox connection check does not require a target mailbox selector. See each package README for its client factory and credential requirements.

## Attachment download arguments

The optional `download_token` argument comes after `contentType` on `mailboxGetMessageAttachment()` and its HTTP-info, asynchronous, and request-building variants. Existing positional arguments retain their meaning.

## Response and validation errors

Asynchronous calls now reject malformed or empty JSON success bodies with `ApiException`, matching synchronous calls. Documented bodyless responses, including 304, remain bodyless. Required fields still report validation errors when missing, without passing null into string or pattern constraints.
