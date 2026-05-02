package com.mint.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class StartVpnArgs {
    var config: String = ""
    var profileName: String? = null
}

/**
 * Bridges Mint VPN's React UI to the Android system VPN tunnel.
 *
 * Commands:
 *  - `prepare_vpn` — request `BIND_VPN_SERVICE` consent if not already granted.
 *  - `start_vpn`   — boot [MintVpnService] with the provided sing-box JSON config.
 *  - `stop_vpn`    — tear down the tunnel and stop the foreground service.
 *  - `vpn_status`  — report whether the engine is currently running.
 */
@TauriPlugin
class MintVpnPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: android.webkit.WebView) {
        // Forward MintVpnService callbacks (state changes, log lines, errors)
        // to the JS layer through the Tauri event bus.
        MintVpnService.eventCallback = { event, data -> trigger(event, data) }
    }

    @Command
    fun prepare_vpn(invoke: Invoke) {
        activity.runOnUiThread {
            val intent = VpnService.prepare(activity)
            if (intent != null) {
                startActivityForResult(invoke, intent, "onPrepareResult")
                return@runOnUiThread
            }
            val ret = JSObject()
            ret.put("granted", true)
            invoke.resolve(ret)
        }
    }

    @ActivityCallback
    fun onPrepareResult(invoke: Invoke, result: ActivityResult) {
        val ret = JSObject()
        ret.put("granted", result.resultCode == Activity.RESULT_OK)
        invoke.resolve(ret)
    }

    @Command
    fun start_vpn(invoke: Invoke) {
        val args = invoke.parseArgs(StartVpnArgs::class.java)
        activity.runOnUiThread {
            val prepareIntent = VpnService.prepare(activity)
            if (prepareIntent != null) {
                val ret = JSObject()
                ret.put("running", false)
                ret.put("errorMsg", "need_prepare")
                invoke.resolve(ret)
                return@runOnUiThread
            }
            val intent = Intent(activity, MintVpnService::class.java).apply {
                action = MintVpnService.ACTION_START
                putExtra(MintVpnService.EXTRA_CONFIG, args.config)
                putExtra(MintVpnService.EXTRA_PROFILE_NAME, args.profileName ?: "Mint VPN")
            }
            activity.startForegroundService(intent)
            val ret = JSObject()
            ret.put("running", true)
            invoke.resolve(ret)
        }
    }

    @Command
    fun stop_vpn(invoke: Invoke) {
        activity.runOnUiThread {
            val intent = Intent(activity, MintVpnService::class.java).apply {
                action = MintVpnService.ACTION_STOP
            }
            activity.startService(intent)
            val ret = JSObject()
            ret.put("running", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun vpn_status(invoke: Invoke) {
        val ret = JSObject()
        ret.put("running", MintVpnService.isRunning())
        MintVpnService.lastError?.let { ret.put("errorMsg", it) }
        invoke.resolve(ret)
    }
}
