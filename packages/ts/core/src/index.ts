export interface SuccessEnvelope<TData = unknown, TMeta = unknown> {
  ok: true;
  data: TData;
  meta: TMeta;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    request_id?: string;
  };
}
