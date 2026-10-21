"""
Model providers for Elliot AI: local Ollama plus optional cloud brains.

  - Ollama (local, free)          model names as Ollama lists them, e.g. "qwen3-coder:30b"
  - Claude via the Anthropic SDK  "cloud:anthropic:claude-opus-5-5"
  - ChatGPT via the OpenAI SDK    "cloud:openai:gpt-…"
  - Gemini via Google's OpenAI-compatible endpoint, "cloud:google:gemini-…"

Every provider runs one assistant turn with `run_round`, streaming text/thinking
through `emit` and returning (assistant_message, tool_calls, run_again).

Chat history is stored in one neutral format. Each assistant turn also keeps the
provider's own native form ("raw") so it can be replayed exactly, which Claude
needs for its thinking and tool-use blocks. Turns made by a different provider
are replayed as plain text.
"""

import json
import os
import re
import time
import urllib.request

OLLAMA = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
GEMINI = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
ANTHROPIC_BASE = os.getenv("ANTHROPIC_BASE_URL") or None
OPENAI_BASE = os.getenv("OPENAI_BASE_URL") or None

CLOUD_CAPS = ["completion", "tools", "vision", "thinking"]
CLAUDE_MODELS = ["claude-opus-5-5", "claude-fable-5-1", "claude-sonnet-5-5", "claude-haiku-5-5"]
CLAUDE_FALLBACK_MODELS = {"claude-opus-5-5", "claude-fable-5-1", "claude-sonnet-5-5", "claude-opus-5"}
PRETTY = {"anthropic": "Claude", "openai": "ChatGPT", "google": "Gemini"}

_model_cache = {}  # (provider, key) -> (time, [ids])


def provider_of(model):
    return model.split(":")[1] if model.startswith("cloud:") else "ollama"


def model_id(model):
    return model.split(":", 2)[2] if model.startswith("cloud:") else model


def sniff_mime(b64):
    for prefix, mime in (("iVBOR", "image/png"), ("/9j/", "image/jpeg"), ("UklGR", "image/webp"), ("R0lG", "image/gif")):
        if b64.startswith(prefix):
            return mime
    return "image/png"


# ── Clients ──────────────────────────────────────────────────────────────

def claude_client(settings):
    import anthropic
    if not settings.get("anthropic_api_key"):
        raise RuntimeError("Add your Anthropic API key in Settings to use Claude.")
    return anthropic.Anthropic(api_key=settings["anthropic_api_key"], base_url=ANTHROPIC_BASE)


def openai_client(settings, provider):
    import openai
    if provider == "google":
        if not settings.get("google_api_key"):
            raise RuntimeError("Add your Google AI Studio key in Settings to use Gemini.")
        return openai.OpenAI(api_key=settings["google_api_key"], base_url=f"{GEMINI}/openai/")
    if not settings.get("openai_api_key"):
        raise RuntimeError("Add your OpenAI API key in Settings to use ChatGPT models.")
    return openai.OpenAI(api_key=settings["openai_api_key"], base_url=OPENAI_BASE)


# ── Model lists ──────────────────────────────────────────────────────────

def _cached(provider, key, fetch):
    hit = _model_cache.get((provider, key))
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    ids = fetch()
    _model_cache[(provider, key)] = (time.time(), ids)
    return ids


def _version_key(name):
    return [int(n) for n in re.findall(r"\d+", name)[:3]]


def cloud_models(settings):
    """Cloud models the user's keys unlock. A provider that fails to list is skipped, with a note."""
    out, notes = [], []
    if settings.get("anthropic_api_key"):
        try:
            def fetch():
                available = {m.id for m in claude_client(settings).models.list()}
                return [m for m in CLAUDE_MODELS if m in available]
            ids = _cached("anthropic", settings["anthropic_api_key"], fetch)
        except ImportError:
            ids, _ = [], notes.append("Claude needs: pip install anthropic")
        except Exception as e:
            ids, _ = [], notes.append(f"Claude: {short_error(e)}")
        out += [{"name": f"cloud:anthropic:{i}", "label": i, "provider": "anthropic", "caps": CLOUD_CAPS} for i in ids]
    for provider, key_name in (("openai", "openai_api_key"), ("google", "google_api_key")):
        if not settings.get(key_name):
            continue
        try:
            ids = _cached(provider, settings[key_name], lambda: _list_openai_style(settings, provider))
        except ImportError:
            ids, _ = [], notes.append(f"{PRETTY[provider]} needs: pip install openai")
        except Exception as e:
            ids, _ = [], notes.append(f"{PRETTY[provider]}: {short_error(e)}")
        out += [{"name": f"cloud:{provider}:{i}", "label": i, "provider": provider, "caps": CLOUD_CAPS} for i in ids]
    return out, notes


def _list_openai_style(settings, provider):
    ids = [m.id.removeprefix("models/") for m in openai_client(settings, provider).models.list()]
    if provider == "openai":
        keep = [i for i in ids if re.fullmatch(r"(gpt-[5-9][\w.\-]*|o[34][\w\-]*)", i)
                and not re.search(r"\d{4}-\d{2}-\d{2}|audio|realtime|search|transcribe|tts|image|codex|chat-latest|nano", i)]
    else:
        keep = [i for i in ids if re.fullmatch(r"gemini-[\d.]+-(pro|flash)[\w.\-]*|gemini-\d+-\w+", i)
                and not re.search(r"image|tts|embedding|live|audio|customtools", i)]
    return sorted(keep, key=_version_key, reverse=True)[:6]


def short_error(e):
    msg = getattr(e, "message", None) or str(e)
    status = getattr(e, "status_code", None)
    if status == 401:
        return "the API key was rejected. Check it in Settings."
    if status == 429:
        return "rate limit or quota reached. Check your plan/billing, or wait a minute."
    return (f"error {status}: " if status else "") + msg[:300]


# ── Converting stored history for each provider ─────────────────────────

def _flat(messages, provider):
    """Yield (message, structured) pairs. Turns from another provider (and their tool
    results) are not replayable natively, so they're marked for plain-text replay."""
    structured = False
    for m in messages:
        if m.get("error"):
            continue
        if m["role"] == "assistant":
            structured = m.get("provider") == provider and m.get("raw") is not None
        elif m["role"] == "user":
            structured = False
        yield m, (structured if m["role"] != "user" else True)


def _as_text(m):
    if m["role"] == "assistant":
        parts = [m.get("content", "")]
        for c in m.get("tool_calls") or []:
            fn = c.get("function", {})
            parts.append(f"[Used tool {fn.get('name')}: {json.dumps(fn.get('arguments'))[:300]}]")
        return "\n".join(p for p in parts if p) or "(no reply)"
    return f"[Result of {m.get('tool_name', 'tool')}]\n{m.get('content', '')}"


def to_ollama(messages):
    out = []
    for m, structured in _flat(messages, "ollama"):
        if m["role"] == "user":
            msg = {"role": "user", "content": m.get("content", "")}
            if m.get("images"):
                msg["images"] = m["images"]
        elif structured and m["role"] == "assistant":
            msg = {"role": "assistant", "content": m.get("content", "")}
            if m.get("tool_calls"):
                msg["tool_calls"] = [{"function": c["function"]} for c in m["tool_calls"]]
        elif structured:
            msg = {"role": "tool", "tool_name": m.get("tool_name", ""), "content": m.get("content", "")}
        else:
            msg = {"role": "assistant" if m["role"] == "assistant" else "user", "content": _as_text(m)}
        out.append(msg)
    return out


def to_claude(messages):
    out = []
    for m, structured in _flat(messages, "anthropic"):
        if m["role"] == "user":
            blocks = [{"type": "image", "source": {"type": "base64", "media_type": sniff_mime(b), "data": b}}
                      for b in m.get("images") or []]
            blocks.append({"type": "text", "text": m.get("content") or "(see attached)"})
            out.append({"role": "user", "content": blocks})
        elif structured and m["role"] == "assistant":
            out.append({"role": "assistant", "content": m["raw"]})
        elif structured:   # tool results for one assistant turn all go in a single user message
            block = {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m.get("content") or "(no output)"}
            if m.get("is_error"):
                block["is_error"] = True
            if out and out[-1]["role"] == "user" and out[-1]["content"] and out[-1]["content"][0].get("type") == "tool_result":
                out[-1]["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
        else:
            out.append({"role": "assistant" if m["role"] == "assistant" else "user",
                        "content": [{"type": "text", "text": _as_text(m)}]})
    return out


def to_openai(messages, system, provider):
    out = [{"role": "system", "content": system}]
    for m, structured in _flat(messages, provider):
        if m["role"] == "user":
            parts = [{"type": "text", "text": m.get("content") or "(see attached)"}]
            parts += [{"type": "image_url", "image_url": {"url": f"data:{sniff_mime(b)};base64,{b}"}} for b in m.get("images") or []]
            out.append({"role": "user", "content": parts})
        elif structured and m["role"] == "assistant":
            out.append(m["raw"])
        elif structured:
            out.append({"role": "tool", "tool_call_id": m["tool_call_id"], "content": m.get("content") or "(no output)"})
        else:
            out.append({"role": "assistant" if m["role"] == "assistant" else "user", "content": _as_text(m)})
    return out


# ── Tool schemas per provider ────────────────────────────────────────────

def _schema(t):
    return {"type": "object",
            "properties": {k: {"type": "string", "description": v} for k, v in t["params"].items()},
            "required": t["required"]}


def claude_tools(tools, model):
    # Claude searches and reads the web with Anthropic's own server tools instead of ours
    defs = [{"name": t["name"], "description": t["description"], "input_schema": _schema(t),
             "eager_input_streaming": True}
            for t in tools if t["name"] not in ("web_search", "fetch_url")]
    if re.match(r"claude-(opus|sonnet)-", model):
        defs += [{"type": "web_search_20260209", "name": "web_search"}, {"type": "web_fetch_20260209", "name": "web_fetch"}]
    else:
        defs += [{"type": "web_search_20250305", "name": "web_search"}, {"type": "web_fetch_20250910", "name": "web_fetch"}]
    return defs


def openai_tools(tools):
    return [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": _schema(t)}}
            for t in tools]


# ── One assistant turn ───────────────────────────────────────────────────

def run_round(model, system, messages, tools, opts, settings, emit, stop):
    provider = provider_of(model)
    if provider == "anthropic":
        return claude_round(model_id(model), system, messages, tools, opts, settings, emit, stop)
    if provider in ("openai", "google"):
        return openai_round(provider, model_id(model), system, messages, tools, opts, settings, emit, stop)
    return ollama_round(model, system, messages, tools, opts, emit, stop)


def ollama_round(model, system, messages, tools, opts, emit, stop):
    body = {"model": model, "messages": [{"role": "system", "content": system}] + to_ollama(messages), "stream": True}
    if tools:
        body["tools"] = openai_tools(tools)
    if "thinking" in opts.get("caps", []):
        body["think"] = bool(opts.get("think"))
    req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    msg = {"role": "assistant", "content": "", "model": model, "provider": "ollama", "raw": True}
    thinking, calls = "", []
    with urllib.request.urlopen(req, timeout=600) as resp:
        for line in resp:
            if stop.is_set():
                break
            if not line.strip():
                continue
            j = json.loads(line)
            if j.get("error"):
                raise RuntimeError(j["error"])
            m = j.get("message", {})
            if m.get("thinking"):
                thinking += m["thinking"]
                emit({"type": "thinking", "delta": m["thinking"]})
            if m.get("content"):
                msg["content"] += m["content"]
                emit({"type": "text", "delta": m["content"]})
            calls += m.get("tool_calls") or []
    if thinking:
        msg["thinking"] = thinking
    out = []
    for i, c in enumerate(calls):
        fn = c.get("function", {})
        args = fn.get("arguments") or {}
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except ValueError:
                args = {"__invalid__": args}
        out.append({"id": f"call_{int(time.time() * 1000)}_{i}", "name": fn.get("name", ""), "args": args})
    if out:
        msg["tool_calls"] = [{"id": c["id"], "function": {"name": c["name"], "arguments": c["args"]}} for c in out]
    return msg, out, False


def claude_round(model, system, messages, tools, opts, settings, emit, stop):
    import anthropic
    client = claude_client(settings)
    params = {
        "model": model,
        "max_tokens": 64000,
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "messages": to_claude(messages),
        "thinking": {"type": "adaptive", "display": "summarized"},
    }
    # explicit effort: "medium" for everyday chat, "high" for Think / Research / Math / Build
    params["output_config"] = {"effort": opts.get("effort") or "medium"}
    if tools:
        params["tools"] = claude_tools(tools, model)
    if model in CLAUDE_FALLBACK_MODELS:   # on a safety decline, retry on Anthropic's recommended model
        params["betas"] = ["server-side-fallback-2026-07-01"]
        params["fallbacks"] = "default"

    for attempt in range(3):
        text, thinking, stopped = "", "", False
        try:
            with client.beta.messages.stream(**params) as stream:
                for ev in stream:
                    if stop.is_set():
                        stopped = True
                        break
                    if ev.type == "text":
                        text += ev.text
                        emit({"type": "text", "delta": ev.text})
                    elif ev.type == "thinking":
                        thinking += ev.thinking
                        emit({"type": "thinking", "delta": ev.thinking})
                final = None if stopped else stream.get_final_message()
            break
        except ValueError:      # tool input JSON the SDK couldn't parse: re-issue the turn
            if attempt == 2:
                raise RuntimeError("Claude sent a tool call that couldn't be read, three times in a row.")
        except anthropic.APIStatusError as e:
            raise RuntimeError(f"Claude: {short_error(e)}") from None
        except anthropic.APIConnectionError:
            raise RuntimeError("Can't reach Claude. Check your internet connection.") from None

    msg = {"role": "assistant", "content": text, "model": f"cloud:anthropic:{model}", "provider": "anthropic"}
    if thinking:
        msg["thinking"] = thinking
    if final is None:           # stopped by the user: keep what we have as plain text
        return msg, [], False

    if final.stop_reason == "refusal":
        details = getattr(final, "stop_details", None)
        category = getattr(details, "category", None)
        msg.update(content="", error=f"Claude declined this request{f' ({category})' if category else ''}. "
                                     "Try rephrasing it, or pick another model.")
        emit({"type": "error", "message": msg["error"]})
        return msg, [], False

    msg["raw"] = [b.to_dict(mode="json", exclude_none=True) for b in final.content]
    msg["content"] = "".join(b.text for b in final.content if b.type == "text")
    server = [{"name": b.name, "input": b.input} for b in final.content if b.type == "server_tool_use"]
    if server:
        msg["server_tools"] = server
        for s in server:
            emit({"type": "server_tool", "name": s["name"], "input": s["input"]})

    uses = [b for b in final.content if b.type == "tool_use"]
    if final.stop_reason == "pause_turn":    # server-side tools paused; send the turn back to resume
        return msg, [], True
    if uses and final.stop_reason == "max_tokens":
        msg.pop("raw")
        msg["error"] = "Claude's reply was cut off mid tool call. Try asking for smaller steps."
        emit({"type": "error", "message": msg["error"]})
        return msg, [], False
    calls = [{"id": b.id, "name": b.name, "args": b.input} for b in uses]
    if calls:
        msg["tool_calls"] = [{"id": c["id"], "function": {"name": c["name"], "arguments": c["args"]}} for c in calls]
    return msg, calls, False


def _reasoning_ok(provider, model):
    return provider == "google" or bool(re.match(r"(gpt-[5-9]|o[1-9])", model))


def openai_round(provider, model, system, messages, tools, opts, settings, emit, stop):
    import openai
    client = openai_client(settings, provider)
    params = {"model": model, "messages": to_openai(messages, system, provider), "stream": True}
    if tools:
        params["tools"] = openai_tools(tools)
    if opts.get("effort") and _reasoning_ok(provider, model):
        params["reasoning_effort"] = "high" if opts["effort"] in ("high", "xhigh", "max") else opts["effort"]

    text, calls = "", {}
    try:
        for chunk in client.chat.completions.create(**params):
            if stop.is_set():
                break
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                emit({"type": "thinking", "delta": reasoning})
            if delta.content:
                text += delta.content
                emit({"type": "text", "delta": delta.content})
            for tc in delta.tool_calls or []:
                c = calls.setdefault(tc.index, {"id": "", "name": "", "arguments": "", "extra": None})
                c["id"] = tc.id or c["id"]
                if tc.function:
                    c["name"] = tc.function.name or c["name"]
                    c["arguments"] += tc.function.arguments or ""
                extra = (tc.model_extra or {}).get("extra_content")   # Gemini's thought signatures
                if extra:
                    c["extra"] = extra
    except openai.APIStatusError as e:
        raise RuntimeError(f"{PRETTY[provider]}: {short_error(e)}") from None
    except openai.APIConnectionError:
        raise RuntimeError(f"Can't reach {PRETTY[provider]}. Check your internet connection.") from None

    msg = {"role": "assistant", "content": text, "model": f"cloud:{provider}:{model}", "provider": provider}
    if stop.is_set():
        return msg, [], False
    raw = {"role": "assistant", "content": text or None}
    out = []
    if calls:
        raw["tool_calls"] = []
        for i in sorted(calls):
            c = calls[i]
            cid = c["id"] or f"call_{i}"
            entry = {"id": cid, "type": "function", "function": {"name": c["name"], "arguments": c["arguments"] or "{}"}}
            if c["extra"]:
                entry["extra_content"] = c["extra"]
            raw["tool_calls"].append(entry)
            try:
                args = json.loads(c["arguments"] or "{}")
            except ValueError:
                args = {"__invalid__": c["arguments"]}
            out.append({"id": cid, "name": c["name"], "args": args})
        msg["tool_calls"] = [{"id": c["id"], "function": {"name": c["name"], "arguments": c["args"]}} for c in out]
    msg["raw"] = raw
    return msg, out, False


# ── One-shot answers (used by the file organizer) ───────────────────────

def complete(model, prompt, images=(), settings=None):
    """Single question → text answer, with optional images. No tools, no streaming."""
    provider = provider_of(model)
    if provider == "anthropic":
        import anthropic
        blocks = [{"type": "image", "source": {"type": "base64", "media_type": sniff_mime(b), "data": b}} for b in images]
        blocks.append({"type": "text", "text": prompt})
        try:
            r = claude_client(settings).messages.create(
                model=model_id(model), max_tokens=2000, output_config={"effort": "low"},
                messages=[{"role": "user", "content": blocks}])
        except anthropic.APIStatusError as e:
            raise RuntimeError(f"Claude: {short_error(e)}") from None
        if r.stop_reason == "refusal":
            return ""
        return "".join(b.text for b in r.content if b.type == "text")
    if provider in ("openai", "google"):
        import openai
        parts = [{"type": "text", "text": prompt}] + \
            [{"type": "image_url", "image_url": {"url": f"data:{sniff_mime(b)};base64,{b}"}} for b in images]
        try:
            r = openai_client(settings, provider).chat.completions.create(
                model=model_id(model), messages=[{"role": "user", "content": parts}])
        except openai.APIStatusError as e:
            raise RuntimeError(f"{PRETTY[provider]}: {short_error(e)}") from None
        return r.choices[0].message.content or ""
    body = {"model": model, "stream": False, "format": "json",
            "messages": [{"role": "user", "content": prompt, **({"images": list(images)} if images else {})}]}
    req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read()).get("message", {}).get("content", "")
