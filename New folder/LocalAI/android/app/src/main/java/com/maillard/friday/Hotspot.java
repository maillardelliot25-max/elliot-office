package com.maillard.friday;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSuggestion;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/**
 * Tells Android about the PC's hotspot (name + password from Jarvis), so the phone joins it by itself
 * whenever it's around and no better network is: Friday and Jarvis are then at 192.168.137.1, with no
 * router and no internet needed. Android asks once ("Allow suggested Wi-Fi networks?"): tap Allow.
 */
final class Hotspot {
    private Hotspot() {}

    static String register(Context c) {
        try {
            JSONObject h = new Api(c).get("/api/hotspot");
            String ssid = h.optString("ssid", ""), pass = h.optString("passphrase", "");
            if (ssid.isEmpty()) return "PC hotspot: not available yet (Jarvis turns it on).";
            WifiNetworkSuggestion s = new WifiNetworkSuggestion.Builder()
                    .setSsid(ssid).setWpa2Passphrase(pass).setPriority(Integer.MAX_VALUE).build();
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            List<WifiNetworkSuggestion> list = Collections.singletonList(s);
            wm.removeNetworkSuggestions(list);
            int r = wm.addNetworkSuggestions(list);
            Prefs.rememberAddress(c, "http://192.168.137.1:8765");   // Friday tries it whenever the PC is elsewhere unreachable
            return r == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
                    ? "✓ Phone joins the PC hotspot \"" + ssid + "\" automatically."
                    : "PC hotspot: Android refused (" + r + "). Join \"" + ssid + "\" once in Wi-Fi settings.";
        } catch (Exception e) {
            return "PC hotspot: " + e.getMessage();
        }
    }
}
