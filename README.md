# @99linesofcode/opencode-socket-plugin

Expose the active opencode session over a Unix domain socket. The plugin runs
inside the opencode process (TUI or server) and binds a Unix socket that
proxies the opencode HTTP API — session prompt, messages, SSE events — so
other processes (systemd services, bridges, watchers) can inject into and
watch the live session **without needing `opencode serve`**.

## Install

Add the package to your opencode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@99linesofcode/opencode-socket-plugin"]
}
```

opencode installs npm plugins automatically with Bun at startup.

## Usage

Once loaded, the plugin binds a socket at:

- `$OPENCODE_SOCKET_PATH` if set, else
- `$XDG_RUNTIME_DIR/opencode.sock` (default), else
- `/tmp/opencode.sock`

Talk to it with any HTTP client over the Unix socket:

```bash
# Health
curl --unix-socket /run/user/1000/opencode.sock http://localhost/global/health

# Active session
curl --unix-socket /run/user/1000/opencode.sock http://localhost/session/active

# Inject a prompt into the active session (blocking — waits for the reply)
curl --unix-socket /run/user/1000/opencode.sock \
  -X POST http://localhost/session/<id>/message \
  -H 'Content-Type: application/json' \
  -d '{"parts":[{"type":"text","text":"Hello from the bridge"}]}'

# Fire-and-forget injection
curl --unix-socket /run/user/1000/opencode.sock \
  -X POST http://localhost/session/<id>/prompt_async \
  -H 'Content-Type: application/json' \
  -d '{"parts":[{"type":"text","text":"Hello"}]}'

# Watch events in real time (SSE)
curl --unix-socket /run/user/1000/opencode.sock -N http://localhost/event
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/global/health` | Health check |
| GET | `/session` | List sessions |
| GET | `/session/active` | Most recently updated session in the plugin's directory |
| GET | `/session/:id` | Get a session |
| GET | `/session/:id/message` | List messages in a session |
| GET | `/session/:id/message/:messageID` | Get a message |
| POST | `/session/:id/message` | Send a prompt (blocking, returns the reply) |
| POST | `/session/:id/prompt_async` | Send a prompt (fire-and-forget) |
| POST | `/session/:id/command` | Run a slash command |
| POST | `/session/:id/abort` | Abort a running session |
| POST | `/session/:id/permissions/:permissionID` | Reply to a permission request |
| GET | `/event` | SSE stream of bus events (`?session=<id>` to filter) |

## Configuration

The socket path can be set via plugin options:

```json
{
  "plugin": [["@99linesofcode/opencode-socket-plugin", { "socketPath": "/run/user/1000/opencode.sock" }]]
}
```

or via the `OPENCODE_SOCKET_PATH` environment variable.

## Notes

- The socket lives and dies with the opencode process. No TUI/server running,
  no socket.
- The socket is mode 0600, user-owned — filesystem permissions are the only
  auth (same trust model as the TUI itself).
- Never `console.log` from this plugin — it runs inside the TUI process and
  stdout writes overlay the terminal UI. Logging goes through
  `client.app.log()`.

## Development

```bash
bun install       # install dependencies
bun run build     # compile TypeScript to build/
bun run dev       # watch and recompile on change
bun run test      # run the test suite once
bun run test:watch # run the test suite in watch mode
bun run lint      # eslint (flat config + prettier)
bun run typecheck # type-check without emitting
bun run audit     # check dependencies for known vulnerabilities
```

## Contributing

Please review the [Contribution Guidelines](https://github.com/99linesofcode/.github/blob/main/.github/CONTRIBUTING.md).

## Code of conduct

In order to ensure that the community is welcoming to all, please review and abide by the [Code of Conduct](https://github.com/99linesofcode/.github?tab=coc-ov-file).

## Security vulnerabilities

Please review the [security policy](https://github.com/99linesofcode/.github?tab=security-ov-file) on how to report security vulnerabilities.

## License

This software is open source and licensed under the [MIT license](https://github.com/99linesofcode/.github?tab=MIT-1-ov-file).