# Nod.ie

[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/knowall-ai/Nod.ie?label=CodeRabbit+Reviews&labelColor=171717&color=FF570A)](https://coderabbit.ai)

Nod.ie is KnowAll AI's local voice assistant. It offers an Electron overlay and a loopback browser interface, with either an Unmute realtime backend or push-to-talk transcription, Ollama and speech synthesis. Optional Reverie integration provides memory recall; the Unmute bridge also supports bounded, confirmed memory saves.

## Get started

Requires Node.js 22 or later and separately configured voice services.

```bash
npm ci
cp .env.example .env
# Set your voice mode and service endpoints in .env.
npm test
npm run web
```

Open http://127.0.0.1:8095 on the same computer. In local mode, click the avatar to record and again to send; click during processing or playback to cancel. Use `npm start` for the desktop overlay. Ubuntu may require the application-specific sandbox setup described in [installation](docs/INSTALLATION.adoc).

The optional CPU voice uses Kokoro and two inference threads. Run `bash scripts/setup-cpu-voice.sh`, then `bash scripts/start-voice-service.sh`; configure `LOCAL_TTS_URL=http://127.0.0.1:8104`. No large speech services are started automatically. Voice quality and latency depend on the selected services and available resources.

## Announcements from local apps

Start Nod.ie normally first, then let Sofa Launcher or another local app announce text:

```bash
nodie --say "Someone's at the front door"
# From this checkout:
npm start -- --say "Someone's at the front door"
```

`--say="Text"` also works. Quote the text as one shell argument, or pass `['--say', text]` in your launcher's process API. The command forwards to the running Electron instance without opening or focusing a window. If Nod.ie is not running, it prints a message and exits with code 1; malformed input exits with code 2. Cold startup normally enables listening, so announcements deliberately require an existing instance. A successful forwarding process exits normally; this is best-effort delivery, not a playback acknowledgement.

Text must be a string of 1–200 Unicode characters after control characters are stripped and whitespace is trimmed. Speech uses that cleaned text verbatim through TTS; it never goes to an LLM, memory or conversation history. The command does not start or resume listening or open a microphone. Existing realtime microphone audio is withheld from the conversation backend during announcement synthesis/playback. Speaker mute is respected.

At most one command is admitted per five seconds; extras are dropped. There is one waiting slot. Recording, user speech, response generation and buffered speech defer playback. Announcements must begin within ten seconds of receipt, including synthesis time, or are dropped. They do not interrupt a current utterance. Unavailable TTS produces a small notice without crashing.

Settings → Connection Settings → **Allow other apps to make Nod.ie speak (announcements)** defaults ON. When OFF, commands are ignored and logged without their text. This is a local convenience interface for apps running in the same Electron user profile, not an authenticated messaging service.

Local voice mode uses the configured `LOCAL_TTS_URL` service. Unmute mode connects directly to moshi at `KYUTAI_TTS_URL` (default `ws://127.0.0.1:8089`), using the selected `VOICE_MODEL`. Expose the TTS service on loopback or configure its reachable WebSocket URL; the Unmute conversation WebSocket is not a TTS endpoint. No service is started automatically. See [installation](docs/INSTALLATION.adoc).

## Updates and security

Docker monitoring checks running containers at startup and every six hours while Nod.ie runs. It reports available releases, image changes and selected security advisories. Unknown or unreachable sources are reported explicitly; this is not a comprehensive vulnerability scanner. Desktop settings provide review and confirmation before supported Compose updates. Version migrations and managed stacks require their official update procedure.

```bash
npm run security:scan
```

Nod.ie does not expose Docker administration through the browser or execute payments, shell commands, or memory writes through conversation. See [responsible disclosure](SECURITY.md) and [update monitoring](docs/SECURITY_UPDATES.adoc).

## Diagnostics

Health/activity monitoring samples container state and host resource pressure every minute. Settings shows alerts and bounded application logs; local voice can explain a read-only diagnostic snapshot. See [monitoring scope and logging](docs/DIAGNOSTICS.adoc). These signals are not proof of an intrusion.

## Documentation and contributions

Canonical documentation is in [`docs/*.adoc`](docs/TECHNICAL_SOLUTION_DOCUMENT.adoc). Install the gems in `docs/Gemfile`, then run `npm run docs` to build the branded technical solution PDF. Generated PDFs are not committed.

See [contributing](CONTRIBUTE.md), [testing](docs/TESTING.adoc), [memory](docs/MEMORY.adoc), and [troubleshooting](docs/TROUBLESHOOTING.adoc). Older Markdown design notes describe historical implementations.

Public repository: https://github.com/KnowAll-AI/Nod.ie. Licensed under [MIT](LICENSE).
