package com.mint.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

internal object ServiceNotification {

    private const val CHANNEL_ID = "mint_vpn_status"
    private const val CHANNEL_NAME = "Mint VPN"

    const val NOTIFICATION_ID = 4242

    fun ensureChannel(service: Service) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = service.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Status of the active VPN tunnel"
            setShowBadge(false)
        }
        mgr.createNotificationChannel(channel)
    }

    fun build(service: Service, profileName: String, statusText: String): Notification {
        ensureChannel(service)

        val launchIntent = service.packageManager
            .getLaunchIntentForPackage(service.packageName)
            ?.apply { addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP) }
        val contentIntent: PendingIntent? = launchIntent?.let {
            PendingIntent.getActivity(
                service,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        val stopIntent = Intent(service, MintVpnService::class.java).apply {
            action = MintVpnService.ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            service,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(service, CHANNEL_ID)
            .setContentTitle(profileName)
            .setContentText(statusText)
            .setSmallIcon(R.drawable.ic_mint_vpn)
            .setOngoing(true)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .also { b -> contentIntent?.let { b.setContentIntent(it) } }
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Отключить",
                stopPending,
            )
            .build()
    }

    fun update(service: Service, profileName: String, statusText: String) {
        val mgr = ContextCompat.getSystemService(service, NotificationManager::class.java)
            ?: return
        mgr.notify(NOTIFICATION_ID, build(service, profileName, statusText))
    }
}
