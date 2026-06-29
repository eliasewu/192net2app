package com.net2app.smsgw;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SmsManager;
import android.util.Log;

import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends SMS through the phone's SIM card using Android SmsManager.
 *
 * Called by {@link SmppSessionManager} when a deliver_sm arrives from the
 * server. Monitors delivery via sent/delivered broadcast intents and
 * reports results back to the SmppSessionManager for DLR forwarding.
 *
 * IMPORTANT: SmsManager.sendTextMessage() MUST be called from Android's
 * main thread. This class handles the thread dispatch internally so
 * callers can invoke {@link #send} from any thread.
 */
public class SmsSender {

    private static final String TAG = "SmsSender";
    private static final String ACTION_SMS_SENT = "com.net2app.smsgw.SMS_SENT";
    private static final String ACTION_SMS_DELIVERED = "com.net2app.smsgw.SMS_DELIVERED";

    /** Track pending sends: messageId → delivery info */
    private static final Map<String, PendingSms> pendingSends = new ConcurrentHashMap<>();
    private static volatile SmppSessionManager sessionManager;

    /** Background executor for DLR HTTP calls (avoids blocking main thread) */
    private static final ExecutorService dlrExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "SmsDlrThread");
        t.setDaemon(true);
        return t;
    });

    private static volatile boolean receiverRegistered = false;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    /**
     * Send an SMS via the phone's SIM. Thread-safe — automatically
     * dispatches to the main thread for SmsManager.
     *
     * @param ctx         Application or Activity context
     * @param messageId   SMPP message ID (for DLR correlation)
     * @param destination Destination phone number
     * @param sender      Sender ID / source address
     * @param text        SMS body
     */
    public static void send(Context ctx, String messageId, String destination,
                            String sender, String text) {
        // SmsManager MUST be called on the main looper thread.
        // Post the whole operation there so callers from any thread
        // (including the jSMPP IO thread) work correctly.
        mainHandler.post(() -> sendOnMainThread(ctx, messageId, destination, sender, text));
    }

    /** Actual SMS send — must run on main thread. */
    private static void sendOnMainThread(Context ctx, String messageId,
                                          String destination, String sender, String text) {
        ensureReceiverRegistered(ctx.getApplicationContext());

        try {
            SmsManager smsManager = getSmsManager(ctx);

            // Build sent/delivered pending intents so we can track delivery
            Intent sentIntent = new Intent(ACTION_SMS_SENT);
            sentIntent.putExtra("message_id", messageId);
            sentIntent.putExtra("destination", destination);
            PendingIntent sentPI = PendingIntent.getBroadcast(
                ctx, messageId.hashCode(), sentIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Intent deliveredIntent = new Intent(ACTION_SMS_DELIVERED);
            deliveredIntent.putExtra("message_id", messageId);
            deliveredIntent.putExtra("destination", destination);
            PendingIntent deliveredPI = PendingIntent.getBroadcast(
                ctx, (messageId + "_dlr").hashCode(), deliveredIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Track the pending message
            pendingSends.put(messageId, new PendingSms(messageId, destination, sender));

            // Handle long messages (> 160 chars GSM-7 / > 70 chars UCS-2)
            ArrayList<String> parts = smsManager.divideMessage(text);

            if (parts.size() == 1) {
                smsManager.sendTextMessage(destination, null, text, sentPI, deliveredPI);
            } else {
                ArrayList<PendingIntent> sentPIs = new ArrayList<>();
                ArrayList<PendingIntent> deliveredPIs = new ArrayList<>();
                for (int i = 0; i < parts.size(); i++) {
                    sentPIs.add(sentPI);
                    deliveredPIs.add(deliveredPI);
                }
                smsManager.sendMultipartTextMessage(destination, null, parts, sentPIs, deliveredPIs);
            }

            Log.d(TAG, "SMS queued: " + messageId + " → " + destination + " (" + parts.size() + " parts)");

        } catch (Exception e) {
            Log.e(TAG, "Failed to send SMS: " + e.getMessage(), e);
            failed(messageId, destination);
        }
    }

    /** Handle send failure — clean up and report. */
    private static void failed(String messageId, String destination) {
        pendingSends.remove(messageId);
        SmppSessionManager mgr = sessionManager;
        if (mgr != null) {
            mgr.onSmsSentResult(messageId, destination, false);
        }
    }

    /** Set the session manager for DLR callbacks. */
    public static void setSessionManager(SmppSessionManager mgr) {
        sessionManager = mgr;
    }

    /** Register the sent/delivered broadcast receiver if not already done. */
    private static void ensureReceiverRegistered(Context ctx) {
        if (receiverRegistered) return;
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_SMS_SENT);
        filter.addAction(ACTION_SMS_DELIVERED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(smsResultReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            ctx.registerReceiver(smsResultReceiver, filter);
        }
        receiverRegistered = true;
    }

    /** Get SmsManager — subscription-aware on API 31+. */
    private static SmsManager getSmsManager(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ctx.getSystemService(SmsManager.class);
        }
        return SmsManager.getDefault();
    }

    /**
     * BroadcastReceiver that handles SMS sent/delivered results.
     * Offloads DLR reporting to a background executor so the broadcast
     * receiver doesn't block the main thread.
     */
    private static final BroadcastReceiver smsResultReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String messageId = intent.getStringExtra("message_id");
            String destination = intent.getStringExtra("destination");
            if (messageId == null) return;

            PendingSms pending = pendingSends.remove(messageId);
            if (pending == null) return;

            String action = intent.getAction();
            int resultCode = getResultCode();

            if (ACTION_SMS_SENT.equals(action)) {
                switch (resultCode) {
                    case Activity.RESULT_OK:
                        Log.d(TAG, "SMS sent OK: " + messageId + " → " + destination);
                        // Wait for delivery confirmation, don't report yet
                        break;
                    case SmsManager.RESULT_ERROR_GENERIC_FAILURE:
                    case SmsManager.RESULT_ERROR_RADIO_OFF:
                    case SmsManager.RESULT_ERROR_NULL_PDU:
                    case SmsManager.RESULT_ERROR_NO_SERVICE:
                    default:
                        Log.w(TAG, "SMS send FAILED: " + messageId + " code=" + resultCode);
                        dlrExecutor.execute(() -> {
                            SmppSessionManager mgr = sessionManager;
                            if (mgr != null) {
                                mgr.onSmsSentResult(messageId, destination, false);
                                mgr.reportDeliveryReceipt(messageId, destination, "UNDELIV", resultCode);
                            }
                        });
                        break;
                }
            } else if (ACTION_SMS_DELIVERED.equals(action)) {
                boolean delivered = resultCode == Activity.RESULT_OK;
                Log.d(TAG, "SMS delivery: " + messageId + " → " + destination + " delivered=" + delivered);
                dlrExecutor.execute(() -> {
                    SmppSessionManager mgr = sessionManager;
                    if (mgr != null) {
                        mgr.onSmsSentResult(messageId, destination, delivered);
                        String dlrStatus = delivered ? "DELIVRD" : "UNDELIV";
                        mgr.reportDeliveryReceipt(messageId, destination, dlrStatus, resultCode);
                    }
                });
            }
        }
    };

    /** Internal tracking structure for a pending SMS send. */
    private static class PendingSms {
        final String messageId;
        final String destination;
        final String sender;
        final long timestamp;

        PendingSms(String messageId, String destination, String sender) {
            this.messageId = messageId;
            this.destination = destination;
            this.sender = sender;
            this.timestamp = System.currentTimeMillis();
        }
    }
}
