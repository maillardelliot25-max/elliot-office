package com.maillard.friday;

import android.content.Context;
import android.net.wifi.WifiManager;

import java.util.Collections;

/**
 * The PC-hotspot Wi-Fi suggestion (max priority) made Android hunt for a network that usually isn't there,
 * freezing the phone every few seconds. Friday no longer adds it, and removes any it added before.
 */
final class Hotspot {
    private Hotspot() {}

    /** Removes every Wi-Fi suggestion this app ever added (empty list = all of ours). Safe to call often. */
    static void clear(Context c) {
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) wm.removeNetworkSuggestions(Collections.emptyList());
        } catch (Exception ignored) {
        }
    }
}
