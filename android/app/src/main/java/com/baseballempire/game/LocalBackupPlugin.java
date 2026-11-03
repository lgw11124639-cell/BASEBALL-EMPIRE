package com.baseballempire.game;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "LocalBackup")
public class LocalBackupPlugin extends Plugin {
    private OutputStream output;
    private InputStream input;
    private Uri outputUri;
    private String token;
    private boolean choosing;

    @PluginMethod public void chooseExport(PluginCall call) {
        if (choosing || token != null) { call.reject("다른 백업 작업이 진행 중입니다."); return; }
        choosing = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename", "baseball-empire-backup.json"));
        try { startActivityForResult(call, intent, "exportChosen"); }
        catch (Exception e) { choosing = false; call.reject("파일 저장 창을 열 수 없습니다.", e); }
    }

    @ActivityCallback private void exportChosen(PluginCall call, ActivityResult result) {
        choosing = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject data = new JSObject(); data.put("cancelled", true); call.resolve(data); return;
        }
        try {
            outputUri = result.getData().getData();
            output = getContext().getContentResolver().openOutputStream(outputUri, "wt");
            if (output == null) throw new java.io.IOException("Cannot open destination");
            token = UUID.randomUUID().toString();
            JSObject data = new JSObject(); data.put("token", token); call.resolve(data);
        } catch (Exception e) { cleanup(true); call.reject("백업 저장 위치를 열지 못했습니다.", e); }
    }

    private boolean valid(PluginCall call) {
        if (token == null || !token.equals(call.getString("token"))) { call.reject("백업 작업이 만료됐습니다."); return false; }
        return true;
    }

    @PluginMethod public void writeChunk(PluginCall call) {
        if (!valid(call)) return;
        try {
            String encoded = call.getString("data", "");
            if (encoded.length() > 524288 || output == null) throw new java.io.IOException("Invalid chunk");
            output.write(Base64.decode(encoded, Base64.NO_WRAP)); call.resolve();
        } catch (Exception e) { cleanup(true); call.reject("백업 쓰기 실패: 저장 공간을 확인해 주세요. 게임 자동 저장은 유지됩니다.", e); }
    }

    @PluginMethod public void finishExport(PluginCall call) {
        if (!valid(call)) return;
        try { output.flush(); output.close(); output = null; outputUri = null; token = null; call.resolve(); }
        catch (Exception e) { cleanup(true); call.reject("백업 저장을 완료하지 못했습니다. 저장 공간을 확인해 주세요.", e); }
    }

    @PluginMethod public void chooseImport(PluginCall call) {
        if (choosing || token != null) { call.reject("다른 백업 작업이 진행 중입니다."); return; }
        choosing = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
        try { startActivityForResult(call, intent, "importChosen"); }
        catch (Exception e) { choosing = false; call.reject("파일 선택 창을 열 수 없습니다.", e); }
    }

    @ActivityCallback private void importChosen(PluginCall call, ActivityResult result) {
        choosing = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject data = new JSObject(); data.put("cancelled", true); call.resolve(data); return;
        }
        try {
            input = getContext().getContentResolver().openInputStream(result.getData().getData());
            if (input == null) throw new java.io.IOException("Cannot open source");
            token = UUID.randomUUID().toString(); JSObject data = new JSObject(); data.put("token", token); call.resolve(data);
        } catch (Exception e) { cleanup(false); call.reject("백업 파일을 열지 못했습니다.", e); }
    }

    @PluginMethod public void readChunk(PluginCall call) {
        if (!valid(call)) return;
        try {
            if (input == null) throw new java.io.IOException("Source closed");
            byte[] buffer = new byte[65536]; int count = input.read(buffer);
            JSObject data = new JSObject(); data.put("done", count < 0);
            data.put("data", count < 0 ? "" : Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP));
            if (count < 0) cleanup(false); call.resolve(data);
        } catch (Exception e) { cleanup(false); call.reject("백업 읽기 실패. 기존 게임 저장은 유지됩니다.", e); }
    }

    @PluginMethod public void cancel(PluginCall call) {
        if (valid(call)) { cleanup(true); call.resolve(); }
    }
    private void cleanup(boolean deletePartial) {
        try { if (output != null) output.close(); } catch (Exception ignored) {}
        try { if (input != null) input.close(); } catch (Exception ignored) {}
        if (deletePartial && outputUri != null) {
            try { DocumentsContract.deleteDocument(getContext().getContentResolver(), outputUri); } catch (Exception ignored) {}
        }
        output = null; input = null; outputUri = null; token = null;
    }
    private long directoryBytes(java.io.File file) {
        try { if (android.system.OsConstants.S_ISLNK(android.system.Os.lstat(file.getPath()).st_mode)) return 0; } catch (Exception e) { return 0; }
        if (file.isFile()) return file.length();
        long bytes = 0; java.io.File[] children = file.listFiles();
        if (children != null) for (java.io.File child : children) bytes += directoryBytes(child);
        return bytes;
    }
    @PluginMethod public void storageInfo(PluginCall call) {
        try {
            android.os.StatFs stat = new android.os.StatFs(getContext().getFilesDir().getPath());
            JSObject info = new JSObject(); info.put("availableBytes", stat.getAvailableBytes());
            info.put("appBytes", directoryBytes(getContext().getDataDir()));
            info.put("cacheBytes", directoryBytes(getContext().getCacheDir())); call.resolve(info);
        } catch (Exception e) { call.reject("저장 공간 정보를 읽지 못했습니다.", e); }
    }
    @PluginMethod public void clearTemporaryBackups(PluginCall call) {
        long removed = 0;
        java.io.File directory = new java.io.File(getContext().getCacheDir(), "backups");
        java.io.File[] files = directory.listFiles();
        long cutoff = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000;
        if (files != null) for (java.io.File file : files) {
            try {
                if (!file.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile())) continue;
                if (file.isFile() && file.getName().endsWith(".json") && file.lastModified() < cutoff) {
                    long bytes = file.length(); if (file.delete()) removed += bytes;
                }
            } catch (Exception ignored) {}
        }
        JSObject result = new JSObject(); result.put("removedBytes", removed); call.resolve(result);
    }
    @Override protected void handleOnDestroy() { cleanup(true); }
}
