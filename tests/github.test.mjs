import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGitHubSource } from '../server/github.mjs'

test('accepts GitHub file, directory, raw and repository links', () => {
  assert.deepEqual(parseGitHubSource('https://github.com/acme/skills/blob/main/skills/search/SKILL.md'), { owner: 'acme', repo: 'skills', ref: 'main', path: 'skills/search/SKILL.md', type: 'file' })
  assert.equal(parseGitHubSource('https://github.com/acme/skills/tree/main/skills/search').path, 'skills/search/SKILL.md')
  assert.equal(parseGitHubSource('https://raw.githubusercontent.com/acme/skills/main/SKILL.md').path, 'SKILL.md')
  assert.equal(parseGitHubSource('https://github.com/acme/skills').ref, null)
})

test('rejects arbitrary hosts, credentials, ports and non-HTTPS links', () => {
  for (const url of ['http://github.com/acme/skills', 'https://127.0.0.1/SKILL.md', 'https://github.com.evil.test/acme/skills', 'https://user:pass@github.com/acme/skills', 'https://github.com:444/acme/skills', 'file:///etc/passwd', 'garbage']) {
    assert.throws(() => parseGitHubSource(url))
  }
})
