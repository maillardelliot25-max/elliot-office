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

    private final String server;
    private final String token;

    Api(Context c) {
        server = Prefs.server(c);
        token = Prefs.token(c);
    }

    private HttpURLConnection open(String path, String method, int readTimeoutMs) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(server + path).openConnection();
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

    String chatUrl(String chatId) {
        return server + "/?key=" + token + (chatId != null ? "#chat=" + chatId : "");
    }
}
