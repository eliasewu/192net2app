package com.net2app.smsgw;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

/**
 * BroadcastReceiver that catches incoming SMS messages and forwards
 * them to the SMPP server as submit_sm PDUs.
 *
 * Registered in AndroidManifest.xml with high priority so the app
 * sees SMS before other apps (but does NOT abort the broadcast —
 * other SMS apps still get the message).
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "SmsReceiver";
    private static final String SMS_RECEIVED_ACTION = "android.provider.Telephony.SMS_RECEIVED";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;

        SmppSessionManager sessionMgr = SmppService.getSessionManager();
        if (sessionMgr == null) {
            Log.w(TAG, "Session manager not available — incoming SMS dropped");
            return;
        }

        String format = bundle.getString("format");

        for (Object pduObj : pdus) {
            try {
                SmsMessage sms;
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    sms = SmsMessage.createFromPdu((byte[]) pduObj, format);
                } else {
                    sms = SmsMessage.createFromPdu((byte[]) pduObj);
                }

                String sender = sms.getDisplayOriginatingAddress();
                String messageBody = sms.getDisplayMessageBody();
                long timestamp = sms.getTimestampMillis();

                if (sender == null || messageBody == null) continue;

                Log.d(TAG, "Incoming SMS: " + sender + " → " + messageBody);

                // Forward to server via SMPP submit_sm
                sessionMgr.forwardIncomingSms(sender, messageBody);

            } catch (Exception e) {
                Log.e(TAG, "Failed to process incoming SMS: " + e.getMessage(), e);
            }
        }
    }
}
