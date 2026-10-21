package com.maillard.jarvis;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.concurrent.Executors;

/** Setup: connect to Jarvis on your PC, make Jarvis the phone's assistant, allow the microphone. */
public class MainActivity extends Activity {
    private EditText server, code;
    private TextView status, assistantStatus;
    private float dp;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        dp = getResources().getDisplayMetrics().density;
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (22 * dp);
        col.setPadding(pad, pad, pad, pad);

        col.addView(text("✦ Jarvis", 28, R.color.accent, true));
        col.addView(text("Swipe up from a bottom corner (or hold the side button) in any app, and Jarvis looks at your screen so you can ask about it.", 15, R.color.dim, false));

        col.addView(heading("1. Connect to Jarvis on your PC"));
        col.addView(text("On the PC: open Jarvis → ⚙ Settings → \"Jarvis on your phone\", turn on phone access, restart the app, then copy the address and pairing code shown there. Phone and PC must be on the same Wi-Fi.", 14, R.color.dim, false));
        server = field("PC address, e.g. 192.168.1.20:8765", InputType.TYPE_TEXT_VARIATION_URI);
        code = field("Pairing code", InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        server.setText(Prefs.server(this));
        code.setText(Prefs.token(this));
        col.addView(server);
        col.addView(code);
        col.addView(button("Connect", v -> connect()));
        status = text("", 14, R.color.dim, false);
        col.addView(status);

        col.addView(heading("2. Make Jarvis your assistant"));
        col.addView(text("Samsung: Settings → Apps → Choose default apps → Digital assistant app → Device assistance app → Jarvis.\n"
                + "On that same screen, turn ON \"Use screenshot\" and \"Analyse text on screen\" (names vary a little by phone), so Jarvis can see what you're looking at.", 14, R.color.dim, false));
        col.addView(button("Open assistant settings", v -> openAssistantSettings()));
        assistantStatus = text("", 14, R.color.dim, false);
        col.addView(assistantStatus);

        col.addView(heading("3. Choose how to open it"));
        col.addView(text("• Gesture navigation: Settings → Display → Navigation bar → Swipe gestures. Then swipe up diagonally from the bottom-left or bottom-right corner.\n"
                + "• Or the side button: Settings → Advanced features → Side button → Press and hold → Digital assistant.", 14, R.color.dim, false));

        col.addView(heading("4. Talk to it (optional)"));
        col.addView(button("Allow microphone", v -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1)));

        col.addView(heading("Try it"));
        col.addView(button("Open Jarvis now", v -> startActivity(new Intent(this, AssistActivity.class))));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(col);
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        String current = Settings.Secure.getString(getContentResolver(), "assistant");
        boolean isUs = current != null && current.startsWith(getPackageName());
        assistantStatus.setText(isUs ? "✓ Jarvis is your assistant." : current == null ? "" : "Jarvis isn't your assistant yet.");
        if (Prefs.configured(this) && status.getText().length() == 0) connect();
    }

    private void connect() {
        Prefs.save(this, server.getText().toString(), code.getText().toString());
        server.setText(Prefs.server(this));
        if (!Prefs.configured(this)) {
            status.setText("Enter the PC address and the pairing code.");
            return;
        }
        status.setText("Connecting…");
        Handler main = new Handler(Looper.getMainLooper());
        Executors.newSingleThreadExecutor().execute(() -> {
            String msg;
            try {
                JSONObject s = new Api(this).get("/api/settings");
                String model = new Api(this).get("/api/lens_model").optString("model", "");
                msg = "✓ Connected to " + s.optString("assistant_name", "Jarvis") + " on your PC."
                        + (model.isEmpty() ? "\n⚠ No model that can see images is set up on the PC yet." : "\nLooks at your screen with: " + model.replaceFirst("^cloud:[a-z]+:", ""));
            } catch (Exception e) {
                msg = "✗ " + (e.getMessage() == null || e instanceof java.net.ConnectException || e instanceof java.net.SocketTimeoutException
                        ? "Can't reach the PC. Check the address, that Jarvis is running with phone access on, and that you're on the same Wi-Fi."
                        : e.getMessage());
            }
            String finalMsg = msg;
            main.post(() -> status.setText(finalMsg));
        });
    }

    private void openAssistantSettings() {
        for (String action : new String[]{Settings.ACTION_VOICE_INPUT_SETTINGS, Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, Settings.ACTION_SETTINGS}) {
            try {
                startActivity(new Intent(action));
                return;
            } catch (ActivityNotFoundException ignored) {
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        status.setText(ok ? "✓ Microphone allowed. Tap 🎤 in Jarvis to talk." : "Microphone not allowed. You can still type.");
    }

    // ── Small view helpers ───────────────────────────────────────────────

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(getColor(color));
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setPadding(0, (int) (4 * dp), 0, (int) (4 * dp));
        return t;
    }

    private TextView heading(String s) {
        TextView t = text(s, 18, R.color.text, true);
        t.setPadding(0, (int) (22 * dp), 0, (int) (4 * dp));
        return t;
    }

    private EditText field(String hint, int variation) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT | variation);
        e.setTextColor(getColor(R.color.text));
        e.setHintTextColor(getColor(R.color.dim));
        e.setBackgroundResource(R.drawable.field);
        int p = (int) (14 * dp);
        e.setPadding(p, p, p, p);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = (int) (10 * dp);
        e.setLayoutParams(lp);
        return e;
    }

    private Button button(String label, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setGravity(Gravity.CENTER);
        b.setOnClickListener(click);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = (int) (10 * dp);
        b.setLayoutParams(lp);
        return b;
    }
}
