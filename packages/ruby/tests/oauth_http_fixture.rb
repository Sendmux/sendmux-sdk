# frozen_string_literal: true

require 'socket'
require 'json'

module SendmuxRubyOAuthHTTPFixture
  CONNECTION = {
    ok: true,
    data: {
      team: { id: 'team_test', name: 'Test' },
      credential: { id: 'grant_test', type: 'oauth', name: nil },
      label: 'Test', permissions: [], mailboxes: []
    },
    meta: { request_id: 'req_test' }
  }.to_json.freeze

  def with_server(response: [200, {}, CONNECTION])
    server = TCPServer.new('127.0.0.1', 0)
    requests = []
    worker = Thread.new do
      loop { serve(server.accept, requests, response) }
    rescue IOError, Errno::EBADF
      raise unless server.closed?
    end
    yield "http://127.0.0.1:#{server.addr[1]}/api/v1", requests
  ensure
    server&.close
    worker&.join(5)
    refute worker&.alive?, 'HTTP fixture thread did not exit'
    worker&.value
  end

  def serve(socket, requests, response)
    request_line = socket.gets
    headers = {}
    while (line = socket.gets) && line != "\r\n"
      key, value = line.split(':', 2)
      headers[key.downcase] = value.strip
    end
    body = socket.read(headers.fetch('content-length', '0').to_i)
    requests << { line: request_line, headers: headers, body: body }
    status, response_headers, response_body = response
    head = { 'Content-Type' => 'application/json', 'Content-Length' => response_body.bytesize,
             'Connection' => 'close' }.merge(response_headers)
    socket.write("HTTP/1.1 #{status} Response\r\n")
    head.each { |key, value| socket.write("#{key}: #{value}\r\n") }
    socket.write("\r\n#{response_body}")
  ensure
    socket.close
  end
end
