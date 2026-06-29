package com.net2app.smsgw;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps the SMPP connection alive.
 *
 * Android kills background services aggressively (especially on modern
 * OS versions). A foreground service with a persistent notification
 * tells the system the app is doing ongoing user-visible work, which
 * significantly reduces the chance of being killed.
 *
 * The actual SMPP work runs on a dedicated background thread spawned
 * by this service, so the main thread stays responsive.
 */
public class SmppService extends Service {

    private static final String TAG = "SmppService";
    public static final String ACTION_START = "com.net2app.smsgw.START";
    public static final String ACTION_STOP = "com.net2app.smsgw.STOP";
    private static final int NOTIFICATION_ID = 1001;

    private static SmppSessionManager sessionManager;
    private Thread smppThread;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "Service created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action) || (action == null && sessionManager != null)) {
            stopGateway();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action) || action == null) {
            startGateway();
        }

        return START_STICKY;
    }

    private void startGateway() {
        if (sessionManager != null && sessionManager.isRunning()) {
            Log.i(TAG, "Gateway already running");
            return;
        }

        Log.i(TAG, "Starting SMS Gateway...");

        // Create foreground notification
        Notification notification = buildNotification("Connecting to SMPP server...");
        startForeground(NOTIFICATION_ID, notification);

        // Initialize session manager
        sessionManager = new SmppSessionManager();
        sessionManager.loadSettings();
        sessionManager.setStatusListener(new SmppSessionManager.StatusListener() {
            @Override
            public void onStatusChanged(String status, String detail) {
                Log.i(TAG, "Status: " + status + " — " + detail);
                updateNotification(detail);
                // Broadcast to MainActivity if open
                Intent broadcast = new Intent("com.net2app.smsgw.STATUS_UPDATE");
                broadcast.putExtra("status", status);
                broadcast.putExtra("detail", detail);
                sendBroadcast(broadcast);
            }

            @Override
            public void onLogMessage(String message) {
                Intent broadcast = new Intent("com.net2app.smsgw.LOG_MESSAGE");
                broadcast.putExtra("message", message);
                sendBroadcast(broadcast);
            }
        });

        // Wire up SmsSender to use this session manager
        SmsSender.setSessionManager(sessionManager);

        // Start SMPP on background thread
        smppThread = new Thread(() -> {
            try {
                sessionManager.start();
            } catch (Exception e) {
                Log.e(TAG, "SMPP thread crashed", e);
            }
        }, "SmppSessionThread");
        smppThread.setDaemon(true);
        smppThread.start();

        Log.i(TAG, "Gateway started");
    }

    private void stopGateway() {
        Log.i(TAG, "Stopping SMS Gateway...");
        if (sessionManager != null) {
            sessionManager.stop();
            sessionManager = null;
        }
        if (smppThread != null) {
            smppThread.interrupt();
            smppThread = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        Log.i(TAG, "Gateway stopped");
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, SmppService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPI = PendingIntent.getService(
            this, 1, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, GatewayApp.CHANNEL_ID)
            .setContentTitle("SMS Gateway")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopPI)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String text) {
        Notification notification = buildNotification(text);
        android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, notification);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopGateway();
        super.onDestroy();
    }

    /** Get the current session manager instance (thread-safe access). */
    public static SmppSessionManager getSessionManager() {
        return sessionManager;
    }

    /** Check if the gateway service is running. */
    public static boolean isRunning() {
        return sessionManager != null && sessionManager.isRunning();
    }
}
