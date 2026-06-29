package com.net2app.smsgw;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import org.json.JSONObject;
import org.jsmpp.bean.*;
import org.jsmpp.extra.SessionState;
import org.jsmpp.session.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Manages the SMPP transceiver session to the NET2APP server.
 *
 * Flow:
 *   Outbound SMS:  Server → deliver_sm → Phone SMS → Recipient
 *                  Recipient delivery → HTTP POST /internal/dlr_event → Server
 *   Inbound SMS:   Recipient → Phone SMS → submit_sm → Server
 *
 * The app acts as an ESME (External Short Message Entity), binding as
 * a transceiver so it can both receive deliver_sm and send submit_sm.
 *
 * DLR Reporting: Instead of trying to send SMPP delivery receipts (which
 * requires deliver_sm in ESME→SMSC direction, unsupported by most SMPP
 * libraries), delivery status is reported to the server's REST API at
 * /internal/dlr_event. This is the same endpoint used by asterisk-bridge.cjs
 * for voice OTP DLRs.
 */
public class SmppSessionManager {

    private static final Logger log = LoggerFactory.getLogger(SmppSessionManager.class);

    // Hardcoded defaults (overridden by SharedPreferences)
    private static final String DEFAULT_HOST = "192.168.1.100";
    private static final int DEFAULT_SMPP_PORT = 2775;
    private static final int DEFAULT_HTTP_PORT = 3000;

    private SMPPSession session;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicLong smsSent = new AtomicLong(0);
    private final AtomicLong smsReceived = new AtomicLong(0);
    private final AtomicLong smsFailed = new AtomicLong(0);
    private final AtomicLong dlrDelivered = new AtomicLong(0);
    private final AtomicLong lastBindTime = new AtomicLong(0);
    private final AtomicLong connectionUptime = new AtomicLong(0);

    private String currentHost;
    private int currentSmppPort;
    private int currentHttpPort;
    private String currentUsername;
    private String currentPassword;

    /** Must be volatile — written by main thread, read by SMPP IO thread. */
    private volatile StatusListener statusListener;

    /** Background executor for non-blocking submit_sm (incoming SMS forwarding). */
    private final ExecutorService smExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "SmppSubmitThread");
        t.setDaemon(true);
        return t;
    });

    public interface StatusListener {
        void onStatusChanged(String status, String detail);
        void onLogMessage(String message);
    }

    public SmppSessionManager() {
        loadSettings();
    }

    /** Reload connection settings from SharedPreferences. */
    public void loadSettings() {
        var prefs = GatewayApp.getInstance().getSharedPreferences("gateway_prefs", 0);
        currentHost = prefs.getString("server_host", DEFAULT_HOST);
        currentSmppPort = prefs.getInt("server_port", DEFAULT_SMPP_PORT);
        currentHttpPort = prefs.getInt("http_port", DEFAULT_HTTP_PORT);
        currentUsername = prefs.getString("smpp_username", "");
        currentPassword = prefs.getString("smpp_password", "");
    }

    public void setStatusListener(StatusListener listener) {
        this.statusListener = listener;
    }

    /** Begin the SMPP connection loop. Blocks until stop() is called. */
    public void start() {
        if (!running.compareAndSet(false, true)) return;
        log.info("[SMPP] Starting session manager → {}:{}", currentHost, currentSmppPort);
        notifyStatus("binding", "Connecting to " + currentHost + ":" + currentSmppPort);

        int attempt = 0;
        while (running.get()) {
            attempt++;
            try {
                connectAndBind(attempt);
                attempt = 0;
                while (running.get() && session != null && isBound()) {
                    updateUptime();
                    TimeUnit.SECONDS.sleep(1);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.warn("[SMPP] Connection attempt {} failed: {}", attempt, e.getMessage());
                notifyStatus("error", "Connection failed: " + e.getMessage());
            }

            if (running.get()) {
                long backoff = Math.min(attempt * 5L, 120);
                log.info("[SMPP] Reconnecting in {}s...", backoff);
                notifyStatus("unbound", "Reconnecting in " + backoff + "s");
                try {
                    for (int i = 0; i < backoff && running.get(); i++) {
                        TimeUnit.SECONDS.sleep(1);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        notifyStatus("unbound", "Stopped");
        log.info("[SMPP] Session manager stopped");
    }

    /** Perform a single SMPP bind attempt. */
    private void connectAndBind(int attempt) throws IOException {
        closeSession();

        session = new SMPPSession();
        session.setMessageReceiverListener(new SmppMessageReceiver());
        session.addSessionStateListener(new SmppStateListener());

        log.info("[SMPP] Attempt {} — connecting to {}:{} as {}", attempt, currentHost, currentSmppPort, currentUsername);
        notifyLog("Connecting to " + currentHost + ":" + currentSmppPort + " as " + currentUsername);

        BindParameter bindParam = new BindParameter(BindType.BIND_TRX, currentUsername, currentPassword, null,
                TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, null);
        BindResult result = session.connectAndBind(currentHost, currentSmppPort, bindParam, 10000);

        long now = System.currentTimeMillis();
        lastBindTime.set(now);
        log.info("[SMPP] Bind successful — system_id={}", result.getSystemId());
        notifyStatus("bound", "Connected as " + currentUsername + " (attempt " + attempt + ")");
        notifyLog("Bound OK — system_id=" + result.getSystemId());
    }

    public void stop() {
        running.set(false);
        closeSession();
        smExecutor.shutdownNow();
    }

    public boolean isRunning() {
        return running.get();
    }

    private boolean isBound() {
        if (session == null) return false;
        SessionState state = session.getSessionState();
        return state == SessionState.BOUND_TRX || state == SessionState.BOUND_RX || state == SessionState.BOUND_TX;
    }

    // ── DLR Reporting via REST HTTP ────────────────────────────────────

    /**
     * Report SMS delivery receipt to the server via HTTP POST to
     * /internal/dlr_event. This is the same endpoint the Java gateway's
     * DlrRouter uses, and the same one asterisk-bridge.cjs uses for
     * voice OTP DLRs. Much more reliable than trying to send SMPP
     * delivery_receipt PDUs in the ESME→SMSC direction.
     */
    public void reportDeliveryReceipt(String messageId, String destination,
                                       String dlrStatus, int errorCode) {
        String httpUrl = "http://" + currentHost + ":" + currentHttpPort + "/internal/dlr_event";
        String json = new JSONObject()
            .put("message_id", messageId)
            .put("smpp_message_id", "SYNTH_" + messageId)
            .put("dlr_status", dlrStatus)
            .put("error_code", String.format("%03d", errorCode))
            .put("destination", destination)
            .toString();

        try {
            URL url = new URL(httpUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                dlrDelivered.incrementAndGet();
                notifyLog("DLR reported: " + messageId + " → " + dlrStatus + " (HTTP " + code + ")");
            } else {
                log.warn("[SMPP] DLR report failed: HTTP {}", code);
            }
            conn.disconnect();
        } catch (Exception e) {
            log.warn("[SMPP] DLR report error: {}", e.getMessage());
        }
    }

    // ── Incoming SMS Forwarding ────────────────────────────────────────

    /**
     * Forward an incoming SMS (from phone) to the server as submit_sm.
     * Runs on a background executor so the BroadcastReceiver (main thread)
     * isn't blocked by SMPP network I/O.
     */
    public void forwardIncomingSms(String sender, String message) {
        smExecutor.execute(() -> {
            if (session == null || !isBound()) {
                log.warn("[SMPP] Cannot forward incoming SMS — session not bound");
                return;
            }
            try {
                String msgId = session.submitShortMessage(
                        "SMS", TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, currentUsername,
                        TypeOfNumber.UNKNOWN, NumberingPlanIndicator.UNKNOWN, sender,
                        new ESMClass(),
                        (byte) 0, (byte) 0, null, null,
                        new RegisteredDelivery(),
                        (byte) 0,
                        message.getBytes()
                );
                smsReceived.incrementAndGet();
                notifyLog("SMS forwarded: " + sender + " → server (msgId=" + msgId + ")");
            } catch (Exception e) {
                log.warn("[SMPP] Failed to forward incoming SMS: {}", e.getMessage());
            }
        });
    }

    /** Called by SmsSender when an SMS send result is known. */
    public void onSmsSentResult(String messageId, String destination, boolean success) {
        if (success) {
            smsSent.incrementAndGet();
            notifyLog("SMS sent OK → " + destination + " (msgId=" + messageId + ")");
        } else {
            smsFailed.incrementAndGet();
            notifyLog("SMS FAILED → " + destination);
        }
    }

    public GatewayStats getStats() {
        return new GatewayStats(
            smsSent.get(), smsReceived.get(), smsFailed.get(),
            dlrDelivered.get(), lastBindTime.get(), connectionUptime.get(),
            isBound() ? "bound" : (running.get() ? "binding" : "unbound"),
            currentHost, currentSmppPort, currentUsername
        );
    }

    private void updateUptime() {
        if (lastBindTime.get() > 0) {
            connectionUptime.set(System.currentTimeMillis() - lastBindTime.get());
        }
    }

    private void closeSession() {
        if (session != null) {
            try { session.unbindAndClose(); } catch (Exception ignored) {}
            session = null;
        }
    }

    // ── Notifications (read volatile field, safe across threads) ──────

    private void notifyStatus(String status, String detail) {
        StatusListener l = this.statusListener;
        if (l != null) l.onStatusChanged(status, detail);
    }

    private void notifyLog(String message) {
        log.info("[SMPP] {}", message);
        StatusListener l = this.statusListener;
        if (l != null) l.onLogMessage(message);
    }

    // ── Message Receiver Listener ──────────────────────────────────────

    private class SmppMessageReceiver implements MessageReceiverListener {

        @Override
        public void onAcceptDeliverSm(DeliverSm deliverSm) throws ProcessRequestException {
            try {
                if (deliverSm.isSmscDeliveryReceipt()) {
                    // Rare: server sent us a DLR receipt
                    DeliveryReceipt receipt = deliverSm.getShortMessageAsDeliveryReceipt();
                    log.info("[SMPP] DLR from server: id={} stat={}", receipt.getId(), receipt.getStat());
                    dlrDelivered.incrementAndGet();
                    return;
                }

                // Normal: server wants us to send an SMS
                String destination = deliverSm.getDestAddress();
                String sender = deliverSm.getSourceAddr();
                String text = new String(deliverSm.getShortMessage());
                String msgId = deliverSm.getSmppMessageId();

                log.info("[SMPP] deliver_sm: {} → {} text='{}'", sender, destination, text);
                notifyLog("SMS request: " + sender + " → " + destination);

                // SmsSender.send() handles main-thread dispatch internally
                SmsSender.send(GatewayApp.getInstance(), msgId, destination, sender, text);

            } catch (Exception e) {
                log.warn("[SMPP] deliver_sm processing error: {}", e.getMessage());
            }
        }

        @Override
        public void onAcceptSubmitSm(SubmitSm submitSm) throws ProcessRequestException {
            log.warn("[SMPP] Unexpected submit_sm from server");
        }

        @Override
        public QuerySmResult onAcceptQuerySm(QuerySm querySm, Session source) throws ProcessRequestException {
            return null;
        }

        @Override
        public SubmitMultiResult onAcceptSubmitMulti(SubmitMulti submitMulti) throws ProcessRequestException {
            return null;
        }

        @Override
        public DataSmResult onAcceptDataSm(DataSm dataSm, Session source) throws ProcessRequestException {
            return null;
        }

        @Override
        public void onAcceptAlertNotification(AlertNotification alertNotification) { }

        @Override
        public void onAcceptReplaceSm(ReplaceSm replaceSm) throws ProcessRequestException { }

        @Override
        public void onAcceptCancelSm(CancelSm cancelSm) throws ProcessRequestException { }
    }

    // ── Session State Listener ─────────────────────────────────────────

    private class SmppStateListener implements SessionStateListener {
        @Override
        public void onStateChange(SessionState newState, SessionState oldState, Session source) {
            log.info("[SMPP] State: {} → {}", oldState, newState);
            if (newState == SessionState.CLOSED || newState == SessionState.UNBOUND) {
                notifyStatus("unbound", "Session closed");
            } else if (newState == SessionState.BOUND_TRX || newState == SessionState.BOUND_TX || newState == SessionState.BOUND_RX) {
                lastBindTime.set(System.currentTimeMillis());
                notifyStatus("bound", "Bound to " + currentHost);
            }
        }
    }

    // ── Statistics ─────────────────────────────────────────────────────

    public static class GatewayStats {
        public final long smsSent, smsReceived, smsFailed, dlrDelivered;
        public final long lastBindTime, connectionUptime;
        public final String status, host, username;
        public final int port;

        GatewayStats(long sent, long rcvd, long failed, long dlr,
                     long bindTime, long uptime, String status,
                     String host, int port, String username) {
            this.smsSent = sent; this.smsReceived = rcvd; this.smsFailed = failed;
            this.dlrDelivered = dlr; this.lastBindTime = bindTime;
            this.connectionUptime = uptime; this.status = status;
            this.host = host; this.port = port; this.username = username;
        }
    }
}
