// ============================================================
// supplierBindHelper.cjs — Extracted from server.cjs
// Factory that creates performSupplierBind, accepting pool and
// bridge as dependencies so the function is testable.
// ============================================================

/**
 * Map a numeric SMPP interface_version byte (sent by Java in the
 * bind_resp / esme_bind_event callback) into the wire-format string
 * the rest of the system uses ('3.3' / '3.4' / '5.0').
 * Falls back to NULL for unknown values.
 */
function smppByteToVersion(b) {
  switch (b) {
    case 0x33: return '3.3';
    case 0x34: return '3.4';
    case 0x50: return '5.0';
    default:   return null;
  }
}

/**
 * Map supplier.smpp_version ('auto' | '3.3' | '3.4' | '5.0') to the
 * SMPP interface_version byte carried in the bind PDU.
 * Returns null for 'auto' so Java picks its own default.
 */
function smppVersionToByte(v) {
  switch (v) {
    case '3.3': return 0x33;
    case '3.4': return 0x34;
    case '5.0': return 0x50;
    case 'auto':
    case null:
    case undefined:
    case '':
    default:
      return null;
  }
}

/**
 * Create the performSupplierBind function with the given pool and bridge.
 *
 * @param {object} pool   — Postgres pool with a .query(sql, params) method
 * @param {object} bridge — Gateway bridge with .bindSupplierLongTimeout(opts)
 *
 * @returns {(supplier: object, options?: object) => Promise<{
 *   ok: boolean,
 *   negotiatedVersion?: string|null,
 *   negotiatedHex?: string,
 *   interfaceByte?: number|null,
 *   gatewayDown?: boolean
 * }>}
 */
function createPerformSupplierBind(pool, bridge) {
  /**
   * Shared supplier bind helper — used by connect, reconnect, and auto-bind.
   * Handles: SMPP version resolution, state transition binding → bound/error,
   * smpp_sessions UPSERT, Java gateway call, and negotiated-version recording.
   *
   * @param {object} supplier — row from suppliers table
   * @param {object} [options]
   * @param {boolean} [options.resetFailures]     — zero consecutive_failures before binding
   * @param {boolean} [options.incrementBoundCount] — bump bound_count on success
   */
  async function performSupplierBind(supplier, options = {}) {
    const interfaceByte = smppVersionToByte(supplier.smpp_version);

    // Transition to binding state
    if (options.resetFailures) {
      await pool.query("UPDATE suppliers SET bind_status='binding', consecutive_failures=0 WHERE id=$1", [supplier.id]);
    } else {
      await pool.query("UPDATE suppliers SET bind_status='binding' WHERE id=$1", [supplier.id]);
    }

    // UPSERT session row — works for first-time binds (connect) and re-binds (reconnect/auto-bind)
    await pool.query(
      `INSERT INTO smpp_sessions (entity_type, entity_id, system_id, ip_address, port, bind_mode, status, connected_at, last_activity)
       VALUES ('supplier', $1, $2, $3, $4, 'transceiver', 'binding', NOW(), NOW())
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET status='binding', connected_at=NOW(), last_activity=NOW()`,
      [supplier.id, supplier.smpp_username, supplier.smpp_host, supplier.smpp_port]);

    // Call Java 21 SMPP gateway
    const result = await bridge.bindSupplierLongTimeout({
      supplier_id: supplier.id,
      smpp_host: supplier.smpp_host,
      smpp_port: supplier.smpp_port,
      smpp_username: supplier.smpp_username,
      smpp_password: supplier.smpp_password,
      system_type: supplier.smpp_system_type || '',
      bind_type: supplier.smpp_bind_type || 'trx',
      addr_ton: supplier.smpp_addr_ton ?? 0,
      addr_npi: supplier.smpp_addr_npi ?? 0,
      addr_range: supplier.smpp_addr_range || 'system_id',
      interface_version: interfaceByte,
    });

    if (result && result.ok) {
      const negotiatedHex = result.negotiated_interface_version;
      const verStr = negotiatedHex ? smppByteToVersion(parseInt(negotiatedHex, 16)) : null;

      await pool.query("UPDATE suppliers SET bind_status='bound', consecutive_failures=0 WHERE id=$1", [supplier.id]);
      const sessSql = options.incrementBoundCount
        ? `UPDATE smpp_sessions SET status='bound', last_activity=NOW(), negotiated_version=$2, bound_count = bound_count + 1 WHERE entity_type='supplier' AND entity_id=$1`
        : `UPDATE smpp_sessions SET status='bound', last_activity=NOW(), negotiated_version=$2 WHERE entity_type='supplier' AND entity_id=$1`;
      await pool.query(sessSql, [supplier.id, verStr]);

      return { ok: true, negotiatedVersion: verStr, negotiatedHex, interfaceByte };
    }

    // Bind failed
    await pool.query("UPDATE suppliers SET bind_status='error', consecutive_failures=consecutive_failures+1 WHERE id=$1", [supplier.id]);
    await pool.query("UPDATE smpp_sessions SET status='error', disconnected_at=NOW() WHERE entity_type='supplier' AND entity_id=$1", [supplier.id]);
    return { ok: false, gatewayDown: result === null };
  }

  return performSupplierBind;
}

/**
 * Create the performSupplierUnbind function with the given pool and bridge.
 *
 * @param {object} pool   — Postgres pool with a .query(sql, params) method
 * @param {object} bridge — Gateway bridge with .unbindSupplier(supplierId)
 *
 * @returns {(supplierId: number) => Promise<void>}
 */
function createPerformSupplierUnbind(pool, bridge) {
  /**
   * Shared supplier unbind helper — tears down both the Java gateway
   * session and the DB state (suppliers + smpp_sessions).
   * Fire-and-forget on the bridge side; awaits DB writes.
   *
   * @param {number} supplierId
   */
  async function performSupplierUnbind(supplierId) {
    // Tell Java to unbind the supplier session (fire-and-forget)
    bridge.unbindSupplier(supplierId).catch(() => {});

    // Transition supplier and session to unbound
    await pool.query("UPDATE suppliers SET bind_status='unbound' WHERE id=$1", [supplierId]);
    await pool.query("UPDATE smpp_sessions SET status='unbound', disconnected_at=NOW() WHERE entity_type='supplier' AND entity_id=$1", [supplierId]);
  }

  return performSupplierUnbind;
}

module.exports = { createPerformSupplierBind, createPerformSupplierUnbind, smppVersionToByte, smppByteToVersion };
