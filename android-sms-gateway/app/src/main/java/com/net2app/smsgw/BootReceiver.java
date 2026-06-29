package com.net2app.smsgw;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receives BOOT_COMPLETED to auto-start the gateway service if the user
 * has enabled auto-start in settings.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        boolean autoStart = context.getSharedPreferences("gateway_prefs", Context.MODE_PRIVATE)
                .getBoolean("auto_start", false);

        if (autoStart) {
            Log.i(TAG, "Auto-starting SMS Gateway service after boot");
            Intent serviceIntent = new Intent(context, SmppService.class);
            serviceIntent.setAction(SmppService.ACTION_START);
            context.startForegroundService(serviceIntent);
        }
    }
}
