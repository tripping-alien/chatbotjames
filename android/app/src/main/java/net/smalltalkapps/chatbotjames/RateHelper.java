package net.smalltalkapps.chatbotjames;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import com.google.android.gms.tasks.Task;

/**
 * Smart Native Google Play In-App Review & Rating Helper.
 * 1. Smart timing: Prompts gently on the 2nd app launch after the main UI settles (2.5s delay).
 * 2. Non-nagging: Max 2 prompts lifetime; minimum 7-day cooldown between prompts.
 * 3. 100% Native In-App UI: Uses Google Play In-App Review API (zero chrome/browser redirects).
 * 4. Milestone backup: Prompts on milestone completions if eligible.
 */
public class RateHelper {
    private static final String TAG = "RateHelper";
    private static final String PREF_NAME = "SmartRatePrefs";
    private static final String KEY_LAUNCH_COUNT = "app_launch_count";
    private static final String KEY_GAMES_PLAYED = "games_played_count";
    private static final String KEY_PROMPT_COUNT = "review_prompt_count";
    private static final String KEY_LAST_PROMPT_TIME = "last_prompt_timestamp";
    private static final String KEY_DONT_SHOW_AGAIN = "dont_show_again";

    // Timing & non-nagging thresholds
    private static final int TARGET_LAUNCH_FOR_PROMPT = 2; // Prompt on 2nd start in the beginning
    private static final int MAX_PROMPTS_LIFETIME = 2; // Never nag repeatedly
    private static final long COOLDOWN_DAYS_MS = 7L * 24L * 60L * 60L * 1000L; // 7 days

    private final Activity activity;
    private final SharedPreferences prefs;

    public RateHelper(Activity activity) {
        this.activity = activity;
        this.prefs = activity != null ? activity.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE) : null;
    }

    /**
     * Called in MainActivity.onCreate().
     * Tracks app launches and triggers native in-app review on the 2nd start.
     */
    public void notifyAppLaunch() {
        if (activity == null || prefs == null) return;

        int launches = prefs.getInt(KEY_LAUNCH_COUNT, 0) + 1;
        prefs.edit().putInt(KEY_LAUNCH_COUNT, launches).apply();

        if (launches == TARGET_LAUNCH_FOR_PROMPT && shouldPrompt()) {
            new Handler(Looper.getMainLooper()).postDelayed(this::promptRating, 2500);
        }
    }

    /**
     * Called on round completion / milestone.
     */
    public void notifyGameCompleted(boolean isHighScore) {
        if (activity == null || prefs == null) return;

        int games = prefs.getInt(KEY_GAMES_PLAYED, 0) + 1;
        prefs.edit().putInt(KEY_GAMES_PLAYED, games).apply();

        if ((games == 3 || isHighScore) && shouldPrompt()) {
            new Handler(Looper.getMainLooper()).postDelayed(this::promptRating, 1500);
        }
    }

    private boolean shouldPrompt() {
        if (prefs == null || prefs.getBoolean(KEY_DONT_SHOW_AGAIN, false)) {
            return false;
        }

        int promptCount = prefs.getInt(KEY_PROMPT_COUNT, 0);
        if (promptCount >= MAX_PROMPTS_LIFETIME) {
            prefs.edit().putBoolean(KEY_DONT_SHOW_AGAIN, true).apply();
            return false;
        }

        long lastPrompt = prefs.getLong(KEY_LAST_PROMPT_TIME, 0L);
        long now = System.currentTimeMillis();
        if (lastPrompt > 0 && (now - lastPrompt < COOLDOWN_DAYS_MS)) {
            return false;
        }

        return true;
    }

    /**
     * Launches the native in-app review flow.
     */
    public void promptRating() {
        if (activity == null || activity.isFinishing()) return;

        if (prefs != null) {
            int promptCount = prefs.getInt(KEY_PROMPT_COUNT, 0) + 1;
            prefs.edit()
                    .putLong(KEY_LAST_PROMPT_TIME, System.currentTimeMillis())
                    .putInt(KEY_PROMPT_COUNT, promptCount)
                    .apply();
            if (promptCount >= MAX_PROMPTS_LIFETIME) {
                prefs.edit().putBoolean(KEY_DONT_SHOW_AGAIN, true).apply();
            }
        }

        activity.runOnUiThread(() -> {
            try {
                ReviewManager manager = ReviewManagerFactory.create(activity);
                Task<ReviewInfo> request = manager.requestReviewFlow();
                request.addOnCompleteListener(task -> {
                    if (task.isSuccessful() && activity != null && !activity.isFinishing()) {
                        ReviewInfo reviewInfo = task.getResult();
                        Task<Void> flow = manager.launchReviewFlow(activity, reviewInfo);
                        flow.addOnCompleteListener(flowTask -> {
                            Log.i(TAG, "Native In-App Review flow finished");
                        });
                    } else {
                        Log.d(TAG, "In-App review flow request omitted: " + task.getException());
                    }
                });
            } catch (Throwable t) {
                Log.w(TAG, "In-App Review exception: " + t.getMessage());
            }
        });
    }

    /**
     * Direct manual trigger for an explicit "Rate Game" button in settings or main menu.
     */
    public void launchDirectly() {
        if (activity == null || activity.isFinishing()) return;
        activity.runOnUiThread(() -> {
            try {
                ReviewManager manager = ReviewManagerFactory.create(activity);
                Task<ReviewInfo> request = manager.requestReviewFlow();
                request.addOnCompleteListener(task -> {
                    if (task.isSuccessful() && activity != null && !activity.isFinishing()) {
                        ReviewInfo reviewInfo = task.getResult();
                        manager.launchReviewFlow(activity, reviewInfo);
                    } else {
                        launchMarketIntent();
                    }
                });
            } catch (Throwable t) {
                launchMarketIntent();
            }
        });
    }

    private void launchMarketIntent() {
        if (activity == null) return;
        String pkg = activity.getPackageName();
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
            intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY | Intent.FLAG_ACTIVITY_NEW_DOCUMENT | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            try {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
                activity.startActivity(webIntent);
            } catch (Exception ignored) {}
        }
    }
}
