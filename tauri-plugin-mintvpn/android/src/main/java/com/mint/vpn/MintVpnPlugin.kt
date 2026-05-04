package com.mint.vpn

import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.net.VpnService
import android.os.Build
import android.util.Base64
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.io.ByteArrayOutputStream

@InvokeArg
class StartVpnArgs {
    var config: String = ""
    var profileName: String? = null
    var allowedApps: Array<String>? = null
    var disallowedApps: Array<String>? = null
}

/**
 * Bridges Mint VPN's React UI to the Android system VPN tunnel.
 *
 * Commands (named in camelCase to match Tauri's command-routing pipeline:
 * `tauri::webview::mod.rs:1870` runs `heck::AsLowerCamelCase(message.command)`
 * on every plugin command before dispatching it to the Android plugin
 * registry, so a Kotlin function called `prepare_vpn` would be looked up
 * as `prepareVpn` and 404 with `No command prepareVpn found for plugin
 * com.mint.vpn.MintVpnPlugin` — which is exactly the bug 0.3.4 shipped
 * with):
 *
 *  - `prepareVpn`        — request `BIND_VPN_SERVICE` consent if not already granted.
 *  - `startVpn`          — boot [MintVpnService] with the provided sing-box JSON config.
 *  - `stopVpn`           — tear down the tunnel and stop the foreground service.
 *  - `vpnStatus`         — report whether the engine is currently running.
 *  - `listInstalledApps` — enumerate user-installed apps for the per-app routing UI.
 *
 * The JS-side `invoke("plugin:mintvpn|prepare_vpn")` continues to use
 * snake_case because that's what the rest of the codebase uses; Tauri
 * does the snake→camel conversion for us before it gets here.
 */
@TauriPlugin
class MintVpnPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: android.webkit.WebView) {
        // Forward MintVpnService callbacks (state changes, log lines, errors)
        // to the JS layer through the Tauri event bus.
        MintVpnService.eventCallback = { event, data -> trigger(event, data) }
    }

    @Command
    fun prepareVpn(invoke: Invoke) {
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
    fun startVpn(invoke: Invoke) {
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
                args.allowedApps?.let { putExtra(MintVpnService.EXTRA_ALLOWED_APPS, it) }
                args.disallowedApps?.let { putExtra(MintVpnService.EXTRA_DISALLOWED_APPS, it) }
            }
            androidx.core.content.ContextCompat.startForegroundService(activity, intent)
            val ret = JSObject()
            ret.put("running", true)
            invoke.resolve(ret)
        }
    }

    @Command
    fun stopVpn(invoke: Invoke) {
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
    fun vpnStatus(invoke: Invoke) {
        val ret = JSObject()
        ret.put("running", MintVpnService.isRunning())
        MintVpnService.lastError?.let { ret.put("errorMsg", it) }
        invoke.resolve(ret)
    }

    @Command
    fun listInstalledApps(invoke: Invoke) {
        Thread {
            try {
                val pm = activity.packageManager
                val apps = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    pm.getInstalledApplications(
                        PackageManager.ApplicationInfoFlags.of(0)
                    )
                } else {
                    @Suppress("DEPRECATION")
                    pm.getInstalledApplications(0)
                }
                val ownPkg = activity.packageName
                val arr = JSONArray()
                for (info in apps) {
                    if (info.packageName == ownPkg) continue
                    if (info.flags and ApplicationInfo.FLAG_SYSTEM != 0 &&
                        pm.getLaunchIntentForPackage(info.packageName) == null) continue
                    val obj = JSObject()
                    obj.put("packageName", info.packageName)
                    obj.put("label", pm.getApplicationLabel(info).toString())
                    try {
                        val icon = pm.getApplicationIcon(info)
                        val bmp = if (icon is BitmapDrawable) {
                            icon.bitmap
                        } else {
                            val b = Bitmap.createBitmap(
                                icon.intrinsicWidth.coerceAtLeast(1),
                                icon.intrinsicHeight.coerceAtLeast(1),
                                Bitmap.Config.ARGB_8888
                            )
                            val c = Canvas(b)
                            icon.setBounds(0, 0, c.width, c.height)
                            icon.draw(c)
                            b
                        }
                        val scaled = Bitmap.createScaledBitmap(bmp, 48, 48, true)
                        val baos = ByteArrayOutputStream()
                        scaled.compress(Bitmap.CompressFormat.PNG, 80, baos)
                        obj.put("icon", "data:image/png;base64," +
                            Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP))
                    } catch (_: Throwable) {
                        obj.put("icon", "")
                    }
                    arr.put(obj)
                }
                val ret = JSObject()
                ret.put("apps", arr)
                invoke.resolve(ret)
            } catch (t: Throwable) {
                invoke.reject(t.message ?: "Failed to list apps")
            }
        }.start()
    }
}
