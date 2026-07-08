# frozen_string_literal: true

require 'json'
require 'pathname'

root = Pathname.new(__dir__).parent
[
  'packages/ruby/core/lib',
  'packages/ruby/mailbox/lib',
  'packages/ruby/management/lib',
  'packages/ruby/sending/lib',
  'packages/ruby/sdk/lib'
].each do |path|
  $LOAD_PATH.unshift((root + path).to_s)
end

require 'sendmux/sdk'

BODY_KEY_CACHE = {}

def main
  plan = JSON.parse(ENV.fetch('SENDMUX_LIVE_E2E_LANGUAGE_PLAN'))
  api_sets = {}
  results = []

  plan.fetch('operations').each do |operation|
    begin
      surface = operation.fetch('surface')
      api_sets[surface] ||= create_apis(surface)
      value = call_operation(api_sets.fetch(surface), operation)
      assert_response(operation, value)
      entry = {
        'adapter' => 'ruby',
        'operationId' => operation.fetch('operationId'),
        'status' => 'passed'
      }
      cleanup = cleanup_result(operation, value)
      entry['cleanup'] = cleanup unless cleanup.nil?
      results << entry
    rescue StandardError => e
      code = api_error_code(e)
      if !code.nil? && Array(operation['expectedErrorCodes']).include?(code)
        results << {
          'adapter' => 'ruby',
          'operationId' => operation.fetch('operationId'),
          'status' => 'passed'
        }
        next
      end
      results << {
        'adapter' => 'ruby',
        'error' => e.message,
        'operationId' => operation.fetch('operationId'),
        'status' => 'failed'
      }
    end
  end

  puts JSON.pretty_generate('results' => results)
end

def create_apis(surface)
  case surface
  when 'mailbox'
    [Sendmux::SDK.mailbox(api_key: mailbox_api_key, base_url: app_base_url).mailbox_api]
  when 'management'
    client = Sendmux::SDK.management(api_key: root_api_key, base_url: app_base_url)
    [
      client.billing,
      client.domain_filters,
      client.domains,
      client.emails,
      client.inboxes,
      client.mailbox_filters,
      client.mailboxes,
      client.sending_accounts,
      client.webhooks
    ]
  when 'sending'
    client = Sendmux::SDK.sending(api_key: mailbox_api_key, base_url: sending_base_url)
    [client.attachments, client.emails, client.meta]
  else
    raise "Unknown surface: #{surface}"
  end
end

def call_operation(apis, operation)
  method_name = snake_case(operation.fetch('operationId'))
  method_name = "#{method_name}_with_http_info" if binary_operation?(operation)
  apis.each do |api|
    next unless api.respond_to?(method_name)

    args = args_for(api, method_name, operation)
    value = api.public_send(method_name, *args)
    value = value.first if binary_operation?(operation) && value.is_a?(Array)
    return operation.fetch('operationId') == 'mailboxStreamEvents' ? first_sse_event(value.to_s) : normalise(value)
  end
  raise "Ruby SDK operation #{operation.fetch('operationId')} is not exported"
end

def args_for(api, method_name, operation)
  request = operation['request'] || {}
  values = request_values(request)
  used = {}
  opts = {}
  positionals = []
  method = api.method(method_name)
  body_consumed = false

  method.parameters.each do |kind, name|
    next if name == :opts
    next unless %i[req opt].include?(kind)

    key = name.to_s
    value = values[key]
    if value.nil? && request.key?('body') && kind == :req
      if operation['bodyKind'] == 'binary'
        value = request['body'].to_s
        body_consumed = true
      else
        value = request['body']
        body_consumed = true
      end
    end
    raise "Missing Ruby SDK argument #{key} for #{operation.fetch('operationId')}" if value.nil? && kind == :req

    unless value.nil?
      positionals << value
      used[key] = true
    end
  end

  values.each do |key, value|
    opts[key.to_sym] = value unless used[key]
  end

  if request.key?('body') && !body_consumed
    if operation['bodyKind'] == 'binary'
      opts[:body] = request['body'].to_s
    else
      opts[body_key_for(api, method_name).to_sym] = request['body']
    end
  end

  opts[:debug_return_type] = 'String' if operation.fetch('operationId') == 'mailboxStreamEvents' ||
                                      operation.fetch('operationId') == 'mailboxGetMessageAttachment' ||
                                      operation['responseKind'] == 'binary'
  wants_opts = method.parameters.any? { |_, name| name == :opts }
  positionals << opts if wants_opts && !opts.empty?
  positionals
end

def binary_operation?(operation)
  operation['responseKind'] == 'binary' || operation.fetch('operationId') == 'mailboxGetMessageAttachment'
end

def request_values(request)
  values = {}
  %w[path query].each do |source|
    (request[source] || {}).each do |key, value|
      values[option_name(source, key)] = value
    end
  end
  (request['headers'] || {}).each do |key, value|
    values[option_name('headers', key)] = value
  end
  values
end

def option_name(source, key)
  return 'last_event_id2' if source == 'headers' && key == 'Last-Event-ID'

  key.tr('-', '_').downcase
end

def body_key_for(api, method_name)
  cache_key = "#{api.class.name}##{method_name}"
  return BODY_KEY_CACHE.fetch(cache_key) if BODY_KEY_CACHE.key?(cache_key)

  with_info = api.method("#{method_name}_with_http_info")
  file, line = with_info.source_location
  source = File.readlines(file)
  method_source = source[(line - 1)..].take_while.with_index do |content, index|
    index.zero? || !content.match?(/^    def /)
  end.join
  match = method_source.match(/object_to_http_body\(opts\[:'([^']+)'\]\)/)
  raise "Could not infer Ruby SDK body option for #{cache_key}" unless match

  BODY_KEY_CACHE[cache_key] = match[1]
end

def first_sse_event(body)
  body.gsub("\r\n", "\n").split("\n\n").each do |block|
    data = block.lines.filter_map do |line|
      line.start_with?('data:') ? line.delete_prefix('data:').strip : nil
    end
    return JSON.parse(data.join("\n")) unless data.empty?
  end
  raise 'mailboxStreamEvents did not yield an SSE data event'
end

def assert_response(operation, value)
  operation_id = operation.fetch('operationId')
  if operation_id == 'mailboxStreamEvents'
    event_type = value['event_type'] || value['event']
    unless %w[message.received message.received.spam sync_required].include?(event_type)
      raise 'mailboxStreamEvents did not return a mailbox realtime event'
    end
    return
  end

  if operation['responseKind'] == 'binary' || operation_id == 'mailboxGetMessageAttachment'
    return if (value.is_a?(String) && !value.empty?) || (value.is_a?(Hash) && !value.empty?)

    raise "#{operation_id} did not return binary content"
  end

  if operation['responseKind'] == 'text'
    raise "#{operation_id} did not return text" unless value.is_a?(String) && !value.empty?

    return
  end

  if operation_id == 'sendingGetOpenApiSpec'
    raise 'sendingGetOpenApiSpec did not return OpenAPI 3.1' unless value['openapi'] == '3.1.0' && value['paths'].is_a?(Hash)

    return
  end

  raise "#{operation_id} did not return ok=true" unless value['ok'] == true
  raise "#{operation_id} did not return meta.request_id" unless value.dig('meta', 'request_id').is_a?(String)
end

def cleanup_result(operation, value)
  cleanup = {}
  Array(operation['cleanupSelectors']).each do |selector|
    selected = value_at_path(value, selector)
    set_value_at_path(cleanup, selector, selected) unless selected.nil?
  end
  cleanup.empty? ? nil : cleanup
end

def normalise(value)
  case value
  when Hash
    value.each_with_object({}) { |(key, child), out| out[key.to_s] = normalise(child) }
  when Array
    value.map { |child| normalise(child) }
  else
    value.respond_to?(:to_hash) ? normalise(value.to_hash) : value
  end
end

def value_at_path(value, selector)
  selector.split('.').reduce(value) do |current, segment|
    return nil if current.nil?

    if current.is_a?(Hash)
      current[segment] || current[segment.to_sym]
    elsif current.is_a?(Array) && segment.match?(/^\d+$/)
      current[segment.to_i]
    end
  end
end

def set_value_at_path(target, selector, value)
  current = target
  parts = selector.split('.')
  parts[0...-1].each do |segment|
    current[segment] = {} unless current[segment].is_a?(Hash)
    current = current[segment]
  end
  current[parts.last] = value
end

def api_error_code(error)
  return error.code if error.respond_to?(:code) && error.code.is_a?(String)

  nil
end

def snake_case(value)
  value.gsub(/([A-Z])/, '_\1').downcase.sub(/^_/, '')
end

def app_base_url
  ENV['SENDMUX_LIVE_E2E_APP_BASE_URL'] || ENV['SENDMUX_STAGING_APP_BASE_URL'] || 'https://app.sendmux.ai/api/v1'
end

def sending_base_url
  ENV['SENDMUX_LIVE_E2E_SENDING_BASE_URL'] || ENV['SENDMUX_STAGING_SMTP_BASE_URL'] || 'https://smtp.sendmux.ai/api/v1'
end

def root_api_key
  require_any_env('SENDMUX_LIVE_E2E_ROOT_API_KEY', 'SENDMUX_STAGING_ROOT_API_KEY')
end

def mailbox_api_key
  require_any_env('SENDMUX_LIVE_E2E_MAILBOX_API_KEY', 'SENDMUX_STAGING_MAILBOX_API_KEY')
end

def require_any_env(*names)
  names.each do |name|
    value = ENV[name]
    return value if value && !value.empty?
  end
  raise "Missing required environment variable: #{names.join(' or ')}"
end

main
