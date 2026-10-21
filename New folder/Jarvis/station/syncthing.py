"""
God Station — Photo / Music / File sync (via Syncthing)
=========================================================
Syncthing is a free, open-source app that keeps folders identical on your
PC, phone and tablet (camera roll, music, documents…). It runs natively,
so it keeps syncing in the background, which a web app can't do on Android.

The God Station talks to Syncthing on the PC, so each synced folder shows
up in the app as an on/off switch.
"""

from urllib.parse import quote

import httpx


class SyncthingError(Exception):
    pass


class Syncthing:
    def __init__(self, url: str, api_key: str):
        self.url = url.rstrip("/")
        self.api_key = api_key

    async def _request(self, method: str, path: str, **kwargs):
        if not self.api_key:
            raise SyncthingError("Syncthing isn't connected yet. Paste its API key in the app (PC → Switches).")
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.request(method, f"{self.url}{path}",
                                         headers={"X-API-Key": self.api_key}, **kwargs)
        except httpx.HTTPError:
            raise SyncthingError("Can't reach Syncthing on this PC. Is it running?")
        if r.status_code in (401, 403):
            raise SyncthingError("Syncthing rejected the API key. Copy it again from Syncthing → Actions → Settings.")
        r.raise_for_status()
        return r.json() if r.content else {}

    async def folders(self) -> list[dict]:
        folders = await self._request("GET", "/rest/config/folders")
        devices = {d["deviceID"]: d.get("name") or d["deviceID"][:7]
                   for d in await self._request("GET", "/rest/config/devices")}
        out = []
        for f in folders:
            out.append({
                "id": f["id"],
                "label": f.get("label") or f["id"],
                "path": f.get("path", ""),
                "paused": bool(f.get("paused")),
                "devices": [devices.get(d["deviceID"], "?") for d in f.get("devices", [])],
            })
        return out

    async def set_paused(self, folder_id: str, paused: bool) -> dict:
        await self._request("PATCH", f"/rest/config/folders/{quote(folder_id, safe='')}", json={"paused": paused})
        return {"ok": True}
