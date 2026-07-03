import {
  mailboxStreamEvents,
  type Options,
} from "./generated/sdk.gen.js";
import type {
  MailboxRealtimeEvent,
  MailboxStreamEventsData,
  MailboxStreamEventsResponse,
} from "./generated/types.gen.js";

export type StreamMailboxEventsOptions<ThrowOnError extends boolean = false> = Options<
  MailboxStreamEventsData,
  ThrowOnError,
  MailboxStreamEventsResponse
>;

export async function* streamMailboxEvents<ThrowOnError extends boolean = false>(
  options?: StreamMailboxEventsOptions<ThrowOnError>,
): AsyncGenerator<MailboxRealtimeEvent, void, unknown> {
  const { stream } = await mailboxStreamEvents(options);
  for await (const event of stream) {
    yield event as MailboxRealtimeEvent;
  }
}
