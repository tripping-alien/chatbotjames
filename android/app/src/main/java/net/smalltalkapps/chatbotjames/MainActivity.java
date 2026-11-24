package net.smalltalkapps.chatbotjames;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.LinearLayout;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    public static final String TARGET_URL = "https://chatbotjames.onrender.com";
    public static final String HOST_DOMAIN = "chatbotjames.onrender.com";

    private WebView mWebView;
    private ProgressBar mProgressBar;
    private LinearLayout mOfflineLayout;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        new RateHelper(this).notifyAppLaunch();
        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.webview);
        mProgressBar = findViewById(R.id.progressBar);
        mOfflineLayout = findViewById(R.id.offlineLayout);
        Button retryButton = findViewById(R.id.retryButton);

        // Window insets handling: ensure full screen edge-to-edge with visible title bar
        // and snug bottom edge without system status bar clock blocking web UI elements.
        View coordinator = findViewById(R.id.coordinatorLayout);
        if (coordinator != null) {
            ViewCompat.setOnApplyWindowInsetsListener(coordinator, (v, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }

        // Bridge for Web JavaScript to native Android notifications and tools
        mWebView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");

        // Retry Button
        retryButton.setOnClickListener(v -> {
            if (isNetworkAvailable()) {
                mOfflineLayout.setVisibility(View.GONE);
                mWebView.setVisibility(View.VISIBLE);
                mWebView.loadUrl(TARGET_URL);
            }
        });

        // Setup WebSettings
        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings webSettings = mWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setBuiltInZoomControls(true);
        webSettings.setDisplayZoomControls(false);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Prevent pull-to-refresh & overscroll bounce completely
        mWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        mWebView.setVerticalScrollBarEnabled(true);

        // WebChromeClient for Progress and Console logging
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    mProgressBar.setVisibility(View.VISIBLE);
                    mProgressBar.setProgress(newProgress);
                } else {
                    mProgressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                android.util.Log.d("ChatBotJamesWeb", consoleMessage.message() + " -- From line "
                        + consoleMessage.lineNumber() + " of "
                        + consoleMessage.sourceId());
                return true;
            }
        });

        // WebViewClient
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && (host.equals(HOST_DOMAIN) || host.endsWith("onrender.com") || host.endsWith("github.io"))) {
                    return false; // Stay in WebView
                }
                // Open external links (mailto, tel, other sites) in default browser
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showOfflineScreen();
                }
            }
        });

        // Modern OnBackPressed handling
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (mWebView.canGoBack()) {
                    mWebView.goBack();
                } else {
                    finish();
                }
            }
        });

        // Load initial page
        if (isNetworkAvailable()) {
            mWebView.loadUrl(TARGET_URL);
        } else {
            showOfflineScreen();
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnected();
        }
        return false;
    }

    private void showOfflineScreen() {
        mWebView.setVisibility(View.GONE);
        mOfflineLayout.setVisibility(View.VISIBLE);
    }

    /**
     * Native bridge for ChatBot James Web to fire native Android notifications for timers, alerts and AI events.
     */
    public static class AndroidBridge {
        private final Context context;
        private static final String CHANNEL_ID = "james_notifications";

        public AndroidBridge(Context context) {
            this.context = context;
            createNotificationChannel();
        }

        private void createNotificationChannel() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "JAMES AI Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Notifications from JAMES AI tools and timers");
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.createNotificationChannel(channel);
            }
        }

        @JavascriptInterface
        public void postNotification(String title, String body) {
            if (context == null) return;
            try {
                Intent intent = new Intent(context, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );

                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title != null ? title : "JAMES AI")
                    .setContentText(body != null ? body : "")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent);

                NotificationManagerCompat nmc = NotificationManagerCompat.from(context);
                if (ActivityCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED || Build.VERSION.SDK_INT < 33) {
                    nmc.notify((int) System.currentTimeMillis(), builder.build());
                }
            } catch (Exception e) {
                android.util.Log.e("AndroidBridge", "Error posting notification: " + e.getMessage());
            }
        }
    }
}
