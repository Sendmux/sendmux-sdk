# frozen_string_literal: true

require_relative 'lib/sendmux/mailbox/version'

Gem::Specification.new do |spec|
  spec.name = 'sendmux-mailbox'
  spec.version = Sendmux::Mailbox::VERSION
  spec.authors = ['Sendmux']
  spec.email = ['contact@sendmux.ai']
  spec.summary = 'Ruby SDK for the Sendmux Mailbox API.'
  spec.homepage = 'https://github.com/Sendmux/sendmux-sdk'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.1'
  spec.metadata = {
    'homepage_uri' => spec.homepage,
    'source_code_uri' => "#{spec.homepage}/tree/main/packages/ruby/mailbox",
    'changelog_uri' => "#{spec.homepage}/blob/main/packages/ruby/mailbox/CHANGELOG.md"
  }
  spec.files = Dir.chdir(__dir__) { Dir['lib/**/*.rb', 'README.md', 'CHANGELOG.md', 'LICENSE'] }
  spec.require_paths = ['lib']
  spec.add_dependency 'faraday', '~> 2.0'
  spec.add_dependency 'faraday-multipart', '~> 1.0'
  spec.add_dependency 'faraday-retry', '>= 2.4', '< 3.0'
  spec.add_dependency 'marcel', '~> 1.0'
  spec.add_dependency 'sendmux-core', '~> 1.0'
end
