import type {
  ResponseMeta,
  SuccessEnvelope,
} from "./types.js";

export async function* paginate<TItem, TMeta = ResponseMeta>(
  fetchPage: (cursor?: string) => Promise<SuccessEnvelope<TItem[], TMeta>>,
): AsyncGenerator<TItem, void, void> {
  let cursor: string | undefined;

  do {
    const page = await fetchPage(cursor);
    for (const item of page.data) {
      yield item;
    }

    if (page.pagination?.has_more) {
      if (!page.pagination.next_cursor) {
        throw new Error("Sendmux pagination response had has_more=true without next_cursor");
      }

      cursor = page.pagination.next_cursor;
    } else {
      cursor = undefined;
    }
  } while (cursor);
}
