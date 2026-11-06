package com.baseballempire.game;

import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReplayVoice")
public class ReplayVoicePlugin extends Plugin {
    private TextToSpeech engine;
    private boolean ready;
    @PluginMethod public void prepare(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (engine != null) { JSObject result = new JSObject(); result.put("available", ready); call.resolve(result); return; }
            engine = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS && engine != null) {
                    Voice selected = null;
                    if (engine.getVoices() != null) for (Voice voice : engine.getVoices()) {
                        if ("ko".equals(voice.getLocale().getLanguage()) && !voice.isNetworkConnectionRequired()
                                && (selected == null || voice.getQuality() > selected.getQuality())) selected = voice;
                    }
                    if (selected != null) ready = engine.setVoice(selected) == TextToSpeech.SUCCESS;
                    engine.setPitch(.95f);
                }
                JSObject result = new JSObject(); result.put("available", ready); call.resolve(result);
            });
        });
    }
    @PluginMethod public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        if (!text.matches("스트라이크|볼|아웃|홈런")) { call.reject("Unsupported replay call"); return; }
        final double rate = call.getDouble("rate", 1.0);
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            if (!ready || engine == null) { result.put("spoken", false); call.resolve(result); return; }
            engine.setSpeechRate((float)Math.max(.8, Math.min(1.5, rate)));
            result.put("spoken", engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "baseball-replay") == TextToSpeech.SUCCESS);
            call.resolve(result);
        });
    }
    @PluginMethod public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { if (engine != null) engine.stop(); call.resolve(); });
    }
    @Override protected void handleOnPause() { if (engine != null) engine.stop(); super.handleOnPause(); }
    @Override protected void handleOnDestroy() { ready = false; if (engine != null) { engine.stop(); engine.shutdown(); engine = null; } super.handleOnDestroy(); }
}
