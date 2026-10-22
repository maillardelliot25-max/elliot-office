package com.maillard.friday;

import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.os.RemoteException;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

/**
 * Android requires every assistant app to include a speech recognition service, and makes it the
 * phone's default when you pick the assistant. So that voice typing keeps working everywhere,
 * this one simply passes everything through to the phone's real recogniser.
 */
public class FridayRecognitionService extends RecognitionService {
    private SpeechRecognizer delegate;

    @Override
    protected void onStartListening(Intent intent, Callback cb) {
        ComponentName engine = Speech.otherRecognizer(this);
        if (engine == null) {
            safe(() -> cb.error(SpeechRecognizer.ERROR_CLIENT));
            return;
        }
        if (delegate != null) delegate.destroy();
        delegate = SpeechRecognizer.createSpeechRecognizer(this, engine);
        delegate.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { safe(() -> cb.readyForSpeech(params)); }
            @Override public void onBeginningOfSpeech() { safe(cb::beginningOfSpeech); }
            @Override public void onRmsChanged(float rmsdB) { safe(() -> cb.rmsChanged(rmsdB)); }
            @Override public void onBufferReceived(byte[] buffer) { safe(() -> cb.bufferReceived(buffer)); }
            @Override public void onEndOfSpeech() { safe(cb::endOfSpeech); }
            @Override public void onError(int error) { safe(() -> cb.error(error)); }
            @Override public void onResults(Bundle results) { safe(() -> cb.results(results)); }
            @Override public void onPartialResults(Bundle partial) { safe(() -> cb.partialResults(partial)); }
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        delegate.startListening(intent);
    }

    @Override
    protected void onStopListening(Callback cb) {
        if (delegate != null) delegate.stopListening();
    }

    @Override
    protected void onCancel(Callback cb) {
        if (delegate != null) delegate.cancel();
    }

    @Override
    public void onDestroy() {
        if (delegate != null) delegate.destroy();
        super.onDestroy();
    }

    private interface Remote {
        void run() throws RemoteException;
    }

    private static void safe(Remote r) {
        try {
            r.run();
        } catch (RemoteException ignored) {
            // the app that asked for speech went away
        }
    }
}
