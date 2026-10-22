package com.maillard.friday;

import android.app.assist.AssistStructure;
import android.app.assist.AssistStructure.ViewNode;
import android.text.InputType;

/** Pulls the visible text out of the screen structure Android gives the assistant. */
final class ScreenText {
    private static final int LIMIT = 8000;

    private ScreenText() {}

    static String extract(AssistStructure s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.getWindowNodeCount(); i++) {
            walk(s.getWindowNodeAt(i).getRootViewNode(), sb);
        }
        return sb.length() > LIMIT ? sb.substring(0, LIMIT) : sb.toString();
    }

    private static void walk(ViewNode n, StringBuilder sb) {
        if (n == null || sb.length() > LIMIT) return;
        int variation = n.getInputType() & InputType.TYPE_MASK_VARIATION;
        boolean secret = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                || variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD;
        if (!secret) {
            CharSequence t = n.getText();
            CharSequence d = n.getContentDescription();
            if (t != null && t.toString().trim().length() > 0) sb.append(t.toString().trim()).append('\n');
            else if (d != null && d.toString().trim().length() > 0) sb.append(d.toString().trim()).append('\n');
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChildAt(i), sb);
    }
}
