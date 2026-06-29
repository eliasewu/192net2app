package com.net2app.smsgw;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Settings activity for configuring:
 *   - Server host / SMPP port (defaults hardcoded, user can override)
 *   - HTTP API port (for DLR reporting, default 3000)
 *   - SMPP username (system_id) and password
 *   - Auto-start on boot toggle
 *
 * Saving triggers a reconnect to apply new settings.
 */
public class SettingsActivity extends AppCompatActivity {

    private EditText hostInput, smppPortInput, httpPortInput, usernameInput, passwordInput;
    private CheckBox autoStartCheckbox;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUI());
        prefs = getSharedPreferences("gateway_prefs", MODE_PRIVATE);
        loadPrefs();
    }

    private View buildUI() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(24), dp(16), dp(24));

        // Title
        TextView title = new TextView(this);
        title.setText("Connection Settings");
        title.setTextSize(20);
        title.setTextColor(0xFF202124);
        title.setPadding(0, 0, 0, dp(20));
        root.addView(title);

        // ── Server section ──
        addLabel(root, "Server Host (NET2APP Platform IP)");
        hostInput = new EditText(this);
        hostInput.setHint("e.g. 192.168.1.100 or sms.example.com");
        hostInput.setSingleLine(true);
        root.addView(hostInput);
        addSpace(root, dp(12));

        addLabel(root, "SMPP Port (default 2775)");
        smppPortInput = new EditText(this);
        smppPortInput.setHint("2775");
        smppPortInput.setSingleLine(true);
        smppPortInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        root.addView(smppPortInput);
        addSpace(root, dp(12));

        addLabel(root, "HTTP API Port (for DLR reporting, default 3000)");
        httpPortInput = new EditText(this);
        httpPortInput.setHint("3000");
        httpPortInput.setSingleLine(true);
        httpPortInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        root.addView(httpPortInput);
        addSpace(root, dp(20));

        // ── Divider ──
        View divider = new View(this);
        divider.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(1)
        ));
        divider.setBackgroundColor(0xFFDADCE0);
        root.addView(divider);
        addSpace(root, dp(20));

        // ── SMPP credentials ──
        addLabel(root, "SMPP Username (System ID)");
        usernameInput = new EditText(this);
        usernameInput.setHint("Your supplier SMPP username");
        usernameInput.setSingleLine(true);
        root.addView(usernameInput);
        addSpace(root, dp(12));

        addLabel(root, "SMPP Password");
        passwordInput = new EditText(this);
        passwordInput.setHint("Your supplier SMPP password");
        passwordInput.setSingleLine(true);
        passwordInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(passwordInput);
        addSpace(root, dp(20));

        // ── Divider ──
        View divider2 = new View(this);
        divider2.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(1)
        ));
        divider2.setBackgroundColor(0xFFDADCE0);
        root.addView(divider2);
        addSpace(root, dp(16));

        // ── Auto-start toggle ──
        autoStartCheckbox = new CheckBox(this);
        autoStartCheckbox.setText("Auto-start gateway on device boot");
        root.addView(autoStartCheckbox);
        addSpace(root, dp(20));

        // ── Save button ──
        Button saveBtn = new Button(this);
        saveBtn.setText("Save & Reconnect");
        saveBtn.setOnClickListener(v -> saveAndReconnect());
        root.addView(saveBtn);

        addSpace(root, dp(12));

        // ── Help text ──
        TextView help = new TextView(this);
        help.setText("Server host and ports are pre-filled with NET2APP platform defaults. " +
                     "SMPP port (2775) is for the connection itself; HTTP API port (3000) " +
                     "is used to report delivery receipts (DLRs). Enter the SMPP username " +
                     "and password assigned to your supplier account, then save. " +
                     "The gateway will bind as a transceiver and begin routing SMS " +
                     "through your device's SIM card.");
        help.setTextSize(12);
        help.setTextColor(0xFF80868B);
        root.addView(help);

        return root;
    }

    private void addLabel(LinearLayout parent, String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(13);
        label.setTextColor(0xFF5F6368);
        label.setPadding(0, 0, 0, dp(6));
        parent.addView(label);
    }

    private void addSpace(LinearLayout parent, int heightDp) {
        View space = new View(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, heightDp
        ));
        parent.addView(space);
    }

    private void loadPrefs() {
        hostInput.setText(prefs.getString("server_host", "192.168.1.100"));
        smppPortInput.setText(String.valueOf(prefs.getInt("server_port", 2775)));
        httpPortInput.setText(String.valueOf(prefs.getInt("http_port", 3000)));
        usernameInput.setText(prefs.getString("smpp_username", ""));
        passwordInput.setText(prefs.getString("smpp_password", ""));
        autoStartCheckbox.setChecked(prefs.getBoolean("auto_start", false));
    }

    private void saveAndReconnect() {
        String host = hostInput.getText().toString().trim();
        String smppPortStr = smppPortInput.getText().toString().trim();
        String httpPortStr = httpPortInput.getText().toString().trim();
        String username = usernameInput.getText().toString().trim();
        String password = passwordInput.getText().toString();

        if (host.isEmpty() || smppPortStr.isEmpty() || username.isEmpty()) {
            Toast.makeText(this, "Host, SMPP port, and username are required", Toast.LENGTH_SHORT).show();
            return;
        }

        int smppPort, httpPort;
        try {
            smppPort = Integer.parseInt(smppPortStr);
            httpPort = httpPortStr.isEmpty() ? 3000 : Integer.parseInt(httpPortStr);
        } catch (NumberFormatException e) {
            Toast.makeText(this, "Invalid port number", Toast.LENGTH_SHORT).show();
            return;
        }

        // Save to preferences
        prefs.edit()
            .putString("server_host", host)
            .putInt("server_port", smppPort)
            .putInt("http_port", httpPort)
            .putString("smpp_username", username)
            .putString("smpp_password", password)
            .putBoolean("auto_start", autoStartCheckbox.isChecked())
            .apply();

        Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show();

        // Restart gateway service with new settings
        restartGatewayService();
        finish();
    }

    /** Restart the gateway service — wait for stop to complete before starting. */
    private void restartGatewayService() {
        // Stop the service (new session manager on restart picks up saved prefs)
        android.content.Intent stopIntent = new android.content.Intent(this, SmppService.class);
        stopIntent.setAction(SmppService.ACTION_STOP);
        startService(stopIntent);

        // Poll for stop completion without blocking main thread.
        // Uses repeating postDelayed instead of Thread.sleep to keep UI responsive.
        scheduleStartAfterStop(0);
    }

    private void scheduleStartAfterStop(int attempts) {
        if (SmppService.isRunning() && attempts < 10) {
            new Handler(Looper.getMainLooper()).postDelayed(
                () -> scheduleStartAfterStop(attempts + 1), 200);
        } else {
            android.content.Intent startIntent = new android.content.Intent(SettingsActivity.this, SmppService.class);
            startIntent.setAction(SmppService.ACTION_START);
            startForegroundService(startIntent);
        }
    }

    private int dp(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }
}
