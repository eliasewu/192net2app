package com.net2app.smsgw;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Splash/startup activity showing NET2APP branding for 2 seconds,
 * then automatically navigates to MainActivity.
 *
 * The layout is programmatic; see res/layout/activity_splash.xml
 * for the Android Studio Layout Editor reference.
 */
public class SplashActivity extends AppCompatActivity {

    private static final long SPLASH_DURATION_MS = 2000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable navigateRunnable = () -> {
        Intent intent = new Intent(SplashActivity.this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUI());
        handler.postDelayed(navigateRunnable, SPLASH_DURATION_MS);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Cancel auto-navigation if the user leaves the splash (Home button, etc.)
        // so MainActivity doesn't pop up in the background.
        handler.removeCallbacks(navigateRunnable);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-schedule navigation if the user returns (only if not already finished)
        if (!isFinishing()) {
            handler.removeCallbacks(navigateRunnable);
            handler.postDelayed(navigateRunnable, SPLASH_DURATION_MS);
        }
    }

    private View buildUI() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xFF1A73E8); // NET2APP blue

        // Large brand name
        TextView brandName = new TextView(this);
        brandName.setText(R.string.splash_brand);
        brandName.setTextSize(42);
        brandName.setTextColor(0xFFFFFFFF);
        brandName.setGravity(Gravity.CENTER);
        root.addView(brandName);

        View spacer1 = new View(this);
        spacer1.setLayoutParams(new LinearLayout.LayoutParams(dp(1), dp(12)));
        root.addView(spacer1);

        // Subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText(R.string.splash_subtitle);
        subtitle.setTextSize(16);
        subtitle.setTextColor(0xCCFFFFFF);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLetterSpacing(0.15f);
        root.addView(subtitle);

        View spacer2 = new View(this);
        spacer2.setLayoutParams(new LinearLayout.LayoutParams(dp(1), dp(36)));
        root.addView(spacer2);

        // SMS icon (emoji)
        TextView icon = new TextView(this);
        icon.setText("📱→📩");
        icon.setTextSize(32);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        View spacer3 = new View(this);
        spacer3.setLayoutParams(new LinearLayout.LayoutParams(dp(1), dp(36)));
        root.addView(spacer3);

        // Loading text
        TextView loading = new TextView(this);
        loading.setText(R.string.splash_loading);
        loading.setTextSize(13);
        loading.setTextColor(0x99FFFFFF);
        loading.setGravity(Gravity.CENTER);
        root.addView(loading);

        View spacer4 = new View(this);
        spacer4.setLayoutParams(new LinearLayout.LayoutParams(dp(1), dp(48)));
        root.addView(spacer4);

        // Version
        TextView version = new TextView(this);
        version.setText(R.string.version_label);
        version.setTextSize(11);
        version.setTextColor(0x66FFFFFF);
        version.setGravity(Gravity.CENTER);
        root.addView(version);

        return root;
    }

    @Override
    public void onBackPressed() {
        // Block back-button during splash
    }

    private int dp(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
