package com.maillard.friday;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.view.LayoutInflater;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The Friday bottom sheet: shows what was captured from the screen, lets you ask about it
 * (typing, quick questions or voice) and streams the answer from the Friday app on your PC.
 * Used by the assistant session (swipe / side key) and by AssistActivity.
 */
final class AssistPanel {
    interface Closer {
        void close();
    }

    private static final String[][] QUICK = {
            {"What's this?", "What's on my screen? Explain it briefly."},
            {"Summarise", "Summarise what's on my screen in a few bullet points."},
            {"Explain the error", "There's an error or problem on my screen. What does it mean and how do I fix it?"},
            {"Translate", "Translate the text on my screen into English."},
            {"Reply for me", "Draft a reply to the message on my screen in my usual style."},
            {"Find info", "Find more information about what's on my screen."},
    };

    final View root;
    private final Context ctx;
    private final Closer closer;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final TextView answer, screenNote, title;
    private final ScrollView answerScroll;
    private final ImageView thumb;
    private final EditText input;
    private final TextView mic;

    private String screenshot;      // JPEG, base64
    private String screenText = "";
    private String chatId;
    private boolean busy;
    private SpeechRecognizer recognizer;

    AssistPanel(Context ctx, Closer closer) {
        this.ctx = ctx;
        this.closer = closer;
        root = LayoutInflater.from(ctx).inflate(R.layout.panel, null);
        answer = root.findViewById(R.id.answer);
        answerScroll = root.findViewById(R.id.answerScroll);
        screenNote = root.findViewById(R.id.screenNote);
        title = root.findViewById(R.id.title);
        thumb = root.findViewById(R.id.thumb);
        input = root.findViewById(R.id.input);
        mic = root.findViewById(R.id.mic);

        root.findViewById(R.id.scrim).setOnClickListener(v -> closer.close());   // tap above the sheet to close
        root.findViewById(R.id.close).setOnClickListener(v -> closer.close());
        root.findViewById(R.id.send).setOnClickListener(v -> ask(input.getText().toString()));
        root.findViewById(R.id.openChat).setOnClickListener(v -> openChat());
        mic.setOnClickListener(v -> listen());
        input.setOnEditorActionListener((v, id, e) -> {
            if (id == EditorInfo.IME_ACTION_SEND) {
                ask(input.getText().toString());
                return true;
            }
            return false;
        });

        LinearLayout chips = root.findViewById(R.id.chips);
        float dp = ctx.getResources().getDisplayMetrics().density;
        for (String[] q : QUICK) {
            TextView chip = new TextView(ctx);
            chip.setText(q[0]);
            chip.setTextColor(ctx.getColor(R.color.text));
            chip.setTextSize(14);
            chip.setBackgroundResource(R.drawable.chip);
            chip.setPadding((int) (14 * dp), (int) (8 * dp), (int) (14 * dp), (int) (8 * dp));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.setMarginEnd((int) (8 * dp));
            chip.setLayoutParams(lp);
            chip.setOnClickListener(v -> ask(q[1]));
            chips.addView(chip);
        }
        loadLook();
    }

    /** A new swipe: forget the old conversation and wait for the new screen capture. */
    void reset() {
        chatId = null;
        screenshot = null;
        screenText = "";
        thumb.setImageDrawable(null);
        thumb.setVisibility(View.GONE);
        screenNote.setText(Prefs.configured(ctx) ? "Reading your screen…" : "Open the Friday app to connect it to your PC first.");
        answer.setText("");
        answerScroll.setVisibility(View.GONE);
        input.setText("");
    }

    /** Opened without a screen capture (e.g. from the app icon): plain chat. */
    void plain() {
        screenNote.setText("Ask me anything.");
    }

    void setScreenshot(Bitmap bmp) {
        if (bmp == null) {
            if (screenText.isEmpty()) screenNote.setText("Screenshot is off. Turn on \"Use screenshot\" in Digital assistant app settings.");
            return;
        }
        float scale = Math.min(1f, 1600f / Math.max(bmp.getWidth(), bmp.getHeight()));
        Bitmap small = scale < 1f
                ? Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * scale), Math.round(bmp.getHeight() * scale), true)
                : bmp;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.JPEG, 82, out);
        screenshot = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        thumb.setImageBitmap(small);
        thumb.setVisibility(View.VISIBLE);
        screenNote.setText("Got your screen. Ask anything about it.");
    }

    void setScreenText(String text) {
        screenText = text == null ? "" : text;
        if (screenshot == null && !screenText.isEmpty()) screenNote.setText("Read the text on your screen. Ask anything about it.");
    }

    /** Colours from the PC app's Edit appearance. */
    private void loadLook() {
        if (!Prefs.configured(ctx)) return;
        io.execute(() -> {
            try {
                JSONObject s = new Api(ctx).get("/api/settings");
                String name = s.optString("assistant_name", "Friday");
                JSONObject look = s.optJSONObject("appearance");
                String accent = look != null ? look.optString("accent", "") : "";
                String panel = look != null ? look.optString("panel", "") : "";
                main.post(() -> {
                    title.setText("✦ " + name);
                    try {
                        if (!accent.isEmpty()) title.setTextColor(Color.parseColor(accent));
                        if (!panel.isEmpty()) {
                            GradientDrawable bg = (GradientDrawable) ctx.getDrawable(R.drawable.card).mutate();
                            bg.setColor(Color.parseColor(panel));
                            root.findViewById(R.id.card).setBackground(bg);
                        }
                    } catch (IllegalArgumentException ignored) {
                    }
                });
            } catch (Exception ignored) {
            }
        });
    }

    void ask(String question) {
        String q = question.trim();
        if (q.isEmpty() || busy) return;
        if (!Prefs.configured(ctx)) {
            show("Open the Friday app on your phone and connect it to your PC first.");
            return;
        }
        busy = true;
        input.setText("");
        answerScroll.setVisibility(View.VISIBLE);
        append((answer.length() > 0 ? "\n\n" : "") + "› " + q + "\n");
        final boolean first = chatId == null;
        io.execute(() -> {
            Api api = new Api(ctx);
            try {
                String model = api.get("/api/lens_model").optString("model", "");
                if (model.isEmpty()) {
                    post("\nNo AI model that can see images is set up on your PC. Add a Claude/Gemini/OpenAI key or install qwen3-vl in the PC app.");
                    return;
                }
                JSONObject message = new JSONObject().put("content", q);
                if (first && screenshot != null) message.put("images", new JSONArray().put(screenshot));
                if (first && !screenText.isEmpty()) {
                    message.put("files", new JSONArray().put(new JSONObject()
                            .put("name", "Text on my phone screen")
                            .put("text", screenText)));
                }
                JSONObject body = new JSONObject().put("model", model).put("message", message);
                if (chatId != null) body.put("chat_id", chatId);
                api.stream("/api/chat", body, ev -> {
                    String type = ev.optString("type");
                    if (type.equals("chat")) chatId = ev.optString("id");
                    else if (type.equals("text")) post(ev.optString("delta").replace("**", ""));
                    else if (type.equals("error")) post("\n⚠ " + ev.optString("message"));
                });
                api.post("/api/memory/learn", new JSONObject().put("chat_id", chatId).put("model", model));
            } catch (java.net.ConnectException | java.net.SocketTimeoutException | java.net.UnknownHostException e) {
                post("\n⚠ Can't reach Friday on your PC. Is it running, with phone access on, and is your phone on the same Wi-Fi?");
            } catch (Exception e) {
                post("\n⚠ " + e.getMessage());
            } finally {
                main.post(() -> busy = false);
            }
        });
    }

    private void post(String text) {
        main.post(() -> append(text));
    }

    private void append(String text) {
        answer.append(text);
        answerScroll.post(() -> answerScroll.fullScroll(View.FOCUS_DOWN));
    }

    private void show(String text) {
        answerScroll.setVisibility(View.VISIBLE);
        answer.setText(text);
    }

    private void openChat() {
        if (!Prefs.configured(ctx)) return;
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(new Api(ctx).chatUrl(chatId)));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        closer.close();
    }

    // ── Voice ────────────────────────────────────────────────────────────

    private void listen() {
        if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            show("To talk to Friday, open the Friday app and tap \"Allow microphone\".");
            return;
        }
        if (recognizer == null) {
            android.content.ComponentName engine = Speech.otherRecognizer(ctx);
            if (engine == null) {
                show("This phone has no speech recognition app (install the Google app).");
                return;
            }
            recognizer = SpeechRecognizer.createSpeechRecognizer(ctx, engine);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { mic.setText("🔴"); }
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { mic.setText("🎤"); }
                @Override public void onError(int error) { mic.setText("🎤"); }
                @Override public void onPartialResults(Bundle partial) {
                    ArrayList<String> r = partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty()) input.setText(r.get(0));
                }
                @Override public void onEvent(int eventType, Bundle params) {}
                @Override public void onResults(Bundle results) {
                    mic.setText("🎤");
                    ArrayList<String> r = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty()) ask(r.get(0));
                }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizer.startListening(i);
    }

    void release() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        mic.setText("🎤");
    }
}
