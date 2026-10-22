package com.maillard.friday;

import android.app.Activity;
import android.os.Bundle;

/** Friday without a screen capture: opened by phones that use the simple "assist" intent, or "Try it". */
public class AssistActivity extends Activity {
    private AssistPanel panel;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        panel = new AssistPanel(this, this::finish);
        setContentView(panel.root);
        panel.reset();
        panel.plain();
    }

    @Override
    protected void onDestroy() {
        panel.release();
        super.onDestroy();
    }
}
