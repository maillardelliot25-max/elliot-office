package com.maillard.friday;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.speech.RecognitionService;

import java.util.List;

/** Finds the phone's real speech recogniser (Google, else Samsung, else any other) — never our own. */
final class Speech {
    private Speech() {}

    static ComponentName otherRecognizer(Context c) {
        List<ResolveInfo> services = c.getPackageManager()
                .queryIntentServices(new Intent(RecognitionService.SERVICE_INTERFACE), 0);
        ComponentName best = null;
        int bestScore = -1;
        for (ResolveInfo r : services) {
            String pkg = r.serviceInfo.packageName;
            if (pkg.equals(c.getPackageName())) continue;
            int score = pkg.startsWith("com.google.android.googlequicksearchbox") ? 3
                    : pkg.startsWith("com.google") ? 2 : pkg.startsWith("com.samsung") ? 1 : 0;
            if (score > bestScore) {
                bestScore = score;
                best = new ComponentName(pkg, r.serviceInfo.name);
            }
        }
        return best;
    }
}
