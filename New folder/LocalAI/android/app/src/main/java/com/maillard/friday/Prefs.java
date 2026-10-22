package com.maillard.friday;

import android.content.Context;
import android.content.SharedPreferences;

/** Where the Friday app on your PC lives, and the pairing code it showed you. */
final class Prefs {
    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("friday", Context.MODE_PRIVATE);
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
        // 192.168.1.20 → http://192.168.1.20:8765; a full https:// address is left as typed
        if (s.startsWith("http://") && !s.matches(".*:\\d+$")) s = s + ":8765";
        sp(c).edit().putString("server", s).putString("token", token.trim()).apply();
    }

    /** Apps where you said "Not in this app" to the form helper. */
    static boolean muted(Context c, String pkg) {
        return sp(c).getStringSet("form_muted", java.util.Collections.emptySet()).contains(pkg);
    }

    static void mute(Context c, String pkg) {
        java.util.Set<String> set = new java.util.HashSet<>(sp(c).getStringSet("form_muted", java.util.Collections.emptySet()));
        set.add(pkg);
        sp(c).edit().putStringSet("form_muted", set).apply();
    }

    static int mutedCount(Context c) {
        return sp(c).getStringSet("form_muted", java.util.Collections.emptySet()).size();
    }

    static void unmuteAll(Context c) {
        sp(c).edit().remove("form_muted").apply();
    }

    static boolean configured(Context c) {
        return !server(c).isEmpty() && !token(c).isEmpty();
    }
}
