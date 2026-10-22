package com.maillard.friday;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * "Sir, I've got this" for phone apps. When you start typing into a form in any app, Friday glows the
 * screen edges and offers to fill it in from what it remembers about you (same /api/autofill as Chrome).
 * It only fills empty boxes, never touches passwords, card/bank details or one-time codes, stays quiet on
 * sign-in screens, and never presses Send or Submit: you always check first.
 */
public class FormHelperService extends AccessibilityService {
    private static final long OFFER_COOLDOWN_MS = 10 * 60 * 1000;   // one offer per app every 10 minutes
    private static final long CARD_TIMEOUT_MS = 15000;
    private static final int MIN_FIELDS = 2;
    private static final Pattern SENSITIVE = Pattern.compile(
            "card|cvv|cvc|security code|expir|iban|sort code|account (no|num)|routing|\\bpin\\b|otp|one[- ]time|"
                    + "verification code|passcode|password|ssn|social security|national insurance|passport|licen[cs]e no",
            Pattern.CASE_INSENSITIVE);

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, Long> offered = new HashMap<>();
    private WindowManager wm;
    private View card, glow;
    private String targetPackage;
    private volatile Boolean butler;
    private long butlerAt;
    private final Runnable autoClose = this::closeCard;

    /** A box Friday may fill. */
    private static final class Field {
        final AccessibilityNodeInfo node;
        final String label, current;

        Field(AccessibilityNodeInfo node, String label, String current) {
            this.node = node;
            this.label = label;
            this.current = current;
        }
    }

    /** What's on screen: the fillable boxes, and whether it looks like a sign-in or payment screen. */
    private static final class Form {
        final List<Field> fields = new ArrayList<>();
        boolean secret;
    }

    @Override
    protected void onServiceConnected() {
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getEventType() != AccessibilityEvent.TYPE_VIEW_FOCUSED || card != null) return;
        AccessibilityNodeInfo src = e.getSource();
        if (src == null || !src.isEditable() || src.isPassword()) return;
        CharSequence pkg = e.getPackageName();
        if (pkg == null || ignored(pkg.toString()) || !Prefs.configured(this)) return;
        String app = pkg.toString();
        Long last = offered.get(app);
        if (last != null && System.currentTimeMillis() - last < OFFER_COOLDOWN_MS) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || !app.contentEquals(String.valueOf(root.getPackageName()))) return;
        Form form = read(root);
        if (form.secret || form.fields.size() < MIN_FIELDS) return;
        offered.put(app, System.currentTimeMillis());
        targetPackage = app;
        offer(form.fields.size());
    }

    @Override
    public void onInterrupt() {
        closeCard();
    }

    @Override
    public void onDestroy() {
        closeCard();
        io.shutdownNow();
        super.onDestroy();
    }

    private boolean ignored(String pkg) {
        if (pkg.equals(getPackageName()) || Prefs.muted(this, pkg)) return true;
        return pkg.equals("com.android.systemui") || pkg.contains("launcher") || pkg.contains("inputmethod")
                || pkg.contains("keyboard") || pkg.equals("com.android.settings");
    }

    // ── Reading the form ─────────────────────────────────────────────────

    private Form read(AccessibilityNodeInfo root) {
        Form form = new Form();
        walk(root, form, null);
        return form;
    }

    private void walk(AccessibilityNodeInfo n, Form form, String lastText) {
        if (n == null || form.fields.size() > 40) return;
        String previous = lastText;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo c = n.getChild(i);
            if (c == null) continue;
            if (c.isEditable() && c.isVisibleToUser()) {
                String label = labelOf(c, previous);
                if (c.isPassword()) form.secret = true;   // a sign-in screen: stay quiet
                else if (SENSITIVE.matcher(label).find()) {
                    if (label.toLowerCase().contains("card")) form.secret = true;   // a payment screen: stay quiet
                    // any other sensitive box (codes, bank, ID numbers) is simply never filled
                } else {
                    boolean hint = c.isShowingHintText();
                    String text = hint || c.getText() == null ? "" : c.getText().toString();
                    form.fields.add(new Field(c, label, text));
                }
            } else {
                CharSequence t = c.getText();
                if (t != null && t.toString().trim().length() > 0 && t.length() < 120) previous = t.toString().trim();
                walk(c, form, previous);
            }
        }
    }

    private static String labelOf(AccessibilityNodeInfo n, String previous) {
        CharSequence hint = n.getHintText();
        if (hint != null && hint.toString().trim().length() > 0) return hint.toString().trim();
        AccessibilityNodeInfo by = n.getLabeledBy();
        if (by != null && by.getText() != null) return by.getText().toString().trim();
        CharSequence d = n.getContentDescription();
        if (d != null && d.toString().trim().length() > 0) return d.toString().trim();
        String id = n.getViewIdResourceName();
        if (id != null && id.contains("/")) return id.substring(id.indexOf('/') + 1).replace('_', ' ');
        return previous == null ? "" : previous;
    }

    // ── Offer and fill ───────────────────────────────────────────────────

    private void offer(int boxes) {
        String sir = sir();
        showCard((sir.isEmpty() ? "I've got this. " : "Sir, I've got this. ")
                        + "I see a form with " + boxes + " boxes in " + appName(targetPackage) + ". Shall I fill it in?",
                new String[]{"Fill it", "Not in this app", "✕"},
                new Runnable[]{this::fill, () -> {
                    Prefs.mute(this, targetPackage);
                    closeCard();
                }, this::closeCard});
        main.postDelayed(autoClose, CARD_TIMEOUT_MS);
    }

    private void fill() {
        main.removeCallbacks(autoClose);
        String sir = sir();
        showCard("Right away" + sir + ". Filling it in…", new String[0], new Runnable[0]);
        AccessibilityNodeInfo root = windowOf(targetPackage);
        if (root == null) {
            finish("Sorry" + sir + ", that screen closed before I could fill it.");
            return;
        }
        Form form = read(root);
        String app = appName(targetPackage);
        io.execute(() -> {
            try {
                JSONArray list = new JSONArray();
                for (int i = 0; i < form.fields.size(); i++) {
                    Field f = form.fields.get(i);
                    list.put(new JSONObject().put("id", String.valueOf(i)).put("label", f.label)
                            .put("type", "text").put("current", f.current));
                }
                JSONObject values = new Api(this).post("/api/autofill", new JSONObject()
                        .put("fields", list).put("title", app).put("url", "android-app://" + targetPackage))
                        .optJSONObject("values");
                main.post(() -> apply(form, values == null ? new JSONObject() : values, sir));
            } catch (Exception e) {
                main.post(() -> finish("Sorry" + sir + ", I couldn't reach Friday on your PC: " + e.getMessage()));
            }
        });
    }

    private void apply(Form form, JSONObject values, String sir) {
        int filled = 0;
        List<String> missing = new ArrayList<>();
        for (int i = 0; i < form.fields.size(); i++) {
            Field f = form.fields.get(i);
            String v = values.optString(String.valueOf(i), "");
            if (!f.current.isEmpty()) continue;   // never overwrite what you typed
            if (v.isEmpty()) {
                if (!f.label.isEmpty()) missing.add(f.label);
                continue;
            }
            Bundle args = new Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, v);
            f.node.refresh();
            if (f.node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) filled++;
        }
        String msg = filled == 0 ? "I didn't know enough to fill any boxes" + sir + ". Tell me more about yourself in Friday and I'll do better."
                : "Done" + sir + ". I filled " + filled + (filled == 1 ? " box" : " boxes") + ". Please check before you send it."
                + (missing.isEmpty() ? "" : "\nLeft for you: " + String.join(", ", missing.subList(0, Math.min(5, missing.size()))));
        finish(msg);
    }

    private void finish(String msg) {
        showCard(msg, new String[]{"OK"}, new Runnable[]{this::closeCard});
        main.postDelayed(autoClose, CARD_TIMEOUT_MS);
    }

    /** The app window we offered on (it is still the active one, since the card never takes focus). */
    private AccessibilityNodeInfo windowOf(String pkg) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null && pkg.contentEquals(String.valueOf(root.getPackageName()))) return root;
        for (AccessibilityWindowInfo w : getWindows()) {
            AccessibilityNodeInfo r = w.getRoot();
            if (r != null && w.getType() == AccessibilityWindowInfo.TYPE_APPLICATION
                    && pkg.contentEquals(String.valueOf(r.getPackageName()))) return r;
        }
        return null;
    }

    /** ", sir" when the PC app's personality is the butler (checked every 10 minutes). */
    private String sir() {
        if (butler == null || System.currentTimeMillis() - butlerAt > OFFER_COOLDOWN_MS) {
            butlerAt = System.currentTimeMillis();
            if (butler == null) butler = true;
            io.execute(() -> {
                try {
                    butler = "butler".equals(new Api(this).get("/api/settings").optString("persona", "butler"));
                } catch (Exception ignored) {
                }
            });
        }
        return butler ? ", sir" : "";
    }

    private String appName(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return "this app";
        }
    }

    // ── The card and the edge glow (overlays that never take focus) ─────

    private void showCard(String message, String[] labels, Runnable[] actions) {
        float dp = getResources().getDisplayMetrics().density;
        if (glow == null) {
            glow = new View(this);
            GradientDrawable border = new GradientDrawable();
            border.setColor(Color.TRANSPARENT);
            border.setStroke((int) (4 * dp), getColor(R.color.accent));
            border.setCornerRadius(18 * dp);
            glow.setBackground(border);
            glow.setAlpha(0.85f);
            wm.addView(glow, params(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE));
        }
        if (card != null) wm.removeView(card);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(getColor(R.color.card));
        bg.setCornerRadius(20 * dp);
        box.setBackground(bg);
        box.setElevation(12 * dp);
        int pad = (int) (16 * dp);
        box.setPadding(pad, pad, pad, pad);
        TextView title = new TextView(this);
        title.setText("✦ Friday");
        title.setTextColor(getColor(R.color.accent));
        title.setTextSize(15);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        box.addView(title);
        TextView text = new TextView(this);
        text.setText(message);
        text.setTextColor(getColor(R.color.text));
        text.setTextSize(15);
        text.setPadding(0, (int) (6 * dp), 0, (int) (4 * dp));
        box.addView(text);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.END);
        for (int i = 0; i < labels.length; i++) {
            TextView b = new TextView(this);
            b.setText(labels[i]);
            b.setTextSize(14);
            b.setTextColor(getColor(i == 0 ? R.color.accent : R.color.dim));
            b.setBackgroundResource(R.drawable.chip);
            b.setPadding((int) (14 * dp), (int) (8 * dp), (int) (14 * dp), (int) (8 * dp));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.setMarginStart((int) (8 * dp));
            b.setLayoutParams(lp);
            Runnable action = actions[i];
            b.setOnClickListener(v -> action.run());
            row.addView(b);
        }
        if (labels.length > 0) box.addView(row);

        int width = Math.min(getResources().getDisplayMetrics().widthPixels - (int) (24 * dp), (int) (480 * dp));
        WindowManager.LayoutParams lp = params(width, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = (int) (48 * dp);
        card = box;
        wm.addView(card, lp);
    }

    private static WindowManager.LayoutParams params(int w, int h, int extraFlags) {
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(w, h,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | extraFlags,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        return lp;
    }

    private void closeCard() {
        main.removeCallbacks(autoClose);
        if (card != null) {
            wm.removeView(card);
            card = null;
        }
        if (glow != null) {
            wm.removeView(glow);
            glow = null;
        }
    }

    /** Is the helper switched on in the phone's Accessibility settings? */
    static boolean enabled(Context c) {
        String on = android.provider.Settings.Secure.getString(c.getContentResolver(),
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return on != null && on.contains(c.getPackageName() + "/");
    }
}
