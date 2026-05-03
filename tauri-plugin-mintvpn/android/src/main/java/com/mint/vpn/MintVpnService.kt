package com.mint.vpn

import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import app.tauri.plugin.JSObject
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.SetupOptions
import io.nekohasekai.libbox.SystemProxyStatus
import io.nekohasekai.libbox.TunOptions
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground VPN service that owns the system TUN and runs sing-box (libbox)
 * inside the same process. The Tauri plugin ([MintVpnPlugin]) drives this
 * service via start/stop intents; the running state is exposed back to JS
 * through [eventCallback] and the static [isRunning] / [lastError] accessors.
 *
 * Lifecycle:
 *   1. JS calls `prepare_vpn` → `VpnService.prepare()` system dialog.
 *   2. JS calls `start_vpn(config)` → service is launched as foreground,
 *      libbox is set up (once), a [CommandServer] is created and bound to
 *      this service as both the [io.nekohasekai.libbox.PlatformInterface]
 *      and [io.nekohasekai.libbox.CommandServerHandler]. The server then
 *      calls back into [openTun] which performs the actual
 *      `VpnService.Builder.establish()` and returns the kernel TUN fd.
 *   3. JS calls `stop_vpn` → service tears down sing-box, closes the
 *      command server, drops the TUN fd, and stops the foreground.
 */
class MintVpnService :
    VpnService(),
    MintPlatformDefaults,
    io.nekohasekai.libbox.CommandServerHandler {

    companion object {
        private const val TAG = "MintVpnService"

        const val ACTION_START = "com.mint.vpn.action.START"
        const val ACTION_STOP = "com.mint.vpn.action.STOP"
        const val EXTRA_CONFIG = "config"
        const val EXTRA_PROFILE_NAME = "profileName"
        const val EXTRA_ALLOWED_APPS = "allowedApps"
        const val EXTRA_DISALLOWED_APPS = "disallowedApps"

        @Volatile private var instance: MintVpnService? = null
        @Volatile var lastError: String? = null
            private set

        @JvmField
        var eventCallback: ((event: String, data: JSObject) -> Unit) = { _, _ -> }

        fun isRunning(): Boolean = instance?.running?.get() == true
    }

    private val running = AtomicBoolean(false)
    private var commandServer: CommandServer? = null
    private var libboxInitialized = false
    private var profileName: String = "Mint VPN"
    private var pendingConfig: String? = null
    private var tunFd: ParcelFileDescriptor? = null
    private var allowedApps: Array<String>? = null
    private var disallowedApps: Array<String>? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                profileName = intent.getStringExtra(EXTRA_PROFILE_NAME) ?: "Mint VPN"
                pendingConfig = intent.getStringExtra(EXTRA_CONFIG)
                allowedApps = intent.getStringArrayExtra(EXTRA_ALLOWED_APPS)
                disallowedApps = intent.getStringArrayExtra(EXTRA_DISALLOWED_APPS)
                startTunnel()
            }
            ACTION_STOP -> {
                stopTunnel()
                return START_NOT_STICKY
            }
            else -> {
                stopTunnel()
                return START_NOT_STICKY
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = super.onBind(intent)

    override fun onDestroy() {
        stopTunnel()
        instance = null
        super.onDestroy()
    }

    override fun onRevoke() {
        Log.i(TAG, "VPN permission revoked")
        stopTunnel()
        super.onRevoke()
    }

    // -- lifecycle ---------------------------------------------------------

    private fun startForegroundCompat() {
        val notif = ServiceNotification.build(this, profileName, "Подключение…")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+ requires explicit foregroundServiceType in startForeground().
            // We declared `systemExempted` in the manifest because sing-box does its
            // own packet I/O on the TUN fd and Android doesn't have a "vpn" category.
            startForeground(
                ServiceNotification.NOTIFICATION_ID,
                notif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED,
            )
        } else {
            startForeground(ServiceNotification.NOTIFICATION_ID, notif)
        }
    }

    private fun startTunnel() {
        if (running.get()) {
            // already running — drop the new config silently
            return
        }
        val config = pendingConfig
        if (config.isNullOrBlank()) {
            postError("empty config")
            stopSelfSafe()
            return
        }
        startForegroundCompat()
        try {
            ensureLibboxSetup()
            val server = CommandServer(this, this)
            server.start()
            server.startOrReloadService(config, OverrideOptions())
            commandServer = server
            running.set(true)
            lastError = null
            ServiceNotification.update(this, profileName, "Подключено")
            emit("vpn_started", JSObject().apply { put("running", true) })
        } catch (t: Throwable) {
            Log.e(TAG, "startTunnel failed", t)
            postError(t.message ?: t.javaClass.simpleName)
            try { commandServer?.close() } catch (_: Throwable) {}
            commandServer = null
            tunFd?.close(); tunFd = null
            running.set(false)
            stopSelfSafe()
        }
    }

    private fun stopTunnel() {
        running.set(false)
        try { commandServer?.closeService() } catch (t: Throwable) { Log.w(TAG, "closeService", t) }
        try { commandServer?.close() } catch (t: Throwable) { Log.w(TAG, "close", t) }
        commandServer = null
        tunFd?.let { runCatching { it.close() } }
        tunFd = null
        emit("vpn_stopped", JSObject().apply { put("running", false) })
        stopSelfSafe()
    }

    private fun stopSelfSafe() {
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Throwable) { /* legacy api */ }
        stopSelf()
    }

    private fun ensureLibboxSetup() {
        if (libboxInitialized) return
        val basePath = filesDir.absolutePath
        val workingPath = (getExternalFilesDir(null) ?: filesDir).also { it.mkdirs() }.absolutePath
        val tempPath = cacheDir.also { it.mkdirs() }.absolutePath
        val opts = SetupOptions().apply {
            this.basePath = basePath
            this.workingPath = workingPath
            this.tempPath = tempPath
            this.logMaxLines = 3000
        }
        Libbox.setup(opts)
        libboxInitialized = true
    }

    private fun postError(msg: String) {
        lastError = msg
        emit("vpn_error", JSObject().apply { put("message", msg) })
        ServiceNotification.update(this, profileName, "Ошибка: $msg")
    }

    private fun emit(event: String, data: JSObject) {
        try { eventCallback(event, data) } catch (_: Throwable) {}
    }

    // -- PlatformInterface (override what defaults can't handle) -----------

    override fun openTun(options: TunOptions): Int {
        if (prepare(this) != null) {
            error("missing VPN permission")
        }
        val builder = Builder()
            .setSession(profileName)
            .setMtu(options.mtu)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }

        val v4 = options.inet4Address
        while (v4.hasNext()) {
            val a = v4.next()
            builder.addAddress(a.address(), a.prefix())
        }
        val v6 = options.inet6Address
        while (v6.hasNext()) {
            val a = v6.next()
            builder.addAddress(a.address(), a.prefix())
        }

        if (options.autoRoute) {
            // sing-box always wants a DNS hijack address inside the TUN.
            try {
                val dns = options.dnsServerAddress
                if (dns != null) {
                    builder.addDnsServer(dns.value)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "no DNS server address from libbox", t)
            }

            // Routes: prefer libbox-provided ranges, else fall back to default gateway.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val r4 = options.inet4RouteAddress
                if (r4.hasNext()) {
                    while (r4.hasNext()) {
                        val rp = r4.next()
                        builder.addRoute(rp.address(), rp.prefix())
                    }
                } else {
                    builder.addRoute("0.0.0.0", 0)
                }
                val r6 = options.inet6RouteAddress
                if (r6.hasNext()) {
                    while (r6.hasNext()) {
                        val rp = r6.next()
                        builder.addRoute(rp.address(), rp.prefix())
                    }
                }

                // Exclude ranges (Android 13+): excludeRoute takes IpPrefix.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val rx4 = options.inet4RouteExcludeAddress
                    while (rx4.hasNext()) {
                        val rp = rx4.next()
                        runCatching {
                            builder.excludeRoute(
                                android.net.IpPrefix(
                                    java.net.InetAddress.getByName(rp.address()),
                                    rp.prefix(),
                                ),
                            )
                        }
                    }
                    val rx6 = options.inet6RouteExcludeAddress
                    while (rx6.hasNext()) {
                        val rp = rx6.next()
                        runCatching {
                            builder.excludeRoute(
                                android.net.IpPrefix(
                                    java.net.InetAddress.getByName(rp.address()),
                                    rp.prefix(),
                                ),
                            )
                        }
                    }
                }
            } else {
                val r4 = options.inet4RouteRange
                if (r4.hasNext()) {
                    while (r4.hasNext()) {
                        val rp = r4.next()
                        builder.addRoute(rp.address(), rp.prefix())
                    }
                } else {
                    builder.addRoute("0.0.0.0", 0)
                }
                val r6 = options.inet6RouteRange
                while (r6.hasNext()) {
                    val rp = r6.next()
                    builder.addRoute(rp.address(), rp.prefix())
                }
            }
        } else {
            // Manual route mode — use libbox-provided ranges as-is.
            val r4 = options.inet4RouteAddress
            while (r4.hasNext()) {
                val rp = r4.next()
                builder.addRoute(rp.address(), rp.prefix())
            }
            val r6 = options.inet6RouteAddress
            while (r6.hasNext()) {
                val rp = r6.next()
                builder.addRoute(rp.address(), rp.prefix())
            }
        }

        // Per-app routing
        allowedApps?.forEach { pkg ->
            try { builder.addAllowedApplication(pkg) } catch (e: PackageManager.NameNotFoundException) {
                Log.w(TAG, "addAllowedApplication: $pkg not found")
            }
        }
        disallowedApps?.forEach { pkg ->
            try { builder.addDisallowedApplication(pkg) } catch (e: PackageManager.NameNotFoundException) {
                Log.w(TAG, "addDisallowedApplication: $pkg not found")
            }
        }

        val pfd = builder.establish() ?: error("VpnService.Builder.establish returned null")
        tunFd = pfd
        return pfd.fd
    }

    override fun autoDetectInterfaceControl(fd: Int) {
        // Bypass our own VPN tunnel — sing-box opens TCP/UDP sockets to the
        // upstream VLESS server, those must NOT be routed back through us.
        protect(fd)
    }

    // -- CommandServerHandler ---------------------------------------------

    override fun serviceStop() {
        stopTunnel()
    }

    override fun serviceReload() {
        // No-op for now: profile reloads are driven from JS by stop+start.
    }

    override fun getSystemProxyStatus(): SystemProxyStatus {
        val s = SystemProxyStatus()
        s.available = false
        s.enabled = false
        return s
    }

    override fun setSystemProxyEnabled(enabled: Boolean) {
        // System proxy is desktop-only. Android delegates via per-app routing.
    }

    override fun writeDebugMessage(message: String) {
        Log.d(TAG, message)
    }
}
