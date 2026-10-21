package com.maillard.jarvis;

import android.content.Context;
import android.content.SharedPreferences;

/** Where the Jarvis app on your PC lives, and the pairing code it showed you. */
final class Prefs {
    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("jarvis", Context.MODE_PRIVATE);
    }

    static String server(Context c) {
        return sp(c).getString("server", "");
    }

    static String token(Context c) {
        return sp(c).getString("token", "");
    }

    static void save(Context c, String server, String token) {
        String s = server.trim();
        if (!s.isEmpty() && !s.startsWith("http")) s = "http://" + s;
        if (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (!s.isEmpty() && !s.matches(".*:\\d+$")) s = s + ":8765";
        sp(c).edit().putString("server", s).putString("token", token.trim()).apply();
    }

    static boolean configured(Context c) {
        return !server(c).isEmpty() && !token(c).isEmpty();
    }
}
