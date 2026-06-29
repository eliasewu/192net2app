package com.net2app.smsgw;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Main dashboard activity showing:
 *   - Connection status + statistics cards
 *   - Start / Stop button
 *   - Real-time activity log
 *
 * The layout is created programmatically for portability (no XML dependency
 * issues across Android Studio versions). See res/layout/activity_main.xml
 * for a visual-design starting point.
 */
public class MainActivity extends AppCompatActivity {

    private static final int MAX_LOG_ENTRIES = 200;
    private final List<String> logEntries = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.US);

    private TextView statusText;
    private TextView statusDetail;
    private View statusIndicator;
    private Button startStopBtn;
    private LinearLayout logContainer;
    private ScrollView logScroll;
    private SwipeRefreshLayout swipeRefresh;

    private TextView statSmsSent, statSmsRcvd, statSmsFailed, statDlr, statUptime;
    private TextView statHost;

    private Runnable statsPoller;

    // ── Broadcast receivers for SmppService updates ──────────────────────

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String status = intent.getStringExtra("status");
            String detail = intent.getStringExtra("detail");
            runOnUiThread(() -> updateStatusUI(status, detail));
        }
    };

    private final BroadcastReceiver logReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String message = intent.getStringExtra("message");
            if (message != null) {
                runOnUiThread(() -> appendLog(message));
            }
        }
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUI();

        // Register broadcast receivers from SmppService
        IntentFilter statusFilter = new IntentFilter("com.net2app.smsgw.STATUS_UPDATE");
        ContextCompat.registerReceiver(this, statusReceiver, statusFilter, ContextCompat.RECEIVER_NOT_EXPORTED);

        IntentFilter logFilter = new IntentFilter("com.net2app.smsgw.LOG_MESSAGE");
        ContextCompat.registerReceiver(this, logReceiver, logFilter, ContextCompat.RECEIVER_NOT_EXPORTED);

        // Periodic stats refresh
        statsPoller = new Runnable() {
            @Override
            public void run() {
                refreshStats();
                handler.postDelayed(this, 2000);
            }
        };
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStats();
        handler.postDelayed(statsPoller, 2000);
        updateStartStopButton();
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(statsPoller);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try { unregisterReceiver(statusReceiver); } catch (Exception ignored) {}
        try { unregisterReceiver(logReceiver); } catch (Exception ignored) {}
    }

    // ── UI Build ──────────────────────────────────────────────────────────

    @SuppressWarnings("deprecation")
    private void buildUI() {
        // Root swipe-refresh
        swipeRefresh = new SwipeRefreshLayout(this);
        swipeRefresh.setOnRefreshListener(() -> {
            refreshStats();
            swipeRefresh.setRefreshing(false);
        });

        ScrollView rootScroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(16));

        // ── Header ──
        TextView title = new TextView(this);
        title.setText("SMS Gateway");
        title.setTextSize(24);
        title.setTextColor(0xFF202124);
        title.setPadding(0, 0, 0, dp(8));
        root.addView(title);

        // ── Status card ──
        LinearLayout statusCard = card();
        statusCard.setOrientation(LinearLayout.VERTICAL);

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);

        statusIndicator = new View(this);
        statusIndicator.setLayoutParams(new LinearLayout.LayoutParams(dp(14), dp(14)));
        statusIndicator.setBackground(getResources().getDrawable(android.R.drawable.presence_offline));
        statusRow.addView(statusIndicator);

        LinearLayout statusTextCol = new LinearLayout(this);
        statusTextCol.setOrientation(LinearLayout.VERTICAL);
        statusTextCol.setPadding(dp(12), 0, 0, 0);

        statusText = new TextView(this);
        statusText.setText("Disconnected");
        statusText.setTextSize(18);
        statusText.setTextColor(0xFF202124);
        statusTextCol.addView(statusText);

        statusDetail = new TextView(this);
        statusDetail.setText("Tap START to connect");
        statusDetail.setTextSize(13);
        statusDetail.setTextColor(0xFF5F6368);
        statusTextCol.addView(statusDetail);

        statusRow.addView(statusTextCol);
        statusCard.addView(statusRow);

        // Start / Stop button
        startStopBtn = new Button(this);
        startStopBtn.setText("START GATEWAY");
        startStopBtn.setOnClickListener(v -> toggleGateway());
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        );
        btnParams.topMargin = dp(12);
        startStopBtn.setLayoutParams(btnParams);
        statusCard.addView(startStopBtn);

        // Server info
        SharedPreferences prefs = getSharedPreferences("gateway_prefs", MODE_PRIVATE);
        String host = prefs.getString("server_host", "192.168.1.100");
        int port = prefs.getInt("server_port", 2775);
        statHost = new TextView(this);
        statHost.setText("Server: " + host + ":" + port);
        statHost.setTextSize(11);
        statHost.setTextColor(0xFF80868B);
        statHost.setPadding(0, dp(8), 0, 0);
        statusCard.addView(statHost);

        root.addView(statusCard);
        addSpace(root, dp(12));

        // ── Statistics cards row 1 ──
        LinearLayout statsRow1 = new LinearLayout(this);
        statsRow1.setOrientation(LinearLayout.HORIZONTAL);

        statSmsSent = addStatCard(statsRow1, "SMS Sent", "0", 0xFF1A73E8, 1);
        statSmsRcvd = addStatCard(statsRow1, "SMS Rcvd", "0", 0xFF34A853, 1);
        root.addView(statsRow1);
        addSpace(root, dp(8));

        // ── Statistics cards row 2 ──
        LinearLayout statsRow2 = new LinearLayout(this);
        statsRow2.setOrientation(LinearLayout.HORIZONTAL);

        statSmsFailed = addStatCard(statsRow2, "Failed", "0", 0xFFEA4335, 1);
        statDlr = addStatCard(statsRow2, "DLRs", "0", 0xFFFF9800, 1);
        root.addView(statsRow2);
        addSpace(root, dp(8));

        // ── Uptime card ──
        statUptime = new TextView(this);
        statUptime.setText("Uptime: --");
        statUptime.setTextSize(13);
        statUptime.setTextColor(0xFF5F6368);
        statUptime.setPadding(0, dp(8), 0, 0);
        root.addView(statUptime);
        addSpace(root, dp(16));

        // ── Activity Log ──
        TextView logTitle = new TextView(this);
        logTitle.setText("Activity Log");
        logTitle.setTextSize(16);
        logTitle.setTextColor(0xFF202124);
        logTitle.setPadding(0, 0, 0, dp(8));
        root.addView(logTitle);

        logContainer = new LinearLayout(this);
        logContainer.setOrientation(LinearLayout.VERTICAL);
        logContainer.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        LinearLayout logCard = card();
        logCard.addView(logContainer);
        root.addView(logCard);

        // ── Buttons row ──
        addSpace(root, dp(16));
        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);

        Button settingsBtn = new Button(this);
        settingsBtn.setText("Settings");
        settingsBtn.setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));
        btnRow.addView(settingsBtn);

        View spacer = new View(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(dp(8), 0));
        btnRow.addView(spacer);

        Button clearLogBtn = new Button(this);
        clearLogBtn.setText("Clear Logs");
        clearLogBtn.setOnClickListener(v -> clearLogs());
        btnRow.addView(clearLogBtn);

        root.addView(btnRow);

        rootScroll.addView(root);
        swipeRefresh.addView(rootScroll);
        setContentView(swipeRefresh);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(getResources().getDrawable(android.R.drawable.dialog_holo_light_frame));
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        return card;
    }

    private TextView addStatCard(LinearLayout parent, String label, String value, int color, float weight) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(getResources().getDrawable(android.R.drawable.dialog_holo_light_frame));
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, weight);
        params.rightMargin = dp(4);
        params.leftMargin = dp(4);
        card.setLayoutParams(params);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextSize(11);
        labelView.setTextColor(0xFF5F6368);
        card.addView(labelView);

        TextView valueView = new TextView(this);
        valueView.setText(value);
        valueView.setTextSize(22);
        valueView.setTextColor(color);
        card.addView(valueView);

        parent.addView(card);
        return valueView;
    }

    private void addSpace(LinearLayout parent, int heightDp) {
        View space = new View(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, heightDp
        ));
        parent.addView(space);
    }

    // ── UI Updates ────────────────────────────────────────────────────────

    private void updateStatusUI(String status, String detail) {
        statusDetail.setText(detail != null ? detail : "");

        switch (status != null ? status : "") {
            case "bound":
                statusText.setText("Connected");
                statusText.setTextColor(0xFF34A853);
                statusIndicator.setBackgroundColor(0xFF34A853);
                break;
            case "binding":
                statusText.setText("Connecting...");
                statusText.setTextColor(0xFFFBBC04);
                statusIndicator.setBackgroundColor(0xFFFBBC04);
                break;
            case "error":
                statusText.setText("Error");
                statusText.setTextColor(0xFFEA4335);
                statusIndicator.setBackgroundColor(0xFFEA4335);
                break;
            default:
                statusText.setText("Disconnected");
                statusText.setTextColor(0xFF202124);
                statusIndicator.setBackgroundColor(0xFF80868B);
                break;
        }
        updateStartStopButton();
    }

    private void updateStartStopButton() {
        boolean running = SmppService.isRunning();
        if (running) {
            startStopBtn.setText("STOP GATEWAY");
        } else {
            startStopBtn.setText("START GATEWAY");
        }
    }

    private void refreshStats() {
        SmppSessionManager mgr = SmppService.getSessionManager();
        if (mgr == null) {
            statSmsSent.setText("0");
            statSmsRcvd.setText("0");
            statSmsFailed.setText("0");
            statDlr.setText("0");
            statUptime.setText("Uptime: --");
            return;
        }
        SmppSessionManager.GatewayStats stats = mgr.getStats();
        statSmsSent.setText(String.valueOf(stats.smsSent));
        statSmsRcvd.setText(String.valueOf(stats.smsReceived));
        statSmsFailed.setText(String.valueOf(stats.smsFailed));
        statDlr.setText(String.valueOf(stats.dlrDelivered));

        if (stats.connectionUptime > 0) {
            long uptimeSec = stats.connectionUptime / 1000;
            long hours = uptimeSec / 3600;
            long mins = (uptimeSec % 3600) / 60;
            long secs = uptimeSec % 60;
            statUptime.setText(String.format(Locale.US, "Uptime: %02d:%02d:%02d", hours, mins, secs));
        } else {
            statUptime.setText("Uptime: --");
        }

        statHost.setText("Server: " + stats.host + ":" + stats.port);
    }

    private void appendLog(String message) {
        synchronized (logEntries) {
            logEntries.add(timeFormat.format(new Date()) + "  " + message);
            if (logEntries.size() > MAX_LOG_ENTRIES) {
                logEntries.remove(0);
            }
            rebuildLogUI();
        }
    }

    private void rebuildLogUI() {
        logContainer.removeAllViews();
        synchronized (logEntries) {
            for (int i = logEntries.size() - 1; i >= Math.max(0, logEntries.size() - 50); i--) {
                TextView entry = new TextView(this);
                entry.setText(logEntries.get(i));
                entry.setTextSize(11);
                entry.setTextColor(0xFF5F6368);
                entry.setPadding(0, dp(2), 0, dp(2));
                logContainer.addView(entry);
            }
        }
        logScroll = (ScrollView) logContainer.getParent();
    }

    private void clearLogs() {
        synchronized (logEntries) {
            logEntries.clear();
        }
        rebuildLogUI();
    }

    // ── Actions ───────────────────────────────────────────────────────────

    private void toggleGateway() {
        if (SmppService.isRunning()) {
            Intent intent = new Intent(this, SmppService.class);
            intent.setAction(SmppService.ACTION_STOP);
            startService(intent);
        } else {
            Intent intent = new Intent(this, SmppService.class);
            intent.setAction(SmppService.ACTION_START);
            startForegroundService(intent);
        }
        updateStartStopButton();
    }

    private int dp(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
