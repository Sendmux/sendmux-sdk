# frozen_string_literal: true

require_relative 'lib/sendmux/sdk/version'

Gem::Specification.new do |spec|
  spec.name = 'sendmux-sdk'
  spec.version = Sendmux::SDK::VERSION
  spec.authors = ['Sendmux']
  spec.email = ['contact@sendmux.ai']
  spec.summary = 'Umbrella Ruby SDK for Sendmux.'
  spec.homepage = 'https://github.com/Sendmux/sendmux-sdk'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.1'
  spec.metadata = {
    'homepage_uri' => spec.homepage,
    'source_code_uri' => "#{spec.homepage}/tree/main/packages/ruby/sdk",
    'changelog_uri' => "#{spec.homepage}/blob/main/packages/ruby/sdk/CHANGELOG.md"
  }
  spec.files = Dir.chdir(__dir__) { Dir['lib/**/*.rb', 'README.md', 'CHANGELOG.md', 'LICENSE'] }
  spec.require_paths = ['lib']
  spec.add_dependency 'sendmux-core', '>= 1.1.0', '< 2.0'
  spec.add_dependency 'sendmux-mailbox', '>= 1.0.0', '< 2.0'
  spec.add_dependency 'sendmux-management', '>= 1.0.0', '< 2.0'
  spec.add_dependency 'sendmux-sending', '>= 1.1.0', '< 2.0'
end
