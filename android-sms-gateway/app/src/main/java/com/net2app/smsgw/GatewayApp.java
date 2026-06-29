package com.net2app.smsgw;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * Application class for the SMS Gateway.
 * Initializes notification channels and default settings.
 */
public class GatewayApp extends Application {

    public static final String CHANNEL_ID = "smpp_gateway_service";
    public static final String CHANNEL_NAME = "SMS Gateway Service";

    private static GatewayApp instance;
    private SharedPreferences prefs;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        prefs = getSharedPreferences("gateway_prefs", Context.MODE_PRIVATE);
        createNotificationChannel();
        setDefaults();
    }

    public static GatewayApp getInstance() {
        return instance;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Persistent notification while SMPP gateway is running");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void setDefaults() {
        if (!prefs.contains("server_host")) {
            prefs.edit()
                .putString("server_host", "192.168.1.100")
                .putInt("server_port", 2775)
                .putInt("http_port", 3000)
                .putString("smpp_username", "")
                .putString("smpp_password", "")
                .putBoolean("auto_start", false)
                .apply();
        }
    }

    public SharedPreferences getPrefs() {
        return prefs;
    }
}
