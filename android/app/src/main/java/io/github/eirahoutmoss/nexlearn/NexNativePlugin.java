package io.github.eirahoutmoss.nexlearn;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Yerel yardımcılar:
 *  - Paylaş menüsünden gelen dosyaları (ACTION_SEND / SEND_MULTIPLE / VIEW) uygulamanın önbelleğine kopyalar.
 *  - Güncellemeyi bu deponun GitHub sürümünden indirir, SHA256SUMS ile doğrular ve Android kurucusunu açar.
 * Arka plan hizmeti, otomatik başlatma ya da kalıcı izin yoktur.
 */
@CapacitorPlugin(name = "NexNative")
public class NexNativePlugin extends Plugin {
    private static final String DOWNLOAD_PREFIX = "https://github.com/Eirahoutmoss/NexLearn/releases/download/";
    private static final long MAX_SHARED_BYTES = 300L * 1024 * 1024;
    private static final long MAX_APK_BYTES = 300L * 1024 * 1024;
    private final List<JSObject> pending = new ArrayList<>();

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (handleIntent(intent)) {
            JSObject ev = new JSObject();
            ev.put("count", pending.size());
            notifyListeners("sharedFiles", ev, true);
        }
    }

    private boolean handleIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return false;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
            else {
                CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (text != null && text.length() > 0) saveText(text.toString(), intent.getStringExtra(Intent.EXTRA_SUBJECT));
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        } else {
            return false;
        }
        for (Uri u : uris) copyUri(u);
        // Aynı paylaşım ikinci kez işlenmesin.
        intent.setAction(Intent.ACTION_MAIN);
        return !pending.isEmpty();
    }

    private File sharedDir() {
        File dir = new File(getContext().getCacheDir(), "shared");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    static String safeName(String raw) {
        if (raw == null) raw = "";
        String base = raw.replaceAll(".*[/\\\\]", "");
        StringBuilder sb = new StringBuilder();
        for (char c : base.toCharArray()) {
            if (Character.isISOControl(c) || "<>:\"|?*".indexOf(c) >= 0) continue;
            sb.append(c);
        }
        String out = sb.toString().trim();
        while (out.startsWith(".")) out = out.substring(1);
        if (out.length() > 120) out = out.substring(0, 120);
        return out.isEmpty() ? "dosya" : out;
    }

    private void saveText(String text, String subject) {
        try {
            String first = subject != null && !subject.trim().isEmpty() ? subject : text.trim().split("\n", 2)[0];
            if (first.length() > 40) first = first.substring(0, 40);
            String name = safeName(first) + ".txt";
            File out = new File(sharedDir(), UUID.randomUUID().toString().substring(0, 8) + "-" + name);
            try (OutputStream os = new FileOutputStream(out)) {
                os.write(text.getBytes("UTF-8"));
            }
            add(out, name, "text/plain");
        } catch (Exception ignored) {
            // Paylaşılan metin kaydedilemezse sessizce atlanır; kullanıcı yeniden deneyebilir.
        }
    }

    private void copyUri(Uri uri) {
        ContentResolver cr = getContext().getContentResolver();
        String name = "dosya";
        long size = -1;
        try (Cursor c = cr.query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int s = c.getColumnIndex(OpenableColumns.SIZE);
                if (n >= 0) name = c.getString(n);
                if (s >= 0 && !c.isNull(s)) size = c.getLong(s);
            }
        } catch (Exception ignored) {
            // Bazı sağlayıcılar sorguyu desteklemez; ad varsayılan kalır.
        }
        if (size > MAX_SHARED_BYTES) return;
        String mime = cr.getType(uri);
        name = safeName(name);
        File out = new File(sharedDir(), UUID.randomUUID().toString().substring(0, 8) + "-" + name);
        try (InputStream in = cr.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
            if (in == null) return;
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int r;
            while ((r = in.read(buf)) > 0) {
                total += r;
                if (total > MAX_SHARED_BYTES) throw new Exception("too-large");
                os.write(buf, 0, r);
            }
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            return;
        }
        add(out, name, mime == null ? "application/octet-stream" : mime);
    }

    private void add(File f, String name, String mime) {
        JSObject o = new JSObject();
        o.put("path", f.getAbsolutePath());
        o.put("name", name);
        o.put("mimeType", mime);
        o.put("size", f.length());
        pending.add(o);
    }

    /** Bekleyen paylaşılmış dosyaları döndürür ve listeyi boşaltır. Dosyalar `releaseShared` ile silinir. */
    @PluginMethod
    public void takeSharedFiles(PluginCall call) {
        JSArray arr = new JSArray();
        for (JSObject o : pending) arr.put(o);
        pending.clear();
        JSObject ret = new JSObject();
        ret.put("files", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void releaseShared(PluginCall call) {
        File[] files = sharedDir().listFiles();
        if (files != null) for (File f : files) //noinspection ResultOfMethodCallIgnored
            f.delete();
        call.resolve();
    }

    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
        } catch (Exception e) {
            ret.put("version", "");
        }
        ret.put("canInstall", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(ret);
    }

    static boolean validApkName(String n) {
        return n != null && n.length() <= 120 && n.matches("[A-Za-z0-9._-]+") && !n.contains("..") && n.toLowerCase(Locale.ROOT).endsWith(".apk");
    }

    static String expectedHash(String sums, String fileName) {
        for (String line : sums.split("\n")) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length < 2) continue;
            String name = parts[1].replaceFirst("^\\*", "");
            int slash = name.lastIndexOf('/');
            if (slash >= 0) name = name.substring(slash + 1);
            if (name.equals(fileName) && parts[0].matches("[0-9a-fA-F]{64}")) return parts[0].toLowerCase(Locale.ROOT);
        }
        return null;
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "NexLearn-Updater");
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) throw new Exception("http-" + code);
        return c;
    }

    /** Güncellemeyi indirir, doğrular ve sistem kurucusunu açar. Kurulum her zaman kullanıcı onayıyla olur. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String sumsUrl = call.getString("checksumsUrl", "");
        String fileName = call.getString("fileName", "");
        if (!url.startsWith(DOWNLOAD_PREFIX) || !sumsUrl.startsWith(DOWNLOAD_PREFIX)) {
            call.reject("invalid-url");
            return;
        }
        if (!validApkName(fileName) || !url.endsWith("/" + fileName)) {
            call.reject("invalid-file-name");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (ActivityNotFoundException ignored) {
                // Ayar ekranı yoksa kullanıcı izni elle verir.
            }
            call.reject("needs-permission");
            return;
        }
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                f.delete();
            File out = new File(dir, fileName);
            try {
                String sums;
                HttpURLConnection sc = open(sumsUrl);
                try (InputStream in = sc.getInputStream()) {
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] b = new byte[8192];
                    int r;
                    while ((r = in.read(b)) > 0 && bos.size() < 1024 * 1024) bos.write(b, 0, r);
                    sums = bos.toString("UTF-8");
                }
                String expected = expectedHash(sums, fileName);
                if (expected == null) throw new Exception("checksum-missing");
                HttpURLConnection c = open(url);
                long total = c.getContentLengthLong();
                if (total > MAX_APK_BYTES) throw new Exception("too-large");
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long done = 0, lastEmit = 0;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int r;
                    while ((r = in.read(buf)) > 0) {
                        done += r;
                        if (done > MAX_APK_BYTES) throw new Exception("too-large");
                        md.update(buf, 0, r);
                        os.write(buf, 0, r);
                        if (done - lastEmit > 256 * 1024) {
                            lastEmit = done;
                            JSObject p = new JSObject();
                            p.put("downloaded", done);
                            p.put("total", total);
                            notifyListeners("updateProgress", p);
                        }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte x : md.digest()) hex.append(String.format(Locale.ROOT, "%02x", x));
                if (!hex.toString().equals(expected)) throw new Exception("checksum-mismatch");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                String msg = e.getMessage() == null ? "download" : e.getMessage();
                call.reject(msg.length() > 60 ? msg.substring(0, 60) : msg);
            }
        }).start();
    }
}
