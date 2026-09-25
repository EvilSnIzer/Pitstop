#!/usr/bin/env python3
"""End-to-end smoke test for a running Pitstop stack.

Exercises the real HTTP surface — the Next.js BFF (cookie auth, CSRF header,
uploads, private media, idempotent retries) and the direct Django API (bearer
auth, pagination, health, docs). Nothing is mocked; a Gemini key is not
required, and diagnosis is expected to report `ai_not_configured` without one.

Configure with environment variables (defaults suit a local run):

    PITSTOP_FE_URL    frontend base URL        (default http://127.0.0.1:3000)
    PITSTOP_API_URL   Django base URL          (default http://127.0.0.1:8000)
    PITSTOP_ORIGIN    browser Origin to send   (default PITSTOP_FE_URL)
    PITSTOP_FE_HOST   Host header for the BFF  (default: from PITSTOP_FE_URL)
    PITSTOP_API_HOST  Host header for the API  (default: from PITSTOP_API_URL)

Run it with the backend virtualenv's interpreter so `httpx` and `Pillow` are
available:

    backend/.venv/bin/python scripts/smoke_test.py

Exits 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import io
import os
import sys
import time
import uuid
from urllib.parse import urlparse

import httpx

FE = os.environ.get("PITSTOP_FE_URL", "http://127.0.0.1:3000")
API = os.environ.get("PITSTOP_API_URL", "http://127.0.0.1:8000")
ORIGIN = os.environ.get("PITSTOP_ORIGIN", FE)
FE_HOST = os.environ.get("PITSTOP_FE_HOST") or urlparse(FE).netloc
API_HOST = os.environ.get("PITSTOP_API_HOST") or urlparse(API).netloc

EMAIL = f"smoke+{int(time.time())}@pitstop.dev"
PASSWORD = "Correct-horse-battery-9"

jar: dict[str, str] = {}
failures: list[str] = []
client = httpx.Client(timeout=60)


def headers(mutation: bool = False) -> dict[str, str]:
    h = {
        "Host": FE_HOST,
        "Origin": ORIGIN,
        "X-Forwarded-Proto": "https",
        "Accept": "application/json",
    }
    if mutation:
        h["X-Pitstop-Request"] = "1"
    if jar:
        h["Cookie"] = "; ".join(f"{k}={v}" for k, v in jar.items())
    return h


def absorb(response: httpx.Response) -> None:
    # Cookies are replayed manually: the app sets Secure cookies, which an
    # http.cookiejar will not send to a plain-HTTP loopback URL.
    for raw in response.headers.get_list("set-cookie"):
        name, _, rest = raw.partition("=")
        jar[name.strip()] = rest.split(";", 1)[0].strip()


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        failures.append(label)


def step(title: str) -> None:
    print(f"\n=== {title} ===")


def jpeg_bytes() -> bytes:
    from PIL import Image

    image = Image.new("RGB", (640, 480))
    for x in range(0, 640, 8):
        image.paste(((x * 3) % 256, 120, 90), (x, 0, min(x + 8, 640), 480))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85)
    return buffer.getvalue()


def main() -> int:
    print(f"frontend={FE} (Host: {FE_HOST}, Origin: {ORIGIN})")
    print(f"api={API} (Host: {API_HOST})")

    step("1. register through the BFF: cookies set, JWT pair not exposed to JS")
    r = client.post(
        f"{FE}/api/v1/auth/register",
        headers=headers(mutation=True),
        json={"email": EMAIL, "password": PASSWORD},
    )
    absorb(r)
    attrs = {
        a.strip().split("=")[0].lower()
        for c in r.headers.get_list("set-cookie")
        for a in c.split(";")[1:]
    }
    print(f"  {r.status_code} {r.text}")
    print(f"  cookies: {sorted(jar)}  attributes: {sorted(attrs)}")
    check(
        "register returns 201 {authenticated:true}",
        r.status_code == 201 and r.json() == {"authenticated": True},
    )
    check(
        "cookies are HttpOnly and SameSite",
        {"httponly", "samesite", "path"} <= attrs,
        ", ".join(sorted(attrs)),
    )

    step("2. mutation without X-Pitstop-Request is refused")
    r = client.post(f"{FE}/api/v1/sessions", headers=headers(), json={})
    print(f"  {r.status_code} {r.text}")
    check("403 csrf_failed", r.status_code == 403 and r.json()["code"] == "csrf_failed")

    step("3. create a session and read its seeded greeting")
    r = client.post(
        f"{FE}/api/v1/sessions", headers=headers(mutation=True), json={}
    )
    absorb(r)
    session = r.json()
    sid = session["id"]
    print(f"  {r.status_code} session id={sid} status={session['status']}")
    r_hist = client.get(f"{FE}/api/v1/sessions/{sid}/history", headers=headers())
    absorb(r_hist)
    hist = r_hist.json()
    print(f"  history {r_hist.status_code} messages={len(hist['messages'])}")
    check(
        "session created with an assistant greeting",
        r.status_code == 201
        and r_hist.status_code == 200
        and hist["messages"][0]["role"] == "assistant",
    )

    step("4. upload an image through the BFF")
    payload = jpeg_bytes()
    r = client.post(
        f"{FE}/api/v1/upload",
        headers=headers(mutation=True),
        files={"file": ("engine.jpg", payload, "image/jpeg")},
    )
    absorb(r)
    media = r.json()
    print(f"  {r.status_code} {media}")
    check(
        "upload accepted with a protected relative url",
        r.status_code == 201 and str(media.get("url", "")).startswith("/api/v1/media/"),
    )

    step("5. chat intake: photo, then one sentence carrying all four slots")
    r = client.post(
        f"{FE}/api/v1/chat",
        headers=headers(mutation=True) | {"Idempotency-Key": str(uuid.uuid4())},
        json={"session_id": sid, "media_id": media["id"]},
    )
    absorb(r)
    print(f"  media message {r.status_code}: {r.json()['message']['content'][:120]}")
    check("media message accepted", r.status_code == 200)

    idem = str(uuid.uuid4())
    send = headers(mutation=True) | {"Idempotency-Key": idem}
    body = {
        "session_id": sid,
        "content": "My 2019 Honda Civic developed a knocking engine noise suddenly yesterday",
    }
    r = client.post(f"{FE}/api/v1/chat", headers=send, json=body)
    absorb(r)
    chat = r.json()
    print(f"  intake {r.status_code}: {chat['message']['content'][:160]}")
    print(f"  diagnosis_ready={chat['session']['diagnosis_ready']}")
    check(
        "one sentence completes intake", chat["session"]["diagnosis_ready"] is True
    )

    step("6. unchanged retry with the same Idempotency-Key replays")
    r = client.post(f"{FE}/api/v1/chat", headers=send, json=body)
    print(f"  {r.status_code} Idempotency-Replayed={r.headers.get('idempotency-replayed')}")
    check(
        "replay flagged",
        r.status_code == 200 and r.headers.get("idempotency-replayed") == "true",
    )

    step("7. diagnosis without a provider key")
    r = client.post(
        f"{FE}/api/v1/diagnosis",
        headers=headers(mutation=True) | {"Idempotency-Key": str(uuid.uuid4())},
        json={"session_id": sid},
    )
    absorb(r)
    print(f"  {r.status_code} {r.text[:200]}")
    check(
        "ai_not_configured rather than an invented assessment",
        r.status_code == 503 and r.json()["code"] == "ai_not_configured",
    )

    step("8. private media is owner-scoped and non-cacheable")
    r = client.get(f"{FE}/api/v1/media/{media['id']}", headers=headers())
    print(
        f"  {r.status_code} type={r.headers.get('content-type')} "
        f"cache={r.headers.get('cache-control')} bytes={len(r.content)}"
    )
    check(
        "media bytes identical to the upload",
        r.status_code == 200 and r.content == payload,
    )
    anon = httpx.get(f"{FE}/api/v1/media/{media['id']}", headers={"Host": FE_HOST})
    print(f"  anonymous request: {anon.status_code}")
    check("anonymous media request refused", anon.status_code in (401, 403))

    step("9. direct Django API with a bearer token")
    direct = {"Host": API_HOST}
    r = client.post(
        f"{API}/api/v1/auth/token/",
        headers=direct,
        json={"username": EMAIL, "password": PASSWORD},
    )
    access = r.json()["access"]
    bearer = direct | {"Authorization": f"Bearer {access}"}
    print(f"  token {r.status_code}, access length {len(access)}")
    r = client.get(f"{API}/api/v1/auth/me/", headers=bearer)
    print(f"  me {r.status_code} {r.text}")
    check("bearer identity", r.status_code == 200 and r.json()["email"] == EMAIL)
    r = client.get(f"{API}/api/v1/sessions/?page=1", headers=bearer)
    listing = r.json()
    print(f"  sessions {r.status_code} count={listing['count']} keys={sorted(listing)}")
    r = client.get(f"{API}/api/v1/sessions/{sid}/history/", headers=bearer)
    hist = r.json()
    print(
        f"  history {r.status_code} messages={len(hist['messages'])} "
        f"older_cursor={hist['older_cursor']}"
    )
    check(
        "history and pagination contract",
        r.status_code == 200 and len(hist["messages"]) >= 3,
    )

    step("10. public health endpoints and served API docs")
    for path in ("health/live", "health/ready"):
        r = client.get(f"{API}/{path}/", headers=direct)
        print(f"  /{path}/ {r.status_code} {r.text}")
        check(f"{path} ok", r.status_code == 200)
    docs = client.get(f"{API}/api/docs/", headers=direct)
    schema = client.get(f"{API}/api/schema/", headers=direct)
    print(
        f"  /api/docs/ {docs.status_code} bytes={len(docs.text)}; "
        f"/api/schema/ {schema.status_code} bytes={len(schema.text)}"
    )
    check(
        "swagger UI and schema served",
        docs.status_code == 200 and schema.status_code == 200,
    )

    print(
        "\n" + ("ALL CHECKS PASSED" if not failures else f"FAILURES: {failures}")
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
