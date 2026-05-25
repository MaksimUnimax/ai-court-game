# Silero TTS integration notes

Sources

- https://github.com/snakers4/silero-models
- https://pytorch.org/hub/snakers4_silero-models_tts/
- https://pypi.org/project/silero/

Captured facts

- Silero TTS can be used via PyTorch Hub.
- Silero TTS can be used via the `silero` pip package.
- The documentation also describes manual caching/loading of models and utilities.
- The PyTorch Hub page states Russian speakers are supported, with six Russian speakers listed on that page.
- The PyTorch Hub page also shows support for multiple languages and multiple sampling rates.

Likely integration shape for AI Court Game

This is a product-level inference, not an implemented feature:

- Scenario text should continue to live in `response_text`.
- A participant-level voice profile can choose the TTS voice/speaker for a reply.
- A server-side TTS adapter can synthesize speech from the text response.
- Generated audio can be cached as WAV or MP3 for reuse.
- The browser UI can then expose playback controls for the generated response audio.

Non-goals for this capture

- No app code is changed here.
- No Silero model is downloaded here.
- No TTS runtime service is started here.
- No dependency is installed here.
- No voice feature is enabled in the product yet.

Implementation caution

The current capture is only a documentation baseline. Any future integration should be designed separately and should keep the TTS boundary isolated from scenario import, image assets, and active-case persistence.
