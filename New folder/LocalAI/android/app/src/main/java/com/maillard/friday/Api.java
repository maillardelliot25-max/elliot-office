package com.maillard.friday;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Talks to the Friday app on your PC (same API the Chrome extension uses). Call off the main thread. */
final class Api {
    interface LineHandler {
        void onLine(JSONObject event) throws Exception;
    }

    private static volatile long lastReached;   // skip the reachability check while the PC answered recently
    private final Context ctx;
    private String server;
    private final String token;

    Api(Context c) {
        ctx = c.getApplicationContext();
        server = Prefs.server(c);
        token = Prefs.token(c);
    }

    /**
     * The address that works right now. Tries the saved one, then every address the PC has used before, then asks
     * the local networks (USB cable, hotspot, Wi-Fi) where Friday is. So it keeps working with no Wi-Fi router or
     * internet, and when you move between home Wi-Fi, a USB cable and your hotspot.
     */
    private String where() {
        if (System.currentTimeMillis() - lastReached < 20000 || Discovery.reachable(server)) return server;
        for (String s : Prefs.known(ctx)) {
            if (!s.equals(server) && Discovery.reachable(s)) return switchTo(s);
        }
        String found = Discovery.find();
        return found != null ? switchTo(found) : server;
    }

    private String switchTo(String s) {
        Prefs.useServer(ctx, s);
        server = s;
        return s;
    }

    private HttpURLConnection open(String path, String method, int readTimeoutMs) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(where() + path).openConnection();
        con.setRequestMethod(method);
        con.setConnectTimeout(6000);
        con.setReadTimeout(readTimeoutMs);
        con.setRequestProperty("Content-Type", "application/json");
        con.setRequestProperty("X-Friday-Token", token);
        return con;
    }

    private static String readAll(InputStream in) throws IOException {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
        }
        return sb.toString();
    }

    private static void check(HttpURLConnection con) throws IOException {
        int code = con.getResponseCode();
        lastReached = System.currentTimeMillis();
        if (code >= 400) {
            String msg = readAll(con.getErrorStream());
            try {
                msg = new JSONObject(msg).optString("error", msg);
            } catch (Exception ignored) {
            }
            if (code == 401) msg = "The pairing code was rejected. Copy it again from the PC app's Settings.";
            throw new IOException(msg.trim());
        }
    }

    JSONObject get(String path) throws IOException {
        HttpURLConnection con = open(path, "GET", 20000);
        try {
            check(con);
            return new JSONObject(readAll(con.getInputStream()));
        } catch (org.json.JSONException e) {
            throw new IOException("Unexpected reply from the PC app.");
        } finally {
            con.disconnect();
        }
    }

    JSONObject post(String path, JSONObject body) throws IOException {
        HttpURLConnection con = open(path, "POST", 120000);
        try {
            write(con, body);
            check(con);
            return new JSONObject(readAll(con.getInputStream()));
        } catch (org.json.JSONException e) {
            throw new IOException("Unexpected reply from the PC app.");
        } finally {
            con.disconnect();
        }
    }

    /** POST and hand each line of the streamed reply (one JSON event per line) to the handler. */
    void stream(String path, JSONObject body, LineHandler handler) throws Exception {
        HttpURLConnection con = open(path, "POST", 600000);
        try {
            write(con, body);
            check(con);
            try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (!line.trim().isEmpty()) handler.onLine(new JSONObject(line));
                }
            }
        } finally {
            con.disconnect();
        }
    }

    private static void write(HttpURLConnection con, JSONObject body) throws IOException {
        con.setDoOutput(true);
        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        con.setFixedLengthStreamingMode(data.length);
        try (OutputStream out = con.getOutputStream()) {
            out.write(data);
        }
    }

    /** Look for the PC on the local networks now (the "Find my PC" button). Returns the address or null. */
    static String findNow(Context c) {
        String found = Discovery.find();
        if (found != null) Prefs.useServer(c, found);
        return found;
    }

    String chatUrl(String chatId) {
        return server + "/?key=" + token + (chatId != null ? "#chat=" + chatId : "");
    }
}
