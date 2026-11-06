package id.playgo.slm;

import android.Manifest;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Aplikasi SLM: membuka web SLM di WebView sehingga semua fungsi sama dengan versi web.
 * Yang ditangani di sisi Android: cetak (window.print → print Android), cetak thermal (rawbt: → aplikasi RawBT),
 * kamera & pilih file, unduhan (termasuk blob dari tombol Excel/gambar), dan link WhatsApp/telepon.
 */
public class MainActivity extends AppCompatActivity {

    private static final String RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

    private WebView web;
    private ProgressBar progress;
    private View offline;
    private String baseHost;
    private boolean mainFrameError;

    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutput;
    private Intent pendingChooser;
    private PermissionRequest pendingWebPermission;

    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<String> cameraPermissionLauncher;

    /** Disuntik di awal setiap halaman: arahkan window.print dan unduhan blob/data ke Android. */
    private static final String BRIDGE_SCRIPT =
            "(function(){if(window.__slmAndroid)return;window.__slmAndroid=true;" +
            "window.print=function(){try{SLMAndroid.print(document.title||'SLM');}catch(e){}};" +
            "function send(b,n){var r=new FileReader();r.onloadend=function(){var s=String(r.result);" +
            "SLMAndroid.saveFile(s.substring(s.indexOf(',')+1),n||'download',b.type||'application/octet-stream');};r.readAsDataURL(b);}" +
            "function isLocal(h){return h.indexOf('blob:')===0||h.indexOf('data:')===0;}" +
            "function grab(a){fetch(a.href).then(function(r){return r.blob();}).then(function(b){send(b,a.getAttribute('download'));});}" +
            "var click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){" +
            "if(isLocal(this.getAttribute('href')||'')){grab(this);return;}return click.apply(this,arguments);};" +
            "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;" +
            "if(a&&isLocal(a.getAttribute('href')||'')){e.preventDefault();e.stopPropagation();grab(a);}},true);" +
            "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        web = findViewById(R.id.web);
        progress = findViewById(R.id.progress);
        offline = findViewById(R.id.offline);
        baseHost = Uri.parse(BuildConfig.SLM_URL).getHost();

        registerLaunchers();
        configureWebView();

        findViewById(R.id.retry).setOnClickListener(v -> {
            mainFrameError = false;
            offline.setVisibility(View.GONE);
            if (web.getUrl() == null) web.loadUrl(BuildConfig.SLM_URL);
            else web.reload();
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(BuildConfig.SLM_URL);
        }
    }

    private void registerLaunchers() {
        fileChooserLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (fileCallback == null) return;
            Uri[] uris = null;
            Intent data = result.getData();
            if (result.getResultCode() == RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    uris = new Uri[n];
                    for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                } else if (cameraOutput != null && cameraFileHasContent()) {
                    uris = new Uri[]{cameraOutput};
                }
            }
            fileCallback.onReceiveValue(uris);
            fileCallback = null;
            cameraOutput = null;
        });

        cameraPermissionLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (pendingWebPermission != null) {
                if (granted) pendingWebPermission.grant(pendingWebPermission.getResources());
                else pendingWebPermission.deny();
                pendingWebPermission = null;
            }
            if (pendingChooser != null) {
                Intent chooser = granted ? pendingChooser : contentOnly(pendingChooser);
                pendingChooser = null;
                launchChooser(chooser);
            }
        });
    }

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " SLMAndroid/" + BuildConfig.VERSION_NAME);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "SLMAndroid");
        boolean documentStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (documentStart) {
            WebViewCompat.addDocumentStartJavaScript(web, BRIDGE_SCRIPT, Collections.singleton("*"));
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternal(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!documentStart) view.evaluateJavascript(BRIDGE_SCRIPT, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!documentStart) view.evaluateJavascript(BRIDGE_SCRIPT, null);
                if (!mainFrameError) offline.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mainFrameError = true;
                    offline.setVisibility(View.VISIBLE);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                openFileChooser(params);
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Kamera langsung (foto bukti DO) hanya untuk halaman SLM sendiri.
                if (!isOwnHost(request.getOrigin())) {
                    request.deny();
                    return;
                }
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    pendingWebPermission = request;
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
                }
            }
        });

        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                web.evaluateJavascript("fetch('" + url.replace("'", "\\'") + "').then(function(r){return r.blob();}).then(function(b){var r=new FileReader();" +
                        "r.onloadend=function(){var s=String(r.result);SLMAndroid.saveFile(s.substring(s.indexOf(',')+1),'" +
                        URLUtil.guessFileName(url, contentDisposition, mimeType).replace("'", "") + "',b.type);};r.readAsDataURL(b);});", null);
                return;
            }
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
            req.addRequestHeader("User-Agent", userAgent);
            req.setMimeType(mimeType);
            req.setTitle(fileName);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
            Toast.makeText(this, getString(R.string.download_started, fileName), Toast.LENGTH_SHORT).show();
        });
    }

    private boolean isOwnHost(Uri uri) {
        String host = uri.getHost();
        return host != null && baseHost != null && (host.equals(baseHost) || host.endsWith("." + baseHost));
    }

    /** true = sudah ditangani di luar WebView (aplikasi lain); false = muat di WebView. */
    private boolean handleExternal(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if ((scheme.equals("http") || scheme.equals("https")) && isOwnHost(uri)) return false;
        try {
            if (scheme.equals("intent")) {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                }
                return true;
            }
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            if (scheme.equals("rawbt")) {
                Toast.makeText(this, R.string.rawbt_missing, Toast.LENGTH_LONG).show();
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + RAWBT_PACKAGE)));
                } catch (ActivityNotFoundException ignored) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + RAWBT_PACKAGE)));
                }
            } else {
                Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void openFileChooser(WebChromeClient.FileChooserParams params) {
        Intent content = params.createIntent();
        content.addCategory(Intent.CATEGORY_OPENABLE);
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        boolean wantsImage = false;
        for (String type : params.getAcceptTypes()) {
            if (type == null || type.isEmpty() || type.startsWith("image") || type.equals("*/*")) wantsImage = true;
        }

        Intent camera = null;
        if (wantsImage) {
            try {
                File dir = new File(getCacheDir(), "camera");
                if (!dir.exists()) dir.mkdirs();
                File photo = File.createTempFile("foto_", ".jpg", dir);
                cameraOutput = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
                camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutput);
                camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception e) {
                camera = null;
                cameraOutput = null;
            }
        }

        Intent chooser;
        if (camera != null && params.isCaptureEnabled()) {
            chooser = camera;
        } else {
            chooser = Intent.createChooser(content, null);
            if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }

        if (camera != null && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            pendingChooser = chooser;
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
            return;
        }
        launchChooser(chooser);
    }

    /** Tanpa izin kamera: tetap bisa memilih file dari galeri. */
    private Intent contentOnly(Intent chooser) {
        cameraOutput = null;
        if (MediaStore.ACTION_IMAGE_CAPTURE.equals(chooser.getAction())) {
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.setType("image/*");
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            return Intent.createChooser(pick, null);
        }
        chooser.removeExtra(Intent.EXTRA_INITIAL_INTENTS);
        return chooser;
    }

    private void launchChooser(Intent chooser) {
        try {
            fileChooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean cameraFileHasContent() {
        try (java.io.InputStream in = getContentResolver().openInputStream(cameraOutput)) {
            return in != null && in.read() != -1;
        } catch (Exception e) {
            return false;
        }
    }

    /** Fungsi yang dipanggil dari halaman web. */
    private class Bridge {
        @JavascriptInterface
        public void print(String title) {
            runOnUiThread(() -> {
                String job = (title == null || title.isEmpty()) ? "SLM" : title;
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(job);
                manager.print(job, adapter, new PrintAttributes.Builder().build());
            });
        }

        @JavascriptInterface
        public void saveFile(String base64, String fileName, String mimeType) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    String name = (fileName == null || fileName.isEmpty()) ? "download" : fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
                    String mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
                    Uri saved = writeDownload(name, mime, bytes);
                    Toast.makeText(MainActivity.this, getString(R.string.download_saved, name), Toast.LENGTH_LONG).show();
                    if (saved != null) {
                        Intent open = new Intent(Intent.ACTION_VIEW);
                        open.setDataAndType(saved, mime);
                        open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try {
                            startActivity(open);
                        } catch (ActivityNotFoundException ignored) {
                            // File tetap tersimpan di Download.
                        }
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Gagal menyimpan file: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private Uri writeDownload(String name, String mime, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("tidak bisa membuat file");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(bytes);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, values, null, null);
            return uri;
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".files", file);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
