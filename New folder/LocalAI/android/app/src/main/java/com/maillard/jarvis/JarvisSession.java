package com.maillard.jarvis;

import android.app.assist.AssistStructure;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.voice.VoiceInteractionSession;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

/**
 * Runs when you swipe up from a bottom corner (or hold the side key) with Jarvis set as the
 * digital assistant. Android hands us a screenshot and the text on screen; the panel asks about them.
 */
public class JarvisSession extends VoiceInteractionSession {
    private AssistPanel panel;
    // Screen data can arrive just before or just after onShow, so keep the latest copy
    private Bitmap lastShot;
    private String lastText;
    private long lastAt;

    JarvisSession(Context context) {
        super(context);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Window w = getWindow().getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
    }

    @Override
    public View onCreateContentView() {
        panel = new AssistPanel(getContext(), this::hide);
        return panel.root;
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        if (panel == null) return;
        panel.reset();
        if (SystemClock.elapsedRealtime() - lastAt < 3000) {
            if (lastText != null) panel.setScreenText(lastText);
            if (lastShot != null) panel.setScreenshot(lastShot);
        }
    }

    @Override
    public void onHandleAssist(AssistState state) {
        AssistStructure structure = state.getAssistStructure();
        lastText = structure != null ? ScreenText.extract(structure) : "";
        lastAt = SystemClock.elapsedRealtime();
        if (panel != null) panel.setScreenText(lastText);
    }

    @Override
    public void onHandleScreenshot(Bitmap screenshot) {
        lastShot = screenshot;
        lastAt = SystemClock.elapsedRealtime();
        if (panel != null) panel.setScreenshot(screenshot);
    }

    @Override
    public void onHide() {
        super.onHide();
        if (panel != null) panel.release();
        lastShot = null;
    }
}
